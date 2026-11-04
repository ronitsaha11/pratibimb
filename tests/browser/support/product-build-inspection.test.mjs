/**
 * The build inspection, against a synthetic build directory. The model names are DIRECTORIES here, so any
 * attempt to read one would throw: a pass is also proof that this inspection opens no model file.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectProductBuild } from "./product-build-inspection.mjs";

const EXPECTED = { ortFiles: ["ort.all.min.js", "ort-wasm-simd-threaded.jsep.wasm"], tr01File: "tr01-ppocrv4-mobile-det.onnx" };

describe("the tool's own command line", () => {
  const tool = readFileSync(new URL("../extension/inspect-product-build.mjs", import.meta.url), "utf8");

  it("cannot build, cannot start a browser and opens no file of its own", () => {
    expect(tool).not.toMatch(/npm run build|playwright|chromium|wxt|readFileSync|createHash/);
    // The only commands it runs are git's, to say which commit is checked out.
    expect(tool.match(/execSync\(/g)).toHaveLength(1);
    expect(tool).toContain('git("rev-parse HEAD")');
  });
});
const POLICY = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' http://127.0.0.1:8995/v1/chat/completions; style-src 'sha256-ZYRp1TbYj9bPuYCw1S2y0R5L4r911NcNjTciEbHTsAo='; object-src 'none'; base-uri 'none'; form-action 'none'";

let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function syntheticBuild({ manifest = {}, models = ["tr01-ppocrv4-mobile-det.onnx"], offscreen = 'const k="PERCEIVE_ONCE",s="STREAM_CONSUME",r="UI_HEAD_NOT_IN_PRODUCT_BUILD",t="t1-ui-head.onnx";', background = "const h={perceiveOnce(){},consumeProbe(){},mintStreamId(){}};chrome.tabCapture.getMediaStreamId;", sidepanel = 'const c="Click the toolbar button";' } = {}) {
  dir = mkdtempSync(join(tmpdir(), "m238-build-"));
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "content-scripts"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"],
      host_permissions: ["http://127.0.0.1/*"],
      action: { default_title: "PratiBimb: perceive this tab" },
      content_security_policy: { extension_pages: POLICY },
      content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content-scripts/content.js"] }],
      ...manifest,
    })
  );
  writeFileSync(join(dir, "background.js"), background);
  writeFileSync(join(dir, "chunks", "offscreen-abc.js"), offscreen);
  writeFileSync(join(dir, "chunks", "sidepanel-abc.js"), sidepanel);
  writeFileSync(join(dir, "content-scripts", "content.js"), 'chrome.runtime.sendMessage({kind:"HELLO"});');
  writeFileSync(join(dir, "ort.all.min.js"), "");
  // Directories, deliberately. Reading one throws EISDIR.
  mkdirSync(join(dir, "ort-wasm-simd-threaded.jsep.wasm"));
  for (const model of models) mkdirSync(join(dir, model));
  return dir;
}

describe("inspectProductBuild", () => {
  it("passes a product build, and reports what ships without opening a model", () => {
    const report = inspectProductBuild(syntheticBuild(), EXPECTED);
    expect(report.problems).toEqual([]);
    expect(report.manifest.permissions).toContain("tabCapture");
    expect(report.manifest.connectSrc).toBe("'self' http://127.0.0.1:8995/v1/chat/completions");
    expect(report.files).toContain("tr01-ppocrv4-mobile-det.onnx");
  });

  it("states the diagnostic hooks as facts, not as problems: they are the owner's decision", () => {
    const { problems, bundle } = inspectProductBuild(syntheticBuild(), EXPECTED);
    expect(problems).toEqual([]);
    expect(bundle).toMatchObject({
      offscreenHandlesPerceiveOnce: true,
      offscreenHandlesStreamConsume: true,
      workerControlPlaneHasPerceiveOnce: true,
      workerControlPlaneHasConsumeProbe: true,
      contentScriptNamesEitherHook: false,
      sidePanelNamesEitherHook: false,
      sidePanelStillAsksForTheToolbarGesture: true,
    });
  });

  it("fails a build that packages T1", () => {
    const report = inspectProductBuild(syntheticBuild({ models: ["tr01-ppocrv4-mobile-det.onnx", "t1-ui-head.onnx"] }), EXPECTED);
    expect(report.problems).toEqual(["T1_PACKAGED"]);
  });

  it("fails a build with the evidence manifest: the wider connect-src, or <all_urls>", () => {
    const evidenceCsp = inspectProductBuild(syntheticBuild({ manifest: { content_security_policy: { extension_pages: POLICY.replace("/v1/chat/completions", "") } } }), EXPECTED);
    expect(evidenceCsp.problems).toEqual(["CSP_DIRECTIVE:connect-src"]);
    rmSync(dir, { recursive: true, force: true });
    const allUrls = inspectProductBuild(syntheticBuild({ manifest: { host_permissions: ["http://127.0.0.1/*", "<all_urls>"] } }), EXPECTED);
    expect(allUrls.problems).toEqual(["HOST_PERMISSIONS_CHANGED"]);
  });

  it("fails a bundle with the worker-frame route, or an unsubstituted flag", () => {
    const worker = inspectProductBuild(syntheticBuild({ background: "chrome.tabs.captureVisibleTab();" }), EXPECTED);
    expect(worker.problems).toEqual(["WORKER_FRAME_ROUTE_IN_BUNDLE"]);
    rmSync(dir, { recursive: true, force: true });
    const flag = inspectProductBuild(syntheticBuild({ offscreen: "if(__EVIDENCE_BUILD__){}" }), EXPECTED);
    expect(flag.problems).toEqual(["EVIDENCE_FLAG_NOT_SUBSTITUTED"]);
  });
});
