/**
 * M23.14 (OD-X) — WHO SEES `captureStatus`. A PRODUCT'S PANEL DOES NOT SHOW IT, AN EVIDENCE BUILD'S DOES, AND THE WORKER STILL REPORTS IT.
 *
 * Presentation only. The real panel code runs on a fake page (`support/fakeSidePanel.ts`), and the real worker's reply comes
 * from the simulated extension. No browser starts and no frame is captured. What Chrome renders is NOT established here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PRIVACY_EXPLANATION, SIDE_PANEL_DESCRIPTION, STATUS_UNAVAILABLE_MESSAGE } from "../host-lib/product-copy";
import { bootPanel, fieldsIn, sidePanelHtml } from "./support/fakeSidePanel";
import { bootSimulatedExtension, NO_VISUAL_ACTIVITY, SENDERS, taskRequest, type Rig } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
  vi.unstubAllGlobals();
  vi.resetModules();
});

/**
 * Two tests boot the real worker and offscreen modules three times, on a fresh module graph each time. M23.15 found them
 * under a second alone, and past the 5s default in a parallel full run. A longer limit, and no assertion changed.
 */
const THREE_REAL_BOOTS_MS = 30_000;
const LIFECYCLES = ["NO_GRANT", "GRANTED", "STREAM_AVAILABLE", "DOCUMENT_CHANGED", "REVOKED"] as const;
const replyFor = (lifecycle: string) => ({ bootId: "boot-1", bootedAt: 1234, offscreenContexts: 1, hellos: 2, captureStatus: { lifecycle, requiresReauth: lifecycle !== "GRANTED", revokedBecause: null } });

/** The real worker's `HOST_STATUS` reply, in a given state, taken before the panel's fakes go up. */
const realWorkerReply = async (evidenceBuild: boolean, prepare: (r: Rig) => void = () => undefined): Promise<Record<string, unknown>> => {
  const r = await bootSimulatedExtension({ evidenceBuild });
  prepare(r);
  const reply = (await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel)) as Record<string, unknown>;
  r.dispose();
  return reply;
};

const statusText = async (evidenceBuild: boolean, hostStatus: unknown): Promise<string> => {
  const { byId, settle } = await bootPanel(evidenceBuild, "NO_GRANT", { hostStatus });
  await settle();
  return byId.get("status")?.textContent ?? "";
};

describe("a product panel's Status box", () => {
  it("(1) does not show `captureStatus`, given the real worker's real reply, which has it", async () => {
    const reply = await realWorkerReply(false);
    expect(reply).toHaveProperty("captureStatus");
    const text = await statusText(false, reply);
    expect(text).not.toContain("captureStatus");
    expect(text).not.toMatch(/lifecycle|requiresReauth/);
  });

  it.each(LIFECYCLES)("(2) shows nothing of %s, in any form, and no placeholder for it", async (lifecycle) => {
    const text = await statusText(false, replyFor(lifecycle));
    expect(text).not.toContain(lifecycle);
    expect(text).not.toMatch(/capture|grant|frame|perception|visual|null/i);
  });

  it("(7, 8) M23.18 (RD-2): shows none of the worker's fields at all, and the box is hidden while the panel works", async () => {
    const { byId, settle } = await bootPanel(false, "NO_GRANT", { hostStatus: replyFor("NO_GRANT") });
    await settle();
    expect(byId.get("status")?.textContent).toBe("");
    expect(byId.get("status-box")?.hidden).toBe(true);
  });

  it("(7) the real worker still sends every field; a product simply prints none of them", async () => {
    const reply = await realWorkerReply(false);
    expect(Object.keys(reply).sort()).toEqual(["bootId", "bootedAt", "captureStatus", "hellos", "offscreenContexts"]);
    const text = await statusText(false, reply);
    for (const key of Object.keys(reply)) expect(text, key).not.toContain(key);
  });

  it("a field the worker adds later is not shown either", async () => {
    expect(await statusText(false, { ...replyFor("GRANTED"), somethingNew: "value" })).not.toContain("somethingNew");
  });

  it("M23.18 (RD-2): when the worker cannot be reached it says so plainly, shows the box, and keeps the raw error for the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { byId, root, settle } = await bootPanel(false, "NO_GRANT", { hostStatusFails: true });
    await settle();
    expect(byId.get("status")?.textContent).toBe(STATUS_UNAVAILABLE_MESSAGE);
    expect(byId.get("status-box")?.hidden).toBe(false);
    expect(byId.get("status")?.textContent).not.toContain("synthetic: no worker");
    expect(root.dataset.hostStatus).toBe("error");
    expect(warn).toHaveBeenCalledWith("PratiBimb: the side panel could not reach the service worker: synthetic: no worker");
    warn.mockRestore();
  });

  it("(7) M23.18 (RD-2): the panel still marks the host as running, and a product has no NEEDS_USER line", async () => {
    const { byId, root, settle } = await bootPanel(false, "NO_GRANT", { hostStatus: replyFor("NO_GRANT") });
    await settle();
    expect(root.dataset.hostStatus).toBe("ok");
    expect(sidePanelHtml()).toContain('<fieldset id="status-box"><legend>Status</legend><pre id="status">…</pre></fieldset>');
    expect(sidePanelHtml()).not.toContain("NEEDS_USER");
    expect(fieldsIn(byId.get("status-box"))).toEqual([]);
  });

  it("(8) has no capture field either, and its slot stays empty", async () => {
    const { byId, settle } = await bootPanel(false, "NO_GRANT", { hostStatus: replyFor("GRANTED") });
    await settle();
    expect(byId.has("capture")).toBe(false);
    expect(byId.get("capture-slot")?.children).toEqual([]);
  });

  it("(9) the OD-T wording is untouched", async () => {
    const { byId } = await bootPanel(false);
    expect(byId.get("about")).toMatchObject({ textContent: SIDE_PANEL_DESCRIPTION, hidden: false });
    expect(byId.get("privacy")).toMatchObject({ textContent: PRIVACY_EXPLANATION, hidden: false });
  });
});

describe("an evidence panel keeps its diagnostic exactly", () => {
  it("(3) the Status box prints the worker's whole reply, the same bytes as before", async () => {
    const reply = await realWorkerReply(true);
    expect(await statusText(true, reply)).toBe(JSON.stringify(reply, null, 2));
  });

  it.each(LIFECYCLES)("(4) %s appears in the Status box, unchanged", async (lifecycle) => {
    const reply = replyFor(lifecycle);
    const text = await statusText(true, reply);
    expect(text).toBe(JSON.stringify(reply, null, 2));
    expect(JSON.parse(text)).toMatchObject({ captureStatus: { lifecycle } });
  });

  it("(4) a new field shows up here too: nothing filters an evidence panel", async () => {
    expect(await statusText(true, { ...replyFor("GRANTED"), somethingNew: "value" })).toContain("somethingNew");
  });

  it("(5) it follows the worker: each panel load shows the state the worker reports then", async () => {
    const before = await realWorkerReply(true);
    expect(JSON.parse(await statusText(true, before))).toMatchObject({ captureStatus: { lifecycle: "NO_GRANT" } });
    vi.unstubAllGlobals();
    const granted = await realWorkerReply(true, (r) => r.clickToolbar());
    expect(JSON.parse(await statusText(true, granted))).toMatchObject({ captureStatus: { lifecycle: "GRANTED" } });
    vi.unstubAllGlobals();
    const revoked = await realWorkerReply(true, (r) => {
      r.clickToolbar();
      r.navigate();
    });
    expect(JSON.parse(await statusText(true, revoked))).toMatchObject({ captureStatus: { lifecycle: "REVOKED" } });
  }, THREE_REAL_BOOTS_MS);

  it("(3, 5) the Capture field still reads the same lifecycle and sets the same data attributes", async () => {
    const { byId, settle } = await bootPanel(true, "GRANTED", { hostStatus: replyFor("GRANTED") });
    await settle();
    const field = fieldsIn(byId.get("capture-slot")).find((n) => n.id === "capture");
    expect(field?.textContent).toBe("Authorised. No frame taken yet.");
    expect(field?.dataset).toEqual({ lifecycle: "GRANTED", requiresReauth: "false" });
  });
});

describe("(6) the underlying status is untouched: only a product's panel stopped showing it", () => {
  it("the worker still reports it in a product, in every state it could reach", async () => {
    expect(await realWorkerReply(false)).toMatchObject({ captureStatus: { lifecycle: "NO_GRANT" } });
    vi.unstubAllGlobals();
    expect(await realWorkerReply(false, (r) => r.holdGrant())).toMatchObject({ captureStatus: { lifecycle: "GRANTED" } });
    vi.unstubAllGlobals();
    expect(
      await realWorkerReply(false, (r) => {
        r.holdGrant();
        r.navigate();
      })
    ).toMatchObject({ captureStatus: { lifecycle: "REVOKED" } });
  }, THREE_REAL_BOOTS_MS);

  it("the source of it is where it was, and the control plane still answers", () => {
    const worker = read("host/background.ts");
    expect(worker).toContain("sendResponse({ bootId, bootedAt, offscreenContexts: n, hellos: hellos.length, captureStatus });");
    expect(worker).toContain("captureStatus: (tabId: number, documentId?: string) => capture.status(tabId, documentId ?? null),");
    expect(read("host-lib/capture-authority.ts")).not.toMatch(/__EVIDENCE_BUILD__/);
  });

  it("the panel still asks the worker for the same reply: it filters what it shows, not what it asks", async () => {
    const product = await bootPanel(false);
    await product.settle();
    expect(product.sent).toContain("HOST_STATUS");
    const panel = read("host/sidepanel/main.ts");
    expect(panel).toContain('const s = (await chrome.runtime.sendMessage({ kind: "HOST_STATUS" })) as {');
    expect(panel).toContain('if (statusEl) statusEl.textContent = __EVIDENCE_BUILD__ ? JSON.stringify(s, null, 2) : "";');
    expect(panel).not.toContain("PRODUCT_STATUS_FIELDS");
  });
});

describe("(10) no task or security behaviour changed", () => {
  const click = () => [{ op: "click", target: "#submit" }];

  it("a product task still captures nothing, and is still confirmed", async () => {
    rig = await bootSimulatedExtension({ evidenceBuild: false, model: click });
    const reply = await rig.run(taskRequest(), { grant: true });
    expect(reply.result?.record.act?.verification?.verification).toBe("CONFIRMED");
    expect(rig.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("the toolbar still opens the panel and issues no grant", async () => {
    rig = await bootSimulatedExtension({ evidenceBuild: false });
    rig.clickToolbar();
    expect(rig.sidePanelOpens).toHaveLength(1);
    expect(rig.host.captureState().grants).toEqual([]);
  });

  it("the panel's page is unchanged: only the code that fills the Status box moved", () => {
    const html = sidePanelHtml();
    expect(html).toContain('<div id="capture-slot"></div>');
    expect(html).not.toMatch(/captureStatus|NO_GRANT/);
  });
});
