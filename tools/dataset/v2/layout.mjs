/**
 * v2 layout: one sample's elements and boxes, from its seed and its scheduled targets. Pure.
 *
 * Rules, each the fix for an M22.1 finding:
 *   - Every element gets an explicit box; HTML gives it `position:absolute` with exactly that box
 *     (`html.mjs`). No element's coordinates can be ignored by the browser, icons included.
 *   - Nothing is placed over the masthead: placement starts below it.
 *   - Intended positives never overlap each other: a seeded shelf packing with clearance.
 *   - Each target's shorter side is an INTEGER number of CSS px chosen so that, at this sample's
 *     scale, it lies inside its size bucket — rounding cannot move a target into another bucket.
 *   - Occlusion is never accidental: a target is occluded only as an explicit, labelled occlusion
 *     case, with its own occluder element.
 *   - A target that does not fit is returned in `deferred`, never silently dropped.
 */
import { CLASS_GEOMETRY, LAYOUT, SIZE_BUCKETS, V2, VIEWPORTS } from "./config.mjs";
import { rngOf } from "./prng.mjs";

const WORDS = Object.freeze(["Apply", "Next", "Back", "Save", "Open", "Close", "Find", "Help", "Edit", "Done", "Start", "Step"]);

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

/**
 * Lay out one sample.
 * @param plan       { id, split, seed } from `planSplitIds`
 * @param targets    [{ cls, bucket }] from `dealTargets`
 * @param occlusion  { share: 0..1, kinds: ["partial" | "full", ...] } — REQUIRED; share 0 means none
 */
export function layoutSample(plan, targets, occlusion) {
  if (!occlusion || !(occlusion.share >= 0 && occlusion.share <= 1) || !Array.isArray(occlusion.kinds)) {
    throw new Error("layout: occlusion { share, kinds } must be stated (share 0 for none)");
  }
  if (occlusion.share > 0 && (occlusion.kinds.length === 0 || occlusion.kinds.some((k) => k !== "partial" && k !== "full"))) {
    throw new Error("layout: occlusion kinds must be 'partial' and/or 'full'");
  }
  const rng = rngOf(plan.seed);
  const viewport = rng.pick(VIEWPORTS);
  const scale = scaleOf(viewport);
  const mastheadH = rng.int(LAYOUT.mastheadHeight[0], LAYOUT.mastheadHeight[1]);
  const m = LAYOUT.margin;
  const maxW = viewport.w - 2 * m;

  const sized = rng.shuffle(targets).map((t) => {
    const [lo, hi] = cssShorterRange(t.bucket, scale);
    const s = rng.int(lo, hi);
    return { ...t, ...sizeTarget(rng, t.cls, s, maxW) };
  });

  const placed = [];
  const deferred = [];
  let x = m + rng.int(0, LAYOUT.clearance[1]);
  let y = mastheadH + m;
  let rowH = 0;
  for (const t of sized) {
    const gap = rng.int(LAYOUT.clearance[0], LAYOUT.clearance[1]);
    if (x + t.w + m > viewport.w) {
      x = m + rng.int(0, LAYOUT.clearance[1]);
      if (x + t.w + m > viewport.w) x = m; // a wide element starts flush, rather than being deferred
      y += rowH + gap;
      rowH = 0;
    }
    if (x + t.w + m > viewport.w || y + t.h + m > viewport.h) {
      deferred.push({ cls: t.cls, bucket: t.bucket });
      continue;
    }
    placed.push({ ...t, box: { x, y, w: t.w, h: t.h } });
    x += t.w + gap;
    rowH = Math.max(rowH, t.h);
  }

  // Stable order: top to bottom, then left to right. Keys are assigned AFTER sorting.
  placed.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const elements = placed.map((p, k) => ({
    key: `${plan.id}-e${String(k).padStart(3, "0")}`,
    cls: p.cls,
    bucket: p.bucket,
    intent: "positive",
    box: p.box,
    ...(p.shape ? { shape: p.shape } : {}),
    ...(["button", "link", "tab", "select"].includes(p.cls) ? { label: rng.pick(WORDS) } : {}),
  }));

  // Explicit occlusion cases: each element is one with probability `share`, from this sample's seed,
  // and gets its own occluder. Never accidental. (Per element, not `round(n × share)` per sample:
  // with a few targets per sample that rounds to zero everywhere and the share is silently lost.)
  const occluders = [];
  for (const e of elements.filter(() => occlusion.share > 0 && rng.next() < occlusion.share)) {
    const kind = rng.pick(occlusion.kinds);
    e.intent = `occlusion-${kind}`;
    const b = e.box;
    occluders.push({
      for: e.key,
      kind,
      box: kind === "full" ? { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 } : { x: b.x + Math.floor(b.w / 2), y: b.y - 1, w: Math.ceil(b.w / 2) + 1, h: b.h + 2 },
    });
  }
  occluders.sort((a, b) => (a.for < b.for ? -1 : 1));

  return {
    version: V2.version,
    id: plan.id,
    split: plan.split,
    seed: plan.seed,
    viewport: { w: viewport.w, h: viewport.h },
    scale,
    masthead: { x: 0, y: 0, w: viewport.w, h: mastheadH },
    elements,
    occluders,
    deferred,
  };
}
