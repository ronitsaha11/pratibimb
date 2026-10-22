#!/usr/bin/env node
/**
 * M13 Unit 2 — J7: IS THE REAL CAPTURE STREAM DETERMINISTIC ENOUGH FOR PRIVACY VERIFICATION?
 * **HUMAN-IN-THE-LOOP.** One real toolbar click per window; nothing here produces a click.
 *
 *   click → activeTab → getMediaStreamId → offscreen getUserMedia → stream frame → UI head
 *     → TR-01 (the frozen pin, full frame) → fail-closed plan → canonical geometry → opaque fill
 *
 * MATRIX: device scales 1, 1.25, 1.5, 2 × held-out H1–H6 × 3 real-stream passes = 72 observations.
 * The frozen held-out screenshots are shown 1:1 at (0,0) in the granted document; nothing about the
 * detector, its thresholds, the geometry, RE-1 or the fixtures is changed.
 *
 * PER OBSERVATION: page DPR, capture dims and scaleToCss, the RAW frame's SHA-256 (before masking),
 * pixel differences of the raw frame against pass 1 and against the previous pass (computed in the
 * realm on the unaltered frame — no crop, resize or threshold; statistics only leave the realm), the
 * boxes with scores, the producer's mask rectangles and area, and RE-1 G1/G2/G3 scored on that pass.
 *
 * THE DIAGNOSTIC SPLIT. After the three passes of an image, TR-01 runs FIVE more times on pass 1's
 * exact raw bytes (`j7-redetect`): RE-1 G4 as pre-registered ("outputs across ≥ 5 inferences per
 * input: byte-identical"). Every later pass is then classified against pass 1:
 *   pixels identical + output identical  → DETERMINISTIC
 *   pixels identical + output different  → INFERENCE_NONDETERMINISM
 *   pixels different + output different  → CAPTURE_PIXELS_DIFFER_OUTPUT_DIFFERS
 *   pixels different + output identical  → CAPTURE_PIXELS_DIFFER_OUTPUT_STABLE
 *
 * G4 IS REPORTED TWO WAYS, NEVER MERGED:
 *   g4Inference     RE-1 G4 as pre-registered: ≥ 5 inferences on identical input, byte-identical.
 *   g4StreamRepeat  the rule M12 applied: three captures of the same displayed image, identical boxes.
 * J7 is CLOSED only if every G1–G3 holds and g4StreamRepeat holds everywhere (the criterion M12 failed).
 * A G1–G3 failure makes J7 a SECURITY BLOCKER and stops the run before the next window.
 *
 * SAFETY, per window: the offscreen document's fetch count and origins before and after (no new
 * destination, no request at all is expected), the service worker's traffic scanned for pixels.
 *
 * DRY RUN (M13_J7_DRY_RUN=1): the degraded M3_WORKER_FRAME route, no click; mechanics only.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M13_J7_DRY_RUN=1] node tests/browser/extension/run-stream-j7.mjs
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, release as osRelease, tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";

import { ROOT, startDemoServer } from "../demo/server.mjs";
import { scoreImage } from "../support/redaction-metrics.mjs";
import { connectSrcOf, manifestRouteSha } from "../support/build-route.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const WS = resolveWorkstation();
const APP = join(ROOT, "apps", "extension");
const EXT = join(APP, ".output", "chrome-mv3");
const OUT = join(ROOT, "artifacts", "experiments", "M13-csp-and-stream-determinism", "logs");
const DPRS = (process.env.M13_J7_DPRS ?? "1,1.25,1.5,2").split(",").map(Number);
const WAIT_MS = Number(process.env.M13_J7_GESTURE_WAIT_MS ?? 30 * 60_000);
const PASSES = 3;
const REDETECT = 5;
const DRY = process.env.M13_J7_DRY_RUN === "1";
const RUN = Number(process.env.M13_J7_RUN ?? 1);
const HELD_OUT_DIR = join(ROOT, "artifacts", "experiments", "M8.2-qg03-visual-text-feasibility", "models", "fixtures", "screenshots");
const HELD_OUT = JSON.parse(readFileSync(join(ROOT, "tests", "browser", "extension", "fixture", "heldout", "groundtruth.json"), "utf8"));
const M81 = JSON.parse(readFileSync(join(ROOT, "artifacts", "experiments", "M8.1-visual-text-screening", "results", "tr-01-run1.json"), "utf8"));
const TR01_SHA256 = /onnx:[\s\S]*?sha256:\s*"([0-9a-f]{64})"/.exec(readFileSync(join(APP, "host-lib", "tr01-pin.ts"), "utf8"))?.[1] ?? null;

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");
if (!TR01_SHA256) refuse("could not read TR-01's pinned SHA-256");
for (const img of HELD_OUT.images) if (!existsSync(join(HELD_OUT_DIR, `${img.image}.png`))) refuse(`missing held-out frame ${img.image}.png`);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, DRY ? "cft-stream-j7-dryrun.json" : RUN > 1 ? `cft-stream-j7-run${RUN}.json` : "cft-stream-j7.json")), WS);
if (!DRY && existsSync(TARGET)) refuse(`${TARGET} already exists; a formal run does not overwrite an earlier record`);
const heldOutSha = Object.fromEntries(HELD_OUT.images.map((i) => [i.image, createHash("sha256").update(readFileSync(join(HELD_OUT_DIR, `${i.image}.png`))).digest("hex")]));

// ── builds: the evidence build's capture route is the product's (ADR-0013 connect-src aside) ──────
const shaFile = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const routeFiles = () => ({ background: shaFile(join(EXT, "background.js")), content: shaFile(join(EXT, "content-scripts", "content.js")), manifest: manifestRouteSha(EXT), connectSrc: connectSrcOf(EXT) });
const bundleText = () => [join(EXT, "background.js"), join(EXT, "content-scripts", "content.js"), ...readdirSync(join(EXT, "chunks")).map((f) => join(EXT, "chunks", f))].map((f) => readFileSync(f, "utf8")).join("\n");
const build = (env) => execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "", ...env }, stdio: "pipe" });
console.log("building the PRODUCT extension…");
build({});
const productRoute = routeFiles();
const productBundle = bundleText();
console.log(`building the EVIDENCE extension (TR01_PROBE=1${DRY ? ", M3_WORKER_FRAME=1 — DRY RUN" : ""})…`);
build(DRY ? { TR01_PROBE: "1", M3_WORKER_FRAME: "1" } : { TR01_PROBE: "1" });
const evidenceRoute = routeFiles();
const buildFacts = {
  productRoute,
  evidenceRoute,
  routeIdenticalToProduct: JSON.stringify({ ...productRoute, connectSrc: null }) === JSON.stringify({ ...evidenceRoute, connectSrc: null }),
  connectSrcDiffersOnlyByCollector: productRoute.connectSrc === "'self' http://127.0.0.1:8995/v1/chat/completions" && evidenceRoute.connectSrc === "'self' http://127.0.0.1:8995",
  noCaptureVisibleTab: !readFileSync(join(EXT, "background.js"), "utf8").includes("captureVisibleTab"),
  // Production frame egress stays absent from the product bundle (M12 markers).
  productBundleCarriesNoFrameSender: !["PRODUCTION_TRANSPORT_ABSENT", "FRAME_NOT_MASK_VERIFIED", "/m10/frame", "IMAGE_WITHHELD"].some((m) => productBundle.includes(m)),
  tr01Sha256: TR01_SHA256,
};
if (!buildFacts.productBundleCarriesNoFrameSender) refuse("the PRODUCT bundle carries a frame sender");
if (!DRY && !buildFacts.connectSrcDiffersOnlyByCollector) refuse(`connect-src difference is not exactly the collector: ${JSON.stringify(buildFacts)}`);
if (!DRY && !buildFacts.routeIdenticalToProduct) refuse(`the evidence build's capture route differs from the product's: ${JSON.stringify(buildFacts)}`);
if (!DRY && !buildFacts.noCaptureVisibleTab) refuse("this is not the product capture route");

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const banner = (page, text) =>
  page.evaluate((t) => {
    let b = document.getElementById("__m13_banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "__m13_banner";
      b.style.cssText = "position:absolute;left:20px;top:600px;width:560px;padding:10px 14px;background:#fff3b0;border:2px solid #c08a00;font:bold 18px Arial;color:#222;z-index:9;";
      document.body.appendChild(b);
    }
    b.textContent = t;
  }, text);
const toCss = (dets, s) => dets.map((d) => ({ ...d, x: d.x * s, y: d.y * s, w: d.w * s, h: d.h * s }));
const boxOnly = (dets) => dets.map(({ x, y, w, h }) => ({ x, y, w, h }));
/** Pairwise movement between two detection lists (paired by index; same post-processing, same order). */
function boxDelta(a, b) {
  const out = { countA: a.length, countB: b.length, sameCount: a.length === b.length, identical: isDeepStrictEqual(a, b) };
  if (!out.sameCount) return out;
  let mdx = 0, mdy = 0, mdw = 0, mdh = 0, mscore = 0, sumMove = 0, identicalBoxes = 0;
  a.forEach((p, k) => {
    const q = b[k];
    const dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y), dw = Math.abs(p.w - q.w), dh = Math.abs(p.h - q.h);
    mdx = Math.max(mdx, dx); mdy = Math.max(mdy, dy); mdw = Math.max(mdw, dw); mdh = Math.max(mdh, dh);
    mscore = Math.max(mscore, Math.abs(p.score - q.score));
    sumMove += (dx + dy + dw + dh) / 4;
    if (dx === 0 && dy === 0 && dw === 0 && dh === 0 && p.score === q.score) identicalBoxes++;
  });
  return { ...out, maxAbsDx: mdx, maxAbsDy: mdy, maxAbsDw: mdw, maxAbsDh: mdh, meanAbsCoordMovement: a.length ? sumMove / a.length : 0, maxScoreDelta: mscore, identicalBoxes, identicalBoxRate: a.length ? identicalBoxes / a.length : 1 };
}
const classify = (pixelsIdentical, outputIdentical) =>
  pixelsIdentical ? (outputIdentical ? "DETERMINISTIC" : "INFERENCE_NONDETERMINISM") : outputIdentical ? "CAPTURE_PIXELS_DIFFER_OUTPUT_STABLE" : "CAPTURE_PIXELS_DIFFER_OUTPUT_DIFFERS";

const { server, origin } = await startDemoServer(8983);
const cells = [];
let securityBlocker = null;
try {
  for (const [index, dpr] of DPRS.entries()) {
    if (securityBlocker) break;
    const cell = { dpr, window: `${index + 1} of ${DPRS.length}`, realGesture: DRY ? "NOT APPLICABLE (dry run)" : "NOT RECORDED", failure: null };
    let context = null;
    try {
      const profile = mkdtempSync(join(tmpdir(), "pratibimb-m13-j7-"));
      context = await chromium.launchPersistentContext(profile, { headless: false, executablePath, viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr, args: [`--force-device-scale-factor=${dpr}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
      const pageRequests = [];
      context.on("request", (r) => pageRequests.push(new URL(r.url()).origin));
      const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
      const extensionOrigin = `chrome-extension://${new URL(sw.url()).host}`;
      await sw.evaluate(() => globalThis.__host.ensureOffscreen());
      const page = await context.newPage();
      const served = await page.goto(`${origin}/mask/`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__maskReady === true);
      const cssWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const pageDpr = await page.evaluate(() => window.devicePixelRatio);
      await banner(page, `Window ${index + 1} of ${DPRS.length} (device scale ${dpr}): click the PratiBimb toolbar button once.`);
      await page.bringToFront();
      await wait(1_000);
      const identity = await sw.evaluate(() => [...globalThis.__host.hellos].reverse()[0]?.identity ?? null);
      if (!identity) throw new Error("preflight: the content script never attached");
      const probeNow = (args) => sw.evaluate((a) => globalThis.__host.toOffscreen({ kind: "TR01_PROBE", ...a }), args);
      const productState = await probeNow({ op: "product-state" });
      const arrivalsBefore = await probeNow({ op: "offscreen-arrivals" });
      cell.preflight = {
        fixturePageServed: served?.status() === 200,
        contentScriptAttested: typeof identity.tabId === "number",
        noGrantYet: (await sw.evaluate(() => globalThis.__host.captureState())).grants.length === 0,
        captureRefusedBeforeGesture: DRY ? "n/a (dry run)" : (await sw.evaluate((t) => globalThis.__host.ticketProbe(t), identity.tabId))?.refused === "NO_ACTIVE_TAB_GRANT",
        productTr01HostNotYetCreated: productState?.tr01 === null,
        instrumentationReady: typeof arrivalsBefore?.arrivals === "number",
        pageDevicePixelRatio: pageDpr,
      };
      if (!Object.entries(cell.preflight).filter(([k]) => k !== "pageDevicePixelRatio").every(([, v]) => v === true || typeof v === "string")) throw new Error(`preflight failed: ${JSON.stringify(cell.preflight)}`);

      if (DRY) console.log(`\n>>> DRY_RUN window=${index + 1}/${DPRS.length} dpr=${dpr}: no click requested (degraded route)`);
      else {
        console.log(`\n>>> AWAITING_GESTURE window=${index + 1}/${DPRS.length} dpr=${dpr} url=${origin}/mask/`);
        console.log("    In the Chrome for Testing window that just opened, click the PratiBimb toolbar button once.");
      }
      const t0 = Date.now();
      let grant = DRY ? { tabId: identity.tabId } : null;
      while (!DRY && Date.now() - t0 < WAIT_MS) {
        grant = (await sw.evaluate(() => globalThis.__host.captureState())).grants.find((g) => g.tabId === identity.tabId) ?? null;
        if (grant) break;
        await wait(500);
      }
      if (!grant) throw new Error(`no click arrived within ${WAIT_MS} ms`);
      console.log(DRY ? `>>> DRY_RUN_PROCEEDING window=${index + 1}/${DPRS.length} (no gesture)` : `>>> GESTURE_RECEIVED window=${index + 1}/${DPRS.length}`);
      await banner(page, `Window ${index + 1} of ${DPRS.length}: click received, thank you. Measuring, do not click again.`);
      await wait(1_500);
      cell.gesture = DRY ? { dryRun: true } : { tabId: grant.tabId, observedAt: new Date().toISOString(), waitedMs: Date.now() - t0 };
      const probe = async (args) => {
        if (DRY && args.op === "pass") await wait(700);
        const r = await probeNow(args);
        if (r?.error) throw new Error(`${args.op}: ${r.error}`);
        return r;
      };

      const images = [];
      for (const img of HELD_OUT.images) {
        const src = `data:image/png;base64,${readFileSync(join(HELD_OUT_DIR, `${img.image}.png`)).toString("base64")}`;
        const shown = await page.evaluate(async (u) => {
          document.documentElement.style.cssText = "margin:0;padding:0;overflow:hidden;";
          document.body.style.cssText = "margin:0;padding:0;overflow:hidden;";
          document.body.innerHTML = "";
          const el = document.createElement("img");
          el.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:720px;display:block;";
          document.body.appendChild(el);
          await new Promise((ok, no) => ((el.onload = ok), (el.onerror = no), (el.src = u)));
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
          return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio };
        }, src);
        await wait(300);
        await probe({ op: "j7-reset" });
        const passes = [];
        for (let p = 0; p < PASSES; p++) {
          const r = await probe({ op: "pass", tabId: identity.tabId, frameId: identity.frameId, cssWidth, inkRects: [], controlRects: [] });
          const cap = r.summary.capture;
          const dets = r.summary.redaction.detail?.detections ?? [];
          const masks = r.summary.redaction.detail?.masks ?? [];
          const cssDets = toCss(dets, cap.scaleToCss);
          const score = scoreImage({ boxes: boxOnly(cssDets) }, { region: img.region, strings: img.strings });
          passes.push({
            pass: p + 1,
            route: r.summary.route,
            pageDevicePixelRatio: shown.devicePixelRatio,
            capture: { w: cap.w, h: cap.h, dpr: cap.dpr, scaleToCss: cap.scaleToCss },
            viewport: r.viewport,
            rawRgbaSha256: r.rawRgbaSha256,
            pixelDiff: r.j7 ?? null,
            detectorRan: r.summary.redaction.detector.ran,
            detectorCode: r.summary.redaction.detector.code ?? null,
            failClosed: r.summary.redaction.failClosed,
            outcome: r.summary.redaction.outcome,
            detections: dets,
            masks: masks.map((m) => ({ regionId: m.regionId, pixelRects: m.pixelRects })),
            maskPixelArea: masks.flatMap((m) => m.pixelRects).reduce((n, q) => n + q.w * q.h, 0),
            g1ExposedSensitiveGlyphs: score.exposedSensitiveGlyphs,
            g2OverMaskRatio: score.overMaskRatio,
            g3LargestBoxShare: score.largestSingleBoxRegionShare,
            maskedRegionShare: score.maskedRegionShare,
            gates: score.gates,
            sensitiveGlyphs: score.sensitiveGlyphs,
            sensitiveRegionSafelyMasked: score.gates.noExposedSensitiveGlyph === true && score.exposedSensitiveGlyphs === 0,
          });
        }
        const redetect = await probe({ op: "j7-redetect", n: REDETECT });
        await probe({ op: "j7-end" });
        const p1 = passes[0];
        const runDets = redetect.runs.map((x) => (x.ok ? x.detections : { failed: x.code }));
        const pairs = { "1v2": [0, 1], "2v3": [1, 2], "1v3": [0, 2] };
        const pairwise = Object.fromEntries(Object.entries(pairs).map(([k, [a, b]]) => [k, { pixelsIdentical: passes[a].rawRgbaSha256 === passes[b].rawRgbaSha256, boxes: boxDelta(passes[a].detections, passes[b].detections) }]));
        const vsPass1 = passes.slice(1).map((p) => {
          const pixelsIdentical = p.rawRgbaSha256 === p1.rawRgbaSha256;
          const outputIdentical = isDeepStrictEqual(p.detections, p1.detections);
          return { pass: p.pass, pixelsIdentical, outputIdentical, classification: classify(pixelsIdentical, outputIdentical) };
        });
        const m81Boxes = M81.inputs[img.image].boxes;
        const vsM81 = boxDelta(toCss(p1.detections, p1.capture.scaleToCss), m81Boxes);
        images.push({
          image: img.image,
          heldOutPngSha256: heldOutSha[img.image],
          shown,
          passes,
          redetect: {
            referenceRgbaSha256: redetect.referenceRgbaSha256,
            referenceIsPass1RawFrame: redetect.referenceRgbaSha256 === p1.rawRgbaSha256,
            runs: REDETECT,
            allRunsIdentical: runDets.every((d) => isDeepStrictEqual(d, runDets[0])),
            runsIdenticalToPass1Product: runDets.every((d) => isDeepStrictEqual(d, p1.detections)),
            firstRunDeltaFromPass1: Array.isArray(runDets[0]) ? boxDelta(p1.detections, runDets[0]) : null,
          },
          pairwise,
          vsPass1,
          g4Inference: runDets.every((d) => isDeepStrictEqual(d, runDets[0])),
          g4StreamRepeat: passes.every((p) => isDeepStrictEqual(p.detections, p1.detections)),
          vsM81: { maxCoordinateDifferencePx: vsM81.sameCount ? Math.max(vsM81.maxAbsDx, vsM81.maxAbsDy, vsM81.maxAbsDw, vsM81.maxAbsDh) : null, sameCount: vsM81.sameCount },
        });
        const last = images.at(-1);
        console.log(`    ${img.image}: frames ${passes.map((p) => p.rawRgbaSha256?.slice(0, 8)).join("/")}  ${vsPass1.map((v) => v.classification).join(",")}  exposed ${passes.map((p) => p.g1ExposedSensitiveGlyphs).join("/")}  g4Inference ${last.g4Inference} g4StreamRepeat ${last.g4StreamRepeat}`);
        if (passes.some((p) => !p.gates.noExposedSensitiveGlyph || !p.gates.overMaskWithinBudget || !p.gates.noBlanketBox)) {
          securityBlocker = { dpr, image: img.image, gates: passes.map((p) => p.gates) };
          console.log(`>>> SECURITY_BLOCKER at dpr ${dpr} ${img.image}: a G1–G3 gate failed; stopping`);
          break;
        }
      }
      const arrivalsAfter = await probe({ op: "offscreen-arrivals" });
      const swAudit = await sw.evaluate(() => {
        const text = JSON.stringify(globalThis.__host.seen);
        return { messages: globalThis.__host.seen.length, png: text.includes("iVBORw0KGgo"), webpMagic: text.includes("UklGR"), dataUrl: text.includes("data:image"), longestBase64: (text.match(/[A-Za-z0-9+/]{200,}/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0) };
      });
      const allPasses = images.flatMap((i) => i.passes);
      cell.images = images;
      cell.safety = {
        offscreenFetchesDuringWindow: arrivalsAfter.arrivals - arrivalsBefore.arrivals,
        offscreenForeignFetchesDuringWindow: arrivalsAfter.foreign - arrivalsBefore.foreign,
        offscreenOrigins: arrivalsAfter.origins,
        serviceWorkerSawNoPixels: !swAudit.png && !swAudit.webpMagic && !swAudit.dataUrl && swAudit.longestBase64 < 200,
        pageRequestOrigins: [...new Set(pageRequests)],
      };
      cell.checks = {
        [DRY ? "dryRunProceededWithoutGesture" : "realGestureRecorded"]: DRY ? cell.gesture.dryRun === true : typeof cell.gesture.tabId === "number",
        [DRY ? "degradedWorkerFrameRoute" : "gestureStreamRoute"]: allPasses.length > 0 && allPasses.every((p) => p.route === (DRY ? "WORKER_FRAME" : "GESTURE_STREAM")),
        allEighteenObservations: allPasses.length === HELD_OUT.images.length * PASSES,
        everyPassRanTheDetector: allPasses.every((p) => p.detectorRan === true && p.failClosed === false),
        everyPassHasRawHashAndDiff: allPasses.every((p) => /^[0-9a-f]{64}$/.test(p.rawRgbaSha256 ?? "") && (p.pass === 1 || p.pixelDiff?.vsFirst?.comparable === true)),
        g1EveryPass: allPasses.every((p) => p.gates.noExposedSensitiveGlyph === true && p.g1ExposedSensitiveGlyphs === 0),
        g2EveryPass: allPasses.every((p) => p.gates.overMaskWithinBudget === true),
        g3EveryPass: allPasses.every((p) => p.gates.noBlanketBox === true),
        redetectOnPass1Bytes: images.every((i) => i.redetect.referenceIsPass1RawFrame),
        // Nothing leaves the extension: every fetch is a read of its own packaged files (the model the
        // probe's re-detect host loads), none to any other origin.
        noRequestLeavesTheExtension: cell.safety.offscreenForeignFetchesDuringWindow === 0 && cell.safety.offscreenOrigins.every((o) => o === extensionOrigin),
        serviceWorkerSawNoPixels: cell.safety.serviceWorkerSawNoPixels,
      };
      cell.g4 = {
        inference: images.every((i) => i.g4Inference),
        streamRepeat: images.every((i) => i.g4StreamRepeat),
      };
      if (!DRY && cell.checks.realGestureRecorded) cell.realGesture = "RECORDED";
      console.log(`>>> WINDOW_DONE ${index + 1}/${DPRS.length}: checks ${Object.values(cell.checks).every(Boolean) ? "PASS" : "FAIL " + Object.entries(cell.checks).filter(([, v]) => !v).map(([k]) => k).join(",")}  g4Inference ${cell.g4.inference}  g4StreamRepeat ${cell.g4.streamRepeat}`);
    } catch (e) {
      cell.failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
      console.log(`>>> WINDOW_FAILED ${index + 1}/${DPRS.length}: ${cell.failure}`);
    } finally {
      if (context) await context.close();
    }
    cells.push(cell);
  }
} finally {
  await new Promise((ok) => server.close(ok));
  console.log("restoring the PRODUCT build…");
  build({});
}

// ── analysis ────────────────────────────────────────────────────────────────────────────────────
const observations = cells.flatMap((c) => (c.images ?? []).flatMap((i) => i.passes.map((p) => ({ dpr: c.dpr, image: i.image, ...p }))));
const laterPasses = cells.flatMap((c) => (c.images ?? []).flatMap((i) => i.vsPass1.map((v) => ({ dpr: c.dpr, image: i.image, ...v }))));
const pairDeltas = cells.flatMap((c) => (c.images ?? []).flatMap((i) => Object.entries(i.pairwise).map(([k, v]) => ({ dpr: c.dpr, image: i.image, pair: k, ...v }))));
const stat = (xs) => {
  const s = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? { n: s.length, min: s[0], median: s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2, max: s.at(-1), mean: s.reduce((a, b) => a + b, 0) / s.length } : null;
};
const summarise = (obs, later, pairs, imgs) => ({
  observations: obs.length,
  g1Pass: obs.filter((o) => o.gates.noExposedSensitiveGlyph).length,
  g2Pass: obs.filter((o) => o.gates.overMaskWithinBudget).length,
  g3Pass: obs.filter((o) => o.gates.noBlanketBox).length,
  sensitiveExposures: obs.reduce((n, o) => n + o.g1ExposedSensitiveGlyphs, 0),
  sensitiveGlyphInstances: obs.reduce((n, o) => n + o.sensitiveGlyphs, 0),
  g4InferencePass: imgs.filter((i) => i.g4Inference).length,
  g4StreamRepeatPass: imgs.filter((i) => i.g4StreamRepeat).length,
  imageSeries: imgs.length,
  laterPassesVsPass1: later.length,
  rawFrameIdenticalToPass1: later.filter((v) => v.pixelsIdentical).length,
  classifications: later.reduce((m, v) => ({ ...m, [v.classification]: (m[v.classification] ?? 0) + 1 }), {}),
  pairs: pairs.length,
  pairsPixelIdentical: pairs.filter((p) => p.pixelsIdentical).length,
  pairsBoxesIdentical: pairs.filter((p) => p.boxes.identical).length,
  pairsSameBoxCount: pairs.filter((p) => p.boxes.sameCount).length,
  changedPixelsVsPass1: stat(obs.filter((o) => o.pass > 1).map((o) => o.pixelDiff?.vsFirst?.changedPixels)),
  maxChannelDeltaVsPass1: stat(obs.filter((o) => o.pass > 1).map((o) => o.pixelDiff?.vsFirst?.maxChannelDelta)),
  meanDeltaOverChangedVsPass1: stat(obs.filter((o) => o.pass > 1 && o.pixelDiff?.vsFirst?.changedPixels > 0).map((o) => o.pixelDiff.vsFirst.meanMaxChannelDeltaOverChanged)),
  boxMaxAbsDx: stat(pairs.map((p) => p.boxes.maxAbsDx)),
  boxMaxAbsDy: stat(pairs.map((p) => p.boxes.maxAbsDy)),
  boxMaxAbsDw: stat(pairs.map((p) => p.boxes.maxAbsDw)),
  boxMaxAbsDh: stat(pairs.map((p) => p.boxes.maxAbsDh)),
  boxMeanMovement: stat(pairs.map((p) => p.boxes.meanAbsCoordMovement)),
  maxScoreDelta: stat(pairs.map((p) => p.boxes.maxScoreDelta)),
  identicalBoxRate: stat(pairs.map((p) => p.boxes.identicalBoxRate)),
  inferenceRerunsIdenticalToProductPass1: imgs.filter((i) => i.redetect.runsIdenticalToPass1Product).length,
});
const allImgs = cells.flatMap((c) => c.images ?? []);
const analysis = {
  overall: summarise(observations, laterPasses, pairDeltas, allImgs),
  byDpr: Object.fromEntries(cells.map((c) => [c.dpr, summarise(observations.filter((o) => o.dpr === c.dpr), laterPasses.filter((v) => v.dpr === c.dpr), pairDeltas.filter((p) => p.dpr === c.dpr), c.images ?? [])])),
  byImage: Object.fromEntries(HELD_OUT.images.map(({ image }) => [image, summarise(observations.filter((o) => o.image === image), laterPasses.filter((v) => v.image === image), pairDeltas.filter((p) => p.image === image), allImgs.filter((i) => i.image === image))])),
};
const complete = !securityBlocker && cells.length === DPRS.length && cells.every((c) => c.failure === null && Object.values(c.checks ?? {}).every(Boolean)) && observations.length === DPRS.length * HELD_OUT.images.length * PASSES;
const j7 = DRY
  ? "NOT ASSESSED (dry run)"
  : securityBlocker
    ? "SECURITY BLOCKER"
    : !complete
      ? "OPEN (incomplete evidence)"
      : cells.every((c) => c.g4.streamRepeat)
        ? "CLOSED"
        : "OPEN";
const record = {
  experiment: DRY ? "M13 Unit 2 — DRY RUN of the J7 harness on the DEGRADED route (not stream evidence)" : "M13 Unit 2 — J7 real-stream determinism characterisation, 4 device scales × H1–H6 × 3 passes",
  verdict: complete ? "COMPLETE" : "INCOMPLETE",
  j7,
  securityBlocker,
  dryRun: DRY,
  humanInTheLoop: !DRY,
  invocationMethod: DRY ? "no gesture: the degraded M3_WORKER_FRAME route" : "a person clicked the extension's toolbar action once per window; nothing in this process produced, simulated or substituted for the click",
  realGesturePerWindow: cells.map((c) => ({ dpr: c.dpr, realGesture: c.realGesture })),
  matrix: { deviceScales: DPRS, images: HELD_OUT.images.map((i) => i.image), passesPerImage: PASSES, inferenceRerunsPerImage: REDETECT, expectedObservations: DPRS.length * HELD_OUT.images.length * PASSES, recordedObservations: observations.length },
  frozen: { tr01Sha256: TR01_SHA256, heldOut: { set: HELD_OUT.set, version: HELD_OUT.version, totals: HELD_OUT.totals }, re1Scorer: "tests/browser/support/redaction-metrics.mjs (unchanged)", detectorThresholdsAndGeometry: "unchanged" },
  g4Definitions: {
    g4Inference: "RE-1 G4 as pre-registered: outputs across ≥ 5 inferences on identical input, byte-identical (here: 5 TR-01 runs on pass 1's exact raw bytes)",
    g4StreamRepeat: "the rule M12 applied to stream frames: three captures of the same displayed image give byte-identical detections",
  },
  carriedOver: { G5: "WASM validity vs native: a property of the runtime, not the capture route; not re-run", G6: "no plaintext output: structural, unchanged" },
  analysis,
  notAClaim: [
    "six images, one workstation, one operator, one browser build; no recall or determinism claim beyond this set and this machine",
    "the inference re-runs use the probe's own TR-01 host (same worker script, model pin and runtime as the product host, a separate instance)",
    "the product route caps the stream to CSS size; scaleToCss was observed, not chosen",
  ],
  build: buildFacts,
  cells,
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, browserBinary: executablePath, headless: false },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`\n${record.verdict}  ${DRY ? "DRY RUN (degraded route, NOT stream evidence)" : "real gesture"}  observations ${observations.length}/${record.matrix.expectedObservations}  J7: ${j7}`);
console.log(`  classifications (later passes vs pass 1): ${JSON.stringify(analysis.overall.classifications)}`);
console.log(`  G1/G2/G3 pass: ${analysis.overall.g1Pass}/${analysis.overall.g2Pass}/${analysis.overall.g3Pass} of ${analysis.overall.observations}; exposures ${analysis.overall.sensitiveExposures}/${analysis.overall.sensitiveGlyphInstances}; g4Inference ${analysis.overall.g4InferencePass}/${analysis.overall.imageSeries}; g4StreamRepeat ${analysis.overall.g4StreamRepeatPass}/${analysis.overall.imageSeries}`);
console.log(`written: ${TARGET}`);
process.exit(complete ? 0 : 1);
