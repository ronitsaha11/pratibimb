/**
 * v2 dataset build — PLAN ONLY in M22.2. Nothing is rendered, nothing is written.
 *
 *   node tools/dataset/v2/build-v2.mjs --schedule=<schedule.json> --counts=train:<n>,dev:<m> [--occlusion=<share>:<kinds>]
 *
 * Plans the requested TRAIN and/or DEV splits from an owner-stated schedule: ids and seeds, the
 * targets dealt to each sample, each sample's layout, and the cross-split leakage check. Prints the
 * planned class × size coverage and every target the layout could not place. No pixels, no files.
 *
 * Refuses: any TEST split (the sealed one-time build is a later, owner-approved step), `--render`
 * (rendering is not implemented in M22.2), and a missing schedule or occlusion setting.
 */
import { readFileSync } from "node:fs";
import { CLASSES, SIZE_BUCKETS, V2 } from "./config.mjs";
import { assertNoLeakage, planSplitIds } from "./splits.mjs";
import { dealTargets } from "./schedule.mjs";
import { layoutSample } from "./layout.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

if (process.argv.includes("--render")) refuse("rendering is not implemented in M22.2; this command only plans");
const schedulePath = arg("schedule");
if (!schedulePath) refuse("--schedule=<file> is required: quotas are the owner's input, never defaulted");
const counts = Object.fromEntries((arg("counts") ?? "").split(",").filter(Boolean).map((p) => p.split(":")).map(([s, n]) => [s, Number(n)]));
if (Object.keys(counts).length === 0) refuse("--counts=train:<n>,dev:<m> is required");
if ("test" in counts) refuse("TEST is built only by the sealed one-time build, not by this command");
for (const s of Object.keys(counts)) if (s !== "train" && s !== "dev") refuse(`unknown split ${s}`);
const occArg = arg("occlusion");
if (!occArg) refuse("--occlusion=<share>:<kinds> is required (use 0:none for no occlusion cases)");
const [shareText, kindsText] = occArg.split(":");
const occlusion = { share: Number(shareText), kinds: kindsText === "none" ? [] : kindsText.split("+") };

const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
const specs = [];
const summary = {};
for (const [split, n] of Object.entries(counts)) {
  const ids = planSplitIds(split, n);
  const deal = dealTargets(schedule, split, ids);
  const laid = ids.map((p) => layoutSample(p, deal.get(p.id), occlusion));
  specs.push(...laid);
  const cover = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(SIZE_BUCKETS.map((b) => [b.id, 0]))]));
  let positives = 0;
  let occlusionCases = 0;
  let deferred = 0;
  for (const s of laid) {
    deferred += s.deferred.length;
    for (const e of s.elements) {
      if (e.intent === "positive") {
        positives += 1;
        cover[e.cls][e.bucket] += 1;
      } else occlusionCases += 1;
    }
  }
  summary[split] = { samples: n, plannedPositives: positives, occlusionCases, deferred, positivesByClassAndBucket: cover };
}
assertNoLeakage(specs);

console.log(JSON.stringify({
  generator: `${V2.name}@${V2.version}`,
  mode: "PLAN ONLY — nothing rendered, nothing written",
  scheduleSha256: sha256(canonicalJson(schedule)),
  occlusion,
  leakage: "none (ids, seeds, layouts)",
  splits: summary,
}, null, 2));
