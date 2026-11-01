import { describe, expect, it } from "vitest";
import {
  GATE_CHECKS,
  REQUIRED_CHECKS_V1_RECIPE_AUDIT,
  REQUIRED_CHECKS_V2,
  describeDataset,
  geometricVisibility,
  modelBoxOf,
  runDatasetGate,
} from "./dataset-quality-gate.mjs";

const V = { w: 1280, h: 720 };
const ann = (id, cls, x, y, w, h, extra = {}) => ({ id, cls, box: { x, y, w, h }, visibility: geometricVisibility({ x, y, w, h }, V), ...extra });
const sample = (id, split, annotations, seed) => ({ id, split, seed, viewportCss: V, annotations });
/** The geometry-only checks: what a dataset with no hit-test, source or intent fields can satisfy. */
const GEOMETRY_ONLY = ["G1_NON_DEGENERATE", "G2_VISIBILITY_MATCHES_GEOMETRY", "G4_CLASS_SIZE_COVERAGE", "G5_DUPLICATES", "G6_SUSPICIOUS_REPETITION", "G7_SPLIT_INTEGRITY"];
const OPTS = { classes: ["button", "icon"], minPerClassBucket: 1, nearDuplicateIou: 0.9, repetitionShare: 0.5, expectedSplits: ["train", "dev"], requiredChecks: GEOMETRY_ONLY };
const check = (r, id) => r.checks.find((c) => c.id === id);

/** One clean sample: a button and an icon in every size bucket (model scale 0.5 at 1280×720). */
function clean(id, split, dx, seed) {
  return sample(id, split, [
    ann(`${id}-1`, "button", 10 + dx, 10, 40, 12), // 6 model px
    ann(`${id}-2`, "button", 100 + dx, 10, 80, 20), // 10
    ann(`${id}-3`, "button", 200 + dx, 10, 120, 40), // 20
    ann(`${id}-4`, "button", 400 + dx, 10, 200, 80), // 40
    ann(`${id}-5`, "icon", 10 + dx, 200, 12, 12),
    ann(`${id}-6`, "icon", 100 + dx, 200, 20, 20),
    ann(`${id}-7`, "icon", 200 + dx, 200, 40, 40),
    ann(`${id}-8`, "icon", 400 + dx, 200, 80, 80),
  ], seed);
}

describe("M22.1 dataset gate — a clean dataset passes every check", () => {
  it("names exactly its nine checks", () => {
    expect(GATE_CHECKS).toHaveLength(9);
  });
  it("PASS on varied, observable, split-clean data", () => {
    const ds = { samples: [clean("t0", "train", 0, 1), clean("t1", "train", 7, 2), clean("d0", "dev", 13, 3)] };
    const r = runDatasetGate(ds, OPTS);
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["G1_NON_DEGENERATE", "PASS"],
      ["G2_VISIBILITY_MATCHES_GEOMETRY", "PASS"],
      ["G3_LABEL_OBSERVABLE", "NOT_APPLICABLE"],
      ["G4_CLASS_SIZE_COVERAGE", "PASS"],
      ["G5_DUPLICATES", "PASS"],
      ["G6_SUSPICIOUS_REPETITION", "PASS"],
      ["G7_SPLIT_INTEGRITY", "PASS"],
      ["G8_SOURCE_RENDER_CONSISTENCY", "NOT_APPLICABLE"],
      ["G9_OCCLUSION_LABELS", "NOT_APPLICABLE"],
    ]);
    expect(r.pass).toBe(true);
  });
  it("refuses to run without stated thresholds", () => {
    expect(() => runDatasetGate({ samples: [] }, { classes: ["button"] })).toThrow(/must be stated/);
    expect(() => runDatasetGate({ samples: [] }, { ...OPTS, classes: [] })).toThrow();
  });
});

describe("M22.1 dataset gate — each check fails on its defect", () => {
  it("G1: a zero, negative or non-finite box", () => {
    const ds = { samples: [sample("a", "train", [ann("x", "button", 0, 0, 0, 10), ann("y", "button", 0, 0, 10, -1), { id: "z", cls: "button", box: { x: Number.NaN, y: 0, w: 1, h: 1 }, visibility: "VISIBLE" }])] };
    expect(check(runDatasetGate(ds, OPTS), "G1_NON_DEGENERATE")).toMatchObject({ status: "FAIL", failing: 3 });
  });

  it("G2: a stated visibility the geometry contradicts", () => {
    const wrong = { ...ann("x", "button", 1270, 10, 40, 10), visibility: "VISIBLE" }; // actually CLIPPED
    expect(check(runDatasetGate({ samples: [sample("a", "train", [wrong])] }, OPTS), "G2_VISIBILITY_MATCHES_GEOMETRY").status).toBe("FAIL");
  });

  it("G3: a VISIBLE label that the hit test finds occluded", () => {
    const ds = { samples: [sample("a", "train", [ann("x", "icon", 0, 0, 22, 22, { validity: "FULLY_OCCLUDED" }), ann("y", "button", 50, 50, 80, 20, { validity: "HIT_TESTABLE" })])] };
    expect(check(runDatasetGate(ds, OPTS), "G3_LABEL_OBSERVABLE")).toMatchObject({ status: "FAIL", visibleNotHitTestable: 1, visibleFullyOccluded: 1 });
  });

  it("G4: a class with no observable example in a bucket, and occluded labels do not count", () => {
    const ds = { samples: [sample("a", "train", [ann("x", "button", 50, 50, 80, 20, { validity: "HIT_TESTABLE" }), ann("y", "icon", 0, 0, 22, 22, { validity: "FULLY_OCCLUDED" })])] };
    const g4 = check(runDatasetGate(ds, { ...OPTS, expectedSplits: ["train"] }), "G4_CLASS_SIZE_COVERAGE");
    expect(g4.status).toBe("FAIL");
    expect(g4.coverage.train.icon).toBeUndefined();
    expect(g4.gaps).toBe(7); // button has 1 of 4 buckets, icon none
  });

  it("G5: exact and near-duplicate same-class boxes in one sample; different classes are not duplicates", () => {
    const ds = { samples: [sample("a", "train", [ann("1", "button", 10, 10, 100, 20), ann("2", "button", 10, 10, 100, 20), ann("3", "button", 11, 10, 100, 20), ann("4", "icon", 10, 10, 100, 20)])] };
    const g5 = check(runDatasetGate(ds, OPTS), "G5_DUPLICATES");
    expect(g5).toMatchObject({ status: "FAIL", exactPairs: 1 });
    expect(g5.nearPairs).toBe(2);
  });

  it("G6: the same (class, box) in every sample — the hidden-icon pattern", () => {
    const ds = { samples: [0, 1, 2, 3].map((i) => sample(`s${i}`, "train", [ann(`s${i}-ic`, "icon", 0, 0, 22, 22), ann(`s${i}-b`, "button", 30 + i * 9, 300, 90, 30)])) };
    const g6 = check(runDatasetGate(ds, OPTS), "G6_SUSPICIOUS_REPETITION");
    expect(g6.status).toBe("FAIL");
    expect(g6.repeated).toEqual([{ split: "train", cls: "icon", share: 1, samples: 4 }]);
  });

  it("G6: a box in only one sample is never repetition, even when that is half a two-sample split", () => {
    const ds = { samples: [clean("t0", "train", 0, 1), clean("t1", "train", 7, 2)] };
    expect(check(runDatasetGate(ds, OPTS), "G6_SUSPICIOUS_REPETITION")).toMatchObject({ status: "PASS", repeated: [] });
  });

  it("G7: a duplicate id, a seed in two splits, and the same layout in two splits", () => {
    const a = clean("x", "train", 0, 5);
    const ds = { samples: [a, { ...clean("x", "dev", 0, 5) }] };
    const g7 = check(runDatasetGate(ds, OPTS), "G7_SPLIT_INTEGRITY");
    expect(g7).toMatchObject({ status: "FAIL", duplicateIds: 1, seedsAcrossSplits: 1, layoutsAcrossSplits: 1 });
  });
});

describe("M22.1 dataset description", () => {
  it("summarises sizes in CSS and model px, skipping offscreen", () => {
    const d = describeDataset({ samples: [sample("a", "train", [ann("1", "button", 0, 0, 100, 20), ann("2", "button", 0, 900, 100, 20)])] });
    expect(d.train.button.all).toBe(2);
    expect(d.train.button.byVisibility).toEqual({ VISIBLE: 1, OFFSCREEN: 1 });
    expect(d.train.button.w).toEqual({ n: 1, min: 100, p50: 100, max: 100 });
    expect(d.train.button.shorterSideModelPx.p50).toBe(10);
    expect(modelBoxOf({ x: 0, y: 0, w: 1280, h: 720 }, V)).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });
  it("returns numbers and counts only", () => {
    const d = describeDataset({ samples: [clean("t0", "train", 0, 1)] });
    expect(JSON.stringify(d)).not.toMatch(/"x"|"y"|"box"|"id"/);
  });
});

describe("M22.2 G8 — source-to-render consistency", () => {
  const sourced = (box, declared, computedPosition = "absolute") => ({ ...ann("x", "icon", box.x, box.y, box.w, box.h), source: { declared, computedPosition } });
  const ds = (a) => ({ samples: [sample("s", "train", [a])] });
  const G8 = { ...OPTS, sourceTolerancePx: 0.5 };

  it("PASS when the rendered box is the declared one, within the stated tolerance", () => {
    const r = check(runDatasetGate(ds(sourced({ x: 900, y: 100, w: 30, h: 30 }, { x: 900.3, y: 100, w: 30, h: 30 })), G8), "G8_SOURCE_RENDER_CONSISTENCY");
    expect(r).toMatchObject({ status: "PASS", checked: 1, displaced: 0, positionIgnored: 0 });
  });
  it("FAIL when the browser placed it elsewhere — v1's icon: declared top-right, rendered at the origin", () => {
    const r = check(runDatasetGate(ds(sourced({ x: 0, y: 0, w: 22, h: 22 }, { x: 1232, y: 14, w: 22, h: 22 }, "static")), G8), "G8_SOURCE_RENDER_CONSISTENCY");
    expect(r).toMatchObject({ status: "FAIL", displaced: 1, positionIgnored: 1, worstEdgeDeltaPx: 1232 });
  });
  it("FAIL on an ignored declared position even when the box happens to coincide", () => {
    const r = check(runDatasetGate(ds(sourced({ x: 0, y: 0, w: 22, h: 22 }, { x: 0, y: 0, w: 22, h: 22 }, "static")), G8), "G8_SOURCE_RENDER_CONSISTENCY");
    expect(r).toMatchObject({ status: "FAIL", displaced: 0, positionIgnored: 1 });
  });
  it("refuses to run G8 without a stated tolerance", () => {
    expect(() => runDatasetGate(ds(sourced({ x: 1, y: 1, w: 5, h: 5 }, { x: 1, y: 1, w: 5, h: 5 })), OPTS)).toThrow(/sourceTolerancePx/);
  });
});

describe("M22.2 G9 — occlusion labels", () => {
  const flagged = (id, validity, intent, positive) => ({ ...ann(id, "button", 50, 50, 80, 20), validity, intent, positive });
  const G9 = (anns) => check(runDatasetGate({ samples: [sample("s", "train", anns)] }, OPTS), "G9_OCCLUSION_LABELS");

  it("PASS: positives are HIT_TESTABLE intended positives; occlusion cases are not positive", () => {
    expect(G9([flagged("a", "HIT_TESTABLE", "positive", true), flagged("b", "FULLY_OCCLUDED", "occlusion-full", false), flagged("c", "PARTIALLY_OCCLUDED", "occlusion-partial", false)])).toMatchObject({ status: "PASS", positives: 1 });
  });
  it("FAIL: a positive that is not HIT_TESTABLE", () => {
    expect(G9([flagged("a", "FULLY_OCCLUDED", "positive", true)])).toMatchObject({ status: "FAIL", positiveNotHitTestable: 1 });
  });
  it("FAIL: an occlusion case marked positive", () => {
    expect(G9([flagged("a", "HIT_TESTABLE", "occlusion-partial", true)])).toMatchObject({ status: "FAIL", positiveOcclusionCase: 1 });
  });
  it("FAIL: an intended positive the hit test found occluded (accidental occlusion)", () => {
    expect(G9([flagged("a", "PARTIALLY_OCCLUDED", "positive", false)])).toMatchObject({ status: "FAIL", intendedPositiveNotHitTestable: 1 });
  });
});

describe("M22.2 hardening — the six false passes the architecture review found now fail", () => {
  // Train and dev differ in layout (y 100 vs 300) so G7 does not mask the effect under test.
  const Y = (sid) => (sid.startsWith("d") ? 300 : 100);
  const sides = [12, 20, 40, 80]; // one per size bucket at scale 0.5
  const v2f = (k, sid) => ({
    validity: "HIT_TESTABLE",
    intent: "positive",
    positive: true,
    source: { declared: { x: 40 + k * 200, y: Y(sid), w: sides[k] * 3, h: sides[k] }, computedPosition: "absolute" },
  });
  const four = (sid, extra = () => ({})) => sides.map((s, k) => ann(`${sid}-${k}`, "button", 40 + k * 200, Y(sid), s * 3, s, extra(k, sid)));
  const V2 = { classes: ["button"], minPerClassBucket: 1, nearDuplicateIou: 0.9, repetitionShare: 0.5, sourceTolerancePx: 0, expectedSplits: ["train", "dev"], requiredChecks: REQUIRED_CHECKS_V2 };
  const good = () => [sample("t0", "train", four("t0", v2f), 1), sample("d0", "dev", four("d0", v2f), 2)];

  it("control: a complete, correct v2 dataset passes, with every required check applicable", () => {
    const r = runDatasetGate({ samples: good() }, V2);
    expect(r.pass).toBe(true);
    expect(r.requiredNotApplicable).toEqual([]);
    expect(r.checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("A — no validity, source or positive fields: required G3, G8 and G9 are NOT_APPLICABLE, so the gate FAILS", () => {
    const r = runDatasetGate({ samples: [sample("t0", "train", four("t0"), 1), sample("d0", "dev", four("d0"), 2)] }, V2);
    expect(r.pass).toBe(false);
    expect(r.requiredNotApplicable).toEqual(["G3_LABEL_OBSERVABLE", "G8_SOURCE_RENDER_CONSISTENCY", "G9_OCCLUSION_LABELS"]);
    // Each check's own status stays visible: NOT_APPLICABLE, not rewritten as FAIL.
    expect(check(r, "G8_SOURCE_RENDER_CONSISTENCY").status).toBe("NOT_APPLICABLE");
  });

  it("B — v2 fields on only some annotations: G3, G8 and G9 FAIL as incomplete", () => {
    const partial = [sample("t0", "train", four("t0", (k, sid) => (k === 0 ? v2f(k, sid) : {})), 1), sample("d0", "dev", four("d0", v2f), 2)];
    const r = runDatasetGate({ samples: partial }, V2);
    expect(r.pass).toBe(false);
    expect(check(r, "G3_LABEL_OBSERVABLE")).toMatchObject({ status: "FAIL", missingValidity: 3 });
    expect(check(r, "G8_SOURCE_RENDER_CONSISTENCY")).toMatchObject({ status: "FAIL", missingSource: 3 });
    expect(check(r, "G9_OCCLUSION_LABELS")).toMatchObject({ status: "FAIL", incomplete: 3 });
  });

  it("C — a declared full occlusion that rendered HIT_TESTABLE (occluder missing) FAILS G9", () => {
    const missingOccluder = ann("t0-x", "button", 40, 400, 60, 20, { validity: "HIT_TESTABLE", intent: "occlusion-full", positive: false, source: { declared: { x: 40, y: 400, w: 60, h: 20 }, computedPosition: "absolute" } });
    const ds = good();
    ds[0].annotations.push(missingOccluder);
    const r = runDatasetGate({ samples: ds }, V2);
    expect(r.pass).toBe(false);
    expect(check(r, "G9_OCCLUSION_LABELS")).toMatchObject({ status: "FAIL", declaredOcclusionNotObserved: 1 });
  });

  it("C' — a declared partial occlusion observed as FULLY_OCCLUDED also fails; a matching one passes", () => {
    const occ = (validity) => ann("t0-y", "button", 40, 400, 60, 20, { validity, intent: "occlusion-partial", positive: false, source: { declared: { x: 40, y: 400, w: 60, h: 20 }, computedPosition: "absolute" } });
    const ds1 = good();
    ds1[0].annotations.push(occ("FULLY_OCCLUDED"));
    expect(check(runDatasetGate({ samples: ds1 }, V2), "G9_OCCLUSION_LABELS").status).toBe("FAIL");
    const ds2 = good();
    ds2[0].annotations.push(occ("PARTIALLY_OCCLUDED"));
    expect(runDatasetGate({ samples: ds2 }, V2).pass).toBe(true);
  });

  it("D — an expected split absent entirely FAILS G4 and G7", () => {
    const r = runDatasetGate({ samples: [good()[0]] }, V2);
    expect(r.pass).toBe(false);
    expect(check(r, "G7_SPLIT_INTEGRITY")).toMatchObject({ status: "FAIL", missingSplits: ["dev"] });
    expect(check(r, "G4_CLASS_SIZE_COVERAGE")).toMatchObject({ status: "FAIL", gaps: 4 });
  });

  it("D' — a split the configuration did not expect FAILS G7", () => {
    const r = runDatasetGate({ samples: [...good(), sample("x0", "holdout", four("x0", v2f), 3)] }, V2);
    expect(check(r, "G7_SPLIT_INTEGRITY")).toMatchObject({ status: "FAIL", unexpectedSplits: ["holdout"] });
  });

  it("E — minPerClassBucket 0 (or fractional, or negative) is refused before any check runs", () => {
    for (const bad of [0, -1, 0.5]) expect(() => runDatasetGate({ samples: [] }, { ...V2, minPerClassBucket: bad })).toThrow(/at least 1/);
  });

  it("M22.3 — a per-split G4 minimum holds each split to its own count", () => {
    expect(runDatasetGate({ samples: good() }, { ...V2, minPerClassBucket: { train: 1, dev: 1 } }).pass).toBe(true);
    const g4 = check(runDatasetGate({ samples: good() }, { ...V2, minPerClassBucket: { train: 2, dev: 1 } }), "G4_CLASS_SIZE_COVERAGE");
    expect(g4).toMatchObject({ status: "FAIL", gaps: 4, minPerClassBucket: { train: 2, dev: 1 } }); // TRAIN's four buckets hold 1 each
  });

  it("M22.4 — G4 does not count a positive whose rendered box left its declared box, or that is not absolute", () => {
    for (const spoil of [(a) => (a.box = { ...a.box, x: a.box.x + 1 }), (a) => (a.source.computedPosition = "relative")]) {
      const ds = good();
      spoil(ds[0].annotations[0]);
      const g4 = check(runDatasetGate({ samples: ds }, V2), "G4_CLASS_SIZE_COVERAGE");
      expect(g4).toMatchObject({ status: "FAIL", gaps: 1, positivesExcludedForSource: 1 });
    }
    // Within the stated tolerance it still counts.
    const ds = good();
    ds[0].annotations[0].box = { ...ds[0].annotations[0].box, x: ds[0].annotations[0].box.x + 0.25 };
    expect(check(runDatasetGate({ samples: ds }, { ...V2, sourceTolerancePx: 0.5 }), "G4_CLASS_SIZE_COVERAGE")).toMatchObject({ status: "PASS", positivesExcludedForSource: 0 });
  });

  it("M22.3 — a per-split G4 minimum must name exactly the expected splits, each at least 1", () => {
    for (const bad of [{ train: 1 }, { train: 1, dev: 0 }, { train: 1, dev: 1, test: 1 }, { train: 1, dev: 1.5 }, null, "1"]) {
      expect(() => runDatasetGate({ samples: [] }, { ...V2, minPerClassBucket: bad })).toThrow(/minPerClassBucket/);
    }
  });

  it("F — computedPosition 'relative' (or 'fixed', or missing) FAILS G8; only 'absolute' passes", () => {
    for (const pos of ["relative", "fixed", "sticky", undefined]) {
      const ds = good();
      ds[0].annotations[0].source.computedPosition = pos;
      expect(check(runDatasetGate({ samples: ds }, V2), "G8_SOURCE_RENDER_CONSISTENCY")).toMatchObject({ status: "FAIL", positionIgnored: 1 });
    }
  });

  it("G9 also fails an unknown intent, and a positive flag that contradicts intent and validity", () => {
    const ds = good();
    ds[0].annotations[0].intent = "decoy";
    expect(check(runDatasetGate({ samples: ds }, V2), "G9_OCCLUSION_LABELS")).toMatchObject({ status: "FAIL", unknownIntent: 1 });
    const ds2 = good();
    ds2[0].annotations[1].positive = false; // intended positive, HIT_TESTABLE, but flagged non-positive
    expect(check(runDatasetGate({ samples: ds2 }, V2), "G9_OCCLUSION_LABELS")).toMatchObject({ status: "FAIL", positiveFlagInconsistent: 1 });
  });

  it("requiredChecks and expectedSplits are required options, with no default", () => {
    const { requiredChecks, ...noRequired } = V2;
    const { expectedSplits, ...noSplits } = V2;
    expect(() => runDatasetGate({ samples: [] }, noRequired)).toThrow(/requiredChecks/);
    expect(() => runDatasetGate({ samples: [] }, noSplits)).toThrow(/expectedSplits/);
    expect(() => runDatasetGate({ samples: [] }, { ...V2, requiredChecks: ["G99_IMAGINARY"] })).toThrow(/requiredChecks/);
  });

  it("M22.1 backward compatibility, made explicit: its schema requires G1–G7 only, so G8/G9 NOT_APPLICABLE is acceptable there", () => {
    expect(REQUIRED_CHECKS_V1_RECIPE_AUDIT).toEqual(GATE_CHECKS.slice(0, 7));
    const v1 = (sid, split, seed) => sample(sid, split, four(sid, () => ({ validity: "HIT_TESTABLE" })), seed);
    const r = runDatasetGate({ samples: [v1("t0", "train", 1), v1("d0", "dev", 2)] }, { ...V2, requiredChecks: REQUIRED_CHECKS_V1_RECIPE_AUDIT });
    expect(r.pass).toBe(true);
    expect(check(r, "G8_SOURCE_RENDER_CONSISTENCY").status).toBe("NOT_APPLICABLE");
    // The same data under the v2 schema fails, because v2 requires G8 and G9.
    expect(runDatasetGate({ samples: [v1("t0", "train", 1), v1("d0", "dev", 2)] }, V2).pass).toBe(false);
  });
});
