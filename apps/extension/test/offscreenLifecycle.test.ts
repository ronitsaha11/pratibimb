/**
 * M23.21 (A6) — THE OFFSCREEN DOCUMENT: ONE CREATION SITE, A JUSTIFICATION THAT SAYS WHAT IT IS FOR, AND NO CREATION
 * UNTIL THE PANEL ASKS.
 *
 * M23.20 searched Chrome's extension pages for the justification sentence and did not find it. Chrome's documentation
 * describes the justification as a string the extension supplies for the request; it does not promise to display it.
 * So what can be checked is what the worker passes, when it passes it and what the document does, and that is what
 * this file checks: the real worker and offscreen document under the simulated extension. No browser starts, and
 * whether Chrome ever shows the sentence is NOT established here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerCommands } from "../../../tests/browser/support/chrome-commands.mjs";
import { OFFSCREEN_JUSTIFICATION } from "../../../tests/browser/support/product-build-inspection.mjs";
import { bootSimulatedExtension, SENDERS, type Rig, type RigOptions } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (file: string): string => readFileSync(join(APP, file), "utf8").replace(/\r\n/g, "\n");
const shipped = (dir: string): string[] =>
  readdirSync(join(APP, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(APP, path)).isDirectory() ? shipped(path) : /\.(ts|html)$/.test(name) ? [relative(APP, join(APP, path)).replace(/\\/g, "/")] : [];
  });

let rig: Rig | undefined;
const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, offscreenStartsClosed: true, ...options });
  return rig;
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => {
  rig?.dispose();
  rig = undefined;
  vi.restoreAllMocks();
});

describe("A6: the call", () => {
  it("there is exactly one `chrome.offscreen.createDocument` in everything the extension ships", () => {
    const sites = [...shipped("host"), ...shipped("host-lib")].flatMap((file) => (read(file).match(/offscreen\.createDocument\(/g) ?? []).map(() => file));
    expect(sites).toEqual(["host/background.ts"]);
  });

  it("it supplies a URL that the build ships, one reason, and a non-empty justification", () => {
    const call = /chrome\.offscreen\.createDocument\(\{([\s\S]*?)\}\);/.exec(read("host/background.ts"))?.[1] ?? "";
    expect(call).toMatch(/url: "offscreen\.html",/);
    // WXT emits `host/offscreen/index.html` as the build's `offscreen.html`; the product build inspection lists it.
    expect(read("host/offscreen/index.html")).toMatch(/<script type="module" src="\.\/main\.ts"><\/script>/);
    expect(call).toMatch(/reasons: \[chrome\.offscreen\.Reason\.WORKERS\],/);
    expect(call).toContain(`justification: "${OFFSCREEN_JUSTIFICATION}",`);
    expect(OFFSCREEN_JUSTIFICATION.trim().length).toBeGreaterThan(0);
  });

  it("the justification describes the product's actual use, DOM-based assistance, and claims nothing it does not do", () => {
    expect(OFFSCREEN_JUSTIFICATION).toMatch(/DOM-based browser assistance/);
    expect(OFFSCREEN_JUSTIFICATION).not.toMatch(/capture|screenshot|frame|image|pixel|camera|microphone|audio|video|clipboard|record/i);
  });
});

describe("A6: when it is made", { timeout: 30_000 }, () => {
  it("not when the worker starts", async () => {
    const r = await boot();
    await settle();
    expect(r.offscreenCreations).toEqual([]);
  });

  it("not by the toolbar button, and not by the keyboard shortcut", async () => {
    const r = await boot();
    r.clickToolbar();
    r.pressKeys("Ctrl+Shift+Y", registerCommands({ _execute_action: { suggested_key: { default: "Ctrl+Shift+Y" } } }));
    await settle();
    expect(r.sidePanelOpens).toHaveLength(2);
    expect(r.offscreenCreations).toEqual([]);
  });

  it("by the panel's HOST_STATUS, once, with exactly the arguments above", async () => {
    const r = await boot();
    await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel);
    await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel);
    expect(r.offscreenCreations).toEqual([{ url: "offscreen.html", reasons: ["WORKERS"], justification: OFFSCREEN_JUSTIFICATION }]);
  });

  it("not from a page or another extension: HOST_STATUS from either is refused and creates nothing", async () => {
    const r = await boot();
    // A content script is an accepted sender, but HOST_STATUS is not a kind it may send.
    expect(await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.contentScript)).toEqual({ refused: "UNKNOWN_KIND" });
    expect(await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.otherExtension)).toEqual({ refused: "SENDER_NOT_ACCEPTED" });
    expect(r.offscreenCreations).toEqual([]);
  });
});
