/**
 * M22 — fixture validity (design amendment 2). Pure: boxes, a viewport and a hit predicate in,
 * a category out. No detector, no page text.
 *
 * Categories, for one measured element:
 *
 *   OFFSCREEN           its box does not intersect the viewport (the evaluator's existing exclusion)
 *   PARTIALLY_CLIPPED   its box extends outside the viewport but intersects it; sampled only inside
 *                       the intersection, fraction reported, never in the primary population
 *   HIT_TESTABLE        wholly inside, and every grid point hits it
 *   PARTIALLY_OCCLUDED  wholly inside, and some but not all grid points hit it
 *   FULLY_OCCLUDED      wholly inside, and no grid point hits it
 *   SAMPLING_SENSITIVE  wholly inside, and the 5×5 and 9×9 grids disagree on the category above
 *
 * Only HIT_TESTABLE is in the primary population. A grid hit is the browser's hit test, not a
 * pixel: neither grid proves pixel-level visibility, and no category guarantees an IoU.
 */

export const PRIMARY_GRID = 5;
export const SENSITIVITY_GRID = 9;

export const CATEGORIES = Object.freeze([
  "HIT_TESTABLE",
  "PARTIALLY_OCCLUDED",
  "FULLY_OCCLUDED",
  "SAMPLING_SENSITIVE",
  "PARTIALLY_CLIPPED",
  "OFFSCREEN",
]);

/**
 * Does the element at a point count as the element under test? It, a descendant of it, or a
 * `<label>` whose `control` is it. Anything else — an ancestor, a sibling, an overlay, nothing —
 * does not. Plain DOM calls only, so the audit injects THIS function's source into the page.
 */
export function hitMatches(el, at) {
  if (!at) return false;
  if (at === el) return true;
  if (typeof el.contains === "function" && el.contains(at)) return true;
  return String(at.tagName).toUpperCase() === "LABEL" && at.control === el;
}

/** The box ∩ the viewport, or null when they do not overlap (zero-area overlap included). */
export function viewportIntersection(box, viewport) {
  const x1 = Math.max(box.x, 0);
  const y1 = Math.max(box.y, 0);
  const x2 = Math.min(box.x + box.w, viewport.w);
  const y2 = Math.min(box.y + box.h, viewport.h);
  if (!(x2 > x1 && y2 > y1)) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const whollyInside = (box, viewport) =>
  box.x >= 0 && box.y >= 0 && box.x + box.w <= viewport.w && box.y + box.h <= viewport.h;

/** n×n points at the centres of an n×n partition of a region. Deterministic. */
export function gridPoints(region, n) {
  const pts = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      pts.push({ x: region.x + ((c + 0.5) * region.w) / n, y: region.y + ((r + 0.5) * region.h) / n });
    }
  }
  return pts;
}

/** The occlusion category from a list of per-point hits, for an element wholly inside. */
export function occlusionCategory(hits) {
  const n = hits.filter(Boolean).length;
  if (n === hits.length) return "HIT_TESTABLE";
  if (n === 0) return "FULLY_OCCLUDED";
  return "PARTIALLY_OCCLUDED";
}

/** Which points an element needs sampled: the region and both grids. `null` region = OFFSCREEN. */
export function samplingPlan(box, viewport) {
  if (!(box.w > 0 && box.h > 0)) return { region: null, inside: false, points5: [], points9: [] };
  const region = viewportIntersection(box, viewport);
  if (!region) return { region: null, inside: false, points5: [], points9: [] };
  return {
    region,
    inside: whollyInside(box, viewport),
    points5: gridPoints(region, PRIMARY_GRID),
    points9: gridPoints(region, SENSITIVITY_GRID),
  };
}

/**
 * Classify one element from its box, the viewport, and the hit results for its plan's points.
 *
 * @param hits5 booleans for plan.points5, in order
 * @param hits9 booleans for plan.points9, in order
 */
export function classifyElement(box, viewport, hits5, hits9) {
  const plan = samplingPlan(box, viewport);
  if (!plan.region) return { category: "OFFSCREEN", primary: false, fraction5: null, fraction9: null, category5: null, category9: null };
  if (hits5.length !== plan.points5.length || hits9.length !== plan.points9.length) {
    throw new Error(`classifyElement: expected ${plan.points5.length} and ${plan.points9.length} hits, got ${hits5.length} and ${hits9.length}`);
  }
  const fraction5 = hits5.filter(Boolean).length / hits5.length;
  const fraction9 = hits9.filter(Boolean).length / hits9.length;
  if (!plan.inside) return { category: "PARTIALLY_CLIPPED", primary: false, fraction5, fraction9, category5: null, category9: null };
  const category5 = occlusionCategory(hits5);
  const category9 = occlusionCategory(hits9);
  const category = category5 === category9 ? category5 : "SAMPLING_SENSITIVE";
  return { category, primary: category === "HIT_TESTABLE", fraction5, fraction9, category5, category9 };
}
