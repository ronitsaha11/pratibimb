/**
 * M22.6 — the G10 pixel-visibility metrics on synthetic pixel buffers, and its threshold policy:
 * classification needs stated thresholds, with no default.
 */
import { describe, expect, it } from "vitest";
import { assertThresholds, classifyVisibility, contrastOf, elementPixelMetrics, readings } from "../visibility.mjs";

/** A w × h image filled with `bg`, then `paint(x, y)` for an optional colour per pixel. */
function image(w, h, bg, paint = () => null) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = paint(x, y) ?? bg;
    const i = (y * w + x) * 4;
    rgba.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], i);
  }
  return { w, h, rgba };
}
const box = { x: 20, y: 20, w: 40, h: 20 };
const inBox = (x, y) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
const T = { salienceInvisibleBelow: 1.1, salienceVisibleAtLeast: 1.5, coverageContrast: 1.25, coverageInvisibleBelow: 0.005, coverageVisibleAtLeast: 0.02 };

describe("G10 metrics", () => {
  it("a page-on-page element (candidate 1's invisible textbox) has salience 1 and no coverage", () => {
    const m = elementPixelMetrics(image(80, 60, 0xffffff), box);
    expect(m.salience).toBe(1);
    expect(m.coverage["1.1"]).toBe(0);
    expect(classifyVisibility("positive", m, T)).toBe("INVISIBLE");
  });
  it("a 1 px border on the page is visible: high salience, small coverage", () => {
    const border = (x, y) => (inBox(x, y) && (x === box.x || y === box.y || x === box.x + box.w - 1 || y === box.y + box.h - 1) ? 0x7d93ad : null);
    const m = elementPixelMetrics(image(80, 60, 0xffffff, border), box);
    expect(m.salience).toBeCloseTo(contrastOf(0x7d93ad, 0xffffff), 2);
    expect(m.coverage["1.25"]).toBeGreaterThan(0.05);
    expect(classifyVisibility("positive", m, T)).toBe("VISIBLE");
    expect(readings("textbox", m).fieldOrEdge).toBeGreaterThan(2);
  });
  it("an icon whose glyph is nearly the page colour (candidate 1's lost plate) is invisible; on its plate it is visible", () => {
    const glyph = (x, y) => (inBox(x, y) && x > 30 && x < 50 ? 0xfafafa : null); // near-white glyph on white
    expect(classifyVisibility("positive", elementPixelMetrics(image(80, 60, 0xffffff, glyph), box), T)).toBe("INVISIBLE");
    const plated = (x, y) => (inBox(x, y) ? (x > 30 && x < 50 ? 0xffffff : 0x12395c) : null);
    const m = elementPixelMetrics(image(80, 60, 0xffffff, plated), box);
    expect(classifyVisibility("positive", m, T)).toBe("VISIBLE");
    const r = readings("icon", m, { plate: "accent" });
    expect(r.plateVsPage).toBeGreaterThan(10);
    expect(r.glyphVsPlate).toBeGreaterThan(10);
  });
  it("a single stray pixel does not make an element visible (salience is the k-th highest, k ≥ 3)", () => {
    const stray = (x, y) => (x === 30 && y === 30 ? 0x000000 : null);
    expect(elementPixelMetrics(image(80, 60, 0xffffff, stray), box).salience).toBe(1);
  });
  it("between the thresholds is BORDERLINE", () => {
    const faint = (x, y) => (inBox(x, y) ? 0xe2e2e2 : null); // a fill at contrast ≈ 1.3 on white
    const m = elementPixelMetrics(image(80, 60, 0xffffff, faint), box);
    expect(m.salience).toBeGreaterThan(1.1);
    expect(m.salience).toBeLessThan(1.5);
    expect(classifyVisibility("positive", m, T)).toBe("BORDERLINE");
  });
});

describe("G10 threshold policy", () => {
  it("refuses to classify without every threshold stated — there is no default", () => {
    const m = elementPixelMetrics(image(80, 60, 0xffffff), box);
    expect(() => classifyVisibility("positive", m, undefined)).toThrow(/must be stated/);
    for (const k of Object.keys(T)) {
      const { [k]: _, ...missing } = T;
      expect(() => assertThresholds(missing)).toThrow(new RegExp(k));
    }
  });
  it("refuses inconsistent thresholds and unmeasured coverage levels", () => {
    expect(() => assertThresholds({ ...T, salienceInvisibleBelow: 2 })).toThrow(/must not exceed/);
    expect(() => assertThresholds({ ...T, coverageContrast: 1.3 })).toThrow(/measured levels/);
  });
  it("anything but an intended positive is NOT_APPLICABLE", () => {
    const m = elementPixelMetrics(image(80, 60, 0xffffff), box);
    expect(classifyVisibility("occlusion-full", m, T)).toBe("NOT_APPLICABLE");
    expect(classifyVisibility("occlusion-partial", m, T)).toBe("NOT_APPLICABLE");
  });
});
