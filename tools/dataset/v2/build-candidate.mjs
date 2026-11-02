/**
 * v2 TRAIN/DEV candidate build (M22.4): plan, render, annotate, write, gate. TRAIN AND DEV ONLY.
 *
 *   node tools/dataset/v2/build-candidate.mjs --config=tools/dataset/v2/configs/m22.4-train-dev.json --candidate=<n>
 *   node tools/dataset/v2/build-candidate.mjs --config=<same> --scratch-out=<absolute directory outside the repository>
 *
 * `--candidate=<n>` writes the primary candidate to `artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-<n>/`
 * and nowhere else under `artifacts/datasets`, which is never listed or read. `--scratch-out` writes
 * a throwaway copy for the reproducibility check. Either destination must not exist yet: a candidate,
 * failed or not, is never overwritten; a new attempt takes a new number.
 *
 * Steps, failing closed at each:
 *   1. The configuration names TRAIN and DEV only, and its stated totals equal the schedule's
 *      (feasibility is checked before anything renders; quotas are never reduced).
 *   2. Plan both splits (`plan.mjs`: exact reconciliation, or refusal) and check cross-split leakage
 *      at the configured thresholds.
 *   3. Render every planned sample in headless Chromium (`render.mjs`). Any render defect refuses the
 *      build: `BUILD-STATUS.json` says FAILED, with the defect, and the partial output is kept.
 *   4. Annotate (`annotate.mjs`), write frames and one manifest per split, check completeness.
 *   5. Gate G1–G9 on TRAIN alone, on DEV alone, and on both together (cross-split integrity), with
 *      the configured thresholds. The candidate PASSES only if every run passes.
 *   6. Write `build-record.json`: counts, hashes, environment, gate results. No page text, no local
 *      path, nothing personal.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import * as CFG from "./config.mjs";
import { PRNG, SEED_SCHEME, canonicalJson, sha256 } from "./prng.mjs";
import { validateSchedule } from "./schedule.mjs";
import { planSplit } from "./plan.mjs";
import { assertNoLeakage, framesDir, manifestName } from "./splits.mjs";
import { annotateSample, buildSplitManifest } from "./annotate.mjs";
import { CANDIDATE_PREFIX, RENDERABLE_SPLITS, assertScratchRoot, candidateRoot, renderDefects, renderSample } from "./render.mjs";
import { REQUIRED_CHECKS_V2, runDatasetGate } from "../../../tests/browser/support/dataset-quality-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

const refuse = (m, code = 2) => {
  console.error(`REFUSING: ${m}`);
  process.exit(code);
};
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

// ── 1. configuration ───────────────────────────────────────────────────────────────────────────
const configPath = arg("config");
if (!configPath) refuse("--config=<file> is required");
const configText = readFileSync(configPath, "utf8");
const config = JSON.parse(configText);
const splits = Object.keys(config.counts ?? {});
if (splits.join() !== RENDERABLE_SPLITS.join()) refuse(`the configuration must name exactly ${RENDERABLE_SPLITS.join(" and ")}, got ${JSON.stringify(splits)}`);
for (const key of ["positives", "occlusionCases"]) {
  if (Object.keys(config.schedule?.[key] ?? {}).sort().join() !== [...RENDERABLE_SPLITS].sort().join()) refuse(`schedule.${key} must hold TRAIN and DEV quotas only`);
}
for (const s of splits) {
  const t = validateSchedule(config.schedule, s);
  if (canonicalJson(t) !== canonicalJson(config.expectedTotals?.[s])) refuse(`${s}: schedule totals ${canonicalJson(t)} differ from the stated ${canonicalJson(config.expectedTotals?.[s])}`);
}
if (config.gate?.requiredChecks !== "REQUIRED_CHECKS_V2") refuse("gate.requiredChecks must be REQUIRED_CHECKS_V2");
const gateBase = { ...config.gate, classes: CFG.CLASSES, requiredChecks: REQUIRED_CHECKS_V2 };

const candidateArg = arg("candidate");
const scratchArg = arg("scratch-out");
if (Boolean(candidateArg) === Boolean(scratchArg)) refuse("give exactly one of --candidate=<n> or --scratch-out=<dir>");
const out = candidateArg ? candidateRoot(ROOT, Number(candidateArg)) : assertScratchRoot(ROOT, scratchArg);
const destinationLabel = candidateArg ? `artifacts/datasets/${CANDIDATE_PREFIX}${candidateArg}` : "<scratch, outside the repository>";
if (existsSync(out)) refuse(`${destinationLabel} already exists: a candidate is never overwritten; use a new number`);

/** The generator's fixed configuration, hashed (Infinity is not JSON, so it is written as a string). */
const configSnapshot = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(CFG).sort()), (k, v) => (v === Number.POSITIVE_INFINITY ? "Infinity" : v)));
const sourceFiles = [
  ...readdirSync(HERE).filter((f) => f.endsWith(".mjs")).sort().map((f) => [`tools/dataset/v2/${f}`, join(HERE, f)]),
  ["tests/browser/support/fixture-validity.mjs", join(ROOT, "tests/browser/support/fixture-validity.mjs")],
  ["tests/browser/support/dataset-quality-gate.mjs", join(ROOT, "tests/browser/support/dataset-quality-gate.mjs")],
];
const sourceSha256 = Object.fromEntries(sourceFiles.map(([name, p]) => [name, sha256(readFileSync(p, "utf8").replace(/\r\n/g, "\n"))]));
const hashes = {
  generatorConfigSha256: sha256(canonicalJson(configSnapshot)),
  buildConfigSha256: sha256(canonicalJson(config)),
  scheduleSha256: sha256(canonicalJson(config.schedule)),
  sourceSha256,
};

// ── 2. plan ────────────────────────────────────────────────────────────────────────────────────
const plans = {};
for (const s of splits) plans[s] = planSplit(config.schedule, s, config.counts[s]);
const leakage = assertNoLeakage([...plans.train.specs, ...plans.dev.specs], config.leakage);

// ── 3–4. render, annotate, write ───────────────────────────────────────────────────────────────
mkdirSync(out, { recursive: true });
for (const s of splits) mkdirSync(join(out, framesDir(s)));
const status = (o) => writeFileSync(join(out, "BUILD-STATUS.json"), `${JSON.stringify({ destination: destinationLabel, ...o }, null, 2)}\n`);
status({ status: "IN_PROGRESS", note: "a build that stops here is a FAILED build" });
const startedAt = new Date().toISOString();

const { chromium } = await import("playwright");
const playwrightVersion = createRequire(import.meta.url)("playwright/package.json").version;
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  offline: true,
  colorScheme: "light",
  reducedMotion: "reduce",
  locale: "en-US",
  timezoneId: "UTC",
});
let aborted = 0;
await context.route("**/*", (route) => {
  aborted += 1;
  return route.abort();
});
const page = await context.newPage();
const environment = {
  browser: `Chromium ${browserVersion}, headless, launched by Playwright ${playwrightVersion}`,
  context: "deviceScaleFactor 1, offline, every request aborted, colorScheme light, reducedMotion reduce, locale en-US, timezone UTC",
  node: process.version,
  os: `${platform()} ${release()}`,
};

const samples = { train: [], dev: [] };
const fail = async (where, defects) => {
  await browser.close();
  status({ status: "FAILED", stage: "render", sample: where, defects, startedAt, failedAt: new Date().toISOString(), environment });
  refuse(`render defect in ${where}: ${defects.join("; ")} — the build is refused and its partial output kept`, 4);
};
let done = 0;
const total = plans.train.specs.length + plans.dev.specs.length;
for (const s of splits) {
  for (const spec of plans[s].specs) {
    let r;
    try {
      r = await renderSample(page, spec, () => aborted);
    } catch (e) {
      await fail(spec.id, [`browser error: ${String(e?.message ?? e).split("\n")[0]}`]);
    }
    const defects = renderDefects(spec, r, { occluderTolerancePx: config.gate.sourceTolerancePx });
    if (defects.length) await fail(spec.id, defects);
    const framePath = `${framesDir(s)}/${spec.id}.png`;
    writeFileSync(join(out, framePath), r.png, { flag: "wx" });
    const a = annotateSample(spec, r);
    if (a.specHash !== sha256(canonicalJson(spec))) await fail(spec.id, ["spec hash does not match the planned spec"]);
    samples[s].push({ ...a, framePath, frame: { ...r.frame }, htmlSha256: r.htmlSha256 });
    done += 1;
    if (done % 100 === 0) console.error(`rendered ${done}/${total}`);
  }
}
await browser.close();

// Completeness: every planned sample rendered once, every element annotated, provenance present.
const incomplete = [];
for (const s of splits) {
  const want = plans[s].specs.map((x) => x.id);
  const got = samples[s].map((x) => x.id);
  if (want.join() !== got.join()) incomplete.push(`${s}: ${got.length} samples rendered, ${want.length} planned`);
  for (const [k, x] of samples[s].entries()) {
    const spec = plans[s].specs[k];
    if (x.annotations.length !== spec.elements.length) incomplete.push(`${x.id}: ${x.annotations.length} annotations, ${spec.elements.length} elements`);
    if (!x.provenance?.seedDerivation || !x.specHash || !x.frame?.sha256) incomplete.push(`${x.id}: provenance, spec hash or frame missing`);
    if (x.provenance.occluders.some((o) => o.rendered === null)) incomplete.push(`${x.id}: an occluder has no measured box`);
  }
}
if (incomplete.length) {
  status({ status: "FAILED", stage: "completeness", defects: incomplete.slice(0, 50), startedAt, failedAt: new Date().toISOString(), environment });
  refuse(`incomplete output: ${incomplete.slice(0, 5).join("; ")}`, 4);
}

const manifests = {};
for (const s of splits) {
  const meta = {
    destination: destinationLabel,
    renderRevision: CFG.V2.renderRevision,
    planSha256: plans[s].report.planSha256,
    ...hashes,
    seedScheme: SEED_SCHEME,
    prng: PRNG,
    environment,
    frameFormat: "PNG, the full viewport at DPR 1",
  };
  manifests[s] = buildSplitManifest(s, samples[s], meta);
  writeFileSync(join(out, manifestName(s)), `${JSON.stringify(manifests[s])}\n`, { flag: "wx" });
}

// ── 5. gate ────────────────────────────────────────────────────────────────────────────────────
const gateRuns = {
  train: runDatasetGate({ samples: samples.train }, { ...gateBase, expectedSplits: ["train"], minPerClassBucket: { train: config.gate.minPerClassBucket.train } }),
  dev: runDatasetGate({ samples: samples.dev }, { ...gateBase, expectedSplits: ["dev"], minPerClassBucket: { dev: config.gate.minPerClassBucket.dev } }),
  trainAndDev: runDatasetGate({ samples: [...samples.train, ...samples.dev] }, gateBase),
};
const pass = Object.values(gateRuns).every((r) => r.pass);

// ── 6. record ──────────────────────────────────────────────────────────────────────────────────
const cellKey = (a) => `${a.cls}/${a.source.bucket}`;
function countsOf(s) {
  const list = samples[s];
  const anns = list.flatMap((x) => x.annotations);
  const byIntentObserved = {};
  for (const a of anns) ((byIntentObserved[a.intent] ??= {})[a.validity] = (byIntentObserved[a.intent]?.[a.validity] ?? 0) + 1);
  const occlusionObservedByCell = {};
  for (const a of anns.filter((x) => x.intent !== "positive")) {
    const want = a.intent === "occlusion-full" ? "FULLY_OCCLUDED" : "PARTIALLY_OCCLUDED";
    const c = (occlusionObservedByCell[cellKey(a)] ??= { partialPlanned: 0, partialObserved: 0, fullPlanned: 0, fullObserved: 0 });
    const kind = a.intent === "occlusion-full" ? "full" : "partial";
    c[`${kind}Planned`] += 1;
    if (a.validity === want) c[`${kind}Observed`] += 1;
  }
  const g4 = gateRuns[s].checks.find((c) => c.id === "G4_CLASS_SIZE_COVERAGE");
  return {
    requestedSamples: config.counts[s],
    overflowSamples: plans[s].report.overflowSamples,
    plannedSamples: plans[s].specs.length,
    renderedSamples: list.length,
    framesWritten: list.length,
    failedRenders: 0,
    annotations: anns.length,
    planned: { positives: plans[s].report.positives.planned, occlusionPartial: plans[s].report.occlusionCases.partial.planned, occlusionFull: plans[s].report.occlusionCases.full.planned },
    observedValidityByIntent: byIntentObserved,
    validPositivesByCell: g4.coverage[s] ?? {},
    positivesExcludedForSource: g4.positivesExcludedForSource,
    occlusionByCell: occlusionObservedByCell,
    viewports: list.reduce((m, x) => ({ ...m, [`${x.viewportCss.w}x${x.viewportCss.h}`]: (m[`${x.viewportCss.w}x${x.viewportCss.h}`] ?? 0) + 1 }), {}),
    hashes: {
      planSha256: plans[s].report.planSha256,
      manifestSha256: manifests[s].hash,
      specHashesSha256: sha256(canonicalJson(list.map((x) => [x.id, x.specHash]))),
      htmlSha256: sha256(canonicalJson(list.map((x) => [x.id, x.htmlSha256]))),
      annotationsSha256: sha256(canonicalJson(list.map((x) => [x.id, x.annotations]))),
      framesSha256: sha256(canonicalJson(list.map((x) => [x.id, x.frame.sha256]))),
    },
  };
}
const record = {
  experiment: "M22.4 — v2 TRAIN/DEV candidate build (no detector, no training, no TEST)",
  dataset: `${CFG.V2.name}@${CFG.V2.version}`,
  renderRevision: CFG.V2.renderRevision,
  destination: destinationLabel,
  status: pass ? "PASS" : "FAIL",
  startedAt,
  finishedAt: new Date().toISOString(),
  environment,
  hashes,
  leakage: { ...leakage, crossSplit: leakage.crossSplit.length },
  splits: { train: countsOf("train"), dev: countsOf("dev") },
  gate: Object.fromEntries(Object.entries(gateRuns).map(([k, r]) => [k, { pass: r.pass, requiredNotApplicable: r.requiredNotApplicable, expectedSplits: r.expectedSplits, checks: r.checks.map(({ coverage, ...c }) => c) }])),
  notAClaim: [
    "hit-test validity is the browser's hit test at grid points, not pixel-level visibility",
    "no detector was loaded or run, no model was trained; nothing here is a recall or precision figure",
    "TRAIN and DEV only; no TEST sample was planned, seeded, rendered or read",
  ],
};
writeFileSync(join(out, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
status({ status: pass ? "PASS" : "FAIL", startedAt, finishedAt: record.finishedAt, gate: Object.fromEntries(Object.entries(gateRuns).map(([k, r]) => [k, r.pass])) });
console.log(JSON.stringify({ status: record.status, destination: destinationLabel, gate: record.gate, counts: Object.fromEntries(splits.map((s) => [s, { ...record.splits[s], validPositivesByCell: undefined, occlusionByCell: undefined }])) }, null, 1));
process.exit(pass ? 0 : 3);
