/**
 * The DOM-only claims, and the harnesses that make them.
 *
 * The first thing these must show is that the claims CAN FAIL. The assertion they replace held for every
 * run once the perception array became empty, including a run that observed nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { domOnlyTaskChecks, failedChecks, structuralRequestProblems, summariseHandoff } from "./dom-only-checks.mjs";

const element = (over = {}) => ({ id: "#submit", role: "button", name: "Submit", source: "dom", visible: true, offscreen: false, enabled: true, ...over });
const handoff = (over = {}) => ({
  capability: { backend: "none", tiers_fired: ["T0", "T2"] },
  capture: { scale_to_css: 1 },
  elements: [element(), element({ id: "#name", role: "textbox", name: "Full name" })],
  redactions: [{ token: "<PII:NAME:1>", targetId: "#name", class: "NAME" }],
  ...over,
});
const request = (context = { goal: "Submit", fields: [{ id: "#name", name: "Full name", empty: false }], buttons: [{ id: "#submit", name: "Submit", enabled: true }], references: [{ token: "<PII:NAME:1>", class: "NAME", hint: "x" }] }, top = {}) =>
  JSON.stringify({
    messages: [
      { role: "system", content: "Plan the fewest browser steps." },
      { role: "user", content: JSON.stringify(context) },
    ],
    temperature: 0,
    max_tokens: 160,
    response_format: { type: "json_schema" },
    ...top,
  });
const good = () => ({ perception: [], perceptionBoot: null, handoffs: [handoff()], modelRequests: [request()] });

describe("domOnlyTaskChecks", () => {
  it("holds for a real structural task", () => {
    expect(failedChecks(domOnlyTaskChecks(good()))).toEqual([]);
  });

  it("does NOT hold for the empty run the old assertion passed: nothing observed, nothing asked", () => {
    const empty = domOnlyTaskChecks({ perception: [], perceptionBoot: null, handoffs: [], modelRequests: [] });
    expect(empty.noPerceptionPassRan).toBe(true); // true, and worth nothing alone, which is the point
    expect(failedChecks(empty)).toEqual([
      "theFirstTurnObservedThePage",
      "everyHandoffNamedDomElements",
      "backendDeclaresTheStructuralFloor",
      "tiersDeclareTheStructuralFloor",
      "scaleDeclaresNoCapture",
      "everyElementIsDomSourced",
      "noVisionOnlyElementEnteredAHandoff",
      "theModelWasAsked",
      "everyModelRequestWasStructural",
    ]);
  });

  it("fails when called with nothing, and never throws", () => {
    expect(failedChecks(domOnlyTaskChecks())).toContain("noPerceptionPassRan");
    expect(failedChecks(domOnlyTaskChecks({}))).toContain("noPerceptionRealmWasBuilt");
  });

  it("treats a first turn with no handoff, or an empty one, as unobserved rather than as success", () => {
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [null] }))).toContain("theFirstTurnObservedThePage");
    const noElements = failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [handoff({ elements: [] })] }));
    expect(noElements).toContain("theFirstTurnObservedThePage");
    expect(noElements).toContain("everyHandoffNamedDomElements");
  });

  it("allows a later turn to have stopped before any handoff, but not the first", () => {
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [handoff(), null] }))).toEqual([]);
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [null, handoff()] }))).toEqual(["theFirstTurnObservedThePage"]);
  });

  it("fails on any perception pass, including the refused passes M23.7 removed", () => {
    const refused = [{ ran: false, refusal: "NO_ACTIVE_TAB_GRANT" }];
    expect(failedChecks(domOnlyTaskChecks({ ...good(), perception: refused }))).toEqual(["noPerceptionPassRan"]);
  });

  it("fails if a perception realm was built, even if no pass is recorded", () => {
    const boot = { ok: false, error: "UI_HEAD_NOT_IN_PRODUCT_BUILD", ms: 1, pin: null };
    expect(failedChecks(domOnlyTaskChecks({ ...good(), perceptionBoot: boot }))).toEqual(["noPerceptionRealmWasBuilt"]);
  });

  it("fails on a false claim that a detector ran: backend, tier or scale", () => {
    const claim = (capability, capture = { scale_to_css: 1 }) => failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [handoff({ capability, capture })] }));
    expect(claim({ backend: "wasm", tiers_fired: ["T0", "T2"] })).toEqual(["backendDeclaresTheStructuralFloor"]);
    expect(claim({ backend: "none", tiers_fired: ["T0", "T1", "T2"] })).toEqual(["tiersDeclareTheStructuralFloor"]);
    expect(claim({ backend: "none", tiers_fired: ["T0", "T2"] }, { scale_to_css: 0.5 })).toEqual(["scaleDeclaresNoCapture"]);
  });

  it("fails on T1 provenance on a DOM element, and on a vision-only element", () => {
    const relabelled = handoff({ elements: [element({ source: "dom+vision" })] });
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [relabelled] }))).toEqual(["everyElementIsDomSourced"]);
    const visionOnly = handoff({ elements: [element(), element({ id: "v0", source: "vision" })] });
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [visionOnly] }))).toEqual(["everyElementIsDomSourced", "noVisionOnlyElementEnteredAHandoff"]);
  });

  it("checks every turn, not only the first", () => {
    const later = handoff({ capability: { backend: "wasm", tiers_fired: ["T0", "T1", "T2"] } });
    const failed = failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [handoff(), later] }));
    expect(failed).toEqual(["backendDeclaresTheStructuralFloor", "tiersDeclareTheStructuralFloor"]);
  });

  it("accepts summaries as well as handoffs, so a harness record is enough", () => {
    expect(failedChecks(domOnlyTaskChecks({ ...good(), handoffs: [summariseHandoff(handoff())] }))).toEqual([]);
  });
});

describe("summariseHandoff", () => {
  it("keeps counts and declarations, and no accessible name", () => {
    const summary = summariseHandoff(handoff());
    expect(summary).toEqual({ backend: "none", tiersFired: ["T0", "T2"], scaleToCss: 1, elements: 2, roles: { button: 1, textbox: 1 }, sources: ["dom"], visionOnly: 0, references: 1 });
    expect(JSON.stringify(summary)).not.toContain("Full name");
  });

  it("says a turn had no handoff", () => {
    expect(summariseHandoff(null)).toBeNull();
    expect(summariseHandoff(undefined)).toBeNull();
  });
});

describe("structuralRequestProblems", () => {
  it("passes the approved fields, with or without a hint", () => {
    expect(structuralRequestProblems(request())).toEqual([]);
    const noHint = { goal: "g", fields: [], buttons: [], references: [{ token: "<PII:NAME:1>", class: "NAME" }] };
    expect(structuralRequestProblems(request(noHint))).toEqual([]);
  });

  it("refuses an absent or unreadable body", () => {
    expect(structuralRequestProblems(undefined)).toEqual(["NO_REQUEST_BODY"]);
    expect(structuralRequestProblems("")).toEqual(["NO_REQUEST_BODY"]);
    expect(structuralRequestProblems("not json")).toEqual(["NOT_JSON"]);
    expect(structuralRequestProblems(JSON.stringify({ messages: [] }))).toEqual(["NO_MESSAGES"]);
  });

  it("finds a frame however it is smuggled: a data URL, base64 of a PNG or WebP, or any long run", () => {
    expect(structuralRequestProblems(request({ goal: "data:image/webp;base64,AAAA", fields: [], buttons: [], references: [] }))).toContain("DATA_URL");
    expect(structuralRequestProblems(request({ goal: "iVBORw0KGgoAAAA", fields: [], buttons: [], references: [] }))).toContain("PNG_BASE64");
    expect(structuralRequestProblems(request({ goal: "UklGRiQAAABXRUJQ", fields: [], buttons: [], references: [] }))).toContain("RIFF_BASE64");
    expect(structuralRequestProblems(request({ goal: "A".repeat(200), fields: [], buttons: [], references: [] }))).toContain("LONG_BASE64_RUN");
    expect(structuralRequestProblems(request({ goal: "A".repeat(199), fields: [], buttons: [], references: [] }))).toEqual([]);
  });

  it("refuses a multipart message: an image part is not text", () => {
    const multipart = JSON.stringify({ messages: [{ role: "user", content: [{ type: "text", text: "x" }, { type: "image_url", image_url: { url: "x" } }] }] });
    const problems = structuralRequestProblems(multipart);
    expect(problems).toContain("MESSAGE_CONTENT_NOT_TEXT");
    expect(problems).toContain("IMAGE_PART");
  });

  it("refuses T1's metadata and any other unapproved field, at every level", () => {
    const base = { goal: "g", fields: [], buttons: [], references: [] };
    expect(structuralRequestProblems(request({ ...base, capability: { backend: "wasm" } }))).toContain("CONTEXT_KEY:capability");
    expect(structuralRequestProblems(request({ ...base, elements: [] }))).toContain("CONTEXT_KEY:elements");
    expect(structuralRequestProblems(request({ ...base, buttons: [{ id: "#a", name: "A", enabled: true, source: "dom+vision" }] }))).toContain("BUTTONS_KEY:source");
    expect(structuralRequestProblems(request({ ...base, fields: [{ id: "#a", name: "A", empty: true, bbox: [0, 0, 1, 1] }] }))).toContain("FIELDS_KEY:bbox");
    expect(structuralRequestProblems(request({ ...base, references: [{ token: "t", class: "c", value: "x" }] }))).toContain("REFERENCES_KEY:value");
    expect(structuralRequestProblems(request(base, { frame: "x" }))).toContain("BODY_KEY:frame");
  });

  it("refuses a context with a field missing, so an emptied request cannot pass", () => {
    expect(structuralRequestProblems(request({ goal: "g", fields: [], buttons: [] }))).toContain("CONTEXT_MISSING:references");
    expect(structuralRequestProblems(request({ goal: "g", fields: "x", buttons: [], references: [] }))).toContain("FIELDS_NOT_A_LIST");
  });
});

describe("the harnesses that used the vacuous assertion", () => {
  for (const name of ["run-consent-task.mjs", "run-declared-task.mjs"]) {
    const source = readFileSync(new URL(`../extension/${name}`, import.meta.url), "utf8");

    it(`${name} no longer judges a product task by an empty perception array`, () => {
      expect(source).not.toMatch(/productBuildCapturedNoFrame/);
      expect(source).not.toMatch(/perception\.every\(/);
    });

    it(`${name} makes the structural claims, from the record of the run`, () => {
      expect(source).toContain('from "../support/dom-only-checks.mjs"');
      expect(source).toMatch(/\.\.\.domOnlyTaskChecks\(\{/);
      expect(source).toMatch(/handoff: summariseHandoff\(t\.handoff\)/);
      expect(source).toMatch(/perceptionBoot: result\?\.perceptionBoot/);
      expect(source).toMatch(/modelRequestBodies: service\.captures\.slice\(capturesBefore\)\.map\(\(c\) => c\.body\)/);
    });

    it(`${name} keeps request bodies out of the record it writes`, () => {
      // Used for judging, then removed: the record stays free of what the model was shown.
      expect(source).toMatch(/delete r\.modelRequestBodies/);
    });
  }
});
