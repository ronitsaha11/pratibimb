/**
 * M23.10 (OD-V) — the build-separation contract, on synthetic build directories, and its wiring in the six
 * harnesses, read as text. Nothing here builds, starts a browser or runs a harness. Model names are DIRECTORIES
 * in the fixtures, so any attempt to read one would throw.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { connectSrcOf, manifestRouteSha } from "./build-route.mjs";
import { evidenceReferenceFlags, EVIDENCE_CONNECT_SRC, EVIDENCE_REQUIRED_NAMES, judgeBuildSeparation, snapshotEvidenceBuild, snapshotProductBuild } from "./build-separation.mjs";
import { DIAGNOSTIC_HOOK_MARKERS } from "./product-build-inspection.mjs";

const ROOT = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXPECTED = { ortFiles: ["ort.all.min.js", "ort-wasm-simd-threaded.jsep.wasm"], tr01File: "tr01-ppocrv4-mobile-det.onnx" };
const STYLE = "style-src 'sha256-ZYRp1TbYj9bPuYCw1S2y0R5L4r911NcNjTciEbHTsAo='";
const policy = (connectSrc) => `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src ${connectSrc}; ${STYLE}; object-src 'none'; base-uri 'none'; form-action 'none'`;
const PRODUCT_CONNECT = "'self' http://127.0.0.1:8995/v1/chat/completions";

const PRODUCT_WORKER = "const h={toOffscreen(){},captureState(){}};chrome.tabCapture.getMediaStreamId;chrome.action?.onClicked.addListener(t=>{o(t,e=>chrome.sidePanel.open(e))});";
const EVIDENCE_WORKER = `${PRODUCT_WORKER}const d={perceiveOnce(){},consumeProbe(){},ticketProbe(){},mintStreamId(){}};const k=["PERCEIVE_ONCE","STREAM_CONSUME","CAPTURE_FRAME"];`;
const PRODUCT_OFFSCREEN = 'const r="UI_HEAD_NOT_IN_PRODUCT_BUILD";';
const EVIDENCE_OFFSCREEN = `${PRODUCT_OFFSCREEN}const k=["PERCEIVE_ONCE","STREAM_CONSUME","CAPTURE_FRAME"];const c={chromeMediaSourceId:1};x.grabFrame();`;
const CONTENT = 'chrome.runtime.sendMessage({kind:"HELLO"});';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function build({ worker, offscreen, content = CONTENT, connectSrc, manifest = {}, csp, models = [] }) {
  const dir = mkdtempSync(join(tmpdir(), "m2310-build-"));
  made.push(dir);
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "content-scripts"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"],
      host_permissions: ["http://127.0.0.1/*"],
      action: { default_title: "PratiBimb — Page Assistant" },
      content_security_policy: { extension_pages: csp ?? policy(connectSrc) },
      content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content-scripts/content.js"] }],
      ...manifest,
    })
  );
  writeFileSync(join(dir, "background.js"), worker);
  writeFileSync(join(dir, "chunks", "offscreen-abc.js"), offscreen);
  writeFileSync(join(dir, "chunks", "sidepanel-abc.js"), 'const a="PratiBimb uses page structure to identify elements and assist with browser tasks.",p="Normal tasks do not capture browser screenshots or send page images to the reasoning model.";');
  writeFileSync(join(dir, "content-scripts", "content.js"), content);
  writeFileSync(join(dir, "ort.all.min.js"), "");
  // Directories, deliberately. Reading one throws EISDIR.
  mkdirSync(join(dir, "ort-wasm-simd-threaded.jsep.wasm"));
  for (const model of ["tr01-ppocrv4-mobile-det.onnx", ...models]) mkdirSync(join(dir, model));
  return dir;
}

const productBuild = (over = {}) => snapshotProductBuild(build({ worker: PRODUCT_WORKER, offscreen: PRODUCT_OFFSCREEN, connectSrc: PRODUCT_CONNECT, ...over }), EXPECTED);
const evidenceBuild = (over = {}) => snapshotEvidenceBuild(build({ worker: EVIDENCE_WORKER, offscreen: EVIDENCE_OFFSCREEN, connectSrc: EVIDENCE_CONNECT_SRC, models: ["t1-ui-head.onnx"], ...over }));
const good = () => ({ product: productBuild(), reference: evidenceBuild(), evidence: evidenceBuild() });

describe("the contract, when every build is what it should be", () => {
  it("(1) passes with product and evidence workers that DIFFER: that is what is expected now", () => {
    const builds = good();
    expect(builds.product.worker).not.toBe(builds.evidence.worker);
    const verdict = judgeBuildSeparation(builds);
    expect(verdict.problems).toEqual([]);
    expect(verdict.status).toBe("BUILD_OUTPUTS_SEPARATED");
  });

  it("(D) refuses workers that are identical: a gate has been lost in one direction or the other", () => {
    const worker = EVIDENCE_WORKER;
    const product = { ...productBuild(), worker: "same" };
    const evidence = { ...evidenceBuild({ worker }), worker: "same" };
    expect(judgeBuildSeparation({ product, reference: evidence, evidence }).problems).toEqual(["WORKER_IDENTICAL_TO_PRODUCT"]);
  });

  it("says what a pass establishes, and which build's route a run measured", () => {
    const verdict = judgeBuildSeparation(good());
    expect(verdict.establishes).toMatch(/not that either build runs/);
    expect(verdict.measuredRoute).toBe("the evidence build's");
  });
});

describe("A: the product build has no hook", () => {
  it("(2) a product build with every marker absent has no boundary problem", () => {
    expect(productBuild().boundaryProblems).toEqual([]);
  });

  it("(6) passes only when ALL absence conditions hold: any single marker, alone, is enough to fail", () => {
    expect(judgeBuildSeparation(good()).problems).toEqual([]);
    expect(DIAGNOSTIC_HOOK_MARKERS.length).toBeGreaterThanOrEqual(10);
    for (const marker of DIAGNOSTIC_HOOK_MARKERS) {
      const product = productBuild({ worker: `${PRODUCT_WORKER}const late="${marker}";` });
      const { problems, status } = judgeBuildSeparation({ ...good(), product });
      expect(problems, marker).toEqual([`PRODUCT:DIAGNOSTIC_HOOK_IN_BUNDLE:${marker}`]);
      expect(status).toBe("REFUSED");
    }
  });

  it("(7) an unexpected hook fails wherever in the product bundle it is", () => {
    for (const where of [{ worker: `${PRODUCT_WORKER}perceiveOnce;` }, { offscreen: `${PRODUCT_OFFSCREEN}"STREAM_CONSUME";` }, { content: `${CONTENT}"PERCEIVE_ONCE";` }]) {
      const { problems } = judgeBuildSeparation({ ...good(), product: productBuild(where) });
      expect(problems.some((p) => p.startsWith("PRODUCT:DIAGNOSTIC_HOOK_IN_BUNDLE:")), JSON.stringify(where)).toBe(true);
    }
  });

  it("a capture call in a product bundle, or T1 in its package, fails too: the whole M23.9 inspection applies", () => {
    expect(judgeBuildSeparation({ ...good(), product: productBuild({ offscreen: "await navigator.mediaDevices.getUserMedia({});" }) }).problems).toEqual(["PRODUCT:CAPTURE_CALL_IN_BUNDLE"]);
    expect(judgeBuildSeparation({ ...good(), product: productBuild({ models: ["t1-ui-head.onnx"] }) }).problems).toEqual(["PRODUCT:T1_PACKAGED"]);
  });
});

describe("B: the evidence build keeps its hooks", () => {
  it("(3) names every hook, sender and handler it must", () => {
    const evidence = evidenceBuild();
    expect(evidence.workerNames).toEqual(EVIDENCE_REQUIRED_NAMES.worker);
    expect(evidence.offscreenNames).toEqual(EVIDENCE_REQUIRED_NAMES.offscreen);
  });

  it("(8) a missing worker registration fails, one name at a time", () => {
    for (const name of EVIDENCE_REQUIRED_NAMES.worker) {
      const evidence = { ...evidenceBuild(), workerNames: EVIDENCE_REQUIRED_NAMES.worker.filter((n) => n !== name) };
      expect(judgeBuildSeparation({ ...good(), evidence }).problems, name).toEqual([`EVIDENCE_WORKER_LACKS:${name}`]);
    }
  });

  it("(8) a missing offscreen handler fails, one name at a time", () => {
    for (const name of EVIDENCE_REQUIRED_NAMES.offscreen) {
      const evidence = { ...evidenceBuild(), offscreenNames: EVIDENCE_REQUIRED_NAMES.offscreen.filter((n) => n !== name) };
      expect(judgeBuildSeparation({ ...good(), evidence }).problems, name).toEqual([`EVIDENCE_OFFSCREEN_LACKS:${name}`]);
    }
  });

  it("(8) an evidence build whose bundle was built without its hooks is caught from the files, not just the snapshot", () => {
    const evidence = evidenceBuild({ worker: `${PRODUCT_WORKER}/* different, so D passes */`, offscreen: PRODUCT_OFFSCREEN });
    const { problems } = judgeBuildSeparation({ product: productBuild(), reference: evidence, evidence });
    expect(problems).toContain("EVIDENCE_WORKER_LACKS:perceiveOnce");
    expect(problems).toContain("EVIDENCE_OFFSCREEN_LACKS:STREAM_CONSUME");
  });
});

describe("C: two evidence builds agree", () => {
  it("a worker that varies between evidence flags fails, which is what now catches an unintended worker change", () => {
    const reference = evidenceBuild({ worker: `${EVIDENCE_WORKER}/* drift */` });
    expect(judgeBuildSeparation({ ...good(), reference }).problems).toEqual(["EVIDENCE_WORKERS_DISAGREE"]);
  });

  it("a content script or a manifest that varies between them fails", () => {
    expect(judgeBuildSeparation({ ...good(), reference: evidenceBuild({ content: `${CONTENT};` }) }).problems).toContain("EVIDENCE_CONTENT_SCRIPTS_DISAGREE");
    expect(judgeBuildSeparation({ ...good(), reference: evidenceBuild({ manifest: { name: "other" } }) }).problems).toContain("EVIDENCE_MANIFESTS_DISAGREE");
  });

  it("the reference flag is an existing one that is not the build under test, and a dry run's carries its worker flag", () => {
    expect(evidenceReferenceFlags()).toEqual({ STRUCTURAL_PROBE: "1" });
    expect(evidenceReferenceFlags({ dryRun: true })).toEqual({ STRUCTURAL_PROBE: "1", M3_WORKER_FRAME: "1" });
  });
});

describe("the retained comparisons: still the same bar across the two builds", () => {
  it("(4, 9) a modified content script fails", () => {
    const { problems, status } = judgeBuildSeparation({ ...good(), evidence: evidenceBuild({ content: `${CONTENT}/* changed */` }), reference: evidenceBuild({ content: `${CONTENT}/* changed */` }) });
    expect(problems).toEqual(["CONTENT_DIFFERS_FROM_PRODUCT"]);
    expect(status).toBe("REFUSED");
  });

  it("(5, 10) a modified manifest fails, even in a field nothing else looks at", () => {
    const changed = { manifest: { description: "changed" } };
    const { problems } = judgeBuildSeparation({ ...good(), evidence: evidenceBuild(changed), reference: evidenceBuild(changed) });
    expect(problems).toEqual(["MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT"]);
  });

  it("(11) a host permission the product does not have fails", () => {
    const wider = { manifest: { host_permissions: ["http://127.0.0.1/*", "<all_urls>"] } };
    const { problems } = judgeBuildSeparation({ ...good(), evidence: evidenceBuild(wider), reference: evidenceBuild(wider) });
    expect(problems).toEqual(expect.arrayContaining(["MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT", "HOST_PERMISSIONS_DIFFER_FROM_PRODUCT"]));
  });

  it("(11) a permission added, or tabCapture removed, fails", () => {
    for (const permissions of [["offscreen", "sidePanel", "activeTab", "tabCapture", "tabs"], ["offscreen", "sidePanel", "activeTab"]]) {
      const changed = { manifest: { permissions } };
      const { problems } = judgeBuildSeparation({ ...good(), evidence: evidenceBuild(changed), reference: evidenceBuild(changed) });
      expect(problems, JSON.stringify(permissions)).toEqual(expect.arrayContaining(["MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT", "PERMISSIONS_DIFFER_FROM_PRODUCT"]));
    }
  });

  it("(11) any CSP directive other than connect-src fails", () => {
    const changed = { csp: policy(EVIDENCE_CONNECT_SRC).replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-eval'") };
    const { problems } = judgeBuildSeparation({ ...good(), evidence: evidenceBuild(changed), reference: evidenceBuild(changed) });
    expect(problems).toEqual(["MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT"]);
  });

  it("(11) a connect-src outside ADR-0013's one difference fails, on either side", () => {
    const wider = { connectSrc: "'self' http://127.0.0.1:8995 https://example.com" };
    expect(judgeBuildSeparation({ ...good(), evidence: evidenceBuild(wider), reference: evidenceBuild(wider) }).problems).toEqual(["CONNECT_SRC_NOT_THE_APPROVED_DIFFERENCE"]);
    const product = productBuild({ connectSrc: EVIDENCE_CONNECT_SRC });
    expect(judgeBuildSeparation({ ...good(), product }).problems).toEqual(expect.arrayContaining(["CONNECT_SRC_NOT_THE_APPROVED_DIFFERENCE"]));
  });

  it("the manifest comparison normalises connect-src alone (M13's helper, unchanged)", () => {
    const a = build({ worker: "", offscreen: "", connectSrc: PRODUCT_CONNECT });
    const b = build({ worker: "", offscreen: "", connectSrc: EVIDENCE_CONNECT_SRC });
    expect(manifestRouteSha(a)).toBe(manifestRouteSha(b));
    expect(connectSrcOf(a)).not.toBe(connectSrcOf(b));
  });
});

describe("(12) nothing unexamined can read as checked", () => {
  it("an evidence build nobody examined is a problem, never a skip", () => {
    const { product, reference } = good();
    const verdict = judgeBuildSeparation({ product, reference });
    expect(verdict.problems).toEqual(["EVIDENCE_BUILD_NOT_EXAMINED"]);
    expect(verdict.status).toBe("NOT_EXAMINED");
  });

  it("so is a missing reference build, or a missing product build", () => {
    const { product, evidence } = good();
    expect(judgeBuildSeparation({ product, evidence }).problems).toEqual(["REFERENCE_EVIDENCE_BUILD_NOT_EXAMINED"]);
    expect(judgeBuildSeparation({ reference: evidence, evidence }).problems).toEqual(["PRODUCT_BUILD_NOT_EXAMINED"]);
  });

  it("given nothing at all, it fails three ways and says so", () => {
    const verdict = judgeBuildSeparation();
    expect(verdict.problems).toHaveLength(3);
    expect(verdict.status).toBe("NOT_EXAMINED");
  });

  it("a dry run never reads as checked, and reports what it did not enforce", () => {
    const wider = { manifest: { host_permissions: ["http://127.0.0.1/*", "<all_urls>"] } };
    const verdict = judgeBuildSeparation({ product: productBuild(), reference: evidenceBuild(wider), evidence: evidenceBuild(wider), dryRun: true });
    expect(verdict.problems).toEqual([]);
    expect(verdict.status).toBe("DRY_RUN_NOT_EVIDENCE");
    expect(verdict.notEnforcedInDryRun).toEqual(expect.arrayContaining(["MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT", "HOST_PERMISSIONS_DIFFER_FROM_PRODUCT"]));
  });

  it("a dry run still enforces the product's absences and the evidence build's hooks", () => {
    const leaky = productBuild({ worker: `${PRODUCT_WORKER}perceiveOnce;` });
    expect(judgeBuildSeparation({ ...good(), product: leaky, dryRun: true }).problems).toEqual(["PRODUCT:DIAGNOSTIC_HOOK_IN_BUNDLE:perceiveOnce"]);
    const hollow = { ...evidenceBuild(), workerNames: [] };
    expect(judgeBuildSeparation({ ...good(), evidence: hollow, dryRun: true }).status).toBe("REFUSED");
  });
});

describe("the names are tied to the source they stand for", () => {
  const source = (relative) => readFileSync(join(ROOT, relative), "utf8");

  it("every name the worker must keep is in the worker's source", () => {
    const worker = source("apps/extension/host/background.ts");
    for (const name of EVIDENCE_REQUIRED_NAMES.worker) expect(worker, name).toContain(name);
  });

  it("every name the offscreen document must keep is in what its bundle is made of", () => {
    const offscreen = source("apps/extension/host/offscreen/main.ts") + source("apps/extension/host-lib/perception-realm.ts");
    for (const name of EVIDENCE_REQUIRED_NAMES.offscreen) expect(offscreen, name).toContain(name);
  });

  it("everything the evidence build must keep, the product must not have: so A and B together imply D", () => {
    for (const name of [...EVIDENCE_REQUIRED_NAMES.worker, ...EVIDENCE_REQUIRED_NAMES.offscreen]) expect(DIAGNOSTIC_HOOK_MARKERS, name).toContain(name);
  });
});

describe("the six harnesses, read as text", () => {
  const harness = (name) => readFileSync(join(ROOT, "tests", "browser", "extension", `${name}.mjs`), "utf8").replace(/\r\n/g, "\n");
  const CONNECT_SRC_REFUSAL = "buildFacts.connectSrcDiffersOnlyByCollector) refuse(";
  const SIX = {
    "run-gesture-redaction": { dryRun: "DRY", retained: ['if (!buildFacts.probePresent) refuse("the evidence build carries no probe");', "!buildFacts.noAllUrls || !buildFacts.noCaptureVisibleTab"] },
    "run-webp-loopback": { dryRun: "DRY", retained: ['refuse("the PRODUCT bundle carries frame egress");', 'refuse("the evidence build carries no frame egress probe");', "!buildFacts.noCaptureVisibleTab"] },
    "run-artifact-verifier": { dryRun: "DRY", retained: ['refuse("the PRODUCT bundle carries frame egress");', 'refuse("the evidence build carries no frame egress probe");', "!buildFacts.noCaptureVisibleTab"] },
    "run-capture-determinism": { dryRun: "false", retained: ["!buildFacts.noCaptureVisibleTab"] },
    "run-stream-j7": { dryRun: "DRY", retained: ['refuse("the PRODUCT bundle carries a frame sender");', "!buildFacts.noCaptureVisibleTab"] },
    "run-stream-re1": { dryRun: "DRY", retained: ["!buildFacts.noCaptureVisibleTab"] },
  };

  for (const [name, { dryRun, retained }] of Object.entries(SIX)) {
    describe(name, () => {
      const code = harness(name);

      it("no longer requires the workers to match", () => {
        expect(code).not.toContain("routeIdenticalToProduct");
        expect(code).not.toMatch(/the evidence build's capture route differs from the product's/);
        expect(code).not.toMatch(/productRoute\.background\s*[!=]==/);
      });

      it("still compares the content script and the manifest's route, with only the worker left out", () => {
        expect(code).toContain("sharedRouteIdenticalToProduct: JSON.stringify({ ...productRoute, background: null, connectSrc: null }) === JSON.stringify({ ...evidenceRoute, background: null, connectSrc: null }),");
        expect(code).toMatch(/!buildFacts\.sharedRouteIdenticalToProduct\) refuse\(/);
        expect(code).toMatch(/content: (sha|shaFile)\(join\(EXT, "content-scripts", "content\.js"\)\)/);
        expect(code).toContain("manifest: manifestRouteSha(EXT)");
      });

      it("refuses on any contract problem, in every mode", () => {
        expect(code).toContain(`judgeBuildSeparation({ product: productBuild, reference: referenceBuild, evidence: evidenceBuild, dryRun: ${dryRun} })`);
        expect(code).toMatch(/^if \(separation\.problems\.length > 0\) refuse\(/m);
      });

      it("examines three real builds in order, and leaves the build under test in place", () => {
        const order = ["build({});", "snapshotProductBuild(EXT)", `build(evidenceReferenceFlags({ dryRun: ${dryRun} }));`, "const referenceBuild = snapshotEvidenceBuild(EXT);", 'TR01_PROBE: "1"', "const evidenceBuild = snapshotEvidenceBuild(EXT);", "judgeBuildSeparation("].map((needle) => code.indexOf(needle));
        expect(order.every((at) => at >= 0), JSON.stringify(order)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
      });

      it("records the judgement, and has no way to claim one it did not make", () => {
        expect(code).toMatch(/^\s+separation,$/m);
        expect(code).toContain("build: buildFacts");
        expect(code).not.toContain("BUILD_OUTPUTS_SEPARATED");
      });

      it("keeps every check of its own", () => {
        expect(code).toContain(CONNECT_SRC_REFUSAL);
        for (const check of retained) expect(code, check).toContain(check);
      });

      it("no longer says the route it measures is the product's", () => {
        expect(code).not.toMatch(/capture route (is|are|must be) the product's|the capture route and permissions are the product's|not the product capture route/);
      });
    });
  }

  it("no other harness had this guard, and none has a new blanket worker comparison", () => {
    for (const name of ["run-csp-negative", "run-tr01-worker", "run-visual-mask", "run-re1-product", "run-structural-stale", "run-text-region-eval", "run-extension-loop", "run-qg04-interception"]) {
      expect(harness(name), name).not.toMatch(/routeIdenticalToProduct|snapshotEvidenceBuild/);
    }
  });

  it("the two gesture harnesses use this module's gate and not this comparison: they make no builds to compare (OD-U, M23.11)", () => {
    for (const name of ["run-gesture-capture", "run-gesture-acts"]) {
      expect(harness(name), name).toContain("requireGestureEvidenceBuild(EXT, refuse);");
      expect(harness(name), name).not.toMatch(/judgeBuildSeparation|snapshotEvidenceBuild/);
    }
    expect(harness("run-gesture-capture")).toContain("globalThis.__host.consumeProbe()");
  });
});
