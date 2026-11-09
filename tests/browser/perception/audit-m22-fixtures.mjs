/**
 * M22 fixture audit — NO DETECTOR, NO RECALL. Classifies every measured element of every DEV spec in
 * every planned M22 cell by `design-amendment-2.md`, and records counts only.
 *
 *   CHROME_PATH="<Chrome for Testing chrome.exe>" node tests/browser/perception/audit-m22-fixtures.mjs
 *
 * `M22_AUDIT_DRY_RUN=1` prints and writes nothing. Otherwise a new record is written under
 * `artifacts/experiments/M22-small-target-recall/logs/`, named by its start time, never overwritten.
 *
 * HOW. Elements are the generator's own `__measure()` (its `getBoundingClientRect` read-back, the
 * labels the evaluation uses). For each, `samplingPlan` (support/fixture-validity.mjs) picks the
 * 5×5 and 9×9 points; the page answers, per point, whether `document.elementFromPoint` returns the
 * element by `hitMatches` — the same tested function, injected from its source; `classifyElement`
 * decides the category. Nothing in the page decides anything.
 *
 * A hit is the browser's hit test, not a pixel: no grid here proves pixel-level visibility, and no
 * category guarantees an IoU. DEV specs only (`seedFor`); the TEST split is never generated.
 */
import { mkdirSync } from "node:fs";
import { cpus, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATEGORIES, classifyElement, hitMatches, samplingPlan } from "../support/fixture-validity.mjs";
import { BUCKETS, bucketOf, quantiles } from "../support/small-target-eval.mjs";
import { runIdOf, writeNewRecord } from "../support/smoke-record.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = join(ROOT, "artifacts/experiments/M22-small-target-recall/logs");
const E = await import(pathToFileURL(join(ROOT, "packages/evaluation/dist/src/index.js")).href);
const G = await import(pathToFileURL(join(ROOT, "artifacts/experiments/W1-detector-precision-scale/harness/w1-guards.mjs")).href);
const { chromium } = await import("playwright");

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};

/** The 11 cells of design.md §3: six shapes at zoom 1, and five zooms at 1280×720. */
const CELLS = Object.freeze([
  { id: "landscape-16x9", w: 1280, h: 720, zoom: 1 },
  { id: "landscape-16x10", w: 1280, h: 800, zoom: 1 },
  { id: "landscape-2x1", w: 1280, h: 640, zoom: 1 },
  { id: "square", w: 1280, h: 1280, zoom: 1 },
  { id: "portrait-3x4", w: 960, h: 1280, zoom: 1 },
  { id: "portrait-9x16", w: 720, h: 1280, zoom: 1 },
  { id: "zoom-0.5", w: 1280, h: 720, zoom: 0.5 },
  { id: "zoom-0.75", w: 1280, h: 720, zoom: 0.75 },
  { id: "zoom-1.5", w: 1280, h: 720, zoom: 1.5 },
  { id: "zoom-2", w: 1280, h: 720, zoom: 2 },
  { id: "zoom-3", w: 1280, h: 720, zoom: 3 },
]);
const SPECS = G.SAMPLES_PER_CELL; // 20
const MODEL_INPUT = 640;

const WS = resolveWorkstation();
const RUN_ID = runIdOf();
const DRY = process.env.M22_AUDIT_DRY_RUN === "1";
const TARGET = DRY ? null : assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `fixture-audit-${RUN_ID}.json`)), WS);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const browserVersion = browser.version();

/** Tag and role of an element, for "what covers it" tallies. Never text. */
const describeInPage = `(e) => e ? e.tagName.toLowerCase() + (e.getAttribute("role") ? "[role=" + e.getAttribute("role") + "]" : "") : "none"`;

const empty = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

const cells = [];
const all = { byCategory: empty(), disagreements5vs9: 0, elements: 0 };
for (const cell of CELLS) {
  const context = await browser.newContext({ viewport: { width: cell.w, height: cell.h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const scale = MODEL_INPUT / Math.max(cell.w, cell.h); // model px per CSS px at DPR 1
  const byCategory = empty();
  const byClass = {};
  const byBucket = {};
  const coveredBy = new Map();
  const clippedFractions5 = [];
  const clippedFractions9 = [];
  let disagreements = 0;
  let elements = 0;
  for (let i = 0; i < SPECS; i += 1) {
    const spec = { ...E.makeSpec(G.specIdFor(i), G.seedFor(i)), viewport: { w: cell.w, h: cell.h } };
    await page.setContent(E.specToHtml(spec), { waitUntil: "load" });
    await page.addStyleTag({ content: `html,body{overflow:hidden!important} main{zoom:${cell.zoom}}` });
    await page.addScriptTag({ content: `window.__m22HitMatches = ${hitMatches.toString()}; window.__m22Describe = ${describeInPage};` });
    const measured = await page.evaluate(() => window.__measure());
    if (measured.viewport.w !== cell.w || measured.viewport.h !== cell.h || measured.viewport.dpr !== 1) {
      refuse(`${cell.id}: measured ${measured.viewport.w}x${measured.viewport.h}@${measured.viewport.dpr}`);
    }
    const viewport = { w: cell.w, h: cell.h };
    const plans = measured.elements.map((el) => ({ id: el.id, plan: samplingPlan({ x: el.x, y: el.y, w: el.w, h: el.h }, viewport) }));
    const answers = await page.evaluate((plans) => {
      return plans.map(({ id, plan }) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const probe = (pts) => pts.map((p) => {
          const at = document.elementFromPoint(p.x, p.y);
          return { hit: window.__m22HitMatches(el, at), at: window.__m22Describe(at) };
        });
        return { five: probe(plan.points5), nine: probe(plan.points9) };
      });
    }, plans);
    measured.elements.forEach((el, k) => {
      const a = answers[k];
      if (!a) refuse(`${cell.id}/${i}: measured element has no DOM node`);
      const b = { x: el.x, y: el.y, w: el.w, h: el.h };
      const r = classifyElement(b, viewport, a.five.map((x) => x.hit), a.nine.map((x) => x.hit));
      const bucket = bucketOf({ x: 0, y: 0, w: b.w * scale, h: b.h * scale }) ?? "unbucketed";
      elements += 1;
      byCategory[r.category] += 1;
      ((byClass[el.cls] ??= empty())[r.category]) += 1;
      ((byBucket[bucket] ??= empty())[r.category]) += 1;
      if (r.category === "SAMPLING_SENSITIVE") disagreements += 1;
      if (r.category === "PARTIALLY_CLIPPED") {
        clippedFractions5.push(r.fraction5);
        clippedFractions9.push(r.fraction9);
      }
      if (r.category !== "HIT_TESTABLE" && r.category !== "OFFSCREEN") {
        for (const p of a.five) if (!p.hit) tally(coveredBy, `${el.cls} at a point returning ${p.at}`);
      }
    });
  }
  await context.close();
  for (const c of CATEGORIES) all.byCategory[c] += byCategory[c];
  all.disagreements5vs9 += disagreements;
  all.elements += elements;
  const evaluated = elements - byCategory.OFFSCREEN;
  cells.push({
    id: cell.id,
    viewport: { w: cell.w, h: cell.h },
    contentZoom: cell.zoom,
    screens: SPECS,
    elements,
    evaluatedByTheEvaluator: evaluated,
    primaryPopulation: byCategory.HIT_TESTABLE,
    byCategory,
    byClass,
    byBucket,
    samplingSensitive: disagreements,
    partiallyClippedHitFraction: { grid5: quantiles(clippedFractions5), grid9: quantiles(clippedFractions9) },
    failingPointsReturned: Object.fromEntries([...coveredBy].sort((x, y) => y[1] - x[1])),
  });
  const c = cells.at(-1);
  console.log(
    `${cell.id.padEnd(16)} elements ${String(elements).padStart(4)}  primary ${String(c.primaryPopulation).padStart(4)}  ` +
      CATEGORIES.filter((k) => k !== "HIT_TESTABLE").map((k) => `${k} ${byCategory[k]}`).join("  ")
  );
}
await browser.close();

const record = {
  experiment: "M22 — fixture audit by design amendment 2 (no detector, no recall)",
  classification: "FIXTURE VALIDITY AUDIT. Hit-test based; not pixel visibility; no IoU guarantee. DEV synthetic screens only.",
  runId: RUN_ID,
  rule: {
    grids: { primary: "5x5 cell centres", sensitivity: "9x9 cell centres", region: "element box ∩ viewport" },
    hit: "elementFromPoint returns the element, a descendant, or a LABEL whose control is the element",
    categories: CATEGORIES,
    primaryPopulation: "HIT_TESTABLE only (wholly inside, 25/25 and 81/81 hit)",
  },
  fixtures: {
    generator: `@pratibimb/evaluation makeSpec/specToHtml (generator ${E.GENERATOR_VERSION})`,
    specs: `W1/Track B DEV specs: specIdFor(i), seedFor(i) = ${G.SCALE_SEED_BASE} + i, i = 0..${SPECS - 1}`,
    split: "dev only; no TEST sample generated, rendered or read",
    buckets: BUCKETS.map((b) => ({ id: b.id, shorterSideModelPx: [b.lo, Number.isFinite(b.hi) ? b.hi : null] })),
    modelPxPerCssPx: "640 / max(viewport w, h) = 0.5 in every cell",
  },
  environment: { browser: `Chromium ${browserVersion} (headless; renders and hit-tests only)`, node: process.version },
  totals: { elements: all.elements, byCategory: all.byCategory, samplingSensitive: all.disagreements5vs9 },
  cells,
  notAClaim: [
    "a hit-test classification, not a measurement of visible pixels",
    "no detector was loaded or run; nothing here is a recall or precision figure",
    "synthetic DEV screens from this project's own generator",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown" },
};
console.log(`ALL elements ${all.elements}: ${CATEGORIES.map((k) => `${k} ${all.byCategory[k]}`).join("  ")}`);
if (DRY) {
  console.log("dry run: nothing written");
} else {
  mkdirSync(OUT, { recursive: true });
  writeNewRecord(TARGET, record);
  console.log(`written: ${TARGET}`);
}
