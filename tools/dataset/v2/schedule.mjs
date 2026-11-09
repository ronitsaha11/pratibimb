/**
 * v2 coverage schedule: which targets each sample of a split must draw.
 *
 * TWO SEPARATE QUOTAS, both owner input, both explicit integers, per split × class × size bucket:
 *
 *   positives[split][class][bucket]                     intended positive training targets
 *   occlusionCases[split][class][bucket].{partial,full} intentional occlusion cases, ADDED ON TOP
 *
 * An occlusion case never consumes a positive: a cell with 40 positives and 4 occlusion cases plans
 * 44 targets of that class and size. (Until M22.2's hardening, occlusion was drawn from the scheduled
 * targets, so positives fell below what was asked for.) Nothing here has a default: an incomplete
 * schedule is refused, so a class, a bucket or a kind cannot be left out by omission.
 *
 * `maxTargetsPerSample` and `maxOverflowSamples` bound the plan: targets a layout cannot place are
 * rescheduled to overflow samples (`plan.mjs`), at most `maxOverflowSamples` of them; a plan that
 * still cannot place everything is refused, never silently reduced.
 *
 * DEALING (M22.3). Targets are shuffled with a split-specific seed and dealt so that page density
 * VARIES: each sample's seed draws a density level (`appearance.mjs`), and the sample is dealt a share
 * of the split's targets in proportion to that level's weight, capped at `maxTargetsPerSample`. Every
 * sample gets at least one target: an empty page has an empty layout, and the gate's G7 compares
 * layouts exactly, so two empty pages in two splits would read as a shared layout.
 */
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { rngOf, seedOf } from "./prng.mjs";
import { densityLevelOf, pageAppearanceOf } from "./appearance.mjs";

export const BUCKET_IDS = Object.freeze(SIZE_BUCKETS.map((b) => b.id));
export const OCCLUSION_KINDS = Object.freeze(["partial", "full"]);
/** A target's role: what the layout must make of it. */
export const ROLES = Object.freeze(["positive", "occlusion-partial", "occlusion-full"]);

const isCount = (n) => Number.isInteger(n) && n >= 0;

function refuseUnknownKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {})) if (!allowed.includes(k)) throw new Error(`schedule: unknown ${where} ${JSON.stringify(k)}`);
}

/**
 * Refuse a schedule that is not complete and explicit for `split`. Returns the planned totals.
 */
export function validateSchedule(schedule, split) {
  const maxT = schedule?.maxTargetsPerSample;
  if (!Number.isInteger(maxT) || maxT <= 0) throw new Error("schedule: maxTargetsPerSample must be a positive integer");
  if (!isCount(schedule?.maxOverflowSamples)) throw new Error("schedule: maxOverflowSamples must be a stated non-negative integer");
  const pos = schedule?.positives?.[split];
  const occ = schedule?.occlusionCases?.[split];
  if (!pos) throw new Error(`schedule: no positive quotas for split ${split}`);
  if (!occ) throw new Error(`schedule: no occlusion-case quotas for split ${split} (state zeros for none)`);
  refuseUnknownKeys(pos, CLASSES, "class in positives");
  refuseUnknownKeys(occ, CLASSES, "class in occlusionCases");
  const totals = { positives: 0, occlusionPartial: 0, occlusionFull: 0 };
  for (const cls of CLASSES) {
    refuseUnknownKeys(pos[cls], BUCKET_IDS, `bucket in positives.${cls}`);
    refuseUnknownKeys(occ[cls], BUCKET_IDS, `bucket in occlusionCases.${cls}`);
    for (const b of BUCKET_IDS) {
      const p = pos[cls]?.[b];
      if (!isCount(p)) throw new Error(`schedule: positives ${split}/${cls}/${b} must be a stated non-negative integer`);
      const o = occ[cls]?.[b];
      refuseUnknownKeys(o, OCCLUSION_KINDS, `kind in occlusionCases.${cls}.${b}`);
      for (const k of OCCLUSION_KINDS) {
        if (!isCount(o?.[k])) throw new Error(`schedule: occlusionCases ${split}/${cls}/${b}/${k} must be a stated non-negative integer`);
      }
      totals.positives += p;
      totals.occlusionPartial += o.partial;
      totals.occlusionFull += o.full;
    }
  }
  return { ...totals, all: totals.positives + totals.occlusionPartial + totals.occlusionFull };
}

/** Every scheduled target of a split, in a fixed canonical order. */
export function scheduledTargets(schedule, split) {
  validateSchedule(schedule, split);
  const out = [];
  for (const cls of CLASSES) {
    for (const b of BUCKET_IDS) {
      for (let k = 0; k < schedule.positives[split][cls][b]; k += 1) out.push({ cls, bucket: b, role: "positive" });
      for (const kind of OCCLUSION_KINDS) {
        for (let k = 0; k < schedule.occlusionCases[split][cls][b][kind]; k += 1) out.push({ cls, bucket: b, role: `occlusion-${kind}` });
      }
    }
  }
  return out;
}

/**
 * How many targets each sample gets: at least 1 each, the rest in proportion to `weights`, none above
 * `cap`. Water-filling, then largest remainder (ties to the lower index). Deterministic, exact: the
 * counts sum to `total`.
 */
export function allocateTargets(weights, total, cap) {
  const n = weights.length;
  if (total > n * cap) throw new Error(`schedule: ${total} targets do not fit ${n} samples × ${cap}`);
  if (total < n) throw new Error(`schedule: ${total} targets for ${n} samples would leave a page empty; plan fewer samples`);
  const extraCap = cap - 1;
  const rest = total - n;
  const fixed = new Array(n).fill(false);
  let lambda = 0;
  for (;;) {
    const free = weights.map((w, i) => i).filter((i) => !fixed[i]);
    const w = free.reduce((acc, i) => acc + weights[i], 0);
    if (free.length === 0 || w === 0) break;
    lambda = (rest - (n - free.length) * extraCap) / w;
    const newlyFixed = free.filter((i) => lambda * weights[i] >= extraCap);
    if (newlyFixed.length === 0) break;
    for (const i of newlyFixed) fixed[i] = true;
  }
  const real = weights.map((w, i) => (fixed[i] ? extraCap : lambda * w));
  const extra = real.map(Math.floor);
  let left = rest - extra.reduce((a, b) => a + b, 0);
  const order = real.map((r, i) => [r - Math.floor(r), i]).filter(([, i]) => !fixed[i]).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  for (const [, i] of order) {
    if (left === 0) break;
    extra[i] += 1;
    left -= 1;
  }
  if (left !== 0) throw new Error("schedule: allocation did not reconcile"); // unreachable by construction
  return extra.map((e) => e + 1);
}

/**
 * Deal a split's targets to its samples: a seeded shuffle, then consecutive runs sized by each
 * sample's density weight.
 * @param ids [{ id, seed }] in index order (from `planSplitIds`)
 * @returns Map<id, [{ cls, bucket, role }]>
 */
export function dealTargets(schedule, split, ids) {
  const targets = scheduledTargets(schedule, split);
  const weights = ids.map((p) => densityLevelOf(pageAppearanceOf(p.seed).density).weight);
  const counts = allocateTargets(weights, targets.length, schedule.maxTargetsPerSample);
  const order = rngOf(seedOf([V2.name, V2.version, "schedule", split]), "deal").shuffle(targets);
  const out = new Map();
  let k = 0;
  ids.forEach((p, i) => {
    out.set(p.id, order.slice(k, k + counts[i]));
    k += counts[i];
  });
  return out;
}

/** Count targets by `${cls}/${bucket}/${role}`. */
export function countTargets(list) {
  const c = {};
  for (const t of list) c[`${t.cls}/${t.bucket}/${t.role}`] = (c[`${t.cls}/${t.bucket}/${t.role}`] ?? 0) + 1;
  return c;
}
