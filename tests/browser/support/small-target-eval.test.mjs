import { describe, expect, it } from "vitest";
import { evaluate, sealDataset } from "@pratibimb/evaluation";
import * as W1 from "../../../artifacts/experiments/W1-detector-precision-scale/harness/w1-guards.mjs";
import {
  BUCKETS,
  MATCH_IOU,
  STAGES,
  attributeMiss,
  bucketOf,
  cellCentresInside,
  iou,
  matchLikeEvaluator,
  placeholderSamples,
  quantiles,
  rawAnchors,
} from "./small-target-eval.mjs";

const CLASSES = ["button", "link", "textbox", "checkbox", "radio", "select", "tab", "icon"];
const box = (x, y, w, h) => ({ x, y, w, h });

describe("M22 size buckets (design §5)", () => {
  it("are the stride-8 multiples the design froze", () => {
    expect(BUCKETS.map((b) => [b.id, b.lo, b.hi])).toEqual([
      ["very-small", 0, 8],
      ["small", 8, 16],
      ["medium", 16, 32],
      ["large", 32, Number.POSITIVE_INFINITY],
    ]);
  });

  it("bucket by the shorter side, lower bound inclusive", () => {
    expect(bucketOf(box(0, 0, 100, 7.99))).toBe("very-small");
    expect(bucketOf(box(0, 0, 100, 8))).toBe("small");
    expect(bucketOf(box(0, 0, 15.9, 400))).toBe("small");
    expect(bucketOf(box(0, 0, 16, 16))).toBe("medium");
    expect(bucketOf(box(0, 0, 32, 50))).toBe("large");
    expect(bucketOf(box(0, 0, Number.NaN, 5))).toBeNull();
  });
});

describe("rawAnchors reads the head output by the decode's rules", () => {
  const A = 4;
  const C = CLASSES.length;
  const data = new Float32Array((4 + C) * A);
  const set = (a, cx, cy, w, h, scores) => {
    data[a] = cx;
    data[A + a] = cy;
    data[2 * A + a] = w;
    data[3 * A + a] = h;
    scores.forEach((s, c) => (data[(4 + c) * A + a] = s));
  };
  set(0, 10, 10, 4, 2, [0.1, 0.3, 0.3]); // tie: the lower index wins (strict >)
  set(1, 50, 50, 0, 2, [0.9]); // zero width: left out
  set(2, 70, 70, 4, 4, []); // scores all zero: no top class
  set(3, 90, 90, 6, 6, [0, 0, 0, 0, 0, 0, 0, 0.8]);
  it("keeps the first strict maximum, drops zero extents and classless anchors", () => {
    const r = rawAnchors(data, [1, 4 + C, A], CLASSES);
    expect(r.map((a) => [a.label, Math.round(a.score * 100)])).toEqual([["link", 30], ["icon", 80]]);
    expect(r[0].box).toEqual(box(8, 9, 4, 2));
  });
  it("refuses a shape it does not recognise", () => {
    expect(() => rawAnchors(data, [1, 5, A], CLASSES)).toThrow();
  });
});

describe("matchLikeEvaluator agrees with evaluate()", () => {
  const gts = [
    { id: "a", cls: "button", box: box(10, 10, 40, 20) },
    { id: "b", cls: "button", box: box(12, 12, 40, 20) },
    { id: "c", cls: "link", box: box(200, 10, 60, 14) },
    { id: "d", cls: "checkbox", box: box(300, 300, 13, 13) },
  ];
  const preds = [
    { cls: "button", box: box(11, 11, 40, 20), confidence: 0.9 },
    { cls: "button", box: box(11, 11, 40, 20), confidence: 0.8 },
    { cls: "button", box: box(500, 500, 40, 20), confidence: 0.7 },
    { cls: "textbox", box: box(200, 10, 60, 14), confidence: 0.95 }, // right place, wrong class
    { cls: "link", box: box(205, 10, 60, 14), confidence: 0.6 },
  ];
  it("produces the same TP, FP and FN as the project's evaluator", () => {
    const { gtMatchedBy, predTp } = matchLikeEvaluator(gts, preds);
    const tp = predTp.filter(Boolean).length;
    const ds = sealDataset({
      name: "m22-unit",
      version: "0",
      createdAt: "2026-11-01T00:00:00Z",
      samples: [
        {
          id: "s",
          split: "dev",
          provenance: { kind: "SYNTHETIC", generator: "unit", seed: 1 },
          viewportCss: { w: 640, h: 640 },
          dpr: 1,
          zoom: 1,
          captureSize: { w: 640, h: 640 },
          scroll: { x: 0, y: 0 },
          annotations: gts.map((g) => ({ id: g.id, cls: g.cls, box: g.box, visibility: "VISIBLE" })),
        },
        ...placeholderSamples("unit", { w: 640, h: 640 }, W1),
      ],
    });
    const r = evaluate(
      ds,
      preds.map((p) => ({ sampleId: "s", cls: p.cls, box: p.box, confidence: p.confidence, frameId: "f", modelId: "m", revision: "r" })),
      "dev",
      { modelId: "m", modelRevision: "r", backend: "none", browser: "none", preprocessing: "none", evaluatedAt: "2026-11-01T00:00:00Z" }
    );
    expect(tp).toBe(r.totals.truePositives);
    expect(preds.length - tp).toBe(r.totals.falsePositives);
    expect(gts.length - gtMatchedBy.size).toBe(r.totals.falseNegatives);
    expect([...gtMatchedBy.keys()].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("attributeMiss — one stage per missed element, first failure wins", () => {
  const content = box(0, 140, 640, 360);
  const gt = { cls: "checkbox", model: box(100, 200, 10, 10), css: box(200, 120, 20, 20) };
  const at = (over) => attributeMiss({ gt, content, raw: [], floor: 0.25, survivors: [], projected: [], ...over });
  const near = { box: box(100, 200, 10, 10), label: "checkbox", score: 0.9 };

  it("PREPROCESSING: sub-pixel or outside the content", () => {
    expect(at({ gt: { ...gt, model: box(100, 200, 0.5, 10) } })).toBe("PREPROCESSING");
    expect(at({ gt: { ...gt, model: box(100, 100, 10, 10) } })).toBe("PREPROCESSING");
  });
  it("INFERENCE_NOT_LOCALIZED: nothing anywhere near it", () => {
    expect(at({ raw: [{ ...near, box: box(300, 300, 10, 10) }] })).toBe("INFERENCE_NOT_LOCALIZED");
  });
  it("INFERENCE_WRONG_CLASS: localised only as another class", () => {
    expect(at({ raw: [{ ...near, label: "radio" }] })).toBe("INFERENCE_WRONG_CLASS");
  });
  it("SCORE_FILTER: right class, right place, below the floor", () => {
    expect(at({ raw: [{ ...near, score: 0.2 }] })).toBe("SCORE_FILTER");
  });
  it("NMS: passed the floor but did not survive", () => {
    expect(at({ raw: [near] })).toBe("NMS");
  });
  it("INVERSE_GEOMETRY: survived in model space, absent in CSS", () => {
    expect(at({ raw: [near], survivors: [near] })).toBe("INVERSE_GEOMETRY");
  });
  it("ASSIGNMENT: present in CSS, given to another element", () => {
    expect(at({ raw: [near], survivors: [near], projected: [{ label: "checkbox", box: gt.css }] })).toBe("ASSIGNMENT");
  });
  it("names exactly the design's stages, in pipeline order", () => {
    expect(STAGES).toEqual(["PREPROCESSING", "INFERENCE_NOT_LOCALIZED", "INFERENCE_WRONG_CLASS", "SCORE_FILTER", "NMS", "INVERSE_GEOMETRY", "ASSIGNMENT"]);
    expect(MATCH_IOU).toBe(0.5);
  });
});

describe("cellCentresInside", () => {
  it("counts stride-8 centres, inclusive at the edges", () => {
    expect(cellCentresInside(box(0, 0, 8, 8))).toBe(1); // centre (4, 4)
    expect(cellCentresInside(box(4, 4, 8, 8))).toBe(4); // (4|12) x (4|12), edges inclusive
    expect(cellCentresInside(box(5, 5, 6, 6))).toBe(0); // between centres
    expect(cellCentresInside(box(0, 0, 640, 640))).toBe(6400);
  });
});

describe("quantiles and iou", () => {
  it("nearest rank, nulls when empty", () => {
    expect(quantiles([3, 1, 2])).toEqual({ n: 3, p10: 1, p50: 2, p90: 3 });
    expect(quantiles([])).toEqual({ n: 0, p10: null, p50: null, p90: null });
  });
  it("iou is symmetric and zero for disjoint boxes", () => {
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(1 / 3, 12);
    expect(iou(box(0, 0, 1, 1), box(2, 2, 1, 1))).toBe(0);
  });
});
