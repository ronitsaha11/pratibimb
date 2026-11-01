import { describe, expect, it } from "vitest";
import { GATE_CHECKS, describeDataset, geometricVisibility, modelBoxOf, runDatasetGate } from "./dataset-quality-gate.mjs";

const V = { w: 1280, h: 720 };
const ann = (id, cls, x, y, w, h, extra = {}) => ({ id, cls, box: { x, y, w, h }, visibility: geometricVisibility({ x, y, w, h }, V), ...extra });
const sample = (id, split, annotations, seed) => ({ id, split, seed, viewportCss: V, annotations });
const OPTS = { classes: ["button", "icon"], minPerClassBucket: 1, nearDuplicateIou: 0.9, repetitionShare: 0.5 };
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
    const g4 = check(runDatasetGate(ds, OPTS), "G4_CLASS_SIZE_COVERAGE");
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
