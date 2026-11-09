/**
 * M22.2 / M22.3 — v2 generator, deterministic tests on in-memory fixtures. No browser, no dataset
 * files: nothing here reads `artifacts/datasets`. Schedules below are EXAMPLE test inputs, not
 * proposed training schedules. TEST is never planned, seeded or built here: the only calls that name
 * the test split are the three refusal checks, which throw before anything is computed. Every seed
 * computed here is a TRAIN or DEV seed.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  CLASS_GEOMETRY,
  CLASSES,
  CONTROL_STYLES,
  DECOR_KINDS,
  DENSITY_LEVELS,
  FONT_STACKS,
  HIT_SAFE_RADIUS,
  ICON_GLYPHS,
  ICON_PLATES,
  MAX_SAMPLES_PER_SPLIT,
  OCCLUDER_STYLES,
  PALETTES,
  SIZE_BUCKETS,
  V2,
  VIEWPORTS,
} from "../config.mjs";
import { PRNG, SEED_SCHEME, canonicalJson, rngOf, seedOf, sha256, xoshiro128ss } from "../prng.mjs";
import { WORDS, pageAppearanceOf } from "../appearance.mjs";
import { AUDITABLE_SPLITS, assertNoLeakage, framesDir, layoutSimilarity, manifestName, openAuditManifest, planSplitIds, sampleId, seedFor } from "../splits.mjs";
import { BUCKET_IDS, allocateTargets, dealTargets, scheduledTargets, validateSchedule } from "../schedule.mjs";
import { GRID, cssShorterRange, layoutSample, regionOf, scaleOf } from "../layout.mjs";
import { planHash, planSplit } from "../plan.mjs";
import { gridPoints } from "../../../../tests/browser/support/fixture-validity.mjs";
import { specToHtmlV2 } from "../html.mjs";
import { annotateSample, buildSplitManifest } from "../annotate.mjs";
import { REQUIRED_CHECKS_V2, runDatasetGate } from "../../../../tests/browser/support/dataset-quality-gate.mjs";

/** EXAMPLE schedule: `pos` positives and `{partial, full}` occlusion cases in every class × bucket. */
function schedule(splits, pos, occ = { partial: 0, full: 0 }, max = 8, overflow = 50) {
  const cells = (v) => Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(BUCKET_IDS.map((b) => [b, typeof v === "function" ? v(c, b) : v]))]));
  return {
    maxTargetsPerSample: max,
    maxOverflowSamples: overflow,
    positives: Object.fromEntries(splits.map((s) => [s, cells(pos)])),
    occlusionCases: Object.fromEntries(splits.map((s) => [s, cells(() => ({ ...occ }))])),
  };
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bucketOfModel = (s) => SIZE_BUCKETS.find((b) => s >= b.lo && s < b.hi).id;
const countBy = (specs, role) => {
  const c = {};
  for (const s of specs) for (const e of s.elements) if (e.intent === role) c[`${e.cls}/${e.bucket}`] = (c[`${e.cls}/${e.bucket}`] ?? 0) + 1;
  return c;
};
const ALL_CELLS = CLASSES.flatMap((c) => BUCKET_IDS.map((b) => `${c}/${b}`));

/** What a correct render would report: rect = declared box, absolute, and validities by intent. */
function renderAsDeclared(spec, validityOf = (e) => ({ positive: "HIT_TESTABLE", "occlusion-full": "FULLY_OCCLUDED", "occlusion-partial": "PARTIALLY_OCCLUDED" })[e.intent]) {
  return {
    elements: spec.elements.map((e) => ({ key: e.key, rect: { ...e.box }, computedPosition: "absolute" })),
    validity: Object.fromEntries(spec.elements.map((e) => [e.key, validityOf(e)])),
  };
}

// ─────────────────────────────── layout geometry ───────────────────────────────

describe("1 — icon positioning and layout validity", () => {
  const { specs } = planSplit(schedule(["train"], 3, { partial: 1, full: 1 }), "train", 40);
  it("every labelled element, icons included, is absolutely positioned at its declared box", () => {
    for (const spec of specs.slice(0, 6)) {
      const html = specToHtmlV2(spec);
      expect(html).toMatch(/\[data-v2\]\{position:absolute;/);
      for (const e of spec.elements) {
        const tag = html.match(new RegExp(`<[a-z]+[^>]*data-v2="${e.key}"[^>]*>`))[0];
        if (e.appearance.native) {
          // M22.6: natural size, scaled to the box from its top-left corner — the rendered rect is the box.
          expect(tag).toContain(`style="left:${e.box.x}px;top:${e.box.y}px;width:13px;height:13px;transform:scale(${e.box.w / 13});transform-origin:0 0`);
        } else {
          expect(tag).toContain(`style="left:${e.box.x}px;top:${e.box.y}px;width:${e.box.w}px;height:${e.box.h}px`);
        }
      }
    }
  });
  it("every element lies inside the usable area: below the masthead, inside the margin", () => {
    for (const s of specs) {
      for (const e of s.elements) {
        expect(e.box.x >= s.area.x && e.box.y >= s.area.y && e.box.x + e.box.w <= s.area.x + s.area.w && e.box.y + e.box.h <= s.area.y + s.area.h).toBe(true);
        expect(overlap(e.box, s.masthead)).toBe(false);
      }
    }
  });
  it("no two labelled elements overlap, and occluders cover only their own target", () => {
    for (const s of specs) {
      for (let i = 0; i < s.elements.length; i += 1) for (let j = i + 1; j < s.elements.length; j += 1) expect(overlap(s.elements[i].box, s.elements[j].box)).toBe(false);
      for (const o of s.occluders) {
        expect(overlap(o.box, s.masthead)).toBe(false);
        for (const e of s.elements) expect(overlap(o.box, e.box)).toBe(e.key === o.for);
      }
    }
  });
  it("each target's shorter side lands in its scheduled bucket, at its sample's scale", () => {
    for (const s of specs) for (const e of s.elements) expect(bucketOfModel(Math.min(e.box.w, e.box.h) * s.scale)).toBe(e.bucket);
  });
  it("every bucket has an integer CSS size at every supported scale", () => {
    for (const v of VIEWPORTS) for (const b of BUCKET_IDS) {
      const s = scaleOf(v);
      const [lo, hi] = cssShorterRange(b, s);
      expect(bucketOfModel(lo * s)).toBe(b);
      expect(bucketOfModel(hi * s)).toBe(b);
    }
  });
});

// ─────────────────────────────── spatial distribution ───────────────────────────────

/**
 * ACCEPTANCE CRITERIA, fixed before measurement (M22.2 hardening):
 *
 * Regions are the 3 × 3 grid of the usable area; an element belongs to the region holding its centre.
 * A uniform spread would put 1/9 ≈ 11.1% in each. For EVERY viewport shape, pooled over the tested
 * seeds, and separately for SPARSE pages (≈ 1–2 targets) and DENSE pages (12 targets):
 *   - every region holds at least 5% of centres (less than half of uniform: no region systematically empty);
 *   - no region holds more than 25% (more than twice uniform: no region systematically favoured);
 *   - the top third holds at most 45%, and the bottom third, the left third and the right third each
 *     at least 20% (the review's failure was 100% top quarter on sparse pages).
 * These are statements about the tested seeds only; they are not a claim about every possible seed.
 */
const CRITERIA = { minRegion: 0.05, maxRegion: 0.25, maxTopThird: 0.45, minEdgeThird: 0.2, minElementsPerShape: 300 };

function distribution(specs) {
  const byShape = new Map();
  for (const s of specs) {
    const key = `${s.viewport.w}x${s.viewport.h}`;
    const d = byShape.get(key) ?? { n: 0, cells: Array(GRID * GRID).fill(0) };
    for (const e of s.elements) {
      const cx = e.box.x + e.box.w / 2;
      const cy = e.box.y + e.box.h / 2;
      const col = Math.min(GRID - 1, Math.floor(((cx - s.area.x) / s.area.w) * GRID));
      const row = Math.min(GRID - 1, Math.floor(((cy - s.area.y) / s.area.h) * GRID));
      d.cells[row * GRID + col] += 1;
      d.n += 1;
    }
    byShape.set(key, d);
  }
  return byShape;
}
function assertSpread(byShape) {
  expect(byShape.size).toBe(VIEWPORTS.length); // every viewport shape was exercised
  for (const [shape, d] of byShape) {
    expect(d.n, `${shape}: too few elements to judge`).toBeGreaterThanOrEqual(CRITERIA.minElementsPerShape);
    const share = d.cells.map((c) => c / d.n);
    for (const [r, v] of share.entries()) {
      expect(v, `${shape} region ${r}`).toBeGreaterThanOrEqual(CRITERIA.minRegion);
      expect(v, `${shape} region ${r}`).toBeLessThanOrEqual(CRITERIA.maxRegion);
    }
    const row = (k) => share.slice(k * GRID, k * GRID + GRID).reduce((a, b) => a + b, 0);
    const col = (k) => [0, 1, 2].reduce((a, r) => a + share[r * GRID + k], 0);
    expect(row(0), `${shape} top third`).toBeLessThanOrEqual(CRITERIA.maxTopThird);
    expect(row(2), `${shape} bottom third`).toBeGreaterThanOrEqual(CRITERIA.minEdgeThird);
    expect(col(0), `${shape} left third`).toBeGreaterThanOrEqual(CRITERIA.minEdgeThird);
    expect(col(2), `${shape} right third`).toBeGreaterThanOrEqual(CRITERIA.minEdgeThird);
  }
}

describe("2 — spatial distribution (acceptance criteria above)", () => {
  // Sparse: 32 cells × 70 positives = 2,240 targets over 1,600 samples (1–2 each).
  const sparse = planSplit(schedule(["train"], 70, { partial: 0, full: 0 }, 8, 0), "train", 1600).specs;
  // Dense: 32 cells × 112 = 3,584 targets over 300 samples (11–12 each). M22.3 raised this from 200
  // samples: with the new seeds one viewport shape drew too few dense pages to reach the 300-element floor.
  const dense = planSplit(schedule(["train"], 112, { partial: 0, full: 0 }, 12, 60), "train", 300).specs;

  it("sparse pages reach every region of every viewport shape", () => assertSpread(distribution(sparse)));
  it("dense pages reach every region of every viewport shape", () => assertSpread(distribution(dense)));
  it("neither sparse nor dense layouts are concentrated at the top (pooled over all shapes)", () => {
    for (const specs of [sparse, dense]) {
      const all = [...distribution(specs).values()].reduce((acc, d) => ({ n: acc.n + d.n, top: acc.top + d.cells.slice(0, GRID).reduce((a, b) => a + b, 0) }), { n: 0, top: 0 });
      expect(all.top / all.n).toBeLessThanOrEqual(CRITERIA.maxTopThird);
    }
  });
  it("the region each element was placed in is the region its centre is in", () => {
    for (const s of dense.slice(0, 50)) for (const e of s.elements) {
      const r = regionOf(s.area, e.region);
      const cx = e.box.x + e.box.w / 2;
      const cy = e.box.y + e.box.h / 2;
      expect(cx >= r.x - 0.5 && cx <= r.x + r.w + 0.5 && cy >= r.y - 0.5 && cy <= r.y + r.h + 0.5).toBe(true);
    }
  });
  it("the same seed reproduces the exact layout", () => {
    const [p] = planSplitIds("dev", 1);
    const t = scheduledTargets(schedule(["dev"], 1), "dev").slice(0, 12);
    expect(canonicalJson(layoutSample(p, t))).toBe(canonicalJson(layoutSample(p, t)));
  });
  it("no target is lost: placed + deferred = scheduled, per sample", () => {
    const ids = planSplitIds("train", 30);
    const deal = dealTargets(schedule(["train"], 10, { partial: 1, full: 1 }, 16), "train", ids);
    for (const p of ids) {
      const s = layoutSample(p, deal.get(p.id));
      expect(s.elements.length + s.deferred.length).toBe(deal.get(p.id).length);
    }
  });
});

// ─────────────────────────────── quota semantics ───────────────────────────────

describe("3 — positive and occlusion quotas", () => {
  it("positive quotas are preserved exactly, cell by cell", () => {
    const { specs, report } = planSplit(schedule(["train"], 5, { partial: 0, full: 0 }), "train", 40);
    const c = countBy(specs, "positive");
    for (const k of ALL_CELLS) expect(c[k]).toBe(5);
    expect(report.positives).toEqual({ requested: 160, planned: 160 });
  });
  it("occlusion cases are added ON TOP of positives, never taken from them", () => {
    const { specs, report } = planSplit(schedule(["train"], 5, { partial: 2, full: 1 }), "train", 60);
    const pos = countBy(specs, "positive");
    const part = countBy(specs, "occlusion-partial");
    const full = countBy(specs, "occlusion-full");
    for (const k of ALL_CELLS) {
      expect(pos[k]).toBe(5);
      expect(part[k]).toBe(2);
      expect(full[k]).toBe(1);
    }
    expect(report.positives).toEqual({ requested: 160, planned: 160 });
    expect(report.occlusionCases).toEqual({ partial: { requested: 64, planned: 64 }, full: { requested: 32, planned: 32 } });
  });
  it("quotas can differ by cell, and each is honoured", () => {
    const s = schedule(["dev"], (c, b) => (b === "large" ? 7 : c === "icon" ? 3 : 1));
    const c = countBy(planSplit(s, "dev", 40).specs, "positive");
    for (const k of ALL_CELLS) expect(c[k]).toBe(k.endsWith("/large") ? 7 : k.startsWith("icon/") ? 3 : 1);
  });
  it("deferred targets are rescheduled to overflow samples, deterministically, and reconciled", () => {
    // Crowded pages: 30 large positives per class (plus occlusion cases) on 6 pages of up to 48 targets
    // — more large boxes than a page can hold, so many are deferred at the first layout.
    const s = schedule(["train"], (c, b) => (b === "large" ? 30 : 0), { partial: 1, full: 0 }, 48, 40);
    const a = planSplit(s, "train", 6);
    const b = planSplit(s, "train", 6);
    expect(a.report.deferredAtFirstLayout.positive).toBeGreaterThan(0);
    expect(a.report.overflowSamples).toBeGreaterThan(0);
    expect(a.report.positives.planned).toBe(a.report.positives.requested);
    expect(a.report.occlusionCases.partial.planned).toBe(a.report.occlusionCases.partial.requested);
    expect(canonicalJson(a.specs)).toBe(canonicalJson(b.specs));
    // Overflow ids continue the sequence and stay unique.
    const ids = a.specs.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(`train-${String(ids.length - 1).padStart(5, "0")}`);
  });
  it("refuses a schedule that cannot be placed within its limits, with a diagnostic", () => {
    const s = schedule(["train"], (c, b) => (b === "large" ? 30 : 0), { partial: 1, full: 0 }, 48, 0);
    expect(() => planSplit(s, "train", 6)).toThrow(/could not be placed .* Still unplaced, by class\/bucket\/role/);
    // Too few overflow samples is refused the same way, never reduced.
    expect(() => planSplit({ ...s, maxOverflowSamples: 1 }, "train", 6)).toThrow(/could not be placed/);
    expect(() => planSplit(schedule(["train"], 10, { partial: 0, full: 0 }, 2), "train", 4)).toThrow(/do not fit/);
  });
  it("refuses an incomplete or non-integer schedule — nothing is defaulted", () => {
    const missingOcc = schedule(["train"], 1);
    delete missingOcc.occlusionCases.train;
    expect(() => validateSchedule(missingOcc, "train")).toThrow(/occlusion-case quotas/);
    const missingCell = schedule(["train"], 1);
    delete missingCell.positives.train.icon.large;
    expect(() => validateSchedule(missingCell, "train")).toThrow(/positives train\/icon\/large/);
    const fractional = schedule(["train"], 1.5);
    expect(() => validateSchedule(fractional, "train")).toThrow(/integer/);
    const noKind = schedule(["train"], 1);
    delete noKind.occlusionCases.train.tab.small.full;
    expect(() => validateSchedule(noKind, "train")).toThrow(/occlusionCases train\/tab\/small\/full/);
    const extraKey = schedule(["train"], 1);
    extraKey.positives.train.button.huge = 1;
    expect(() => validateSchedule(extraKey, "train")).toThrow(/unknown bucket/);
    const { maxOverflowSamples, ...noOverflow } = schedule(["train"], 1);
    expect(() => validateSchedule(noOverflow, "train")).toThrow(/maxOverflowSamples/);
  });
  it("no class/size cell is ever missing from a plan", () => {
    const c = countBy(planSplit(schedule(["dev"], 1), "dev", 8).specs, "positive");
    expect(Object.keys(c).sort()).toEqual([...ALL_CELLS].sort());
  });
  it("the report keeps PLANNED counts distinct from observed ones", () => {
    expect(planSplit(schedule(["dev"], 1), "dev", 8).report.note).toMatch(/PLANNED counts.*rendering and the gate/);
  });
});

// ─────────────────────────────── reproducibility and ordering ───────────────────────────────

describe("4 — reproducibility and ordering", () => {
  const s = schedule(["dev"], 1, { partial: 1, full: 0 });
  it("the same schedule gives the same specs, HTML and manifest hash", () => {
    const a = planSplit(s, "dev", 12).specs;
    const b = planSplit(s, "dev", 12).specs;
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.map(specToHtmlV2)).toEqual(b.map(specToHtmlV2));
    const m = (x) => buildSplitManifest("dev", x.map((spec) => annotateSample(spec, renderAsDeclared(spec))), {});
    expect(m(a).hash).toBe(m(b).hash);
  });
  it("elements are ordered top-to-bottom then left-to-right, with sequential keys", () => {
    for (const spec of planSplit(s, "dev", 12).specs) {
      spec.elements.forEach((e, k) => {
        expect(e.key).toBe(`${spec.id}-e${String(k).padStart(3, "0")}`);
        if (k > 0) {
          const p = spec.elements[k - 1].box;
          expect(p.y < e.box.y || (p.y === e.box.y && p.x <= e.box.x)).toBe(true);
        }
      });
    }
  });
  it("the manifest orders samples by id whatever the input order; annotations keep spec order", () => {
    const anns = planSplit(s, "dev", 8).specs.map((spec) => annotateSample(spec, renderAsDeclared(spec)));
    expect(buildSplitManifest("dev", [...anns].reverse(), {}).hash).toBe(buildSplitManifest("dev", anns, {}).hash);
  });
  it("an annotation is a positive only for an intended positive that is HIT_TESTABLE", () => {
    const spec = planSplit(s, "dev", 12).specs.find((x) => x.elements.some((e) => e.intent !== "positive"));
    const a = annotateSample(spec, renderAsDeclared(spec)).annotations;
    expect(a.filter((x) => x.intent !== "positive").every((x) => x.positive === false)).toBe(true);
    expect(annotateSample(spec, renderAsDeclared(spec, () => "FULLY_OCCLUDED")).annotations.every((x) => x.positive === false)).toBe(true);
  });
});

// ─────────────────────────────── splits ───────────────────────────────

describe("5 — split separation (TRAIN and DEV only; TEST only as a refusal)", () => {
  it("TRAIN and DEV have their own manifest and frame names", () => {
    expect([manifestName("train"), manifestName("dev")]).toEqual(["manifest-train.json", "manifest-dev.json"]);
    expect(framesDir("train")).not.toBe(framesDir("dev"));
  });
  it("the audit reader refuses TEST before touching the filesystem, and opens one exact file", () => {
    const read = vi.fn(() => JSON.stringify({ split: "dev", samples: [{ split: "dev" }] }));
    expect(() => openAuditManifest("/data/v2", "test", read)).toThrow(/train and dev only/);
    expect(read).not.toHaveBeenCalled();
    expect(AUDITABLE_SPLITS).toEqual(["train", "dev"]);
    openAuditManifest("/data/v2", "dev", read);
    expect(String(read.mock.calls[0][0]).replace(/\\/g, "/")).toBe("/data/v2/manifest-dev.json");
  });
  it("planning refuses TEST before any id or seed is computed", () => {
    expect(() => planSplitIds("test", 10)).toThrow(/sealed one-time build/);
    expect(() => planSplit(schedule(["train"], 1), "test", 10)).toThrow(/only train and dev/);
  });
  it("TRAIN and DEV ids and seeds are disjoint", () => {
    const train = planSplitIds("train", 5000);
    const dev = planSplitIds("dev", 2000);
    const seeds = new Set(train.map((p) => p.seed));
    expect(seeds.size).toBe(5000);
    expect(dev.some((p) => seeds.has(p.seed))).toBe(false);
  });
});

// ─────────────────────────────── leakage ───────────────────────────────

describe("6 — split leakage: exact and near-identical layouts", () => {
  const LEAK = { elementIou: 0.8, layoutShare: 0.8 }; // example test thresholds, not proposed values
  const train = planSplit(schedule(["train"], 1), "train", 8).specs;
  const dev = planSplit(schedule(["dev"], 1), "dev", 8).specs;
  const shift = (spec, dx) => ({ ...spec, elements: spec.elements.map((e) => ({ ...e, box: { ...e.box, x: e.box.x + dx } })) });

  it("clean TRAIN and DEV pass, with a report", () => {
    const r = assertNoLeakage([...train, ...dev], LEAK);
    expect(r.crossSplit).toEqual([]);
    expect(r.comparedPairs).toBeGreaterThan(0);
  });
  it("catches an exact TRAIN layout reused in DEV", () => {
    expect(() => assertNoLeakage([...train, { ...dev[0], elements: train[0].elements }], LEAK)).toThrow(/identical layout/);
  });
  it("catches a TRAIN layout shifted by 1 CSS px into DEV", () => {
    expect(layoutSimilarity(train[0].elements, shift(train[0], 1).elements, LEAK.elementIou)).toBe(1);
    expect(() => assertNoLeakage([...train, { ...shift(train[0], 1), id: dev[0].id, split: "dev", seed: dev[0].seed }], LEAK)).toThrow(/near-identical layout/);
  });
  it("reports — does not throw on — a near-duplicate within one split", () => {
    const r = assertNoLeakage([...train, { ...shift(train[0], 1), id: "train-99999", seed: 7 }], LEAK);
    expect(r.crossSplit).toEqual([]);
    expect(r.sameSplit.nearLayouts).toBeGreaterThanOrEqual(1);
  });
  it("catches a duplicate id and a seed shared across splits", () => {
    expect(() => assertNoLeakage([...train, { ...dev[0], id: train[0].id }], LEAK)).toThrow(/id/);
    expect(() => assertNoLeakage([...train, { ...dev[0], seed: train[1].seed }], LEAK)).toThrow(/seed/);
  });
  it("requires both thresholds, with no default", () => {
    expect(() => assertNoLeakage(train)).toThrow(/must be stated/);
    expect(() => assertNoLeakage(train, { elementIou: 0.8 })).toThrow(/must be stated/);
    expect(() => assertNoLeakage(train, { elementIou: 0, layoutShare: 0.8 })).toThrow(/must be stated/);
  });
  it("does not compare empty layouts, and counts them", () => {
    const empty = (id, split, seed) => ({ id, split, seed, elements: [] });
    const r = assertNoLeakage([empty("train-90000", "train", 1), empty("dev-90000", "dev", 2)], LEAK);
    expect(r.emptyLayouts).toBe(2);
    expect(r.crossSplit).toEqual([]);
  });
});

// ─────────────────────────────── the gate on v2 annotations ───────────────────────────────

describe("7 — the hardened gate on v2 annotations", () => {
  const GATE = { classes: CLASSES, minPerClassBucket: 2, nearDuplicateIou: 0.9, repetitionShare: 0.5, sourceTolerancePx: 0, expectedSplits: ["train", "dev"], requiredChecks: REQUIRED_CHECKS_V2 };
  const s = schedule(["train", "dev"], 2, { partial: 1, full: 1 });
  const train = planSplit(s, "train", 40).specs;
  const dev = planSplit(s, "dev", 40).specs;
  const annotate = (specs, v) => specs.map((spec) => annotateSample(spec, renderAsDeclared(spec, v)));
  const good = [...annotate(train), ...annotate(dev)];

  it("a correct render of TRAIN and DEV passes every required check", () => {
    const r = runDatasetGate({ samples: good }, GATE);
    expect(r.requiredNotApplicable).toEqual([]);
    expect(Object.fromEntries(r.checks.map((c) => [c.id, c.status]))).toEqual(Object.fromEntries(REQUIRED_CHECKS_V2.map((id) => [id, "PASS"])));
    expect(r.pass).toBe(true);
  });
  it("an incomplete render — DEV missing — fails rather than passing", () => {
    expect(runDatasetGate({ samples: annotate(train) }, GATE).pass).toBe(false);
  });
  it("an occluder that did not render (declared occlusion observed HIT_TESTABLE) fails", () => {
    const bad = [...annotate(train, () => "HIT_TESTABLE"), ...annotate(dev)];
    const g9 = runDatasetGate({ samples: bad }, GATE).checks.find((c) => c.id === "G9_OCCLUSION_LABELS");
    expect(g9.status).toBe("FAIL");
    expect(g9.declaredOcclusionNotObserved).toBeGreaterThan(0);
  });
  it("a moved element, or one not absolutely positioned, fails G8", () => {
    const spec = train[0];
    const moved = renderAsDeclared(spec);
    moved.elements[0].rect = { ...moved.elements[0].rect, x: moved.elements[0].rect.x + 2 };
    const g8 = (r) => runDatasetGate({ samples: [annotateSample(spec, r), ...annotate(dev)] }, GATE).checks.find((c) => c.id === "G8_SOURCE_RENDER_CONSISTENCY").status;
    expect(g8(moved)).toBe("FAIL");
    const relative = renderAsDeclared(spec);
    relative.elements[0].computedPosition = "relative";
    expect(g8(relative)).toBe("FAIL");
  });
});

describe("the v2 generator never touches the pinned dataset", () => {
  it("no v2 module's code names artifacts/datasets except as the one new candidate destination", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
      const code = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // M22.4: the build writes to `artifacts/datasets/<CANDIDATE_PREFIX><n>` and names nothing else there.
      const named = code.match(/artifacts[\\/]datasets[\\/]?[^"'`\s)]*/g) ?? [];
      expect(named.every((m) => m.startsWith("artifacts/datasets/${CANDIDATE_PREFIX}")), `${f}: ${named.join(", ")}`).toBe(true);
      if (!["render.mjs", "build-candidate.mjs", "audit-candidate.mjs"].includes(f)) expect(code).not.toMatch(/"datasets"|artifacts[\\/]datasets/);
    }
  });
});

// ─────────────────────────────── provenance (M22.3) ───────────────────────────────

describe("8 — provenance: every label traces to the visual context that produced it", () => {
  const { specs } = planSplit(schedule(["dev"], 3, { partial: 1, full: 1 }), "dev", 24);
  const withOcc = specs.filter((s) => s.occluders.length > 0);

  it("each sample records its seed, how it was derived, and the page it was drawn on", () => {
    for (const s of specs) {
      expect(s.seedDerivation).toEqual({ scheme: SEED_SCHEME, identity: [V2.name, V2.version, "sample", "dev", s.index], prng: PRNG });
      expect(seedOf(s.seedDerivation.identity)).toBe(s.seed);
      expect(s.id).toBe(sampleId("dev", s.index));
      expect(Object.keys(s.appearance).sort()).toEqual(["controlStyle", "density", "font", "palette"]);
      expect(s.overflow).toBe(false);
    }
  });
  it("each element records its declared box and positioning, region, size draw, appearance and occluder", () => {
    for (const s of specs) for (const e of s.elements) {
      expect(e.declaredPosition).toBe("absolute");
      expect(e.size.shorterCss).toBe(Math.min(e.box.w, e.box.h));
      expect(e.size.shorterModel).toBeCloseTo(e.size.shorterCss * s.scale, 9);
      expect(e.size.aspectRealised).toBeCloseTo(e.box.w / e.box.h, 9);
      expect(e.region).toBeGreaterThanOrEqual(0);
      expect(e.region).toBeLessThan(GRID * GRID);
      expect(typeof e.appearance.radiusPx).toBe("number");
      if (e.cls === "icon") {
        expect(ICON_GLYPHS).toContain(e.appearance.glyph);
        expect(ICON_PLATES).toContain(e.appearance.plate);
      }
      expect(e.occluderId === null).toBe(e.intent === "positive");
    }
  });
  it("each occluder has an identity and role, a declared box, its target and the share of the target it covers", () => {
    expect(withOcc.length).toBeGreaterThan(0);
    for (const s of withOcc) {
      const keys = new Map(s.elements.map((e) => [e.key, e]));
      expect(new Set(s.occluders.map((o) => o.id)).size).toBe(s.occluders.length);
      for (const o of s.occluders) {
        expect(o.role).toBe("occluder");
        const target = keys.get(o.for);
        expect(target.occluderId).toBe(o.id);
        expect(o.kind).toBe(target.intent === "occlusion-full" ? "full" : "partial");
        if (o.kind === "full") expect(o.coversTargetShare).toBe(1);
        else {
          expect(o.coversTargetShare).toBeGreaterThan(0.3);
          expect(o.coversTargetShare).toBeLessThan(0.7);
        }
      }
    }
  });
  it("annotations carry the sample's provenance, its spec hash, and each label's source", () => {
    const spec = withOcc[0];
    const r = renderAsDeclared(spec);
    r.occluders = spec.occluders.map((o) => ({ id: o.id, rect: { ...o.box } }));
    const a = annotateSample(spec, r);
    expect(a.specHash).toBe(sha256(canonicalJson(spec)));
    expect(a.provenance.seedDerivation).toEqual(spec.seedDerivation);
    expect(a.provenance.occluders.map((o) => o.rendered)).toEqual(spec.occluders.map((o) => o.box));
    // Not measured → null, never invented.
    expect(annotateSample(spec, renderAsDeclared(spec)).provenance.occluders.every((o) => o.rendered === null)).toBe(true);
    for (const x of a.annotations) {
      const e = spec.elements.find((y) => y.key === x.id);
      expect(x.source).toMatchObject({ declared: e.box, declaredPosition: "absolute", computedPosition: "absolute", occluderId: e.occluderId, region: e.region });
    }
  });
  it("a manifest holds only generated values: no path, URL, page text or anything personal", () => {
    const m = buildSplitManifest("dev", specs.map((spec) => annotateSample(spec, renderAsDeclared(spec))), {});
    const allowed = new Set([
      ...CLASSES, ...BUCKET_IDS, ...WORDS, ...FONT_STACKS, ...ICON_GLYPHS, ...ICON_PLATES, ...DECOR_KINDS,
      ...PALETTES.map((p) => p.id), ...CONTROL_STYLES.map((c) => c.id), ...DENSITY_LEVELS.map((d) => d.id),
      "positive", "occlusion-partial", "occlusion-full", "occluder", "full", "partial", "absolute", "VISIBLE", "HIT_TESTABLE", "PARTIALLY_OCCLUDED", "FULLY_OCCLUDED",
      "dev", "sample", V2.name, V2.version, V2.generator, `${V2.name}@${V2.version}`, SEED_SCHEME, PRNG,
      // M22.6: render revision, occluder styles, and the textbox treatment's colour names.
      V2.renderRevision, ...OCCLUDER_STYLES, "page", "field", "fieldEdge", "border", "accent",
    ]);
    const strings = [];
    const walk = (v) => (typeof v === "string" ? strings.push(v) : v && typeof v === "object" ? Object.values(v).forEach(walk) : null);
    walk(m);
    const unexpected = strings.filter((x) => !allowed.has(x) && !/^dev-\d{5}(-[eod]\d{3})?$/.test(x) && !/^[0-9a-f]{64}$/.test(x));
    expect(unexpected).toEqual([]);
  });
});

// ─────────────────────────────── appearance variety (M22.3) ───────────────────────────────

describe("9 — appearance: genuine variety, deterministic from the seed, no external asset", () => {
  const ids = planSplitIds("train", 1200);
  const looks = ids.map((p) => pageAppearanceOf(p.seed));
  const share = (key, value) => looks.filter((l) => l[key] === value).length / looks.length;
  // 40 positives + 2 occlusion cases per cell: 168 draws per class, enough to judge each third of an
  // aspect range (at 56 draws per class one third read 14% by chance; at 168 every third is 27–40%).
  const varied = () => schedule(["train"], 40, { partial: 1, full: 1 }, 12, 60);
  const { specs } = planSplit(varied(), "train", 600);

  it("every palette, font stack, control style and density level is drawn, none below half its uniform share", () => {
    const options = [["palette", PALETTES.map((p) => p.id)], ["font", FONT_STACKS], ["controlStyle", CONTROL_STYLES.map((c) => c.id)], ["density", DENSITY_LEVELS.map((d) => d.id)]];
    for (const [key, values] of options) for (const v of values) expect(share(key, v), `${key} ${v}`).toBeGreaterThanOrEqual(0.5 / values.length);
  });
  it("every icon glyph and plate is drawn", () => {
    const icons = specs.flatMap((s) => s.elements).filter((e) => e.cls === "icon");
    expect(new Set(icons.map((e) => e.appearance.glyph))).toEqual(new Set(ICON_GLYPHS));
    expect(new Set(icons.map((e) => e.appearance.plate))).toEqual(new Set(ICON_PLATES));
  });
  it("aspect ratios cover each class's range at both ends (log-uniform draw)", () => {
    for (const [cls, g] of Object.entries(CLASS_GEOMETRY)) {
      const [lo, hi] = g.aspect;
      const drawn = specs.flatMap((s) => s.elements).filter((e) => e.cls === cls).map((e) => e.size.aspectDrawn);
      if (lo === hi) {
        expect(drawn.every((a) => a === lo)).toBe(true);
        continue;
      }
      const t = drawn.map((a) => (Math.log(a) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
      expect(t.every((x) => x >= 0 && x <= 1)).toBe(true);
      expect(t.filter((x) => x < 1 / 3).length / t.length, `${cls} narrow third`).toBeGreaterThanOrEqual(0.2);
      expect(t.filter((x) => x > 2 / 3).length / t.length, `${cls} wide third`).toBeGreaterThanOrEqual(0.2);
    }
  });
  it("page density varies: denser levels are dealt more targets and draw more decor", () => {
    const by = (id) => specs.filter((s) => !s.overflow && s.appearance.density === id);
    const mean = (list, f) => list.reduce((a, s) => a + f(s), 0) / list.length;
    const [sparse, medium, dense] = ["sparse", "medium", "dense"].map(by);
    expect(mean(sparse, (s) => s.elements.length)).toBeLessThan(mean(medium, (s) => s.elements.length));
    expect(mean(medium, (s) => s.elements.length)).toBeLessThan(mean(dense, (s) => s.elements.length));
    expect(mean(sparse, (s) => s.decor.length)).toBeLessThan(mean(dense, (s) => s.decor.length));
  });
  it("the same seed gives the same look and the same HTML; different seeds look different", () => {
    expect(pageAppearanceOf(ids[7].seed)).toEqual(pageAppearanceOf(ids[7].seed));
    expect(planSplit(varied(), "train", 600).specs.map(specToHtmlV2)).toEqual(specs.map(specToHtmlV2));
    expect(new Set(specs.slice(0, 24).map((s) => canonicalJson(s.appearance))).size).toBeGreaterThan(12);
  });
  it("the HTML loads nothing: no URL, image, @import or @font-face", () => {
    for (const s of specs) expect(specToHtmlV2(s)).not.toMatch(/url\(|https?:|@import|@font-face|<img|<link|src=/i);
  });
  it("decor stays in the usable area, below the labels, and never overlaps a labelled element or an occluder", () => {
    expect(specs.some((s) => s.decor.length > 0)).toBe(true);
    for (const s of specs) for (const d of s.decor) {
      expect(d.box.x >= s.area.x && d.box.y >= s.area.y && d.box.x + d.box.w <= s.area.x + s.area.w && d.box.y + d.box.h <= s.area.y + s.area.h).toBe(true);
      for (const b of [...s.elements.map((e) => e.box), ...s.occluders.map((o) => o.box)]) expect(overlap(d.box, b)).toBe(false);
    }
  });
});

describe("9b — every labelled box stays hit-testable on both validity grids", () => {
  /** Is point p inside a w × h box at (0, 0) with circular corners of radius r? */
  const insideRounded = (p, w, h, r) => {
    const cx = Math.min(Math.max(p.x, r), w - r);
    const cy = Math.min(Math.max(p.y, r), h - r);
    return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
  };
  it("no labelled element's corner radius exceeds HIT_SAFE_RADIUS × its shorter side", () => {
    const { specs } = planSplit(schedule(["dev"], 6, { partial: 1, full: 1 }, 12, 20), "dev", 40);
    for (const s of specs) for (const e of s.elements) expect(e.appearance.radiusPx).toBeLessThanOrEqual(HIT_SAFE_RADIUS * Math.min(e.box.w, e.box.h));
  });
  it("at the hit-safe radius every 5 × 5 and 9 × 9 grid point is inside the box; at M22.2's circle radius a corner point is not", () => {
    for (const [w, h] of [[4, 4], [8, 8], [12, 48], [48, 12], [96, 96], [300, 40]]) {
      const r = HIT_SAFE_RADIUS * Math.min(w, h);
      for (const n of [5, 9]) for (const p of gridPoints({ x: 0, y: 0, w, h }, n)) expect(insideRounded(p, w, h, r), `${w}x${h} n${n}`).toBe(true);
    }
    // The defect M22.3 removed: a 50% (circle) radius puts the corner grid points outside the shape.
    expect(insideRounded(gridPoints({ x: 0, y: 0, w: 20, h: 20 }, 5)[0], 20, 20, 10)).toBe(false);
  });
});

// ─────────────────────────────── seeds and serialisation (M22.3) ───────────────────────────────

describe("10 — seeds, identities and canonical JSON", () => {
  it("xoshiro128** matches its reference sequence from state (1, 2, 3, 4)", () => {
    const next = xoshiro128ss(1, 2, 3, 4);
    expect([next(), next(), next()]).toEqual([11520, 0, 5927040]);
    expect(() => xoshiro128ss(0, 0, 0, 0)).toThrow(/all-zero/);
  });
  it("seeds are 256-bit digests; 100,000 TRAIN and 40,000 DEV seeds are all distinct", () => {
    const seen = new Set();
    for (const [split, n] of [["train", 100000], ["dev", 40000]]) for (let i = 0; i < n; i += 1) seen.add(seedFor(split, i));
    expect(seen.size).toBe(140000);
    expect([...seen].every((x) => /^[0-9a-f]{64}$/.test(x))).toBe(true);
  });
  it("identities are unambiguous: no choice of strings makes two identities serialise alike", () => {
    expect(seedOf(["a|b", "c"])).not.toBe(seedOf(["a", "b|c"]));
    expect(seedOf(["train", 1])).not.toBe(seedOf(["train", "1"]));
    for (const bad of [[], ["x", 1.5], ["x", null], "train|0"]) expect(() => seedOf(bad)).toThrow(/identity/);
  });
  it("named streams of one seed are independent, and the old numeric seeds are refused", () => {
    const seed = seedFor("dev", 3);
    const draw = (stream) => Array.from({ length: 4 }, rngOf(seed, stream).next);
    expect(draw("layout")).toEqual(draw("layout"));
    expect(draw("layout")).not.toEqual(draw("appearance"));
    expect(() => rngOf(12345, "layout")).toThrow(/64 hex/);
    expect(() => rngOf(seed)).toThrow(/stream/);
  });
  it("canonical JSON refuses what JSON would drop or change, instead of emitting invalid or lossy output", () => {
    // eslint-disable-next-line no-sparse-arrays
    const hole = [1, , 3];
    for (const bad of [{ a: undefined }, [1, undefined], { n: Number.NaN }, { n: Number.POSITIVE_INFINITY }, { f: () => 1 }, { s: Symbol("x") }, { b: 1n }, { d: new Date(0) }, { m: new Map() }, hole]) {
      expect(() => canonicalJson(bad)).toThrow(/canonicalJson/);
    }
    expect(canonicalJson({ b: [1, null, { d: true, c: "x" }], a: -0 })).toBe('{"a":0,"b":[1,null,{"c":"x","d":true}]}');
    expect(() => canonicalJson({ deep: { list: [{ hole: undefined }] } })).toThrow(/\$\.deep\.list\[0\]\.hole/);
  });
  it("ids are fixed-width, so string order is index order; an index past the width is refused", () => {
    const list = Array.from({ length: 12000 }, (_, i) => sampleId("train", i));
    expect([...list].sort()).toEqual(list);
    expect(() => sampleId("train", MAX_SAMPLES_PER_SPLIT)).toThrow(/fixed-width/);
    expect(() => planSplitIds("dev", MAX_SAMPLES_PER_SPLIT + 1)).toThrow(/count/);
  });
  it("a spec whose seed is not the seed of its (split, index) is refused", () => {
    const [p] = planSplitIds("dev", 1);
    expect(() => layoutSample({ ...p, seed: seedFor("dev", 1) }, [])).toThrow(/not the seed/);
  });
  it("hashes are stable across executions: golden values, and a separate Node process agrees", () => {
    const s = schedule(["dev"], 1, { partial: 1, full: 0 });
    const here = planHash(planSplit(s, "dev", 12).specs);
    // Golden values for 2.1.0-draft. A change to a seed changes every generated sample and must come
    // with a version change. The plan hash also covers what a spec records: M22.6 (render revision
    // r2) added the render revision, occluder styles and fitted labels, moving it from
    // ed5a189a…6beb9 while every seed and box stayed the same.
    expect(seedFor("train", 0)).toBe("cb7eda1c6211f9187934f721d7c49a3ddf857bd318ebd5f48d81bab94db9a78e");
    expect(seedFor("dev", 0)).toBe("19f60b541fb460fe9e853f661a2c68d7eca842034b03b250ca1da60f24007cda");
    expect(here).toBe("79f0b6648149e4b0cd0fbac4b091d76bd843bf35ed0aa5da42da2a4098495be8");
    const plan = new URL("../plan.mjs", import.meta.url).href;
    const code = `import { planSplit, planHash } from ${JSON.stringify(plan)};
      const s = JSON.parse(process.argv[1]);
      process.stdout.write(planHash(planSplit(s, "dev", 12).specs));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", code, JSON.stringify(s)], { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8" });
    expect(out).toBe(here);
  });
});

describe("11 — density-weighted dealing", () => {
  it("allocates exactly, at least one per sample, never above the cap, in proportion to weight", () => {
    const w = [1, 2, 3, 1, 2, 3, 3, 3];
    const a = allocateTargets(w, 60, 12);
    expect(a.reduce((x, y) => x + y, 0)).toBe(60);
    expect(a.every((n) => n >= 1 && n <= 12)).toBe(true);
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[1]).toBeLessThan(a[2]);
    expect(allocateTargets(w, 96, 12)).toEqual(Array(8).fill(12)); // full: every page at the cap
    expect(allocateTargets(w, 8, 12)).toEqual(Array(8).fill(1));
  });
  it("refuses a plan that would overfill or leave a page empty", () => {
    expect(() => allocateTargets([1, 1], 25, 12)).toThrow(/do not fit/);
    expect(() => allocateTargets([1, 1, 1], 2, 12)).toThrow(/empty/);
  });
  it("no planned page is empty", () => {
    const { specs } = planSplit(schedule(["dev"], 1), "dev", 30);
    expect(specs.every((s) => s.elements.length > 0)).toBe(true);
  });
});
