/**
 * M23.9 (OD-S, Option B) — `PERCEIVE_ONCE` AND `STREAM_CONSUME` EXIST ONLY IN AN EVIDENCE BUILD.
 *
 * M23.8 pinned what these hooks did in every build, so that the owner's decision would show up here as a
 * deliberate change. It has. This file now holds both sides of that decision:
 *
 *   - A PRODUCT BUILD HAS NEITHER. Not refused: absent. A hook's kind is answered exactly as a kind nobody
 *     ever defined, its drivers are not on the control plane, and asking for one starts nothing.
 *   - AN EVIDENCE BUILD KEEPS BOTH, with the code, the authority and the replies they had. Nothing here
 *     builds one: the flag is the value `wxt.config.ts` would substitute, and every capture, worker and
 *     model API is a counted fake (`support/simulatedExtension.ts`). No frame is taken and no model is read.
 *
 * The real product bundle is checked twice elsewhere: in memory on every run (`buildSeparation.test.ts`), and
 * for an actual `wxt build` by `tests/browser/extension/inspect-product-build.mjs`. A flag read at run time, as
 * here, cannot show what a bundler leaves out.
 *
 * What Chrome itself would deliver, or whether it would honour a stream id, is NOT established here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ortSmokeCheck } from "../../../tests/browser/support/csp-product-phase.mjs";
import { bootSimulatedExtension, driversOf, FRAME_ID, NO_VISUAL_ACTIVITY, SENDERS, TAB_ID, taskRequest, type Rig, type RigOptions } from "./support/simulatedExtension";

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
const bootProduct = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, ...options });
  return rig;
};
const bootEvidence = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: true, ...options });
  return rig;
};

const PERCEIVE_ONCE = { kind: "PERCEIVE_ONCE", tabId: TAB_ID, frameId: FRAME_ID };
const STREAM_CONSUME = { kind: "STREAM_CONSUME", streamId: "a-stream-id-nobody-minted" };

/** The control plane a product build has. Named in full, so a new member has to be looked at. */
const PRODUCT_CONTROL_PLANE = [
  "activeTabGrants",
  "armBoundaryCapability",
  "bootId",
  "bootedAt",
  "captureState",
  "captureStatus",
  "e6Arm",
  "ensureOffscreen",
  "forgetSeen",
  "grantDecide",
  "grantPeek",
  "hellos",
  "noteGrant",
  "offscreenContexts",
  "pageAudit",
  "presentCapability",
  "routeSurface",
  "runTask",
  "seen",
  "toOffscreen",
  "toTab",
  "transportConnections",
];
const EVIDENCE_ONLY_DRIVERS = ["consumeProbe", "mintStreamId", "perceiveOnce", "ticketProbe"];

/** No image can be in a reply this size, and none of an image's usual shapes is. */
const expectNoPixels = (reply: unknown): void => {
  const text = JSON.stringify(reply);
  expect(text.length).toBeLessThan(10_000);
  expect(text).not.toMatch(/data:image|iVBORw0KGgo|UklGR|"rgba"|"pixels"|"bitmap"|[A-Za-z0-9+/]{200,}/);
};

describe("a product build has neither hook: absent, not refused", () => {
  it("the control plane carries no driver: its members, exactly", async () => {
    const r = await bootProduct();
    expect(Object.keys(r.host).sort()).toEqual(PRODUCT_CONTROL_PLANE);
    for (const driver of EVIDENCE_ONLY_DRIVERS) expect(r.host, driver).not.toHaveProperty(driver);
  });

  it("each hook's kind is answered exactly as a kind nobody defined, from every sender this extension has", async () => {
    const r = await bootProduct();
    for (const sender of [SENDERS.worker, SENDERS.sidePanel, SENDERS.contentScript]) {
      const never = await r.sendToOffscreen({ kind: "A_KIND_NOBODY_EVER_DEFINED" }, sender);
      expect(never).toEqual({ refused: "UNKNOWN_KIND" });
      expect(await r.sendToOffscreen(PERCEIVE_ONCE, sender)).toEqual(never);
      expect(await r.sendToOffscreen(STREAM_CONSUME, sender)).toEqual(never);
    }
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(r.mediaSourceIds).toEqual([]);
  });

  it("another extension is still refused before anything looks at the kind", async () => {
    const r = await bootProduct();
    expect(await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(await r.sendToOffscreen(STREAM_CONSUME, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("with a live grant, which is the case that used to capture, nothing happens at all", async () => {
    const r = await bootProduct();
    r.holdGrant();
    expect(await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.worker)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(await r.sendToOffscreen({ ...STREAM_CONSUME, streamId: "opaque-stream-handle-1" }, SENDERS.worker)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(r.released).toEqual({ tracks: 0, bitmaps: 0 });
  });

  it("the one forwarder left names no kind, and what it forwards finds no handler", async () => {
    const r = await bootProduct();
    r.holdGrant();
    // `toOffscreen` stays: the M13 harness's product phase and the observation harnesses drive through it.
    expect(await r.host.toOffscreen(PERCEIVE_ONCE)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(await r.host.toOffscreen(STREAM_CONSUME)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(withoutComments(read("host/background.ts"))).toMatch(/toOffscreen: async \(msg: object\) => \{\n\s+await ensureOffscreen\(\);\n\s+return chrome\.runtime\.sendMessage\(\{ target: "offscreen", \.\.\.msg \}\);/);
  });

  it("the worker issues no capture ticket to anyone, the offscreen document included", async () => {
    const r = await bootProduct();
    r.holdGrant();
    for (const sender of [SENDERS.offscreen, SENDERS.sidePanel, SENDERS.worker, SENDERS.otherExtension]) {
      expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, sender)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    }
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, SENDERS.contentScript)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(r.visualActivity().mintedStreamIds).toBe(0);
  });

  it("the TR-01 probe is not consulted, so it is never handed a capture path", async () => {
    const contexts: unknown[] = [];
    const r = await bootProduct({ tr01ProbeContexts: contexts });
    await r.sendToOffscreen({ kind: "ECHO" }, SENDERS.worker);
    await r.sendToOffscreen({ kind: "TR01_PROBE", op: "pass" }, SENDERS.worker);
    expect(contexts).toEqual([]);
  });

  it("the grant authority and what the panel reads from it are unchanged. Since OD-W only a test-only control fills it in a product", async () => {
    const r = await bootProduct();
    r.holdGrant();
    expect(r.host.captureState().grants).toHaveLength(1);
    const status = (await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel)) as { captureStatus: { lifecycle: string; requiresReauth: boolean } };
    expect(status.captureStatus).toMatchObject({ lifecycle: "GRANTED", requiresReauth: false });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("a whole task still sends neither kind and asks for no ticket, with a grant live", async () => {
    const r = await bootProduct({ model: () => [{ op: "click", target: "#submit" }] });
    r.holdGrant();
    const reply = await r.run(taskRequest());
    expect(reply.ok).toBe(true);
    for (const kind of ["PERCEIVE_ONCE", "STREAM_CONSUME", "CAPTURE_FRAME"]) expect(r.messages).not.toContain(kind);
    expect(reply.result?.perceptionBoot).toBeNull();
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });
});

describe("in source: each thing a product bundle must not carry is behind the flag itself", () => {
  const main = withoutComments(read("host/offscreen/main.ts"));
  const background = withoutComments(read("host/background.ts"));
  const gatedDrivers = (): string => background.slice(background.indexOf("...(__EVIDENCE_BUILD__\n      ? {"), background.indexOf("      : {}),\n", background.indexOf("...(__EVIDENCE_BUILD__\n      ? {")));
  const captureHandler = (): string => background.slice(background.indexOf('if (__EVIDENCE_BUILD__ && msg?.kind === "CAPTURE_FRAME") {'), background.indexOf('if (msg?.kind === "TO_PAGE_BOUNDARY") {'));

  it("both handlers, in the condition a bundler can decide", () => {
    expect(main).toMatch(/if \(__EVIDENCE_BUILD__ && msg\.kind === "PERCEIVE_ONCE"\) \{/);
    expect(main).toMatch(/if \(__EVIDENCE_BUILD__ && msg\.kind === "STREAM_CONSUME"\) \{/);
    expect(main).not.toMatch(/if \(msg\.kind === "(PERCEIVE_ONCE|STREAM_CONSUME)"\)/);
  });

  it("the two other references that would keep the capture path alive: the TR-01 probe's context and a task's port", () => {
    expect(main).toMatch(/__EVIDENCE_BUILD__ &&\s+serveTr01Probe\(msg, sender, sendResponse, \{\s+perceiveTab,/);
    expect(main).toMatch(/\.\.\.\(__EVIDENCE_BUILD__\s+\? taskPerception</);
    expect(main.match(/\bperceiveTab\b/g)).toHaveLength(3); // its declaration, the gated probe context, the gated handler
    expect(main.match(/\bensurePerception\(/g)).toHaveLength(3); // its declaration, the gated task port, perceiveTab
  });

  it("all four drivers, in one object a bundler drops whole, and nowhere outside it", () => {
    const drivers = gatedDrivers();
    for (const driver of EVIDENCE_ONLY_DRIVERS) expect(drivers, driver).toContain(`${driver}: async (`);
    const rest = background.replace(drivers, "");
    for (const driver of EVIDENCE_ONLY_DRIVERS) expect(rest, driver).not.toContain(driver);
    expect(rest).not.toMatch(/"(PERCEIVE_ONCE|STREAM_CONSUME)"/);
  });

  it("the ticket handler is behind the flag, so nothing in a product worker calls `ticketFor`", () => {
    expect(captureHandler()).toContain("capture.ticketFor(");
    const rest = background.replace(gatedDrivers(), "").replace(captureHandler(), "");
    expect(rest).not.toMatch(/ticketFor|CAPTURE_FRAME|CAPTURE_TICKET/);
  });

  it("the gesture authority itself is not gated: it is built in every build. Since OD-W only an evidence toolbar grants", () => {
    expect(background).toMatch(/const capture = createCaptureAuthority\(\{/);
    expect(background).toMatch(/getMediaStreamId: \(o\) => chrome\.tabCapture\.getMediaStreamId\(o\),/);
    expect(background).toMatch(/if \(__EVIDENCE_BUILD__\) \{\n\s+if \(typeof tab\.id === "number"\) capture\.grant\(tab\.id\);/);
    expect(read("host-lib/capture-authority.ts")).not.toMatch(/__EVIDENCE_BUILD__/);
  });

  it("the build flag is the existing one: no new flag, and `wxt.config.ts` names no hook", () => {
    const config = read("wxt.config.ts");
    expect(config).toContain("const EVIDENCE_BUILD = E6_PROBE || STRUCTURAL_PROBE || TR01_PROBE || EGRESS_EVIDENCE_PROBE || WORKER_FRAME;");
    expect(config).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME|perceiveOnce|consumeProbe/);
  });
});

describe("no other way in, and no control for one, in any product source", () => {
  it("only the worker's gated drivers send either kind", () => {
    const senders = PRODUCT_SOURCES.filter((file) => /kind:\s*"(PERCEIVE_ONCE|STREAM_CONSUME)"/.test(withoutComments(read(file))));
    // offscreen/main.ts names them in its message type; background.ts is the only one to send them.
    expect(senders.sort()).toEqual(["host/background.ts", "host/offscreen/main.ts"]);
    expect(withoutComments(read("host/offscreen/main.ts"))).not.toMatch(/sendMessage\([^)]*kind:\s*"(PERCEIVE_ONCE|STREAM_CONSUME)"/);
  });

  it("`__host` is a global on the worker alone, and no extension page or content script touches it", () => {
    const users = PRODUCT_SOURCES.filter((file) => /__host\b/.test(withoutComments(read(file))));
    expect(users).toEqual(["host/background.ts"]);
    expect(withoutComments(read("host/background.ts"))).toMatch(/\(globalThis as Record<string, unknown>\)\.__host = \{/);
  });

  it("a page has no channel to any of this: no external listener, no page message listener", () => {
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
    expect(content).toMatch(/if \(sender\.id !== chrome\.runtime\.id \|\| sender\.tab\) \{/);
    expect(read("wxt.config.ts")).not.toMatch(/externally_connectable|web_accessible_resources/);
  });

  it("the normal UI has no control for either: not in the side panel's code, and not in its page", () => {
    const hooks = /PERCEIVE_ONCE|STREAM_CONSUME|perceiveOnce|consumeProbe|mintStreamId|ticketProbe|__host/;
    expect(withoutComments(read("host/sidepanel/main.ts"))).not.toMatch(hooks);
    expect(read("host/sidepanel/index.html")).not.toMatch(hooks);
    expect(read("host/offscreen/index.html")).not.toMatch(hooks);
  });

  it("the hooks are not in a task's path", () => {
    for (const file of ["host-lib/extension-run.ts", "host-lib/extension-ports.ts", "host-lib/task-desk.ts", "host-lib/task-perception.ts"]) {
      expect(withoutComments(read(file)), file).not.toMatch(/PERCEIVE_ONCE|STREAM_CONSUME|perceiveTab/);
    }
    const main = withoutComments(read("host/offscreen/main.ts"));
    const runTask = main.slice(main.indexOf("async function runTask("), main.indexOf("installTransportControlPlane();"));
    expect(runTask).not.toMatch(/perceiveTab|STREAM_CONSUME|PERCEIVE_ONCE/);
  });
});

describe("an evidence build keeps both: registered and routed", () => {
  it("the control plane has every product member, plus the four drivers", async () => {
    const r = await bootEvidence();
    expect(Object.keys(r.host).sort()).toEqual([...PRODUCT_CONTROL_PLANE, ...EVIDENCE_ONLY_DRIVERS].sort());
  });

  it("each driver reaches its handler through the real listeners", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    await driversOf(r).consumeProbe();
    expect(r.messages).toContain("STREAM_CONSUME");
    await driversOf(r).perceiveOnce(TAB_ID, FRAME_ID);
    expect(r.messages).toContain("PERCEIVE_ONCE");
    expect(r.messages).toContain("CAPTURE_FRAME");
    expect(r.visualActivity().getUserMedia).toBe(2); // one per route: a fake, handing back a synthetic frame
  });

  it("the TR-01 probe gets the context it always had, and its `perceiveTab` drives a pass", async () => {
    const contexts: unknown[] = [];
    const r = await bootEvidence({ tr01ProbeContexts: contexts });
    await r.sendToOffscreen({ kind: "ECHO" }, SENDERS.worker);
    const context = contexts[0] as { perceiveTab: (tabId: number, frameId: number) => Promise<{ summary: { ran: boolean; refusal: { code: string } | null } }> };
    expect(Object.keys(context).sort()).toEqual(["codec", "encodeSanitized", "perceiveTab", "sanitizedFrame", "tr01Status"]);
    const { summary } = await context.perceiveTab(TAB_ID, FRAME_ID);
    expect(summary.ran).toBe(false);
    expect(summary.refusal?.code).toBe("NO_ACTIVE_TAB_GRANT");
  });

  it("a task keeps its perception pass, through the same gate that removes it from a product task", async () => {
    const r = await bootEvidence({ model: () => [{ op: "click", target: "#submit" }] });
    const reply = await r.run(taskRequest());
    expect(reply.result?.perceptionBoot).not.toBeNull();
    expect(r.messages).toContain("CAPTURE_FRAME");
  });

  it("the handlers carry the code they had: only the flag was added to their conditions", () => {
    const main = read("host/offscreen/main.ts");
    expect(main).toContain("const { observed, summary } = await perceiveTab(msg.tabId, msg.frameId);");
    expect(main).toContain('sendResponse({ refused: { code: "PERCEIVE_ONCE_THREW", detail: e instanceof Error ? e.message : String(e) } });');
    expect(main).toContain("chromeMediaSourceId: msg.streamId,");
    expect(main).toContain("track.stop();");
    expect(main).toContain("bitmap.close();");
  });
});

describe("an evidence build's sender checks are as they were", () => {
  it("a sender from another extension is refused before either handler runs", async () => {
    const r = await bootEvidence();
    expect(await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(await r.sendToOffscreen(STREAM_CONSUME, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("the capture route is narrower: only the offscreen document may ask the worker for a ticket", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    for (const sender of [SENDERS.contentScript, SENDERS.sidePanel, SENDERS.otherExtension, SENDERS.worker]) {
      expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, sender)).toEqual({ ok: false, refused: "SENDER_NOT_ACCEPTED" });
    }
    expect(r.visualActivity().mintedStreamIds).toBe(0);
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, SENDERS.offscreen)).toMatchObject({ ok: true, route: "GESTURE_STREAM" });
    expect(r.visualActivity().mintedStreamIds).toBe(1);
  });

  it("PRESERVED, NOT FIXED (M23.8, F-3): a content-script context of this extension is accepted, unlike RUN_TASK", async () => {
    const r = await bootEvidence();
    expect(await r.sendToOffscreen({ kind: "RUN_TASK", request: taskRequest() }, SENDERS.contentScript)).toEqual({ refused: "RUN_ONLY_FROM_SERVICE_WORKER" });
    const reply = (await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.contentScript)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT"); // the handler ran; the capture authority said no
    const stream = (await r.sendToOffscreen(STREAM_CONSUME, SENDERS.contentScript)) as { ok?: boolean };
    expect(stream.ok).toBe(true);
  });

  it("PRESERVED, NOT FIXED: the side panel's context is accepted too, though no panel code sends either", async () => {
    const r = await bootEvidence();
    const reply = (await r.sendToOffscreen(PERCEIVE_ONCE, SENDERS.sidePanel)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT");
  });
});

describe("an evidence build's gesture grant is still what a frame needs", () => {
  it("no grant: PERCEIVE_ONCE is refused. No frame, no TR-01; T1 was loaded, and it did not run", async () => {
    const r = await bootEvidence();
    const reply = (await driversOf(r).perceiveOnce(TAB_ID, FRAME_ID)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT");
    const activity = r.visualActivity();
    expect(activity).toMatchObject({ captureRequests: 1, mintedStreamIds: 0, getUserMedia: 0, grabFrame: 0, inferences: 0, tr01Workers: 0, tr01Frames: 0 });
    expectNoPixels(reply);
  });

  it("no grant: the stream driver says NO_GRANT and asks for nothing", async () => {
    const r = await bootEvidence();
    expect(await driversOf(r).consumeProbe()).toMatchObject({ ok: false, error: "NO_GRANT" });
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("a grant ended by navigation is no grant, on every route", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    r.navigate();
    const reply = (await driversOf(r).perceiveOnce(TAB_ID, FRAME_ID)) as { refused?: { code?: string } };
    expect(reply.refused?.code).toBe("NO_ACTIVE_TAB_GRANT");
    expect(await driversOf(r).consumeProbe()).toMatchObject({ ok: false, error: "NO_GRANT" });
    expect(await driversOf(r).ticketProbe(TAB_ID)).toMatchObject({ ok: false, refused: "NO_ACTIVE_TAB_GRANT" });
    const activity = r.visualActivity();
    expect(activity).toMatchObject({ mintedStreamIds: 0, getUserMedia: 0, grabFrame: 0, tr01Frames: 0 });
  });

  it("a grant on one tab does not authorise another", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID + 1 }, SENDERS.offscreen)).toMatchObject({ ok: false, refused: "NO_ACTIVE_TAB_GRANT" });
    expect(await driversOf(r).ticketProbe(TAB_ID + 1)).toMatchObject({ ok: false, refused: "NO_ACTIVE_TAB_GRANT" });
    expect(r.visualActivity().mintedStreamIds).toBe(0);
  });

  it("the handle stays in the worker: the probes report its length, never the handle", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    const minted = (await driversOf(r).mintStreamId(TAB_ID)) as Record<string, unknown>;
    expect(Object.keys(minted).sort()).toEqual(["length", "ok"]);
    expect(JSON.stringify(minted)).not.toContain("opaque-stream-handle");
    const ticket = (await driversOf(r).ticketProbe(TAB_ID)) as Record<string, unknown>;
    expect(Object.keys(ticket).sort()).toEqual(["handleLength", "ok", "route"]);
    expect(JSON.stringify(ticket)).not.toContain("opaque-stream-handle");
  });
});

describe("an evidence build's stream ids", () => {
  it("an id the browser did not mint is refused, with a typed failure and no frame. THE REFUSAL IS THE BROWSER DOUBLE'S", async () => {
    const r = await bootEvidence({ browserHonoursOnlyMintedStreamIds: true });
    const reply = (await r.sendToOffscreen(STREAM_CONSUME, SENDERS.worker)) as Record<string, unknown>;
    expect(reply).toEqual({ ok: false, error: "NotAllowedError: a stream id the browser did not mint" });
    expect(r.visualActivity()).toMatchObject({ getUserMedia: 1, grabFrame: 0 });
    expect(r.released).toEqual({ tracks: 0, bitmaps: 0 });
  });

  it("an id the worker minted for a person's grant works under the same double", async () => {
    const r = await bootEvidence({ browserHonoursOnlyMintedStreamIds: true });
    r.clickToolbar();
    expect(await driversOf(r).consumeProbe()).toMatchObject({ ok: true, w: 1024, h: 768 });
    expect(r.mediaSourceIds).toEqual(["opaque-stream-handle-1"]);
  });

  it("PRESERVED, NOT FIXED (M23.8, F-4): the handler has no id check of its own. It passes on whatever it is given", async () => {
    const r = await bootEvidence();
    const reply = (await r.sendToOffscreen(STREAM_CONSUME, SENDERS.worker)) as { ok?: boolean };
    expect(reply.ok).toBe(true); // this fake `getUserMedia` accepts anything. Whether Chrome would is not tested here
    expect(r.mediaSourceIds).toEqual(["a-stream-id-nobody-minted"]);
    expect(r.host.captureState().grants).toEqual([]);
  });

  it("the stream driver takes only the gesture route's ticket, as written", () => {
    expect(read("host/background.ts")).toContain('if (ticket.route !== "GESTURE_STREAM") return { ok: false, error: "NOT_THE_STREAM_ROUTE", route: ticket.route };');
  });
});

describe("an evidence build's replies are the shapes they were", () => {
  it("PERCEIVE_ONCE with a grant: an exact list of fields, and no pixel. T1 and TR-01 ran, as fakes", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    const reply = (await driversOf(r).perceiveOnce(TAB_ID, FRAME_ID)) as Record<string, unknown>;
    expect(Object.keys(reply).sort()).toEqual(["accounting", "afterFiltering", "anchors", "byClass", "capture", "detections", "fusion", "ms", "redaction", "refused", "route", "threshold", "viewport"]);
    expectNoPixels(reply);
    expect(reply).toMatchObject({ route: "GESTURE_STREAM", refused: null });
    expect(reply.capture).toMatchObject({ w: 1024, h: 768, format: "live-bitmap", bytes: 1024 * 768 * 4 });
    expect(r.visualActivity()).toMatchObject({ captureRequests: 1, mintedStreamIds: 1, getUserMedia: 1, grabFrame: 1, ortBootstraps: 1, t1Fetches: 1, inferenceSessions: 1, inferences: 1, tr01Workers: 1, tr01Inits: 1, tr01Frames: 1 });
    expect(r.released).toEqual({ tracks: 1, bitmaps: 1 });
  });

  it("PERCEIVE_ONCE that throws: the typed refusal", async () => {
    const r = await bootEvidence();
    const reply = (await driversOf(r).perceiveOnce(TAB_ID + 1, FRAME_ID)) as { refused: { code: string; detail: string } };
    expect(Object.keys(reply)).toEqual(["refused"]);
    expect(reply.refused.code).toBe("PERCEIVE_ONCE_THREW");
    expect(typeof reply.refused.detail).toBe("string");
  });

  it("STREAM_CONSUME with a grant: dimensions and timings, released, and no T1 or TR-01", async () => {
    const r = await bootEvidence();
    r.clickToolbar();
    const reply = (await driversOf(r).consumeProbe()) as Record<string, unknown>;
    expect(Object.keys(reply).sort()).toEqual(["h", "ms", "ok", "settings", "w"]);
    expect(reply).toMatchObject({ ok: true, w: 1024, h: 768 });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, mintedStreamIds: 1, getUserMedia: 1, grabFrame: 1 });
    expect(r.released).toEqual({ tracks: 1, bitmaps: 1 });
    expectNoPixels(reply);
  });

  it("if TR-01 cannot start, the pass reports it and the frame is still masked fail-closed", async () => {
    const r = await bootEvidence({ tr01: "INIT_FAILED" });
    r.clickToolbar();
    const reply = (await driversOf(r).perceiveOnce(TAB_ID, FRAME_ID)) as { redaction: { outcome: string; failClosed: boolean | null; detector: { ran: boolean; code: string | null } } };
    expect(reply.redaction.detector.ran).toBe(false);
    expect(reply.redaction.detector.code).toBe("DETECTOR_UNAVAILABLE");
    expect(reply.redaction.outcome).toBe("SANITIZED");
    expect(reply.redaction.failClosed).toBe(true);
    expectNoPixels(reply);
  });
});

describe("ORT_SMOKE: the M13 harness's positive control, unchanged by OD-S", () => {
  it("product build: the runtime comes up, T1 is reported absent, and the harness's check passes", async () => {
    const r = await bootProduct();
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(reply).toMatchObject({ ok: false, stage: "UI_HEAD_NOT_IN_PRODUCT_BUILD", ortBootstrapped: true });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: true });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, ortBootstraps: 1 });
  });

  it("evidence build: the model loads and runs (fake session, synthetic bytes), and M13's original check passes", async () => {
    const r = await bootEvidence();
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(reply).toMatchObject({ ok: true, modelBytes: 3 });
    expect(ortSmokeCheck("evidence", reply)).toEqual({ ortAndModelLoad: true });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: false });
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, ortBootstraps: 1, t1Fetches: 1, inferenceSessions: 1, inferences: 1 });
  });

  it("a regression that loads T1 in a product build fails the product check", async () => {
    const r = await bootProduct({ reintroducePerceptionInProductTasks: true });
    const reply = await r.host.toOffscreen({ kind: "ORT_SMOKE" });
    expect(ortSmokeCheck("product", reply)).toEqual({ ortRuntimeWithoutUiHead: false });
  });
});

describe("what OD-S means for the harnesses", () => {
  const harness = (name: string): string => readFileSync(new URL(`../../../tests/browser/extension/${name}.mjs`, import.meta.url), "utf8");

  it("OD-V, implemented (M23.10): six evidence harnesses expect the two builds' workers to differ, and judge them by a contract", () => {
    // The worker reads the flag, so a product and an evidence `background.js` must differ. That is OD-S itself.
    expect(withoutComments(read("host/background.ts"))).toMatch(/__EVIDENCE_BUILD__/);
    for (const name of ["run-gesture-redaction", "run-webp-loopback", "run-artifact-verifier", "run-capture-determinism", "run-stream-j7", "run-stream-re1"]) {
      const code = harness(name);
      expect(code, name).not.toContain("routeIdenticalToProduct");
      expect(code, name).toMatch(/if \(separation\.problems\.length > 0\) refuse\(/);
    }
    // The contract itself is tested in `tests/browser/support/build-separation.test.mjs`.
  });

  it("OD-U, implemented (M23.11): the M4 harness still calls both drivers, and is refused any build that lacks them", () => {
    const code = harness("run-gesture-capture");
    expect(code).toContain("requireGestureEvidenceBuild(EXT, refuse);");
    expect(code).toContain("globalThis.__host.consumeProbe()");
    expect(code).toContain("globalThis.__host.perceiveOnce(tabId, frameId)");
    expect(code).toMatch(/rebuild WITHOUT M3_WORKER_FRAME=1/);
  });

  it("the detector harness can no longer read a product build's silence as every target missed (M23.8, F-6): its driver is gone", async () => {
    expect(harness("run-detector-eval")).toContain("globalThis.__host.perceiveOnce(tabId, frameId)");
    const r = await bootProduct();
    expect(r.host.perceiveOnce).toBeUndefined();
  });
});
