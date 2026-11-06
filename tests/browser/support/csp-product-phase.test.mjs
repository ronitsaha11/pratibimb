/**
 * The M13 harness's product-phase expectation, tested on its own. See `csp-product-phase.mjs` for what
 * this does and does not stand in for. Synthetic manifests and replies only: no browser, no build and
 * no model file.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { evidencePermissionProblems, EVIDENCE_ONLY_PERMISSIONS, EVIDENCE_PERMISSIONS, ortSmokeCheck, parseCsp, permissionDeltaProblems, PRODUCT_PERMISSIONS, productManifestProblems, productPackageProblems } from "./csp-product-phase.mjs";

const PRODUCT_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' http://127.0.0.1:8995/v1/chat/completions; style-src 'sha256-ZYRp1TbYj9bPuYCw1S2y0R5L4r911NcNjTciEbHTsAo='; object-src 'none'; base-uri 'none'; form-action 'none'";
const manifest = (over = {}) => ({
  permissions: ["offscreen", "sidePanel"],
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

  it("M23.17: refuses a product with either capture permission, and names it", () => {
    expect(productManifestProblems(manifest({ permissions: ["offscreen", "sidePanel", "tabCapture"] }))).toEqual(["PERMISSIONS_CHANGED", "EVIDENCE_ONLY_PERMISSION_IN_PRODUCT:tabCapture"]);
    expect(productManifestProblems(manifest({ permissions: ["offscreen", "sidePanel", "activeTab"] }))).toEqual(["PERMISSIONS_CHANGED", "EVIDENCE_ONLY_PERMISSION_IN_PRODUCT:activeTab"]);
    expect(productManifestProblems(manifest({ permissions: [...EVIDENCE_PERMISSIONS] }))).toEqual(["PERMISSIONS_CHANGED", "EVIDENCE_ONLY_PERMISSION_IN_PRODUCT:activeTab", "EVIDENCE_ONLY_PERMISSION_IN_PRODUCT:tabCapture"]);
  });

  it("refuses a widened or a narrowed permission set: nothing is added, and neither of the two is lost", () => {
    expect(productManifestProblems(manifest({ permissions: ["offscreen", "sidePanel", "tabs"] }))).toEqual(["PERMISSIONS_CHANGED"]);
    expect(productManifestProblems(manifest({ permissions: ["offscreen"] }))).toEqual(["PERMISSIONS_CHANGED"]);
    expect(productManifestProblems(manifest({ permissions: ["sidePanel"] }))).toEqual(["PERMISSIONS_CHANGED"]);
    expect(productManifestProblems(manifest({ permissions: undefined }))).toEqual(["PERMISSIONS_CHANGED"]);
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

describe("M23.17 (RD-5, RD-6): the approved permission difference", () => {
  it("is these two names exactly, and an evidence build's list is the product's and then those", () => {
    expect(PRODUCT_PERMISSIONS).toEqual(["offscreen", "sidePanel"]);
    expect(EVIDENCE_ONLY_PERMISSIONS).toEqual(["activeTab", "tabCapture"]);
    expect(EVIDENCE_PERMISSIONS).toEqual(["offscreen", "sidePanel", "activeTab", "tabCapture"]);
  });

  it("evidencePermissionProblems: the exact list passes, and anything else names what is wrong", () => {
    expect(evidencePermissionProblems([...EVIDENCE_PERMISSIONS])).toEqual([]);
    expect(evidencePermissionProblems(["offscreen", "sidePanel", "activeTab"])).toEqual(["EVIDENCE_LACKS_PERMISSION:tabCapture"]);
    expect(evidencePermissionProblems(["offscreen", "sidePanel", "tabCapture"])).toEqual(["EVIDENCE_LACKS_PERMISSION:activeTab"]);
    expect(evidencePermissionProblems([...EVIDENCE_PERMISSIONS, "tabs"])).toEqual(["EVIDENCE_UNAPPROVED_PERMISSION:tabs"]);
    expect(evidencePermissionProblems(["offscreen", "sidePanel", "activeTab", "tabCapture", "tabCapture"])).toEqual(["EVIDENCE_PERMISSIONS_CHANGED"]);
  });

  it("evidencePermissionProblems fails closed on what is not a list", () => {
    for (const nothing of [undefined, null, "tabCapture", {}]) expect(evidencePermissionProblems(nothing)).toHaveLength(EVIDENCE_PERMISSIONS.length);
  });

  it("permissionDeltaProblems: the approved difference passes, and only in that direction", () => {
    expect(permissionDeltaProblems([...PRODUCT_PERMISSIONS], [...EVIDENCE_PERMISSIONS])).toEqual([]);
    expect(permissionDeltaProblems([...EVIDENCE_PERMISSIONS], [...PRODUCT_PERMISSIONS])).toEqual([
      "APPROVED_PERMISSION_DIFFERENCE_MISSING:activeTab",
      "APPROVED_PERMISSION_DIFFERENCE_MISSING:tabCapture",
      "UNAPPROVED_PERMISSION_DIFFERENCE:activeTab",
      "UNAPPROVED_PERMISSION_DIFFERENCE:tabCapture",
    ]);
  });

  it("permissionDeltaProblems: no difference at all is not the approved difference", () => {
    expect(permissionDeltaProblems([...EVIDENCE_PERMISSIONS], [...EVIDENCE_PERMISSIONS])).toEqual(["APPROVED_PERMISSION_DIFFERENCE_MISSING:activeTab", "APPROVED_PERMISSION_DIFFERENCE_MISSING:tabCapture"]);
  });

  it("permissionDeltaProblems: any other name differing, either way, is named", () => {
    expect(permissionDeltaProblems(["offscreen", "sidePanel"], [...EVIDENCE_PERMISSIONS, "tabs"])).toEqual(["UNAPPROVED_PERMISSION_DIFFERENCE:tabs"]);
    expect(permissionDeltaProblems(["offscreen", "sidePanel", "tabs"], [...EVIDENCE_PERMISSIONS])).toEqual(["UNAPPROVED_PERMISSION_DIFFERENCE:tabs"]);
    expect(permissionDeltaProblems(["offscreen"], [...EVIDENCE_PERMISSIONS])).toEqual(["UNAPPROVED_PERMISSION_DIFFERENCE:sidePanel"]);
  });

  it("permissionDeltaProblems fails closed on what is not a list", () => {
    expect(permissionDeltaProblems(undefined, undefined)).toEqual(["APPROVED_PERMISSION_DIFFERENCE_MISSING:activeTab", "APPROVED_PERMISSION_DIFFERENCE_MISSING:tabCapture"]);
  });
});
