/**
 * M15 — ACTION-SPECIFIC RESULT VERIFICATION.
 *
 * Every click's expected effect is declared by the client with the task (`postconditions.ts`) and
 * evaluated by ADR-0007's VERIFY RESULT on a fresh reading. Nothing assumes "submit disables itself"
 * any more; nothing lets the model or the page choose what counts as success.
 *
 * Only the browser (`SimulatedPage`) and the reasoner (a script, named as such) are test doubles. The
 * sanitizer, vault, verifier, parser, validator, binder, permit gate and VERIFY RESULT are real.
 */
import { describe, expect, it } from "vitest";
import { postconditionHoldsNow, type ExpectedPostcondition } from "@pratibimb/agent";
import { deterministicReasoner, type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import {
  MAX_DECLARED_POSTCONDITIONS,
  PostconditionsError,
  checkPostconditions,
  runTask,
  runTaskLoop,
  succeeded,
  type ClickPostconditions,
  type RunRecord,
} from "../src/index.js";
import { RUN_OPTIONS, SimulatedPage, VERIFIED_NAME, portsFor, type PortOptions } from "./support/simulatedPage.js";

const TWO_STEP: ClickPostconditions = {
  "#verify": { kind: "TARGET_NAME", expected: VERIFIED_NAME },
  "#submit": { kind: "TARGET_ENABLED", expected: false },
};

type Turn = "verify" | "submit" | "done" | "verify+expect";

/** A test reasoner. Turn n answers as `script[n-1]` says; "submit" is the deterministic demo plan. */
function scripted(script: readonly Turn[]): ReasonerClient & { readonly calls: () => number } {
  const deterministic = deterministicReasoner();
  let calls = 0;
  const provenance = (r: ReasonerRequest) => ({ requestId: r.requestId, sessionId: r.sessionId, viewId: r.handoff.request.requestId, origin: r.origin });
  return {
    name: "test:scripted",
    transport: "IN_PROCESS",
    calls: () => calls,
    async propose(request: ReasonerRequest): Promise<unknown> {
      const turn = script[calls] ?? "done";
      calls += 1;
      if (turn === "done") return { planVersion: "1", steps: [{ op: "done" }], provenance: provenance(request) };
      if (turn === "verify") return { planVersion: "1", steps: [{ op: "click", target: "#verify" }], provenance: provenance(request) };
      if (turn === "verify+expect") {
        // A model trying to choose its own success condition: an extra field the parser drops.
        return {
          planVersion: "1",
          steps: [{ op: "click", target: "#verify", expect: { kind: "TARGET_ENABLED", expected: true } }],
          expect: { kind: "TARGET_ENABLED", expected: true },
          provenance: provenance(request),
        };
      }
      return deterministic.propose(request);
    },
  };
}

const once = async (postconditions: ClickPostconditions, options: PortOptions = {}) => {
  const page = new SimulatedPage(options);
  const grants: unknown[] = [];
  const record = await runTask(portsFor(page, { ...options, onGrant: (g) => grants.push(g) }), { ...RUN_OPTIONS, postconditions });
  return { page, record, grants };
};

const loop = async (script: readonly Turn[], maxTurns: number, options: PortOptions = {}, postconditions: ClickPostconditions = TWO_STEP) => {
  const page = new SimulatedPage({ twoStep: true, ...options });
  const reasoner = scripted(script);
  let between = 0;
  const record = await runTaskLoop(portsFor(page, { ...options, reasoner }), {
    ...RUN_OPTIONS,
    postconditions,
    maxTurns,
    betweenTurns: async () => {
      between += 1;
    },
  });
  return { page, record, reasoner, between: () => between };
};

const verdict = (turn: RunRecord) => turn.act?.verification ?? null;

describe("the declaration table", () => {
  it("accepts ADR-0007's closed set, and freezes what it returns", () => {
    const table = checkPostconditions({
      "#a": { kind: "FOCUS_ON_TARGET" },
      "#b": { kind: "TARGET_ENABLED", expected: false },
      "#c": { kind: "TARGET_NAME", expected: "Done" },
    });
    expect(Object.keys(table)).toEqual(["#a", "#b", "#c"]);
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table["#b"])).toBe(true);
  });

  it.each([
    ["not an object", "x"],
    ["an array", [{ kind: "FOCUS_ON_TARGET" }]],
    ["null", null],
    ["empty", {}],
    ["an empty selector", { " ": { kind: "FOCUS_ON_TARGET" } }],
    ["an unknown kind", { "#a": { kind: "SOMETHING_CHANGED" } }],
    ["a generic diff", { "#a": { kind: "ANY_CHANGE" } }],
    ["an extra field", { "#a": { kind: "FOCUS_ON_TARGET", script: "x" } }],
    ["a non-boolean enabled", { "#a": { kind: "TARGET_ENABLED", expected: "false" } }],
    ["an empty expected name", { "#a": { kind: "TARGET_NAME", expected: " " } }],
    ["a missing expected", { "#a": { kind: "TARGET_ENABLED" } }],
  ])("refuses %s", (_, raw) => {
    expect(() => checkPostconditions(raw)).toThrow(PostconditionsError);
  });

  it(`refuses more than ${MAX_DECLARED_POSTCONDITIONS} declarations`, () => {
    const big = Object.fromEntries(Array.from({ length: MAX_DECLARED_POSTCONDITIONS + 1 }, (_, i) => [`#b${i}`, { kind: "FOCUS_ON_TARGET" }]));
    expect(() => checkPostconditions(big)).toThrow(PostconditionsError);
  });
});

describe("postconditionHoldsNow — the before-the-action question", () => {
  const nodeOf = async (selector: string) => {
    const o = await new SimulatedPage({ twoStep: true }).observe();
    return { node: o.graph.nodes.find((n) => n.domRef.selector === selector)!, o };
  };
  it("reads enabled state and name from the reading it is given", async () => {
    const { node } = await nodeOf("#verify");
    expect(postconditionHoldsNow({ kind: "TARGET_ENABLED", expected: true }, node, {})).toBe("HOLDS");
    expect(postconditionHoldsNow({ kind: "TARGET_NAME", expected: VERIFIED_NAME }, node, {})).toBe("DOES_NOT_HOLD");
  });
  it("treats unreported focus as UNKNOWN, and reported nothing-focused as DOES_NOT_HOLD", async () => {
    const { node } = await nodeOf("#verify");
    const focus: ExpectedPostcondition = { kind: "FOCUS_ON_TARGET" };
    expect(postconditionHoldsNow(focus, node, {})).toBe("UNKNOWN");
    expect(postconditionHoldsNow(focus, node, { focusedSelector: null })).toBe("DOES_NOT_HOLD");
    expect(postconditionHoldsNow(focus, node, { focusedSelector: "#verify" })).toBe("HOLDS");
  });
});

describe("one turn: the declaration decides what is checked, and whether the click happens at all", () => {
  it("a click with no declared postcondition is refused before any grant, restoration or click", async () => {
    const { record, page, grants } = await once({ "#verify": { kind: "FOCUS_ON_TARGET" } });
    expect(record.state).toBe("REFUSED");
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "NO_DECLARED_POSTCONDITION" });
    expect(page.clicks).toBe(0);
    expect(grants).toEqual([]);
    expect(record.rehydrated).toEqual([]);
  });

  it("a declared postcondition that already holds is refused: confirming it afterwards would prove nothing", async () => {
    const { record, page, grants } = await once({ "#submit": { kind: "TARGET_ENABLED", expected: true } });
    expect(record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "POSTCONDITION_ALREADY_HOLDS" });
    expect(page.clicks).toBe(0);
    expect(grants).toEqual([]);
  });

  it("the declared postcondition is what VERIFY RESULT evaluates, and the record says which", async () => {
    const { record } = await once({ "#submit": { kind: "TARGET_ENABLED", expected: false } });
    expect(succeeded(record)).toBe(true);
    expect(record.postcondition).toEqual({ kind: "TARGET_ENABLED", expected: false });
    expect(verdict(record)).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_ENABLED" });
  });

  it("an action that runs but produces no observable confirmation is not a success", async () => {
    // FOCUS_ON_TARGET: the simulated page reports nothing focused after the click.
    const { record, page } = await once({ "#submit": { kind: "FOCUS_ON_TARGET" } });
    expect(page.clicks).toBe(1);
    expect(record.state).toBe("DONE");
    expect(verdict(record)).toMatchObject({ verification: "NOT_CONFIRMED", cause: "FOCUS_ABSENT" });
    expect(succeeded(record)).toBe(false);
  });
});

describe("two turns on the two-step page — each with its own declared, observed effect", () => {
  it("verify, then submit, then the model's done: two confirmed actions and a recorded claim", async () => {
    const { record, page, between } = await loop(["verify", "submit", "done"], 3);
    expect(record.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(record.turns).toHaveLength(3);
    expect(record.confirmedActions).toBe(2);
    expect(page.submitted).toBe(true);
    const [first, second, third] = record.turns;
    expect(verdict(first!)).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_NAME" });
    expect(verdict(second!)).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_ENABLED" });
    expect(third!.declaredDone).toBe(true);
    expect(succeeded(third!)).toBe(false);
    expect(between()).toBe(2);
  });

  it("the second step depends on the first: on turn 1 submit is not actionable, after turn 1 it is", async () => {
    const { record } = await loop(["verify", "submit", "done"], 3);
    expect(record.turns[0]!.initialObservation!.actionable.has("#submit")).toBe(false);
    expect(record.turns[1]!.initialObservation!.actionable.has("#submit")).toBe(true);
    // A fresh observation per turn, newer than the previous turn's post-action reading.
    expect(String(record.turns[1]!.initialObservation!.graph.frameId)).not.toBe(String(record.turns[0]!.observation!.graph.frameId));
  });

  it("proposing the second step first is refused by the gates, and nothing is clicked", async () => {
    const { record, page } = await loop(["submit"], 3);
    expect(record.outcome).toBe("STOPPED_REFUSED");
    expect(record.turns[0]!.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "TARGET_NOT_ACTIONABLE" });
    expect(page.clicks).toBe(0);
  });

  it.each([
    ["the expected change does not happen", { verifyDoesNothing: true }, "NOT_CONFIRMED"],
    ["the control ends up named something else", { verifyRenamesTo: "Verification failed" }, "NOT_CONFIRMED"],
    ["the control vanishes, so the result cannot be read", { verifyRemovesItself: true }, "UNKNOWN"],
  ])("when %s, the first turn is not confirmed and no second turn runs", async (_, options, expected) => {
    const { record, reasoner } = await loop(["verify", "submit", "done"], 3, options);
    expect(record.outcome).toBe("STOPPED_UNVERIFIED");
    expect(record.turns).toHaveLength(1);
    expect(record.confirmedActions).toBe(0);
    expect(verdict(record.turns[0]!)?.verification).toBe(expected);
    expect(reasoner.calls()).toBe(1);
  });

  it("a page that cannot be read back after the click stops the task; an observer error is never success", async () => {
    // Observations: turn read (1), REFRESH (2), VERIFY RESULT (3, throws).
    const { record, page } = await loop(["verify", "submit", "done"], 3, { observeThrowsAfter: 2 });
    expect(page.clicks).toBe(1);
    expect(record.turns).toHaveLength(1);
    expect(record.confirmedActions).toBe(0);
    expect(record.outcome).toBe("STOPPED_UNVERIFIED");
    // The click is recorded as dispatched, and its result as unknown — never thrown past, never success.
    expect(record.turns[0]!.act?.reached).toBe("VERIFY_RESULT");
    expect(verdict(record.turns[0]!)).toMatchObject({ verification: "UNKNOWN", cause: "OBSERVATION_FAILED" });
    expect(succeeded(record.turns[0]!)).toBe(false);
  });

  it("the same click again is refused before it runs: its effect already holds", async () => {
    const { record, page } = await loop(["verify", "verify"], 3);
    expect(record.outcome).toBe("STOPPED_REFUSED");
    expect(record.turns[1]!.refusal).toMatchObject({ cause: "POSTCONDITION_ALREADY_HOLDS" });
    expect(page.clicks).toBe(1);
  });

  it("the model cannot choose its own success condition: an `expect` it sends is dropped", async () => {
    const { record } = await loop(["verify+expect", "submit", "done"], 3);
    expect(record.turns[0]!.postcondition).toEqual({ kind: "TARGET_NAME", expected: VERIFIED_NAME });
    expect(verdict(record.turns[0]!)).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_NAME" });
  });

  it("a done before any action is recorded as the model's claim, with nothing confirmed and nothing submitted", async () => {
    const { record, page } = await loop(["done"], 3);
    expect(record.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(record.confirmedActions).toBe(0);
    expect(page.clicks).toBe(0);
    expect(page.submitted).toBe(false);
  });

  it("the budget still bounds it: one turn, confirmed, then stop", async () => {
    const { record } = await loop(["verify", "submit", "done"], 1);
    expect(record.outcome).toBe("STOPPED_TURN_BUDGET");
    expect(record.confirmedActions).toBe(1);
  });
});
