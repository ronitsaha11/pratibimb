/**
 * v2 layout: one sample's elements and boxes, from its seed and its scheduled targets. Pure.
 *
 * PLACEMENT IS STRATIFIED (M22.2 hardening). The review measured the earlier top-left shelf packing:
 * sparse pages had 95% of element centres in the left quarter and 100% in the top quarter; dense pages
 * had 99% in the top half. Now:
 *
 *   1. The USABLE AREA is the viewport below the masthead, inside the margin.
 *   2. It is divided into a 3 × 3 grid of REGIONS. Each sample draws a seeded permutation of the nine;
 *      target i prefers region perm[i mod 9], so targets spread over regions within a page and,
 *      because the permutation changes per sample, across pages.
 *   3. Within a region, a seeded search places the element's CENTRE inside the region, with the whole
 *      box inside the usable area and at least the minimum clearance from every element already
 *      placed. If the preferred region has no room, the other regions are tried in permutation order.
 *   4. A target with no room anywhere is returned in `deferred`, never dropped; `plan.mjs` reschedules
 *      it.
 *
 * Unchanged rules: every element gets an explicit integer box (`html.mjs` gives it
 * `position:absolute`); nothing overlaps the masthead; intended positives never overlap; each
 * target's shorter side is an integer CSS size inside its bucket at this sample's scale; occlusion
 * happens only for targets whose ROLE is an occlusion case, each with its own occluder.
 */
import { CLASS_GEOMETRY, LAYOUT, SIZE_BUCKETS, V2, VIEWPORTS } from "./config.mjs";
import { rngOf } from "./prng.mjs";

const WORDS = Object.freeze(["Apply", "Next", "Back", "Save", "Open", "Close", "Find", "Help", "Edit", "Done", "Start", "Step"]);
export const GRID = 3; // 3 × 3 regions
export const PLACEMENT_ATTEMPTS = 48; // seeded candidate positions tried per region
const MIN_CLEARANCE = LAYOUT.clearance[0];

export const scaleOf = (viewport) => V2.modelInput / Math.max(viewport.w, viewport.h);

/** The integer CSS shorter-side range that lands inside a bucket at a given scale. */
export function cssShorterRange(bucketId, scale) {
  const b = SIZE_BUCKETS.find((x) => x.id === bucketId);
  if (!b) throw new Error(`unknown bucket ${bucketId}`);
  const lo = Math.ceil(b.drawLo / scale);
  const hi = Math.floor(b.drawHi / scale);
  if (lo > hi) throw new Error(`bucket ${bucketId} has no integer CSS size at scale ${scale}`);
  return [lo, hi];
}

/** The usable area: below the masthead, inside the margin. */
export function usableArea(viewport, mastheadH) {
  const m = LAYOUT.margin;
  return { x: m, y: mastheadH + m, w: viewport.w - 2 * m, h: viewport.h - mastheadH - 2 * m };
}

/** Region r (0..8, row-major) of an area. */
export function regionOf(area, r) {
  const col = r % GRID;
  const row = Math.floor(r / GRID);
  return { x: area.x + (col * area.w) / GRID, y: area.y + (row * area.h) / GRID, w: area.w / GRID, h: area.h / GRID };
}

const clear = (a, b, c) => !(a.x < b.x + b.w + c && b.x < a.x + a.w + c && a.y < b.y + b.h + c && b.y < a.y + a.h + c);

/** The box of one target, before placement. Shorter side exactly `s` CSS px. */
function sizeTarget(rng, cls, s, maxW) {
  const g = CLASS_GEOMETRY[cls];
  const a = rng.between(g.aspect[0], g.aspect[1]);
  let w;
  let h;
  if (a >= 1) {
    h = s;
    w = Math.max(s, Math.min(maxW, Math.round(s * a)));
  } else {
    w = s;
    h = Math.max(s, Math.round(s / a));
  }
  return { w, h, shape: g.shapes ? rng.pick(g.shapes) : undefined };
}

/** Try to place a w × h box with its centre in one region. Returns the box or null. */
function placeInRegion(rng, area, region, w, h, placed) {
  const cxLo = Math.max(region.x, area.x + w / 2);
  const cxHi = Math.min(region.x + region.w, area.x + area.w - w / 2);
  const cyLo = Math.max(region.y, area.y + h / 2);
  const cyHi = Math.min(region.y + region.h, area.y + area.h - h / 2);
  if (cxLo > cxHi || cyLo > cyHi) return null;
  for (let k = 0; k < PLACEMENT_ATTEMPTS; k += 1) {
    const x = Math.round(rng.between(cxLo, cxHi) - w / 2);
    const y = Math.round(rng.between(cyLo, cyHi) - h / 2);
    if (x < area.x || y < area.y || x + w > area.x + area.w || y + h > area.y + area.h) continue;
    const box = { x, y, w, h };
    if (placed.every((p) => clear(box, p, MIN_CLEARANCE))) return box;
  }
  return null;
}

/**
 * Lay out one sample.
 * @param plan    { id, split, seed }
 * @param targets [{ cls, bucket, role }] — role "positive", "occlusion-partial" or "occlusion-full"
 */
export function layoutSample(plan, targets) {
  for (const t of targets) {
    if (!["positive", "occlusion-partial", "occlusion-full"].includes(t.role)) throw new Error(`layout: unknown target role ${JSON.stringify(t.role)}`);
  }
  const rng = rngOf(plan.seed);
  const viewport = rng.pick(VIEWPORTS);
  const scale = scaleOf(viewport);
  const mastheadH = rng.int(LAYOUT.mastheadHeight[0], LAYOUT.mastheadHeight[1]);
  const area = usableArea(viewport, mastheadH);
  const perm = rng.shuffle([...Array(GRID * GRID).keys()]);

  // Larger boxes first: they have the fewest places to go. Ties keep the seeded order.
  const sized = rng.shuffle(targets).map((t, i) => {
    const [lo, hi] = cssShorterRange(t.bucket, scale);
    return { ...t, order: i, ...sizeTarget(rng, t.cls, rng.int(lo, hi), area.w) };
  });
  sized.sort((a, b) => b.w * b.h - a.w * a.h || a.order - b.order);

  const placedBoxes = [];
  const placed = [];
  const deferred = [];
  sized.forEach((t, i) => {
    const preferred = i % (GRID * GRID);
    const tryOrder = [...perm.slice(preferred), ...perm.slice(0, preferred)];
    for (const r of tryOrder) {
      const box = placeInRegion(rng, area, regionOf(area, r), t.w, t.h, placedBoxes);
      if (box) {
        placedBoxes.push(box);
        placed.push({ ...t, box, region: r, preferredRegion: perm[preferred] });
        return;
      }
    }
    deferred.push({ cls: t.cls, bucket: t.bucket, role: t.role });
  });

  // Stable order: top to bottom, then left to right. Keys are assigned AFTER sorting.
  placed.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const elements = placed.map((p, k) => ({
    key: `${plan.id}-e${String(k).padStart(3, "0")}`,
    cls: p.cls,
    bucket: p.bucket,
    intent: p.role,
    box: p.box,
    region: p.region,
    ...(p.shape ? { shape: p.shape } : {}),
    ...(["button", "link", "tab", "select"].includes(p.cls) ? { label: rng.pick(WORDS) } : {}),
  }));

  // An occluder for each occlusion-case target, and for nothing else.
  const occluders = elements
    .filter((e) => e.intent !== "positive")
    .map((e) => {
      const b = e.box;
      const kind = e.intent === "occlusion-full" ? "full" : "partial";
      return {
        for: e.key,
        kind,
        box: kind === "full" ? { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 } : { x: b.x + Math.floor(b.w / 2), y: b.y - 1, w: Math.ceil(b.w / 2) + 1, h: b.h + 2 },
      };
    });

  return {
    version: V2.version,
    id: plan.id,
    split: plan.split,
    seed: plan.seed,
    viewport: { w: viewport.w, h: viewport.h },
    scale,
    masthead: { x: 0, y: 0, w: viewport.w, h: mastheadH },
    area,
    elements,
    occluders,
    deferred,
  };
}
