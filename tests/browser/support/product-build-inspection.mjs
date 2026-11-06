/**
 * M23.8 — WHAT A BUILT PRODUCT EXTENSION CONTAINS, WITHOUT OPENING A MODEL AND WITHOUT BUILDING ONE.
 *
 * Reads a `.output/chrome-mv3` directory that already exists: the manifest, the file names and the text of
 * its JavaScript. It never opens anything else, so no `.onnx` or `.wasm` is read or hashed. A test proves
 * that by making those names directories, which any attempt to read would throw on.
 *
 * It reports two different things and keeps them apart:
 *   - `problems`: differences from the product boundary (ADR-0013, OD-P, OD-R, OD-S). Empty is the only pass.
 *   - `bundle`: facts about what ships, which are nobody's verdict.
 *
 * M23.9 (OD-S, Option B): the diagnostic hooks were facts here while the owner decided about them. The owner
 * has, so any of them in a product bundle is now a problem.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { productManifestProblems, productPackageProblems } from "./csp-product-phase.mjs";

const TEXT_EXTENSIONS = new Set([".js", ".html"]);

/**
 * What a product package must carry, by name. Plain strings, because a browser-free tool cannot import the
 * TypeScript pins; `apps/extension/test/buildSeparation.test.ts` fails if these drift from them.
 */
export const EXPECTED_PRODUCT_FILES = Object.freeze({
  ortFiles: Object.freeze(["ort.all.min.js", "ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"]),
  tr01File: "tr01-ppocrv4-mobile-det.onnx",
});

/**
 * Names that exist only in an evidence build since M23.9. A product bundle naming one of these has kept a
 * hook, a driver, the capture ticket, or the realm's capture call, which only those reached.
 */
export const DIAGNOSTIC_HOOK_MARKERS = Object.freeze([
  "PERCEIVE_ONCE",
  "STREAM_CONSUME",
  "perceiveOnce",
  "consumeProbe",
  "mintStreamId",
  "ticketProbe",
  "CAPTURE_FRAME",
  "CAPTURE_TICKET",
  "chromeMediaSourceId",
  "grabFrame",
]);

/**
 * M23.12 (OD-T): the owner's wording. Plain strings, because a browser-free tool cannot import TypeScript;
 * `apps/extension/test/buildSeparation.test.ts` fails if these drift from `host-lib/product-copy.ts`.
 */
export const APPROVED_UI_COPY = Object.freeze({
  toolbarTitle: "PratiBimb — Page Assistant",
  sidePanelDescription: "PratiBimb uses page structure to identify elements and assist with browser tasks.",
  privacyExplanation: "Normal tasks do not capture browser screenshots or send page images to the reasoning model.",
});

/** Wording a normal product must not carry: it describes a capture a product task does not make. `captureStatus`: M23.14 (OD-X). */
export const STALE_UI_WORDING = Object.freeze(["perceive this tab", "look at this tab", "capture this page", "see this tab", "No frame taken", "Click the toolbar button", "captureStatus", "NO_GRANT"]);

const walk = (root, relative = "", out = []) => {
  for (const name of readdirSync(join(root, relative)).sort()) {
    const path = relative === "" ? name : `${relative}/${name}`;
    // A directory named like a model is reported by name and not entered: nothing under it is read.
    if (statSync(join(root, path)).isDirectory() && !extname(name)) walk(root, path, out);
    else out.push(path);
  }
  return out;
};

const includes = (text, needle) => text.includes(needle);

export function inspectProductBuild(directory, expected) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  const files = walk(directory);
  const rootFiles = files.filter((f) => !f.includes("/"));
  const textOf = (predicate) =>
    files
      .filter((f) => TEXT_EXTENSIONS.has(extname(f)) && predicate(f))
      .map((f) => readFileSync(join(directory, f), "utf8"))
      .join("\n");
  const background = textOf((f) => f === "background.js");
  const offscreen = textOf((f) => f.startsWith("chunks/offscreen-"));
  const content = textOf((f) => f.startsWith("content-scripts/"));
  const sidepanel = textOf((f) => f.startsWith("chunks/sidepanel-") || f === "sidepanel.html");
  // All the extension's own text. ORT's bundle is the runtime's and is not ours to name things in.
  const everything = textOf((f) => !(expected.ortFiles ?? []).includes(f));

  const problems = [...productManifestProblems(manifest), ...productPackageProblems(rootFiles, expected)];
  if (includes(offscreen, "__EVIDENCE_BUILD__")) problems.push("EVIDENCE_FLAG_NOT_SUBSTITUTED");
  if (includes(background, "captureVisibleTab")) problems.push("WORKER_FRAME_ROUTE_IN_BUNDLE");
  if (includes(offscreen, "TR01_DETECT_PROBE") || includes(offscreen, '"TR01_PROBE"')) problems.push("TR01_PROBE_IN_BUNDLE");
  for (const marker of DIAGNOSTIC_HOOK_MARKERS) {
    if (includes(everything, marker)) problems.push(`DIAGNOSTIC_HOOK_IN_BUNDLE:${marker}`);
  }
  if (/\.getUserMedia\s*\(/.test(everything)) problems.push("CAPTURE_CALL_IN_BUNDLE");
  // M23.13 (OD-W): the toolbar opens the side panel and asks the capture authority for nothing.
  const onClickedAt = background.indexOf("onClicked.addListener(");
  const toolbarRoute = onClickedAt === -1 ? "" : background.slice(onClickedAt, onClickedAt + 300);
  if (!includes(toolbarRoute, "sidePanel.open")) problems.push("TOOLBAR_DOES_NOT_OPEN_THE_SIDE_PANEL");
  if (/\.grant\(/.test(toolbarRoute)) problems.push("TOOLBAR_ISSUES_A_CAPTURE_GRANT");
  if (manifest.action?.default_popup !== undefined) problems.push("TOOLBAR_HAS_A_POPUP");
  if (manifest.action?.default_title !== APPROVED_UI_COPY.toolbarTitle) problems.push("TOOLBAR_TITLE_NOT_THE_APPROVED_WORDING");
  if (!includes(sidepanel, APPROVED_UI_COPY.sidePanelDescription)) problems.push("SIDE_PANEL_DESCRIPTION_NOT_THE_APPROVED_WORDING");
  if (!includes(sidepanel, APPROVED_UI_COPY.privacyExplanation)) problems.push("PRIVACY_EXPLANATION_NOT_THE_APPROVED_WORDING");
  const productUi = `${JSON.stringify(manifest)}\n${sidepanel}`.toLowerCase();
  for (const phrase of STALE_UI_WORDING) if (productUi.includes(phrase.toLowerCase())) problems.push(`STALE_UI_WORDING:${phrase}`);

  return {
    problems,
    files: files.filter((f) => !f.startsWith("chunks/")),
    manifest: {
      permissions: manifest.permissions ?? null,
      host_permissions: manifest.host_permissions ?? null,
      connectSrc: /connect-src ([^;]*)/.exec(manifest.content_security_policy?.extension_pages ?? "")?.[1] ?? null,
      actionTitle: manifest.action?.default_title ?? null,
    },
    bundle: {
      namesEachHookMarker: Object.fromEntries(DIAGNOSTIC_HOOK_MARKERS.map((marker) => [marker, includes(everything, marker)])),
      callsGetUserMedia: /\.getUserMedia\s*\(/.test(everything),
      toolbarOpensTheSidePanel: includes(toolbarRoute, "sidePanel.open"),
      toolbarIssuesACaptureGrant: /\.grant\(/.test(toolbarRoute),
      offscreenCanStartTr01: includes(offscreen, "tr01-worker"),
      offscreenHandlesPerceiveOnce: includes(offscreen, "PERCEIVE_ONCE"),
      offscreenHandlesStreamConsume: includes(offscreen, "STREAM_CONSUME"),
      offscreenHasTheProductRefusal: includes(offscreen, "UI_HEAD_NOT_IN_PRODUCT_BUILD"),
      offscreenStillNamesT1: includes(offscreen, "t1-ui-head.onnx"),
      workerControlPlaneHasPerceiveOnce: includes(background, "perceiveOnce"),
      workerControlPlaneHasConsumeProbe: includes(background, "consumeProbe"),
      workerControlPlaneHasMintStreamId: includes(background, "mintStreamId"),
      workerMintsCaptureHandles: includes(background, "getMediaStreamId"),
      contentScriptNamesEitherHook: includes(content, "PERCEIVE_ONCE") || includes(content, "STREAM_CONSUME"),
      sidePanelNamesEitherHook: includes(sidepanel, "PERCEIVE_ONCE") || includes(sidepanel, "STREAM_CONSUME"),
      sidePanelStillAsksForTheToolbarGesture: includes(sidepanel, "Click the toolbar button"),
    },
  };
}
