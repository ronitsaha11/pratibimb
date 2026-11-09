import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  PRIMARY_GRID,
  SENSITIVITY_GRID,
  classifyElement,
  gridPoints,
  hitMatches,
  occlusionCategory,
  samplingPlan,
  viewportIntersection,
} from "./fixture-validity.mjs";
import { matchLikeEvaluator, matchValidPopulation } from "./small-target-eval.mjs";

const V = { w: 100, h: 100 };
const box = (x, y, w, h) => ({ x, y, w, h });

/** Hits for a plan's points from a predicate over the point. */
function hitsFor(b, viewport, covered) {
  const plan = samplingPlan(b, viewport);
  return [plan.points5.map((p) => !covered(p)), plan.points9.map((p) => !covered(p))];
}
const classify = (b, covered = () => false, viewport = V) => classifyElement(b, viewport, ...hitsFor(b, viewport, covered));

describe("amendment 2 — the grids", () => {
  it("uses 5×5 as primary and 9×9 for sensitivity", () => {
    expect([PRIMARY_GRID, SENSITIVITY_GRID]).toEqual([5, 9]);
    expect(gridPoints(box(0, 0, 10, 10), 5)).toHaveLength(25);
    expect(gridPoints(box(0, 0, 10, 10), 9)).toHaveLength(81);
  });
  it("places points at cell centres, strictly inside the region", () => {
    const pts = gridPoints(box(10, 20, 50, 10), 5);
    expect(pts[0]).toEqual({ x: 15, y: 21 });
    expect(pts[24]).toEqual({ x: 55, y: 29 });
    for (const p of gridPoints(box(10, 20, 50, 10), 9)) {
      expect(p.x > 10 && p.x < 60 && p.y > 20 && p.y < 30).toBe(true);
    }
  });
  it("names exactly the six categories", () => {
    expect(CATEGORIES).toEqual(["HIT_TESTABLE", "PARTIALLY_OCCLUDED", "FULLY_OCCLUDED", "SAMPLING_SENSITIVE", "PARTIALLY_CLIPPED", "OFFSCREEN"]);
  });
});

describe("amendment 2 — classification", () => {
  it("HIT_TESTABLE: wholly inside and all 25 (and all 81) points hit", () => {
    const r = classify(box(10, 10, 40, 20));
    expect(r).toMatchObject({ category: "HIT_TESTABLE", primary: true, fraction5: 1, fraction9: 1 });
  });

  it("PARTIALLY_OCCLUDED: wholly inside, some points covered", () => {
    const r = classify(box(10, 10, 40, 20), (p) => p.x < 30); // left half covered
    expect(r.category).toBe("PARTIALLY_OCCLUDED");
    expect(r.primary).toBe(false);
    expect(r.fraction5).toBeGreaterThan(0);
    expect(r.fraction5).toBeLessThan(1);
  });

  it("FULLY_OCCLUDED: wholly inside, no point hits", () => {
    expect(classify(box(10, 10, 40, 20), () => true)).toMatchObject({ category: "FULLY_OCCLUDED", primary: false, fraction5: 0, fraction9: 0 });
  });

  it("PARTIALLY_CLIPPED: crosses the viewport edge; samples only the intersection; never primary", () => {
    const b = box(80, 90, 40, 20); // half outside on both axes
    const plan = samplingPlan(b, V);
    expect(plan.inside).toBe(false);
    expect(plan.region).toEqual(box(80, 90, 20, 10));
    for (const p of [...plan.points5, ...plan.points9]) expect(p.x < 100 && p.y < 100).toBe(true);
    const clean = classify(b);
    expect(clean).toMatchObject({ category: "PARTIALLY_CLIPPED", primary: false, fraction5: 1, fraction9: 1 });
    // Even fully hit-testable inside the viewport, it stays out of the primary population.
    const partlyCovered = classify(b, (p) => p.x > 90);
    expect(partlyCovered.category).toBe("PARTIALLY_CLIPPED");
    expect(partlyCovered.fraction5).toBeCloseTo(0.6, 12);
  });

  it("OFFSCREEN: no intersection, including a box only touching the edge, or empty", () => {
    expect(classify(box(0, 120, 10, 10)).category).toBe("OFFSCREEN");
    expect(classify(box(100, 0, 10, 10)).category).toBe("OFFSCREEN"); // touches x = 100
    expect(classify(box(10, 10, 0, 10)).category).toBe("OFFSCREEN");
    expect(viewportIntersection(box(-10, -10, 10, 10), V)).toBeNull();
  });

  it("SAMPLING_SENSITIVE: the 5×5 grid sees all hits, the 9×9 grid finds a covered point", () => {
    // A thin cover between two 5×5 columns: 5×5 x-centres are 14, 22, 30, 38, 46 (box 10..50);
    // 9×9 x-centres include 25.56, inside the cover at 24..27.
    const r = classify(box(10, 10, 40, 20), (p) => p.x > 24 && p.x < 27);
    expect(r.category5).toBe("HIT_TESTABLE");
    expect(r.category9).toBe("PARTIALLY_OCCLUDED");
    expect(r.category).toBe("SAMPLING_SENSITIVE");
    expect(r.primary).toBe(false);
  });

  it("refuses hit lists that do not match the plan", () => {
    expect(() => classifyElement(box(10, 10, 10, 10), V, [true], [true])).toThrow();
  });

  it("occlusionCategory counts exactly", () => {
    expect(occlusionCategory([true, true])).toBe("HIT_TESTABLE");
    expect(occlusionCategory([true, false])).toBe("PARTIALLY_OCCLUDED");
    expect(occlusionCategory([false, false])).toBe("FULLY_OCCLUDED");
  });
});

describe("amendment 2 — what counts as a hit", () => {
  // Minimal DOM-like nodes: `contains` and `control` as the DOM defines them.
  const node = (tagName, parent = null) => {
    const n = { tagName, parent, control: null, contains: (o) => { for (let x = o; x; x = x.parent) if (x === n) return true; return false; } };
    return n;
  };
  const card = node("DIV");
  const button = node("BUTTON", card);
  const text = node("SPAN", button);
  const input = node("INPUT");
  const label = node("LABEL");
  label.control = input;
  const otherLabel = node("LABEL");
  otherLabel.control = node("INPUT");
  const overlay = node("HEADER");

  it("the element itself and its descendants hit", () => {
    expect(hitMatches(button, button)).toBe(true);
    expect(hitMatches(button, text)).toBe(true);
  });
  it("a label whose control is the element hits; another label does not", () => {
    expect(hitMatches(input, label)).toBe(true);
    expect(hitMatches(input, otherLabel)).toBe(false);
  });
  it("an ancestor, an overlay or nothing does not hit", () => {
    expect(hitMatches(button, card)).toBe(false);
    expect(hitMatches(button, overlay)).toBe(false);
    expect(hitMatches(button, null)).toBe(false);
  });
  it("only a LABEL's control counts: another element with a `control` property does not", () => {
    const impostor = node("OUTPUT");
    impostor.control = input;
    expect(hitMatches(input, impostor)).toBe(false);
  });
});

describe("amendment 2 — primary matching and prediction accounting", () => {
  const P = (cls, b, confidence) => ({ cls, box: b, confidence });
  const valid = [{ id: "v", cls: "button", box: box(10, 10, 40, 20) }];
  const excluded = [{ id: "x", cls: "button", box: box(14, 12, 40, 20) }];

  it("a prediction is not lost to an excluded element it overlaps more", () => {
    const p = [P("button", box(14, 12, 40, 20), 0.9)]; // IoU 1.0 with x, ~0.67 with v
    // Matching everything together would give the prediction to x and leave v a false negative:
    const full = matchLikeEvaluator([...valid, ...excluded], p);
    expect([...full.gtMatchedBy.keys()]).toEqual(["x"]);
    // The primary path matches valid ground truth first:
    const r = matchValidPopulation(valid, excluded, p);
    expect([...r.gtMatchedBy.keys()]).toEqual(["v"]);
    expect(r.status).toEqual(["TP"]);
  });

  it("a prediction matching only an excluded element is IGNORED, not FP", () => {
    const p = [P("button", box(60, 60, 30, 20), 0.9)];
    const r = matchValidPopulation(valid, [{ id: "x2", cls: "button", box: box(60, 60, 30, 20) }], p);
    expect(r.status).toEqual(["IGNORED"]);
    expect(r.gtMatchedBy.size).toBe(0);
  });

  it("an excluded element absorbs at most one prediction; a duplicate is FP", () => {
    const xb = box(60, 60, 30, 20);
    const p = [P("button", xb, 0.9), P("button", xb, 0.8)];
    expect(matchValidPopulation([], [{ id: "x2", cls: "button", box: xb }], p).status).toEqual(["IGNORED", "FP"]);
  });

  it("class still matters, on both passes", () => {
    const p = [P("link", box(10, 10, 40, 20), 0.9)];
    expect(matchValidPopulation(valid, excluded, p).status).toEqual(["FP"]);
  });

  it("accounting reconciles: predictions = TP + FP + IGNORED, FN = valid − TP", () => {
    const xb = box(60, 60, 30, 20);
    const p = [P("button", box(10, 10, 40, 20), 0.9), P("button", xb, 0.8), P("button", box(0, 80, 10, 10), 0.7), P("button", xb, 0.6)];
    const vg = [...valid, { id: "v2", cls: "button", box: box(80, 0, 15, 15) }];
    const r = matchValidPopulation(vg, [{ id: "x2", cls: "button", box: xb }], p);
    const count = (s) => r.status.filter((x) => x === s).length;
    expect([count("TP"), count("FP"), count("IGNORED")]).toEqual([1, 2, 1]);
    expect(count("TP") + count("FP") + count("IGNORED")).toBe(p.length);
    expect(vg.length - r.gtMatchedBy.size).toBe(1);
  });

  it("with nothing excluded, the primary path IS the evaluator's matching", () => {
    const p = [P("button", box(11, 11, 40, 20), 0.9), P("button", box(70, 70, 10, 10), 0.5)];
    const a = matchValidPopulation(valid, [], p);
    const b = matchLikeEvaluator(valid, p);
    expect(a.status).toEqual(b.predTp.map((t) => (t ? "TP" : "FP")));
    expect([...a.gtMatchedBy]).toEqual([...b.gtMatchedBy]);
  });
});
