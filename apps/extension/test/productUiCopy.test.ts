/**
 * M23.12 (OD-T) — WHAT THE PRODUCT'S UI SAYS, AND WHETHER IT IS TRUE.
 *
 * The real `host/sidepanel/main.ts` runs here against a small fake DOM built from the real page's ids, with the flag
 * `wxt.config.ts` would substitute. The privacy sentence is then checked against what a task does, on the same
 * simulated extension the DOM-only tests use. No browser starts, no frame is captured and no model is read. What
 * Chrome renders is NOT established here. The real manifest and an in-memory product bundle are in
 * `buildSeparation.test.ts`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { structuralRequestProblems } from "../../../tests/browser/support/dom-only-checks.mjs";
import { PRIVACY_EXPLANATION, SIDE_PANEL_DESCRIPTION, TOOLBAR_TITLE } from "../host-lib/product-copy";
import { bootSimulatedExtension, NO_VISUAL_ACTIVITY, taskRequest, type Rig } from "./support/simulatedExtension";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");
const html = read("host/sidepanel/index.html");

// ── a fake page: an element for every id in the real html, and only those ─────────────────────────
class FakeElement {
  id = "";
  hidden = false;
  textContent = "";
  disabled = false;
  value = "";
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  constructor(readonly tagName: string) {}
  append(...nodes: FakeElement[]) {
    this.children.push(...nodes);
  }
  replaceChildren() {
    this.children.length = 0;
  }
  addEventListener() {
    /* no interaction happens in these tests */
  }
  scrollIntoView() {
    /* nothing to scroll */
  }
  querySelector() {
    return null;
  }
}

interface Panel {
  readonly byId: ReadonlyMap<string, FakeElement>;
  readonly sent: readonly string[];
  readonly root: FakeElement;
  readonly settle: () => Promise<void>;
}

async function bootPanel(evidenceBuild: boolean, lifecycle = "NO_GRANT"): Promise<Panel> {
  vi.resetModules();
  const byId = new Map<string, FakeElement>();
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)) {
    const element = new FakeElement(match[1]!);
    element.id = match[2]!;
    element.hidden = /\bhidden\b/.test(match[0]);
    byId.set(element.id, element);
  }
  const root = new FakeElement("html");
  const sent: string[] = [];
  vi.stubGlobal("__EVIDENCE_BUILD__", evidenceBuild);
  vi.stubGlobal("document", {
    documentElement: root,
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => ({ text }),
    getElementById: (id: string) => byId.get(id) ?? null,
  });
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (message: { kind: string }) => {
        sent.push(message.kind);
        return message.kind === "HOST_STATUS" ? { bootId: "b", captureStatus: { lifecycle, requiresReauth: true } } : { pending: null };
      },
    },
  });
  vi.stubGlobal("setInterval", () => 0);
  await import("../host/sidepanel/main");
  return { byId, sent, root, settle: () => new Promise((resolve) => setTimeout(resolve, 0)) };
}

const fieldsIn = (element: FakeElement | undefined): FakeElement[] => (element ? element.children.flatMap((child) => [child, ...fieldsIn(child)]) : []);

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the owner's wording, exactly", () => {
  it("the three strings", () => {
    expect(TOOLBAR_TITLE).toBe("PratiBimb — Page Assistant");
    expect(SIDE_PANEL_DESCRIPTION).toBe("PratiBimb uses page structure to identify elements and assist with browser tasks.");
    expect(PRIVACY_EXPLANATION).toBe("Normal tasks do not capture browser screenshots or send page images to the reasoning model.");
  });

  it("makes no claim about visual PII, masking or complete privacy, because none is operational", () => {
    for (const text of [TOOLBAR_TITLE, SIDE_PANEL_DESCRIPTION, PRIVACY_EXPLANATION]) {
      expect(text).not.toMatch(/protect|redact|mask|secure|safe|private|PII|never|all /i);
    }
  });
});

describe("a product panel", () => {
  it("shows the description and the privacy explanation, exactly", async () => {
    const { byId } = await bootPanel(false);
    expect(byId.get("about")).toMatchObject({ textContent: SIDE_PANEL_DESCRIPTION, hidden: false });
    expect(byId.get("privacy")).toMatchObject({ textContent: PRIVACY_EXPLANATION, hidden: false });
  });

  it("has no capture field, whatever the worker reports", async () => {
    for (const lifecycle of ["NO_GRANT", "GRANTED", "REVOKED"]) {
      const { byId, settle } = await bootPanel(false, lifecycle);
      await settle();
      expect(byId.has("capture")).toBe(false);
      expect(byId.get("capture-slot")?.children).toEqual([]);
    }
  });

  it("still reports the host's status, and shows the worker's raw reply as it always did", async () => {
    const { byId, root, settle } = await bootPanel(false);
    await settle();
    expect(root.dataset.hostStatus).toBe("ok");
    expect(byId.get("status")?.textContent).toContain('"bootId": "b"');
  });
});

describe("an evidence build's panel: its diagnostic wording stays, and stays there", () => {
  it("does NOT say the product's privacy sentence, which would be false in it", async () => {
    const { byId } = await bootPanel(true);
    expect(byId.get("about")).toMatchObject({ textContent: "", hidden: true });
    expect(byId.get("privacy")).toMatchObject({ textContent: "", hidden: true });
  });

  it("builds the capture field where it has always been shown, with its legend", async () => {
    const { byId } = await bootPanel(true);
    const nodes = fieldsIn(byId.get("capture-slot"));
    expect(nodes.map((n) => n.tagName)).toEqual(["fieldset", "legend", "div"]);
    expect(nodes[1]?.textContent).toBe("Capture");
    expect(nodes[2]?.id).toBe("capture");
  });

  it.each([
    ["NO_GRANT", "Not authorised. Click the toolbar button to let PratiBimb look at this tab."],
    ["GRANTED", "Authorised. No frame taken yet."],
    ["STREAM_AVAILABLE", "Authorised for the page currently open."],
    ["DOCUMENT_CHANGED", "The page changed. Click the toolbar button again to re-authorise."],
    ["REVOKED", "Authorisation ended when the tab navigated. Click the toolbar button again."],
  ])("%s keeps its original words and data attributes", async (lifecycle, text) => {
    const { byId, settle } = await bootPanel(true, lifecycle);
    await settle();
    const field = fieldsIn(byId.get("capture-slot")).find((n) => n.id === "capture");
    expect(field?.textContent).toBe(text);
    expect(field?.dataset.lifecycle).toBe(lifecycle);
    expect(field?.dataset.requiresReauth).toBe("true");
  });
});

describe("nothing else about the panel changed", () => {
  it("both builds' panels ask the same things of the extension when they open", async () => {
    const product = await bootPanel(false);
    await product.settle();
    const productAsks = [...product.sent].sort();
    vi.unstubAllGlobals();
    const evidence = await bootPanel(true);
    await evidence.settle();
    expect([...evidence.sent].sort()).toEqual(productAsks);
    expect(productAsks).toEqual(["CLARIFY_PEEK", "CONSENT_PEEK", "HOST_STATUS"]);
  });

  it("the page's <style> is unchanged, so the CSP's hash of it is too", () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
    // The hash in the product manifest built before this milestone.
    expect(createHash("sha256").update(style!, "utf8").digest("base64")).toBe(STYLE_HASH_BEFORE_M23_12);
  });

  it("every other control on the page is still there", () => {
    for (const id of ["consent", "consent-allow", "consent-deny", "clarify", "clarify-use", "clarify-decline", "goal", "task-read", "task-start", "task-status", "task-timings", "status", "needs-user"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("the toolbar's action is OD-W's: tested in `toolbarInteraction.test.ts`, and it adds no panel wording", () => {
    expect(read("host-lib/toolbar-action.ts")).not.toContain("textContent");
    expect(`${read("host/background.ts")}${read("wxt.config.ts")}`).not.toContain("setPanelBehavior");
  });
});

describe("no stale capture wording in a product's UI source", () => {
  const STALE = /perceive this tab|look at this tab|capture this page|see this tab/i;

  it("the page itself never says it, or names a capture field", () => {
    expect(html).not.toMatch(STALE);
    expect(html).not.toMatch(/<legend>Capture|No frame taken/);
  });

  it("the manifest's wording comes from the approved module, not from a literal", () => {
    const config = read("wxt.config.ts");
    expect(config).not.toMatch(STALE);
    expect(config).toContain("action: { default_title: TOOLBAR_TITLE },");
    expect(config).toContain("description: TOOLBAR_TITLE },");
  });

  it("in the panel's source, the old wording sits only inside the evidence-build branch", () => {
    const panel = read("host/sidepanel/main.ts");
    const start = panel.indexOf("const CAPTURE_TEXT: Record<string, string> = __EVIDENCE_BUILD__");
    const end = panel.indexOf("  : {};", start);
    expect(start).toBeGreaterThan(0);
    expect(panel.slice(0, start)).not.toMatch(STALE);
    expect(panel.slice(end)).not.toMatch(STALE);
    expect(panel).toMatch(/const captureEl = __EVIDENCE_BUILD__ \? evidenceCaptureField\(\) : null;/);
    expect(panel).toMatch(/if \(__EVIDENCE_BUILD__ && captureEl\) \{/);
    expect(panel).toMatch(/if \(!__EVIDENCE_BUILD__\) \{\n\s+showText\("about", SIDE_PANEL_DESCRIPTION\);\n\s+showText\("privacy", PRIVACY_EXPLANATION\);/);
  });

  it("the three evidence harnesses that tell an operator what to click name the new title", () => {
    for (const name of ["run-gesture-capture", "run-gesture-acts", "run-gesture-redaction"]) {
      const code = readFileSync(new URL(`../../../tests/browser/extension/${name}.mjs`, import.meta.url), "utf8");
      expect(code, name).toContain(TOOLBAR_TITLE);
      expect(code, name).not.toMatch(STALE);
    }
  });
});

describe("is the privacy explanation true? Checked against what a task does", () => {
  const click = () => [{ op: "click", target: "#submit" }];

  it("a product task, with a grant held by the authority, captures nothing and runs neither T1 nor TR-01", async () => {
    rig = await bootSimulatedExtension({ evidenceBuild: false, model: click });
    rig.holdGrant();
    const reply = await rig.run(taskRequest(), { grant: true });
    expect(reply.ok).toBe(true);
    expect(rig.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(reply.result?.ports.perception).toEqual([]);
    expect(reply.result?.record.handoff?.capability).toEqual({ backend: "none", tiers_fired: ["T0", "T2"] });
  });

  it("what reaches the reasoning model is structure-only JSON, with no image in it", async () => {
    rig = await bootSimulatedExtension({ evidenceBuild: false, model: click });
    await rig.run(taskRequest(), { grant: true });
    expect(rig.modelRequests.length).toBeGreaterThan(0);
    for (const request of rig.modelRequests) {
      expect(structuralRequestProblems(request.raw)).toEqual([]);
      expect(request.body.messages.every((message) => typeof message.content === "string")).toBe(true);
      expect(request.raw).not.toMatch(/image_url|data:image|iVBORw0KGgo|UklGR/);
    }
  });

  it("in an evidence build it would be false: a granted task does capture. That is why the panel there does not say it", async () => {
    rig = await bootSimulatedExtension({ evidenceBuild: true, model: click });
    rig.clickToolbar();
    await rig.run(taskRequest(), { grant: true });
    expect(rig.visualActivity().getUserMedia).toBeGreaterThan(0);
  });
});

const STYLE_HASH_BEFORE_M23_12 = "ZYRp1TbYj9bPuYCw1S2y0R5L4r911NcNjTciEbHTsAo=";
