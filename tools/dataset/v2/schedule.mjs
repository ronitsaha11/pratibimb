/**
 * v2 coverage schedule: which (class, size bucket) targets each sample of a split must draw.
 *
 * The QUOTAS ARE INPUT. A schedule states, per split, how many examples of every class in every
 * bucket to generate, and how many targets a sample may carry. Nothing here chooses those numbers;
 * an incomplete schedule is refused, so a class or a bucket cannot be left out by omission.
 *
 * Targets are shuffled with a split-specific seed and dealt to samples in turn, so each class's
 * examples land on many samples, at many positions, rather than at one fixed geometry.
 */
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { fnv1a, rngOf } from "./prng.mjs";

const BUCKET_IDS = SIZE_BUCKETS.map((b) => b.id);

/** Refuse a schedule that is not complete, positive and placeable. */
export function validateSchedule(schedule, split, sampleCount) {
  const q = schedule?.quotas?.[split];
  if (!q) throw new Error(`schedule: no quotas for split ${split}`);
  const max = schedule.maxTargetsPerSample;
  if (!Number.isInteger(max) || max <= 0) throw new Error("schedule: maxTargetsPerSample must be a positive integer");
  let total = 0;
  for (const cls of CLASSES) {
    for (const b of BUCKET_IDS) {
      const n = q[cls]?.[b];
      if (!Number.isInteger(n) || n < 0) throw new Error(`schedule: quota ${split}/${cls}/${b} must be a stated non-negative integer`);
      total += n;
    }
  }
  for (const cls of Object.keys(q)) if (!CLASSES.includes(cls)) throw new Error(`schedule: unknown class ${cls}`);
  for (const cls of CLASSES) for (const b of Object.keys(q[cls])) if (!BUCKET_IDS.includes(b)) throw new Error(`schedule: unknown bucket ${b}`);
  if (total > sampleCount * max) throw new Error(`schedule: ${total} targets do not fit ${sampleCount} samples × ${max}`);
  return total;
}

/**
 * Deal a split's targets to its samples.
 * @param ids [{ id }] in index order (from `planSplitIds`)
 * @returns Map<id, [{ cls, bucket }]>
 */
export function dealTargets(schedule, split, ids) {
  validateSchedule(schedule, split, ids.length);
  const targets = [];
  for (const cls of CLASSES) for (const b of BUCKET_IDS) for (let k = 0; k < schedule.quotas[split][cls][b]; k += 1) targets.push({ cls, bucket: b });
  const order = rngOf(fnv1a(`${V2.name}|${V2.version}|schedule|${split}`)).shuffle(targets);
  const out = new Map(ids.map((p) => [p.id, []]));
  order.forEach((t, k) => out.get(ids[k % ids.length].id).push(t));
  for (const list of out.values()) if (list.length > schedule.maxTargetsPerSample) throw new Error("schedule: a sample exceeds maxTargetsPerSample");
  return out;
}
