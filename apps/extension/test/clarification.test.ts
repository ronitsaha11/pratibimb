/**
 * M17 — the "which stored value?" question in the extension: the desk that holds it in the offscreen
 * document, the side panel's view of it and the answer the panel builds, and the wiring that keeps a
 * page from reading or answering it.
 *
 * The last block drives the whole path against the REAL gates: a run of the shipped orchestrator
 * parks its question on the desk, the panel model reads it and answers, and what the answer is
 * worth is decided by `checkClarificationAnswer`, `groundFill`, the validator and the binder — not
 * by anything in this app. A UI-only test could not show that an invalid choice is refused.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTask, succeeded, type ClarificationRequest } from "@pratibimb/orchestrator";
import { type ReasonerClient } from "@pratibimb/reasoner";

import { createClarificationDesk } from "../host-lib/clarification-desk";
import { panelAnswer, panelViewOf } from "../host-lib/clarification-panel";
import { DEMO, RUN_OPTIONS, SECOND_MOBILE, SimulatedPage, portsFor } from "../../../packages/orchestrator/test/support/simulatedPage";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const strip = (source: string): string => source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");

/** A question exactly as the orchestrator would prepare one. Synthetic; no value in it. */
const QUESTION: ClarificationRequest = {
  clarificationId: "req-1.clarify.1",
  sessionId: "s-1",
  requestId: "req-1",
  origin: "http://127.0.0.1:8975",
  viewId: "req-1",
  documentId: "doc-1",
  target: "#mobile_confirm",
  targetLabel: "Confirm mobile number",
  piiClass: "PHONE",
  candidates: [
    { candidateId: "c1", sourceLabel: "Mobile number", piiClass: "PHONE" },
    { candidateId: "c2", sourceLabel: "Alternate mobile number", piiClass: "PHONE" },
  ],
  candidateSetId: "#mobile_confirm|c1=#mobile,c2=#mobile_alt",
  expiresAt: 2_000_000_000_000,
  question: 'More than one stored phone could go into "Confirm mobile number". Which one should PratiBimb use?',
};

describe("the desk in the offscreen document", () => {
  it("holds one question until it is answered, once", async () => {
    const desk = createClarificationDesk();
    expect(desk.peek()).toBeNull();
    const waiting = desk.ask(QUESTION);
    expect(desk.peek()).toBe(QUESTION);
    const answer = panelAnswer(desk.peek(), "c1")!;
    expect(desk.decide(answer)).toEqual({ answered: true });
    await expect(waiting).resolves.toEqual(answer);
    expect(desk.peek()).toBeNull();
  });

  it("refuses a duplicate submission: the second finds nothing pending", async () => {
    const desk = createClarificationDesk();
    const waiting = desk.ask(QUESTION);
    expect(desk.decide(panelAnswer(QUESTION, "c1"))).toEqual({ answered: true });
    expect(desk.decide(panelAnswer(QUESTION, "c2"))).toEqual({ answered: false, refused: "NOTHING_PENDING" });
    await expect(waiting).resolves.toMatchObject({ candidateId: "c1" });
  });

  it("does not let an answer to an older question settle the one waiting", () => {
    const desk = createClarificationDesk();
    void desk.ask(QUESTION);
    expect(desk.decide({ ...panelAnswer(QUESTION, "c1"), clarificationId: "older.clarify.1" })).toEqual({ answered: false, refused: "NOT_THIS_CLARIFICATION" });
    expect(desk.peek()).toBe(QUESTION);
  });

  it.each([[null], ["c1"], [["c1"]]])("refuses an answer that is not an object (%j), and keeps waiting", (raw) => {
    const desk = createClarificationDesk();
    void desk.ask(QUESTION);
    expect(desk.decide(raw)).toEqual({ answered: false, refused: "MALFORMED_ANSWER" });
    expect(desk.peek()).toBe(QUESTION);
  });

  it("ends an unanswered question with the run, as a decline nobody gave — never as a choice", async () => {
    const desk = createClarificationDesk();
    const waiting = desk.ask(QUESTION);
    desk.clear();
    await expect(waiting).resolves.toEqual({ kind: "DECLINED", clarificationId: QUESTION.clarificationId });
    expect(desk.peek()).toBeNull();
  });
});

describe("the side panel's view and answer", () => {
  it("shows the question and one option per candidate, by the field each came from", () => {
    expect(panelViewOf(QUESTION)).toEqual({
      clarificationId: QUESTION.clarificationId,
      question: QUESTION.question,
      fieldLabel: "Confirm mobile number",
      options: [
        { candidateId: "c1", text: "The number from “Mobile number”" },
        { candidateId: "c2", text: "The number from “Alternate mobile number”" },
      ],
    });
  });

  it("shows nothing for no question, or one it cannot read", () => {
    expect(panelViewOf(null)).toBeNull();
    expect(panelViewOf({ ...QUESTION, candidates: [QUESTION.candidates[0]] })).toBeNull();
    expect(panelViewOf({ ...QUESTION, clarificationId: 7 })).toBeNull();
  });

  it.each(["c1", "c2"])("answers %s with the question's own bindings and nothing else", (candidateId) => {
    expect(panelAnswer(QUESTION, candidateId)).toEqual({
      kind: "CHOSEN",
      clarificationId: QUESTION.clarificationId,
      sessionId: QUESTION.sessionId,
      origin: QUESTION.origin,
      viewId: QUESTION.viewId,
      documentId: QUESTION.documentId,
      target: QUESTION.target,
      candidateSetId: QUESTION.candidateSetId,
      candidateId,
    });
  });

  it("declines with nothing but the question it declines", () => {
    expect(panelAnswer(QUESTION, null)).toEqual({ kind: "DECLINED", clarificationId: QUESTION.clarificationId });
  });

  it("sends nothing for a candidate the question did not offer", () => {
    expect(panelAnswer(QUESTION, "c3")).toBeNull();
    expect(panelAnswer(QUESTION, "")).toBeNull();
  });
});

describe("only an extension page can read or answer the question", () => {
  const offscreen = strip(readFileSync(join(ROOT, "apps/extension/host/offscreen/main.ts"), "utf8"));
  const messages = strip(readFileSync(join(ROOT, "apps/extension/host-lib/messages.ts"), "utf8"));
  const panel = strip(readFileSync(join(ROOT, "apps/extension/host/sidepanel/main.ts"), "utf8"));

  it("checks the sender is one of this extension's pages before either message is handled", () => {
    expect(offscreen).toMatch(
      /if \(msg\.kind === "CLARIFY_PEEK" \|\| msg\.kind === "CLARIFY_DECIDE"\) \{\s*if \(!isFromExtensionUi\(sender\)\) \{\s*sendResponse\(\{ refused: "NOT_FROM_AN_EXTENSION_PAGE" \}\);\s*return false;/
    );
    expect(messages).toMatch(/isFromExtensionUi = \(sender: chrome\.runtime\.MessageSender\): boolean =>\s*isFromThisExtension\(sender\) && typeof sender\.url === "string" && sender\.url\.startsWith\(chrome\.runtime\.getURL\(""\)\)/);
  });

  it("parks the run's question on the desk and clears it when the run ends", () => {
    expect(offscreen).toContain("askPerson: (question) => clarificationDesk.ask(question)");
    expect(offscreen).toMatch(/pendingGrant = null;\s*clarificationDesk\.clear\(\);/);
  });

  it("the panel renders labels as text, never as markup, and has no free-text answer", () => {
    expect(panel).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(panel).toContain("panelAnswer(shown.raw, candidateId)");
    const html = readFileSync(join(ROOT, "apps/extension/host/sidepanel/index.html"), "utf8");
    const box = /<fieldset id="clarify"[\s\S]*?<\/fieldset>/.exec(html)?.[0] ?? "";
    expect(box).not.toMatch(/<input|<textarea/);
  });
});

describe("panel → desk → the real gates", () => {
  /** The model: whatever privacy paired the empty field with, then submit. */
  const model: ReasonerClient = {
    name: "test:paired",
    transport: "IN_PROCESS",
    async propose(request) {
      const ref = request.fill.fillable.get("#mobile_confirm");
      return {
        planVersion: "1",
        steps: ref === undefined ? [{ op: "click", target: "#submit" }] : [{ op: "insert", target: "#mobile_confirm", ref }, { op: "click", target: "#submit" }],
        provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
      };
    },
  };

  /** The person, at the panel: waits for the question, then does `act` with it. */
  const atThePanel = async (desk: ReturnType<typeof createClarificationDesk>, act: (raw: unknown) => unknown) => {
    for (let i = 0; i < 200 && desk.peek() === null; i++) await new Promise((r) => setTimeout(r, 1));
    const raw = desk.peek();
    return { raw, reply: desk.decide(act(raw)) };
  };

  const drive = async (act: (raw: unknown) => unknown) => {
    const desk = createClarificationDesk();
    const page = new SimulatedPage({ withSecondMobile: true });
    const running = runTask(portsFor(page, { withSecondMobile: true, reasoner: model, clarify: (q) => desk.ask(q) }), RUN_OPTIONS);
    const panel = await atThePanel(desk, act);
    return { page, panel, record: await running };
  };

  it("choosing the first option fills the registered number and the page confirms the submission", async () => {
    const { page, panel, record } = await drive((raw) => panelAnswer(raw, "c1"));
    expect(panelViewOf(panel.raw)?.options.map((o) => o.text)).toEqual(["The number from “Mobile number”", "The number from “Alternate mobile number”"]);
    expect(JSON.stringify(panel.raw).includes(DEMO.mobile) || JSON.stringify(panel.raw).includes(SECOND_MOBILE)).toBe(false);
    expect(succeeded(record)).toBe(true);
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
  });

  it("choosing the second option fills the alternate number, and the result is the page's", async () => {
    const { page, record } = await drive((raw) => panelAnswer(raw, "c2"));
    expect(page.find("#mobile_confirm")?.value === SECOND_MOBILE).toBe(true);
    expect(record.act?.verification?.verification).toBe("NOT_CONFIRMED");
  });

  it("declining at the panel: nothing filled, nothing clicked, nothing asked of a planner", async () => {
    const { page, record } = await drive((raw) => panelAnswer(raw, null));
    expect(record.refusal).toMatchObject({ stage: "AWAIT_CLARIFICATION", cause: "CLARIFICATION_DECLINED" });
    expect(record.response).toBeNull();
    expect(page.clicks).toBe(0);
    expect(page.find("#mobile_confirm")?.value).toBe("");
  });

  it("a forged answer that gets past the desk is still refused by the orchestrator", async () => {
    const { page, panel, record } = await drive((raw) => ({ ...panelAnswer(raw, "c1"), candidateId: "c9" }));
    expect(panel.reply).toEqual({ answered: true }); // the desk is not the authority
    expect(record.refusal).toMatchObject({ stage: "AWAIT_CLARIFICATION", cause: "UNKNOWN_CANDIDATE" });
    expect(page.find("#mobile_confirm")?.value).toBe("");
    expect(page.clicks).toBe(0);
  });

  it("an answer carrying an action gets past the desk and is refused as malformed", async () => {
    const { page, record } = await drive((raw) => ({ ...panelAnswer(raw, "c1"), action: { op: "click", target: "#submit" } }));
    expect(record.refusal?.cause).toBe("MALFORMED_ANSWER");
    expect(page.clicks).toBe(0);
  });
});
