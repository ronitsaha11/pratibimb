/**
 * M23.7 — the DOM-only Phase 1 (OD-P, OD-R), held in place.
 *
 * A product task captures no frame, loads and runs no UI head (T1), and starts no TR-01; an evidence
 * build keeps all three. The policy is a function (`task-perception.ts`) so it is tested as
 * behaviour; the wiring that applies it lives in `host/offscreen/main.ts` and `wxt.config.ts`, which
 * run only in a browser or a build, so their wiring is pinned by reading the source, the way
 * `visualBoundary.test.ts` and `networkBoundary.test.ts` pin theirs. The handoff a DOM-only task
 * produces is exercised for real through `buildHandoffDraft`.
 *
 * No model file is read, no frame is decoded, no browser is started.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildHandoffDraft, type HandoffParts } from "@pratibimb/privacy";

import { loadsUiHead, taskPerception } from "../host-lib/task-perception";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");
// Comments that START a line only: a `/*` inside a string (`"http://127.0.0.1/*"`) is not a comment.
const withoutComments = (code: string): string =>
  code.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

/** The body of a top-level `function name(` or `async function name(`, up to its closing brace at column 0. */
function bodyOf(code: string, name: string): string {
  const start = code.search(new RegExp(`(?:async )?function ${name}\\(`));
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = code.indexOf("\n}\n", start);
  expect(end, `${name} has a closing brace`).toBeGreaterThan(start);
  return code.slice(start, end);
}

const main = withoutComments(read("host/offscreen/main.ts"));
const config = withoutComments(read("wxt.config.ts"));

describe("the task-perception policy", () => {
  it("a product build's task gets no perception port at all", () => {
    const perceive = vi.fn();
    const deps = { relay: "relay", ...taskPerception(false, perceive) };
    expect(deps).not.toHaveProperty("perceive");
    expect(taskPerception(false, perceive)).toEqual({});
    expect(perceive).not.toHaveBeenCalled();
  });

  it("an evidence build's task keeps exactly the port it was given", () => {
    const perceive = vi.fn();
    expect(taskPerception(true, perceive).perceive).toBe(perceive);
    expect(perceive).not.toHaveBeenCalled();
  });

  it("only an evidence build may load the UI head", () => {
    expect(loadsUiHead(false)).toBe(false);
    expect(loadsUiHead(true)).toBe(true);
  });
});

describe("A — a product task captures no frame", () => {
  const runTask = bodyOf(main, "runTask");

  it("the task's perception port is passed only through the policy, under the build's evidence flag", () => {
    // M23.9: the flag also sits in place, so a product bundler drops the closure and the realm behind it.
    expect(runTask).toMatch(/\.\.\.\(__EVIDENCE_BUILD__\s+\? taskPerception<NonNullable<ExtensionRunDeps\["perceive"\]>>\(__EVIDENCE_BUILD__,[\s\S]*?\)\s+: \{\}\),/);
    // No unguarded `perceive:` key remains in the task's dependencies.
    expect(runTask).not.toMatch(/^\s*perceive\s*:/m);
  });

  it("the only route from a task to the perception realm is inside that policy call", () => {
    const calls = runTask.match(/ensurePerception\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const guarded = runTask.slice(runTask.indexOf("? taskPerception<"));
    expect(guarded.indexOf("ensurePerception(")).toBeGreaterThan(0);
    expect(guarded.indexOf("ensurePerception(")).toBeLessThan(guarded.indexOf("perceptionBoot:"));
  });

  it("the task run and its ports name no capture API: capture is reachable only through the perception port", () => {
    for (const file of ["host-lib/extension-run.ts", "host-lib/extension-ports.ts", "host-lib/task-perception.ts"]) {
      const code = withoutComments(read(file));
      expect(code, file).not.toMatch(/getUserMedia|grabFrame|ImageCapture|captureVisibleTab|getMediaStreamId|CAPTURE_FRAME|createImageBitmap/);
    }
    // The ports take a perception pass only when they were given the port.
    expect(withoutComments(read("host-lib/extension-ports.ts"))).toMatch(/if \(options\.perceive\) \{/);
    expect(withoutComments(read("host-lib/extension-run.ts"))).toMatch(/\.\.\.\(deps\.perceive\s*\?/);
  });

  it("with no perception pass the run declares nothing visual", () => {
    const run = withoutComments(read("host-lib/extension-run.ts"));
    expect(run).toMatch(/if \(seen === null \|\| !seen\.ran \|\| !seen\.detector\.ran \|\| seen\.capture === null\) return null;/);
  });
});

describe("B — the UI head (T1) is not loaded, run or packaged in a product build", () => {
  it("the realm refuses to fetch it before the fetch, so the detector reports MODEL_ASSET_UNAVAILABLE", () => {
    const realm = bodyOf(main, "ensurePerception");
    const guard = realm.indexOf("if (!loadsUiHead(__EVIDENCE_BUILD__)) throw");
    const fetchAt = realm.indexOf('fetch(resolvePackagedAsset("t1-ui-head.onnx"))');
    expect(guard).toBeGreaterThan(0);
    expect(fetchAt).toBeGreaterThan(guard);
    // A failed load leaves no session, which is the existing refusal path.
    expect(realm).toMatch(/session = null;/);
  });

  it("the ORT smoke stops at the runtime in a product build and says why", () => {
    const smoke = bodyOf(main, "ortSmoke");
    const guard = smoke.indexOf("if (!loadsUiHead(__EVIDENCE_BUILD__))");
    expect(guard).toBeGreaterThan(smoke.indexOf("bootstrapOrtRealm("));
    expect(smoke.indexOf('fetch(resolvePackagedAsset("t1-ui-head.onnx"))')).toBeGreaterThan(guard);
    expect(smoke).toContain('stage: "UI_HEAD_NOT_IN_PRODUCT_BUILD"');
  });

  it("the build packages the UI head only under EVIDENCE_BUILD, and substitutes the flag", () => {
    expect(config).toMatch(
      /if \(EVIDENCE_BUILD\) \{\s*if \(!existsSync\(MODEL\)\) throw new Error\(`missing \$\{MODEL\}`\);\s*assets\.push\(\{ absoluteSrc: MODEL, relativeDest: "t1-ui-head\.onnx" \}\);\s*\}/
    );
    expect(config.match(/relativeDest: "t1-ui-head\.onnx"/g)).toHaveLength(1);
    expect(config).toContain("__EVIDENCE_BUILD__: JSON.stringify(EVIDENCE_BUILD)");
    expect(config).toContain("const EVIDENCE_BUILD = E6_PROBE || STRUCTURAL_PROBE || TR01_PROBE || EGRESS_EVIDENCE_PROBE || WORKER_FRAME;");
  });
});

describe("C — TR-01 is not started by a product task, and is otherwise unchanged", () => {
  it("TR-01 is reachable only from the perception realm, which a product task never builds", () => {
    expect(main.match(/createTr01Host\(/g)).toHaveLength(1);
    expect(main).toMatch(/textRegions:\s*\{\s*detect:\s*\(frame, options\)\s*=>\s*textRegionHost\(\)\.detect\(frame, options\)\s*\}/);
    expect(bodyOf(main, "ensurePerception")).toContain("createPerceptionRealm(");
  });

  it("TR-01 is still packaged and hash-checked in every build", () => {
    const hook = config.slice(config.indexOf('"build:publicAssets"'));
    const evidenceBlock = /if \(EVIDENCE_BUILD\) \{[\s\S]*?relativeDest: "t1-ui-head\.onnx" \}\);\s*\}/.exec(hook);
    expect(evidenceBlock).not.toBeNull();
    expect(evidenceBlock![0]).not.toMatch(/TR01/);
    // TR-01's packaging comes after the evidence-only block, outside it.
    expect(hook.indexOf("absoluteSrc: TR01_MODEL")).toBeGreaterThan(evidenceBlock!.index + evidenceBlock![0].length);
    expect(hook).toContain("TR01_PACKAGE.onnx.sha256");
    expect(hook).toContain("assets.push({ absoluteSrc: TR01_MODEL, relativeDest: TR01_PACKAGE.onnx.name });");
    expect(read("host/tr01-worker.ts")).toMatch(/loadVerifiedModel\(\{ pin: TR01_PACKAGE\.onnx/);
  });
});

describe("D — evidence-build functionality and permissions are unchanged", () => {
  it("the evidence aliases still select the real probes", () => {
    expect(config).toContain('"#tr01-probe": TR01_PROBE ? "probe/tr01.ts" : "probe/tr01-absent.ts",');
    expect(config).toContain('"#tr01-instrument": TR01_PROBE ? "probe/tr01-instrument.ts" : "probe/tr01-instrument-absent.ts",');
    expect(config).toContain('"#structural-probe": STRUCTURAL_PROBE ? "probe/structural.ts" : "probe/structural-absent.ts",');
    expect(config).toContain('"#egress-evidence-probe": EGRESS_EVIDENCE_PROBE ? "probe/egress-evidence.ts" : "probe/egress-evidence-absent.ts",');
  });

  it("the masked-frame readers and the worker-frame route are still wired for evidence builds", () => {
    expect(main).toContain("sanitizedFrame: () => perceptionRealm?.sanitizedFrame() ?? null,");
    expect(main).toMatch(/encodeSanitized: \(\) => perceptionRealm\?\.encodeSanitized\(\)/);
    expect(withoutComments(read("probe/tr01.ts"))).toMatch(/export function serveTr01Probe/);
    expect(withoutComments(read("host/background.ts"))).toMatch(/__M3_WORKER_FRAME__[\s\S]{0,200}chrome\.tabs\.captureVisibleTab/);
    expect(main).toMatch(/kind === "PERCEIVE_ONCE"/);
    expect(main).toMatch(/kind === "STREAM_CONSUME"/);
  });

  it("M23.17: a product's permissions are the two it uses, an evidence build adds the two its capture route needs, and hosts are as before", () => {
    expect(config).toContain('const PRODUCT_PERMISSIONS = ["offscreen", "sidePanel"];');
    expect(config).toContain('const EVIDENCE_ONLY_PERMISSIONS = ["activeTab", "tabCapture"];');
    expect(config).toContain("permissions: EVIDENCE_BUILD ? [...PRODUCT_PERMISSIONS, ...EVIDENCE_ONLY_PERMISSIONS] : PRODUCT_PERMISSIONS,");
    expect(config).toContain('const HOST_PERMISSIONS = WORKER_FRAME ? ["http://127.0.0.1/*", "<all_urls>"] : ["http://127.0.0.1/*"];');
  });
});

describe("E — the handoff a DOM-only task produces", () => {
  const parts: HandoffParts = {
    redactions: [],
    elements: [
      { id: "#name", role: "textbox", name: "Full name", bbox: [10, 10, 200, 24], source: "dom", visible: true, offscreen: false, enabled: true },
      { id: "#go", role: "button", name: "Submit", bbox: [10, 60, 80, 24], source: "dom", visible: true, offscreen: false, enabled: true },
      { id: "#later", role: "button", name: "Later", source: "dom", visible: false, offscreen: true, enabled: false },
    ],
  };
  const ctx = {
    sessionId: "s-1",
    requestId: "r-1",
    origin: "http://127.0.0.1:8000",
    viewport: { w: 1280, h: 720, dpr: 1, zoom: 1, scrollX: 0, scrollY: 0 },
    now: 1,
  };

  it("declares the structural floor and claims no detector tier", () => {
    const draft = buildHandoffDraft(parts, "submit the form", ctx);
    expect(draft.capability).toEqual({ backend: "none", tiers_fired: ["T0", "T2"] });
    expect(draft.capability.tiers_fired).not.toContain("T1");
    expect(draft.capture.scale_to_css).toBe(1);
  });

  it("keeps every DOM element, its id, role, name, state and source, and nothing else", () => {
    const draft = buildHandoffDraft(parts, "submit the form", ctx);
    expect(draft.elements).toEqual(parts.elements);
    expect(draft.elements.every((e) => e.source === "dom")).toBe(true);
    expect(draft.elements.find((e) => e.id === "#later")).toMatchObject({ enabled: false, offscreen: true });
    expect(draft.elements.find((e) => e.id === "#later")).not.toHaveProperty("bbox");
  });

  it("a provenance map cannot add an element: an id the DOM does not have is ignored", () => {
    const draft = buildHandoffDraft(parts, "submit the form", { ...ctx, sourceById: { "vision:7": "vision", "#go": "dom+vision" } });
    expect(draft.elements.map((e) => e.id)).toEqual(["#name", "#go", "#later"]);
    expect(draft.elements.find((e) => e.id === "#go")?.source).toBe("dom+vision");
  });
});
