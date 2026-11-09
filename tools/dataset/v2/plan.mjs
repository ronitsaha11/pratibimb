/**
 * v2 split planning: deal, lay out, reschedule what did not fit, and reconcile — or refuse.
 *
 * TRAIN and DEV only. TEST is not planned here, and this module never calls a split helper with it.
 *
 * DEFERRED TARGETS ARE RESCHEDULED, DETERMINISTICALLY. A target a layout could not place goes to an
 * OVERFLOW sample appended after the requested ones (ids continue the split's sequence, so they stay
 * unique). Overflow samples take up to `maxTargetsPerSample` targets each, in deferral order; anything
 * still unplaced moves on to the next. At most `schedule.maxOverflowSamples` are added. If targets
 * remain after that, the plan is REFUSED with the cells and roles still missing — a quota is never
 * silently reduced.
 *
 * RECONCILIATION. After planning, the placed targets are counted per class × bucket × role and must
 * equal the schedule EXACTLY; any difference is a refusal. These are PLANNED counts. Whether a planned
 * positive is a usable, hit-testable positive is established only by rendering, and then by the gate
 * (G4 for coverage, G9 for positive and occlusion labels). A plan claims nothing about the browser.
 */
import { planSplitIds, sampleId, seedFor } from "./splits.mjs";
import { countTargets, dealTargets, scheduledTargets, validateSchedule } from "./schedule.mjs";
import { layoutSample } from "./layout.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";

export const PLANNABLE_SPLITS = Object.freeze(["train", "dev"]);

/**
 * @returns { specs, report } — `specs` in id order (requested samples, then overflow samples)
 */
export function planSplit(schedule, split, count) {
  if (!PLANNABLE_SPLITS.includes(split)) throw new Error(`plan: only ${PLANNABLE_SPLITS.join(" and ")} are planned here, not ${JSON.stringify(split)}`);
  const totals = validateSchedule(schedule, split);
  const ids = planSplitIds(split, count);
  const deal = dealTargets(schedule, split, ids);

  const specs = ids.map((p) => layoutSample(p, deal.get(p.id)));
  let pending = specs.flatMap((s) => s.deferred.map((t) => ({ ...t, from: s.id })));
  const deferredAtFirst = { positive: pending.filter((t) => t.role === "positive").length, occlusion: pending.filter((t) => t.role !== "positive").length };
  const rescheduled = [];

  let next = count;
  while (pending.length > 0 && next - count < schedule.maxOverflowSamples) {
    const take = pending.slice(0, schedule.maxTargetsPerSample);
    pending = pending.slice(take.length);
    const plan = { split, index: next, id: sampleId(split, next), seed: seedFor(split, next), overflow: true };
    const spec = layoutSample(plan, take.map(({ cls, bucket, role }) => ({ cls, bucket, role })));
    specs.push(spec);
    for (const t of take) rescheduled.push({ role: t.role, from: t.from, to: spec.id });
    pending = [...pending, ...spec.deferred.map((t) => ({ ...t, from: spec.id }))];
    next += 1;
  }

  if (pending.length > 0) {
    const missing = countTargets(pending);
    throw new Error(
      `plan: ${pending.length} target(s) of split ${split} could not be placed within ${count} samples + ${schedule.maxOverflowSamples} overflow samples ` +
        `(maxTargetsPerSample ${schedule.maxTargetsPerSample}). Still unplaced, by class/bucket/role: ${JSON.stringify(missing)}. ` +
        "Raise maxOverflowSamples or the sample count, or lower a quota; a quota is never reduced silently."
    );
  }

  // No empty page: every requested sample is dealt at least one target and every overflow sample
  // takes at least one, and the first target on an empty page always fits. Checked, not assumed.
  const empty = specs.filter((s) => s.elements.length === 0).map((s) => s.id);
  if (empty.length) throw new Error(`plan: ${empty.length} planned sample(s) of split ${split} are empty: ${empty.slice(0, 5).join(", ")}`);

  // Exact reconciliation: placed = scheduled, cell by cell, role by role.
  const wanted = countTargets(scheduledTargets(schedule, split));
  const got = countTargets(specs.flatMap((s) => s.elements.map((e) => ({ cls: e.cls, bucket: e.bucket, role: e.intent }))));
  const keys = new Set([...Object.keys(wanted), ...Object.keys(got)]);
  const diff = [...keys].filter((k) => (wanted[k] ?? 0) !== (got[k] ?? 0)).map((k) => ({ cell: k, scheduled: wanted[k] ?? 0, placed: got[k] ?? 0 }));
  if (diff.length) throw new Error(`plan: reconciliation failed for split ${split}: ${JSON.stringify(diff.slice(0, 8))}`);

  const placedOf = (role) => specs.reduce((n, s) => n + s.elements.filter((e) => e.intent === role).length, 0);
  return {
    specs,
    report: {
      split,
      requestedSamples: count,
      overflowSamples: specs.length - count,
      plannedSamples: specs.length,
      positives: { requested: totals.positives, planned: placedOf("positive") },
      occlusionCases: {
        partial: { requested: totals.occlusionPartial, planned: placedOf("occlusion-partial") },
        full: { requested: totals.occlusionFull, planned: placedOf("occlusion-full") },
      },
      deferredAtFirstLayout: deferredAtFirst,
      rescheduled: { positive: rescheduled.filter((t) => t.role === "positive").length, occlusion: rescheduled.filter((t) => t.role !== "positive").length },
      reconciled: true,
      planSha256: planHash(specs),
      note: "PLANNED counts. Rendered, hit-testable positives are established only by rendering and the gate (G4, G9).",
    },
  };
}

/** The hash of a split's planned specs, over canonical JSON: equal plans, equal hashes. */
export const planHash = (specs) => sha256(canonicalJson(specs));
