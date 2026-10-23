/**
 * M18 — WHAT A CLICK MUST DO, DECLARED BY THE PERSON, ENFORCED BY THE CLIENT.
 *
 * The person is offered the page's controls and, for each, only ADR-0007 postconditions that are not
 * already true; `checkDeclaration` decides what their answer is worth; the machine checks the bound
 * declaration on every turn and before every click; VERIFY RESULT checks the result on a fresh
 * reading. These tests hold each of those to the authoritative code, not to wording.
 *
 * Only the browser and the reasoner are test doubles. The sanitizer, vault, validator, binder, permit
 * gate, `postconditionHoldsNow` and VERIFY RESULT are the real implementations.
 */
import { describe, expect, it } from "vitest";
import { deterministicReasoner, type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import {
  checkDeclaration,
  prepareDeclarationForm,
  runTask,
  runTaskLoop,
  succeeded,
  viewOfDeclarationForm,
  type DeclarationForm,
  type TaskDeclaration,
} from "../src/index.js";
import { DEMO, GOAL, ORIGIN, RUN_OPTIONS, SESSION, SimulatedPage, VERIFIED_NAME, portsFor, type PortOptions } from "./support/simulatedPage.js";

/** Read the page the way the extension does before the person declares anything. */
const formFor = async (page: SimulatedPage, over: Partial<{ formId: string; sessionId: string; origin: string }> = {}): Promise<DeclarationForm> => {
  const reading = await page.observe();
  page.observations = 0; // the declaration's reading is not one of the run's
  return prepareDeclarationForm(
    { nodes: reading.graph.nodes, ...(reading.focusedSelector === undefined ? {} : { focusedSelector: reading.focusedSelector }) },
    { formId: over.formId ?? "form-1", sessionId: over.sessionId ?? SESSION, origin: over.origin ?? ORIGIN, documentId: reading.documentId }
  );
};

const controlOf = (form: DeclarationForm, selector: string): string => {
  const control = form.controls.find((c) => c.selector === selector);
  if (!control) throw new Error(`test setup: ${selector} is not offered`);
  return control.controlId;
};

/** The person's answer, as the side panel builds it. */
const answer = (form: DeclarationForm, declarations: unknown[], over: Record<string, unknown> = {}) => ({
  kind: "DECLARED",
  formId: form.formId,
  sessionId: form.sessionId,
  origin: form.origin,
  documentId: form.documentId,
  goal: GOAL,
  declarations,
  ...over,
});

const declare = (form: DeclarationForm, declarations: unknown[], over: Record<string, unknown> = {}): TaskDeclaration => {
  const checked = checkDeclaration(form, answer(form, declarations, over));
  if (!checked.ok) throw new Error(`test setup: declaration refused (${checked.cause})`);
  return checked.declaration;
};

/** A reasoner that clicks whatever `target(turn)` names, filling the empty field first when it can. */
function clicking(target: (turn: number, request: ReasonerRequest) => string, extra: Record<string, unknown> = {}): ReasonerClient {
  let turn = 0;
  return {
    name: "test:clicking",
    transport: "IN_PROCESS",
    async propose(request) {
      turn += 1;
      const t = target(turn, request);
      const ref = t === "#submit" ? request.fill.fillable.get("#mobile_confirm") : undefined;
      if (t === "done") {
        return { planVersion: "1", steps: [{ op: "done" }], provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin } };
      }
      return {
        planVersion: "1",
        steps: [...(ref ? [{ op: "insert", target: "#mobile_confirm", ref }] : []), { op: "click", target: t, ...extra }],
        provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
      };
    },
  };
}

const runWith = async (page: SimulatedPage, declaration: TaskDeclaration, options: PortOptions = {}, runOver: Record<string, unknown> = {}) =>
  runTask(portsFor(page, { reasoner: deterministicReasoner(), ...options }), {
    ...RUN_OPTIONS,
    postconditions: declaration.postconditions,
    declaration,
    ...runOver,
  });

describe("the form the person is offered", () => {
  it("lists visible controls only — never a text field — and, for each, only results not already true", async () => {
    const form = await formFor(new SimulatedPage({ twoStep: true }));
    expect(form.controls.map((c) => [c.selector, c.enabled, c.offers])).toEqual([
      ["#submit", false, ["TARGET_RENAMED", "TARGET_FOCUSED"]],
      ["#verify", true, ["TARGET_DISABLED", "TARGET_RENAMED", "TARGET_FOCUSED"]],
    ]);
  });

  it("is shown to the UI without selectors or fingerprints", async () => {
    const view = viewOfDeclarationForm(await formFor(new SimulatedPage()));
    expect(view.controls).toEqual([{ controlId: "k1", role: "button", name: "Submit application", enabled: true, offers: ["TARGET_DISABLED", "TARGET_RENAMED", "TARGET_FOCUSED"] }]);
    expect(JSON.stringify(view)).not.toMatch(/#submit|fingerprint/);
  });

  it("offers no focus expectation when focus cannot be read", () => {
    const form = prepareDeclarationForm(
      {
        nodes: [
          { id: "n1" as never, role: "button", name: "Go", domRef: { selector: "#go" } as never, evidence: { kind: "OBSERVED" } as never, enabled: true, parent: null, children: [] },
        ],
      },
      { formId: "f", sessionId: SESSION, origin: ORIGIN, documentId: "d" }
    );
    expect(form.controls[0]!.offers).toEqual(["TARGET_DISABLED", "TARGET_RENAMED"]);
  });
});

describe("a declaration the client accepts, and the run it governs", () => {
  it("the person declares submit becomes unavailable; the click is verified on a fresh reading and confirmed", async () => {
    const page = new SimulatedPage();
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]);
    expect(declaration.postconditions).toEqual({ "#submit": { kind: "TARGET_ENABLED", expected: false } });
    const record = await runWith(page, declaration);
    expect(succeeded(record)).toBe(true);
    expect(record.act?.verification).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_ENABLED" });
    expect(record.declaration).toEqual({ source: "PERSON", formId: "form-1", targets: ["#submit"] });
    expect(page.clicks).toBe(1);
  });

  it("a declared label change, then a declared disable, across turns of the loop", async () => {
    const page = new SimulatedPage({ twoStep: true });
    const form = await formFor(page);
    const declaration = declare(form, [
      { controlId: controlOf(form, "#verify"), expect: "TARGET_RENAMED", name: VERIFIED_NAME },
      { controlId: controlOf(form, "#submit"), expect: "TARGET_RENAMED", name: "Application submitted" },
    ]);
    // The second expectation is honest about this fixture: its submit does not rename, so the person's
    // own declaration is what the page fails to meet. Nothing is assumed in its place.
    const result = await runTaskLoop(
      portsFor(page, { twoStep: true, reasoner: clicking((turn) => (turn === 1 ? "#verify" : "#submit")) }),
      { ...RUN_OPTIONS, postconditions: declaration.postconditions, declaration, maxTurns: 3 }
    );
    expect(result.turns[0]!.act?.verification).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_NAME" });
    expect(result.turns[1]!.act?.verification?.verification).toBe("NOT_CONFIRMED");
    expect(result.outcome).toBe("STOPPED_UNVERIFIED");
    expect(result.turns).toHaveLength(2);
  });
});

describe("what checkDeclaration refuses", () => {
  const setup = async () => {
    const page = new SimulatedPage({ twoStep: true });
    return { page, form: await formFor(page) };
  };

  it.each([
    ["an expectation outside ADR-0007", { expect: "PAGE_NAVIGATES" }, "UNSUPPORTED_POSTCONDITION"],
    ["a value change", { expect: "VALUE_CHANGED" }, "UNSUPPORTED_POSTCONDITION"],
    ["a raw postcondition instead of an offer", { kind: "TARGET_ENABLED", expected: false }, "MALFORMED_DECLARATION"],
    ["an extra field (a script)", { expect: "TARGET_DISABLED", script: "document.title" }, "MALFORMED_DECLARATION"],
    ["a selector instead of a control id", { selector: "#verify", expect: "TARGET_DISABLED" }, "MALFORMED_DECLARATION"],
    ["an empty label", { expect: "TARGET_RENAMED", name: "  " }, "INVALID_EXPECTED_NAME"],
    ["a label with control characters", { expect: "TARGET_RENAMED", name: "Done\u0000" }, "INVALID_EXPECTED_NAME"],
    ["a label that is far too long", { expect: "TARGET_RENAMED", name: "x".repeat(121) }, "INVALID_EXPECTED_NAME"],
    ["a label the control already has", { expect: "TARGET_RENAMED", name: "Verify mobile number" }, "POSTCONDITION_ALREADY_HOLDS"],
  ])("%s", async (_, entry, cause) => {
    const { form } = await setup();
    const checked = checkDeclaration(form, answer(form, [{ controlId: controlOf(form, "#verify"), ...entry }]));
    expect(checked).toMatchObject({ ok: false, cause });
  });

  it("disabling a control that is already disabled: the expected result already holds", async () => {
    const { form } = await setup();
    expect(checkDeclaration(form, answer(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]))).toMatchObject({ ok: false, cause: "POSTCONDITION_ALREADY_HOLDS" });
  });

  it("focus for a control that already has it: not offered", async () => {
    const reading = await new SimulatedPage().observe();
    const form = prepareDeclarationForm({ nodes: reading.graph.nodes, focusedSelector: "#submit" }, { formId: "f", sessionId: SESSION, origin: ORIGIN, documentId: reading.documentId });
    expect(checkDeclaration(form, answer(form, [{ controlId: "k1", expect: "TARGET_FOCUSED" }]))).toMatchObject({ ok: false, cause: "NOT_OFFERED_FOR_THIS_CONTROL" });
  });

  it.each([
    ["a control id the form did not issue", "k99", "UNKNOWN_CONTROL"],
    ["a text field's selector", "#mobile_confirm", "UNKNOWN_CONTROL"],
  ])("%s", async (_, controlId, cause) => {
    const { form } = await setup();
    expect(checkDeclaration(form, answer(form, [{ controlId, expect: "TARGET_DISABLED" }]))).toMatchObject({ ok: false, cause });
  });

  it.each([
    ["another form", { formId: "form-0" }, "NOT_THIS_FORM"],
    ["another session", { sessionId: "other" }, "SESSION_MISMATCH"],
    ["another site", { origin: "http://127.0.0.1:9999" }, "ORIGIN_MISMATCH"],
    ["another document", { documentId: "doc-before-reload" }, "DOCUMENT_CHANGED"],
    ["no goal", { goal: "   " }, "EMPTY_GOAL"],
    ["an extra field", { authorise: true }, "MALFORMED_DECLARATION"],
  ])("an answer for %s", async (_, over, cause) => {
    const { form } = await setup();
    expect(checkDeclaration(form, answer(form, [{ controlId: controlOf(form, "#verify"), expect: "TARGET_DISABLED" }], over))).toMatchObject({ ok: false, cause });
  });

  it("no declaration, the same control twice, or too many", async () => {
    const { form } = await setup();
    const k = controlOf(form, "#verify");
    expect(checkDeclaration(form, answer(form, []))).toMatchObject({ ok: false, cause: "NO_DECLARATION" });
    expect(checkDeclaration(form, answer(form, [{ controlId: k, expect: "TARGET_DISABLED" }, { controlId: k, expect: "TARGET_FOCUSED" }]))).toMatchObject({ ok: false, cause: "DUPLICATE_CONTROL", at: 1 });
    expect(checkDeclaration(form, answer(form, Array.from({ length: 9 }, () => ({ controlId: k, expect: "TARGET_DISABLED" }))))).toMatchObject({ ok: false, cause: "TOO_MANY_DECLARATIONS" });
  });
});

describe("the run enforces the binding itself", () => {
  const declared = async (options: PortOptions = {}) => {
    const page = new SimulatedPage(options);
    const form = await formFor(page);
    return { page, declaration: declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]) };
  };

  it.each([
    ["another session", { sessionId: "another-session" }, "DECLARATION_FOR_ANOTHER_SESSION"],
    ["another site", { origin: "http://127.0.0.1:9999" }, "DECLARATION_FOR_ANOTHER_ORIGIN"],
    ["another task", { goal: "Delete my account." }, "DECLARATION_FOR_ANOTHER_TASK"],
    ["a table that is not the person's", { postconditions: { "#submit": { kind: "FOCUS_ON_TARGET" } } }, "DECLARATION_TABLE_MISMATCH"],
    ["a table with an extra control", { postconditions: { "#submit": { kind: "TARGET_ENABLED", expected: false }, "#verify": { kind: "FOCUS_ON_TARGET" } } }, "DECLARATION_TABLE_MISMATCH"],
  ])("a run for %s is refused before the page is read", async (_, runOver, cause) => {
    const { page, declaration } = await declared();
    const record = await runWith(page, declaration, {}, runOver);
    expect(record.refusal).toMatchObject({ stage: "OBSERVE", cause });
    expect(page.observations).toBe(0);
    expect(page.clicks).toBe(0);
  });

  it("a page that changed document since the declaration: refused, nothing planned", async () => {
    const { page, declaration } = await declared();
    page.documentId = "orch-doc-reloaded";
    const record = await runWith(page, declaration);
    expect(record.refusal).toMatchObject({ stage: "OBSERVE", cause: "DECLARATION_STALE" });
    expect(record.response).toBeNull();
    expect(page.clicks).toBe(0);
  });

  it("a control relabelled since the declaration: refused at VALIDATE, nothing restored or clicked", async () => {
    const { page, declaration } = await declared();
    page.find("#submit")!.name = "Delete account";
    // The model still proposes the click; the client is what refuses it.
    const record = await runWith(page, declaration, { reasoner: clicking(() => "#submit") });
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "DECLARATION_STALE" });
    expect(record.rehydrated).toEqual([]);
    expect(page.clicks).toBe(0);
  });

  it("re-checked immediately before the click: a control relabelled after the value went in is not clicked", async () => {
    const { page, declaration } = await declared();
    const ports = portsFor(page, { reasoner: deterministicReasoner() });
    const record = await runTask(
      {
        ...ports,
        insert: async (target, value) => {
          const ok = await page.insert(target, value);
          page.find("#submit")!.name = "Delete account"; // the page moves between REHYDRATE and ACT
          return ok;
        },
      },
      { ...RUN_OPTIONS, postconditions: declaration.postconditions, declaration }
    );
    expect(record.refusal).toMatchObject({ stage: "ACT", cause: "DECLARATION_STALE" });
    expect(page.clicks).toBe(0);
  });

  it("the expected result already true by the time the run reads the page: refused, not confirmed", async () => {
    const { page, declaration } = await declared();
    page.find("#submit")!.enabled = false;
    const record = await runWith(page, declaration);
    expect(record.state).toBe("REFUSED");
    expect(page.clicks).toBe(0);
  });
});

describe("the model proposes; the person's declaration decides", () => {
  it("a click on a control the person did not declare is refused", async () => {
    const page = new SimulatedPage({ twoStep: true });
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#verify"), expect: "TARGET_RENAMED", name: VERIFIED_NAME }]);
    const record = await runTask(portsFor(page, { twoStep: true, reasoner: clicking(() => "#submit") }), {
      ...RUN_OPTIONS,
      postconditions: declaration.postconditions,
      declaration,
    });
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN" });
    expect(page.clicks).toBe(0);
  });

  it("a model that supplies its own success condition is ignored: the person's is what is verified", async () => {
    const page = new SimulatedPage({ neverDisablesSubmit: true });
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]);
    const record = await runTask(
      portsFor(page, { neverDisablesSubmit: true, reasoner: clicking(() => "#submit", { postcondition: { kind: "TARGET_NAME", expected: "Submit application" } }) }),
      { ...RUN_OPTIONS, postconditions: declaration.postconditions, declaration }
    );
    expect(record.act?.verification).toMatchObject({ verification: "NOT_CONFIRMED", postcondition: "TARGET_ENABLED" });
    expect(succeeded(record)).toBe(false);
  });
});

describe("a click that is not confirmed stops the task", () => {
  const loop = async (options: PortOptions) => {
    const page = new SimulatedPage(options);
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]);
    const result = await runTaskLoop(portsFor(page, { ...options, reasoner: clicking(() => "#submit") }), {
      ...RUN_OPTIONS,
      postconditions: declaration.postconditions,
      declaration,
      maxTurns: 3,
    });
    return { page, result };
  };

  it("executed but the declared result did not happen: NOT_CONFIRMED, one click, no further turn", async () => {
    const { page, result } = await loop({ neverDisablesSubmit: true });
    expect(result.turns[0]!.act?.verification?.verification).toBe("NOT_CONFIRMED");
    expect(result.outcome).toBe("STOPPED_UNVERIFIED");
    expect(result.turns).toHaveLength(1);
    expect(page.clicks).toBe(1);
  });

  it("the page cannot be read after the click: UNKNOWN (OBSERVATION_FAILED), and nothing more happens", async () => {
    const { page, result } = await loop({ observeThrowsAfter: 2 });
    expect(result.turns[0]!.act?.verification).toMatchObject({ verification: "UNKNOWN", cause: "OBSERVATION_FAILED" });
    expect(result.outcome).toBe("STOPPED_UNVERIFIED");
    expect(page.clicks).toBe(1);
  });

  it("the dispatch itself fails: UNKNOWN, and nothing more happens", async () => {
    const { result } = await loop({ clickThrows: true });
    expect(result.turns[0]!.act?.verification?.verification).toBe("UNKNOWN");
    expect(result.outcome).toBe("STOPPED_UNVERIFIED");
    expect(result.turns).toHaveLength(1);
  });
});

describe("a declaration does not reach privacy", () => {
  it("the person's expectation leaves the field grounding and the value grant exactly as they were", async () => {
    const page = new SimulatedPage();
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]);
    const grants: unknown[] = [];
    const record = await runTask(portsFor(page, { reasoner: deterministicReasoner(), onGrant: (g) => grants.push(g) }), {
      ...RUN_OPTIONS,
      postconditions: declaration.postconditions,
      declaration,
    });
    expect(record.fill?.fillable).toEqual([{ target: "#mobile_confirm", ref: "<PII:PHONE:1>" }]);
    expect(grants).toHaveLength(1);
    expect(page.find("#mobile_confirm")?.value === DEMO.mobile).toBe(true);
    expect(JSON.stringify(declaration).includes(DEMO.mobile)).toBe(false);
  });

  it("an unresolved choice between stored values still stops before planning, declaration or not (M17)", async () => {
    const page = new SimulatedPage({ withSecondMobile: true });
    const form = await formFor(page);
    const declaration = declare(form, [{ controlId: controlOf(form, "#submit"), expect: "TARGET_DISABLED" }]);
    const record = await runWith(page, declaration, { withSecondMobile: true });
    expect(record.refusal).toMatchObject({ stage: "AWAIT_CLARIFICATION", cause: "CLARIFICATION_UNAVAILABLE" });
    expect(page.clicks).toBe(0);
  });
});
