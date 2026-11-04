/**
 * M23.8 — WHAT A BUILT PRODUCT EXTENSION CONTAINS, WITHOUT OPENING A MODEL AND WITHOUT BUILDING ONE.
 *
 * Reads a `.output/chrome-mv3` directory that already exists: the manifest, the file names and the text of
 * its JavaScript. It never opens anything else, so no `.onnx` or `.wasm` is read or hashed. A test proves
 * that by making those names directories, which any attempt to read would throw on.
 *
 * It reports two different things and keeps them apart:
 *   - `problems`: differences from the product boundary (ADR-0013, OD-P, OD-R). Empty is the only pass.
 *   - `bundle`: facts about what ships, including the diagnostic hooks OD-S is about. Those are not
 *     problems today; they are what the owner is being asked to decide about.
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

  const problems = [...productManifestProblems(manifest), ...productPackageProblems(rootFiles, expected)];
  if (includes(offscreen, "__EVIDENCE_BUILD__")) problems.push("EVIDENCE_FLAG_NOT_SUBSTITUTED");
  if (includes(background, "captureVisibleTab")) problems.push("WORKER_FRAME_ROUTE_IN_BUNDLE");
  if (includes(offscreen, "TR01_DETECT_PROBE") || includes(offscreen, '"TR01_PROBE"')) problems.push("TR01_PROBE_IN_BUNDLE");

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
