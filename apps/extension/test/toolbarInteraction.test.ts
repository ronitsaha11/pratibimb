/**
 * M23.13 (OD-W) — THE TOOLBAR BUTTON: A PRODUCT OPENS THE SIDE PANEL, AN EVIDENCE BUILD RECORDS A GRANT.
 *
 * The real `host/background.ts` and `host/offscreen/main.ts` run under a fake `chrome`, with every capture and model API
 * counted (`support/simulatedExtension.ts`). No browser starts and no frame is captured. Whether Chrome honours
 * `sidePanel.open` from this click, or from `Alt+Shift+P`, is NOT established here: only a real browser can say.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openSidePanelForToolbarClick } from "../host-lib/toolbar-action";
import { bootSimulatedExtension, NO_VISUAL_ACTIVITY, SENDERS, TAB_ID, taskRequest, type Rig, type RigOptions } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
  vi.restoreAllMocks();
});
const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, ...options });
  return rig;
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const status = async (r: Rig) => (await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel)) as { captureStatus: { lifecycle: string } };

/** Everything a click must not have done, in one place. */
const expectNoCaptureActivity = (r: Rig): void => {
  expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  expect(r.host.captureState().grants).toEqual([]);
  expect(r.mediaSourceIds).toEqual([]);
};

describe("a product's toolbar click", () => {
  it("(1) opens the side panel, once, for the tab it was made on", async () => {
    const r = await boot();
    r.clickToolbar();
    expect(r.sidePanelOpens).toEqual([{ tabId: TAB_ID }]);
  });

  it("(2) requests no capture grant: the authority still has none, and says so", async () => {
    const r = await boot();
    r.clickToolbar();
    await settle();
    expect(r.host.captureState().grants).toEqual([]);
    expect((await status(r)).captureStatus.lifecycle).toBe("NO_GRANT");
  });

  it("(3) mints no ticket and no stream id", async () => {
    const r = await boot();
    r.clickToolbar();
    await settle();
    expect(r.visualActivity().captureRequests).toBe(0);
    expect(r.visualActivity().mintedStreamIds).toBe(0);
    expect(r.messages).not.toContain("CAPTURE_FRAME");
  });

  it("(4, 5) starts no frame capture, no ORT, no T1 and no TR-01: every counter stays at zero", async () => {
    const r = await boot();
    r.clickToolbar();
    await settle();
    expectNoCaptureActivity(r);
  });

  it("sends no message at all, so it cannot start offscreen work: the panel is all it touches", async () => {
    const r = await boot();
    r.clickToolbar();
    await settle();
    expect(r.messages).toEqual([]);
  });

  it("(6) repeated clicks ask for the panel again and start nothing: no task, no session, no run", async () => {
    const r = await boot();
    for (let i = 0; i < 5; i += 1) r.clickToolbar();
    await settle();
    expect(r.sidePanelOpens).toHaveLength(5);
    expect(r.messages).toEqual([]);
    expect(await r.sendToOffscreen({ kind: "TASK_STATUS" }, SENDERS.sidePanel)).toEqual({ ok: true, task: null });
    expect(await r.sendToOffscreen({ kind: "STATE" }, SENDERS.worker)).toMatchObject({ running: false, capabilities: 0 });
    expectNoCaptureActivity(r);
  });

  it("does not disturb a task that is running: a click during one starts nothing else", async () => {
    let clicked = false;
    const r = await boot({
      model: () => {
        if (!clicked) {
          clicked = true;
          r.clickToolbar();
        }
        return [{ op: "click", target: "#submit" }];
      },
    });
    const reply = await r.run(taskRequest(), { grant: true });
    expect(reply.ok).toBe(true);
    expect(r.sidePanelOpens).toEqual([{ tabId: TAB_ID }]);
    expect(reply.result?.record.act?.verification?.verification).toBe("CONFIRMED");
    expectNoCaptureActivity(r);
  });

  it("a task afterwards runs as it always did, on the DOM alone", async () => {
    const r = await boot({ model: () => [{ op: "click", target: "#submit" }] });
    r.clickToolbar();
    const reply = await r.run(taskRequest(), { grant: true });
    expect(reply.result?.record.act?.verification?.verification).toBe("CONFIRMED");
    expect(reply.result?.ports.perception).toEqual([]);
    expectNoCaptureActivity(r);
  });
});

describe("(7) with no tab information", () => {
  it("no tab id, but a window: the panel opens for that window, and no grant follows", async () => {
    const r = await boot();
    r.clickToolbar({ windowId: 3 });
    expect(r.sidePanelOpens).toEqual([{ windowId: 3 }]);
    expectNoCaptureActivity(r);
  });

  it("neither: nothing opens, it says why, and nothing else happens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await boot();
    r.clickToolbar({});
    await settle();
    expect(r.sidePanelOpens).toEqual([]);
    expect(warn).toHaveBeenCalledWith("PratiBimb: NO_TAB_TO_OPEN_THE_SIDE_PANEL_FOR");
    expect(r.messages).toEqual([]);
    expectNoCaptureActivity(r);
  });
});

describe("(8, 12) when the side panel API fails", () => {
  for (const sidePanel of ["REJECTS", "THROWS", "ABSENT"] as const) {
    it(`${sidePanel}: the failure is reported, nothing escapes, and nothing falls back to capture`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const r = await boot({ sidePanel });
      expect(() => r.clickToolbar()).not.toThrow();
      await settle();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/^PratiBimb: SIDE_PANEL_DID_NOT_OPEN: /);
      expect(r.messages).toEqual([]);
      expectNoCaptureActivity(r);
      expect((await status(r)).captureStatus.lifecycle).toBe("NO_GRANT");
    });
  }

  it("a later click tries again: one failure leaves nothing stuck", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await boot({ sidePanel: "REJECTS" });
    r.clickToolbar();
    r.clickToolbar();
    await settle();
    expect(r.sidePanelOpens).toHaveLength(2);
    expectNoCaptureActivity(r);
  });
});

describe("the handler itself", () => {
  it("calls `open` before it returns, so the call is inside the user gesture", () => {
    const open = vi.fn(async () => undefined);
    openSidePanelForToolbarClick({ id: 7 }, open, () => undefined);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ tabId: 7 });
  });

  it("prefers the tab to the window, and reports nothing when it works", async () => {
    const open = vi.fn(async () => undefined);
    const report = vi.fn();
    openSidePanelForToolbarClick({ id: 7, windowId: 3 }, open, report);
    await settle();
    expect(open).toHaveBeenCalledWith({ tabId: 7 });
    expect(report).not.toHaveBeenCalled();
  });

  it("the worker's listener awaits nothing before it, and its source has no route to capture in the product branch", () => {
    const worker = read("host/background.ts");
    const start = worker.indexOf("chrome.action?.onClicked.addListener((tab) => {");
    const body = worker.slice(start, worker.indexOf("\n  });\n", start));
    expect(start).toBeGreaterThan(0);
    expect(body).not.toMatch(/\bawait\b|\basync\b|\.then\(/);
    const productBranch = body.slice(body.indexOf("return;\n    }"));
    expect(productBranch).toContain("openSidePanelForToolbarClick(tab, (target) => chrome.sidePanel.open(target),");
    expect(productBranch).not.toMatch(/capture\.|ensureOffscreen|sendMessage|getMediaStreamId/);
  });

  it("the helper has no capture, no message and no fallback in it", () => {
    const code = read("host-lib/toolbar-action.ts").replace(/^\s*\/?\*.*$/gm, "");
    expect(code).not.toMatch(/capture|grant|ticket|tabCapture|getUserMedia|sendMessage|offscreen/i);
  });
});

describe("(9) an evidence build's toolbar click is what it was", () => {
  it("records a grant for the tab, and does not open the panel", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    expect(r.host.captureState().grants).toEqual([expect.objectContaining({ tabId: TAB_ID })]);
    expect(r.sidePanelOpens).toEqual([]);
    expect((await status(r)).captureStatus.lifecycle).toBe("GRANTED");
  });

  it("with no tab id it records nothing, and still opens nothing", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar({ windowId: 3 });
    expect(r.host.captureState().grants).toEqual([]);
    expect(r.sidePanelOpens).toEqual([]);
  });

  it("the grant still ends with navigation, and a new click makes a new one", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    r.navigate();
    expect(r.host.captureState().grants).toEqual([]);
    expect((await status(r)).captureStatus.lifecycle).toBe("REVOKED");
    r.clickToolbar();
    expect(r.host.captureState().grants).toHaveLength(1);
  });

  it("the click takes no frame by itself: capture still waits for something to ask", async () => {
    const r = await boot({ evidenceBuild: true });
    r.clickToolbar();
    await settle();
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("its code is the one line it was, under the flag", () => {
    expect(read("host/background.ts")).toMatch(/if \(__EVIDENCE_BUILD__\) \{\n\s+if \(typeof tab\.id === "number"\) capture\.grant\(tab\.id\);\n\s+return;\n\s+\}/);
  });
});

describe("(10) the authority is untouched: its expiry and revocation tests still apply", () => {
  it("the module reads no build flag, so `captureAuthority.test.ts` tests what both builds ship", () => {
    expect(read("host-lib/capture-authority.ts")).not.toMatch(/__EVIDENCE_BUILD__/);
    expect(read("test/captureAuthority.test.ts")).toMatch(/lets a grant expire/);
  });

  it("in a product build the authority still answers: it just has nothing to report", async () => {
    const r = await boot();
    expect((await status(r)).captureStatus.lifecycle).toBe("NO_GRANT");
    r.holdGrant(); // test-only control, for tests that need a grant to exist. A click no longer makes one
    expect((await status(r)).captureStatus.lifecycle).toBe("GRANTED");
    r.navigate();
    expect((await status(r)).captureStatus.lifecycle).toBe("REVOKED");
  });
});

describe("the keyboard shortcut is the same event, not a second route", () => {
  it("there is no command listener anywhere in what ships: `_execute_action` is the only command", () => {
    for (const file of ["host/background.ts", "host/offscreen/main.ts", "host/sidepanel/main.ts", "host/content.ts"]) {
      expect(read(file), file).not.toMatch(/chrome\.commands|onCommand/);
    }
    expect(read("wxt.config.ts")).toMatch(/commands: \{\s+_execute_action: \{ suggested_key: \{ default: "Alt\+Shift\+P" \}/);
  });

  it("so what the fake fires for a click is what Chrome is documented to fire for it: one listener, in both builds", () => {
    expect(read("host/background.ts").match(/onClicked\.addListener/g)).toHaveLength(1);
  });
});

describe("nothing else moved", () => {
  it("the panel opens through its existing registration: no options set, no behaviour set, no path of its own", () => {
    expect(read("wxt.config.ts")).toContain('side_panel: { default_path: "sidepanel.html" },');
    for (const file of ["host/background.ts", "host-lib/toolbar-action.ts", "host/sidepanel/main.ts"]) {
      expect(read(file), file).not.toMatch(/setOptions|setPanelBehavior|default_popup/);
    }
    expect(read("wxt.config.ts")).not.toMatch(/default_popup/);
  });

  it("the handler adds no message kind", () => {
    expect(read("host-lib/messages.ts")).not.toMatch(/SIDE_PANEL|TOOLBAR/);
    expect(read("host/background.ts")).not.toMatch(/kind: "(SIDE_PANEL|TOOLBAR|OPEN_)/);
  });
});
