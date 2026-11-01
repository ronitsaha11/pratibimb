/**
 * M22.2 — v2 generator, deterministic tests on in-memory fixtures. No browser, no dataset files:
 * nothing here reads `artifacts/datasets`. The schedule below is an EXAMPLE test input, not a
 * proposed training schedule.
 */
import { describe, expect, it, vi } from "vitest";
import { CLASSES, SIZE_BUCKETS } from "../config.mjs";
import { canonicalJson } from "../prng.mjs";
import { AUDITABLE_SPLITS, assertNoLeakage, framesDir, manifestName, openAuditManifest, planSplitIds, testSealToken } from "../splits.mjs";
import { dealTargets, validateSchedule } from "../schedule.mjs";
import { cssShorterRange, layoutSample, scaleOf } from "../layout.mjs";
import { specToHtmlV2 } from "../html.mjs";
import { annotateSample, buildSplitManifest } from "../annotate.mjs";
import { runDatasetGate } from "../../../../tests/browser/support/dataset-quality-gate.mjs";

const BUCKET_IDS = SIZE_BUCKETS.map((b) => b.id);
/** EXAMPLE schedule for tests: `n` of every class in every bucket. */
const exampleSchedule = (split, n, max = 8) => ({
  maxTargetsPerSample: max,
  quotas: { [split]: Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(BUCKET_IDS.map((b) => [b, n]))])) },
});
const NO_OCCLUSION = { share: 0, kinds: [] };

function buildSplit(split, count, n, occlusion = NO_OCCLUSION, max = 8) {
  const ids = planSplitIds(split, count);
  const deal = dealTargets(exampleSchedule(split, n, max), split, ids);
  return ids.map((p) => layoutSample(p, deal.get(p.id), occlusion));
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const modelShorter = (spec, e) => Math.min(e.box.w, e.box.h) * spec.scale;
const bucketOfModel = (s) => SIZE_BUCKETS.find((b) => s >= b.lo && s < b.hi).id;

/** What a correct render would report: rect = declared box, absolute, and the stated validities. */
function renderAsDeclared(spec, validityOf = (e) => (e.intent === "positive" ? "HIT_TESTABLE" : e.intent === "occlusion-full" ? "FULLY_OCCLUDED" : "PARTIALLY_OCCLUDED")) {
  return {
    elements: spec.elements.map((e) => ({ key: e.key, rect: { ...e.box }, computedPosition: "absolute" })),
    validity: Object.fromEntries(spec.elements.map((e) => [e.key, validityOf(e)])),
  };
}

describe("1 — icon positioning and layout", () => {
  const specs = buildSplit("train", 24, 3);
  it("every labelled element, icons included, is absolutely positioned at its declared box", () => {
    for (const spec of specs.slice(0, 4)) {
      const html = specToHtmlV2(spec);
      expect(html).toMatch(/\[data-v2\]\{position:absolute;/);
      for (const e of spec.elements) {
        expect(html).toContain(`data-v2="${e.key}" style="left:${e.box.x}px;top:${e.box.y}px;width:${e.box.w}px;height:${e.box.h}px`);
      }
      for (const e of spec.elements.filter((x) => x.cls === "icon")) expect(html).toMatch(new RegExp(`<div role="img"[^>]*data-v2="${e.key}"`));
    }
  });
  it("nothing overlaps the masthead, positives never overlap each other, and all lie inside the viewport", () => {
    for (const spec of specs) {
      for (const e of spec.elements) {
        expect(overlap(e.box, spec.masthead)).toBe(false);
        expect(e.box.x >= 0 && e.box.y >= 0 && e.box.x + e.box.w <= spec.viewport.w && e.box.y + e.box.h <= spec.viewport.h).toBe(true);
      }
      for (let i = 0; i < spec.elements.length; i += 1) for (let j = i + 1; j < spec.elements.length; j += 1) {
        expect(overlap(spec.elements[i].box, spec.elements[j].box)).toBe(false);
      }
    }
  });
});

describe("2 — seeded variety", () => {
  const icons = buildSplit("train", 40, 4).flatMap((s) => s.elements.filter((e) => e.cls === "icon").map((e) => ({ ...e, viewport: `${s.viewport.w}x${s.viewport.h}` })));
  it("icons vary in shape, size, position and count — no single fixed geometry", () => {
    expect(new Set(icons.map((e) => e.shape)).size).toBe(4);
    expect(new Set(icons.map((e) => `${e.box.w}x${e.box.h}`)).size).toBeGreaterThan(10);
    expect(new Set(icons.map((e) => `${e.box.x},${e.box.y}`)).size).toBe(icons.length);
    const counts = buildSplit("train", 40, 4).map((s) => s.elements.filter((e) => e.cls === "icon").length);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
  it("no class sits at one fixed geometry", () => {
    const specs = buildSplit("train", 40, 4);
    for (const cls of CLASSES) {
      const boxes = specs.flatMap((s) => s.elements.filter((e) => e.cls === cls).map((e) => canonicalJson(e.box)));
      expect(new Set(boxes).size).toBe(boxes.length);
    }
  });
});

describe("3 — every class in every size bucket", () => {
  it("each target's shorter side lands in its scheduled bucket, at its sample's scale", () => {
    for (const spec of buildSplit("train", 40, 3)) {
      for (const e of spec.elements) expect(bucketOfModel(modelShorter(spec, e))).toBe(e.bucket);
    }
  });
  it("covers all 8 × 4 class/size combinations, and reports any target it could not place", () => {
    const specs = buildSplit("train", 48, 3);
    const placed = new Set(specs.flatMap((s) => s.elements.map((e) => `${e.cls}/${e.bucket}`)));
    expect(placed.size).toBe(CLASSES.length * BUCKET_IDS.length);
    const scheduled = CLASSES.length * BUCKET_IDS.length * 3;
    const laid = specs.reduce((n, s) => n + s.elements.length, 0);
    const deferred = specs.reduce((n, s) => n + s.deferred.length, 0);
    expect(laid + deferred).toBe(scheduled); // nothing silently dropped
  });
  it("every bucket has an integer CSS size at every viewport scale", () => {
    for (const s of [0.5, 0.625, 0.6667]) for (const b of BUCKET_IDS) {
      const [lo, hi] = cssShorterRange(b, s);
      expect(lo).toBeLessThanOrEqual(hi);
      expect(bucketOfModel(lo * s)).toBe(b);
      expect(bucketOfModel(hi * s)).toBe(b);
    }
  });
  it("refuses an incomplete schedule — a class or a bucket cannot be left out by omission", () => {
    const s = exampleSchedule("train", 1);
    delete s.quotas.train.icon;
    expect(() => validateSchedule(s, "train", 10)).toThrow(/quota train\/icon/);
    const t = exampleSchedule("train", 1);
    t.quotas.train.button.huge = 1;
    expect(() => validateSchedule(t, "train", 10)).toThrow(/unknown bucket/);
    expect(() => validateSchedule(exampleSchedule("train", 10, 2), "train", 4)).toThrow(/do not fit/);
  });
});

describe("4 — reproducibility", () => {
  it("the same seed and schedule give the same spec, HTML and manifest hash", () => {
    const a = buildSplit("dev", 6, 1);
    const b = buildSplit("dev", 6, 1);
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.map(specToHtmlV2)).toEqual(b.map(specToHtmlV2));
    const m = (specs) => buildSplitManifest("dev", specs.map((s) => annotateSample(s, renderAsDeclared(s))), { schedule: "example" });
    expect(m(a).hash).toBe(m(b).hash);
    expect(m(a).hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("different samples differ", () => {
    const [s0, s1] = buildSplit("dev", 2, 1, NO_OCCLUSION, 32);
    expect(canonicalJson(s0.elements)).not.toBe(canonicalJson(s1.elements));
  });
});

describe("5 — stable ids and annotation ordering", () => {
  it("elements are ordered top-to-bottom then left-to-right, with sequential keys", () => {
    for (const spec of buildSplit("train", 10, 2)) {
      spec.elements.forEach((e, k) => {
        expect(e.key).toBe(`${spec.id}-e${String(k).padStart(3, "0")}`);
        if (k > 0) {
          const p = spec.elements[k - 1].box;
          expect(p.y < e.box.y || (p.y === e.box.y && p.x <= e.box.x)).toBe(true);
        }
      });
    }
  });
  it("annotations keep spec order; the manifest orders samples by id, whatever the input order", () => {
    const specs = buildSplit("train", 5, 1);
    const anns = specs.map((s) => annotateSample(s, renderAsDeclared(s)));
    expect(anns[0].annotations.map((a) => a.id)).toEqual(specs[0].elements.map((e) => e.key));
    const fwd = buildSplitManifest("train", anns, {});
    const rev = buildSplitManifest("train", [...anns].reverse(), {});
    expect(rev.hash).toBe(fwd.hash);
    expect(fwd.samples.map((s) => s.id)).toEqual(["train-00000", "train-00001", "train-00002", "train-00003", "train-00004"]);
  });
  it("refuses a render missing an element, or without a validity", () => {
    const [s] = buildSplit("train", 1, 1, NO_OCCLUSION, 32);
    const r = renderAsDeclared(s);
    expect(() => annotateSample(s, { ...r, elements: r.elements.slice(1) })).toThrow();
    expect(() => annotateSample(s, { ...r, validity: {} })).toThrow(/no hit-test validity/);
  });
});

describe("6 — occlusion handling", () => {
  const occ = { share: 0.3, kinds: ["partial", "full"] };
  const specs = buildSplit("train", 16, 2, occ);
  it("with share 0 there are no occluders and every target is an intended positive", () => {
    for (const s of buildSplit("train", 8, 1)) {
      expect(s.occluders).toEqual([]);
      expect(s.elements.every((e) => e.intent === "positive")).toBe(true);
    }
  });
  it("each occlusion case has its own occluder over its target, and over no other element", () => {
    let partial = 0;
    let full = 0;
    for (const s of specs) {
      for (const o of s.occluders) {
        const target = s.elements.find((e) => e.key === o.for);
        expect(target.intent).toBe(`occlusion-${o.kind}`);
        expect(overlap(o.box, target.box)).toBe(true);
        if (o.kind === "full") {
          full += 1;
          expect(o.box.x <= target.box.x && o.box.y <= target.box.y && o.box.x + o.box.w >= target.box.x + target.box.w && o.box.y + o.box.h >= target.box.y + target.box.h).toBe(true);
        } else partial += 1;
        for (const other of s.elements.filter((e) => e.key !== o.for)) expect(overlap(o.box, other.box)).toBe(false);
      }
      expect(s.elements.filter((e) => e.intent !== "positive").length).toBe(s.occluders.length);
    }
    expect(partial).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(0);
  });
  it("an occlusion case is never a positive; a fully occluded element is never a positive; G9 agrees", () => {
    const anns = specs.map((s) => annotateSample(s, renderAsDeclared(s)));
    const all = anns.flatMap((x) => x.annotations);
    expect(all.filter((a) => a.intent !== "positive").every((a) => a.positive === false)).toBe(true);
    // An intended positive the render found fully occluded: not a positive, and G9 fails it.
    const s = specs[0];
    const bad = annotateSample(s, renderAsDeclared(s, () => "FULLY_OCCLUDED"));
    expect(bad.annotations.every((a) => a.positive === false)).toBe(true);
    const g = runDatasetGate({ samples: [bad] }, { classes: CLASSES, minPerClassBucket: 0, nearDuplicateIou: 0.9, repetitionShare: 0.5, sourceTolerancePx: 0 });
    expect(g.checks.find((c) => c.id === "G9_OCCLUSION_LABELS").status).toBe("FAIL");
  });
  it("refuses an unstated or malformed occlusion setting", () => {
    const [p] = planSplitIds("train", 1);
    expect(() => layoutSample(p, [], undefined)).toThrow(/must be stated/);
    expect(() => layoutSample(p, [], { share: 0.2, kinds: ["sideways"] })).toThrow(/kinds/);
  });
});

describe("7 — manifest separation", () => {
  it("each split has its own manifest file and frame folder", () => {
    expect(["train", "dev", "test"].map(manifestName)).toEqual(["manifest-train.json", "manifest-dev.json", "manifest-test.json"]);
    expect(new Set(["train", "dev", "test"].map(framesDir)).size).toBe(3);
    expect(() => manifestName("validation")).toThrow();
  });
  it("an audit refuses TEST before touching the filesystem, and opens only the one exact file", () => {
    const read = vi.fn(() => JSON.stringify({ split: "dev", samples: [{ split: "dev" }] }));
    expect(() => openAuditManifest("/data/v2", "test", read)).toThrow(/train and dev only/);
    expect(read).not.toHaveBeenCalled();
    expect(AUDITABLE_SPLITS).toEqual(["train", "dev"]);
    openAuditManifest("/data/v2", "dev", read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(String(read.mock.calls[0][0]).replace(/\\/g, "/")).toBe("/data/v2/manifest-dev.json");
  });
  it("an audit refuses a manifest that holds another split's sample", () => {
    const read = () => JSON.stringify({ split: "dev", samples: [{ split: "dev" }, { split: "test" }] });
    expect(() => openAuditManifest("/d", "dev", read)).toThrow(/another split/);
    expect(() => buildSplitManifest("dev", [{ id: "x", split: "train" }], {})).toThrow(/another split/);
  });
});

describe("8 — split leakage prevention", () => {
  it("ids and seeds of TRAIN and DEV are disjoint by construction", () => {
    const train = planSplitIds("train", 5000);
    const dev = planSplitIds("dev", 2000);
    const seeds = new Set(train.map((p) => p.seed));
    expect(seeds.size).toBe(5000);
    expect(dev.some((p) => seeds.has(p.seed))).toBe(false);
    expect(dev.every((p) => p.id.startsWith("dev-")) && train.every((p) => p.id.startsWith("train-"))).toBe(true);
  });
  it("TEST is planned only by the sealed one-time build", () => {
    expect(() => planSplitIds("test", 10)).toThrow(/sealed one-time build/);
    expect(() => planSplitIds("test", 10, { sealToken: "guess" })).toThrow();
    expect(planSplitIds("test", 2, { sealToken: testSealToken() }).map((p) => p.id)).toEqual(["test-00000", "test-00001"]);
  });
  it("assertNoLeakage passes clean splits and catches a shared id, seed or layout", () => {
    const train = buildSplit("train", 6, 1);
    const dev = buildSplit("dev", 4, 1);
    expect(assertNoLeakage([...train, ...dev])).toBe(true);
    expect(() => assertNoLeakage([...train, { ...dev[0], id: train[0].id }])).toThrow(/id/);
    expect(() => assertNoLeakage([...train, { ...dev[0], seed: train[1].seed }])).toThrow(/seed/);
    expect(() => assertNoLeakage([...train, { ...dev[0], elements: train[2].elements }])).toThrow(/layout/);
  });
});

describe("9 and 10 — the quality gate on v2 annotations, including G8", () => {
  const GATE = { classes: CLASSES, minPerClassBucket: 1, nearDuplicateIou: 0.9, repetitionShare: 0.5, sourceTolerancePx: 0 };
  const specs = buildSplit("train", 48, 3, { share: 0.1, kinds: ["partial", "full"] });
  const good = specs.map((s) => annotateSample(s, renderAsDeclared(s)));
  const status = (samples) => Object.fromEntries(runDatasetGate({ samples }, GATE).checks.map((c) => [c.id, c.status]));

  it("a correct render of a v2 split passes every check", () => {
    expect(status(good)).toEqual({
      G1_NON_DEGENERATE: "PASS",
      G2_VISIBILITY_MATCHES_GEOMETRY: "PASS",
      G3_LABEL_OBSERVABLE: "PASS",
      G4_CLASS_SIZE_COVERAGE: "PASS",
      G5_DUPLICATES: "PASS",
      G6_SUSPICIOUS_REPETITION: "PASS",
      G7_SPLIT_INTEGRITY: "PASS",
      G8_SOURCE_RENDER_CONSISTENCY: "PASS",
      G9_OCCLUSION_LABELS: "PASS",
    });
  });
  it("the fixture really contains labelled occlusion cases, and G3 leaves them to G9", () => {
    const cases = good.flatMap((s) => s.annotations).filter((a) => a.intent !== "positive");
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((a) => a.validity !== "HIT_TESTABLE" && a.positive === false)).toBe(true);
  });
  it("G3 still fails occlusion nobody declared", () => {
    const s = specs[0];
    const undeclared = annotateSample(s, renderAsDeclared(s, () => "PARTIALLY_OCCLUDED"));
    expect(status([undeclared]).G3_LABEL_OBSERVABLE).toBe("FAIL");
  });
  it("G8 fails a render that moved an element, or ignored its declared position", () => {
    const s = specs[0];
    const moved = renderAsDeclared(s);
    moved.elements[0].rect = { ...moved.elements[0].rect, x: moved.elements[0].rect.x + 3 };
    expect(status([annotateSample(s, moved)]).G8_SOURCE_RENDER_CONSISTENCY).toBe("FAIL");
    const ignored = renderAsDeclared(s);
    ignored.elements[0].computedPosition = "static";
    expect(status([annotateSample(s, ignored)]).G8_SOURCE_RENDER_CONSISTENCY).toBe("FAIL");
  });
  it("G4 fails a split with a class/size combination missing", () => {
    const thin = good.map((s) => ({ ...s, annotations: s.annotations.filter((a) => !(a.cls === "icon" && a.source.bucket === "large")) }));
    expect(status(thin).G4_CLASS_SIZE_COVERAGE).toBe("FAIL");
  });
  it("G7 fails a v2 sample reused across splits", () => {
    expect(status([...good, { ...good[0], split: "dev" }]).G7_SPLIT_INTEGRITY).toBe("FAIL");
  });
});

describe("the v2 generator never touches the pinned dataset", () => {
  it("no v2 module's code names artifacts/datasets (comments may say it is not read)", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
      const code = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/artifacts[\\/]datasets/);
    }
  });
  it("model px follow the shipped letterbox scale", () => {
    expect(scaleOf({ w: 1280, h: 720 })).toBe(0.5);
    expect(scaleOf({ w: 800, h: 1280 })).toBe(0.5);
  });
});
