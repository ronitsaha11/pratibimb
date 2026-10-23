/**
 * M19 — THE PERSON ALLOWS ONE RESTORATION, IN THEIR OWN PANEL, AND NOTHING ELSE.
 *
 * Before a stored value is restored the run asks — through `ClientPorts.consent` when the person's
 * panel is there — about exactly one restoration. These tests hold the answer check, and what an
 * allow is and is not worth, to the real gates: the sanitizer, vault, `groundFill`, validator,
 * binder, permit gate and VERIFY RESULT are the real implementations. Only the browser, the reasoner
 * and the person are test doubles. Assertions compare booleans, so a failure prints no value.
 */
import { describe, expect, it } from "vitest";
import { deterministicReasoner, type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import {
  checkDeclaration,
  prepareDeclarationForm,
  runTask,
  runTaskLoop,
  succeeded,
  type ConsentRequest,
  type RunRecord,
} from "../src/index.js";
import { DEMO, GOAL, ORIGIN, RUN_OPTIONS, SECOND_MOBILE, SESSION, SimulatedPage, portsFor, type PortOptions } from "./support/simulatedPage.js";

/** The person, at the panel: answers each request as `pick` says, and remembers what they were asked. */
const person = (pick: (request: ConsentRequest) => unknown, asked: ConsentRequest[] = []) => async (request: ConsentRequest) => {
  asked.push(request);
  return pick(request);
};

const allowOnce = (over: Record<string, unknown> = {}) => (r: ConsentRequest) => ({
  kind: "ALLOW_ONCE",
  consentId: r.consentId,
  sessionId: r.sessionId,
  origin: r.origin,
  documentId: r.documentId,
  target: r.target,
  ...over,
});
const deny = (r: ConsentRequest) => ({ kind: "DENY", consentId: r.consentId });

const run = async (options: PortOptions = {}) => {
  const page = new SimulatedPage(options);
  const grantsViaControlPlane: unknown[] = [];
  const record = await runTask(
    portsFor(page, { reasoner: deterministicReasoner(), ...options, onGrant: (g) => grantsViaControlPlane.push(g), grant: { granted: true } }),
    RUN_OPTIONS
  );
  return { page, record, grantsViaControlPlane };
};

const anyValueIn = (anything: unknown): boolean => {
  const text = JSON.stringify(anything);
  return [...Object.values(DEMO), SECOND_MOBILE].some((v) => text.includes(v));
};

/** Nothing restored, nothing clicked, nothing submitted. */
const expectNothingRestored = (page: SimulatedPage, record: RunRecord) => {
  expect(record.state).toBe("REFUSED");
  expect(record.rehydrated).toEqual([]);
  expect(page.find("#mobile_confirm")?.value).toBe("");
  expect(page.clicks).toBe(0);
  expect(page.submitted).toBe(false);
};

describe("allow once", () => {
  it("restores the stored value into the field it was asked about, and the click is verified as before", async () => {
    const asked: ConsentRequest[] = [];
    const { page, record, grantsViaControlPlane } = await run({ consent: person(allowOnce(), asked) });
    expect(asked).toHaveLength(1);
    expect(grantsViaControlPlane).toHaveLength(0); // the panel answered; the control plane was not asked
    expect(record.consents).toEqual([{ target: "#mobile_confirm", piiClass: "PHONE", outcome: "ALLOWED_ONCE" }]);
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
    expect(record.act?.verification?.verification).toBe("CONFIRMED");
    expect(succeeded(record)).toBe(true);
  });

  it("asks about exactly this restoration, in words, and carries no value", async () => {
    const asked: ConsentRequest[] = [];
    await run({ consent: person(allowOnce(), asked) });
    const request = asked[0]!;
    expect(request).toMatchObject({
      origin: ORIGIN,
      sessionId: SESSION,
      target: "#mobile_confirm",
      targetLabel: "Confirm mobile number",
      piiClass: "PHONE",
      then: { target: "#submit", label: "Submit application" },
    });
    expect(request.statement).toBe(`PratiBimb is about to put your phone number into “Confirm mobile number” on ${ORIGIN}.`);
    expect(anyValueIn(request)).toBe(false);
  });

  it("is one use: the grant it produces is spent, and the next turn's restoration would ask again", async () => {
    const { record } = await run({ consent: person(allowOnce()) });
    expect(record.grant.useGrant?.used).toBe(true);
    expect(record.grant.useGrant?.fingerprint).toBeDefined();
  });
});

describe("anything but a valid allow restores nothing, and nothing is submitted", () => {
  it("deny", async () => {
    const { page, record } = await run({ consent: person(deny) });
    expectNothingRestored(page, record);
    expect(record.refusal).toMatchObject({ stage: "AWAIT_GRANT", cause: "CONSENT_DENIED" });
  });

  it("the panel closed before an answer (the desk ends it as a decline)", async () => {
    const { page, record } = await run({ consent: person((r) => ({ kind: "DENY", consentId: r.consentId })) });
    expectNothingRestored(page, record);
  });

  it("the prompt could not be shown", async () => {
    const { page, record } = await run({
      consent: async () => {
        throw new Error("panel gone");
      },
    });
    expectNothingRestored(page, record);
    expect(record.refusal?.cause).toBe("CONSENT_FAILED");
  });

  it.each([
    ["the old bare grant shape", () => ({ granted: true }), "MALFORMED_CONSENT"],
    ["nothing", () => undefined, "MALFORMED_CONSENT"],
    ["text", () => "ALLOW_ONCE", "MALFORMED_CONSENT"],
    ["an allow that also names an action", allowOnce({ action: { target: "#submit" } }), "MALFORMED_CONSENT"],
    ["an allow that carries a value", allowOnce({ value: "9000000009" }), "MALFORMED_CONSENT"],
    ["an allow that names a reference", allowOnce({ ref: "<PII:PHONE:1>" }), "MALFORMED_CONSENT"],
    ["an allow that widens itself", allowOnce({ scope: "ALWAYS" }), "MALFORMED_CONSENT"],
    ["an allow with a non-string field", allowOnce({ target: 7 }), "MALFORMED_CONSENT"],
    ["an allow for an earlier request (a replay)", allowOnce({ consentId: "orch-request-0.consent.1" }), "NOT_THIS_CONSENT"],
    ["a deny for another request", (r: ConsentRequest) => ({ kind: "DENY", consentId: `${r.consentId}-other` }), "NOT_THIS_CONSENT"],
    ["an allow from another session", allowOnce({ sessionId: "another-session" }), "SESSION_MISMATCH"],
    ["an allow for another site", allowOnce({ origin: "http://127.0.0.1:9999" }), "ORIGIN_MISMATCH"],
    ["an allow for an earlier document", allowOnce({ documentId: "orch-doc-before-reload" }), "DOCUMENT_CHANGED"],
    ["an allow for another field", allowOnce({ target: "#mobile" }), "TARGET_MISMATCH"],
  ])("%s", async (_, pick, cause) => {
    const { page, record } = await run({ consent: person(pick as (r: ConsentRequest) => unknown) });
    expectNothingRestored(page, record);
    expect(record.refusal).toMatchObject({ stage: "AWAIT_GRANT", cause });
    expect(record.consents[0]?.outcome).toBe(cause);
  });

  it("the page moving while the person decides: the allow is not applied", async () => {
    const page = new SimulatedPage({ withStructure: true });
    const record = await runTask(
      portsFor(page, {
        withStructure: true,
        reasoner: deterministicReasoner(),
        consent: async (request) => {
          page.structureSeq += 1;
          page.find("#mobile_confirm")!.name = "Enter a new number"; // the field it was asked about changed
          return allowOnce()(request);
        },
      }),
      RUN_OPTIONS
    );
    expectNothingRestored(page, record);
    expect(record.refusal).toMatchObject({ stage: "AWAIT_GRANT", cause: "CONSENT_STALE" });
  });
});

describe("what consent cannot do", () => {
  it("cannot be asked for a value that does not fit the field: the binder refuses the plan first", async () => {
    const asked: ConsentRequest[] = [];
    const nameIntoPhone: ReasonerClient = {
      name: "test:name-into-phone",
      transport: "IN_PROCESS",
      async propose(r) {
        const name = r.handoff.redactions.find((x) => x.class === "NAME")!.token;
        return { planVersion: "1", steps: [{ op: "insert", target: "#mobile_confirm", ref: name }, { op: "click", target: "#submit" }], provenance: { requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin } };
      },
    };
    const { page, record } = await run({ reasoner: nameIntoPhone, consent: person(allowOnce(), asked) });
    expect(asked).toEqual([]);
    expect(record.refusal?.planRefusal?.bindCause).toBe("CLASS_MISMATCH");
    expect(page.find("#mobile_confirm")?.value).toBe("");
  });

  it("cannot be asked for a field of unknown type: privacy grounds no pairing for it", async () => {
    const asked: ConsentRequest[] = [];
    const intoNotes: ReasonerClient = {
      name: "test:into-notes",
      transport: "IN_PROCESS",
      async propose(r) {
        const phone = r.handoff.redactions.find((x) => x.class === "PHONE")!.token;
        return { planVersion: "1", steps: [{ op: "insert", target: "#notes", ref: phone }, { op: "click", target: "#submit" }], provenance: { requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin } };
      },
    };
    const { record } = await run({ withNotesField: true, reasoner: intoNotes, consent: person(allowOnce(), asked) });
    expect(asked).toEqual([]);
    expect(record.refusal?.planRefusal?.fillCause).toBe("AMBIGUOUS_FIELD");
  });

  it("cannot be manufactured by the model: a plan claiming consent is still asked about, and a deny stops it", async () => {
    const claiming: ReasonerClient = {
      name: "test:claims-consent",
      transport: "IN_PROCESS",
      async propose(r) {
        const ref = r.fill.fillable.get("#mobile_confirm");
        return {
          planVersion: "1",
          consent: { kind: "ALLOW_ONCE" },
          steps: [{ op: "insert", target: "#mobile_confirm", ref, consent: "ALLOW_ONCE", granted: true }, { op: "click", target: "#submit" }],
          provenance: { requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin },
        };
      },
    };
    const asked: ConsentRequest[] = [];
    const { page, record } = await run({ reasoner: claiming, consent: person(deny, asked) });
    expect(asked).toHaveLength(1);
    expectNothingRestored(page, record);
  });

  it("is never bypassed by the control plane: with the panel present, requestGrant is not consulted", async () => {
    const { page, record, grantsViaControlPlane } = await run({ consent: person(deny) }); // control plane would grant
    expect(grantsViaControlPlane).toHaveLength(0);
    expectNothingRestored(page, record);
  });

  it("the reasoner never receives a stored value, before or after consent", async () => {
    const seen: ReasonerRequest[] = [];
    const inner = deterministicReasoner();
    const watching: ReasonerClient = { ...inner, propose: (r) => (seen.push(r), inner.propose(r)) };
    await run({ reasoner: watching, consent: person(allowOnce()) });
    expect(seen).toHaveLength(1);
    expect(anyValueIn({ handoff: seen[0]!.handoff, fill: [...seen[0]!.fill.fillable], goal: seen[0]!.goal })).toBe(false);
  });

  it("leaves no value in the run's record outside the two page readings", async () => {
    const { record } = await run({ consent: person(allowOnce()) });
    const { initialObservation: _i, observation: _o, ...crossing } = record;
    expect(anyValueIn(crossing)).toBe(false);
  });
});

describe("with M17 clarification, M18 declarations and the M14 loop", () => {
  it("two stored numbers: the person chooses one, then allows that one — in that order", async () => {
    const order: string[] = [];
    const page = new SimulatedPage({ withSecondMobile: true });
    const record = await runTask(
      portsFor(page, {
        withSecondMobile: true,
        reasoner: {
          name: "test:paired",
          transport: "IN_PROCESS",
          async propose(r) {
            const ref = r.fill.fillable.get("#mobile_confirm");
            return { planVersion: "1", steps: [{ op: "insert", target: "#mobile_confirm", ref }, { op: "click", target: "#submit" }], provenance: { requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin } };
          },
        },
        clarify: async (q) => {
          order.push("clarify");
          return { kind: "CHOSEN", clarificationId: q.clarificationId, sessionId: q.sessionId, origin: q.origin, viewId: q.viewId, documentId: q.documentId, target: q.target, candidateSetId: q.candidateSetId, candidateId: "c1" };
        },
        consent: async (c) => {
          order.push(`consent:${c.ref}`);
          return allowOnce()(c);
        },
      }),
      RUN_OPTIONS
    );
    expect(order).toEqual(["clarify", "consent:<PII:PHONE:1>"]);
    expect(succeeded(record)).toBe(true);
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
  });

  it("a person's declared result and a person's consent, across the loop: one restoration, one verified click, then done", async () => {
    const page = new SimulatedPage();
    const reading = await page.observe();
    page.observations = 0;
    const form = prepareDeclarationForm({ nodes: reading.graph.nodes, focusedSelector: reading.focusedSelector ?? null }, { formId: "f1", sessionId: SESSION, origin: ORIGIN, documentId: reading.documentId });
    const checked = checkDeclaration(form, { kind: "DECLARED", formId: "f1", sessionId: SESSION, origin: ORIGIN, documentId: reading.documentId, goal: GOAL, declarations: [{ controlId: "k1", expect: "TARGET_DISABLED" }] });
    if (!checked.ok) throw new Error("test setup");
    let turn = 0;
    const asked: ConsentRequest[] = [];
    const result = await runTaskLoop(
      portsFor(page, {
        reasoner: {
          name: "test:act-then-done",
          transport: "IN_PROCESS",
          async propose(r) {
            turn += 1;
            const provenance = { requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin };
            if (turn > 1) return { planVersion: "1", steps: [{ op: "done" }], provenance };
            return { planVersion: "1", steps: [{ op: "insert", target: "#mobile_confirm", ref: r.fill.fillable.get("#mobile_confirm") }, { op: "click", target: "#submit" }], provenance };
          },
        },
        consent: person(allowOnce(), asked),
      }),
      { ...RUN_OPTIONS, postconditions: checked.declaration.postconditions, declaration: checked.declaration, maxTurns: 3 }
    );
    expect(asked).toHaveLength(1);
    expect(result.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(result.confirmedActions).toBe(1);
    expect(page.clicks).toBe(1);
  });
});
