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
 * Targets are shuffled with a split-specific seed and dealt to samples in turn.
 */
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { fnv1a, rngOf } from "./prng.mjs";

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
 * Deal a split's targets to its samples: a seeded shuffle, then round-robin.
 * @param ids [{ id }] in index order (from `planSplitIds`)
 * @returns Map<id, [{ cls, bucket, role }]>
 */
export function dealTargets(schedule, split, ids) {
  const targets = scheduledTargets(schedule, split);
  if (targets.length > ids.length * schedule.maxTargetsPerSample) {
    throw new Error(`schedule: ${targets.length} targets do not fit ${ids.length} samples × ${schedule.maxTargetsPerSample}`);
  }
  const order = rngOf(fnv1a(`${V2.name}|${V2.version}|schedule|${split}`)).shuffle(targets);
  const out = new Map(ids.map((p) => [p.id, []]));
  order.forEach((t, k) => out.get(ids[k % ids.length].id).push(t));
  return out;
}

/** Count targets by `${cls}/${bucket}/${role}`. */
export function countTargets(list) {
  const c = {};
  for (const t of list) c[`${t.cls}/${t.bucket}/${t.role}`] = (c[`${t.cls}/${t.bucket}/${t.role}`] ?? 0) + 1;
  return c;
}
