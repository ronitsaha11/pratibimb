import { describe, expect, it } from "vitest";
import { MATCH_IOU, attributeScreen, iou, sumAttributions, sumCounts, visibility } from "./letterbox-attribution.mjs";

const V = { w: 100, h: 100 };
const label = (css, model = css, cls = "button") => ({ cls, css, model });

describe("M21 letterbox attribution", () => {
  it("uses the frozen fusion threshold, strictly", () => {
    expect(MATCH_IOU).toBe(0.5);
    const a = { x: 0, y: 0, w: 10, h: 10 };
    // IoU of exactly 0.5 is not a match, as in fusion (`> 0.5`).
    const half = { x: 0, y: 0, w: 10, h: 5 };
    expect(iou(a, half)).toBe(0.5);
    const r = attributeScreen({ labels: [label(a)], decoded: [], projected: [{ label: "button", box: half }], viewport: V });
    expect(r.DETECTED).toBe(0);
  });

  it("classifies visibility against the viewport", () => {
    expect(visibility({ x: 0, y: 0, w: 100, h: 100 }, V)).toBe("VISIBLE");
    expect(visibility({ x: 90, y: 0, w: 20, h: 10 }, V)).toBe("PARTIAL");
    expect(visibility({ x: 0, y: 100, w: 10, h: 10 }, V)).toBe("OFFSCREEN");
    expect(visibility({ x: 0, y: 0, w: 0, h: 10 }, V)).toBe("OFFSCREEN");
  });

  it("attributes each visible label to exactly one stage", () => {
    const seen = label({ x: 10, y: 10, w: 20, h: 10 }, { x: 5, y: 75, w: 10, h: 5 });
    const projectionLost = label({ x: 50, y: 10, w: 20, h: 10 }, { x: 25, y: 75, w: 10, h: 5 });
    const silent = label({ x: 10, y: 50, w: 20, h: 10 }, { x: 5, y: 95, w: 10, h: 5 }, "link");
    const offscreen = label({ x: 10, y: 150, w: 20, h: 10 });
    const partial = label({ x: 95, y: 50, w: 20, h: 10 });
    const r = attributeScreen({
      labels: [seen, projectionLost, silent, offscreen, partial],
      decoded: [{ label: "button", box: seen.model }, { label: "button", box: projectionLost.model }],
      projected: [{ label: "button", box: seen.css }],
      viewport: V,
    });
    expect(r).toMatchObject({ visible: 3, partial: 1, offscreen: 1, DETECTED: 1, LOST_IN_PROJECTION: 1, NOT_EMITTED: 1, classAgrees: 1 });
    expect(r.DETECTED + r.LOST_IN_PROJECTION + r.NOT_EMITTED).toBe(r.visible);
    expect(r.sizes).toEqual({ DETECTED: [5], LOST_IN_PROJECTION: [5], NOT_EMITTED: [5] });
  });

  it("counts a detected element whose class the head got wrong as detected, not as agreeing", () => {
    const l = label({ x: 10, y: 10, w: 20, h: 10 }, undefined, "link");
    const r = attributeScreen({ labels: [l], decoded: [], projected: [{ label: "button", box: l.css }], viewport: V });
    expect(r.DETECTED).toBe(1);
    expect(r.classAgrees).toBe(0);
  });

  it("returns counts and sizes only, never a box", () => {
    const l = label({ x: 10, y: 10, w: 20, h: 10 });
    const r = attributeScreen({ labels: [l], decoded: [], projected: [], viewport: V });
    expect(JSON.stringify(r)).not.toMatch(/"x"|"y"|"box"/);
  });

  it("sums screens and count records", () => {
    const one = attributeScreen({ labels: [label({ x: 1, y: 1, w: 5, h: 5 })], decoded: [], projected: [], viewport: V });
    const total = sumAttributions([one, one]);
    expect(total.NOT_EMITTED).toBe(2);
    expect(total.sizes.NOT_EMITTED).toEqual([5, 5]);
    expect(sumCounts([{ a: 1, b: 2 }, { a: 3, b: 0 }])).toEqual({ a: 4, b: 2 });
  });
});
