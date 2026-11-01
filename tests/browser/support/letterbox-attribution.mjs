/**
 * M21 — where a labelled element was lost, stage by stage. Pure: boxes in, counts out.
 *
 * The letterbox diagnostic (`tests/browser/perception/run-letterbox-diagnostic.mjs`) runs the
 * shipped T1 path and hands this module three things per screen:
 *
 *   labels      the elements the browser actually painted (`getBoundingClientRect`), in CSS px
 *               and, through the shipped forward transform, in model px
 *   decoded     what the head emitted after the shipped decode (score floor, NMS), in model px —
 *               BEFORE the letterbox inverse
 *   projected   what came out of the shipped inverse, in CSS px — what fusion would see
 *
 * and attributes every visible label to exactly one stage:
 *
 *   DETECTED            some projected box overlaps it at IoU > 0.5
 *   LOST_IN_PROJECTION  the head emitted a box for it (model space, IoU > 0.5), but no projected
 *                       box survives for it: the inverse dropped or displaced it
 *   NOT_EMITTED         the head emitted nothing for it at the shipped operating point — a model
 *                       outcome, not a geometry one
 *
 * IoU > 0.5 is the frozen fusion threshold (constitution §7), class-agnostic on purpose: the
 * question is whether geometry lost the element, not whether the head named it correctly. Class
 * agreement is counted separately.
 *
 * Nothing here reads page text, and nothing it returns carries a box: counts and model-px sizes.
 */

export const MATCH_IOU = 0.5;

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

/** Where a CSS box sits against the viewport. Only VISIBLE labels are attributed. */
export function visibility(box, viewport) {
  if (!(box.w > 0 && box.h > 0)) return "OFFSCREEN";
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  if (right <= 0 || bottom <= 0 || box.x >= viewport.w || box.y >= viewport.h) return "OFFSCREEN";
  if (box.x >= 0 && box.y >= 0 && right <= viewport.w && bottom <= viewport.h) return "VISIBLE";
  return "PARTIAL";
}

const best = (box, candidates) => {
  let score = 0;
  let index = -1;
  candidates.forEach((c, i) => {
    const v = iou(box, c.box);
    if (v > score) {
      score = v;
      index = i;
    }
  });
  return { score, index };
};

/**
 * Attribute every label of one screen.
 *
 * @param labels    [{ cls, css: {x,y,w,h}, model: {x,y,w,h} }]
 * @param decoded   [{ label, box: model {x,y,w,h} }]
 * @param projected [{ label, box: css {x,y,w,h} }]
 * @param viewport  { w, h } CSS px
 */
export function attributeScreen({ labels, decoded, projected, viewport }) {
  const out = { visible: 0, partial: 0, offscreen: 0, DETECTED: 0, LOST_IN_PROJECTION: 0, NOT_EMITTED: 0, classAgrees: 0, sizes: { DETECTED: [], LOST_IN_PROJECTION: [], NOT_EMITTED: [] } };
  for (const l of labels) {
    const v = visibility(l.css, viewport);
    if (v === "OFFSCREEN") {
      out.offscreen += 1;
      continue;
    }
    if (v === "PARTIAL") {
      out.partial += 1;
      continue;
    }
    out.visible += 1;
    const minSideModel = Math.min(l.model.w, l.model.h);
    const final = best(l.css, projected);
    let stage;
    if (final.score > MATCH_IOU) {
      stage = "DETECTED";
      if (projected[final.index].label === l.cls) out.classAgrees += 1;
    } else if (best(l.model, decoded).score > MATCH_IOU) {
      stage = "LOST_IN_PROJECTION";
    } else {
      stage = "NOT_EMITTED";
    }
    out[stage] += 1;
    out.sizes[stage].push(minSideModel);
  }
  return out;
}

/** Sum per-screen attributions. Sizes are concatenated; the caller summarises them. */
export function sumAttributions(list) {
  const total = { visible: 0, partial: 0, offscreen: 0, DETECTED: 0, LOST_IN_PROJECTION: 0, NOT_EMITTED: 0, classAgrees: 0, sizes: { DETECTED: [], LOST_IN_PROJECTION: [], NOT_EMITTED: [] } };
  for (const a of list) {
    for (const k of ["visible", "partial", "offscreen", "DETECTED", "LOST_IN_PROJECTION", "NOT_EMITTED", "classAgrees"]) total[k] += a[k];
    for (const k of Object.keys(total.sizes)) total.sizes[k].push(...a.sizes[k]);
  }
  return total;
}

/** Sum objects of counts field by field (decode and projection accounting). */
export function sumCounts(list) {
  const total = {};
  for (const c of list) for (const [k, v] of Object.entries(c)) total[k] = (total[k] ?? 0) + v;
  return total;
}
