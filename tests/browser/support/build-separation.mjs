/**
 * M23.10 (OD-V) — WHAT THE SIX EVIDENCE HARNESSES REQUIRE OF THE BUILDS THEY COMPARE.
 *
 * They used to refuse unless a product and an evidence `background.js` were byte-identical, on the reasoning
 * that the evidence build's capture route was then the product's. OD-S ended both halves: a product build has
 * no capture route, and the hooks' senders live in the worker of one build and not the other. So the equality
 * could only ever fail. This replaces that one comparison, and only it:
 *
 *   A. THE PRODUCT BUILD passes `inspectProductBuild`, the M23.9 check: no hook, driver, ticket or capture call,
 *      and the product's exact manifest and package.
 *   B. THE EVIDENCE BUILD names every hook, sender and handler it must keep.
 *   C. TWO EVIDENCE BUILDS AGREE. `TR01_PROBE=1` and `STRUCTURAL_PROBE=1` both add only offscreen probes, and the
 *      worker imports neither, so their workers, content scripts and manifest routes must match. This is what
 *      still catches an unintended change to the worker, now that the product's cannot be the reference.
 *   D. THE PRODUCT'S AND THE EVIDENCE BUILD'S WORKERS DIFFER, as expected. Identical ones would mean a gate was lost.
 *
 * STILL COMPARED ACROSS THE TWO BUILDS, as before: `content.js` byte for byte, and the manifest with one source
 * of `connect-src` normalised, so permissions, host permissions and every other CSP directive. `connect-src`
 * itself must be exactly ADR-0013's difference.
 *
 * WHAT A PASS DOES NOT MEAN. This reads built files. It does not establish that either build runs, or that a
 * hook works. It also cannot pass on builds it was not given: a missing one is a problem, never a skip, so no
 * record can present an evidence build nobody examined as checked.
 *
 * No model is opened: only the worker, the content script, the manifest and JavaScript chunks are read, and
 * `inspectProductBuild` reads model files by name only.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { connectSrcOf, manifestRouteSha } from "./build-route.mjs";
import { PRODUCT_CSP, productManifestProblems } from "./csp-product-phase.mjs";
import { EXPECTED_PRODUCT_FILES, inspectProductBuild } from "./product-build-inspection.mjs";

/** The one permitted `connect-src` for an evidence build (ADR-0013). */
export const EVIDENCE_CONNECT_SRC = "'self' http://127.0.0.1:8995";

/**
 * What an evidence build must keep, by file. Names, because they survive minification: the M23.7 build's
 * inspection found `perceiveOnce` and `PERCEIVE_ONCE` by name in a real minified bundle.
 */
export const EVIDENCE_REQUIRED_NAMES = Object.freeze({
  worker: Object.freeze(["perceiveOnce", "consumeProbe", "ticketProbe", "mintStreamId", "PERCEIVE_ONCE", "STREAM_CONSUME", "CAPTURE_FRAME"]),
  offscreen: Object.freeze(["PERCEIVE_ONCE", "STREAM_CONSUME", "CAPTURE_FRAME", "chromeMediaSourceId", "grabFrame"]),
});

/**
 * The second evidence build to compare workers with. `STRUCTURAL_PROBE` touches only the offscreen document.
 * `E6_PROBE` would not do (it changes the content script), and `M3_WORKER_FRAME` changes the worker, so a dry
 * run, whose build under test carries that flag, has to carry it here as well.
 */
export function evidenceReferenceFlags({ dryRun = false } = {}) {
  return { STRUCTURAL_PROBE: "1", ...(dryRun ? { M3_WORKER_FRAME: "1" } : {}) };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** What a judgement needs from one build. Hashes and names: no bundle text is kept in a record. */
function snapshot(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  const worker = readFileSync(join(directory, "background.js"));
  const offscreen = readdirSync(join(directory, "chunks"))
    .filter((name) => name.startsWith("offscreen-") && name.endsWith(".js"))
    .map((name) => readFileSync(join(directory, "chunks", name), "utf8"))
    .join("\n");
  const workerText = worker.toString("utf8");
  return {
    worker: sha256(worker),
    content: sha256(readFileSync(join(directory, "content-scripts", "content.js"))),
    manifestRoute: manifestRouteSha(directory),
    connectSrc: connectSrcOf(directory),
    permissions: manifest.permissions ?? [],
    hostPermissions: manifest.host_permissions ?? [],
    workerNames: EVIDENCE_REQUIRED_NAMES.worker.filter((name) => workerText.includes(name)),
    offscreenNames: EVIDENCE_REQUIRED_NAMES.offscreen.filter((name) => offscreen.includes(name)),
  };
}

/** A product build, with what M23.9's inspection found wrong with it. */
export function snapshotProductBuild(directory, expected = EXPECTED_PRODUCT_FILES) {
  return { ...snapshot(directory), boundaryProblems: inspectProductBuild(directory, expected).problems };
}

/** An evidence build. It is not inspected as a product: it is meant to differ. */
export function snapshotEvidenceBuild(directory) {
  return snapshot(directory);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The contract. `problems` empty is the only pass, and the harnesses refuse otherwise.
 *
 * A dry run's evidence build carries `M3_WORKER_FRAME`, so its manifest and CSP legitimately differ, and the
 * harnesses never held a dry run to those comparisons. They are reported rather than enforced, exactly as
 * before, and a dry run can never read as checked.
 */
export function judgeBuildSeparation({ product = null, reference = null, evidence = null, dryRun = false } = {}) {
  const problems = [];
  const acrossBuilds = [];

  // A build nobody examined is a problem, never a skip.
  if (product === null) problems.push("PRODUCT_BUILD_NOT_EXAMINED");
  if (evidence === null) problems.push("EVIDENCE_BUILD_NOT_EXAMINED");
  if (reference === null) problems.push("REFERENCE_EVIDENCE_BUILD_NOT_EXAMINED");

  // A. The product has no hook.
  if (product !== null) for (const problem of product.boundaryProblems) problems.push(`PRODUCT:${problem}`);

  // B. The evidence build kept every hook.
  if (evidence !== null) {
    for (const name of EVIDENCE_REQUIRED_NAMES.worker) if (!evidence.workerNames.includes(name)) problems.push(`EVIDENCE_WORKER_LACKS:${name}`);
    for (const name of EVIDENCE_REQUIRED_NAMES.offscreen) if (!evidence.offscreenNames.includes(name)) problems.push(`EVIDENCE_OFFSCREEN_LACKS:${name}`);
  }

  // C. Two evidence builds agree on everything shared.
  if (evidence !== null && reference !== null) {
    if (evidence.worker !== reference.worker) problems.push("EVIDENCE_WORKERS_DISAGREE");
    if (evidence.content !== reference.content) problems.push("EVIDENCE_CONTENT_SCRIPTS_DISAGREE");
    if (evidence.manifestRoute !== reference.manifestRoute) problems.push("EVIDENCE_MANIFESTS_DISAGREE");
  }

  if (product !== null && evidence !== null) {
    // D. The workers differ, on purpose.
    if (evidence.worker === product.worker) problems.push("WORKER_IDENTICAL_TO_PRODUCT");

    // Retained: everything else is still compared across the two builds.
    if (evidence.content !== product.content) acrossBuilds.push("CONTENT_DIFFERS_FROM_PRODUCT");
    if (evidence.manifestRoute !== product.manifestRoute) acrossBuilds.push("MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT");
    if (!same(evidence.permissions, product.permissions)) acrossBuilds.push("PERMISSIONS_DIFFER_FROM_PRODUCT");
    if (!same(evidence.hostPermissions, product.hostPermissions)) acrossBuilds.push("HOST_PERMISSIONS_DIFFER_FROM_PRODUCT");
    if (product.connectSrc !== PRODUCT_CSP["connect-src"] || evidence.connectSrc !== EVIDENCE_CONNECT_SRC) acrossBuilds.push("CONNECT_SRC_NOT_THE_APPROVED_DIFFERENCE");
  }

  if (!dryRun) problems.push(...acrossBuilds);
  const examined = product !== null && evidence !== null && reference !== null;

  return {
    problems,
    notEnforcedInDryRun: dryRun ? acrossBuilds : [],
    status: !examined ? "NOT_EXAMINED" : problems.length > 0 ? "REFUSED" : dryRun ? "DRY_RUN_NOT_EVIDENCE" : "BUILD_OUTPUTS_SEPARATED",
    /** The route a run measures. A product build has none (OD-R, OD-S), so a record cannot claim one for it. */
    measuredRoute: "the evidence build's",
    establishes: "what the built files contain; not that either build runs",
  };
}

/**
 * M23.11 (OD-U) — WHICH BUILD IS THIS? Asked of what the build contains, because a directory's name proves nothing:
 * every variant is written to the same `.output/chrome-mv3`.
 *
 * No marker is invented. These are the differences the build configuration already makes:
 *   - `connect-src`, which `wxt.config.ts` selects by build type (ADR-0013);
 *   - the hooks' names, which are in one build and not the other (M23.9);
 *   - T1, packaged only in an evidence build (M23.7), judged by file name and never opened.
 *
 * EVERY SIGNAL MUST AGREE, or the answer is UNKNOWN. A build with the product's policy and an evidence build's
 * hooks is neither, and is treated as neither.
 */
export function identifyBuild(directory, expected = EXPECTED_PRODUCT_FILES) {
  const needed = ["manifest.json", "background.js", join("content-scripts", "content.js"), "chunks"];
  const missing = needed.filter((path) => !existsSync(join(directory, path)));
  if (missing.length > 0) return { identity: "MISSING", reasons: missing.map((path) => `MISSING:${path.replace(/\\/g, "/")}`), workerFrameRoute: false, e6Probe: false };

  let seen;
  let manifest;
  let workerText;
  let offscreenText;
  let contentText;
  let rootFiles;
  let productProblems;
  try {
    seen = snapshot(directory);
    manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    workerText = readFileSync(join(directory, "background.js"), "utf8");
    contentText = readFileSync(join(directory, "content-scripts", "content.js"), "utf8");
    offscreenText = readdirSync(join(directory, "chunks"))
      .filter((name) => name.startsWith("offscreen-") && name.endsWith(".js"))
      .map((name) => readFileSync(join(directory, "chunks", name), "utf8"))
      .join("\n");
    rootFiles = readdirSync(directory);
    productProblems = inspectProductBuild(directory, expected).problems;
  } catch {
    return { identity: "UNKNOWN", reasons: ["UNREADABLE_BUILD"], workerFrameRoute: false, e6Probe: false };
  }

  const e6Probe = contentText.includes("E6_CLICK") || contentText.includes("E6_TYPE");
  if (productProblems.length === 0) return { identity: "PRODUCT", reasons: [], workerFrameRoute: false, e6Probe };

  // M3_WORKER_FRAME is one flag bringing the route and `<all_urls>` together, so one without the other is not a build.
  const allUrls = seen.hostPermissions.includes("<all_urls>");
  const workerFrame = workerText.includes("tabs.captureVisibleTab");
  const reasons = [];
  if (allUrls !== workerFrame) reasons.push("WORKER_FRAME_ROUTE_AND_ALL_URLS_DISAGREE");
  if (seen.connectSrc !== EVIDENCE_CONNECT_SRC) reasons.push("CONNECT_SRC_IS_NOT_THE_EVIDENCE_POLICY");
  for (const name of EVIDENCE_REQUIRED_NAMES.worker) if (!seen.workerNames.includes(name)) reasons.push(`WORKER_LACKS:${name}`);
  for (const name of EVIDENCE_REQUIRED_NAMES.offscreen) if (!seen.offscreenNames.includes(name)) reasons.push(`OFFSCREEN_LACKS:${name}`);
  if (!rootFiles.includes("t1-ui-head.onnx")) reasons.push("T1_NOT_PACKAGED");
  if (!rootFiles.includes(expected.tr01File)) reasons.push("TR01_NOT_PACKAGED");
  for (const file of expected.ortFiles) if (!rootFiles.includes(file)) reasons.push(`ORT_FILE_MISSING:${file}`);
  if (offscreenText.includes("__EVIDENCE_BUILD__")) reasons.push("EVIDENCE_FLAG_NOT_SUBSTITUTED");
  // The evidence policy is the product's with one source widened (ADR-0013), so everything else is held to the product's.
  const asProduct = structuredClone(manifest);
  const csp = asProduct.content_security_policy?.extension_pages;
  if (typeof csp === "string") asProduct.content_security_policy.extension_pages = csp.replace(/connect-src [^;]*/, `connect-src ${PRODUCT_CSP["connect-src"]}`);
  if (allUrls && workerFrame) asProduct.host_permissions = seen.hostPermissions.filter((host) => host !== "<all_urls>");
  for (const problem of productManifestProblems(asProduct)) reasons.push(`MANIFEST:${problem}`);

  return reasons.length === 0
    ? { identity: "EVIDENCE", reasons: [], workerFrameRoute: workerFrame, e6Probe }
    : { identity: "UNKNOWN", reasons, productProblems, workerFrameRoute: workerFrame, e6Probe };
}

/**
 * M23.11 (OD-U) — MAY A GESTURE HARNESS RUN ON THIS BUILD? Only on an evidence build with the gesture route alone.
 *
 * It decides and starts nothing, and it has no way to build. So a refusal cannot be turned into a run by a fallback.
 * The two refusals inside the evidence family carry over what these harnesses have always needed: the degraded
 * worker-frame route would look identical in their logs, and E6's content-script mechanisms consult no permit, so a
 * click count taken beside them would not be a count of what the gates allowed.
 */
export function selectGestureEvidenceBuild(directory, expected = EXPECTED_PRODUCT_FILES) {
  const found = identifyBuild(directory, expected);
  const AUTHORISE = "These harnesses never build one. An evidence build and a run each need the owner's authorisation.";
  let refusal = null;
  if (found.identity === "MISSING") refusal = `no build to examine (${found.reasons.join(", ")}). There is no fallback to any other build. ${AUTHORISE}`;
  else if (found.identity === "PRODUCT") refusal = `this is a product build. OD-U: this harness is evidence-build-only, because a DOM-only product has no capture route and no diagnostic hooks. ${AUTHORISE}`;
  else if (found.identity !== "EVIDENCE") refusal = `this build's identity cannot be established, so it is refused (${found.reasons.join(", ")}). ${AUTHORISE}`;
  else if (found.workerFrameRoute) refusal = "this evidence build carries the degraded worker-frame route (M3_WORKER_FRAME=1); gesture evidence taken on it would look identical in the log. Use an evidence build without that flag";
  else if (found.e6Probe) refusal = "this evidence build carries E6's content-script mechanisms (E6_PROBE=1), which consult no permit. Use an evidence build without that flag";
  return { accepted: refusal === null, identity: found.identity, reasons: found.reasons, refusal };
}

/** The gate both gesture harnesses call first. `refuse` is theirs, and exits. */
export function requireGestureEvidenceBuild(directory, refuse, expected = EXPECTED_PRODUCT_FILES) {
  const selection = selectGestureEvidenceBuild(directory, expected);
  if (!selection.accepted) refuse(selection.refusal);
  return selection;
}
