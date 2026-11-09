/**
 * M22.1 — audit the T1 dataset recipe's TRAIN and DEV splits, regenerated, without the pinned files.
 *
 *   CHROME_PATH="<Chrome for Testing chrome.exe>" node tools/dataset/audit-recipe-splits.mjs
 *
 * `M22_1_DRY_RUN=1` prints and writes nothing. Otherwise a new record is written under
 * `artifacts/experiments/M22.1-dataset-quality/logs/`, named by its start time, never overwritten.
 *
 * WHY REGENERATE. The pinned `artifacts/datasets/t1-ui-v1` keeps all three splits in ONE
 * `manifest.json` and one `frames/` folder, so its TRAIN and DEV labels cannot be read without
 * opening TEST annotations. This script never opens anything under `artifacts/datasets`. It rebuilds
 * the builder's own TRAIN and DEV plan — `tools/dataset/build-dataset.mjs`: seed 20260910, split
 * offsets train 0 / dev 1,000,000, counts 120 / 40, each spec's own viewport, DPR 1, labels from
 * `__measure()`, visibility by geometry — and the TEST plan is never constructed.
 *
 * WHAT THIS IS NOT. It is a regeneration of the recipe, not a read of the pinned files. That it
 * reproduces them is an inference from a deterministic recipe; it is not verified here, because the
 * only artifact to verify against also holds TEST.
 *
 * It adds, per label: the M22 hit-test validity (`support/fixture-validity.mjs`), and whether the
 * element's declared inline `left`/`top` were ignored because its computed `position` is `static`.
 * Then the dataset gate (`support/dataset-quality-gate.mjs`). No detector. No pixels written. No text.
 */
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { cpus, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const S = (p) => pathToFileURL(join(ROOT, "tests/browser/support", p)).href;
const { classifyElement, hitMatches, samplingPlan } = await import(S("fixture-validity.mjs"));
const { runDatasetGate, describeDataset, REQUIRED_CHECKS_V1_RECIPE_AUDIT } = await import(S("dataset-quality-gate.mjs"));
const { runIdOf, writeNewRecord } = await import(S("smoke-record.mjs"));
const { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } = await import(S("workstation.mjs"));
const E = await import(pathToFileURL(join(ROOT, "packages/evaluation/dist/src/index.js")).href);
const { chromium } = await import("playwright");

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};

/** The builder's recipe, TRAIN and DEV only. `build-dataset.mjs` is the source of these values. */
const RECIPE = Object.freeze({ seed: 20260910, offsets: { train: 0, dev: 1_000_000 }, counts: { train: 120, dev: 40 }, dpr: 1 });
const SPLITS = ["train", "dev"];
if (SPLITS.some((s) => !(s in RECIPE.offsets))) refuse("only train and dev are audited");

/** Stated for this audit's report; the gate invents no threshold. Not a proposal for training. */
const GATE_OPTIONS = Object.freeze({
  classes: ["button", "link", "textbox", "checkbox", "radio", "select", "tab", "icon"],
  minPerClassBucket: 1, // the weakest possible coverage requirement: is there ANY example
  nearDuplicateIou: 0.9,
  repetitionShare: 0.5,
  // M22.2: stated explicitly. v1 recipe labels carry a hit-test validity but no source box, intent or
  // positive flag, so this schema requires G1–G7; G8 and G9 are NOT_APPLICABLE by design here.
  expectedSplits: ["train", "dev"],
  requiredChecks: REQUIRED_CHECKS_V1_RECIPE_AUDIT,
});

const plan = [];
for (const split of SPLITS) {
  for (let i = 0; i < RECIPE.counts[split]; i += 1) {
    const id = `${split}-${String(i).padStart(4, "0")}`;
    plan.push({ split, id, seed: RECIPE.seed + RECIPE.offsets[split] + i });
  }
}
if (plan.some((p) => p.split === "test" || p.id.startsWith("test-"))) refuse("a TEST sample entered the plan");
const specs = new Map(plan.map((p) => [p.id, E.makeSpec(p.id, p.seed)]));

const PORT = 8971;
const server = createServer((req, res) => {
  const spec = specs.get(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname.slice(1));
  if (!spec) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(E.specToHtml(spec));
});
await new Promise((ok, fail) => server.once("error", fail).listen(PORT, "127.0.0.1", ok));

const WS = resolveWorkstation();
const RUN_ID = runIdOf();
const DRY = process.env.M22_1_DRY_RUN === "1";
const OUT = join(ROOT, "artifacts/experiments/M22.1-dataset-quality/logs");
const TARGET = DRY ? null : assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `recipe-train-dev-audit-${RUN_ID}.json`)), WS);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const browserVersion = browser.version();
const samples = [];
const ignoredPositioning = {};
try {
  for (const p of plan) {
    const spec = specs.get(p.id);
    const ctx = await browser.newContext({ viewport: { width: spec.viewport.w, height: spec.viewport.h }, deviceScaleFactor: RECIPE.dpr });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/${p.id}`, { waitUntil: "load" });
    await page.addScriptTag({ content: `window.__m22HitMatches = ${hitMatches.toString()};` });
    const m = await page.evaluate(() => window.__measure());
    const viewport = { w: m.viewport.w, h: m.viewport.h };
    const plans = m.elements.map((e) => ({ id: e.id, plan: samplingPlan({ x: e.x, y: e.y, w: e.w, h: e.h }, viewport) }));
    const answers = await page.evaluate((plans) => plans.map(({ id, plan }) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const probe = (pts) => pts.map((q) => window.__m22HitMatches(el, document.elementFromPoint(q.x, q.y)));
      // Declared inline left/top that the browser ignores, because the computed position is static.
      const declares = el.style.left !== "" || el.style.top !== "";
      const ignored = declares && getComputedStyle(el).position === "static";
      return { five: probe(plan.points5), nine: probe(plan.points9), ignored };
    }), plans);
    await ctx.close();

    const annotations = m.elements.map((e, i) => {
      const a = answers[i];
      if (!a) refuse(`${p.id}: a measured element has no DOM node`);
      const box = { x: e.x, y: e.y, w: e.w, h: e.h };
      if (a.ignored) ignoredPositioning[`${p.split}/${e.cls}`] = (ignoredPositioning[`${p.split}/${e.cls}`] ?? 0) + 1;
      // Visibility exactly as build-dataset.mjs derives it.
      const fullyInside = e.x >= 0 && e.y >= 0 && e.x + e.w <= viewport.w && e.y + e.h <= viewport.h;
      const intersects = e.x < viewport.w && e.y < viewport.h && e.x + e.w > 0 && e.y + e.h > 0;
      return {
        id: `${p.id}-a${i}`,
        cls: e.cls,
        box,
        visibility: fullyInside ? "VISIBLE" : intersects ? "CLIPPED" : "OFFSCREEN",
        validity: classifyElement(box, viewport, a.five, a.nine).category,
      };
    });
    samples.push({ id: p.id, split: p.split, seed: p.seed, viewportCss: viewport, annotations });
  }
} finally {
  await browser.close();
  server.close();
}

const gate = runDatasetGate({ samples }, GATE_OPTIONS);
const description = describeDataset({ samples });

const validityBySplitClass = {};
for (const s of samples) for (const a of s.annotations) {
  const c = ((validityBySplitClass[s.split] ??= {})[a.cls] ??= {});
  c[a.validity] = (c[a.validity] ?? 0) + 1;
}

const record = {
  experiment: "M22.1 — T1 dataset recipe, TRAIN and DEV regenerated: label quality (no detector)",
  classification: "DATA QUALITY AUDIT of a recipe regeneration. Not a read of the pinned files; no TEST plan constructed; no detector; hit tests are not pixel visibility.",
  runId: RUN_ID,
  source: {
    recipe: "tools/dataset/build-dataset.mjs (seed, split offsets, counts, viewport, DPR, __measure labels, geometric visibility)",
    reproduced: RECIPE,
    splits: SPLITS,
    pinnedDataset: "artifacts/datasets/t1-ui-v1 NOT opened: its one manifest holds TEST annotations",
    identityWithPinned: "not verified (inference only, from a deterministic recipe)",
  },
  gateOptions: GATE_OPTIONS,
  environment: { browser: `Chromium ${browserVersion} (headless; renders and hit-tests only)`, node: process.version, generator: `@pratibimb/evaluation ${E.GENERATOR_VERSION}` },
  samples: Object.fromEntries(SPLITS.map((s) => [s, samples.filter((x) => x.split === s).length])),
  gate,
  validityBySplitClass,
  ignoredPositioningBySplitClass: ignoredPositioning,
  description,
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown" },
};

for (const c of gate.checks) console.log(`${c.id.padEnd(32)} ${c.status}`);
console.log("ignored inline positioning:", JSON.stringify(ignoredPositioning));
if (DRY) {
  console.log("dry run: nothing written");
} else {
  mkdirSync(OUT, { recursive: true });
  writeNewRecord(TARGET, record);
  console.log(`written: ${TARGET}`);
}
