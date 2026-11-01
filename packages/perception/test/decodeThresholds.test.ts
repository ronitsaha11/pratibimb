/**
 * M22 — the decode's thresholds as an explicit parameter, for evaluation only.
 *
 * The product never passes them: the default is `PROVISIONAL_THRESHOLDS`, and these tests pin
 * that the default and the shipped constant give identical output. The parameter exists so an
 * evaluation measures other operating points through THIS decode and NMS, not through a copy.
 */
import { describe, expect, it } from "vitest";
import {
  type HeadOutput,
  PROVISIONAL_THRESHOLDS,
  UI_CLASSES,
  decodeHeadOutput,
  decodeHeadOutputAccounted,
} from "@pratibimb/perception";

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

/** A deterministic mixed scene: overlapping same-class pairs, distinct classes, a spread of scores. */
function scene(): HeadOutput {
  const anchors = [];
  for (let i = 0; i < 60; i += 1) {
    const cx = 20 + (i % 10) * 60;
    const cy = 20 + Math.floor(i / 10) * 60;
    anchors.push({ cx, cy, w: 30, h: 16, cls: i % C, score: ((i * 37) % 97) / 100 });
    anchors.push({ cx: cx + 4, cy: cy + 1, w: 30, h: 16, cls: i % C, score: ((i * 53) % 89) / 100 });
  }
  return tensor(anchors);
}

const shipped = { score: PROVISIONAL_THRESHOLDS.score, nmsIou: PROVISIONAL_THRESHOLDS.nmsIou, maxDetections: PROVISIONAL_THRESHOLDS.maxDetections };

describe("decode thresholds — the default IS the shipped configuration", () => {
  it("the shipped constants have not moved", () => {
    expect(shipped).toEqual({ score: 0.25, nmsIou: 0.5, maxDetections: 300 });
  });

  it("passing the shipped thresholds explicitly changes nothing", () => {
    const out = scene();
    const byDefault = decodeHeadOutputAccounted(out);
    const explicit = decodeHeadOutputAccounted(out, undefined, shipped);
    expect(explicit).toEqual(byDefault);
    const plain = decodeHeadOutput(out);
    expect(plain.ok && byDefault.ok).toBe(true);
    if (plain.ok && byDefault.ok) expect(byDefault.value.detections).toEqual(plain.value);
  });
});

describe("decode thresholds — each one does what it says", () => {
  it("a lower score floor admits more anchors; a higher one fewer", () => {
    const out = scene();
    const at = (score: number) => {
      const r = decodeHeadOutputAccounted(out, undefined, { ...shipped, score });
      if (!r.ok) throw new Error(r.detail);
      return r.value.accounting;
    };
    expect(at(0.05).belowScore).toBeLessThan(at(0.25).belowScore);
    expect(at(0.55).belowScore).toBeGreaterThan(at(0.25).belowScore);
  });

  it("raising the floor removes exactly the survivors below it (greedy NMS, no cap hit)", () => {
    const out = scene();
    const low = decodeHeadOutputAccounted(out, undefined, { ...shipped, score: 0.05 });
    const high = decodeHeadOutputAccounted(out, undefined, { ...shipped, score: 0.4 });
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;
    const filtered = low.value.detections.filter((d) => d.score >= 0.4);
    expect(high.value.detections).toEqual(filtered);
  });

  it("a stricter NMS IoU suppresses at least as much, a looser one at most as much", () => {
    const out = scene();
    const sup = (nmsIou: number) => {
      const r = decodeHeadOutputAccounted(out, undefined, { ...shipped, score: 0.05, nmsIou });
      if (!r.ok) throw new Error(r.detail);
      return r.value.accounting.suppressedByNms;
    };
    expect(sup(0.3)).toBeGreaterThanOrEqual(sup(0.5));
    expect(sup(0.7)).toBeLessThanOrEqual(sup(0.5));
    expect(sup(0.3)).toBeGreaterThan(sup(0.7));
  });

  it("the cap is honoured and counted", () => {
    const r = decodeHeadOutputAccounted(scene(), undefined, { score: 0.01, nmsIou: 0.99, maxDetections: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.detections).toHaveLength(10);
    expect(r.value.accounting.cappedByLimit).toBeGreaterThan(0);
    const a = r.value.accounting;
    expect(a.belowScore + a.nonPositiveExtent + a.suppressedByNms + a.cappedByLimit + a.kept).toBe(a.anchors);
  });

  it("refusals do not depend on the thresholds", () => {
    const bad = tensor([{ cx: Number.NaN, cy: 0, w: 1, h: 1, cls: 0, score: 0.9 }]);
    expect(decodeHeadOutputAccounted(bad, undefined, { ...shipped, score: 0.01 }).ok).toBe(false);
    expect(decodeHeadOutputAccounted(bad).ok).toBe(false);
  });
});
