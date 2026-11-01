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
 *
 * PROVENANCE (M22.3). A spec records everything its pixels will come from, so a label can be traced
 * to the visual context that produced it: the seed and how it was derived; the viewport, scale,
 * masthead and usable area; the page appearance (palette, font, control style, density); per
 * element its declared box and declared positioning, region, drawn and realised size and aspect,
 * own appearance (an icon's glyph and plate, the hit-safe corner radius) and its occluder, if any;
 * per occluder its id, role, kind, target, box and the share of the target it covers; and the
 * unlabelled decor. Nothing is personal or page-derived: words come from a fixed neutral list.
 *
 * STREAMS. Geometry draws from the seed's `layout` stream, element details from `elements`, decor
 * from `decor` and the page look from `appearance`; each is independent of the others.
 */
import { CLASS_GEOMETRY, DECOR_KINDS, LAYOUT, SIZE_BUCKETS, V2, VIEWPORTS } from "./config.mjs";
import { PRNG, SEED_SCHEME, rngOf } from "./prng.mjs";
import { controlStyleOf, densityLevelOf, elementAppearanceOf, pageAppearanceOf } from "./appearance.mjs";
import { sampleIdentity, seedFor } from "./splits.mjs";

export const GRID = 3; // 3 × 3 regions
export const PLACEMENT_ATTEMPTS = 48; // seeded candidate positions tried per region
const MIN_CLEARANCE = LAYOUT.clearance[0];
const DECOR_ATTEMPTS = 24;
const DECOR_CLEARANCE = 4;

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
const intersectArea = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The box of one target, before placement. Shorter side exactly `s` CSS px; aspect drawn log-uniformly. */
function sizeTarget(rng, cls, s, maxW) {
  const [lo, hi] = CLASS_GEOMETRY[cls].aspect;
  const aspectDrawn = lo === hi ? lo : Math.exp(rng.between(Math.log(lo), Math.log(hi)));
  let w;
  let h;
  if (aspectDrawn >= 1) {
    h = s;
    w = Math.max(s, Math.min(maxW, Math.round(s * aspectDrawn)));
  } else {
    w = s;
    h = Math.max(s, Math.round(s / aspectDrawn));
  }
  return { w, h, aspectDrawn, clampedToArea: aspectDrawn >= 1 && Math.round(s * aspectDrawn) > maxW };
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

/** Unlabelled decor in the space the labelled elements and occluders left free. Best effort: a block with no room is skipped. */
function layoutDecor(rng, plan, area, density, taken) {
  const [lo, hi] = densityLevelOf(density).decor;
  const want = rng.int(lo, hi);
  const blocked = [...taken];
  const out = [];
  for (let k = 0; k < want; k += 1) {
    const kind = rng.pick(DECOR_KINDS);
    const extra = {};
    let w;
    let h;
    if (kind === "text-lines") {
      extra.lines = rng.int(2, 4);
      extra.lineHeight = rng.int(6, 10);
      extra.gap = rng.int(4, 8);
      w = rng.int(80, 320);
      h = extra.lines * extra.lineHeight + (extra.lines - 1) * extra.gap;
    } else if (kind === "divider") {
      w = rng.int(120, 600);
      h = rng.int(1, 2);
    } else {
      w = rng.int(120, 400);
      h = rng.int(60, 220);
    }
    w = Math.min(w, area.w);
    h = Math.min(h, area.h);
    for (let a = 0; a < DECOR_ATTEMPTS; a += 1) {
      const box = { x: area.x + rng.int(0, area.w - w), y: area.y + rng.int(0, area.h - h), w, h };
      if (blocked.every((b) => clear(box, b, DECOR_CLEARANCE))) {
        blocked.push(box);
        out.push({ kind, box, ...extra });
        break;
      }
    }
  }
  out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  return out.map((d, k) => ({ id: `${plan.id}-d${String(k).padStart(3, "0")}`, ...d }));
}

/**
 * Lay out one sample.
 * @param plan    { id, split, index, seed, overflow? } — `seed` must be the seed of (split, index)
 * @param targets [{ cls, bucket, role }] — role "positive", "occlusion-partial" or "occlusion-full"
 */
export function layoutSample(plan, targets) {
  for (const t of targets) {
    if (!["positive", "occlusion-partial", "occlusion-full"].includes(t.role)) throw new Error(`layout: unknown target role ${JSON.stringify(t.role)}`);
  }
  if (plan.seed !== seedFor(plan.split, plan.index)) throw new Error(`layout: ${plan.id} carries a seed that is not the seed of (${plan.split}, ${plan.index})`);
  const rng = rngOf(plan.seed, "layout");
  const viewport = rng.pick(VIEWPORTS);
  const scale = scaleOf(viewport);
  const mastheadH = rng.int(LAYOUT.mastheadHeight[0], LAYOUT.mastheadHeight[1]);
  const area = usableArea(viewport, mastheadH);
  const perm = rng.shuffle([...Array(GRID * GRID).keys()]);
  const page = pageAppearanceOf(plan.seed);
  const style = controlStyleOf(page.controlStyle);

  // Larger boxes first: they have the fewest places to go. Ties keep the seeded order.
  const sized = rng.shuffle(targets).map((t, i) => {
    const [lo, hi] = cssShorterRange(t.bucket, scale);
    const shorterCss = rng.int(lo, hi);
    return { ...t, order: i, shorterCss, ...sizeTarget(rng, t.cls, shorterCss, area.w) };
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
  const look = rngOf(plan.seed, "elements");
  let nOccluders = 0;
  const elements = placed.map((p, k) => ({
    key: `${plan.id}-e${String(k).padStart(3, "0")}`,
    cls: p.cls,
    bucket: p.bucket,
    intent: p.role,
    box: p.box,
    declaredPosition: "absolute",
    region: p.region,
    preferredRegion: p.preferredRegion,
    size: {
      shorterCss: p.shorterCss,
      shorterModel: p.shorterCss * scale,
      aspectDrawn: p.aspectDrawn,
      aspectRealised: p.box.w / p.box.h,
      clampedToArea: p.clampedToArea,
    },
    appearance: elementAppearanceOf(look, p.cls, p.box.w, p.box.h, style),
    occluderId: p.role === "positive" ? null : `${plan.id}-o${String(nOccluders++).padStart(3, "0")}`,
  }));

  // An occluder for each occlusion-case target, and for nothing else.
  const occluders = elements
    .filter((e) => e.intent !== "positive")
    .map((e) => {
      const b = e.box;
      const kind = e.intent === "occlusion-full" ? "full" : "partial";
      const box = kind === "full" ? { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 } : { x: b.x + Math.floor(b.w / 2), y: b.y - 1, w: Math.ceil(b.w / 2) + 1, h: b.h + 2 };
      return { id: e.occluderId, role: "occluder", kind, for: e.key, box, coversTargetShare: intersectArea(box, b) / (b.w * b.h) };
    });

  const decor = layoutDecor(rngOf(plan.seed, "decor"), plan, area, page.density, [...elements.map((e) => e.box), ...occluders.map((o) => o.box)]);

  return {
    version: V2.version,
    generator: V2.generator,
    id: plan.id,
    split: plan.split,
    index: plan.index,
    overflow: plan.overflow === true,
    seed: plan.seed,
    seedDerivation: { scheme: SEED_SCHEME, identity: sampleIdentity(plan.split, plan.index), prng: PRNG },
    viewport: { w: viewport.w, h: viewport.h },
    scale,
    masthead: { x: 0, y: 0, w: viewport.w, h: mastheadH },
    area,
    appearance: page,
    elements,
    occluders,
    decor,
    deferred,
  };
}
