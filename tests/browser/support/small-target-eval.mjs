/**
 * M22 — small-target evaluation of the T1 head. Pure: tensors and boxes in, counts out.
 *
 * Implements `artifacts/experiments/M22-small-target-recall/design.md` §4–§6, which was frozen
 * before any M22 run. Nothing here chooses a threshold or a bucket: those are the design's.
 *
 *   bucketOf            the design's size buckets (shorter side, model px; stride 8, RF ~31)
 *   rawAnchors          every anchor of the head's output, read by the decode's own rules
 *   matchLikeEvaluator  `@pratibimb/evaluation` `evaluate()`'s matching, per element; the harness
 *                       checks its totals against `evaluate()` itself on every cell
 *   attributeMiss       the first pipeline stage at which a missed element's evidence disappears
 *   cellCentresInside   how many stride-8 cell centres a model-space box contains
 *
 * Boxes are `{x, y, w, h}`. Nothing returned for a record carries a box.
 */

export const STRIDE = 8;
export const MODEL_SIZE = 640;
export const MATCH_IOU = 0.5; // the evaluator's IOU_THRESHOLD, matched with >=

export const BUCKETS = Object.freeze([
  Object.freeze({ id: "very-small", lo: 0, hi: 8 }),
  Object.freeze({ id: "small", lo: 8, hi: 16 }),
  Object.freeze({ id: "medium", lo: 16, hi: 32 }),
  Object.freeze({ id: "large", lo: 32, hi: Number.POSITIVE_INFINITY }),
]);

/** Bucket of a box by its shorter side in model px. */
export function bucketOf(modelBox) {
  const s = Math.min(modelBox.w, modelBox.h);
  for (const b of BUCKETS) if (s >= b.lo && s < b.hi) return b.id;
  return null; // non-finite or negative: not a box
}

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Every anchor of a `[1, 4 + C, A]` output, by the decode's rules: the top class is the first
 * strict maximum over classes starting from 0 (an anchor scoring 0 everywhere has none), and the
 * centre-form box becomes corner form. Anchors with a non-finite value or a non-positive extent
 * are left out, as the decode leaves them out.
 */
export function rawAnchors(data, dims, classes) {
  const C = classes.length;
  const A = dims[2];
  if (dims.length !== 3 || dims[0] !== 1 || dims[1] !== 4 + C || data.length !== (4 + C) * A) {
    throw new Error(`rawAnchors: unexpected output dims ${JSON.stringify(dims)}`);
  }
  const out = [];
  for (let a = 0; a < A; a += 1) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < C; c += 1) {
      const s = data[(4 + c) * A + a];
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best < 0) continue;
    const cx = data[a];
    const cy = data[A + a];
    const w = data[2 * A + a];
    const h = data[3 * A + a];
    if (![cx, cy, w, h, bestScore].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    out.push({ box: { x: cx - w / 2, y: cy - h / 2, w, h }, label: classes[best], score: bestScore });
  }
  return out;
}

/**
 * The evaluator's matching for ONE sample: per class, predictions in confidence order (ties by x
 * then y), each claims the unclaimed ground truth of its class with the highest IoU, and keeps it
 * when that IoU is >= 0.5. OFFSCREEN ground truth must already be removed.
 *
 * @param gts   [{ id, cls, box }]
 * @param preds [{ cls, box, confidence }]
 * @returns { gtMatchedBy: Map<gtId, predIndex>, predTp: boolean[] }
 */
export function matchLikeEvaluator(gts, preds) {
  const gtMatchedBy = new Map();
  const predTp = preds.map(() => false);
  const classes = [...new Set([...gts.map((g) => g.cls), ...preds.map((p) => p.cls)])];
  for (const cls of classes) {
    const g = gts.filter((x) => x.cls === cls);
    const order = preds
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.cls === cls)
      .sort((a, b) => b.p.confidence - a.p.confidence || a.p.box.x - b.p.box.x || a.p.box.y - b.p.box.y);
    for (const { p, i } of order) {
      let bestIou = 0;
      let best = null;
      for (const a of g) {
        if (gtMatchedBy.has(a.id)) continue;
        const v = iou(p.box, a.box);
        if (v > bestIou) {
          bestIou = v;
          best = a;
        }
      }
      if (best && bestIou >= MATCH_IOU) {
        gtMatchedBy.set(best.id, i);
        predTp[i] = true;
      }
    }
  }
  return { gtMatchedBy, predTp };
}

/** How many stride-8 cell centres lie inside a model-space box (inclusive, as training assigns). */
export function cellCentresInside(b) {
  let n = 0;
  const c0 = Math.max(0, Math.ceil((b.x / STRIDE) - 0.5));
  const c1 = Math.min(MODEL_SIZE / STRIDE - 1, Math.floor(((b.x + b.w) / STRIDE) - 0.5));
  const r0 = Math.max(0, Math.ceil((b.y / STRIDE) - 0.5));
  const r1 = Math.min(MODEL_SIZE / STRIDE - 1, Math.floor(((b.y + b.h) / STRIDE) - 0.5));
  for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) n += 1;
  return n;
}

const anyMatch = (box, list, cls = null) => list.some((d) => (cls === null || d.label === cls) && iou(box, d.box) >= MATCH_IOU);

/**
 * The first stage at which a missed element's evidence disappears (design §6).
 *
 * @param gt        { cls, model: box (model px), css: box (CSS px) }
 * @param content   { x, y, w, h } — the letterboxed content region, model px
 * @param raw       rawAnchors(...) of this screen
 * @param floor     the score floor in force
 * @param survivors the decode's output, model px: [{ label, box, score }]
 * @param projected predictions in CSS px: [{ label, box }]
 */
export function attributeMiss({ gt, content, raw, floor, survivors, projected }) {
  const m = gt.model;
  const inContent = m.x >= content.x - 1e-9 && m.y >= content.y - 1e-9 && m.x + m.w <= content.x + content.w + 1e-9 && m.y + m.h <= content.y + content.h + 1e-9;
  if (!(m.w >= 1 && m.h >= 1) || !inContent) return "PREPROCESSING";
  const localised = raw.filter((a) => iou(m, a.box) >= MATCH_IOU);
  if (localised.length === 0) return "INFERENCE_NOT_LOCALIZED";
  const rightClass = localised.filter((a) => a.label === gt.cls);
  if (rightClass.length === 0) return "INFERENCE_WRONG_CLASS";
  if (!rightClass.some((a) => a.score >= floor)) return "SCORE_FILTER";
  if (!anyMatch(m, survivors, gt.cls)) return "NMS";
  if (!anyMatch(gt.css, projected, gt.cls)) return "INVERSE_GEOMETRY";
  return "ASSIGNMENT";
}

export const STAGES = Object.freeze(["PREPROCESSING", "INFERENCE_NOT_LOCALIZED", "INFERENCE_WRONG_CLASS", "SCORE_FILTER", "NMS", "INVERSE_GEOMETRY", "ASSIGNMENT"]);

/** p10 / p50 / p90 by nearest rank, rounded; nulls for an empty set. */
export function quantiles(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => (s.length ? Math.round(s[Math.ceil(p * s.length) - 1] * 1000) / 1000 : null);
  return { n: s.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

export const median = (xs) => quantiles(xs).p50;

/**
 * The evaluator's validator refuses an empty split, so a dataset of DEV screens carries one
 * never-rendered placeholder per non-dev split — exactly Track B's construction, with W1's
 * constants (`w1-guards.mjs`). `evaluate(…, "dev")` never reads them. They are not TEST data.
 */
export function placeholderSamples(prefix, viewport, guards) {
  const { PLACEHOLDER_SPLITS, PLACEHOLDER_EXTENT, PLACEHOLDER_SEED_BASE, PLACEHOLDER_FRAME } = guards;
  return PLACEHOLDER_SPLITS.map((sp) => ({
    id: `${prefix}-placeholder-${sp}`,
    split: sp,
    provenance: { kind: "SYNTHETIC", generator: "t1-ui-renderer@1.0.0", seed: PLACEHOLDER_SEED_BASE + PLACEHOLDER_SPLITS.indexOf(sp) + 1 },
    viewportCss: { w: viewport.w, h: viewport.h },
    dpr: 1,
    zoom: 1.0,
    captureSize: { w: viewport.w, h: viewport.h },
    scroll: { x: 0, y: 0 },
    annotations: [{ id: `${prefix}-placeholder-${sp}-a0`, cls: "button", box: { x: 0, y: 0, w: PLACEHOLDER_EXTENT[sp], h: PLACEHOLDER_EXTENT[sp] }, visibility: "VISIBLE" }],
    framePath: PLACEHOLDER_FRAME,
  }));
}
