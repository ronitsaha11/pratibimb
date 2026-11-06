/**
 * The build inspection, against a synthetic build directory. The model names are DIRECTORIES here, so any
 * attempt to read one would throw: a pass is also proof that this inspection opens no model file.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { APPROVED_UI_COPY, DIAGNOSTIC_HOOK_MARKERS, inspectProductBuild, STALE_UI_WORDING } from "./product-build-inspection.mjs";

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

function syntheticBuild({ manifest = {}, models = ["tr01-ppocrv4-mobile-det.onnx"], offscreen = 'const r="UI_HEAD_NOT_IN_PRODUCT_BUILD",t="t1-ui-head.onnx",p=typeof navigator.mediaDevices?.getUserMedia;', background = "const h={toOffscreen(){},captureState(){}};chrome.tabCapture.getMediaStreamId;chrome.action?.onClicked.addListener(t=>{o(t,e=>chrome.sidePanel.open(e))});", sidepanel = 'const a="PratiBimb uses page structure to identify elements and assist with browser tasks.",p="Normal tasks do not capture browser screenshots or send page images to the reasoning model.";' } = {}) {
  dir = mkdtempSync(join(tmpdir(), "m238-build-"));
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "content-scripts"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"],
      host_permissions: ["http://127.0.0.1/*"],
      name: "PratiBimb — Page Assistant (Development build)",
      action: { default_title: "PratiBimb — Page Assistant" },
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

  it("reports what ships as facts: no hook, a panel that no longer asks for the toolbar (OD-T), an authority that can still mint", () => {
    const { problems, bundle } = inspectProductBuild(syntheticBuild(), EXPECTED);
    expect(problems).toEqual([]);
    expect(bundle).toMatchObject({
      offscreenHandlesPerceiveOnce: false,
      offscreenHandlesStreamConsume: false,
      workerControlPlaneHasPerceiveOnce: false,
      workerControlPlaneHasConsumeProbe: false,
      workerControlPlaneHasMintStreamId: false,
      callsGetUserMedia: false,
      contentScriptNamesEitherHook: false,
      sidePanelNamesEitherHook: false,
      sidePanelStillAsksForTheToolbarGesture: false,
      workerMintsCaptureHandles: true,
    });
    expect(Object.values(bundle.namesEachHookMarker).every((named) => named === false)).toBe(true);
  });

  it("M23.9 (OD-S): fails a product bundle naming any hook, driver or capture ticket, wherever it is", () => {
    expect(DIAGNOSTIC_HOOK_MARKERS).toEqual(expect.arrayContaining(["PERCEIVE_ONCE", "STREAM_CONSUME", "perceiveOnce", "consumeProbe", "CAPTURE_FRAME"]));
    for (const marker of DIAGNOSTIC_HOOK_MARKERS) {
      for (const where of ["offscreen", "background", "sidepanel"]) {
        const report = inspectProductBuild(syntheticBuild({ [where]: `const k="${marker}";` }), EXPECTED);
        expect(report.problems, `${marker} in ${where}`).toContain(`DIAGNOSTIC_HOOK_IN_BUNDLE:${marker}`);
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("M23.9 (OD-S): fails a bundle that calls getUserMedia, and not one that only asks whether it exists", () => {
    const calling = inspectProductBuild(syntheticBuild({ offscreen: "await navigator.mediaDevices.getUserMedia({});" }), EXPECTED);
    expect(calling.problems).toEqual(["CAPTURE_CALL_IN_BUNDLE"]);
    expect(calling.bundle.callsGetUserMedia).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    expect(inspectProductBuild(syntheticBuild(), EXPECTED).bundle.callsGetUserMedia).toBe(false);
  });

  it("M23.12 (OD-T): fails a product build without the approved toolbar title", () => {
    const report = inspectProductBuild(syntheticBuild({ manifest: { action: { default_title: "Something else" } } }), EXPECTED);
    expect(report.problems).toEqual(["TOOLBAR_TITLE_NOT_THE_APPROVED_WORDING"]);
  });

  it("M23.12 (OD-T): fails a product panel missing either approved sentence", () => {
    const noPrivacy = inspectProductBuild(syntheticBuild({ sidepanel: `const a="${APPROVED_UI_COPY.sidePanelDescription}";` }), EXPECTED);
    expect(noPrivacy.problems).toEqual(["PRIVACY_EXPLANATION_NOT_THE_APPROVED_WORDING"]);
    rmSync(dir, { recursive: true, force: true });
    const noDescription = inspectProductBuild(syntheticBuild({ sidepanel: `const p="${APPROVED_UI_COPY.privacyExplanation}";` }), EXPECTED);
    expect(noDescription.problems).toEqual(["SIDE_PANEL_DESCRIPTION_NOT_THE_APPROVED_WORDING"]);
  });

  it("M23.12 (OD-T): fails stale capture wording in the panel or the manifest, in any case", () => {
    const approved = `const a="${APPROVED_UI_COPY.sidePanelDescription}",p="${APPROVED_UI_COPY.privacyExplanation}";`;
    for (const phrase of STALE_UI_WORDING) {
      const inPanel = inspectProductBuild(syntheticBuild({ sidepanel: `${approved}const s="${phrase.toUpperCase()}";` }), EXPECTED);
      expect(inPanel.problems, phrase).toEqual([`STALE_UI_WORDING:${phrase}`]);
      rmSync(dir, { recursive: true, force: true });
      const inManifest = inspectProductBuild(syntheticBuild({ manifest: { commands: { _execute_action: { description: phrase } } } }), EXPECTED);
      expect(inManifest.problems, phrase).toEqual([`STALE_UI_WORDING:${phrase}`]);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("M23.13 (OD-W): fails a toolbar that does not open the side panel, or that issues a grant, or has a popup", () => {
    const none = inspectProductBuild(syntheticBuild({ background: "const h={};" }), EXPECTED);
    expect(none.problems).toEqual(["TOOLBAR_DOES_NOT_OPEN_THE_SIDE_PANEL"]);
    expect(none.bundle.toolbarOpensTheSidePanel).toBe(false);
    rmSync(dir, { recursive: true, force: true });
    const old = inspectProductBuild(syntheticBuild({ background: "chrome.action?.onClicked.addListener(t=>{typeof t.id==\"number\"&&a.grant(t.id)});" }), EXPECTED);
    expect(old.problems).toEqual(["TOOLBAR_DOES_NOT_OPEN_THE_SIDE_PANEL", "TOOLBAR_ISSUES_A_CAPTURE_GRANT"]);
    rmSync(dir, { recursive: true, force: true });
    const both = inspectProductBuild(syntheticBuild({ background: "chrome.action?.onClicked.addListener(t=>{a.grant(t.id);chrome.sidePanel.open(t)});" }), EXPECTED);
    expect(both.problems).toEqual(["TOOLBAR_ISSUES_A_CAPTURE_GRANT"]);
    expect(both.bundle.toolbarIssuesACaptureGrant).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    const popup = inspectProductBuild(syntheticBuild({ manifest: { action: { default_title: "PratiBimb — Page Assistant", default_popup: "p.html" } } }), EXPECTED);
    expect(popup.problems).toEqual(["TOOLBAR_HAS_A_POPUP"]);
  });

  it("M23.15 (OD-Y): fails a product build with another name, or with no development qualifier", () => {
    for (const name of ["PratiBimb minimal MV3 host (experiment — not the product)", "PratiBimb — Page Assistant", "PratiBimb"]) {
      const report = inspectProductBuild(syntheticBuild({ manifest: { name } }), EXPECTED);
      expect(report.problems, name).toContain("EXTENSION_NAME_NOT_THE_APPROVED_FORM");
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not hold ORT's own bundle to names it never chose", () => {
    const build = syntheticBuild();
    writeFileSync(join(build, "ort.all.min.js"), 'const unrelated="grabFrame";');
    expect(inspectProductBuild(build, EXPECTED).problems).toEqual([]);
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
    const worker = inspectProductBuild(syntheticBuild({ background: "chrome.action?.onClicked.addListener(t=>{o(t,e=>chrome.sidePanel.open(e))});chrome.tabs.captureVisibleTab();" }), EXPECTED);
    expect(worker.problems).toEqual(["WORKER_FRAME_ROUTE_IN_BUNDLE"]);
    rmSync(dir, { recursive: true, force: true });
    const flag = inspectProductBuild(syntheticBuild({ offscreen: "if(__EVIDENCE_BUILD__){}" }), EXPECTED);
    expect(flag.problems).toEqual(["EVIDENCE_FLAG_NOT_SUBSTITUTED"]);
  });
});
