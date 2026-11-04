/**
 * The M13 harness's product-phase expectation, tested on its own. See `csp-product-phase.mjs` for what
 * this does and does not stand in for. Synthetic manifests and replies only: no browser, no build and
 * no model file.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ortSmokeCheck, parseCsp, productManifestProblems, productPackageProblems } from "./csp-product-phase.mjs";

const PRODUCT_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' http://127.0.0.1:8995/v1/chat/completions; style-src 'sha256-ZYRp1TbYj9bPuYCw1S2y0R5L4r911NcNjTciEbHTsAo='; object-src 'none'; base-uri 'none'; form-action 'none'";
const manifest = (over = {}) => ({
  permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"],
  host_permissions: ["http://127.0.0.1/*"],
  content_security_policy: { extension_pages: PRODUCT_POLICY },
  content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content-scripts/content.js"] }],
  ...over,
});
const withPolicy = (replace, by) => manifest({ content_security_policy: { extension_pages: PRODUCT_POLICY.replace(replace, by) } });

describe("ortSmokeCheck", () => {
  const productReply = { ok: false, stage: "UI_HEAD_NOT_IN_PRODUCT_BUILD", ortBootstrapped: true, pinnedArtifact: {}, wasmCompilationAllowed: {}, ms: { bootstrap: 1 } };

  it("product phase: the runtime came up and the UI head is reported absent", () => {
    expect(ortSmokeCheck("product", productReply)).toEqual({ ortRuntimeWithoutUiHead: true });
  });

  it("product phase: fails if the runtime did not come up, whatever the stage says", () => {
    expect(ortSmokeCheck("product", { ...productReply, ortBootstrapped: false }).ortRuntimeWithoutUiHead).toBe(false);
    expect(ortSmokeCheck("product", { ok: false, stage: "BUNDLE", error: "ort global missing" }).ortRuntimeWithoutUiHead).toBe(false);
    expect(ortSmokeCheck("product", { ok: false, stage: "BOOTSTRAP_OR_RUN", error: "x" }).ortRuntimeWithoutUiHead).toBe(false);
    expect(ortSmokeCheck("product", undefined).ortRuntimeWithoutUiHead).toBe(false);
  });

  it("product phase: fails if a model loaded, which is M23.7's boundary crossed", () => {
    const loaded = { ok: true, pinnedArtifact: {}, wasmCompilationAllowed: {}, modelBytes: 3, outputDims: [1, 12, 10], ms: {} };
    expect(ortSmokeCheck("product", loaded).ortRuntimeWithoutUiHead).toBe(false);
    expect(ortSmokeCheck("product", { ...productReply, modelBytes: 3 }).ortRuntimeWithoutUiHead).toBe(false);
    expect(ortSmokeCheck("product", { ...productReply, outputDims: [1] }).ortRuntimeWithoutUiHead).toBe(false);
  });

  it("evidence phase: M13's original condition, unchanged", () => {
    expect(ortSmokeCheck("evidence", { ok: true })).toEqual({ ortAndModelLoad: true });
    expect(ortSmokeCheck("evidence", { status: "OK" })).toEqual({ ortAndModelLoad: true });
    expect(ortSmokeCheck("evidence", { sessionCreated: true })).toEqual({ ortAndModelLoad: true });
    expect(ortSmokeCheck("evidence", productReply)).toEqual({ ortAndModelLoad: false });
    expect(ortSmokeCheck("evidence", undefined)).toEqual({ ortAndModelLoad: false });
  });
});

describe("productManifestProblems", () => {
  it("passes the product manifest", () => {
    expect(productManifestProblems(manifest())).toEqual([]);
  });

  it("refuses no manifest", () => {
    expect(productManifestProblems(undefined)).toEqual(["NO_MANIFEST"]);
  });

  it("refuses a widened or a narrowed permission set: tabCapture stays, and nothing is added", () => {
    expect(productManifestProblems(manifest({ permissions: ["offscreen", "sidePanel", "activeTab"] }))).toEqual(["PERMISSIONS_CHANGED"]);
    expect(productManifestProblems(manifest({ permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture", "tabs"] }))).toEqual(["PERMISSIONS_CHANGED"]);
  });

  it("refuses any host beyond loopback", () => {
    expect(productManifestProblems(manifest({ host_permissions: ["http://127.0.0.1/*", "<all_urls>"] }))).toEqual(["HOST_PERMISSIONS_CHANGED"]);
    expect(productManifestProblems(manifest({ content_scripts: [{ matches: ["https://*/*"] }] }))).toEqual(["CONTENT_SCRIPT_MATCHES_CHANGED"]);
  });

  it("refuses a page-facing surface", () => {
    expect(productManifestProblems(manifest({ externally_connectable: { matches: ["http://127.0.0.1/*"] } }))).toEqual(["EXTERNALLY_CONNECTABLE_PRESENT"]);
    expect(productManifestProblems(manifest({ web_accessible_resources: [] }))).toEqual(["WEB_ACCESSIBLE_RESOURCES_PRESENT"]);
  });

  it("refuses a new endpoint, an evidence-build origin, and a prefix of the reasoner's path", () => {
    const second = withPolicy("/v1/chat/completions;", "/v1/chat/completions https://example.com;");
    expect(productManifestProblems(second)).toEqual(["CSP_DIRECTIVE:connect-src"]);
    const origin = withPolicy("http://127.0.0.1:8995/v1/chat/completions", "http://127.0.0.1:8995");
    expect(productManifestProblems(origin)).toEqual(["CSP_DIRECTIVE:connect-src"]);
    const prefix = withPolicy("/v1/chat/completions", "/v1/");
    expect(productManifestProblems(prefix)).toEqual(["CSP_DIRECTIVE:connect-src"]);
  });

  it("refuses a loosened directive, a missing one, and a new one", () => {
    expect(productManifestProblems(withPolicy("default-src 'none'", "default-src 'self'"))).toEqual(["CSP_DIRECTIVE:default-src"]);
    expect(productManifestProblems(withPolicy("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-eval'"))).toEqual(["CSP_DIRECTIVE:script-src"]);
    expect(productManifestProblems(withPolicy(" object-src 'none';", ""))).toEqual(["CSP_DIRECTIVE:object-src"]);
    expect(productManifestProblems(withPolicy("form-action 'none'", "form-action 'none'; img-src *"))).toEqual(["CSP_UNEXPECTED_DIRECTIVE:img-src"]);
    expect(productManifestProblems(withPolicy(/style-src '[^']+'/, "style-src 'unsafe-inline'"))).toEqual(["CSP_DIRECTIVE:style-src"]);
  });

  it("refuses a policy that states a directive twice, because which one wins is not this file's to guess", () => {
    expect(parseCsp("default-src 'none'; default-src *")).toBeNull();
    expect(productManifestProblems(withPolicy("form-action 'none'", "form-action 'none'; connect-src *"))).toEqual(["CSP_REPEATS_A_DIRECTIVE"]);
  });
});

describe("productPackageProblems, judged by name alone", () => {
  const expected = { ortFiles: ["ort.all.min.js", "ort-wasm-simd-threaded.jsep.wasm"], tr01File: "tr01-ppocrv4-mobile-det.onnx" };
  const files = ["manifest.json", "ort.all.min.js", "ort-wasm-simd-threaded.jsep.wasm", "tr01-ppocrv4-mobile-det.onnx"];

  it("ORT and TR-01 present, and T1 absent", () => {
    expect(productPackageProblems(files, expected)).toEqual([]);
  });

  it("refuses T1 in the package", () => {
    expect(productPackageProblems([...files, "t1-ui-head.onnx"], expected)).toEqual(["T1_PACKAGED"]);
  });

  it("refuses a package that lost ORT or TR-01, because removing T1 must remove nothing else", () => {
    expect(productPackageProblems(files.filter((f) => f !== "ort.all.min.js"), expected)).toEqual(["ORT_FILE_MISSING:ort.all.min.js"]);
    expect(productPackageProblems(files.filter((f) => !f.startsWith("tr01")), expected)).toEqual(["TR01_NOT_PACKAGED"]);
  });
});

describe("the M13 harness", () => {
  const harness = readFileSync(new URL("../extension/run-csp-negative.mjs", import.meta.url), "utf8");

  it("takes its ORT check from this module, for both phases", () => {
    expect(harness).toContain('from "../support/csp-product-phase.mjs"');
    expect(harness).toMatch(/\.\.\.ortSmokeCheck\(name, P\.legitimate\.ortSmoke\)/);
    expect(harness).not.toMatch(/ortRuntimeWithoutUiHead:/);
  });

  it("keeps every channel and evidence-phase check it had", () => {
    for (const check of [
      "zeroForeignArrivalsThroughCspGovernedChannels",
      "reasonerEndpointReachable",
      "sinkFramePath",
      "offscreenReloadsWithoutViolation",
      "sidePanelStyledAndRunning",
      "perceptionPassUnderNewCsp",
      "tr01WorkerAttacked",
    ]) {
      expect(harness, check).toContain(`${check}:`);
    }
  });
});
