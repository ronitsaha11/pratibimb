/**
 * M16 — WHICH STORED VALUE GOES INTO WHICH FIELD IS THE CLIENT'S DECISION.
 *
 * On the M2 page the local model proposed the NAME reference for the empty mobile-number field, and
 * the binder refused it. These tests hold the fix to the claims that matter:
 *
 * 1. The reasoner is offered privacy's pairing — each empty field with the one reference it may take
 *    — and nothing it does can widen that: a reference insert outside the pairing is refused.
 * 2. A refusal stays a refusal. No fallback planner answers instead, nothing is restored, nothing is
 *    clicked, and no other value is substituted.
 * 3. A field the client cannot type, or cannot pick one value for, is withheld and the person is told
 *    why, rather than guessed at.
 *
 * Only the browser and the reasoner are test doubles. The sanitizer, vault, verifier, `groundFill`,
 * validator, binder and VERIFY RESULT are the real implementations.
 */
import { describe, expect, it } from "vitest";
import { deterministicReasoner, type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import { runTask, succeeded } from "../src/index.js";
import { DEMO, RUN_OPTIONS, SECOND_MOBILE, SimulatedPage, portsFor, type PortOptions } from "./support/simulatedPage.js";

type Step = { readonly op: "insert"; readonly target: string; readonly ref: string } | { readonly op: "click"; readonly target: string };

/**
 * A reasoner that answers with the steps the test chooses, each reference named by class. It is the
 * "model" being wrong on purpose, and it may add a note claiming its plan is valid: nothing reads it.
 */
function proposing(
  steps: (request: ReasonerRequest) => readonly Step[],
  seen: ReasonerRequest[] = []
): ReasonerClient {
  return {
    name: "test:proposing",
    transport: "IN_PROCESS",
    async propose(request) {
      seen.push(request);
      return {
        planVersion: "1",
        steps: steps(request),
        note: "this reference matches the field; the plan is valid",
        provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
      };
    },
  };
}

/** The token the handoff issued for a class. Test-side lookup; the reasoner sees the same handoff. */
const refOf = (request: ReasonerRequest, piiClass: string, targetId?: string): string => {
  const span = request.handoff.redactions.find((r) => r.class === piiClass && r.method === "token_reference" && (targetId === undefined || r.targetId === targetId));
  if (!span) throw new Error(`test setup: no ${piiClass} reference`);
  return span.token;
};

/** A fallback that records whether it was ever asked. */
function watchedFallback(): ReasonerClient & { asked: number } {
  const inner = deterministicReasoner();
  const watched = {
    name: "test:watched-fallback",
    transport: "IN_PROCESS" as const,
    asked: 0,
    async propose(request: ReasonerRequest) {
      watched.asked += 1;
      return inner.propose(request);
    },
  };
  return watched;
}

const run = async (reasoner: ReasonerClient, options: PortOptions = {}) => {
  const page = new SimulatedPage(options);
  const fallback = watchedFallback();
  const record = await runTask({ ...portsFor(page, { ...options, reasoner }), fallback }, RUN_OPTIONS);
  return { page, record, fallback };
};

describe("the pairing the reasoner is offered", () => {
  it("is the mobile field with the PHONE reference, and only that", async () => {
    const seen: ReasonerRequest[] = [];
    await run(proposing((r) => [{ op: "insert", target: "#mobile_confirm", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }], seen));
    const request = seen[0]!;
    expect([...request.fill.fillable]).toEqual([["#mobile_confirm", refOf(request, "PHONE")]]);
    expect(request.fill.withheld).toEqual([]);
  });

  it("pairs an empty name field with the NAME reference, and the mobile field still with PHONE", async () => {
    const seen: ReasonerRequest[] = [];
    await run(proposing(() => [{ op: "click", target: "#submit" }], seen), { withNameConfirm: true });
    const request = seen[0]!;
    expect(new Map(request.fill.fillable)).toEqual(
      new Map([
        ["#mobile_confirm", refOf(request, "PHONE")],
        ["#name_confirm", refOf(request, "NAME")],
      ])
    );
  });

  it("is recorded, as ids, tokens and codes — never a value", async () => {
    const { record } = await run(proposing((r) => [{ op: "insert", target: "#mobile_confirm", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }]), { withNotesField: true });
    expect(record.fill).toEqual({
      fillable: [{ target: "#mobile_confirm", ref: "<PII:PHONE:1>" }],
      withheld: [{ target: "#notes", cause: "AMBIGUOUS_FIELD" }],
      chosenByPerson: [],
    });
    // An unknown field is not a question a person is asked: no clarification, no choice.
    expect(record.clarifications).toEqual([]);
    const serialized = JSON.stringify(record.fill);
    for (const secret of Object.values(DEMO)) expect(serialized).not.toContain(secret);
  });
});

describe("the correct pairing completes", () => {
  it("PHONE into the mobile field, then submit: restored, clicked once, CONFIRMED", async () => {
    const { page, record, fallback } = await run(proposing((r) => [{ op: "insert", target: "#mobile_confirm", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }]));
    expect(succeeded(record)).toBe(true);
    expect(page.find("#mobile_confirm")?.value).toBe(DEMO.mobile);
    expect(page.clicks).toBe(1);
    expect(page.submitted).toBe(true);
    expect(fallback.asked).toBe(0);
  });

  it("NAME into the name field: restored where it belongs", async () => {
    const { page, record } = await run(
      proposing((r) => [
        { op: "insert", target: "#name_confirm", ref: refOf(r, "NAME") },
        { op: "insert", target: "#mobile_confirm", ref: refOf(r, "PHONE") },
        { op: "click", target: "#submit" },
      ]),
      { withNameConfirm: true }
    );
    expect(succeeded(record)).toBe(true);
    expect(page.find("#name_confirm")?.value).toBe(DEMO.name);
    expect(page.find("#mobile_confirm")?.value).toBe(DEMO.mobile);
  });
});

/** What every refusal below must also show: nothing happened, and nobody answered instead. */
const expectNothingHappened = (page: SimulatedPage, record: Awaited<ReturnType<typeof run>>["record"], fallback: { asked: number }) => {
  expect(record.state).toBe("REFUSED");
  expect(record.refusal?.stage).toBe("VALIDATE_PLAN");
  expect(record.rehydrated).toEqual([]);
  expect(record.grant.requested).toBe(false);
  expect(page.clicks).toBe(0);
  expect(page.submitted).toBe(false);
  expect(fallback.asked).toBe(0);
  expect(record.fallback?.fellBack).toBe(false);
  expect(record.reasonerKind).toBe("LOCAL_MODEL");
  for (const field of page.elements) {
    if (["#mobile_confirm", "#name_confirm"].includes(field.selector)) expect(field.value).toBe("");
  }
};

describe("a mismatched pairing is refused, even when the model says it is valid", () => {
  it("NAME into the mobile field: the binder refuses CLASS_MISMATCH; nothing restored, nothing submitted", async () => {
    const { page, record, fallback } = await run(proposing((r) => [{ op: "insert", target: "#mobile_confirm", ref: refOf(r, "NAME") }, { op: "click", target: "#submit" }]));
    expect(record.refusal?.cause).toBe("PRIVACY_REFUSED");
    expect(record.refusal?.planRefusal?.bindCause).toBe("CLASS_MISMATCH");
    expectNothingHappened(page, record, fallback);
  });

  it("PHONE into the name field: refused the same way", async () => {
    const { page, record, fallback } = await run(
      proposing((r) => [{ op: "insert", target: "#name_confirm", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }]),
      { withNameConfirm: true }
    );
    expect(record.refusal?.planRefusal?.bindCause).toBe("CLASS_MISMATCH");
    expectNothingHappened(page, record, fallback);
  });

  it("an invalid reference id: refused as one the vault never issued", async () => {
    const { page, record, fallback } = await run(proposing(() => [{ op: "insert", target: "#mobile_confirm", ref: "<PII:PHONE:9>" }, { op: "click", target: "#submit" }]));
    expect(record.refusal?.planRefusal?.bindCause).toBe("UNKNOWN_TOKEN");
    expectNothingHappened(page, record, fallback);
  });

  it("the right class into a field that already holds a value: not a pairing privacy offered", async () => {
    const { page, record, fallback } = await run(proposing((r) => [{ op: "insert", target: "#mobile", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }]));
    expect(record.refusal?.cause).toBe("REFERENCE_NOT_GROUNDED");
    expect(record.refusal?.planRefusal?.fillCause).toBe("NOT_AN_EMPTY_FIELD");
    expectNothingHappened(page, record, fallback);
  });
});

describe("what the client cannot decide, it withholds and says so", () => {
  it("an empty field of unknown type: withheld, and a reference aimed at it is refused with a request to clarify", async () => {
    const { page, record, fallback } = await run(
      proposing((r) => [{ op: "insert", target: "#notes", ref: refOf(r, "PHONE") }, { op: "click", target: "#submit" }]),
      { withNotesField: true }
    );
    expect(record.fill?.withheld).toEqual([{ target: "#notes", cause: "AMBIGUOUS_FIELD" }]);
    expect(record.refusal?.cause).toBe("REFERENCE_NOT_GROUNDED");
    expect(record.refusal?.planRefusal?.fillCause).toBe("AMBIGUOUS_FIELD");
    expect(record.refusal?.detail).toMatch(/say which value it takes/);
    expectNothingHappened(page, record, fallback);
  });

  it("two phone numbers and one empty phone field, and no way to ask: the run stops before any planner is asked (M17)", async () => {
    const seen: ReasonerRequest[] = [];
    const { page, record, fallback } = await run(
      proposing((r) => [{ op: "insert", target: "#mobile_confirm", ref: refOf(r, "PHONE", "#mobile") }, { op: "click", target: "#submit" }], seen),
      { withSecondMobile: true }
    );
    // Neither number is chosen, nobody plans around the empty field, nothing is submitted.
    expect(seen).toHaveLength(0);
    expect(fallback.asked).toBe(0);
    expect(record.state).toBe("REFUSED");
    expect(record.refusal).toMatchObject({ stage: "AWAIT_CLARIFICATION", cause: "CLARIFICATION_UNAVAILABLE" });
    expect(record.fill?.withheld).toEqual([{ target: "#mobile_confirm", cause: "CONFLICTING_REFERENCES", candidates: ["<PII:PHONE:1>", "<PII:PHONE:2>"] }]);
    expect(record.rehydrated).toEqual([]);
    expect(page.clicks).toBe(0);
    expect(page.submitted).toBe(false);
    expect(page.find("#mobile_confirm")?.value).toBe("");
    // Everything but the two readings, which hold the page's values in this in-process realm and are
    // projected away before any record crosses (extension-run.ts `crossable`).
    const { initialObservation: _i, observation: _o, ...crossing } = record;
    expect(JSON.stringify(crossing).includes(SECOND_MOBILE)).toBe(false);
  });

  it("the deterministic planner is not asked either: an unresolved conflict stops every planner", async () => {
    const page = new SimulatedPage({ withSecondMobile: true });
    const record = await runTask(portsFor(page, { withSecondMobile: true, reasoner: deterministicReasoner() }), RUN_OPTIONS);
    expect(record.refusal?.cause).toBe("CLARIFICATION_UNAVAILABLE");
    expect(record.response).toBeNull();
    expect(page.clicks).toBe(0);
    expect(page.find("#mobile_confirm")?.value).toBe("");
  });
});
