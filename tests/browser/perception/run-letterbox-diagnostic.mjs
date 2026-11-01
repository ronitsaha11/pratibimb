/**
 * M21 — LETTERBOX DIAGNOSTIC. Where are labelled elements lost between the screen and the
 * coordinates fusion sees, as the screen's shape changes?
 *
 *   CHROME_PATH="<Chrome for Testing chrome.exe>" node tests/browser/perception/run-letterbox-diagnostic.mjs
 *
 * `M21_SAMPLES=n` (1..20) runs fewer screens per cell; `M21_DRY_RUN=1` prints and writes nothing.
 * A record is never overwritten: each run writes a new file named by its start time.
 *
 * AN ENGINEERING DIAGNOSTIC. Not a J7 experiment, not adoption evidence for the detector (which
 * stays UNADOPTED), not an accuracy claim. DEV synthetic screens only — the 20 W1 / Track B DEV
 * specs (`seedFor`, `specIdFor`); no TEST sample is generated, rendered or scored.
 *
 * WHAT IS HELD FIXED, AND WHY. Every cell has a long side of 1280 CSS px at DPR 1, so every cell
 * runs at exactly 2.0 CSS px per model px. Track B showed scale is what makes this detector go
 * silent; holding it constant leaves the letterbox — its direction and its amount — as the only
 * thing that differs between cells.
 *
 * THE PATH IS THE SHIPPED ONE, from the compiled package: Chromium renders and decodes the PNG
 * (createImageBitmap → canvas, as the product does) → `geometryFrom` → `preprocessToTensor` →
 * `assertRasterMatchesInverse` → ORT Web 1.29.0 wasm on the pinned artifact → the shipped decode →
 * the shipped letterbox inverse → `captureToCss`. Labels come from `getBoundingClientRect`.
 *
 * WHAT IT SEPARATES:
 *   preprocessing   could any source pixel be cropped, and is the padding exactly the pad byte?
 *   decode          every anchor's fate (score floor, extent, NMS, cap) — `decodeHeadOutputAccounted`
 *   inverse         every decoded box's fate (padding, clipped, bounded) — `projectToCaptureAccounted`
 *   validation      `validateDetections` over the projected boxes, with and without M21's bound
 *   per label       DETECTED / LOST_IN_PROJECTION / NOT_EMITTED (`support/letterbox-attribution.mjs`)
 *
 * The record holds counts and model-px sizes. No page text, no pixels, no boxes.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { cpus, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { summarise } from "../support/bench-stats.mjs";
import { attributeScreen, sumAttributions, sumCounts } from "../support/letterbox-attribution.mjs";
import { runIdOf, writeNewRecord } from "../support/smoke-record.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const OUT = join(ROOT, "artifacts/experiments/M21-perception-geometry/logs");
const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};

const PERC_DIST = join(ROOT, "packages/perception/dist/src/index.js");
const EVAL_DIST = join(ROOT, "packages/evaluation/dist/src/index.js");
for (const p of [PERC_DIST, EVAL_DIST]) if (!existsSync(p)) refuse(`compiled package missing at ${p} (run: npm run typecheck)`);
const P = await import(pathToFileURL(PERC_DIST).href);
const E = await import(pathToFileURL(EVAL_DIST).href);
const G = await import(pathToFileURL(join(ROOT, "artifacts/experiments/W1-detector-precision-scale/harness/w1-guards.mjs")).href);
try {
  G.assertShippedConstants(P);
} catch (e) {
  refuse(e.message);
}
if (typeof P.projectToCaptureAccounted !== "function" || typeof P.assertRasterMatchesInverse !== "function") {
  refuse("the compiled perception package predates M21 (run: npm run typecheck)");
}

const modelPath = join(ROOT, G.MODEL.path);
if (!existsSync(modelPath)) refuse(`the T1 artifact is not on this machine (${G.MODEL.path}); it is never committed`);
const modelBytes = new Uint8Array(readFileSync(modelPath));
try {
  G.assertModelIdentity(modelBytes);
} catch (e) {
  refuse(e.message);
}

const ortMod = await import("onnxruntime-web");
const ort = ortMod.default ?? ortMod;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = "error";
try {
  G.assertOrtVersion(ort.env.versions?.web, "onnxruntime-web in Node");
} catch (e) {
  refuse(e.message);
}
const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
const S = P.HEAD_CONTRACT.inputSize;

/** Long side 1280 everywhere: 2.0 CSS px per model px in every cell. */
const CELLS = Object.freeze([
  { id: "landscape-16x9", viewport: { w: 1280, h: 720 } },
  { id: "landscape-16x10", viewport: { w: 1280, h: 800 } },
  { id: "landscape-2x1", viewport: { w: 1280, h: 640 } },
  { id: "square", viewport: { w: 1280, h: 1280 } },
  { id: "portrait-3x4", viewport: { w: 960, h: 1280 } },
  { id: "portrait-9x16", viewport: { w: 720, h: 1280 } },
]);
const SAMPLES = Number(process.env.M21_SAMPLES ?? G.SAMPLES_PER_CELL);
if (!(Number.isInteger(SAMPLES) && SAMPLES > 0 && SAMPLES <= G.SAMPLES_PER_CELL)) refuse(`M21_SAMPLES must be 1..${G.SAMPLES_PER_CELL}`);

const WS = resolveWorkstation();
const RUN_ID = runIdOf();
mkdirSync(OUT, { recursive: true });
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `letterbox-diagnostic-${RUN_ID}.json`)), WS);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const browserVersion = browser.version();

/** Decode a PNG the way the product does: createImageBitmap, then a canvas read. */
async function decodeInBrowser(page, png) {
  const r = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const g = canvas.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    bmp.close();
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return { width: canvas.width, height: canvas.height, b64: btoa(s) };
  }, png.toString("base64"));
  return { width: r.width, height: r.height, rgba: new Uint8ClampedArray(Buffer.from(r.b64, "base64")) };
}

/** Is every padding pixel of the letterboxed tensor exactly the pad byte? */
function padIntact(stages) {
  const t = stages.transform;
  const L = stages.letterboxed;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const inContent = x >= t.padLeft && x < t.padLeft + t.resizedW && y >= t.padTop && y < t.padTop + t.resizedH;
      if (inContent) continue;
      const i = (y * S + x) * 3;
      if (L[i] !== t.padByte || L[i + 1] !== t.padByte || L[i + 2] !== t.padByte) return false;
    }
  }
  return true;
}

const outsideFrame = (b, f) => b.x < 0 || b.y < 0 || b.x + b.w > f.w || b.y + b.h > f.h;

const cells = [];
let determinism = null;
for (const cell of CELLS) {
  const { w, h } = cell.viewport;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const screens = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const spec = { ...E.makeSpec(G.specIdFor(i), G.seedFor(i)), viewport: { w, h } };
    await page.setContent(E.specToHtml(spec), { waitUntil: "load" });
    // No scrollbar: it would take width from the viewport the labels are measured in.
    await page.addStyleTag({ content: "html,body{overflow:hidden!important}" });
    const measured = await page.evaluate(() => window.__measure());
    if (measured.viewport.w !== w || measured.viewport.h !== h || measured.viewport.dpr !== 1) {
      refuse(`${cell.id}: the page measured ${measured.viewport.w}x${measured.viewport.h}@${measured.viewport.dpr}, not ${w}x${h}@1`);
    }
    const image = await decodeInBrowser(page, await page.screenshot({ type: "png", animations: "disabled", caret: "hide" }));

    const geometry = P.geometryFrom(
      { dpr: 1, zoom: 1, viewportCssWidth: w, viewportCssHeight: h, scrollX: 0, scrollY: 0, origin: "http://127.0.0.1" },
      image.width,
      image.height
    );
    const transform = P.computeLetterbox(geometry.captureSize, S);
    const stages = P.preprocessToTensor(image, P.HEAD_CONTRACT);
    P.assertRasterMatchesInverse(stages.transform, transform);
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", stages.tensor, [1, 3, S, S]) };
    const raw = (await session.run(feeds))[session.outputNames[0]];
    if (i === 0 && determinism === null) {
      const again = (await session.run(feeds))[session.outputNames[0]];
      const h1 = createHash("sha256").update(Buffer.from(raw.data.buffer)).digest("hex");
      const h2 = createHash("sha256").update(Buffer.from(again.data.buffer)).digest("hex");
      determinism = { cell: cell.id, sample: 0, sameOutputTwice: h1 === h2 };
    }

    const decoded = P.decodeHeadOutputAccounted({ data: raw.data, dims: raw.dims });
    if (!decoded.ok) refuse(`${cell.id}/${i}: decode refused (${decoded.code})`);
    const projected = P.projectToCaptureAccounted(decoded.value.detections, transform);

    // The pre-M21 inverse, from the same primitives, for the before/after on real head output.
    const unbounded = [];
    for (const d of decoded.value.detections) {
      const c = P.clipToContent(d.box, transform);
      if (c) unbounded.push({ box: P.modelToCapture(c, transform), label: d.label, score: d.score });
    }
    const asRaw = (list) => list.map((d) => ({ x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h, score: d.score, label: d.label }));
    const frame = { id: P.frameId(`m21-${cell.id}-${i}`), capturedAt: 0, source: "live", geometry };

    const visual = P.toVisualDetections(projected.detections, frame, { role: "UIElementDetector", modelId: G.MODEL.modelId, revision: G.MODEL.revision });
    const labels = measured.elements.map((el) => {
      const css = P.cssBox(el.x, el.y, el.w, el.h);
      return { cls: el.cls, css, model: P.captureToModel(P.cssToCapture(css, geometry), transform) };
    });

    screens.push({
      decode: decoded.value.accounting,
      projection: projected.accounting,
      validation: {
        unboundedBoxesOutsideFrame: unbounded.filter((d) => outsideFrame(d.box, geometry.captureSize)).length,
        unboundedFrameRefused: P.validateDetections(asRaw(unbounded), frame).ok ? 0 : 1,
        shippedBoxesOutsideFrame: projected.detections.filter((d) => outsideFrame(d.box, geometry.captureSize)).length,
        shippedFrameRefused: P.validateDetections(asRaw(projected.detections), frame).ok ? 0 : 1,
      },
      preprocessing: {
        sourceCropped: stages.transform.resizedW > S || stages.transform.resizedH > S ? 1 : 0,
        padIntact: padIntact(stages) ? 1 : 0,
      },
      attribution: attributeScreen({
        labels,
        decoded: decoded.value.detections.map((d) => ({ label: d.label, box: d.box })),
        projected: visual.map((d) => ({ label: d.label, box: d.box })),
        viewport: { w, h },
      }),
    });
  }
  await context.close();

  const t = P.computeLetterbox({ w, h }, S);
  const r = P.rasterLetterbox({ w, h }, S, P.HEAD_CONTRACT.padValue);
  const a = sumAttributions(screens.map((s) => s.attribution));
  const sizes = Object.fromEntries(Object.entries(a.sizes).map(([k, v]) => [k, summarise(v.map((x) => Math.round(x * 100) / 100))]));
  delete a.sizes;
  cells.push({
    id: cell.id,
    viewport: cell.viewport,
    cssPerModelPx: Math.max(w, h) / S,
    letterbox: {
      axis: t.padY > 1e-9 ? "vertical (top and bottom)" : t.padX > 1e-9 ? "horizontal (left and right)" : "none",
      continuousPad: { x: Math.round(t.padX * 1e6) / 1e6, y: Math.round(t.padY * 1e6) / 1e6 },
      rasterPad: { left: r.padLeft, top: r.padTop, right: r.padRight, bottom: r.padBottom },
      contentShareOfSquare: Math.round(((r.resizedW * r.resizedH) / (S * S)) * 10000) / 10000,
    },
    screens: screens.length,
    decode: sumCounts(screens.map((s) => s.decode)),
    projection: sumCounts(screens.map((s) => s.projection)),
    validation: sumCounts(screens.map((s) => s.validation)),
    preprocessing: sumCounts(screens.map((s) => s.preprocessing)),
    labels: { ...a, minSideModelPx: sizes },
  });
  const c = cells.at(-1);
  console.log(
    `${cell.id.padEnd(16)} ${String(w).padStart(4)}x${String(h).padEnd(4)} labels ${c.labels.visible}: detected ${c.labels.DETECTED}, lost in projection ${c.labels.LOST_IN_PROJECTION}, not emitted ${c.labels.NOT_EMITTED} | ` +
      `boxes in padding ${c.projection.droppedInPadding}, bounded ${c.projection.boundedToFrame}, frames refused before/after ${c.validation.unboundedFrameRefused}/${c.validation.shippedFrameRefused}`
  );
}
await browser.close();

const record = {
  experiment: "M21 — letterbox diagnostic: where labelled elements are lost as the screen's shape changes",
  classification: "ENGINEERING DIAGNOSTIC. Not a J7 experiment, not detector adoption evidence, not an accuracy claim. DEV synthetic screens only.",
  runId: RUN_ID,
  fixtures: {
    generator: `@pratibimb/evaluation makeSpec/specToHtml (generator ${E.GENERATOR_VERSION ?? "unversioned"})`,
    specs: `W1/Track B DEV specs: specIdFor(i), seedFor(i) = ${G.SCALE_SEED_BASE} + i, i = 0..${SAMPLES - 1}; viewport overridden per cell`,
    split: "dev only; no TEST sample generated, rendered or scored",
    labels: "getBoundingClientRect of the rendered document; only labels wholly inside the viewport are attributed",
  },
  heldFixed: "long side 1280 CSS px, DPR 1: 2.0 CSS px per model px in every cell",
  path: "Chromium PNG decode (createImageBitmap + canvas) → geometryFrom → preprocessToTensor → assertRasterMatchesInverse → ORT Web wasm → decodeHeadOutputAccounted → projectToCaptureAccounted → captureToCss",
  model: { modelId: G.MODEL.modelId, revision: G.MODEL.revision, sha256: G.MODEL.sha256, verified: "full SHA-256 and size, before the session was created" },
  decode: { scoreFloor: P.PROVISIONAL_THRESHOLDS.score, nmsIou: P.PROVISIONAL_THRESHOLDS.nmsIou, maxDetections: P.PROVISIONAL_THRESHOLDS.maxDetections, note: "the shipped decode, PROVISIONAL thresholds; not the 0.55 evaluation operating point" },
  matching: "class-agnostic IoU > 0.5 (the frozen fusion threshold); class agreement counted separately",
  environment: { browser: `Chromium ${browserVersion} (headless; renders and decodes only)`, ort: `onnxruntime-web ${ort.env.versions?.web} in Node, wasm, 1 thread`, node: process.version },
  determinism,
  cells,
  notAClaim: [
    "synthetic DEV screens from this project's own generator; nothing about real websites",
    "one machine; no other browser or backend",
    "the detector is UNADOPTED; a detection count here is not an accuracy figure",
    "not a J7 experiment and not a D1–D4 or B5 input",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown" },
};
if (process.env.M21_DRY_RUN === "1") {
  console.log("dry run: nothing written");
} else {
  writeNewRecord(TARGET, record);
  console.log(`written: ${TARGET}`);
}
