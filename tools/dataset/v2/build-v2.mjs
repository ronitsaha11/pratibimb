/**
 * v2 dataset build — PLAN ONLY. Nothing is rendered, nothing is written.
 *
 *   node tools/dataset/v2/build-v2.mjs --schedule=<schedule.json> --counts=train:<n>,dev:<m> --leakage=<elementIou>:<layoutShare>
 *
 * Plans the requested TRAIN and/or DEV splits from an owner-stated schedule (`schedule.mjs`):
 * positive and occlusion-case quotas, ids and seeds, each sample's stratified layout, deferred targets
 * rescheduled to overflow samples, exact reconciliation, and the cross-split leakage check at the
 * stated thresholds. Prints the plan's counts. No pixels, no files.
 *
 * Refuses: any TEST split (the sealed build is a later, owner-approved step, after TEST authorisation
 * is hardened), `--render` (rendering is not implemented), `--occlusion` (occlusion quotas are in the
 * schedule), and missing schedule, counts or leakage thresholds.
 */
import { readFileSync } from "node:fs";
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { assertNoLeakage } from "./splits.mjs";
import { planSplit } from "./plan.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

if (process.argv.includes("--render")) refuse("rendering is not implemented in M22.2; this command only plans");
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

const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
const specs = [];
const reports = {};
for (const [split, n] of Object.entries(counts)) {
  const { specs: s, report } = planSplit(schedule, split, n);
  specs.push(...s);
  const cover = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(SIZE_BUCKETS.map((b) => [b.id, 0]))]));
  for (const spec of s) for (const e of spec.elements) if (e.intent === "positive") cover[e.cls][e.bucket] += 1;
  reports[split] = { ...report, plannedPositivesByClassAndBucket: cover };
}
const leakage = assertNoLeakage(specs, { elementIou, layoutShare });

console.log(JSON.stringify({
  generator: `${V2.name}@${V2.version}`,
  mode: "PLAN ONLY — nothing rendered, nothing written; counts are PLANNED, not observed",
  scheduleSha256: sha256(canonicalJson(schedule)),
  leakage: { ...leakage, crossSplit: leakage.crossSplit.length },
  splits: reports,
}, null, 2));
