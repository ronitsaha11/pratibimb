/**
 * M23.8 — THE M13 HARNESS'S PRODUCT-PHASE ASSERTIONS, WHERE THEY CAN BE RUN WITHOUT A BROWSER.
 *
 * `run-csp-negative.mjs` cannot be run to test its own product-phase expectation: its evidence phase
 * captures a frame and runs T1 and TR-01. So the expectation lives here, the harness calls it, and
 * `csp-product-phase.test.mjs` and `apps/extension/test/buildSeparation.test.ts` exercise it against
 * the real `ORT_SMOKE` handler and the real `wxt.config.ts`, with fakes in place of the browser.
 *
 * WHAT THIS DOES NOT REPLACE. Whether Chrome enforces this CSP. The channel attacks in the harness
 * measure that, in a browser, and they are not run or weakened here.
 */

/** ADR-0013 policy v2 for a product build. Every directive, exactly; `style-src` is a hash checked by shape. */
export const PRODUCT_CSP = Object.freeze({
  "default-src": "'none'",
  "script-src": "'self' 'wasm-unsafe-eval'",
  "worker-src": "'self'",
  "connect-src": "'self' http://127.0.0.1:8995/v1/chat/completions",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
});
export const PRODUCT_PERMISSIONS = Object.freeze(["offscreen", "sidePanel", "activeTab", "tabCapture"]);
export const PRODUCT_HOST_PERMISSIONS = Object.freeze(["http://127.0.0.1/*"]);

const STYLE_SRC = /^'sha256-[A-Za-z0-9+/]+=*'$/;
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));

/**
 * The harness's positive control on ORT. Evidence phase: exactly M13's original condition. Product
 * phase (M23.7, OD-P): the pinned runtime bootstraps under this CSP and the UI head is reported as not
 * packaged. A reply that loaded a model does not pass, whatever else it says.
 */
export function ortSmokeCheck(phase, ortSmoke) {
  if (phase === "evidence") {
    return { ortAndModelLoad: ortSmoke?.ok === true || ortSmoke?.status === "OK" || ortSmoke?.sessionCreated === true };
  }
  return {
    ortRuntimeWithoutUiHead:
      ortSmoke?.ok === false &&
      ortSmoke?.ortBootstrapped === true &&
      ortSmoke?.stage === "UI_HEAD_NOT_IN_PRODUCT_BUILD" &&
      !("modelBytes" in ortSmoke) &&
      !("outputDims" in ortSmoke),
  };
}

/** Directive name → value, or `null` for a policy that repeats a directive. */
export function parseCsp(policy) {
  const out = {};
  for (const part of String(policy ?? "").split(";")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const space = trimmed.indexOf(" ");
    const name = space === -1 ? trimmed : trimmed.slice(0, space);
    if (name in out) return null;
    out[name] = space === -1 ? "" : trimmed.slice(space + 1).trim();
  }
  return out;
}

/** What differs from the product manifest ADR-0013 and OD-R allow, as codes. Empty is the only pass. */
export function productManifestProblems(manifest) {
  if (typeof manifest !== "object" || manifest === null) return ["NO_MANIFEST"];
  const problems = [];
  if (!sameSet(manifest.permissions, PRODUCT_PERMISSIONS)) problems.push("PERMISSIONS_CHANGED");
  if (!sameSet(manifest.host_permissions, PRODUCT_HOST_PERMISSIONS)) problems.push("HOST_PERMISSIONS_CHANGED");
  if ("externally_connectable" in manifest) problems.push("EXTERNALLY_CONNECTABLE_PRESENT");
  if ("web_accessible_resources" in manifest) problems.push("WEB_ACCESSIBLE_RESOURCES_PRESENT");
  for (const script of manifest.content_scripts ?? []) {
    if (!sameSet(script.matches, PRODUCT_HOST_PERMISSIONS)) problems.push("CONTENT_SCRIPT_MATCHES_CHANGED");
  }
  const csp = parseCsp(manifest.content_security_policy?.extension_pages);
  if (csp === null) return [...problems, "CSP_REPEATS_A_DIRECTIVE"];
  for (const [directive, expected] of Object.entries(PRODUCT_CSP)) {
    if (csp[directive] !== expected) problems.push(`CSP_DIRECTIVE:${directive}`);
  }
  if (!STYLE_SRC.test(csp["style-src"] ?? "")) problems.push("CSP_DIRECTIVE:style-src");
  for (const directive of Object.keys(csp)) {
    if (!(directive in PRODUCT_CSP) && directive !== "style-src") problems.push(`CSP_UNEXPECTED_DIRECTIVE:${directive}`);
  }
  return problems;
}

/**
 * What a product package must and must not contain, judged BY FILE NAME. No file is opened: a model is
 * neither read nor hashed to answer this.
 */
export function productPackageProblems(fileNames, { ortFiles, tr01File }) {
  const names = new Set(fileNames);
  const problems = [];
  if (names.has("t1-ui-head.onnx")) problems.push("T1_PACKAGED");
  for (const file of ortFiles) if (!names.has(file)) problems.push(`ORT_FILE_MISSING:${file}`);
  if (!names.has(tr01File)) problems.push("TR01_NOT_PACKAGED");
  return problems;
}
