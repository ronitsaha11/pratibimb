/**
 * M23.11 (OD-U) — `run-gesture-capture.mjs` AND `run-gesture-acts.mjs` ARE EVIDENCE-BUILD-ONLY.
 *
 * The gate, on synthetic build directories, with a fake browser. Both harnesses, READ AS TEXT: neither is executed,
 * no browser starts, and no build is made. Model names are directories in the fixtures, so opening one would throw.
 * A pass says the gate and the wiring are right. It says nothing about whether either workflow passes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EVIDENCE_CONNECT_SRC, EVIDENCE_REQUIRED_NAMES, identifyBuild, judgeBuildSeparation, requireGestureEvidenceBuild, selectGestureEvidenceBuild, snapshotEvidenceBuild, snapshotProductBuild } from "./build-separation.mjs";

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

function write({ name = "m2311-build-", worker, offscreen, content = CONTENT, connectSrc, manifest = {}, csp, models, orts = EXPECTED.ortFiles, skip = [] }) {
  const dir = mkdtempSync(join(tmpdir(), name));
  made.push(dir);
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "content-scripts"));
  const files = {
    "manifest.json": JSON.stringify({
      permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"],
      host_permissions: ["http://127.0.0.1/*"],
      name: "PratiBimb — Page Assistant (Development build)",
      action: { default_title: "PratiBimb — Page Assistant" },
      content_security_policy: { extension_pages: csp ?? policy(connectSrc) },
      content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content-scripts/content.js"] }],
      ...manifest,
    }),
    "background.js": worker,
    "content-scripts/content.js": content,
    "chunks/offscreen-abc.js": offscreen,
    "chunks/sidepanel-abc.js": 'const a="PratiBimb uses page structure to identify elements and assist with browser tasks.",p="Normal tasks do not capture browser screenshots or send page images to the reasoning model.",f="PratiBimb could not start. Close this panel and open it again.";',
  };
  for (const [path, text] of Object.entries(files)) if (!skip.includes(path)) writeFileSync(join(dir, path), text);
  // Directories, deliberately. Reading one throws EISDIR.
  for (const file of [...orts.filter((o) => o.endsWith(".wasm")), ...models]) mkdirSync(join(dir, file));
  for (const file of orts.filter((o) => !o.endsWith(".wasm"))) writeFileSync(join(dir, file), "");
  return dir;
}

const productDir = (over = {}) => write({ worker: PRODUCT_WORKER, offscreen: PRODUCT_OFFSCREEN, connectSrc: PRODUCT_CONNECT, models: [EXPECTED.tr01File], ...over, manifest: { permissions: ["offscreen", "sidePanel"], ...over.manifest } });
const evidenceDir = (over = {}) => write({ worker: EVIDENCE_WORKER, offscreen: EVIDENCE_OFFSCREEN, connectSrc: EVIDENCE_CONNECT_SRC, models: [EXPECTED.tr01File, "t1-ui-head.onnx"], ...over });
const identify = (dir) => identifyBuild(dir, EXPECTED);
const select = (dir) => selectGestureEvidenceBuild(dir, EXPECTED);

describe("identifyBuild: which build is this, from what it contains", () => {
  it("a product build is PRODUCT, and an evidence build is EVIDENCE", () => {
    expect(identify(productDir())).toMatchObject({ identity: "PRODUCT", reasons: [] });
    expect(identify(evidenceDir())).toMatchObject({ identity: "EVIDENCE", reasons: [], workerFrameRoute: false, e6Probe: false });
  });

  it("a directory's name counts for nothing, either way", () => {
    expect(identify(productDir({ name: "evidence-build-" })).identity).toBe("PRODUCT");
    expect(identify(evidenceDir({ name: "product-build-" })).identity).toBe("EVIDENCE");
  });

  it("(3) a build that is not there is MISSING, not assumed", () => {
    const empty = mkdtempSync(join(tmpdir(), "m2311-empty-"));
    made.push(empty);
    expect(identify(empty).identity).toBe("MISSING");
    expect(identify(join(empty, "nothing-here")).identity).toBe("MISSING");
    for (const path of ["manifest.json", "background.js", "content-scripts/content.js"]) {
      const found = identify(evidenceDir({ skip: [path] }));
      expect(found.identity, path).toBe("MISSING");
      expect(found.reasons, path).toEqual([`MISSING:${path}`]);
    }
  });

  it("(4) a build it cannot read is UNKNOWN", () => {
    const dir = evidenceDir();
    writeFileSync(join(dir, "manifest.json"), "{ not json");
    expect(identify(dir)).toMatchObject({ identity: "UNKNOWN", reasons: ["UNREADABLE_BUILD"] });
  });

  describe("(4) every signal must agree, or the answer is UNKNOWN", () => {
    const CASES = [
      ["the product's policy with an evidence build's hooks", { connectSrc: PRODUCT_CONNECT }, "CONNECT_SRC_IS_NOT_THE_EVIDENCE_POLICY"],
      ["the evidence policy with no hooks", { worker: PRODUCT_WORKER, offscreen: PRODUCT_OFFSCREEN }, "WORKER_LACKS:perceiveOnce"],
      ["a connect-src that is neither", { connectSrc: "'self' http://127.0.0.1:8995 https://example.com" }, "CONNECT_SRC_IS_NOT_THE_EVIDENCE_POLICY"],
      ["hooks, but T1 not packaged", { models: [EXPECTED.tr01File] }, "T1_NOT_PACKAGED"],
      ["hooks, but TR-01 not packaged", { models: ["t1-ui-head.onnx"] }, "TR01_NOT_PACKAGED"],
      ["ORT missing", { orts: ["ort-wasm-simd-threaded.jsep.wasm"] }, "ORT_FILE_MISSING:ort.all.min.js"],
      ["a wider script-src", { csp: policy(EVIDENCE_CONNECT_SRC).replace("'wasm-unsafe-eval'", "'unsafe-eval'") }, "MANIFEST:CSP_DIRECTIVE:script-src"],
      ["a permission added", { manifest: { permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture", "tabs"] } }, "MANIFEST:PERMISSIONS_CHANGED"],
      ["tabCapture removed", { manifest: { permissions: ["offscreen", "sidePanel", "activeTab"] } }, "MANIFEST:PERMISSIONS_CHANGED"],
      ["activeTab removed", { manifest: { permissions: ["offscreen", "sidePanel", "tabCapture"] } }, "EVIDENCE_LACKS_PERMISSION:activeTab"],
      ["both removed: the product's list, with an evidence build's hooks", { manifest: { permissions: ["offscreen", "sidePanel"] } }, "EVIDENCE_LACKS_PERMISSION:tabCapture"],
      ["a shared permission removed", { manifest: { permissions: ["offscreen", "activeTab", "tabCapture"] } }, "EVIDENCE_LACKS_PERMISSION:sidePanel"],
      ["another host", { manifest: { host_permissions: ["http://127.0.0.1/*", "https://example.com/*"] } }, "MANIFEST:HOST_PERMISSIONS_CHANGED"],
      ["externally_connectable", { manifest: { externally_connectable: { matches: ["http://127.0.0.1/*"] } } }, "MANIFEST:EXTERNALLY_CONNECTABLE_PRESENT"],
      ["the flag left unsubstituted", { offscreen: `${EVIDENCE_OFFSCREEN}if(__EVIDENCE_BUILD__){}` }, "EVIDENCE_FLAG_NOT_SUBSTITUTED"],
      ["<all_urls> with no worker route", { manifest: { host_permissions: ["http://127.0.0.1/*", "<all_urls>"] } }, "WORKER_FRAME_ROUTE_AND_ALL_URLS_DISAGREE"],
      ["a worker route with no <all_urls>", { worker: `${EVIDENCE_WORKER}chrome.tabs.captureVisibleTab();` }, "WORKER_FRAME_ROUTE_AND_ALL_URLS_DISAGREE"],
    ];
    for (const [label, over, reason] of CASES) {
      it(label, () => {
        const found = identify(evidenceDir(over));
        expect(found.identity).toBe("UNKNOWN");
        expect(found.reasons).toContain(reason);
      });
    }

    it("each required name, missing alone, is enough", () => {
      for (const name of EVIDENCE_REQUIRED_NAMES.worker) {
        const worker = EVIDENCE_WORKER.replace(new RegExp(`${name}(\\(\\)\\{\\},?)?`, "g"), "");
        const found = identify(evidenceDir({ worker }));
        expect(found.identity, name).toBe("UNKNOWN");
        expect(found.reasons, name).toContain(`WORKER_LACKS:${name}`);
      }
      for (const name of EVIDENCE_REQUIRED_NAMES.offscreen) {
        const found = identify(evidenceDir({ offscreen: EVIDENCE_OFFSCREEN.replaceAll(name, "x") }));
        expect(found.identity, name).toBe("UNKNOWN");
        expect(found.reasons, name).toContain(`OFFSCREEN_LACKS:${name}`);
      }
    });

    it("M23.17: a build with no hooks and the capture permissions is not a product build, and not an evidence build either", () => {
      for (const permissions of [["offscreen", "sidePanel", "activeTab", "tabCapture"], ["offscreen", "sidePanel", "tabCapture"], ["offscreen", "sidePanel", "activeTab"]]) {
        const found = identify(productDir({ manifest: { permissions } }));
        expect(found.identity, JSON.stringify(permissions)).toBe("UNKNOWN");
        expect(found.productProblems, JSON.stringify(permissions)).toContain("PERMISSIONS_CHANGED");
      }
    });

    it("M23.17: a gesture harness refuses each of those, and an evidence build with either permission missing", () => {
      expect(select(productDir({ manifest: { permissions: ["offscreen", "sidePanel", "activeTab", "tabCapture"] } })).accepted).toBe(false);
      for (const permissions of [["offscreen", "sidePanel"], ["offscreen", "sidePanel", "activeTab"], ["offscreen", "sidePanel", "tabCapture"]]) {
        expect(select(evidenceDir({ manifest: { permissions } })).accepted, JSON.stringify(permissions)).toBe(false);
      }
      expect(select(evidenceDir()).accepted).toBe(true);
    });

    it("a product build with one hook left in is not a product build, and not an evidence build either", () => {
      const found = identify(productDir({ worker: `${PRODUCT_WORKER}perceiveOnce;` }));
      expect(found.identity).toBe("UNKNOWN");
      expect(found.productProblems).toContain("DIAGNOSTIC_HOOK_IN_BUNDLE:perceiveOnce");
    });
  });
});

describe("selectGestureEvidenceBuild: the decision", () => {
  it("(1) a product build is refused, and the refusal names OD-U", () => {
    const selection = select(productDir());
    expect(selection).toMatchObject({ accepted: false, identity: "PRODUCT" });
    expect(selection.refusal).toMatch(/product build/);
    expect(selection.refusal).toMatch(/OD-U/);
  });

  it("(2) an evidence build is accepted by the selection logic. That is all this says", () => {
    expect(select(evidenceDir())).toMatchObject({ accepted: true, identity: "EVIDENCE", refusal: null });
  });

  it("(3) a missing build is refused, and offers no other", () => {
    const empty = mkdtempSync(join(tmpdir(), "m2311-empty-"));
    made.push(empty);
    const selection = select(empty);
    expect(selection).toMatchObject({ accepted: false, identity: "MISSING" });
    expect(selection.refusal).toMatch(/no fallback/);
  });

  it("(4) an unknown build is refused, with its reasons", () => {
    const selection = select(evidenceDir({ models: [EXPECTED.tr01File] }));
    expect(selection).toMatchObject({ accepted: false, identity: "UNKNOWN" });
    expect(selection.refusal).toMatch(/cannot be established/);
    expect(selection.refusal).toContain("T1_NOT_PACKAGED");
  });

  it("the degraded worker-frame evidence build is refused: as these harnesses always have", () => {
    const worker = `${EVIDENCE_WORKER}chrome.tabs.captureVisibleTab();`;
    const dir = evidenceDir({ worker, manifest: { host_permissions: ["http://127.0.0.1/*", "<all_urls>"] } });
    expect(identify(dir)).toMatchObject({ identity: "EVIDENCE", workerFrameRoute: true });
    expect(select(dir)).toMatchObject({ accepted: false, identity: "EVIDENCE" });
    expect(select(dir).refusal).toMatch(/M3_WORKER_FRAME/);
  });

  it("an E6 evidence build is refused: its content-script mechanisms consult no permit", () => {
    for (const marker of ["E6_CLICK", "E6_TYPE"]) {
      const dir = evidenceDir({ content: `${CONTENT}const k="${marker}";` });
      expect(identify(dir)).toMatchObject({ identity: "EVIDENCE", e6Probe: true });
      expect(select(dir)).toMatchObject({ accepted: false });
      expect(select(dir).refusal).toMatch(/E6_PROBE/);
    }
  });

  it("no refusal suggests a product build, which would be refused anyway", () => {
    const empty = mkdtempSync(join(tmpdir(), "m2311-empty-"));
    made.push(empty);
    for (const dir of [empty, productDir(), evidenceDir({ models: [EXPECTED.tr01File] })]) {
      expect(select(dir).refusal).not.toMatch(/npm run build/);
      expect(select(dir).refusal).toMatch(/never build/);
    }
  });
});

/** What a harness does, in its order, with a fake browser in place of Chrome and a `refuse` that exits as theirs does. */
function fakeHarnessStartup(dir) {
  class Exited extends Error {}
  const browser = { launchPersistentContext: vi.fn(), gesturePrompt: vi.fn(), fixtureServer: vi.fn() };
  const refuse = vi.fn(() => {
    throw new Exited();
  });
  try {
    requireGestureEvidenceBuild(dir, refuse, EXPECTED);
    browser.fixtureServer();
    browser.launchPersistentContext();
    browser.gesturePrompt();
  } catch (error) {
    if (!(error instanceof Exited)) throw error;
  }
  return { browser, refuse };
}

describe("(6) with a fake browser: on refusal, nothing starts", () => {
  const started = ({ browser }) => [browser.fixtureServer, browser.launchPersistentContext, browser.gesturePrompt].map((fn) => fn.mock.calls.length);

  it("a product, unknown or missing build: refused once, and no server, browser or prompt", () => {
    const empty = mkdtempSync(join(tmpdir(), "m2311-empty-"));
    made.push(empty);
    for (const dir of [productDir(), evidenceDir({ models: [EXPECTED.tr01File] }), empty]) {
      const run = fakeHarnessStartup(dir);
      expect(run.refuse).toHaveBeenCalledTimes(1);
      expect(started(run)).toEqual([0, 0, 0]);
    }
  });

  it("an evidence build: not refused, so a fake browser would start. Chrome does not, in this test", () => {
    const run = fakeHarnessStartup(evidenceDir());
    expect(run.refuse).not.toHaveBeenCalled();
    expect(started(run)).toEqual([1, 1, 1]);
  });
});

const harness = (name) => readFileSync(join(ROOT, "tests", "browser", "extension", `${name}.mjs`), "utf8").replace(/\r\n/g, "\n");
const contract = () => readFileSync(join(ROOT, "tests", "browser", "support", "build-separation.mjs"), "utf8");
const withoutComments = (code) => code.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const blockOf = (code, start) => {
  const at = code.indexOf(start);
  expect(at, start).toBeGreaterThanOrEqual(0);
  return code.slice(at, code.indexOf("\n};\n", at) + 4);
};
const sha = (text) => createHash("sha256").update(text).digest("hex");
const keysOf = (block) => [...block.matchAll(/^ {2}(\w+)[:,]/gm)].map((m) => m[1]);

/** Taken from the harnesses as they stood at `20914f1`, before this milestone touched them. */
const INVENTORY = {
  "run-gesture-capture": {
    checksSha: "ec760b7fa8e423aed926af7dec90653cf884943e5f817ce9a91fb4fa714b825a",
    checks: ["refusedBeforeTheGesture", "noGrantsBeforeTheGesture", "theBuildHasNoWorkerCapturePath", "aRealInvocationWasRecorded", "theGrantMintedAnOpaqueHandle", "theOffscreenRealmConsumedTheHandle", "aRealFrameArrivedInThePerceptionRealm", "perceptionRanOnTheStreamRoute", "theDetectorRanOnThePinnedArtifact", "fusionJoinedDomAndVision", "theWorkerCarriedTheHandle", "noPixelsAnywhereInTheWorkersRecording"],
    record: ["experiment", "status", "humanInTheLoop", "invocationMethod", "claim", "notAClaim", "build", "recordedAt", "provenance", "verdict", "failure", "failedChecks", "checks", "steps"],
    build: "build: { hostPermissions, backgroundSha256: buildHash, workerFrameEnabled: false },",
    hostCalls: ["captureState", "consumeProbe", "ensureOffscreen", "hellos", "mintStreamId", "perceiveOnce", "seen", "ticketProbe"],
    output: 'join(OUT, evidenceFileName(WS, "cft153-gesture-capture.json"))',
    prompt: "HUMAN-IN-THE-LOOP.  This step cannot be automated, by design.",
    scope: "WHAT IT RUNS ON (M23.11, OD-U). **An evidence build, and nothing else:**",
    guards: [
      'if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");',
      'if (hostPermissions.includes("<all_urls>")) {',
      'refuse("this build carries <all_urls>; rebuild WITHOUT M3_WORKER_FRAME=1 before taking gesture evidence");',
      'if (workerSource.includes("tabs.captureVisibleTab")) {',
      'if (!identity) throw new Error("the content script never attached to the fixture");',
      "if (!grant) throw new Error(`no invocation arrived within ${WAIT_MS} ms — the route cannot be verified without one`);",
      "ticket: await worker.evaluate((t) => globalThis.__host.ticketProbe(t), identity.tabId),",
      'const found = state.grants.find((g) => g.tabId === identity.tabId);',
    ],
  },
  "run-gesture-acts": {
    checksSha: "dc86b9b0ee4bb6b10db0f5e3e361d00692e97eab1d2b9b8834381582a0802575",
    checks: ["everyActWasAuthorisedByAPerson", "everyCaptureUsedTheStreamRoute", "noFrameWasEverEncoded", "successReachedTheEnd", "successWasConfirmed", "successDidNotFallBack", "successReleasedOnce", "successClickedOnce", "successRestoredTheRightValue", "successPerceivedVisually", "refusalWasRefused", "refusalBlockedAtTheLiteral", "refusalNeverAskedAHuman", "refusalReleasedNothing", "refusalClickedNothing", "refusalDidNotFallBack", "outageReachedTheEnd", "outageWasConfirmed", "outageFellBack", "outageReleasedOnce", "outageClickedOnce", "everyObservedEventIsOurs", "noValueInAnyWorkerMessage", "noPixelsInAnyWorkerMessage", "noValueInTheHandoffThatWasSent", "noPixelsInTheHandoffThatWasSent", "nothingLeakedToTheReasoner", "noPixelsInTheRunRecords", "theTextTierReportedItsAbsence"],
    record: ["experiment", "status", "humanInTheLoop", "routeCategory", "routesSeen", "invocationMethod", "claim", "notAClaim", "build", "recordedAt", "provenance", "verdict", "failure", "failedChecks", "checks", "acts", "workerTraffic"],
    build: "build: { hostPermissions, backgroundSha256: buildHash },",
    hostCalls: ["captureState", "ensureOffscreen", "grantDecide", "grantPeek", "hellos", "pageAudit", "runTask", "seen"],
    output: 'join(OUT, evidenceFileName(WS, "cft153-gesture-acts.json"))',
    prompt: "Click the extension's toolbar button on the fixture tab.",
    scope: "IT RUNS ON AN EVIDENCE BUILD AND REFUSES TO START ON ANY OTHER (M23.11, OD-U).",
    guards: [
      'if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");',
      'if (hostPermissions.includes("<all_urls>")) refuse("this build carries <all_urls>; rebuild WITHOUT M3_WORKER_FRAME=1");',
      'if (workerSource.includes("tabs.captureVisibleTab")) refuse("this build contains captureVisibleTab; it is the degraded build");',
      "if (state.grants.length > before && state.grants.some((g) => g.tabId === identity.tabId)) {",
      "throw new Error(`${act}: no invocation arrived within ${WAIT_MS} ms`);",
      'throw new Error("the service worker never recorded an attested content script");',
      'const routeCategory = routesSeen.length > 0 && routesSeen.every((r) => r === "GESTURE_STREAM") ? "REAL_GESTURE_STREAM" : "MIXED_OR_DEGRADED";',
      "await page.reload({ waitUntil: \"load\" });",
    ],
  },
};

for (const [name, inventory] of Object.entries(INVENTORY)) {
  describe(`${name}, read as text`, () => {
    const code = harness(name);
    const live = withoutComments(code);

    it("(1, 6) the gate runs first: unconditionally, before Playwright, a server, Chrome or a prompt", () => {
      expect(code).toMatch(/^requireGestureEvidenceBuild\(EXT, refuse\);$/m);
      const gate = code.indexOf("\nrequireGestureEvidenceBuild(EXT, refuse);");
      for (const later of ['require2("playwright")', "process.env.CHROME_PATH", "startDemoServer(8975)", "chromium.launchPersistentContext(", inventory.prompt, "const manifest = JSON.parse"]) {
        expect(code.indexOf(later), later).toBeGreaterThan(gate);
      }
      // Between `refuse` being defined and the gate, the source does nothing else.
      const between = withoutComments(code.slice(code.indexOf("const refuse ="), gate));
      expect(between.replace(/\s+/g, " ").trim()).toBe('const refuse = (message) => { console.error(`REFUSING: ${message}`); process.exit(2); };');
    });

    it("(5) it cannot build: no child process, and no build command it could run", () => {
      expect(live).not.toMatch(/child_process|execSync|spawn|npm run build/);
    });

    it("(3) it looks in one place, has no other build to reach for, and tells nobody to make a product build", () => {
      expect(live.match(/\.output/g)).toHaveLength(1);
      expect(live.match(/--load-extension=\$\{EXT\}/g)).toHaveLength(1);
      expect(code).not.toContain("(run: npm run build -w @pratibimb/extension)");
    });

    it("no environment variable or argument can skip the gate", () => {
      expect(withoutComments(contract())).not.toMatch(/process\.env|process\.argv/);
      // The one variable read before the gate is how long to wait for a person.
      const beforeTheGate = code.slice(0, code.indexOf("\nrequireGestureEvidenceBuild(EXT, refuse);"));
      expect((beforeTheGate.match(/process\.(env|argv)[.\w]*/g) ?? []).length).toBe(1);
      expect(beforeTheGate).toMatch(/process\.env\.M[45]_GESTURE_WAIT_MS/);
      expect(code.match(/GESTURE_GATE|SKIP_GATE/g)).toBeNull();
    });

    it("(7) every check is present, unchanged to the byte, as it stood before this milestone", () => {
      const checks = blockOf(code, "const checks = {");
      expect(keysOf(checks)).toEqual(inventory.checks);
      expect(sha(checks)).toBe(inventory.checksSha);
    });

    it("(7) a failed check still fails the run: the verdict is computed from all of them, as before", () => {
      expect(code).toContain("const failed = Object.entries(checks).filter(([, v]) => v !== true).map(([k]) => k);");
      expect(code).toContain("const passed = failure === null && failed.length === 0;");
      expect(code).toContain("process.exit(passed ? 0 : 1);");
      expect(code).toContain('verdict: passed ? "PASS" : "FAIL",');
    });

    it("(8) the record's fields, its build entry and its file are what they were", () => {
      expect(keysOf(blockOf(code, "const record = {"))).toEqual(inventory.record);
      expect(code).toContain(inventory.build);
      expect(code).toContain(inventory.output);
      expect(code).toContain("assertOwnEvidencePath(file, WS);");
    });

    it("(9) the grant and capture checks that run before and around the click are all still there", () => {
      for (const guard of inventory.guards) expect(code, guard).toContain(guard);
    });

    it("it still calls the same control-plane members: no more, no fewer", () => {
      expect([...new Set([...live.matchAll(/__host\.(\w+)/g)].map((m) => m[1]))].sort()).toEqual(inventory.hostCalls);
    });

    it("(10) the build's identity is decided by the shared contract alone, with no definition of its own", () => {
      expect(code).toContain('import { requireGestureEvidenceBuild } from "../support/build-separation.mjs";');
      expect(live).not.toMatch(/connect-src|connectSrc|t1-ui-head|EVIDENCE_REQUIRED_NAMES|identifyBuild|EVIDENCE_CONNECT_SRC/);
    });

    it("(11) it treats no worker difference as a failure: the worker's hash is recorded and not compared", () => {
      expect(live).not.toMatch(/judgeBuildSeparation|routeIdenticalToProduct|productRoute|evidenceRoute/);
      expect(live.match(/buildHash/g)).toHaveLength(2); // its definition, and the record's `build`
    });

    it("its description and its record no longer present this as the product's workflow", () => {
      expect(code).toContain(inventory.scope);
      expect(code).not.toMatch(/WHAT IT RUNS ON\. The \*\*product build\*\*|IT RUNS ON THE PRODUCT BUILD|the complete product loop|not the product one/);
      expect(code).toMatch(/measured on an evidence build; a DOM-only product/);
    });
  });
}

describe("(10) one definition of the two builds", () => {
  it("what the separation contract accepts as a product and an evidence build is what identity calls them", () => {
    const product = productDir();
    const evidence = evidenceDir();
    expect(identify(product).identity).toBe("PRODUCT");
    expect(identify(evidence).identity).toBe("EVIDENCE");
    const verdict = judgeBuildSeparation({ product: snapshotProductBuild(product, EXPECTED), reference: snapshotEvidenceBuild(evidence), evidence: snapshotEvidenceBuild(evidence) });
    expect(verdict.problems).toEqual([]);
  });

  it("and what it refuses as a product, identity will not call a product", () => {
    const leaky = productDir({ offscreen: `${PRODUCT_OFFSCREEN}"STREAM_CONSUME";` });
    expect(snapshotProductBuild(leaky, EXPECTED).boundaryProblems).not.toEqual([]);
    expect(identify(leaky).identity).not.toBe("PRODUCT");
  });

  it("identity reads the required names from the contract's own list", () => {
    expect(contract()).toMatch(/for \(const name of EVIDENCE_REQUIRED_NAMES\.worker\) if \(!seen\.workerNames\.includes\(name\)\) reasons\.push/);
  });
});

describe("(11) worker differences are not integrity failures, for this gate", () => {
  it("an evidence build is accepted whatever its worker's bytes, as long as it keeps its hooks", () => {
    expect(select(evidenceDir({ worker: `${EVIDENCE_WORKER}/* one */` })).accepted).toBe(true);
    expect(select(evidenceDir({ worker: `${EVIDENCE_WORKER}/* two */` })).accepted).toBe(true);
  });
});

describe("(12) the six OD-V harnesses are not affected", () => {
  const SIX = ["run-gesture-redaction", "run-webp-loopback", "run-artifact-verifier", "run-capture-determinism", "run-stream-j7", "run-stream-re1"];

  it("they keep their own contract and do not take this gate: they build what they compare", () => {
    for (const name of SIX) {
      const code = harness(name);
      expect(code, name).not.toContain("requireGestureEvidenceBuild");
      expect(code, name).toMatch(/judgeBuildSeparation\(\{ product: productBuild, reference: referenceBuild, evidence: evidenceBuild, dryRun: (DRY|false) \}\)/);
      expect(code, name).toMatch(/^if \(separation\.problems\.length > 0\) refuse\(/m);
    }
  });

  it("nor does any other harness", () => {
    for (const name of ["run-csp-negative", "run-extension-loop", "run-detector-eval", "run-product-smoke", "run-product-benchmark", "run-sidepanel-smoke"]) {
      expect(harness(name), name).not.toContain("requireGestureEvidenceBuild");
    }
  });
});
