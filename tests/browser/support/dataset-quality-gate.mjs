/**
 * M22.1 — a reusable quality gate for synthetic detector datasets. Pure: annotations in, check
 * results out. No detector, no browser, no pixels, no page text.
 *
 * Input: `{ samples: [{ id, split, seed?, viewportCss: {w, h}, annotations: [{ id, cls, box,
 * visibility, validity? }] }] }` — the evaluation package's sample shape, plus an optional
 * `validity` per annotation from the M22 hit-test classification (`fixture-validity.mjs`):
 * HIT_TESTABLE, PARTIALLY_OCCLUDED, FULLY_OCCLUDED, SAMPLING_SENSITIVE, PARTIALLY_CLIPPED, OFFSCREEN.
 *
 * A hit test is the browser's, not a pixel: no check here proves pixel-level visibility.
 *
 * Every threshold is a REQUIRED option. The gate invents no number: whoever runs it states the
 * minimum examples per class and size, and what counts as suspicious repetition, and the record
 * says what was used.
 */
import { BUCKETS, bucketOf, iou } from "./small-target-eval.mjs";

export const GATE_CHECKS = Object.freeze([
  "G1_NON_DEGENERATE",
  "G2_VISIBILITY_MATCHES_GEOMETRY",
  "G3_LABEL_OBSERVABLE",
  "G4_CLASS_SIZE_COVERAGE",
  "G5_DUPLICATES",
  "G6_SUSPICIOUS_REPETITION",
  "G7_SPLIT_INTEGRITY",
]);

const MODEL_INPUT = 640;
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const r2 = (v) => Math.round(v * 100) / 100;

/** Model-px box of an annotation, by the shipped letterbox scale for that sample's viewport. */
export function modelBoxOf(box, viewport) {
  const s = MODEL_INPUT / Math.max(viewport.w, viewport.h);
  return { x: box.x * s, y: box.y * s, w: box.w * s, h: box.h * s };
}

/** What the box's geometry says its visibility must be. */
export function geometricVisibility(box, viewport) {
  const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= viewport.w && box.y + box.h <= viewport.h;
  const intersects = box.x < viewport.w && box.y < viewport.h && box.x + box.w > 0 && box.y + box.h > 0;
  return inside ? "VISIBLE" : intersects ? "CLIPPED" : "OFFSCREEN";
}

/** A box's identity, for repetition and duplicate checks: class plus coordinates to 0.01 px. */
const boxKey = (a) => `${a.cls}@${r2(a.box.x)},${r2(a.box.y)},${r2(a.box.w)},${r2(a.box.h)}`;

function requireOptions(o) {
  const need = ["minPerClassBucket", "nearDuplicateIou", "repetitionShare"];
  for (const k of need) if (!finite(o?.[k])) throw new Error(`dataset gate: option ${k} must be stated (no default is invented)`);
  if (!Array.isArray(o.classes) || o.classes.length === 0) throw new Error("dataset gate: option classes must list the dataset's classes");
}

/**
 * Run every check. Returns `{ checks: [{ id, status, ... }], pass }`; status is PASS, FAIL, or
 * NOT_APPLICABLE (G3 when no annotation carries a hit-test validity).
 *
 * @param options.classes            the classes the dataset is meant to cover
 * @param options.minPerClassBucket  minimum HIT_TESTABLE (or VISIBLE, if no validity) examples per class per size bucket
 * @param options.nearDuplicateIou   same-class pairs in one sample at or above this IoU are near-duplicates
 * @param options.repetitionShare    a (class, box) in at least this share of a split's samples is suspicious
 */
export function runDatasetGate(dataset, options) {
  requireOptions(options);
  const samples = dataset.samples;
  const checks = [];

  // G1 — every box finite and positive.
  const degenerate = [];
  for (const s of samples) for (const a of s.annotations) {
    const b = a.box;
    if (![b?.x, b?.y, b?.w, b?.h].every(finite) || b.w <= 0 || b.h <= 0) degenerate.push(a.id);
  }
  checks.push({ id: "G1_NON_DEGENERATE", status: degenerate.length ? "FAIL" : "PASS", failing: degenerate.length });

  // G2 — the stated visibility is what the geometry says.
  let mismatched = 0;
  for (const s of samples) for (const a of s.annotations) {
    if (degenerate.includes(a.id)) continue;
    if (geometricVisibility(a.box, s.viewportCss) !== a.visibility) mismatched += 1;
  }
  checks.push({ id: "G2_VISIBILITY_MATCHES_GEOMETRY", status: mismatched ? "FAIL" : "PASS", failing: mismatched });

  // G3 — a label the dataset calls VISIBLE must be observable by the hit-test classification.
  const withValidity = samples.flatMap((s) => s.annotations).filter((a) => typeof a.validity === "string");
  if (withValidity.length === 0) {
    checks.push({ id: "G3_LABEL_OBSERVABLE", status: "NOT_APPLICABLE", reason: "no annotation carries a hit-test validity" });
  } else {
    const byValidity = {};
    let visibleNotHitTestable = 0;
    let visibleFullyOccluded = 0;
    for (const a of withValidity) {
      byValidity[a.validity] = (byValidity[a.validity] ?? 0) + 1;
      if (a.visibility === "VISIBLE" && a.validity !== "HIT_TESTABLE") visibleNotHitTestable += 1;
      if (a.visibility === "VISIBLE" && a.validity === "FULLY_OCCLUDED") visibleFullyOccluded += 1;
    }
    checks.push({
      id: "G3_LABEL_OBSERVABLE",
      status: visibleNotHitTestable ? "FAIL" : "PASS",
      visibleNotHitTestable,
      visibleFullyOccluded,
      byValidity,
    });
  }

  // G4 — examples per class per size bucket, per split, among observable labels.
  const observable = (a) => (typeof a.validity === "string" ? a.validity === "HIT_TESTABLE" : a.visibility === "VISIBLE");
  const coverage = {};
  for (const s of samples) {
    const split = (coverage[s.split] ??= {});
    for (const a of s.annotations) {
      if (!observable(a) || degenerate.includes(a.id)) continue;
      const bucket = bucketOf(modelBoxOf(a.box, s.viewportCss)) ?? "unbucketed";
      const cls = (split[a.cls] ??= Object.fromEntries(BUCKETS.map((b) => [b.id, 0])));
      cls[bucket] = (cls[bucket] ?? 0) + 1;
    }
  }
  const gaps = [];
  for (const [split, byCls] of Object.entries(coverage)) {
    for (const cls of options.classes) {
      for (const b of BUCKETS) {
        const n = byCls[cls]?.[b.id] ?? 0;
        if (n < options.minPerClassBucket) gaps.push({ split, cls, bucket: b.id, count: n });
      }
    }
  }
  checks.push({ id: "G4_CLASS_SIZE_COVERAGE", status: gaps.length ? "FAIL" : "PASS", minPerClassBucket: options.minPerClassBucket, gaps: gaps.length, coverage });

  // G5 — exact and near-duplicate annotations within one sample.
  let exact = 0;
  let near = 0;
  for (const s of samples) {
    const anns = s.annotations.filter((a) => !degenerate.includes(a.id));
    for (let i = 0; i < anns.length; i += 1) {
      for (let j = i + 1; j < anns.length; j += 1) {
        if (anns[i].cls !== anns[j].cls) continue;
        if (boxKey(anns[i]) === boxKey(anns[j])) exact += 1;
        else if (iou(anns[i].box, anns[j].box) >= options.nearDuplicateIou) near += 1;
      }
    }
  }
  checks.push({ id: "G5_DUPLICATES", status: exact || near ? "FAIL" : "PASS", exactPairs: exact, nearPairs: near, nearDuplicateIou: options.nearDuplicateIou });

  // G6 — the same (class, box) recurring across a split's samples, as a hidden fixed element would.
  const repeated = [];
  const bySplit = {};
  for (const s of samples) (bySplit[s.split] ??= []).push(s);
  for (const [split, list] of Object.entries(bySplit)) {
    const counts = new Map();
    for (const s of list) for (const k of new Set(s.annotations.map(boxKey))) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [k, n] of counts) {
      const share = n / list.length;
      // Repetition means recurring: a box in one sample is never flagged, whatever share that is.
      if (n >= 2 && share >= options.repetitionShare) repeated.push({ split, cls: k.split("@")[0], share: r2(share), samples: n });
    }
  }
  checks.push({ id: "G6_SUSPICIOUS_REPETITION", status: repeated.length ? "FAIL" : "PASS", repetitionShare: options.repetitionShare, repeated });

  // G7 — split integrity: unique ids, no seed in two splits, no identical layout in two splits.
  const ids = new Set();
  let duplicateIds = 0;
  const seedSplits = new Map();
  const layoutSplits = new Map();
  for (const s of samples) {
    if (ids.has(s.id)) duplicateIds += 1;
    ids.add(s.id);
    if (s.seed !== undefined) (seedSplits.get(s.seed) ?? seedSplits.set(s.seed, new Set()).get(s.seed)).add(s.split);
    const layout = s.annotations.map(boxKey).sort().join("|");
    (layoutSplits.get(layout) ?? layoutSplits.set(layout, new Set()).get(layout)).add(s.split);
  }
  const seedsAcrossSplits = [...seedSplits.values()].filter((v) => v.size > 1).length;
  const layoutsAcrossSplits = [...layoutSplits.values()].filter((v) => v.size > 1).length;
  checks.push({
    id: "G7_SPLIT_INTEGRITY",
    status: duplicateIds || seedsAcrossSplits || layoutsAcrossSplits ? "FAIL" : "PASS",
    duplicateIds,
    seedsAcrossSplits,
    layoutsAcrossSplits,
    splits: Object.fromEntries(Object.entries(bySplit).map(([k, v]) => [k, v.length])),
  });

  return { checks, pass: checks.every((c) => c.status !== "FAIL") };
}

/** Descriptive statistics: counts, sizes and aspect ratios by class. Counts and numbers only. */
export function describeDataset(dataset) {
  const out = {};
  for (const s of dataset.samples) {
    for (const a of s.annotations) {
      const d = ((out[s.split] ??= {})[a.cls] ??= { all: 0, byVisibility: {}, w: [], h: [], aspect: [], shorterSideModelPx: [] });
      d.all += 1;
      d.byVisibility[a.visibility] = (d.byVisibility[a.visibility] ?? 0) + 1;
      if (a.visibility === "OFFSCREEN" || !(a.box.w > 0 && a.box.h > 0)) continue;
      d.w.push(a.box.w);
      d.h.push(a.box.h);
      d.aspect.push(a.box.w / a.box.h);
      const m = modelBoxOf(a.box, s.viewportCss);
      d.shorterSideModelPx.push(Math.min(m.w, m.h));
    }
  }
  const q = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const at = (p) => (s.length ? r2(s[Math.ceil(p * s.length) - 1]) : null);
    return { n: s.length, min: s.length ? r2(s[0]) : null, p50: at(0.5), max: s.length ? r2(s[s.length - 1]) : null };
  };
  for (const split of Object.values(out)) for (const d of Object.values(split)) {
    d.w = q(d.w);
    d.h = q(d.h);
    d.aspect = q(d.aspect);
    d.shorterSideModelPx = q(d.shorterSideModelPx);
  }
  return out;
}
