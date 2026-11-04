/**
 * M23.8 — `PERCEIVE_ONCE` AND `STREAM_CONSUME`: WHO CAN REACH THEM, AND WHAT THEY DO WHEN REACHED.
 *
 * A comment calling these "test only" is not a boundary. So this runs the real handlers through the real
 * listeners, with a sender chosen for each case, and records what happens. Several of these tests pin
 * a finding rather than a virtue: the hooks are shipped in the product bundle, and they accept any
 * context of this extension. They are pinned so that OD-S (keep, move to evidence builds, or remove)
 * shows up here as a deliberate change whichever way the owner decides. Nothing here changes a hook.
 *
 * Fakes and synthetic frames only: `support/simulatedExtension.ts`. What Chrome itself would deliver,
 * or whether it would honour a stream id, is NOT established here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ortSmokeCheck } from "../../../tests/browser/support/csp-product-phase.mjs";
import { bootSimulatedExtension, FRAME_ID, NO_VISUAL_ACTIVITY, SENDERS, TAB_ID, taskRequest, type Rig, type RigOptions } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");
const withoutComments = (code: string): string => code.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");

const sources = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(join(APP, dir))) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(APP, relative)).isDirectory()) sources(relative, out);
    else if (entry.endsWith(".ts")) out.push(relative);
  }
  return out;
};
/** Everything that can be in a product bundle. The probes are resolved away by `wxt.config.ts`. */
const PRODUCT_SOURCES = [...sources("host"), ...sources("host-lib"), ...sources("entrypoints")];

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
});
const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, ...options });
  return rig;
};

const PERCEIVE_ONCE = { kind: "PERCEIVE_ONCE", tabId: TAB_ID, frameId: FRAME_ID };
const STREAM_CONSUME = { kind: "STREAM_CONSUME", streamId: "a-stream-id-nobody-minted" };

/** No image can be in a reply this size, and none of an image's usual shapes is. */
const expectNoPixels = (reply: unknown): void => {
  const text = JSON.stringify(reply);
  expect(text.length).toBeLessThan(10_000);
  expect(text).not.toMatch(/data:image|iVBORw0KGgo|UklGR|"rgba"|"pixels"|"bitmap"|[A-Za-z0-9+/]{200,}/);
};

describe("who can reach them", () => {
  it("a sender from another extension is refused before either handler runs", async () => {
    const r = await boot();
    expect(await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(await r.sendToOffscreen(STREAM_CONSUME, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("FINDING: a content-script context of this extension IS accepted, unlike RUN_TASK, which refuses it", async () => {
    const r = await boot();
    expect(await r.sendToOffscreen({ kind: "RUN_TASK", request: taskRequest() }, SENDERS.contentScript)).toEqual({ refused: "RUN_ONLY_FROM_SERVICE_WORKER" });

    const reply = (await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.contentScript)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT"); // the handler ran; the capture authority said no
    expect(r.visualActivity().captureRequests).toBe(1);

    const stream = (await r.sendToOffscreen(STREAM_CONSUME, SENDERS.contentScript)) as { ok?: boolean };
    expect(stream.ok).toBe(true);
    expect(r.visualActivity().getUserMedia).toBe(1);
  });

  it("FINDING: the side panel's context is accepted too, though no panel code sends either", async () => {
    const r = await boot();
    const reply = (await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.sidePanel)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT");
  });

  it("the capture route itself is narrower: only the offscreen document may ask the worker for a frame", async () => {
    const r = await boot();
    r.clickToolbar();
    for (const sender of [SENDERS.contentScript, SENDERS.sidePanel, SENDERS.otherExtension, SENDERS.worker]) {
      expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, sender)).toEqual({ ok: false, refused: "SENDER_NOT_ACCEPTED" });
    }
    expect(r.visualActivity().mintedStreamIds).toBe(0);
  });

  it("in source, only the worker's `__host` control plane sends either kind", () => {
    const senders = PRODUCT_SOURCES.filter((file) => /kind:\s*"(PERCEIVE_ONCE|STREAM_CONSUME)"/.test(withoutComments(read(file))));
    // offscreen/main.ts names them in its message type; background.ts is the only one to send them.
    expect(senders.sort()).toEqual(["host/background.ts", "host/offscreen/main.ts"]);
    const main = withoutComments(read("host/offscreen/main.ts"));
    expect(main).not.toMatch(/sendMessage\([^)]*kind:\s*"(PERCEIVE_ONCE|STREAM_CONSUME)"/);
    const background = withoutComments(read("host/background.ts"));
    expect(background).toMatch(/consumeProbe: async \(\) => \{/);
    expect(background).toMatch(/perceiveOnce: async \(tabId: number, frameId: number\) => \{/);
    // `toOffscreen` forwards any message, so it reaches both as well.
    expect(background).toMatch(/toOffscreen: async \(msg: object\) => \{/);
  });

  it("`__host` is a global on the worker alone, and no extension page or content script touches it", () => {
    const users = PRODUCT_SOURCES.filter((file) => /__host\b/.test(withoutComments(read(file))));
    expect(users).toEqual(["host/background.ts"]);
    expect(withoutComments(read("host/background.ts"))).toMatch(/\(globalThis as Record<string, unknown>\)\.__host = \{/);
  });

  it("a page has no channel to any of this: no external listener, no page message listener, in any product source", () => {
    for (const file of PRODUCT_SOURCES) {
      const code = withoutComments(read(file));
      expect(code, file).not.toMatch(/onMessageExternal|onConnectExternal/);
      expect(code, file).not.toMatch(/window\.addEventListener|addEventListener\(\s*"message"|window\.postMessage/);
    }
  });

  it("the content script sends three kinds, and neither hook is among them", () => {
    const content = withoutComments(read("host/content.ts"));
    expect([...content.matchAll(/sendMessage\(\{[^}]*?kind:\s*"([A-Z_]+)"/g)].map((m) => m[1]).sort()).toEqual(["BOUNDARY_COLLECT", "HELLO", "RELAY_ECHO"]);
    expect(content).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME/);
    // It takes commands from this extension's own non-tab contexts, and forwards none of what a page does.
    expect(content).toMatch(/if \(sender\.id !== chrome\.runtime\.id \|\| sender\.tab\) \{/);
    expect(read("wxt.config.ts")).not.toMatch(/externally_connectable|web_accessible_resources/);
  });

  it("the side panel sends neither", () => {
    expect(withoutComments(read("host/sidepanel/main.ts"))).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME|perceiveOnce|consumeProbe|__host/);
  });
});

describe("an ordinary task reaches neither", () => {
  it("a whole task sends neither kind, and no perception realm exists afterwards", async () => {
    const r = await boot({ model: () => [{ op: "click", target: "#submit" }] });
    r.clickToolbar();
    const reply = await r.run(taskRequest());
    expect(reply.ok).toBe(true);
    expect(r.messages).not.toContain("PERCEIVE_ONCE");
    expect(r.messages).not.toContain("STREAM_CONSUME");
    expect(reply.result?.perceptionBoot).toBeNull();
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("in source, the hooks are not in the task's path", () => {
    for (const file of ["host-lib/extension-run.ts", "host-lib/extension-ports.ts", "host-lib/task-desk.ts", "host-lib/task-perception.ts"]) {
      expect(withoutComments(read(file)), file).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME|perceiveTab/);
    }
    const main = withoutComments(read("host/offscreen/main.ts"));
    const runTask = main.slice(main.indexOf("async function runTask("), main.indexOf("installTransportControlPlane();"));
    expect(runTask).not.toMatch(/perceiveTab|STREAM_CONSUME|PERCEIVE_ONCE/);
  });
});

describe("PERCEIVE_ONCE, in a product build", () => {
  it("with no grant: one capture request, refused. No frame, no T1, no TR-01. ORT is still brought up", async () => {
    const r = await boot();
    const reply = (await r.host.perceiveOnce(TAB_ID, FRAME_ID)) as { refused?: { code?: string }; route?: unknown };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT");
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, captureRequests: 1, ortBootstraps: 1 });
    expectNoPixels(reply);
  });

  it("with a grant: it DOES capture and decode a frame and start TR-01. T1 stays out", async () => {
    const r = await boot();
    r.clickToolbar();
    const reply = await r.host.perceiveOnce(TAB_ID, FRAME_ID);
    const activity = r.visualActivity();
    expect(activity).toEqual({
      ...NO_VISUAL_ACTIVITY,
      captureRequests: 1,
      mintedStreamIds: 1,
      getUserMedia: 1,
      grabFrame: 1,
      canvases: 1,
      ortBootstraps: 1,
      tr01Workers: 1,
      tr01Inits: 1,
      tr01Frames: 1,
    });
    expect(activity.t1Fetches).toBe(0);
    expect(activity.inferenceSessions).toBe(0);
    expect(activity.inferences).toBe(0);
    expect(r.released).toEqual({ tracks: 1, bitmaps: 1 });
    expect(reply).toMatchObject({ route: "GESTURE_STREAM", refused: null, byClass: {}, detections: [], anchors: 0 });
  });

  it("returns codes, counts, timings and geometry: an exact list of fields, and no pixel", async () => {
    const r = await boot();
    r.clickToolbar();
    const reply = (await r.host.perceiveOnce(TAB_ID, FRAME_ID)) as Record<string, unknown>;
    expect(Object.keys(reply).sort()).toEqual(["accounting", "afterFiltering", "anchors", "byClass", "capture", "detections", "fusion", "ms", "redaction", "refused", "route", "threshold", "viewport"]);
    expectNoPixels(reply);
    // The frame's size is reported as a number. The frame is not.
    expect(reply.capture).toMatchObject({ w: 1024, h: 768, format: "live-bitmap", bytes: 1024 * 768 * 4 });
  });

  it("if TR-01 cannot start, the pass reports it and the frame is still masked fail-closed", async () => {
    const r = await boot({ tr01: "INIT_FAILED" });
    r.clickToolbar();
    const reply = (await r.host.perceiveOnce(TAB_ID, FRAME_ID)) as { redaction: { outcome: string; failClosed: boolean | null; detector: { ran: boolean; code: string | null }; frameKept: boolean } };
    expect(reply.redaction.detector.ran).toBe(false);
    expect(reply.redaction.detector.code).toBe("DETECTOR_UNAVAILABLE");
    expect(reply.redaction.outcome).toBe("SANITIZED");
    expect(reply.redaction.failClosed).toBe(true);
    expectNoPixels(reply);
  });
});

describe("PERCEIVE_ONCE, with the evidence flag: the wiring evidence runs depend on", () => {
  it("loads and runs T1, with a grant, against a synthetic frame and a fake session", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    const reply = await r.host.perceiveOnce(TAB_ID, FRAME_ID);
    const activity = r.visualActivity();
    expect(activity.t1Fetches).toBe(1);
    expect(activity.inferenceSessions).toBe(1);
    expect(activity.inferences).toBe(1);
    expect(activity.tr01Frames).toBe(1);
    expectNoPixels(reply);
  });
});

describe("STREAM_CONSUME, in a product build", () => {
  it("the control plane's probe says NO_GRANT when no person has invoked the extension", async () => {
    const r = await boot();
    expect(await r.host.consumeProbe()).toMatchObject({ ok: false, error: "NO_GRANT" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("with a grant: one frame, reported as dimensions and timings; released; no T1, no TR-01", async () => {
    const r = await boot();
    r.clickToolbar();
    const reply = (await r.host.consumeProbe()) as Record<string, unknown>;
    expect(Object.keys(reply).sort()).toEqual(["h", "ms", "ok", "settings", "w"]);
    expect(reply).toMatchObject({ ok: true, w: 1024, h: 768 });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, mintedStreamIds: 1, getUserMedia: 1, grabFrame: 1 });
    expect(r.released).toEqual({ tracks: 1, bitmaps: 1 });
    expectNoPixels(reply);
  });

  it("FINDING: the handler checks no grant of its own. Whatever id it is given goes to getUserMedia", async () => {
    const r = await boot();
    const reply = (await r.sendToOffscreen(STREAM_CONSUME, SENDERS.worker)) as { ok?: boolean };
    expect(reply.ok).toBe(true); // a fake `getUserMedia` accepts anything. Whether Chrome would is not tested here
    expect(r.mediaSourceIds).toEqual(["a-stream-id-nobody-minted"]);
    expect(r.host.captureState().grants).toEqual([]);
  });
});

describe("ORT_SMOKE: the M13 harness's positive control, against the real handler and the extracted check", () => {
  it("product build: the runtime comes up, T1 is reported absent, and the harness's check passes", async () => {
    const r = await boot();
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(reply).toMatchObject({ ok: false, stage: "UI_HEAD_NOT_IN_PRODUCT_BUILD", ortBootstrapped: true });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: true });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, ortBootstraps: 1 });
  });

  it("evidence build: the model loads and runs (fake session, synthetic bytes), and M13's original check passes", async () => {
    const r = await boot({ evidenceBuild: true });
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(reply).toMatchObject({ ok: true, modelBytes: 3 });
    expect(ortSmokeCheck("evidence", reply)).toEqual({ ortAndModelLoad: true });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: false });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, ortBootstraps: 1, t1Fetches: 1, inferenceSessions: 1, inferences: 1 });
  });

  it("a regression that loads T1 in a product build fails the product check", async () => {
    const r = await boot({ reintroducePerceptionInProductTasks: true });
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: false });
  });
});

describe("what ships: both hooks are in every build today", () => {
  it("neither handler nor the control plane is behind a build flag", () => {
    const main = read("host/offscreen/main.ts");
    expect(main).toMatch(/if \(msg\.kind === "PERCEIVE_ONCE"\) \{/);
    expect(main).toMatch(/if \(msg\.kind === "STREAM_CONSUME"\) \{/);
    for (const hook of ["PERCEIVE_ONCE", "STREAM_CONSUME"]) {
      const at = main.indexOf(`if (msg.kind === "${hook}") {`);
      expect(main.slice(Math.max(0, at - 200), at + 200), hook).not.toMatch(/__EVIDENCE_BUILD__|__M3_WORKER_FRAME__/);
    }
    expect(read("wxt.config.ts")).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME|perceiveOnce|consumeProbe/);
  });
});
