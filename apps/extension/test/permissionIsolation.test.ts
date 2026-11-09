/**
 * M23.17 (RD-5, RD-6) — A PRODUCT WORKS WITHOUT `tabCapture` OR `activeTab`, AND CANNOT REACH WHAT THEY WOULD ALLOW.
 *
 * The real worker and offscreen document, under the simulated extension, with `chrome.tabCapture` absent: what a manifest
 * with neither permission should present. No browser, no frame and no model are involved. So this shows the product's code
 * does not depend on the API. Whether Chrome behaves as its documentation says remains for a real browser run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { bootSimulatedExtension, NO_VISUAL_ACTIVITY, SENDERS, taskRequest, type ModelScript, type Rig, type RigOptions } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");

const clickSubmit: ModelScript = () => [{ op: "click", target: "#submit" }];

let rig: Rig | undefined;
const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, withoutTabCaptureApi: true, ...options });
  return rig;
};
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
afterEach(() => {
  rig?.dispose();
  rig = undefined;
});

describe("a product, with `chrome.tabCapture` not there at all", { timeout: 30_000 }, () => {
  it("the rig really has removed it", async () => {
    await boot();
    expect((globalThis as unknown as { chrome: { tabCapture?: unknown } }).chrome.tabCapture).toBeUndefined();
  });

  it("the worker boots, and reports the API's absence instead of throwing", async () => {
    const r = await boot();
    const { routeSurface } = r.host as unknown as { routeSurface(): unknown };
    expect(routeSurface()).toMatchObject({ tabCapture: false, getMediaStreamId: false });
  });

  it("(11) a task completes, confirmed by the page, with every capture counter at zero", async () => {
    const r = await boot({ model: clickSubmit });
    const reply = await r.run(taskRequest());
    expect(reply.refused).toBeUndefined();
    expect(reply.ok).toBe(true);
    expect(reply.result?.record.state).toBe("DONE");
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(r.messages).not.toContain("CAPTURE_FRAME");
  });

  it("the toolbar still opens the side panel, and issues no grant", async () => {
    const r = await boot();
    r.clickToolbar();
    await settle();
    expect(r.sidePanelOpens).toHaveLength(1);
    expect(r.host.captureState().grants).toEqual([]);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("`HOST_STATUS` still answers, because the panel's request is what creates the offscreen document", async () => {
    const r = await boot();
    expect(await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel)).toMatchObject({ offscreenContexts: expect.any(Number), hellos: expect.any(Number) });
  });

  it("(11) a capture request is not served: the handler is absent, so nothing reaches the wrapper", async () => {
    const r = await boot();
    expect(await r.sendToWorker({ kind: "CAPTURE_FRAME", tabId: 1 }, SENDERS.offscreen)).toMatchObject({ refused: expect.any(String) });
    // The rig counts the message it was asked to deliver. Nothing after that happens: no handle, frame, decode or model.
    expect(r.visualActivity()).toEqual({ ...NO_VISUAL_ACTIVITY, captureRequests: 1 });
  });

  it("the same task behaves the same with the API present: its absence changes nothing a product does", async () => {
    const without = await boot({ model: clickSubmit });
    const a = await without.run(taskRequest());
    without.dispose();
    const present = await boot({ model: clickSubmit, withoutTabCaptureApi: false });
    const b = await present.run(taskRequest());
    expect(a.result?.record.state).toBe(b.result?.record.state);
    expect(a.result?.loop?.outcome).toBe(b.result?.loop?.outcome);
    expect(present.visualActivity()).toEqual(without.visualActivity());
  });
});

describe("(12) evidence-build diagnostic isolation is what it was: the gates are source, and this milestone changed none", () => {
  const worker = read("host/background.ts");
  const offscreen = read("host/offscreen/main.ts");

  it("the worker's capture handler and toolbar grant stay behind the evidence flag", () => {
    expect(worker).toContain('if (__EVIDENCE_BUILD__ && msg?.kind === "CAPTURE_FRAME") {');
    expect(worker).toMatch(/if \(__EVIDENCE_BUILD__\) \{\n\s+if \(typeof tab\.id === "number"\) capture\.grant\(tab\.id\);/);
  });

  it("both hooks stay behind it in the offscreen document", () => {
    expect(offscreen).toContain('if (__EVIDENCE_BUILD__ && msg.kind === "PERCEIVE_ONCE") {');
    expect(offscreen).toContain('if (__EVIDENCE_BUILD__ && msg.kind === "STREAM_CONSUME") {');
  });

  it("the authority and its wrapper are unchanged, and the authority knows nothing of the flag", () => {
    expect(worker).toContain("getMediaStreamId: (o) => chrome.tabCapture.getMediaStreamId(o),");
    expect(read("host-lib/capture-authority.ts")).not.toMatch(/__EVIDENCE_BUILD__/);
  });

  it("the permissions are a build-time list, and no source asks for one at run time", () => {
    for (const file of ["host/background.ts", "host/offscreen/main.ts", "host/sidepanel/main.ts", "host/content.ts"]) {
      expect(read(file), file).not.toMatch(/chrome\.permissions\b/);
    }
    const config = read("wxt.config.ts");
    expect(config).not.toMatch(/optional_permissions|optional_host_permissions/);
  });
});
