/**
 * M19 — consent in the extension: the desk that holds the request in the offscreen document, the
 * side panel's view and answer, the wiring that keeps pages and the control plane from answering,
 * and the whole path against the REAL gates (the shipped orchestrator, binder and VERIFY RESULT).
 * A UI-only test could not show that a forged or stale allow is refused; the last block does.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTask, succeeded, type ConsentRequest } from "@pratibimb/orchestrator";
import { deterministicReasoner } from "@pratibimb/reasoner";

import { createConsentDesk } from "../host-lib/consent-desk";
import { consentAnswer, consentViewOf } from "../host-lib/consent-panel";
import { DEMO, RUN_OPTIONS, SimulatedPage, portsFor } from "../../../packages/orchestrator/test/support/simulatedPage";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const strip = (source: string): string => source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");

/** A request exactly as the orchestrator prepares one. Synthetic; no value in it. */
const REQUEST: ConsentRequest = {
  consentId: "req-1.consent.1",
  sessionId: "s-1",
  requestId: "req-1",
  origin: "http://127.0.0.1:8975",
  documentId: "doc-1",
  viewId: "req-1",
  target: "#mobile_confirm",
  targetLabel: "Confirm mobile number",
  fingerprint: "#mobile_confirm|textbox|Confirm mobile number",
  ref: "<PII:PHONE:1>",
  piiClass: "PHONE",
  statement: "PratiBimb is about to put your phone number into “Confirm mobile number” on http://127.0.0.1:8975.",
  then: { target: "#submit", label: "Submit application" },
};
const SUFFIX = { style: "SUFFIX" as const, text: "••••••••42" };

describe("the desk in the offscreen document", () => {
  it("shows the panel the site, field, kind and masked preview — no reference, no fingerprint", () => {
    const desk = createConsentDesk();
    void desk.ask(REQUEST, SUFFIX);
    const view = desk.peek()!;
    expect(view).toMatchObject({ origin: REQUEST.origin, targetLabel: "Confirm mobile number", category: "phone number", preview: SUFFIX });
    expect(JSON.stringify(view)).not.toMatch(/PII:|fingerprint|textbox\|/);
  });

  it("shows the generic indicator when no safe preview could be produced", () => {
    const desk = createConsentDesk();
    void desk.ask(REQUEST, null);
    expect(desk.peek()?.preview).toEqual({ style: "GENERIC", text: "••••••" });
  });

  it("takes one answer: a duplicate finds nothing pending", async () => {
    const desk = createConsentDesk();
    const waiting = desk.ask(REQUEST, SUFFIX);
    const allow = consentAnswer(desk.peek(), true)!;
    expect(desk.decide(allow)).toEqual({ answered: true });
    expect(desk.decide(allow)).toEqual({ answered: false, refused: "NOTHING_PENDING" });
    await expect(waiting).resolves.toEqual(allow);
  });

  it("turns away a replayed answer to an earlier request and keeps waiting", () => {
    const desk = createConsentDesk();
    void desk.ask(REQUEST, SUFFIX);
    const stale = { ...consentAnswer(desk.peek(), true)!, consentId: "req-0.consent.1" };
    expect(desk.decide(stale)).toEqual({ answered: false, refused: "NOT_THIS_CONSENT" });
    expect(desk.peek()?.consentId).toBe(REQUEST.consentId);
  });

  it.each([[null], ["ALLOW_ONCE"], [[]]])("turns away a non-object answer (%j)", (raw) => {
    const desk = createConsentDesk();
    void desk.ask(REQUEST, SUFFIX);
    expect(desk.decide(raw)).toEqual({ answered: false, refused: "MALFORMED_CONSENT" });
  });

  it("ends an unanswered request with the run, or a closed panel, as a denial — never as an allow", async () => {
    const desk = createConsentDesk();
    const waiting = desk.ask(REQUEST, SUFFIX);
    desk.clear();
    await expect(waiting).resolves.toEqual({ kind: "DENY", consentId: REQUEST.consentId });
    expect(desk.peek()).toBeNull();
  });
});

describe("the side panel's screen and answer", () => {
  const view = () => {
    const desk = createConsentDesk();
    void desk.ask(REQUEST, SUFFIX);
    return desk.peek();
  };

  it("states the site, the field, the kind of value, the preview, the restoration and the click that follows", () => {
    expect(consentViewOf(view())).toEqual({
      consentId: REQUEST.consentId,
      heading: "Allow PratiBimb to use your phone number?",
      site: REQUEST.origin,
      field: "Confirm mobile number",
      category: "phone number",
      preview: "••••••••42",
      statement: REQUEST.statement,
      then: "If you allow it, PratiBimb will then click “Submit application”, and check the page shows the expected result.",
    });
  });

  it.each([
    ["more than two digits", { style: "SUFFIX", text: "••••••0042" }],
    ["the whole number", { style: "SUFFIX", text: "9000000042" }],
    ["an unknown style", { style: "REVEAL", text: "9000000042" }],
    ["a generic mark that is not the generic mark", { style: "GENERIC", text: "Ramesh" }],
  ])("shows the generic indicator instead of a preview with %s", (_, preview) => {
    expect(consentViewOf({ ...view(), preview })?.preview).toBe("••••••");
  });

  it("allows once with the request's own bindings, or denies with only its id — nothing else", () => {
    expect(consentAnswer(view(), true)).toEqual({ kind: "ALLOW_ONCE", consentId: REQUEST.consentId, sessionId: "s-1", origin: REQUEST.origin, documentId: "doc-1", target: "#mobile_confirm" });
    expect(consentAnswer(view(), false)).toEqual({ kind: "DENY", consentId: REQUEST.consentId });
    expect(consentAnswer({ nonsense: true }, true)).toBeNull();
  });
});

describe("only the person's side panel can answer", () => {
  const offscreen = strip(readFileSync(join(ROOT, "apps/extension/host/offscreen/main.ts"), "utf8"));
  const messages = strip(readFileSync(join(ROOT, "apps/extension/host-lib/messages.ts"), "utf8"));
  const run = strip(readFileSync(join(ROOT, "apps/extension/host-lib/extension-run.ts"), "utf8"));
  const panel = strip(readFileSync(join(ROOT, "apps/extension/host/sidepanel/main.ts"), "utf8"));
  const html = readFileSync(join(ROOT, "apps/extension/host/sidepanel/index.html"), "utf8");

  it("CONSENT_PEEK and CONSENT_DECIDE are refused unless the sender is the side panel page", () => {
    expect(offscreen).toMatch(/if \(msg\.kind === "CONSENT_PEEK" \|\| msg\.kind === "CONSENT_DECIDE"\) \{\s*if \(!isFromSidePanel\(sender\)\) \{\s*sendResponse\(\{ refused: "NOT_FROM_THE_SIDE_PANEL" \}\);\s*return false;/);
    expect(messages).toMatch(/isFromSidePanel = \(sender: chrome\.runtime\.MessageSender\): boolean =>\s*isFromThisExtension\(sender\) && typeof sender\.url === "string" && sender\.url\.startsWith\(chrome\.runtime\.getURL\("sidepanel\.html"\)\)/);
  });

  it("asks in the panel only for a task started in the panel; a control-plane run keeps its grant path", () => {
    expect(offscreen).toContain("...(startedInThePanel ? { askConsent: (consent, preview) => consentDesk.ask(consent, preview) } : {}),");
    expect(offscreen).toMatch(/declaration,\s*\}, true\)/);
    expect(offscreen).toMatch(/clarificationDesk\.clear\(\);\s*consentDesk\.clear\(\);/);
  });

  it("the preview comes from the page realm and goes only to the desk", () => {
    expect(run).toContain("const preview = await privacy.preview(request.ref, request.target).catch(() => null);");
    expect(run).toContain("return deps.askConsent!(request, preview);");
    // The result the run returns — what crosses to the worker and into records — never names it.
    const result = /return \{\s*record: crossable\(record\),[\s\S]*?\n {4}\};/.exec(run)?.[0] ?? "";
    expect(result).toContain("consentsAsked");
    expect(result).not.toContain("preview");
  });

  it("the panel renders text only, has no reveal or always-allow control, and no free text in the consent box", () => {
    expect(panel).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    const box = /<fieldset id="consent"[\s\S]*?<\/fieldset>/.exec(html)?.[0] ?? "";
    expect(box).not.toMatch(/<input|<textarea|reveal|always/i);
    expect(box).toContain("Allow once");
    expect(box).toContain("Deny");
  });
});

describe("panel → desk → the real gates", () => {
  /** The person at the panel: waits for the request, then does `act` with what the panel shows. */
  const drive = async (act: (raw: unknown) => unknown) => {
    const desk = createConsentDesk();
    const page = new SimulatedPage();
    const running = runTask(portsFor(page, { reasoner: deterministicReasoner(), consent: (request) => desk.ask(request, SUFFIX) }), RUN_OPTIONS);
    for (let i = 0; i < 200 && desk.peek() === null; i++) await new Promise((r) => setTimeout(r, 1));
    const shown = desk.peek();
    const reply = desk.decide(act(shown));
    return { page, shown, reply, record: await running };
  };

  it("Allow once: the value is restored into that field, and the click is verified by the page", async () => {
    const { page, record } = await drive((raw) => consentAnswer(raw, true));
    expect(succeeded(record)).toBe(true);
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
    expect(record.consents).toEqual([{ target: "#mobile_confirm", piiClass: "PHONE", outcome: "ALLOWED_ONCE" }]);
  });

  it("Deny: nothing restored, nothing clicked", async () => {
    const { page, record } = await drive((raw) => consentAnswer(raw, false));
    expect(record.refusal).toMatchObject({ stage: "AWAIT_GRANT", cause: "CONSENT_DENIED" });
    expect(page.find("#mobile_confirm")?.value).toBe("");
    expect(page.clicks).toBe(0);
  });

  it("a forged allow that gets past the desk is refused by the orchestrator", async () => {
    const { page, reply, record } = await drive((raw) => ({ ...consentAnswer(raw, true), target: "#mobile" }));
    expect(reply).toEqual({ answered: true }); // the desk is not the authority
    expect(record.refusal?.cause).toBe("TARGET_MISMATCH");
    expect(page.find("#mobile_confirm")?.value).toBe("");
    expect(page.clicks).toBe(0);
  });

  it("an allow carrying a widened scope gets past the desk and is refused as malformed", async () => {
    const { page, record } = await drive((raw) => ({ ...consentAnswer(raw, true), scope: "THIS_SITE_ALWAYS" }));
    expect(record.refusal?.cause).toBe("MALFORMED_CONSENT");
    expect(page.clicks).toBe(0);
  });

  it("the run's record holds the outcome, never the preview", async () => {
    const { record } = await drive((raw) => consentAnswer(raw, true));
    const { initialObservation: _i, observation: _o, ...crossing } = record;
    expect(JSON.stringify(crossing).includes(SUFFIX.text)).toBe(false);
  });
});
