/**
 * M23.15 (OD-Y) — WHAT THE PRODUCT CALLS ITSELF, AND WHAT IT DOES NOT CLAIM TO BE.
 *
 * Static, plus the real panel code on a fake page. No browser starts. The real manifest is in `buildSeparation.test.ts`.
 *
 * ONLY WHAT SHIPS IS SCANNED. Records of past behaviour may say anything that was true then, and a final test below keeps
 * that distinction, by checking they still do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEVELOPMENT_BUILD_NAME, PRIVACY_EXPLANATION, SIDE_PANEL_DESCRIPTION, TOOLBAR_TITLE } from "../host-lib/product-copy";
import { bootPanel, fieldsIn } from "./support/fakeSidePanel";

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(APP, "..", "..");
const read = (relative: string): string => readFileSync(join(APP, relative), "utf8").replace(/\r\n/g, "\n");
const panel = (): string => read("host/sidepanel/index.html");
const offscreen = (): string => read("host/offscreen/index.html");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the approved identity", () => {
  it("the toolbar title is the owner's exact wording, and the build's name adds only what is true of it", () => {
    expect(TOOLBAR_TITLE).toBe("PratiBimb — Page Assistant");
    expect(DEVELOPMENT_BUILD_NAME).toBe("PratiBimb — Page Assistant (Development build)");
  });

  it("the side panel's title and heading use the name", () => {
    expect(panel()).toContain(`<title>${DEVELOPMENT_BUILD_NAME}</title>`);
    expect(panel()).toContain(`<h1>${DEVELOPMENT_BUILD_NAME}</h1>`);
  });

  it("the offscreen page's title uses it too, and says which page it is", () => {
    expect(offscreen()).toContain(`<title>${DEVELOPMENT_BUILD_NAME}: offscreen</title>`);
  });

  it("the manifest takes the name and title from one module", () => {
    const config = read("wxt.config.ts");
    expect(config).toContain("name: DEVELOPMENT_BUILD_NAME,");
    expect(config).toContain("action: { default_title: TOOLBAR_TITLE },");
  });

  it("no new brand or tagline: every identity string in what ships is one of these", () => {
    const shipped = `${panel()}\n${offscreen()}`;
    const titles = [...shipped.matchAll(/<(?:title|h1)>([^<]+)<\/(?:title|h1)>/g)].map((m) => m[1]!);
    expect(titles.length).toBe(3);
    for (const title of titles) expect(title.startsWith(DEVELOPMENT_BUILD_NAME), title).toBe(true);
  });

  it("the description is still the approved one, on the real panel", async () => {
    const { byId } = await bootPanel(false);
    expect(byId.get("about")?.textContent).toBe(SIDE_PANEL_DESCRIPTION);
    expect(byId.get("privacy")?.textContent).toBe(PRIVACY_EXPLANATION);
  });
});

describe("a development build stays one", () => {
  it("the qualifier is in the name, the title and the heading", () => {
    expect(DEVELOPMENT_BUILD_NAME).toMatch(/\(Development build\)$/);
    expect(panel().match(/\(Development build\)/g)).toHaveLength(2);
  });

  it("the truthful warning stays: a development build, for synthetic pages", () => {
    expect(panel()).toContain('<p class="warn">Development build. Use synthetic pages only.');
    expect(panel()).toContain('placeholder="Synthetic goal text"');
  });

  it("nothing a person reads calls it released, production or accepted", () => {
    const shipped = `${panel()}\n${offscreen()}\n${read("host-lib/product-copy.ts").replace(/^\s*\/?\*.*$/gm, "")}`;
    expect(shipped).not.toMatch(/\b(production[- ]ready|release[- ]ready|released|general availability|accepted|certified|v1\.0)\b/i);
  });
});

describe("no obsolete identity in what a person reads", () => {
  const OBSOLETE = /minimal host|minimal MV3|experiment|not the product|perceive this tab/i;

  it("in either page", () => {
    expect(panel()).not.toMatch(OBSOLETE);
    expect(offscreen()).not.toMatch(OBSOLETE);
  });

  it("in the manifest's strings, as the config sets them", () => {
    const config = read("wxt.config.ts");
    const manifest = config.slice(config.indexOf("manifest: {"), config.indexOf("hooks: {"));
    expect(manifest).not.toMatch(OBSOLETE);
  });

  it("in the panel's own strings at run time, in a product build", async () => {
    const { byId, settle } = await bootPanel(false);
    await settle();
    for (const [id, element] of byId) expect(element.textContent, id).not.toMatch(OBSOLETE);
  });
});

describe("what stays, on purpose", () => {
  it("evidence diagnostic wording is accurate, so it is kept: the Capture field, in an evidence panel alone", async () => {
    const { byId, settle } = await bootPanel(true, "NO_GRANT", { hostStatus: { bootId: "b", captureStatus: { lifecycle: "NO_GRANT", requiresReauth: true } } });
    await settle();
    const nodes = fieldsIn(byId.get("capture-slot"));
    expect(nodes[1]?.textContent).toBe("Capture");
    expect(nodes[2]?.textContent).toBe("Not authorised. Click the toolbar button to let PratiBimb look at this tab.");
  });

  it("internal names are not touched: the package, the worker's argument to Chrome, and source comments", () => {
    expect(JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).name).toBe("@pratibimb/extension");
    expect(read("host/background.ts")).toContain('justification: "PratiBimb minimal host: ORT inference and the synthetic vault stub",');
    expect(read("wxt.config.ts")).toContain("MINIMAL MV3 HOST");
  });

  it("historical records keep what was true when they were written: they are not stale product UI", () => {
    const record = (relative: string): string => readFileSync(join(ROOT, "artifacts", "experiments", relative), "utf8");
    expect(record("M23.8-dom-only-boundary-assurance/README.md")).toContain("look at this tab");
    const inventory = readFileSync(join(ROOT, "docs", "handoff", "w1-to-w2", "repository-inventory.md"), "utf8");
    expect(inventory).toContain("**the minimal MV3 host — experimental, not the product**");
  });
});
