/**
 * v2 dataset build — PLAN ONLY. Nothing is rendered, nothing is written.
 *
 *   node tools/dataset/v2/build-v2.mjs --schedule=<schedule.json> --counts=train:<n>,dev:<m> --leakage=<elementIou>:<layoutShare>
 *
 * Plans the requested TRAIN and/or DEV splits from an owner-stated schedule (`schedule.mjs`):
 * positive and occlusion-case quotas, ids and seeds, each sample's stratified layout, deferred targets
 * rescheduled to overflow samples, exact reconciliation, and the cross-split leakage check at the
 * stated thresholds. Prints the plan's counts, its theoretical capacity, each split's plan hash, and
 * how placement and appearance are spread (M22.3). No pixels, no files.
 *
 * Refuses: any TEST split (the sealed build is a later, owner-approved step, after TEST authorisation
 * is hardened), `--render` (rendering is not implemented), `--occlusion` (occlusion quotas are in the
 * schedule), and missing schedule, counts or leakage thresholds.
 */
import { readFileSync } from "node:fs";
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { assertNoLeakage } from "./splits.mjs";
import { planSplit } from "./plan.mjs";
import { validateSchedule } from "./schedule.mjs";
import { GRID } from "./layout.mjs";
import { PRNG, SEED_SCHEME, canonicalJson, sha256 } from "./prng.mjs";

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

if (process.argv.includes("--render")) refuse("rendering is not implemented; this command only plans");
if (process.argv.some((a) => a.startsWith("--occlusion"))) refuse("--occlusion is no longer an option: occlusion-case quotas are part of the schedule");
const schedulePath = arg("schedule");
if (!schedulePath) refuse("--schedule=<file> is required: quotas are the owner's input, never defaulted");
const counts = Object.fromEntries((arg("counts") ?? "").split(",").filter(Boolean).map((p) => p.split(":")).map(([s, n]) => [s, Number(n)]));
if (Object.keys(counts).length === 0) refuse("--counts=train:<n>,dev:<m> is required");
if ("test" in counts) refuse("TEST is built only by the sealed one-time build, not by this command");
for (const s of Object.keys(counts)) if (s !== "train" && s !== "dev") refuse(`unknown split ${s}`);
const leakArg = arg("leakage");
if (!leakArg) refuse("--leakage=<elementIou>:<layoutShare> is required: the near-duplicate thresholds are the owner's");
const [elementIou, layoutShare] = leakArg.split(":").map(Number);

const r3 = (x) => Math.round(x * 1000) / 1000;
const tally = (list) => list.reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});

/** Element centres per 3 × 3 region of the usable area, as shares: pooled, and the range over viewport shapes. */
function placementOf(specs) {
  const pooled = Array(GRID * GRID).fill(0);
  const byShape = {};
  for (const s of specs) {
    const d = (byShape[`${s.viewport.w}x${s.viewport.h}`] ??= Array(GRID * GRID).fill(0));
    for (const e of s.elements) {
      const col = Math.min(GRID - 1, Math.floor(((e.box.x + e.box.w / 2 - s.area.x) / s.area.w) * GRID));
      const row = Math.min(GRID - 1, Math.floor(((e.box.y + e.box.h / 2 - s.area.y) / s.area.h) * GRID));
      pooled[row * GRID + col] += 1;
      d[row * GRID + col] += 1;
    }
  }
  const n = pooled.reduce((a, b) => a + b, 0);
  const shares = Object.values(byShape).flatMap((c) => {
    const t = c.reduce((a, b) => a + b, 0);
    return c.map((v) => v / t);
  });
  return {
    pooledRegionShare: pooled.map((v) => r3(v / n)),
    topThirdShare: r3(pooled.slice(0, GRID).reduce((a, b) => a + b, 0) / n),
    bottomThirdShare: r3(pooled.slice(-GRID).reduce((a, b) => a + b, 0) / n),
    regionShareRangeOverShapes: [r3(Math.min(...shares)), r3(Math.max(...shares))],
    elementsByShape: Object.fromEntries(Object.entries(byShape).map(([k, c]) => [k, c.reduce((a, b) => a + b, 0)])),
  };
}

const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
const specs = [];
const reports = {};
for (const [split, n] of Object.entries(counts)) {
  const totals = validateSchedule(schedule, split);
  const { specs: s, report } = planSplit(schedule, split, n);
  specs.push(...s);
  const cover = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(SIZE_BUCKETS.map((b) => [b.id, 0]))]));
  for (const spec of s) for (const e of spec.elements) if (e.intent === "positive") cover[e.cls][e.bucket] += 1;
  const perPage = s.map((x) => x.elements.length);
  reports[split] = {
    ...report,
    capacity: {
      targets: totals.all,
      requestedSlots: n * schedule.maxTargetsPerSample,
      utilisationOfRequested: r3(totals.all / (n * schedule.maxTargetsPerSample)),
      slotsWithOverflow: (n + schedule.maxOverflowSamples) * schedule.maxTargetsPerSample,
      targetsPerPage: { min: Math.min(...perPage), mean: r3(totals.all / s.length), max: Math.max(...perPage) },
    },
    placement: placementOf(s),
    appearance: {
      palette: tally(s.map((x) => x.appearance.palette)),
      font: tally(s.map((x) => x.appearance.font)),
      controlStyle: tally(s.map((x) => x.appearance.controlStyle)),
      density: tally(s.map((x) => x.appearance.density)),
      iconGlyph: tally(s.flatMap((x) => x.elements).filter((e) => e.cls === "icon").map((e) => e.appearance.glyph)),
      decorBlocks: s.reduce((a, x) => a + x.decor.length, 0),
    },
    plannedPositivesByClassAndBucket: cover,
  };
}
const leakage = assertNoLeakage(specs, { elementIou, layoutShare });

console.log(JSON.stringify({
  generator: `${V2.name}@${V2.version}`,
  seedScheme: SEED_SCHEME,
  prng: PRNG,
  mode: "PLAN ONLY — nothing rendered, nothing written; counts are PLANNED, not observed",
  scheduleSha256: sha256(canonicalJson(schedule)),
  leakage: { ...leakage, crossSplit: leakage.crossSplit.length },
  splits: reports,
}, null, 2));
