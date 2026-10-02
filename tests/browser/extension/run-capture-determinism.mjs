#!/usr/bin/env node
/**
 * J7 CLOSURE — CAPTURE DETERMINISM vs INFERENCE DETERMINISM, SEPARATED. **HUMAN-IN-THE-LOOP.**
 *
 * WHY. The formal J7 harness measures three `op: "pass"` calls and compares boxes. Every pass is a
 * COMPLETE capture lifecycle — `perception-realm.ts:689` opens a fresh `getUserMedia` stream,
 * `grabFrame()` takes exactly one frame, `track.stop()` closes it, and `capture-authority.ts:256`
 * mints a new handle each time — so that check measures capture determinism and inference determinism
 * MULTIPLIED TOGETHER. When it fails, neither factor is identified. It failed on W1 (DPR 1.25/H4 and
 * 1.5/H3, F-M12-2) and on W2 run 1 (DPR 1.0/H1), and passed 24/24 on W2 run 2.
 *
 * The pre-registered G4 (`docs/perception/redaction-evaluation.md` line 185) is "boxes across two
 * complete runs; outputs across ≥ 5 inferences per input — byte-identical", and criterion 6
 * (`docs/perception/text-region-acceptance.md` line 106) fixes the INPUT: "two consecutive runs on the
 * same **fixture**". Neither says a re-captured frame may vary. This measures the two factors apart.
 *
 * THREE PHASES, one window, one device scale, ONE human click:
 *
 *   A. CAPTURE — N fresh capture passes of one unchanging page. Records only the real-frame SHA-256
 *      the probe already computes over the RGBA TR-01 infers on. Distinct digests ⇒ the capture of an
 *      unchanging page is not bit-stable, measured, not inferred.
 *   B. INFERENCE, on a RETAINED REAL CAPTURED FRAME — one pass retains its raw frame in the realm
 *      (`op: "retain-raw"`), then N detector runs over THOSE EXACT BYTES. Genuinely fixed input, on
 *      the stream's own tensor. Satisfies "≥ 5 inferences per input".
 *   C. INFERENCE, on the FROZEN FIXTURE — N detector runs over the held-out PNG, which is criterion
 *      6's "same fixture" literally. Costs nothing and is the established pattern in
 *      `run-tr01-worker.mjs`. A cross-check on B, not a substitute for it.
 *
 * NOTHING IS TUNED, and this changes no product behaviour: `probe/tr01.ts` is compiled only when
 * TR01_PROBE=1 (`wxt.config.ts` line 143), the product build gets `probe/tr01-absent.ts`, and the
 * detector, model pin, thresholds, preprocessing, crop geometry, privacy logic, CSP, permissions and
 * the capture route are the committed ones. `scaleToCss` is recorded, never forced.
 *
 * This is NOT a J7 re-run: one image, one scale, no RE-1 scoring, no gate verdict.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M12_CD_N=10] [M12_CD_DPR=1] [M12_CD_IMAGE=H1] \
 *          node tests/browser/extension/run-capture-determinism.mjs
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, release as osRelease, tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";

import { ROOT, startDemoServer } from "../demo/server.mjs";
import { connectSrcOf, manifestRouteSha } from "../support/build-route.mjs";
import { decodePng } from "../support/png-decode.mjs";
import { fixturesDir } from "../support/m82-baseline.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const WS = resolveWorkstation();
const APP = join(ROOT, "apps", "extension");
const EXT = join(APP, ".output", "chrome-mv3");
const OUT = join(ROOT, "artifacts", "experiments", "M12-qg04-enforcement", "logs");
const N = Number(process.env.M12_CD_N ?? 10);
const DPR = Number(process.env.M12_CD_DPR ?? 1);
const IMAGE = process.env.M12_CD_IMAGE ?? "H1";
const RUN = Number(process.env.M12_CD_RUN ?? 1);
const WAIT_MS = Number(process.env.M12_GESTURE_WAIT_MS ?? 30 * 60_000);
const HELD_OUT_DIR = join(fixturesDir(WS), "screenshots");
const PNG = join(HELD_OUT_DIR, `${IMAGE}.png`);
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
if (!existsSync(PNG)) refuse(`missing held-out frame ${PNG}`);
if (!(N >= 5)) refuse(`N must be at least 5 to satisfy the pre-registered "≥ 5 inferences per input"; got ${N}`);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, RUN > 1 ? `cft-capture-determinism-run${RUN}.json` : "cft-capture-determinism.json")), WS);
if (existsSync(TARGET)) refuse(`${TARGET} already exists; this run does not overwrite an earlier record`);

const shaFile = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const routeFiles = () => ({ background: shaFile(join(EXT, "background.js")), content: shaFile(join(EXT, "content-scripts", "content.js")), manifest: manifestRouteSha(EXT), connectSrc: connectSrcOf(EXT) });
const build = (env) => execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "", ...env }, stdio: "pipe" });
console.log("building the PRODUCT extension…");
build({});
const productRoute = routeFiles();
console.log("building the EVIDENCE extension (TR01_PROBE=1)…");
build({ TR01_PROBE: "1" });
const evidenceRoute = routeFiles();
const buildFacts = {
  productRoute,
  evidenceRoute,
  routeIdenticalToProduct: JSON.stringify({ ...productRoute, connectSrc: null }) === JSON.stringify({ ...evidenceRoute, connectSrc: null }),
  connectSrcDiffersOnlyByCollector: productRoute.connectSrc === "'self' http://127.0.0.1:8995/v1/chat/completions" && evidenceRoute.connectSrc === "'self' http://127.0.0.1:8995",
  noCaptureVisibleTab: !readFileSync(join(EXT, "background.js"), "utf8").includes("captureVisibleTab"),
  tr01Sha256: TR01_SHA256,
};
if (!buildFacts.routeIdenticalToProduct) refuse(`the evidence build's capture route differs from the product's: ${JSON.stringify(buildFacts)}`);
if (!buildFacts.connectSrcDiffersOnlyByCollector) refuse(`the evidence build's connect-src is not the product's widened to the collector origin: ${JSON.stringify(buildFacts)}`);
if (!buildFacts.noCaptureVisibleTab) refuse("this is not the product capture route");

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const banner = (page, text) =>
  page.evaluate((t) => {
    let b = document.getElementById("__cd_banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "__cd_banner";
      b.style.cssText = "position:absolute;left:20px;top:600px;width:560px;padding:10px 14px;background:#fff3b0;border:2px solid #c08a00;font:bold 18px Arial;color:#222;z-index:9;";
      document.body.appendChild(b);
    }
    b.textContent = t;
  }, text);

const { server, origin } = await startDemoServer(8984);
const record = {
  experiment: "J7 closure — capture determinism and inference determinism, measured apart",
  question: "does an unchanging page yield a bit-identical captured frame on every fresh stream, and is the detector bit-exact on a fixed frame?",
  humanInTheLoop: true,
  invocationMethod: "a person clicked the extension's toolbar action once; nothing in this process produced, simulated or substituted for the click",
  notAJ7Run: "one image, one device scale, no RE-1 scoring and no gate verdict; this does not re-run J7 and does not alter G1-G4",
  config: { run: RUN, n: N, dpr: DPR, image: IMAGE, heldOutPngSha256: shaFile(PNG) },
  frozen: { tr01Sha256: TR01_SHA256, detectorHost: "createTr01Host — the same factory the product wires at apps/extension/host/offscreen/main.ts:101, differing only in the instrumented worker spawn seam" },
  build: buildFacts,
  failure: null,
};
let context = null;
try {
  const profile = mkdtempSync(join(tmpdir(), "pratibimb-cd-"));
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: DPR,
    args: [`--force-device-scale-factor=${DPR}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await sw.evaluate(() => globalThis.__host.ensureOffscreen());
  const page = await context.newPage();
  const served = await page.goto(`${origin}/mask/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__maskReady === true);
  const cssWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const pageDpr = await page.evaluate(() => window.devicePixelRatio);

  // The one image, shown 1:1 at (0,0), then never touched again: the page is unchanging for every
  // pass that follows, so a differing capture cannot be a differing page.
  const src = `data:image/png;base64,${readFileSync(PNG).toString("base64")}`;
  const shown = await page.evaluate(async (u) => {
    document.documentElement.style.cssText = "margin:0;padding:0;overflow:hidden;";
    document.body.style.cssText = "margin:0;padding:0;overflow:hidden;";
    document.body.innerHTML = "";
    const el = document.createElement("img");
    el.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:720px;display:block;";
    document.body.appendChild(el);
    await new Promise((ok, no) => {
      el.onload = ok;
      el.onerror = no;
      el.src = u;
    });
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio };
  }, src);
  record.shown = shown;
  if (!(shown.naturalWidth === 1280 && shown.naturalHeight === 720 && shown.scrollX === 0 && shown.scrollY === 0)) throw new Error(`the held-out frame is not shown 1:1 at the origin: ${JSON.stringify(shown)}`);

  const identity = await sw.evaluate(() => [...globalThis.__host.hellos].reverse()[0]?.identity ?? null);
  if (!identity) throw new Error("preflight: the content script never attached");
  const probeNow = (args) => sw.evaluate((a) => globalThis.__host.toOffscreen({ kind: "TR01_PROBE", ...a }), args);
  record.preflight = {
    fixturePageServed: served?.status() === 200,
    contentScriptAttested: typeof identity.tabId === "number",
    noGrantYet: (await sw.evaluate(() => globalThis.__host.captureState())).grants.length === 0,
    captureRefusedBeforeGesture: (await sw.evaluate((t) => globalThis.__host.ticketProbe(t), identity.tabId))?.refused === "NO_ACTIVE_TAB_GRANT",
    pageDevicePixelRatio: pageDpr,
  };
  if (!Object.entries(record.preflight).filter(([k]) => k !== "pageDevicePixelRatio").every(([, v]) => v === true)) throw new Error(`preflight failed: ${JSON.stringify(record.preflight)}`);

  // ── the human step ──
  await banner(page, `Click the PratiBimb toolbar button once (device scale ${DPR}).`);
  await page.bringToFront();
  await wait(1_000);
  console.log(`\n>>> AWAITING_GESTURE dpr=${DPR} image=${IMAGE} url=${origin}/mask/`);
  console.log("    In the Chrome for Testing window that just opened, click the PratiBimb toolbar button once.");
  const t0 = Date.now();
  let grant = null;
  while (Date.now() - t0 < WAIT_MS) {
    grant = (await sw.evaluate(() => globalThis.__host.captureState())).grants.find((g) => g.tabId === identity.tabId) ?? null;
    if (grant) break;
    await wait(500);
  }
  if (!grant) throw new Error(`no click arrived within ${WAIT_MS} ms`);
  console.log(">>> GESTURE_RECEIVED");
  record.gesture = { tabId: grant.tabId, observedAt: new Date().toISOString(), waitedMs: Date.now() - t0 };
  /**
   * THE BANNER COMES OFF BEFORE ANY CAPTURE, AND THAT IS PROVEN, NOT ASSERTED.
   *
   * Run 1 of this experiment left its instruction banner on the page while capturing. The banner is
   * ink, so TR-01 detected it: 13 boxes where the frozen fixture yields 11, with exactly two boxes in
   * the banner's band. Capture determinism survived that (the banner was static), but every
   * cross-record comparison was contaminated. So it is removed here, the DOM is checked to hold
   * nothing but the held-out image, and the detector itself is used as the witness — any box in the
   * band the banner occupied would mean it is still painted.
   *
   * Nothing about the product path changes: the banner is the harness's own element on the harness's
   * own fixture page, added and removed through the page, never through the extension.
   */
  const clean = await page.evaluate(async () => {
    document.getElementById("__cd_banner")?.remove();
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const kids = [...document.body.children];
    const img = kids.find((e) => e.tagName === "IMG");
    const r = img?.getBoundingClientRect();
    return {
      bannerRemoved: document.getElementById("__cd_banner") === null,
      bodyHoldsOnlyTheHeldOutImage: kids.length === 1 && kids[0]?.tagName === "IMG",
      bodyChildTags: kids.map((e) => e.tagName),
      imageRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      imageShownOneToOneAtOrigin: !!r && r.x === 0 && r.y === 0 && r.width === 1280 && r.height === 720,
      imageComplete: img instanceof HTMLImageElement && img.complete && img.naturalWidth === 1280 && img.naturalHeight === 720,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  });
  record.pageClean = clean;
  if (!(clean.bannerRemoved && clean.bodyHoldsOnlyTheHeldOutImage && clean.imageShownOneToOneAtOrigin && clean.imageComplete && clean.scrollX === 0 && clean.scrollY === 0)) {
    throw new Error(`the page is not clean before the first capture: ${JSON.stringify(clean)}`);
  }
  console.log(">>> PAGE_CLEAN — the instruction banner is removed, the body holds only the held-out image at 1:1, and nothing will touch the page again.");
  console.log("    Do not click again, and do not move or resize the window.");
  await wait(1_500);

  const probe = async (args) => {
    const r = await probeNow(args);
    if (r?.error) throw new Error(`${args.op}: ${r.error}`);
    return r;
  };
  const onePass = async () => {
    const r = await probe({ op: "pass", tabId: identity.tabId, frameId: identity.frameId, cssWidth, inkRects: [], controlRects: [] });
    return {
      frameSha256: r.rawRgbaSha256 ?? null,
      capture: r.summary.capture,
      route: r.summary.route,
      detectorRan: r.summary.redaction.detector.ran,
      failClosed: r.summary.redaction.failClosed,
      detections: r.summary.redaction.detail?.detections ?? [],
    };
  };

  // ── PHASE A — capture determinism: N fresh streams, one unchanging page ───────────────────────
  console.log(`\n>>> PHASE A — ${N} fresh capture passes of one unchanging page`);
  const captures = [];
  for (let i = 0; i < N; i++) {
    const p = await onePass();
    captures.push({ pass: i + 1, ...p });
    console.log(`    pass ${String(i + 1).padStart(2)}: frame ${p.frameSha256?.slice(0, 16) ?? "null"}  ${p.detections.length} boxes`);
  }
  const digests = captures.map((c) => c.frameSha256);
  const distinct = [...new Set(digests)];
  // Boxes grouped by the frame they came from: within one digest the input is PROVEN identical, so a
  // box difference there is the inference path's and nothing else's.
  const byDigest = distinct.map((d) => {
    const g = captures.filter((c) => c.frameSha256 === d);
    return {
      frameSha256: d,
      passes: g.map((c) => c.pass),
      count: g.length,
      detectionCount: g[0].detections.length,
      boxesIdenticalWithinThisFrame: g.every((c) => isDeepStrictEqual(c.detections, g[0].detections)),
      detections: g[0].detections,
    };
  });
  record.phaseA = {
    measures: "capture determinism: does an unchanging page yield a bit-identical frame on every fresh stream?",
    passes: captures.map(({ pass, frameSha256, capture, route, detectorRan, failClosed, detections }) => ({
      pass,
      frameSha256,
      captureWidth: capture.w,
      captureHeight: capture.h,
      captureBytes: capture.bytes,
      captureFormat: capture.format,
      captureDpr: capture.dpr,
      scaleToCss: capture.scaleToCss,
      route,
      detectorRan,
      failClosed,
      detectionCount: detections.length,
      // COMPLETE boxes and scores, every pass: which pixels produced which output is the whole question.
      detections,
    })),
    digests,
    distinctDigestCount: distinct.length,
    captureIsBitStable: distinct.length === 1,
    captureVariationRate: { differingPasses: N - (byDigest.sort((a, b) => b.count - a.count)[0]?.count ?? 0), ofPasses: N },
    groupedByFrame: byDigest,
    boxesIdenticalWhereverTheFrameWas: byDigest.every((g) => g.boxesIdenticalWithinThisFrame),
    allBoxesIdenticalAcrossEveryPass: captures.every((c) => isDeepStrictEqual(c.detections, captures[0].detections)),
    captureDims: [...new Set(captures.map((c) => `${c.capture.w}x${c.capture.h}`))],
    scaleToCssObserved: [...new Set(captures.map((c) => c.capture.scaleToCss))],
    routesObserved: [...new Set(captures.map((c) => c.route))],
  };

  // ── PHASE B — inference determinism on ONE retained REAL captured frame ───────────────────────
  console.log(`\n>>> PHASE B — retaining one real captured frame, then ${N} detector runs over those exact bytes`);
  await probe({ op: "retain-raw", name: "live" });
  const retainedPass = await onePass();
  if (retainedPass.frameSha256 === null) throw new Error("the retaining pass planned no mask, so no raw frame was retained");
  // The retained buffer's own digest, taken in the realm: "the retained frame is the captured frame"
  // is then measured, not assumed. A mismatch is a stop condition, not something to work around.
  const retainedSha = await probe({ op: "frame-sha", name: "live" });
  if (retainedSha.sha256 !== retainedPass.frameSha256) {
    throw new Error(`the retained buffer is NOT the captured frame: retained ${retainedSha.sha256} vs captured ${retainedPass.frameSha256}`);
  }
  if (retainedSha.bytes !== retainedPass.capture.bytes || retainedSha.width !== retainedPass.capture.w || retainedSha.height !== retainedPass.capture.h) {
    throw new Error(`the retained buffer's shape differs from the capture: ${JSON.stringify(retainedSha)} vs ${JSON.stringify(retainedPass.capture)}`);
  }
  console.log(`    retained frame verified: ${retainedSha.sha256.slice(0, 16)} (${retainedSha.width}x${retainedSha.height}, ${retainedSha.bytes} B) == the captured frame`);
  await probe({ op: "create" });
  const preparedB = await probe({ op: "prepare" });
  if (!preparedB.ready) throw new Error(`prepare failed: ${JSON.stringify(preparedB.status?.lastInit)}`);
  const liveRuns = [];
  for (let i = 0; i < N; i++) {
    const r = await probe({ op: "detect", name: "live" });
    liveRuns.push(r.outcome);
    console.log(`    detect ${String(i + 1).padStart(2)}: ok=${r.outcome?.ok} ${r.outcome?.detections?.length ?? "-"} boxes`);
  }
  record.phaseB = {
    measures: "inference determinism on a genuinely fixed input — the EXACT RGBA a real stream capture produced",
    retainedFrameSha256: retainedPass.frameSha256,
    retainedFrameCapture: retainedPass.capture,
    retainedBufferDigestedInRealm: { sha256: retainedSha.sha256, width: retainedSha.width, height: retainedSha.height, bytes: retainedSha.bytes },
    retainedBufferIsTheCapturedFrame: retainedSha.sha256 === retainedPass.frameSha256,
    frameAlsoSeenInPhaseA: digests.includes(retainedPass.frameSha256),
    inferences: liveRuns.length,
    everyOutcomeOk: liveRuns.every((o) => o?.ok === true),
    detectionsPerRun: liveRuns.map((o) => o?.detections?.length ?? null),
    // Timings are expected to vary and are excluded; the gate quantity is the boxes.
    allDetectionsByteIdentical: liveRuns.every((o) => isDeepStrictEqual(o?.detections, liveRuns[0]?.detections)),
    distinctDetectionSets: [...new Set(liveRuns.map((o) => JSON.stringify(o?.detections)))].length,
    satisfiesPreRegisteredFiveInferences: liveRuns.length >= 5,
    runs: liveRuns.map((o, i) => ({ inference: i + 1, ok: o?.ok ?? null, runId: o?.runId ?? null, code: o?.code ?? null, detectionCount: o?.detections?.length ?? null, detections: o?.detections ?? null })),
  };

  // ── PHASE C — the same, on the FROZEN FIXTURE: criterion 6's "same fixture", literally ────────
  console.log(`\n>>> PHASE C — ${N} detector runs over the frozen ${IMAGE}.png fixture`);
  const img = decodePng(readFileSync(PNG));
  await probe({ op: "frame", name: "fixture", frame: { width: img.width, height: img.height, rgbaB64: Buffer.from(img.rgba.buffer, img.rgba.byteOffset, img.rgba.byteLength).toString("base64") } });
  const fixtureRuns = [];
  for (let i = 0; i < N; i++) {
    const r = await probe({ op: "detect", name: "fixture" });
    fixtureRuns.push(r.outcome);
    console.log(`    detect ${String(i + 1).padStart(2)}: ok=${r.outcome?.ok} ${r.outcome?.detections?.length ?? "-"} boxes`);
  }
  record.phaseC = {
    measures: "inference determinism on the frozen held-out PNG — criterion 6's 'two consecutive runs on the same fixture', literally; a cross-check on Phase B, not a substitute",
    note: "the PNG is read in Node, which is the established pattern in run-tr01-worker.mjs; no STREAM frame crosses the boundary, so serviceWorkerSawNoPixels is untouched",
    inferences: fixtureRuns.length,
    everyOutcomeOk: fixtureRuns.every((o) => o?.ok === true),
    detectionsPerRun: fixtureRuns.map((o) => o?.detections?.length ?? null),
    allDetectionsByteIdentical: fixtureRuns.every((o) => isDeepStrictEqual(o?.detections, fixtureRuns[0]?.detections)),
    distinctDetectionSets: [...new Set(fixtureRuns.map((o) => JSON.stringify(o?.detections)))].length,
    runs: fixtureRuns.map((o, i) => ({ inference: i + 1, ok: o?.ok ?? null, runId: o?.runId ?? null, code: o?.code ?? null, detectionCount: o?.detections?.length ?? null, detections: o?.detections ?? null })),
    /**
     * A LIVE-vs-FIXTURE COMPARISON IS RECORDED, AND IT IS NOT A G-3 VERDICT. G-3 asks whether the
     * product path's decoded RGBA equals the PNG screenshot path's. This compares the DETECTOR'S
     * OUTPUT on each, on one image at one device scale, which is weaker: equal outputs would not prove
     * equal pixels, and unequal outputs do not locate the difference. It is reported as measurement.
     */
    liveVsFixture: {
      sameDetectionCount: (liveRuns[0]?.detections?.length ?? -1) === (fixtureRuns[0]?.detections?.length ?? -2),
      detectionsByteIdentical: isDeepStrictEqual(fixtureRuns[0]?.detections, liveRuns[0]?.detections),
      note: "MEASURED, not a G-3 verdict: this compares detector output on one image at one device scale, not the two pixel sources. G-3 remains open.",
    },
  };
  await probe({ op: "dispose" });
} catch (e) {
  record.failure = `${e.name}: ${String(e.message).slice(0, 600)}`;
  console.log(`\n>>> FAILED: ${record.failure}`);
} finally {
  if (context) await context.close();
  await new Promise((ok) => server.close(ok));
  console.log("restoring the PRODUCT build…");
  build({});
}

record.findings = record.failure
  ? null
  : {
      captureDeterminism: record.phaseA.captureIsBitStable ? "BIT-STABLE over this run" : `NOT BIT-STABLE: ${record.phaseA.distinctDigestCount} distinct frames in ${N} passes`,
      inferenceDeterminismOnRetainedRealFrame: record.phaseB.allDetectionsByteIdentical ? `BYTE-IDENTICAL over ${record.phaseB.inferences} inferences` : "NOT byte-identical",
      inferenceDeterminismOnFrozenFixture: record.phaseC.allDetectionsByteIdentical ? `BYTE-IDENTICAL over ${record.phaseC.inferences} inferences` : "NOT byte-identical",
      // Run 1's contamination put exactly two boxes in y 595..645. Zero there is the detector's own
      // witness that the banner was not painted into any frame measured here.
      bannerContaminationGone: record.phaseA.passes.every((p) => p.detections.every((b) => !(b.y >= 595 && b.y <= 645))),
    };
record.notAClaim = [
  "one image, one device scale, one window, one operator, one run. A bit-stable capture here does not prove the capture is bit-stable in general, and a non-zero variation rate here is this run's rate, not a population rate.",
  "the earlier G4 failures (W1 DPR 1.25/H4 and 1.5/H3; W2 run 1 DPR 1.0/H1) were recorded without frame digests, so nothing measured here can be applied to them as FACT.",
];
record.recordedAt = new Date().toISOString();
record.provenance = { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, browserBinary: executablePath, headless: false };
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`\n${record.failure ? "FAILED" : "DONE"}  ${JSON.stringify(record.findings)}`);
console.log(`written: ${TARGET}`);
if (record.failure) process.exit(1);
