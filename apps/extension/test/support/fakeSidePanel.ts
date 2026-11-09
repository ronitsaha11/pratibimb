/**
 * The real `host/sidepanel/main.ts`, on a small fake page built from the real page's ids, with the flag `wxt.config.ts`
 * would substitute. No DOM library is installed, and no browser starts. What Chrome renders is NOT established by this.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

const APP = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
export const sidePanelHtml = (): string => readFileSync(join(APP, "host/sidepanel/index.html"), "utf8").replace(/\r\n/g, "\n");

export class FakeElement {
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

export interface FakePanel {
  readonly byId: ReadonlyMap<string, FakeElement>;
  readonly sent: readonly string[];
  readonly root: FakeElement;
  readonly settle: () => Promise<void>;
}

export interface FakePanelOptions {
  /** What the worker's `HOST_STATUS` answers. A test may pass the real worker's reply. */
  readonly hostStatus?: unknown;
  /** `HOST_STATUS` rejects, as it does when the worker cannot be reached. */
  readonly hostStatusFails?: boolean;
}

export async function bootPanel(evidenceBuild: boolean, lifecycle = "NO_GRANT", options: FakePanelOptions = {}): Promise<FakePanel> {
  vi.resetModules();
  const byId = new Map<string, FakeElement>();
  for (const match of sidePanelHtml().matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)) {
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
        if (message.kind !== "HOST_STATUS") return { pending: null };
        if (options.hostStatusFails) throw new Error("synthetic: no worker");
        return options.hostStatus ?? { bootId: "b", captureStatus: { lifecycle, requiresReauth: true } };
      },
    },
  });
  vi.stubGlobal("setInterval", () => 0);
  await import("../../host/sidepanel/main");
  return { byId, sent, root, settle: () => new Promise((resolve) => setTimeout(resolve, 0)) };
}

export const fieldsIn = (element: FakeElement | undefined): FakeElement[] => (element ? element.children.flatMap((child) => [child, ...fieldsIn(child)]) : []);
