/**
 * STAGE 12 — "repeat, or stop and ask".
 *
 * Only the browser and the reasoner are test doubles here: the page is `SimulatedPage`, and the
 * reasoner is a script that answers each turn as the test says. The sanitizer, vault, verifier,
 * parser, validator, binder, permit gate and VERIFY RESULT are the real implementations, run once per
 * turn — so a loop that skipped a gate on its second turn would fail these tests, not pass them.
 *
 * The last block tests the STOPPING POLICY on its own, with synthetic turn records, and says so.
 */
import { describe, expect, it } from "vitest";
import { isVerifiedHandoff } from "@pratibimb/privacy";
import { deterministicReasoner, type ReasonerClient, type ReasonerRequest } from "@pratibimb/reasoner";
import {
  MAX_TASK_TURNS,
  TurnBudgetError,
  checkTurnBudget,
  runTaskLoop,
  succeeded,
  turnRequestId,
  type RunRecord,
  type RunState,
} from "../src/index.js";
import { DEMO, REQUEST, RUN_OPTIONS, SimulatedPage, portsFor, type PortOptions } from "./support/simulatedPage.js";

type Turn = "act" | "done" | "replay-first";

/** A test reasoner: turn n answers as `script[n-1]` says. Not a model, and not presented as one. */
function scripted(script: readonly Turn[]): ReasonerClient & { readonly calls: () => number } {
  const deterministic = deterministicReasoner();
  let calls = 0;
  let first: unknown = null;
  return {
    name: "test:scripted",
    transport: "IN_PROCESS",
    calls: () => calls,
    async propose(request: ReasonerRequest): Promise<unknown> {
      const turn = script[calls] ?? "act";
      calls += 1;
      if (turn === "done") {
        return {
          planVersion: "1",
          steps: [{ op: "done" }],
          provenance: { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin },
        };
      }
      if (turn === "replay-first") return first;
      const plan = await deterministic.propose(request);
      first ??= plan;
      return plan;
    },
  };
}

const loop = async (script: readonly Turn[], maxTurns: number, options: PortOptions & { reasonerKind?: "DETERMINISTIC_FALLBACK" } = {}) => {
  const page = new SimulatedPage(options);
  const reasoner = scripted(script);
  const grants: unknown[] = [];
  let between = 0;
  const ports = { ...portsFor(page, { ...options, reasoner, onGrant: (g) => grants.push(g) }), ...(options.reasonerKind ? { reasonerKind: options.reasonerKind } : {}) };
  const record = await runTaskLoop(ports, {
    ...RUN_OPTIONS,
    maxTurns,
    betweenTurns: async () => {
      between += 1;
    },
  });
  return { page, record, reasoner, grants, between: () => between };
};

const path = (turn: RunRecord): RunState[] => [turn.transitions[0]?.from ?? "IDLE", ...turn.transitions.map((t) => t.to)];

describe("repeat: an action, then the model's done", () => {
  it("runs two full turns and ends COMPLETED_AS_DECLARED, having acted once", async () => {
    const { record, page } = await loop(["act", "done"], 3);
    expect(record.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(record.turns).toHaveLength(2);
    expect(record.confirmedActions).toBe(1);
    expect(page.clicks).toBe(1);
    expect(page.submitted).toBe(true);
    expect(succeeded(record.turns[0]!)).toBe(true);
  });

  it("each turn is a whole pass: the first through every gate, the second ending at VALIDATE_PLAN → DONE", async () => {
    const { record } = await loop(["act", "done"], 3);
    expect(path(record.turns[0]!)).toEqual(["IDLE", "OBSERVE", "SANITIZE", "VERIFY_PAYLOAD", "SEND", "VALIDATE_PLAN", "AWAIT_GRANT", "REHYDRATE", "ACT", "VERIFY_RESULT", "DONE"]);
    expect(path(record.turns[1]!)).toEqual(["IDLE", "OBSERVE", "SANITIZE", "VERIFY_PAYLOAD", "SEND", "VALIDATE_PLAN", "DONE"]);
  });

  it("records done as the model's claim, never as a verified success", async () => {
    const { record } = await loop(["act", "done"], 3);
    const last = record.turns[1]!;
    expect(last.declaredDone).toBe(true);
    expect(last.act).toBeNull();
    expect(succeeded(last)).toBe(false);
    expect(last.plan?.steps).toEqual([{ op: "done" }]);
  });

  it("gives every turn its own request id, its own verified handoff and its own observation", async () => {
    const { record } = await loop(["act", "done"], 3);
    expect(record.turns.map((t) => t.requestId)).toEqual([turnRequestId(REQUEST, 1), turnRequestId(REQUEST, 2)]);
    const [a, b] = record.turns;
    expect(isVerifiedHandoff(a!.handoff)).toBe(true);
    expect(isVerifiedHandoff(b!.handoff)).toBe(true);
    expect(a!.handoff).not.toBe(b!.handoff);
    expect(a!.handoff!.request.requestId).not.toBe(b!.handoff!.request.requestId);
    expect(String(a!.initialObservation!.graph.frameId)).not.toBe(String(b!.initialObservation!.graph.frameId));
  });

  it("no turn's crossing carries a value: the handoff and the plan of every turn are value-free", async () => {
    const { record } = await loop(["act", "done"], 3);
    for (const turn of record.turns) {
      const crossed = `${turn.handoffSerialized}${JSON.stringify(turn.plan)}`;
      for (const value of Object.values(DEMO)) expect(crossed).not.toContain(value);
    }
  });

  it("revokes between turns: the hook runs once between two turns and never before the first", async () => {
    const { between } = await loop(["act", "done"], 3);
    expect(between()).toBe(1);
  });
});

describe("done on the first turn", () => {
  it("ends without asking a person, restoring a value or touching the page", async () => {
    const { record, page, grants } = await loop(["done"], 3);
    expect(record.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(record.turns).toHaveLength(1);
    expect(record.confirmedActions).toBe(0);
    expect(page.clicks).toBe(0);
    expect(page.submitted).toBe(false);
    expect(grants).toEqual([]);
    expect(record.turns[0]!.rehydrated).toEqual([]);
  });
});

describe("stop and ask", () => {
  it("a refused turn ends the task, and nothing after it runs", async () => {
    // The second proposal re-submits a form that is already submitted: the gates refuse it.
    const { record, page, reasoner } = await loop(["act", "act", "done"], 3);
    expect(record.outcome).toBe("STOPPED_REFUSED");
    expect(record.turns).toHaveLength(2);
    expect(record.turns[1]!.state).toBe("REFUSED");
    expect(reasoner.calls()).toBe(2);
    expect(page.clicks).toBe(1);
  });

  it("a plan made for an earlier turn is refused on a later one: authority does not carry over", async () => {
    const { record, page } = await loop(["act", "replay-first"], 3);
    expect(record.outcome).toBe("STOPPED_REFUSED");
    expect(record.turns[1]!.refusal?.cause).toBe("REQUEST_MISMATCH");
    expect(page.clicks).toBe(1);
  });

  it("an action VERIFY RESULT did not confirm ends the task; uncertainty is never a reason to continue", async () => {
    const { record, reasoner } = await loop(["act", "done"], 3, { neverDisablesSubmit: true });
    expect(record.outcome).toBe("STOPPED_UNVERIFIED");
    expect(record.turns).toHaveLength(1);
    expect(record.turns[0]!.state).toBe("DONE");
    expect(succeeded(record.turns[0]!)).toBe(false);
    expect(reasoner.calls()).toBe(1);
  });

  it("the deterministic planner answers one turn and the task stops: it cannot judge what is next", async () => {
    const { record, reasoner } = await loop(["act", "done"], 3, { reasonerKind: "DETERMINISTIC_FALLBACK" });
    expect(record.outcome).toBe("STOPPED_SINGLE_TURN_PLANNER");
    expect(record.confirmedActions).toBe(1);
    expect(reasoner.calls()).toBe(1);
  });

  it("a spent budget stops the task after its last confirmed turn", async () => {
    const { record, reasoner } = await loop(["act", "done"], 1);
    expect(record.outcome).toBe("STOPPED_TURN_BUDGET");
    expect(record.confirmedActions).toBe(1);
    expect(reasoner.calls()).toBe(1);
  });
});

describe("the turn budget", () => {
  it(`is an integer from 1 to ${MAX_TASK_TURNS}`, () => {
    expect(checkTurnBudget(1)).toBe(1);
    expect(checkTurnBudget(MAX_TASK_TURNS)).toBe(MAX_TASK_TURNS);
  });

  it.each([0, MAX_TASK_TURNS + 1, 1.5, -1, Number.NaN, "2", undefined, null])("refuses %s before looking at the page", async (bad) => {
    expect(() => checkTurnBudget(bad)).toThrow(TurnBudgetError);
    const page = new SimulatedPage();
    await expect(runTaskLoop(portsFor(page), { ...RUN_OPTIONS, maxTurns: bad as number })).rejects.toThrow(TurnBudgetError);
    expect(page.observations).toBe(0);
  });
});

describe("the stopping policy on its own (synthetic turn records, not the gates)", () => {
  /** A confirmed turn proposing `steps`. Only the fields the policy reads are meaningful. */
  const confirmed = (steps: unknown[]): RunRecord =>
    ({
      state: "DONE",
      declaredDone: false,
      reasonerKind: "LOCAL_MODEL",
      plan: { planVersion: "1", steps, provenance: { requestId: "r", sessionId: "s", viewId: "v" } },
      act: { verification: { verification: "CONFIRMED" } },
    }) as unknown as RunRecord;

  const run = (proposals: unknown[][], maxTurns: number) => {
    const asked: string[] = [];
    let n = 0;
    return runTaskLoop(portsFor(new SimulatedPage()), { ...RUN_OPTIONS, maxTurns }, async (_ports, options) => {
      asked.push(options.requestId);
      return confirmed(proposals[n++] ?? proposals[proposals.length - 1]!);
    }).then((record) => ({ record, asked }));
  };

  it("stops when the model proposes exactly what it proposed last turn", async () => {
    const same = [{ op: "click", target: "#next" }];
    const { record, asked } = await run([same, same, same], 5);
    expect(record.outcome).toBe("STOPPED_NO_PROGRESS");
    expect(asked).toHaveLength(2);
  });

  it("continues while every turn is confirmed and different, until the budget is spent", async () => {
    const { record, asked } = await run([[{ op: "click", target: "#a" }], [{ op: "click", target: "#b" }], [{ op: "click", target: "#c" }]], 3);
    expect(record.outcome).toBe("STOPPED_TURN_BUDGET");
    expect(record.confirmedActions).toBe(3);
    expect(asked).toEqual([turnRequestId(REQUEST, 1), turnRequestId(REQUEST, 2), turnRequestId(REQUEST, 3)]);
  });
});
