/**
 * M17 — A PERSON SAYS WHICH STORED VALUE GOES INTO A FIELD TWO OF THEM FIT.
 *
 * The page has two filled phone fields and one empty confirmation field, so privacy withholds the
 * empty one as `CONFLICTING_REFERENCES`. These tests hold the clarification to what it must be:
 *
 * 1. The question names the candidates by the label of the field each came from — never a value,
 *    never a token — and is asked before anything is sent, planned, restored or clicked.
 * 2. An answer is bound to exactly one question. Anything stale, forged, extended or malformed is
 *    refused, and a refusal stops the run with nothing filled and nothing submitted.
 * 3. A valid answer is evidence of intent only. Privacy re-grounds with it, the validator holds the
 *    plan to it, and the binder, the human grant, REFRESH, the permit gate and VERIFY RESULT still run.
 *
 * Only the browser, the reasoner and the person are test doubles. The sanitizer, vault, verifier,
 * `groundFill`, validator, binder, permit gate and VERIFY RESULT are the real implementations.
 */
import { describe, expect, it } from "vitest";
import { type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import {
  runTask,
  runTaskLoop,
  succeeded,
  type ClarificationRequest,
  type RunRecord,
} from "../src/index.js";
import { DEMO, RUN_OPTIONS, SECOND_MOBILE, SimulatedPage, portsFor, type PortOptions } from "./support/simulatedPage.js";

/** The model: fills the empty field with whatever privacy paired it with, then submits. */
function pairedModel(seen: ReasonerRequest[] = [], override?: (request: ReasonerRequest) => string): ReasonerClient {
  return {
    name: "test:paired-model",
    transport: "IN_PROCESS",
    async propose(request) {
      seen.push(request);
      const ref = override ? override(request) : request.fill.fillable.get("#mobile_confirm");
      const steps = ref === undefined ? [{ op: "click", target: "#submit" }] : [{ op: "insert", target: "#mobile_confirm", ref }, { op: "click", target: "#submit" }];
      return {
        planVersion: "1",
        steps,
        provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
      };
    },
  };
}

/** A person who answers the question they were shown with `pick(request)`. */
const answering = (pick: (request: ClarificationRequest) => unknown, asked: ClarificationRequest[] = []) => async (request: ClarificationRequest) => {
  asked.push(request);
  return pick(request);
};

const choose = (candidateId: string, over: Record<string, unknown> = {}) => (request: ClarificationRequest) => ({
  kind: "CHOSEN",
  clarificationId: request.clarificationId,
  sessionId: request.sessionId,
  origin: request.origin,
  viewId: request.viewId,
  documentId: request.documentId,
  target: request.target,
  candidateSetId: request.candidateSetId,
  candidateId,
  ...over,
});

const run = async (options: PortOptions & { model?: ReasonerClient } = {}, runOptions: Partial<typeof RUN_OPTIONS> & { now?: () => number } = {}) => {
  const page = new SimulatedPage({ withSecondMobile: true, ...options });
  const grants: unknown[] = [];
  const record = await runTask(
    portsFor(page, { withSecondMobile: true, ...options, reasoner: options.model ?? pairedModel(), onGrant: (g) => grants.push(g) }),
    { ...RUN_OPTIONS, ...runOptions }
  );
  return { page, record, grants };
};

/** Nothing was restored, nothing was clicked, nothing was submitted, and no planner was asked. */
const expectStoppedBeforePlanning = (page: SimulatedPage, record: RunRecord, cause: string) => {
  expect(record.state).toBe("REFUSED");
  expect(record.refusal).toMatchObject({ stage: "AWAIT_CLARIFICATION", cause });
  expect(record.response).toBeNull();
  expect(record.grant.requested).toBe(false);
  expect(record.rehydrated).toEqual([]);
  expect(page.clicks).toBe(0);
  expect(page.submitted).toBe(false);
  expect(page.find("#mobile_confirm")?.value).toBe("");
};

/** No stored value, masked or whole, and no reference token, in what a person or a record sees. */
const expectValueFree = (anything: unknown) => {
  const text = JSON.stringify(anything);
  for (const secret of [...Object.values(DEMO), SECOND_MOBILE]) expect(text.includes(secret)).toBe(false);
  expect(text.includes("0001")).toBe(false);
  expect(text.includes("0002")).toBe(false);
};

describe("the question a person is asked", () => {
  it("names both candidates by the field each came from, and holds no value and no token", async () => {
    const asked: ClarificationRequest[] = [];
    await run({ clarify: answering(choose("c1"), asked) });
    expect(asked).toHaveLength(1);
    const question = asked[0]!;
    expect(question.target).toBe("#mobile_confirm");
    expect(question.targetLabel).toBe("Confirm mobile number");
    expect(question.piiClass).toBe("PHONE");
    expect(question.candidates).toEqual([
      { candidateId: "c1", sourceLabel: "Mobile number", piiClass: "PHONE" },
      { candidateId: "c2", sourceLabel: "Alternate mobile number", piiClass: "PHONE" },
    ]);
    expectValueFree(question);
    expect(JSON.stringify(question).includes("<PII:")).toBe(false);
  });

  it("is asked before anything is sent to a planner", async () => {
    const order: string[] = [];
    const seen: ReasonerRequest[] = [];
    const model = pairedModel(seen);
    const watched: ReasonerClient = { ...model, propose: (r) => (order.push("planner"), model.propose(r)) };
    await run({ model: watched, clarify: async (request) => (order.push("person"), choose("c1")(request)) });
    expect(order).toEqual(["person", "planner"]);
  });

  it("is not asked for a field whose type is unknown, nor when one value fits", async () => {
    const asked: ClarificationRequest[] = [];
    const { record } = await run({ withSecondMobile: false, withNotesField: true, clarify: answering(choose("c1"), asked) });
    expect(asked).toEqual([]);
    expect(record.clarifications).toEqual([]);
    expect(succeeded(record)).toBe(true);
  });
});

describe("choosing a candidate", () => {
  it("the first: restores the registered number through the normal grant, submits, and the page confirms it", async () => {
    const seen: ReasonerRequest[] = [];
    const { page, record, grants } = await run({ model: pairedModel(seen), clarify: answering(choose("c1")) });
    expect([...seen[0]!.fill.fillable]).toEqual([["#mobile_confirm", "<PII:PHONE:1>"]]);
    expect(seen[0]!.fill.chosenByPerson).toEqual(["#mobile_confirm"]);
    expect(record.clarifications).toEqual([{ target: "#mobile_confirm", candidates: 2, outcome: "CHOSEN", candidateId: "c1" }]);
    expect(grants).toHaveLength(1); // the choice did not replace the grant
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
    expect(page.clicks).toBe(1);
    expect(succeeded(record)).toBe(true);
    expectValueFree({ fill: record.fill, clarifications: record.clarifications, refusal: record.refusal });
  });

  it("the second: restores the alternate number, exactly as chosen — and the page's own check decides the result", async () => {
    const { page, record } = await run({ clarify: answering(choose("c2")) });
    expect(record.fill?.fillable).toEqual([{ target: "#mobile_confirm", ref: "<PII:PHONE:2>" }]);
    expect(page.find("#mobile_confirm")?.value === SECOND_MOBILE).toBe(true);
    // The fixture accepts only the registered number. The client did not second-guess the person,
    // and did not claim success the page did not show.
    expect(page.submitted).toBe(false);
    expect(record.act?.verification?.verification).toBe("NOT_CONFIRMED");
    expect(succeeded(record)).toBe(false);
  });

  it("does not let the model override the person: the other candidate is refused, nothing restored", async () => {
    const { page, record } = await run({
      model: pairedModel([], (r) => r.handoff.redactions.find((x) => x.targetId === "#mobile")!.token),
      clarify: answering(choose("c2")),
    });
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "REFERENCE_NOT_GROUNDED" });
    expect(record.refusal?.planRefusal?.fillCause).toBe("NOT_THE_GROUNDED_REFERENCE");
    expect(record.fallback?.fellBack ?? false).toBe(false);
    expect(record.rehydrated).toEqual([]);
    expect(page.clicks).toBe(0);
  });

  it("does not bypass the binder or the human grant: a denied grant still stops the run", async () => {
    const { page, record } = await run({ clarify: answering(choose("c1")), grant: { granted: false, reason: "DENIED" } });
    expect(record.refusal).toMatchObject({ stage: "AWAIT_GRANT", cause: "DENIED" });
    expect(record.rehydrated).toEqual([]);
    expect(page.find("#mobile_confirm")?.value).toBe("");
    expect(page.clicks).toBe(0);
  });

  it("does not authorise any action: a plan clicking an undeclared control is still refused", async () => {
    const model: ReasonerClient = {
      name: "test:undeclared-click",
      transport: "IN_PROCESS",
      async propose(request) {
        return {
          planVersion: "1",
          steps: [
            { op: "insert", target: "#mobile_confirm", ref: request.fill.fillable.get("#mobile_confirm") },
            { op: "click", target: "#mobile_alt" },
          ],
          provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
        };
      },
    };
    const { page, record } = await run({ model, clarify: answering(choose("c1")) });
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "NO_DECLARED_POSTCONDITION" });
    expect(record.rehydrated).toEqual([]);
    expect(page.clicks).toBe(0);
  });
});

describe("an answer that does not answer this question is refused, and nothing is filled", () => {
  it.each([
    ["an unknown candidate id", choose("c3"), "UNKNOWN_CANDIDATE"],
    ["an empty candidate id", choose(""), "UNKNOWN_CANDIDATE"],
    ["a prototype key as candidate id", choose("__proto__"), "UNKNOWN_CANDIDATE"],
    ["an answer to an earlier question", choose("c1", { clarificationId: "earlier-request.clarify.1" }), "NOT_THIS_CLARIFICATION"],
    ["an answer from an earlier reading of the page", choose("c1", { viewId: "earlier-view" }), "STALE_VIEW"],
    ["an answer for another document", choose("c1", { documentId: "another-doc" }), "DOCUMENT_CHANGED"],
    ["an answer for another session", choose("c1", { sessionId: "another-session" }), "SESSION_MISMATCH"],
    ["an answer for another site", choose("c1", { origin: "http://127.0.0.1:9999" }), "ORIGIN_MISMATCH"],
    ["an answer for another field", choose("c1", { target: "#mobile" }), "TARGET_MISMATCH"],
    ["an answer for another candidate set", choose("c1", { candidateSetId: "#mobile_confirm|c1=#mobile,c2=#elsewhere" }), "CANDIDATE_SET_CHANGED"],
    ["an answer that also names an action", choose("c1", { action: { target: "#submit" } }), "MALFORMED_ANSWER"],
    ["an answer that carries a value", choose("c1", { value: "9000000009" }), "MALFORMED_ANSWER"],
    ["an answer that names a reference", choose("c1", { ref: "<PII:PHONE:2>" }), "MALFORMED_ANSWER"],
    ["a candidate id that is not a string", choose("c1", { candidateId: 1 }), "MALFORMED_ANSWER"],
    ["nothing at all", () => null, "MALFORMED_ANSWER"],
    ["text", () => "c1", "MALFORMED_ANSWER"],
  ])("%s", async (_, pick, cause) => {
    const { page, record } = await run({ clarify: answering(pick as (r: ClarificationRequest) => unknown) });
    expectStoppedBeforePlanning(page, record, cause);
    expect(record.clarifications).toEqual([{ target: "#mobile_confirm", candidates: 2, outcome: cause }]);
  });

  it("an answer that arrives after the question expired", async () => {
    let now = 1_000_000;
    const { page, record } = await run(
      {
        clarify: async (request) => {
          now = request.expiresAt + 1;
          return choose("c1")(request);
        },
      },
      { now: () => now }
    );
    expectStoppedBeforePlanning(page, record, "CLARIFICATION_EXPIRED");
  });
});

describe("declining, failing, and what cannot be asked", () => {
  it("declining leaves the field empty, asks no planner, and chooses nothing instead", async () => {
    const { page, record } = await run({ clarify: answering((r) => ({ kind: "DECLINED", clarificationId: r.clarificationId })) });
    expectStoppedBeforePlanning(page, record, "CLARIFICATION_DECLINED");
    expect(record.fill?.fillable).toEqual([]);
    expect(record.fill?.chosenByPerson).toEqual([]);
  });

  it("a decline for another question is not a decline of this one, and still stops", async () => {
    const { page, record } = await run({ clarify: answering(() => ({ kind: "DECLINED", clarificationId: "other" })) });
    expectStoppedBeforePlanning(page, record, "NOT_THIS_CLARIFICATION");
  });

  it("a prompt that fails stops the run", async () => {
    const { page, record } = await run({
      clarify: async () => {
        throw new Error("panel closed");
      },
    });
    expectStoppedBeforePlanning(page, record, "CLARIFICATION_FAILED");
  });

  it("candidates the labels cannot tell apart: nobody is asked to pick blind; enter it yourself", async () => {
    const asked: ClarificationRequest[] = [];
    const { page, record } = await run({ secondMobileLabel: "Mobile number", clarify: answering(choose("c1"), asked) });
    expect(asked).toEqual([]);
    expectStoppedBeforePlanning(page, record, "CANDIDATES_INDISTINGUISHABLE");
    expect(record.refusal?.detail).toMatch(/Enter the value yourself/);
  });

  it("the page changing while the person chooses: the choice is not applied", async () => {
    const page = new SimulatedPage({ withSecondMobile: true, withStructure: true });
    const record = await runTask(
      portsFor(page, {
        withSecondMobile: true,
        withStructure: true,
        reasoner: pairedModel(),
        clarify: async (request) => {
          page.structureSeq += 1; // the page moved while the panel was open
          return choose("c1")(request);
        },
      }),
      RUN_OPTIONS
    );
    expectStoppedBeforePlanning(page, record, "CLARIFICATION_STALE");
  });

  it("an unchanged page with the structural signal on: the choice applies and the task completes", async () => {
    const { record } = await run({ withStructure: true, clarify: answering(choose("c1")) });
    expect(succeeded(record)).toBe(true);
  });
});

describe("in the multi-turn loop (M14) with action verification (M15)", () => {
  it("asks once, on the turn that needs it; the next turn sees a filled field and nothing to ask", async () => {
    const asked: ClarificationRequest[] = [];
    let turn = 0;
    const model: ReasonerClient = {
      name: "test:loop",
      transport: "IN_PROCESS",
      async propose(request) {
        turn += 1;
        if (turn === 2) {
          return {
            planVersion: "1",
            steps: [{ op: "done" }],
            provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
          };
        }
        return pairedModel().propose(request);
      },
    };
    const page = new SimulatedPage({ withSecondMobile: true });
    const result = await runTaskLoop(portsFor(page, { withSecondMobile: true, reasoner: model, clarify: answering(choose("c1"), asked) }), {
      ...RUN_OPTIONS,
      maxTurns: 3,
    });
    expect(asked).toHaveLength(1);
    expect(result.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(result.confirmedActions).toBe(1);
    expect(result.turns[1]!.clarifications).toEqual([]);
    expect(page.clicks).toBe(1);
  });

  it("a declined question stops the loop as a refusal; no later turn runs", async () => {
    const page = new SimulatedPage({ withSecondMobile: true });
    const result = await runTaskLoop(
      portsFor(page, { withSecondMobile: true, reasoner: pairedModel(), clarify: answering((r) => ({ kind: "DECLINED", clarificationId: r.clarificationId })) }),
      { ...RUN_OPTIONS, maxTurns: 3 }
    );
    expect(result.outcome).toBe("STOPPED_REFUSED");
    expect(result.turns).toHaveLength(1);
    expect(page.clicks).toBe(0);
  });
});
