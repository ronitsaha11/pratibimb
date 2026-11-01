/**
 * M21 — geometry regression: the letterbox and coordinate chain across screen shapes.
 *
 * Every assertion here is a property the existing contracts already establish:
 *
 *   - `coordinate-contract.md` (FROZEN): CSS viewport px is canonical; a detector cannot see
 *     outside the frame it was given (`validateDetections`).
 *   - `preprocessing-contract.md` §4/§6: the continuous transform (`computeLetterbox`) owns the
 *     inverse; the raster transform (`rasterLetterbox`) owns the pixels; they differ by rounding.
 *   - `letterbox.ts`: uniform scale, centred padding, padding-only boxes dropped, straddling boxes
 *     clipped to content.
 *
 * Nothing here decides what an unresolved contract means. In particular it does not choose
 * between the continuous and raster inverse (QG-03a-C, owner decision), and it makes no claim
 * about detection accuracy: it tests arithmetic, not a model.
 */
import { describe, expect, it } from "vitest";
import {
  type CaptureFrame,
  type CaptureGeometry,
  type DecodedDetection,
  type HeadOutput,
  HEAD_CONTRACT,
  PerceptionError,
  UI_CLASSES,
  assertGeometryConsistent,
  assertRasterMatchesInverse,
  boundToFrame,
  captureBox,
  captureToCss,
  captureToModel,
  clipToContent,
  computeLetterbox,
  createUiElementDetector,
  decodeHeadOutput,
  decodeHeadOutputAccounted,
  frameId,
  geometryFrom,
  modelBox,
  modelToCapture,
  projectToCapture,
  projectToCaptureAccounted,
  rasterLetterbox,
  validateDetections,
} from "@pratibimb/perception";

const S = HEAD_CONTRACT.inputSize;

/** Capture sizes, by shape. Real viewports, odd sizes, extremes, and the 1-pixel edge case. */
const FRAMES = {
  landscape: [
    [1280, 720], [1366, 768], [1536, 864], [1920, 1080], [1440, 900], [1280, 800],
    [1264, 800], [1024, 640], [2560, 1440], [1043, 739], [1263, 609], [961, 641],
  ],
  portrait: [[390, 844], [412, 915], [360, 800], [768, 1024], [820, 1180], [1080, 1920], [641, 1280]],
  square: [[640, 640], [1000, 1000], [320, 320], [1281, 1281]],
  extreme: [[3000, 200], [200, 3000], [1, 23], [23, 1], [6400, 64]],
} as const;
const ALL = Object.values(FRAMES).flat() as readonly (readonly [number, number])[];

/** Boxes that touch every content edge: the whole content plus a margin, and each corner. */
function edgeBoxes(t: ReturnType<typeof computeLetterbox>) {
  const { padX: px, padY: py } = t;
  const { w: cw, h: ch } = t.contentSize;
  return [
    modelBox(px - 5, py - 5, cw + 10, ch + 10),
    modelBox(px - 4, py - 4, 6, 6),
    modelBox(px + cw - 2, py - 4, 6, 6),
    modelBox(px - 4, py + ch - 2, 6, 6),
    modelBox(px + cw - 2, py + ch - 2, 6, 6),
  ];
}

const inside = (b: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h && b.w > 0 && b.h > 0;

const frameFor = (w: number, h: number): CaptureFrame => ({
  id: frameId(`m21-${w}x${h}`),
  capturedAt: 0,
  source: "live",
  geometry: { dpr: 1, zoom: 1, viewportCss: { w, h }, captureSize: { w, h }, scroll: { x: 0, y: 0 }, origin: "http://127.0.0.1" },
});

// ─────────────────────────────── the fit itself ───────────────────────────────

describe("the letterbox fit, by screen shape", () => {
  it.each(FRAMES.landscape)("landscape %ix%i letterboxes vertically: no side padding, equal top and bottom", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    // Real-valued, so "no padding" is within rounding: at 1263x609, 1263 * (640 / 1263) is not
    // exactly 640 and padX is 5.7e-14. That residue is what pushed edge boxes past the frame.
    expect(t.padX).toBeCloseTo(0, 9);
    expect(t.padY).toBeGreaterThan(0);
    expect(t.contentSize.w).toBeCloseTo(S, 9);
    expect(2 * t.padY + t.contentSize.h).toBeCloseTo(S, 9);
  });

  it.each(FRAMES.portrait)("portrait %ix%i letterboxes horizontally: no top padding, equal left and right", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    expect(t.padY).toBeCloseTo(0, 9);
    expect(t.padX).toBeGreaterThan(0);
    expect(t.contentSize.h).toBeCloseTo(S, 9);
    expect(2 * t.padX + t.contentSize.w).toBeCloseTo(S, 9);
  });

  it.each(FRAMES.square)("square %ix%i needs no padding at all", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    // Rounding, not padding: w * (640 / w) is not always exactly 640 (see the landscape case).
    expect(t.padX).toBeCloseTo(0, 9);
    expect(t.padY).toBeCloseTo(0, 9);
  });

  it.each(ALL)("%ix%i scales uniformly: one factor for both axes, and the frame fits", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    expect(t.scale).toBe(Math.min(S / w, S / h));
    expect(t.contentSize.w / w).toBeCloseTo(t.scale, 12);
    expect(t.contentSize.h / h).toBeCloseTo(t.scale, 12);
    expect(Math.max(t.contentSize.w, t.contentSize.h)).toBeCloseTo(S, 9);
    expect(t.padX).toBeGreaterThanOrEqual(0);
    expect(t.padY).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ["zero width", { w: 0, h: 720 }],
    ["negative height", { w: 1280, h: -1 }],
    ["NaN", { w: Number.NaN, h: 720 }],
    ["Infinity", { w: Number.POSITIVE_INFINITY, h: 720 }],
  ])("refuses a frame with %s rather than fitting it", (_name, size) => {
    expect(() => computeLetterbox(size, S)).toThrow(PerceptionError);
  });
});

// ──────────────────── raster versus continuous: bounded rounding ────────────────────

describe("the raster and continuous letterboxes differ by rounding only", () => {
  it.each(ALL)("%ix%i: integer raster, filling the square exactly, within rounding of the continuous fit", (w, h) => {
    const c = computeLetterbox({ w, h }, S);
    const r = rasterLetterbox({ w, h }, S, HEAD_CONTRACT.padValue);
    for (const v of [r.resizedW, r.resizedH, r.padLeft, r.padTop, r.padRight, r.padBottom]) expect(Number.isInteger(v)).toBe(true);
    expect(r.padLeft + r.resizedW + r.padRight).toBe(S);
    expect(r.padTop + r.resizedH + r.padBottom).toBe(S);
    // round() moves an extent by at most 0.5 (max(1, ·) only ever applies below 1 px, where the
    // continuous extent is already within 1).
    expect(Math.abs(r.resizedW - c.contentSize.w)).toBeLessThanOrEqual(Math.max(0.5, 1 - c.contentSize.w));
    expect(Math.abs(r.resizedH - c.contentSize.h)).toBeLessThanOrEqual(Math.max(0.5, 1 - c.contentSize.h));
    // floor((S − n)/2) against (S − c)/2: half the extent difference plus a floor, so < 0.75.
    if (c.contentSize.w >= 1 && c.contentSize.h >= 1) {
      expect(Math.abs(r.padLeft - c.padX)).toBeLessThanOrEqual(0.75);
      expect(Math.abs(r.padTop - c.padY)).toBeLessThanOrEqual(0.75);
    }
  });

  it("puts the extra pixel of odd padding at the right and bottom, never the left or top", () => {
    for (const [w, h] of ALL) {
      const r = rasterLetterbox({ w, h }, S, HEAD_CONTRACT.padValue);
      expect(r.padRight - r.padLeft).toBeGreaterThanOrEqual(0);
      expect(r.padRight - r.padLeft).toBeLessThanOrEqual(1);
      expect(r.padBottom - r.padTop).toBeGreaterThanOrEqual(0);
      expect(r.padBottom - r.padTop).toBeLessThanOrEqual(1);
    }
  });

  it("refuses a non-integer frame for rasterising, which the continuous fit accepts", () => {
    expect(() => rasterLetterbox({ w: 1280.5, h: 720 }, S, HEAD_CONTRACT.padValue)).toThrow(PerceptionError);
    expect(() => computeLetterbox({ w: 1280.5, h: 720 }, S)).not.toThrow();
  });
});

// ────────────────────────── the inverse, and the frame bound ──────────────────────────

describe("model ⇄ capture round trips, at every shape", () => {
  it.each(ALL)("%ix%i returns a capture box to itself through the model square", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    const b = captureBox(w * 0.1, h * 0.2, w * 0.3, h * 0.4);
    const back = modelToCapture(captureToModel(b, t), t);
    const tol = 1e-9 * Math.max(w, h);
    expect(Math.abs(back.x - b.x)).toBeLessThanOrEqual(tol);
    expect(Math.abs(back.y - b.y)).toBeLessThanOrEqual(tol);
    expect(Math.abs(back.w - b.w)).toBeLessThanOrEqual(tol);
    expect(Math.abs(back.h - b.h)).toBeLessThanOrEqual(tol);
  });

  it.each([
    ["the left", 0, 0.5],
    ["the right", 1, 0.5],
    ["the top", 0.5, 0],
    ["the bottom", 0.5, 1],
  ])("maps the content's %s edge onto the frame's own edge", (_name, fx, fy) => {
    for (const [w, h] of ALL) {
      const t = computeLetterbox({ w, h }, S);
      const p = modelToCapture(modelBox(t.padX + fx * t.contentSize.w, t.padY + fy * t.contentSize.h, 0, 0), t);
      expect(p.x).toBeCloseTo(fx * w, 6);
      expect(p.y).toBeCloseTo(fy * h, 6);
    }
  });
});

describe("M21 regression — a projected detection never leaves the frame", () => {
  it("REPRODUCES THE DEFECT: the unbounded inverse places edge boxes past the frame on real viewports", () => {
    // 390x844 (phone, portrait): bottom. 820x1180 (tablet, portrait) and 1263x609: right.
    const overshoots: string[] = [];
    for (const [w, h] of [[390, 844], [820, 1180], [1263, 609]] as const) {
      const t = computeLetterbox({ w, h }, S);
      const k = modelToCapture(clipToContent(edgeBoxes(t)[0]!, t)!, t);
      if (!inside(k, w, h)) overshoots.push(`${w}x${h}`);
    }
    expect(overshoots).toEqual(["390x844", "820x1180", "1263x609"]);
  });

  it("…and validateDetections refuses such a frame outright, so the overshoot is not cosmetic", () => {
    const [w, h] = [390, 844];
    const t = computeLetterbox({ w, h }, S);
    const k = modelToCapture(clipToContent(edgeBoxes(t)[0]!, t)!, t);
    const r = validateDetections([{ x: k.x, y: k.y, w: k.w, h: k.h, score: 0.9, label: "button" }], frameFor(w, h));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MODEL_OUTPUT_MALFORMED");
  });

  it.each(ALL)("%ix%i: every projected edge box lies inside the frame and passes validateDetections", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    const decoded: DecodedDetection[] = edgeBoxes(t).map((box) => ({ box, label: "button", score: 0.9 }));
    const projected = projectToCapture(decoded, t);
    expect(projected).toHaveLength(decoded.length);
    for (const d of projected) expect(inside(d.box, w, h)).toBe(true);
    const r = validateDetections(projected.map((d) => ({ ...d.box, score: d.score, label: d.label })), frameFor(w, h));
    expect(r.ok).toBe(true);
  });

  it("holds over a sweep of frame sizes, not only the named ones", () => {
    let boxes = 0;
    for (let w = 1; w <= 2600; w += 37) {
      for (let h = 1; h <= 2600; h += 41) {
        const t = computeLetterbox({ w, h }, S);
        for (const d of projectToCapture(edgeBoxes(t).map((box) => ({ box, label: "icon" as const, score: 0.5 })), t)) {
          boxes += 1;
          expect(inside(d.box, w, h)).toBe(true);
        }
      }
    }
    expect(boxes).toBeGreaterThan(20_000);
  });

  it("leaves a box that was already inside the frame bit-for-bit unchanged", () => {
    for (const [w, h] of ALL) {
      const t = computeLetterbox({ w, h }, S);
      const interior = modelBox(t.padX + t.contentSize.w * 0.25, t.padY + t.contentSize.h * 0.25, t.contentSize.w * 0.5, t.contentSize.h * 0.5);
      const before = modelToCapture(clipToContent(interior, t)!, t);
      const [after] = projectToCapture([{ box: interior, label: "link", score: 0.7 }], t);
      expect(after!.box).toEqual(before);
    }
  });

  it("boundToFrame removes only what lies outside, and drops what has nothing inside", () => {
    const f = { w: 100, h: 50 };
    const b = captureBox(10, 10, 20, 20);
    expect(boundToFrame(b, f)).toBe(b);
    expect(boundToFrame(captureBox(90, 40, 10.000000000001, 10), f)).toEqual(captureBox(90, 40, 10, 10));
    expect(boundToFrame(captureBox(-1e-13, 0, 5, 5), f)).toEqual(captureBox(0, 0, 5 - 1e-13, 5));
    expect(boundToFrame(captureBox(100, 0, 1e-13, 5), f)).toBeNull();
  });
});

describe("outside the valid image region", () => {
  it.each(ALL.filter(([w, h]) => w !== h))("%ix%i: a box wholly in the padding is dropped, never clamped", (w, h) => {
    const t = computeLetterbox({ w, h }, S);
    const inPad = t.padY > 0 ? modelBox(10, t.padY / 4, 20, t.padY / 4) : modelBox(t.padX / 4, 10, t.padX / 4, 20);
    const r = projectToCaptureAccounted([{ box: inPad, label: "button", score: 0.9 }], t);
    expect(r.detections).toHaveLength(0);
    expect(r.accounting.droppedInPadding).toBe(1);
  });

  it("drops a box beyond the square entirely, on either side", () => {
    const t = computeLetterbox({ w: 1280, h: 720 }, S);
    const r = projectToCaptureAccounted(
      [
        { box: modelBox(-50, 100, 20, 20), label: "button", score: 0.9 },
        { box: modelBox(700, 100, 20, 20), label: "button", score: 0.9 },
        { box: modelBox(100, 700, 20, 20), label: "button", score: 0.9 },
      ],
      t
    );
    expect(r.detections).toHaveLength(0);
    expect(r.accounting.droppedInPadding).toBe(3);
  });

  it("clips a box straddling the content edge to the content, and counts it as clipped", () => {
    const t = computeLetterbox({ w: 1280, h: 720 }, S); // padY = 140
    const r = projectToCaptureAccounted([{ box: modelBox(100, 130, 40, 20), label: "button", score: 0.9 }], t);
    expect(r.detections).toHaveLength(1);
    expect(r.accounting.clippedAtContentEdge).toBe(1);
    expect(r.detections[0]!.box.y).toBe(0);
    expect(r.detections[0]!.box.h).toBeCloseTo(10 / t.scale, 9);
  });
});

// ───────────────────────────── decode accounting ─────────────────────────────

const C = UI_CLASSES.length;
function tensor(anchors: readonly { cx: number; cy: number; w: number; h: number; cls: number; score: number }[]): HeadOutput {
  const A = anchors.length;
  const data = new Float32Array((4 + C) * A);
  anchors.forEach((a, i) => {
    data[0 * A + i] = a.cx;
    data[1 * A + i] = a.cy;
    data[2 * A + i] = a.w;
    data[3 * A + i] = a.h;
    data[(4 + a.cls) * A + i] = a.score;
  });
  return { data, dims: [1, 4 + C, A] };
}

describe("decode says where every anchor went", () => {
  it("puts each anchor in exactly one bucket", () => {
    const r = decodeHeadOutputAccounted(
      tensor([
        { cx: 100, cy: 100, w: 40, h: 20, cls: 0, score: 0.9 }, // kept
        { cx: 101, cy: 100, w: 40, h: 20, cls: 0, score: 0.8 }, // suppressed by NMS
        { cx: 300, cy: 300, w: 40, h: 20, cls: 1, score: 0.1 }, // below score
        { cx: 400, cy: 400, w: 0, h: 20, cls: 2, score: 0.9 }, // non-positive extent
        { cx: 500, cy: 500, w: 30, h: 30, cls: 3, score: 0.6 }, // kept
      ])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.accounting).toEqual({ anchors: 5, belowScore: 1, nonPositiveExtent: 1, suppressedByNms: 1, cappedByLimit: 0, kept: 2 });
  });

  it("counts what the detection cap removed", () => {
    const many = Array.from({ length: 310 }, (_, i) => ({ cx: 10 + (i % 30) * 20, cy: 10 + Math.floor(i / 30) * 20, w: 8, h: 8, cls: 0, score: 0.9 }));
    const r = decodeHeadOutputAccounted(tensor(many));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.value.accounting;
    expect(a.kept).toBe(300);
    expect(a.cappedByLimit).toBe(10);
    expect(a.belowScore + a.nonPositiveExtent + a.suppressedByNms + a.cappedByLimit + a.kept).toBe(a.anchors);
  });

  it("returns exactly what decodeHeadOutput returns", () => {
    const out = tensor([
      { cx: 100, cy: 100, w: 40, h: 20, cls: 0, score: 0.9 },
      { cx: 101, cy: 100, w: 40, h: 20, cls: 0, score: 0.8 },
      { cx: 500, cy: 500, w: 30, h: 30, cls: 3, score: 0.6 },
    ]);
    const plain = decodeHeadOutput(out);
    const accounted = decodeHeadOutputAccounted(out);
    expect(plain.ok && accounted.ok).toBe(true);
    if (plain.ok && accounted.ok) expect(accounted.value.detections).toEqual(plain.value);
  });
});

// ───────────────────────── malformed detector output ─────────────────────────

describe("malformed detector output is refused, never interpreted", () => {
  it.each([
    ["a NaN centre", [{ cx: Number.NaN, cy: 10, w: 4, h: 4, cls: 0, score: 0.9 }]],
    ["an infinite extent", [{ cx: 10, cy: 10, w: Number.POSITIVE_INFINITY, h: 4, cls: 0, score: 0.9 }]],
    ["a score above 1", [{ cx: 10, cy: 10, w: 4, h: 4, cls: 0, score: 1.5 }]],
  ])("decode refuses %s for the whole frame", (_name, anchors) => {
    const r = decodeHeadOutput(tensor(anchors));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MODEL_OUTPUT_MALFORMED");
  });

  it.each([
    ["the wrong rank", { data: new Float32Array(12), dims: [12, 1] }],
    ["the wrong channel count", { data: new Float32Array(10 * 3), dims: [1, 10, 3] }],
    ["a batch of two", { data: new Float32Array(2 * 12 * 3), dims: [2, 12, 3] }],
    ["too few values", { data: new Float32Array(12 * 3 - 1), dims: [1, 12, 3] }],
    ["a fractional anchor count", { data: new Float32Array(12), dims: [1, 12, 1.5] }],
  ])("decode refuses a tensor with %s", (_name, out) => {
    const r = decodeHeadOutput(out as HeadOutput);
    expect(r.ok).toBe(false);
  });

  const frame = frameFor(1280, 720);
  it.each([
    ["not an array", { x: 0 }],
    ["a non-object entry", [7]],
    ["a NaN field", [{ x: Number.NaN, y: 0, w: 1, h: 1, score: 0.5, label: "button" }]],
    ["a string field", [{ x: "1", y: 0, w: 1, h: 1, score: 0.5, label: "button" }]],
    ["a zero width", [{ x: 0, y: 0, w: 0, h: 1, score: 0.5, label: "button" }]],
    ["a negative score", [{ x: 0, y: 0, w: 1, h: 1, score: -0.1, label: "button" }]],
    ["a box past the right edge", [{ x: 1270, y: 0, w: 11, h: 1, score: 0.5, label: "button" }]],
    ["a box above the frame", [{ x: 0, y: -1, w: 1, h: 1, score: 0.5, label: "button" }]],
    ["no label", [{ x: 0, y: 0, w: 1, h: 1, score: 0.5 }]],
  ])("validateDetections refuses %s", (_name, raw) => {
    const r = validateDetections(raw, frame);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MODEL_OUTPUT_MALFORMED");
  });

  it("accepts a box flush with every edge of the frame", () => {
    expect(validateDetections([{ x: 0, y: 0, w: 1280, h: 720, score: 1, label: "button" }], frame).ok).toBe(true);
  });
});

// ─────────────────── stale or incompatible observation geometry ───────────────────

describe("an incompatible geometry is refused, not converted", () => {
  it("refuses to invert through a transform for a different frame than was rasterised", () => {
    const raster = rasterLetterbox({ w: 1280, h: 720 }, S, HEAD_CONTRACT.padValue);
    expect(() => assertRasterMatchesInverse(raster, computeLetterbox({ w: 1280, h: 720 }, S))).not.toThrow();
    for (const other of [computeLetterbox({ w: 1280, h: 721 }, S), computeLetterbox({ w: 2560, h: 1440 }, S), computeLetterbox({ w: 1280, h: 720 }, 320)]) {
      let code: string | null = null;
      try {
        assertRasterMatchesInverse(raster, other);
      } catch (e) {
        code = (e as PerceptionError).code;
      }
      expect(code).toBe("COORDINATE_TRANSFORM_AMBIGUOUS");
    }
  });

  it("refuses a capture whose shape disagrees with the viewport it claims to show", () => {
    const m = { dpr: 1, zoom: 1, viewportCssWidth: 1280, viewportCssHeight: 720, scrollX: 0, scrollY: 0, origin: "http://127.0.0.1" };
    expect(() => geometryFrom(m, 1280, 720)).not.toThrow();
    expect(() => geometryFrom(m, 720, 1280)).toThrow(PerceptionError); // rotated
    expect(() => geometryFrom(m, 1280, 800)).toThrow(PerceptionError); // other aspect
  });

  it("scales a downscaled or HiDPI capture back to the same CSS box", () => {
    const base: CaptureGeometry = { dpr: 1, zoom: 1, viewportCss: { w: 1280, h: 720 }, captureSize: { w: 1280, h: 720 }, scroll: { x: 0, y: 0 }, origin: "x" };
    for (const k of [0.5, 1, 1.5, 2, 2.5]) {
      const g: CaptureGeometry = { ...base, dpr: k, captureSize: { w: 1280 * k, h: 720 * k } };
      assertGeometryConsistent(g);
      const css = captureToCss(captureBox(100 * k, 50 * k, 200 * k, 20 * k), g);
      expect(css.x).toBeCloseTo(100, 9);
      expect(css.y).toBeCloseTo(50, 9);
      expect(css.w).toBeCloseTo(200, 9);
      expect(css.h).toBeCloseTo(20, 9);
    }
  });

  it("the detector reports its per-stage counts to an observer, and an observer that throws changes nothing", async () => {
    const seen: unknown[] = [];
    const run = (onAccounting: (a: unknown) => void) =>
      createUiElementDetector({
        modelId: "m21-stub",
        revision: "0",
        acceptedBackends: ["wasm"],
        preprocess: async () => new Float32Array(3 * S * S),
        infer: async () => tensor([{ cx: 320, cy: 320, w: 40, h: 20, cls: 0, score: 0.9 }, { cx: 320, cy: 30, w: 40, h: 20, cls: 0, score: 0.9 }]),
        onAccounting,
      }).detect(frameFor(1280, 720), "wasm");
    const a = await run((x) => seen.push(x));
    const b = await run(() => {
      throw new Error("observer failure");
    });
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value).toHaveLength(1); // the second box (model y 20..40) is in the 140 px top padding
    expect(seen).toEqual([
      {
        decode: { anchors: 2, belowScore: 0, nonPositiveExtent: 0, suppressedByNms: 0, cappedByLimit: 0, kept: 2 },
        projection: { offered: 2, droppedInPadding: 1, degenerateAfterInverse: 0, insideContent: 1, clippedAtContentEdge: 0, boundedToFrame: 0 },
      },
    ]);
  });
});
