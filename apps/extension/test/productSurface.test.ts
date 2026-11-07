/**
 * M23.18 — THE PRODUCT'S SURFACE, AS THE OWNER APPROVED IT: RD-1 (the worker's justification), RD-2 (the Status box) and
 * RD-8 (the turn budget). The real panel code on a fake page, and the real worker and offscreen document under the simulated
 * extension. No browser starts, no frame is captured and no model runs. What Chrome renders or shows is NOT established here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STATUS_UNAVAILABLE_MESSAGE } from "../host-lib/product-copy";
import { bootPanel, fieldsIn, sidePanelHtml } from "./support/fakeSidePanel";
import { bootSimulatedExtension, NO_VISUAL_ACTIVITY, SENDERS, taskRequest, type ModelScript, type Rig, type RigOptions } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(APP, "..", "..");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");
const JUSTIFICATION = "Run PratiBimb's offscreen runtime for DOM-based browser assistance.";
const clickSubmit: ModelScript = () => [{ op: "click", target: "#submit" }];

let rig: Rig | undefined;
const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, ...options });
  return rig;
};
afterEach(() => {
  rig?.dispose();
  rig = undefined;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("RD-1: the worker's justification", { timeout: 30_000 }, () => {
  it("only the value changed: the call, its URL and its reason are as before", () => {
    const worker = read("host/background.ts");
    expect(worker).toMatch(/await chrome\.offscreen\.createDocument\(\{\n\s+url: "offscreen\.html",\n\s+reasons: \[chrome\.offscreen\.Reason\.WORKERS\],\n(\s+\/\/[^\n]*\n)?\s+justification: "Run PratiBimb's offscreen runtime for DOM-based browser assistance\.",\n\s+\}\);/);
    expect(worker).not.toContain("ORT inference and the synthetic vault stub");
  });

  it("is what the real worker passes to Chrome, when it creates the document", async () => {
    const r = await boot({ offscreenStartsClosed: true });
    await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel);
    expect(r.offscreenCreations).toEqual([{ url: "offscreen.html", reasons: ["WORKERS"], justification: JUSTIFICATION }]);
  });
});

describe("RD-2: the offscreen lifecycle is unchanged, because the Status box's request is what drives it", { timeout: 30_000 }, () => {
  it("a product panel still sends HOST_STATUS when it opens", async () => {
    const { sent, settle } = await bootPanel(false);
    await settle();
    expect(sent).toContain("HOST_STATUS");
  });

  it("HOST_STATUS creates the offscreen document when there is none, once, and answers with the same fields as before", async () => {
    const r = await boot({ offscreenStartsClosed: true });
    const first = (await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel)) as Record<string, unknown>;
    expect(r.offscreenCreations).toHaveLength(1);
    expect(Object.keys(first).sort()).toEqual(["bootId", "bootedAt", "captureStatus", "hellos", "offscreenContexts"]);
    expect(first.offscreenContexts).toBe(1);
    await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel);
    expect(r.offscreenCreations).toHaveLength(1);
  });

  it("a task then runs in that document, as before: DOM-only, confirmed, nothing captured", async () => {
    const r = await boot({ offscreenStartsClosed: true, model: clickSubmit });
    await r.sendToWorker({ kind: "HOST_STATUS" }, SENDERS.sidePanel);
    const reply = await r.run(taskRequest());
    expect(reply.ok).toBe(true);
    expect(reply.result?.record.state).toBe("DONE");
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });
});

describe("RD-2: what a product's Status box shows", { timeout: 30_000 }, () => {
  it("nothing while the panel works: no fields, no identifiers, no NEEDS_USER line, and the box is hidden", async () => {
    const { byId, settle } = await bootPanel(false, "NO_GRANT", { hostStatus: { bootId: "boot-1", bootedAt: 1234, offscreenContexts: 1, hellos: 2, captureStatus: null } });
    await settle();
    expect(byId.get("status-box")?.hidden).toBe(true);
    expect(byId.get("status")?.textContent).toBe("");
    expect(fieldsIn(byId.get("status-box"))).toEqual([]);
  });

  it("the stale `NEEDS_USER: none` is gone from the product's page entirely, not only hidden", () => {
    expect(sidePanelHtml()).not.toContain("NEEDS_USER");
    expect(sidePanelHtml()).not.toContain('id="needs-user"');
  });

  it("one plain sentence when the worker cannot be reached, with no internal detail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { byId, root, settle } = await bootPanel(false, "NO_GRANT", { hostStatusFails: true });
    await settle();
    expect(byId.get("status")?.textContent).toBe(STATUS_UNAVAILABLE_MESSAGE);
    expect(STATUS_UNAVAILABLE_MESSAGE).toBe("PratiBimb could not start. Close this panel and open it again.");
    expect(STATUS_UNAVAILABLE_MESSAGE).not.toMatch(/HOST_STATUS|offscreen|worker|boot|undefined|Error|synthetic/i);
    expect(byId.get("status-box")?.hidden).toBe(false);
    expect(root.dataset.hostStatus).toBe("error");
  });

  it("the failure is not silenced: the raw reason still reaches the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { settle } = await bootPanel(false, "NO_GRANT", { hostStatusFails: true });
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("synthetic: no worker");
  });
});

describe("RD-2: consent and approval are untouched", () => {
  it("the panel asks the same three things when it opens, consent among them", async () => {
    const { sent, settle } = await bootPanel(false);
    await settle();
    expect([...sent].sort()).toEqual(["CLARIFY_PEEK", "CONSENT_PEEK", "HOST_STATUS"]);
  });

  it("the consent and clarification markup is what it was: the only page change is the Status box", () => {
    const html = sidePanelHtml();
    for (const id of ["consent", "consent-heading", "consent-site", "consent-allow", "consent-deny", "clarify", "clarify-use", "clarify-decline"]) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('<button id="consent-allow" type="button">Allow once</button>');
  });
});

describe("RD-2: an evidence build's Status box is what it was", { timeout: 30_000 }, () => {
  it("prints the worker's whole reply, and keeps its NEEDS_USER line, after the reply", async () => {
    const reply = { bootId: "boot-1", bootedAt: 1234, offscreenContexts: 1, hellos: 2, captureStatus: { lifecycle: "NO_GRANT", requiresReauth: true } };
    const { byId, settle } = await bootPanel(true, "NO_GRANT", { hostStatus: reply });
    await settle();
    expect(byId.get("status")?.textContent).toBe(JSON.stringify(reply, null, 2));
    expect(byId.get("status-box")?.hidden).toBe(false);
    const line = fieldsIn(byId.get("status-box"));
    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({ id: "needs-user", textContent: "NEEDS_USER: none" });
  });

  it("its failure text is exactly as before, and it adds nothing to the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { byId, settle } = await bootPanel(true, "NO_GRANT", { hostStatusFails: true });
    await settle();
    expect(byId.get("status")?.textContent).toBe("status unavailable: synthetic: no worker");
    expect(warn).not.toHaveBeenCalled();
  });

  it("its Capture field is still built", async () => {
    const { byId, settle } = await bootPanel(true, "GRANTED", { hostStatus: { bootId: "b", captureStatus: { lifecycle: "GRANTED", requiresReauth: false } } });
    await settle();
    expect(fieldsIn(byId.get("capture-slot")).find((n) => n.id === "capture")?.textContent).toBe("Authorised. No frame taken yet.");
  });
});

describe("RD-8: the panel's three-turn budget and the five-turn ceiling are two different things", () => {
  it("a panel-started task asks for no budget, so it gets the default of three", () => {
    const panel = read("host/sidepanel/main.ts");
    expect(panel).toContain('chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_START", answer })');
    expect(panel).not.toMatch(/maxTurns/);
    expect(read("host/offscreen/main.ts")).toContain("maxTurns = checkTurnBudget(msg.maxTurns ?? 3);");
  });

  it("the ceiling is five, refused above and never clamped", () => {
    const loop = readFileSync(join(ROOT, "packages", "orchestrator", "src", "loop.ts"), "utf8");
    expect(loop).toContain("export const MAX_TASK_TURNS = 5;");
    expect(loop).toMatch(/maxTurns > MAX_TASK_TURNS\) \{\n\s+throw new TurnBudgetError/);
  });
});
