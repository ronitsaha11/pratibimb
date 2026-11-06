/**
 * M23.11 (OD-U) — WHAT THE TWO GESTURE HARNESSES ASK OF A BUILD, ASKED OF A CONTROLLED GESTURE AUTHORITY.
 *
 * Neither harness is executed, and no browser starts. This makes the calls `run-gesture-capture.mjs` and
 * `run-gesture-acts.mjs` make, in their order, against the real worker and offscreen document under fakes, and
 * evaluates the checks they apply to grants, tickets and streams, copied from them expression for expression.
 *
 * In an evidence build those checks hold. On a product build they cannot, which is why it is refused.
 *
 * NOT ESTABLISHED: that either workflow passes. The toolbar click, the stream and the detector are fakes here. The
 * checks that need a real detector or a real page (`theDetectorRanOnThePinnedArtifact`, `fusionJoinedDomAndVision`,
 * `successPerceivedVisually`) are not evaluated. Only a real, separately authorised run can say.
 */
import { afterEach, describe, expect, it } from "vitest";

import { bootSimulatedExtension, driversOf, FRAME_ID, SENDERS, TAB_ID, taskRequest, type Rig, type RigOptions } from "./support/simulatedExtension";

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
});
const boot = async (options: RigOptions): Promise<Rig> => {
  rig = await bootSimulatedExtension(options);
  return rig;
};

interface Seen {
  readonly way: string;
  readonly message?: { readonly kind?: string; readonly op?: string; readonly body?: { readonly kind?: string } };
}
const seenBy = (r: Rig): readonly Seen[] => (r.host as unknown as { seen: readonly Seen[] }).seen;

/** The worker-traffic step, as `run-gesture-capture.mjs` computes it. */
const workerTraffic = (r: Rig) => {
  const seen = seenBy(r);
  const text = JSON.stringify(seen);
  const kinds: Record<string, number> = {};
  for (const entry of seen) {
    const kind = `${entry.way}:${entry.message?.kind ?? entry.message?.body?.kind ?? entry.message?.op ?? "?"}`;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return {
    kinds,
    pngSignature: text.includes("iVBORw0KGgo"),
    dataImageUrl: text.includes("data:image"),
    longestBase64Run: (text.match(/[A-Za-z0-9+/]{200,}/g) ?? []).reduce((m, run) => Math.max(m, run.length), 0),
  };
};

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("run-gesture-capture's sequence, on an evidence build, with a controlled gesture", () => {
  const run = async () => {
    const r = await boot({ evidenceBuild: true });
    const drivers = driversOf(r);
    const beforeGesture = { captureState: r.host.captureState(), ticket: (await drivers.ticketProbe(TAB_ID)) as Loose };
    r.clickToolbar();
    const grant = r.host.captureState().grants.find((g) => (g as Loose).tabId === TAB_ID) as Loose | undefined;
    const mint = (await drivers.mintStreamId(TAB_ID)) as Loose;
    const consume = (await drivers.consumeProbe()) as Loose;
    const p = (await drivers.perceiveOnce(TAB_ID, FRAME_ID)) as Loose;
    return { r, beforeGesture, grant, mint, consume, p, traffic: workerTraffic(r) };
  };

  it("before the click, the authority refuses, there are no grants, and no worker capture path is compiled in", async () => {
    const { beforeGesture } = await run();
    expect(beforeGesture.ticket.ok === false && beforeGesture.ticket.refused === "NO_ACTIVE_TAB_GRANT").toBe(true); // refusedBeforeTheGesture
    expect((beforeGesture.captureState.grants?.length ?? -1) === 0).toBe(true); // noGrantsBeforeTheGesture
    expect(beforeGesture.captureState.workerFrameEnabled === false).toBe(true); // theBuildHasNoWorkerCapturePath
  });

  it("the click grants, the grant mints an opaque handle, and the worker reports only its length", async () => {
    const { grant, mint } = await run();
    expect(typeof grant?.tabId === "number").toBe(true); // aRealInvocationWasRecorded
    expect(mint.ok === true && (mint.length ?? 0) > 0).toBe(true); // theGrantMintedAnOpaqueHandle
    expect(JSON.stringify(mint)).not.toContain("opaque-stream-handle");
  });

  it("the handle reaches the offscreen realm and comes back as dimensions, on the stream route", async () => {
    const { consume, p } = await run();
    expect(consume.ok === true).toBe(true); // theOffscreenRealmConsumedTheHandle
    expect((consume.w ?? 0) > 0 && (consume.h ?? 0) > 0).toBe(true); // aRealFrameArrivedInThePerceptionRealm: a synthetic one here
    expect(p.route === "GESTURE_STREAM" && !p.refused).toBe(true); // perceptionRanOnTheStreamRoute
  });

  it("the worker carried a ticket and recorded no pixel", async () => {
    const { traffic } = await run();
    expect((traffic.kinds["to-tab:CAPTURE_TICKET"] ?? 0) > 0).toBe(true); // theWorkerCarriedTheHandle
    expect(traffic.pngSignature === false && traffic.dataImageUrl === false && traffic.longestBase64Run < 200).toBe(true); // noPixelsAnywhereInTheWorkersRecording
  });
});

describe("run-gesture-acts's grant discipline, on an evidence build, with a controlled gesture", () => {
  const click = () => [{ op: "click", target: "#submit" }];

  it("navigation revokes the grant, so each act needs a click of its own", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    expect(r.host.captureState().grants).toHaveLength(1);
    r.navigate(); // `freshDocument`'s reload
    const before = r.host.captureState().grants.length;
    expect(before).toBe(0);
    expect(await driversOf(r).ticketProbe(TAB_ID)).toMatchObject({ ok: false, refused: "NO_ACTIVE_TAB_GRANT" });
    r.clickToolbar();
    const after = r.host.captureState();
    expect(after.grants.length > before && after.grants.some((g) => (g as Loose).tabId === TAB_ID)).toBe(true); // `waitForGesture`
  });

  it("an act with no click takes no frame, and the route the harness judges is not the stream's", async () => {
    const r = await boot({ evidenceBuild: true, model: click });
    const reply = await r.run(taskRequest(), { grant: true });
    const perception = (reply.result?.ports.perception ?? []) as unknown as readonly Loose[];
    const routesSeen = [...new Set(perception.map((p) => p.route).filter(Boolean))];
    expect(routesSeen.length > 0 && routesSeen.every((route) => route === "GESTURE_STREAM")).toBe(false); // everyCaptureUsedTheStreamRoute
    expect(r.visualActivity()).toMatchObject({ mintedStreamIds: 0, getUserMedia: 0, grabFrame: 0 });
  });

  it("an authorised act captures on the stream route alone, and encodes no frame", async () => {
    const r = await boot({ evidenceBuild: true, model: click });
    r.clickToolbar();
    const reply = await r.run(taskRequest(), { grant: true });
    const perception = (reply.result?.ports.perception ?? []) as unknown as readonly Loose[];
    const routesSeen = [...new Set(perception.map((p) => p.route).filter(Boolean))];
    expect(routesSeen).toEqual(["GESTURE_STREAM"]); // everyCaptureUsedTheStreamRoute
    expect(perception.every((p) => !p.ran || (p.ms.encode === 0 && p.capture?.format === "live-bitmap"))).toBe(true); // noFrameWasEverEncoded
    expect(perception.some((p) => p.ran)).toBe(true);
  });
});

describe("stream and sender authority, as those two harnesses rely on it", () => {
  it("only the offscreen document gets a ticket, and only for the tab a person invoked", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    for (const sender of [SENDERS.contentScript, SENDERS.sidePanel, SENDERS.worker, SENDERS.otherExtension]) {
      expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, sender)).toEqual({ ok: false, refused: "SENDER_NOT_ACCEPTED" });
    }
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID + 1 }, SENDERS.offscreen)).toMatchObject({ ok: false, refused: "NO_ACTIVE_TAB_GRANT" });
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: TAB_ID }, SENDERS.offscreen)).toMatchObject({ ok: true, route: "GESTURE_STREAM" });
  });

  it("the stream driver takes the worker's own minted handle. A browser double refuses any other", async () => {
    const r = await boot({ evidenceBuild: true, browserHonoursOnlyMintedStreamIds: true });
    expect(await r.sendToOffscreen({ kind: "STREAM_CONSUME", streamId: "not-minted" }, SENDERS.worker)).toMatchObject({ ok: false });
    r.clickToolbar();
    expect(await driversOf(r).consumeProbe()).toMatchObject({ ok: true });
    expect(r.visualActivity().grabFrame).toBe(1);
  });
});

describe("why a product build is refused: the same sequence has nothing to run on", () => {
  it("run-gesture-capture's four drivers are gone, so its route cannot even be attempted", async () => {
    const r = await boot({ evidenceBuild: false });
    r.holdGrant();
    for (const driver of ["ticketProbe", "mintStreamId", "consumeProbe", "perceiveOnce"] as const) expect(r.host[driver], driver).toBeUndefined();
    expect(r.visualActivity().mintedStreamIds).toBe(0);
  });

  it("run-gesture-acts would run, even with a grant held, and capture nothing: `everyCaptureUsedTheStreamRoute` cannot hold", async () => {
    const r = await boot({ evidenceBuild: false, model: () => [{ op: "click", target: "#submit" }] });
    r.holdGrant();
    const reply = await r.run(taskRequest(), { grant: true });
    const perception = (reply.result?.ports.perception ?? []) as unknown as readonly Loose[];
    const routesSeen = [...new Set(perception.map((p) => p.route).filter(Boolean))];
    expect(routesSeen.length > 0 && routesSeen.every((route) => route === "GESTURE_STREAM")).toBe(false);
    expect((perception[0]?.detector?.detections ?? 0) > 0).toBe(false); // successPerceivedVisually
    expect(perception).toEqual([]);
    expect(r.visualActivity().getUserMedia).toBe(0);
  });

  it("and `waitForGesture` would never see a grant from a click: a product's toolbar opens the panel instead (OD-W)", async () => {
    const r = await boot({ evidenceBuild: false });
    const before = r.host.captureState().grants.length;
    r.clickToolbar();
    expect(r.host.captureState().grants.length > before).toBe(false);
    expect(r.sidePanelOpens).toEqual([{ tabId: TAB_ID }]);
  });
});
