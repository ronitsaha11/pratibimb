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
 * M22.2 adds G8 (source-to-render consistency: the rendered box against the declared source box,
 * and no declared position ignored by the browser) and G9 (occlusion labels: a positive training
 * label must be HIT_TESTABLE and intended as a positive). Both apply only to annotations that
 * carry the fields they need (`source`, `positive` / `intent`), and say NOT_APPLICABLE otherwise.
 *
 * M22.2 hardening (after the architecture review's six false passes):
 *   - `requiredChecks` and `expectedSplits` are REQUIRED. A required check that is NOT_APPLICABLE fails
 *     the gate; an expected split that is absent fails G4 and G7.
 *   - G3, G8 and G9 FAIL on a partially populated annotation set rather than skipping the rest.
 *   - G9 checks a declared occlusion against what was observed, not just its metadata.
 *   - G8 requires `computedPosition === "absolute"`.
 *   - `minPerClassBucket` must be an integer of at least 1.
 * M22.3: `minPerClassBucket` may instead be one such integer PER EXPECTED SPLIT, `{ train: n, dev: m }`,
 * so each split can be held to its own quota. It must name exactly the expected splits.
 * Older records stay valid under their own schema: M22.1's recipe audit requires G1–G7
 * (`REQUIRED_CHECKS_V1_RECIPE_AUDIT`), so its G8 and G9 may be NOT_APPLICABLE; a v2 dataset requires
 * all nine (`REQUIRED_CHECKS_V2`).
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
  "G8_SOURCE_RENDER_CONSISTENCY",
  "G9_OCCLUSION_LABELS",
]);

/** The checks M22.1's recipe audit (v1 labels: validity, no source or intent) must pass. */
export const REQUIRED_CHECKS_V1_RECIPE_AUDIT = Object.freeze(GATE_CHECKS.slice(0, 7));
/** The checks a v2 dataset must pass: all of them, none NOT_APPLICABLE. */
export const REQUIRED_CHECKS_V2 = Object.freeze([...GATE_CHECKS]);

const INTENT_VALIDITY = Object.freeze({ positive: "HIT_TESTABLE", "occlusion-partial": "PARTIALLY_OCCLUDED", "occlusion-full": "FULLY_OCCLUDED" });

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
  for (const k of ["nearDuplicateIou", "repetitionShare"]) if (!finite(o?.[k])) throw new Error(`dataset gate: option ${k} must be stated (no default is invented)`);
  if (o?.minPerClassBucket === undefined) throw new Error("dataset gate: option minPerClassBucket must be stated (no default is invented)");
  const isMin = (n) => Number.isInteger(n) && n >= 1;
  const perSplit = o.minPerClassBucket !== null && typeof o.minPerClassBucket === "object";
  if (!perSplit && !isMin(o.minPerClassBucket)) {
    throw new Error("dataset gate: minPerClassBucket must be an integer of at least 1 (0 would accept an empty dataset)");
  }
  if (!Array.isArray(o.classes) || o.classes.length === 0) throw new Error("dataset gate: option classes must list the dataset's classes");
  if (!Array.isArray(o.expectedSplits) || o.expectedSplits.length === 0 || o.expectedSplits.some((x) => typeof x !== "string")) {
    throw new Error("dataset gate: option expectedSplits must list the splits the dataset must contain");
  }
  if (!Array.isArray(o.requiredChecks) || o.requiredChecks.length === 0 || o.requiredChecks.some((c) => !GATE_CHECKS.includes(c))) {
    throw new Error(`dataset gate: option requiredChecks must list checks from ${GATE_CHECKS.join(", ")}`);
  }
  if (perSplit) {
    const keys = Object.keys(o.minPerClassBucket).sort();
    if (keys.join() !== [...o.expectedSplits].sort().join() || !Object.values(o.minPerClassBucket).every(isMin)) {
      throw new Error("dataset gate: a per-split minPerClassBucket must give an integer of at least 1 for exactly the expected splits");
    }
  }
}

/** The G4 minimum for one split: the single integer, or that split's own. */
const minFor = (o, split) => (typeof o.minPerClassBucket === "number" ? o.minPerClassBucket : o.minPerClassBucket[split]);

/** Among `list`, how many carry the field(s) `has` tests for: none, some (incomplete), or all. */
function population(list, has) {
  const n = list.filter(has).length;
  return { n, total: list.length, state: n === 0 ? "NONE" : n === list.length ? "ALL" : "PARTIAL" };
}

/**
 * Run every check. Returns `{ checks: [{ id, status, ... }], pass }`; status is PASS, FAIL, or
 * NOT_APPLICABLE (G3 when no annotation carries a hit-test validity).
 *
 * @param options.classes            the classes the dataset is meant to cover
 * @param options.minPerClassBucket  minimum HIT_TESTABLE (or VISIBLE, if no validity) examples per class per size bucket;
 *                                   one integer, or `{ [split]: integer }` for exactly the expected splits
 * @param options.nearDuplicateIou   same-class pairs in one sample at or above this IoU are near-duplicates
 * @param options.repetitionShare    a (class, box) in at least this share of a split's samples is suspicious
 * @param options.sourceTolerancePx  G8 only, required when any annotation carries `source`: the largest
 *                                   allowed |rendered − declared| on any box edge, CSS px
 * @param options.expectedSplits     the splits the dataset must contain, e.g. ["train", "dev"]
 * @param options.requiredChecks     checks that must be applicable; NOT_APPLICABLE on one fails the gate
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
  // A LABELLED occlusion case (`intent` "occlusion-…") is occluded on purpose; G9 checks those. G3
  // is about occlusion nobody declared.
  // An incomplete set (some annotations with a validity, some without) is a FAIL, never a skip.
  const declaredOcclusion = (a) => typeof a.intent === "string" && a.intent.startsWith("occlusion-");
  const g3pop = population(samples.flatMap((s) => s.annotations), (a) => typeof a.validity === "string");
  const withValidity = samples.flatMap((s) => s.annotations).filter((a) => typeof a.validity === "string" && !declaredOcclusion(a));
  if (g3pop.state === "NONE") {
    checks.push({ id: "G3_LABEL_OBSERVABLE", status: "NOT_APPLICABLE", reason: "no annotation carries a hit-test validity" });
  } else if (g3pop.state === "PARTIAL") {
    checks.push({ id: "G3_LABEL_OBSERVABLE", status: "FAIL", reason: "incomplete: some annotations carry no hit-test validity", missingValidity: g3pop.total - g3pop.n });
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
  const observable = (a) =>
    typeof a.positive === "boolean" ? a.positive : typeof a.validity === "string" ? a.validity === "HIT_TESTABLE" : a.visibility === "VISIBLE";
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
  // Every EXPECTED split is checked, present or not: an absent split is all gaps, not "no gaps".
  for (const split of options.expectedSplits) {
    const byCls = coverage[split] ?? {};
    for (const cls of options.classes) {
      for (const b of BUCKETS) {
        const n = byCls[cls]?.[b.id] ?? 0;
        if (n < minFor(options, split)) gaps.push({ split, cls, bucket: b.id, count: n, minimum: minFor(options, split) });
      }
    }
  }
  checks.push({ id: "G4_CLASS_SIZE_COVERAGE", status: gaps.length ? "FAIL" : "PASS", minPerClassBucket: typeof options.minPerClassBucket === "number" ? options.minPerClassBucket : { ...options.minPerClassBucket }, gaps: gaps.length, coverage });

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
  const missingSplits = options.expectedSplits.filter((x) => !(x in bySplit));
  const unexpectedSplits = Object.keys(bySplit).filter((x) => !options.expectedSplits.includes(x));
  checks.push({
    id: "G7_SPLIT_INTEGRITY",
    status: duplicateIds || seedsAcrossSplits || layoutsAcrossSplits || missingSplits.length || unexpectedSplits.length ? "FAIL" : "PASS",
    duplicateIds,
    seedsAcrossSplits,
    layoutsAcrossSplits,
    missingSplits,
    unexpectedSplits,
    splits: Object.fromEntries(Object.entries(bySplit).map(([k, v]) => [k, v.length])),
  });

  // G8 — the label is where the source put it, and the browser honoured the declared position.
  const g8pop = population(samples.flatMap((s) => s.annotations), (a) => Boolean(a.source && a.source.declared));
  const sourced = samples.flatMap((s) => s.annotations).filter((a) => a.source && a.source.declared);
  if (g8pop.state === "NONE") {
    checks.push({ id: "G8_SOURCE_RENDER_CONSISTENCY", status: "NOT_APPLICABLE", reason: "no annotation carries a declared source box" });
  } else if (g8pop.state === "PARTIAL") {
    checks.push({ id: "G8_SOURCE_RENDER_CONSISTENCY", status: "FAIL", reason: "incomplete: some annotations carry no declared source box", missingSource: g8pop.total - g8pop.n });
  } else {
    if (!finite(options.sourceTolerancePx) || options.sourceTolerancePx < 0) {
      throw new Error("dataset gate: option sourceTolerancePx must be stated for G8 (no default is invented)");
    }
    let displaced = 0;
    let positionIgnored = 0;
    let worst = 0;
    for (const a of sourced) {
      const d = a.source.declared;
      const delta = Math.max(Math.abs(a.box.x - d.x), Math.abs(a.box.y - d.y), Math.abs(a.box.x + a.box.w - (d.x + d.w)), Math.abs(a.box.y + a.box.h - (d.y + d.h)));
      worst = Math.max(worst, delta);
      if (!(delta <= options.sourceTolerancePx)) displaced += 1;
      // Exactly `absolute`, the v2 contract — not merely "not static".
      if (a.source.computedPosition !== "absolute") positionIgnored += 1;
    }
    checks.push({
      id: "G8_SOURCE_RENDER_CONSISTENCY",
      status: displaced || positionIgnored ? "FAIL" : "PASS",
      sourceTolerancePx: options.sourceTolerancePx,
      checked: sourced.length,
      displaced,
      positionIgnored,
      worstEdgeDeltaPx: r2(worst),
    });
  }

  // G9 — a positive training label is HIT_TESTABLE and intended; an occlusion case is never positive.
  // Applicable when any annotation carries a positive flag; then EVERY annotation must carry the
  // flag, an intent and a validity, and every declared intent must match what was observed.
  const all9 = samples.flatMap((s) => s.annotations);
  const g9pop = population(all9, (a) => typeof a.positive === "boolean");
  const complete9 = (a) => typeof a.positive === "boolean" && typeof a.intent === "string" && typeof a.validity === "string";
  if (g9pop.state === "NONE") {
    checks.push({ id: "G9_OCCLUSION_LABELS", status: "NOT_APPLICABLE", reason: "no annotation carries a positive flag" });
  } else if (!all9.every(complete9)) {
    checks.push({ id: "G9_OCCLUSION_LABELS", status: "FAIL", reason: "incomplete: some annotations lack positive, intent or validity", incomplete: all9.filter((a) => !complete9(a)).length });
  } else {
    let positiveNotHitTestable = 0;
    let positiveOcclusionCase = 0;
    let intendedPositiveNotHitTestable = 0;
    let declaredOcclusionNotObserved = 0;
    let unknownIntent = 0;
    let positiveFlagInconsistent = 0;
    const byIntent = {};
    for (const a of all9) {
      byIntent[a.intent] = (byIntent[a.intent] ?? 0) + 1;
      const expected = INTENT_VALIDITY[a.intent];
      if (expected === undefined) unknownIntent += 1;
      if (a.positive && a.validity !== "HIT_TESTABLE") positiveNotHitTestable += 1;
      if (a.positive && a.intent !== "positive") positiveOcclusionCase += 1;
      if (a.intent === "positive" && a.validity !== "HIT_TESTABLE") intendedPositiveNotHitTestable += 1;
      // A declared occlusion passes only when it was OBSERVED as that occlusion, not because it says so.
      if (a.intent !== "positive" && expected !== undefined && a.validity !== expected) declaredOcclusionNotObserved += 1;
      if (a.positive !== (a.intent === "positive" && a.validity === "HIT_TESTABLE")) positiveFlagInconsistent += 1;
    }
    const failing = positiveNotHitTestable + positiveOcclusionCase + intendedPositiveNotHitTestable + declaredOcclusionNotObserved + unknownIntent + positiveFlagInconsistent;
    checks.push({
      id: "G9_OCCLUSION_LABELS",
      status: failing ? "FAIL" : "PASS",
      positives: all9.filter((a) => a.positive).length,
      positiveNotHitTestable,
      positiveOcclusionCase,
      intendedPositiveNotHitTestable,
      declaredOcclusionNotObserved,
      unknownIntent,
      positiveFlagInconsistent,
      byIntent,
    });
  }

  // A required check that could not be applied is a failure of the gate, not a pass.
  const requiredNotApplicable = checks.filter((c) => options.requiredChecks.includes(c.id) && c.status === "NOT_APPLICABLE").map((c) => c.id);
  return {
    checks,
    requiredChecks: [...options.requiredChecks],
    requiredNotApplicable,
    expectedSplits: [...options.expectedSplits],
    pass: checks.every((c) => c.status !== "FAIL") && requiredNotApplicable.length === 0,
  };
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
