/**
 * STAGE 12 — "repeat, or stop and ask" (constitution §1, FROZEN).
 *
 * A task that takes more than one action is a sequence of TURNS. Each turn is one complete
 * `runTask`: a fresh observation, a fresh sanitize, a fresh verified handoff, a fresh plan, and every
 * gate — VALIDATE, REFRESH, the human grant, REHYDRATE, ACT, VERIFY RESULT — exactly as for a
 * single-step task. This file decides only **whether there is another turn**, and the answer is "no"
 * unless the evidence says the last one worked.
 *
 * WHAT IS CARRIED FROM ONE TURN TO THE NEXT: the goal, the session, and the count. Nothing else —
 * no plan, no reference, no grant, no permit, no confirmation, no value. Turn N+1 cannot reuse an
 * authority turn N held, because it never receives one; it has to earn its own, against the page as
 * it is now. Each turn has its own request id, so a plan made for one turn is refused by another
 * (`REQUEST_MISMATCH`).
 *
 * WHEN IT CONTINUES — all of these, and only then:
 *   - the turn ran to DONE, acted, and VERIFY RESULT said CONFIRMED (`succeeded`);
 *   - the plan came from the primary reasoner, not the deterministic planner (which plans exactly one
 *     fixed task and cannot judge whether a goal is finished);
 *   - the plan is not the same as the previous turn's (the same action twice is not progress);
 *   - the turn budget is not spent.
 *
 * WHEN IT STOPS, and what it reports — never a success it did not observe:
 *   COMPLETED_AS_DECLARED   the model proposed `done` and the client accepted the view it was made
 *                           against. The MODEL'S claim. Every earlier turn's own verdict is in `turns`.
 *   STOPPED_REFUSED         a gate refused. REFUSED stays terminal: nothing after it runs.
 *   STOPPED_UNVERIFIED      an action ran but VERIFY RESULT did not say CONFIRMED. Uncertainty is
 *                           never a reason to keep going.
 *   STOPPED_SINGLE_TURN_PLANNER  the deterministic planner answered; it cannot decide what is next.
 *   STOPPED_NO_PROGRESS     the model proposed the same plan it proposed last turn.
 *   STOPPED_TURN_BUDGET     every turn worked and the budget ran out before the model said `done`.
 * Every stop except COMPLETED_AS_DECLARED means "stop and ask": a person decides what happens next.
 */
import { type SafePlan } from "@pratibimb/plan";

import { runTask, succeeded, type RunOptions, type RunRecord } from "./machine.js";
import { type ClientPorts } from "./ports.js";

/**
 * The most turns one task may take. A product limit, not a security boundary: every turn passes
 * every gate on its own. It bounds how long a task can run before a person is asked again.
 */
export const MAX_TASK_TURNS = 5;

export type LoopOutcome =
  | "COMPLETED_AS_DECLARED"
  | "STOPPED_REFUSED"
  | "STOPPED_UNVERIFIED"
  | "STOPPED_SINGLE_TURN_PLANNER"
  | "STOPPED_NO_PROGRESS"
  | "STOPPED_TURN_BUDGET";

export interface LoopOptions extends Omit<RunOptions, "requestId"> {
  /** The task's request id. Turn n runs as `${requestId}.t${n}`. */
  readonly requestId: string;
  /** 1 … MAX_TASK_TURNS. */
  readonly maxTurns: number;
  /**
   * Called after a turn ends and before the next one starts. The extension revokes every capability
   * the turn armed here, so no authority survives into a turn that did not earn it.
   */
  readonly betweenTurns?: () => Promise<void>;
}

export interface LoopRecord {
  readonly goal: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly maxTurns: number;
  readonly outcome: LoopOutcome;
  /** Every turn's own record, in order. Each is exactly what a single-turn `runTask` returns. */
  readonly turns: readonly RunRecord[];
  /** How many turns acted and were CONFIRMED by VERIFY RESULT. */
  readonly confirmedActions: number;
}

/** A refusal to start: the budget is not a whole number in range. */
export class TurnBudgetError extends RangeError {
  override readonly name = "TurnBudgetError";
}

/** `maxTurns`, checked. Anything but an integer 1 … MAX_TASK_TURNS is refused, never clamped. */
export function checkTurnBudget(maxTurns: unknown): number {
  if (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_TASK_TURNS) {
    throw new TurnBudgetError(`maxTurns must be an integer from 1 to ${MAX_TASK_TURNS}; got ${String(maxTurns)}`);
  }
  return maxTurns;
}

/** The request id turn `n` (1-based) runs under. */
export const turnRequestId = (requestId: string, n: number): string => `${requestId}.t${n}`;

/** Two plans propose the same thing: the same operations on the same targets with the same references. */
const sameProposal = (a: SafePlan | null, b: SafePlan | null): boolean =>
  a !== null && b !== null && JSON.stringify(a.steps) === JSON.stringify(b.steps);

/**
 * Run a task for up to `maxTurns` turns.
 *
 * `runTurn` is `runTask` in every product caller; it is a parameter only so the stopping policy can
 * be tested on its own. It is handed the turn's options and returns that turn's record.
 */
export async function runTaskLoop(
  ports: ClientPorts,
  options: LoopOptions,
  runTurn: (ports: ClientPorts, options: RunOptions) => Promise<RunRecord> = runTask
): Promise<LoopRecord> {
  const maxTurns = checkTurnBudget(options.maxTurns);
  const { maxTurns: _budget, betweenTurns, requestId, ...base } = options;
  const turns: RunRecord[] = [];
  let confirmedActions = 0;

  const finish = (outcome: LoopOutcome): LoopRecord => ({
    goal: options.goal,
    sessionId: options.sessionId,
    requestId,
    maxTurns,
    outcome,
    turns,
    confirmedActions,
  });

  for (let n = 1; n <= maxTurns; n++) {
    if (n > 1 && betweenTurns) await betweenTurns();
    const turn = await runTurn(ports, { ...base, requestId: turnRequestId(requestId, n) });
    turns.push(turn);

    if (turn.state === "REFUSED") return finish("STOPPED_REFUSED");
    if (turn.declaredDone) return finish("COMPLETED_AS_DECLARED");
    if (!succeeded(turn)) return finish("STOPPED_UNVERIFIED");
    confirmedActions += 1;
    if (turn.reasonerKind === "DETERMINISTIC_FALLBACK") return finish("STOPPED_SINGLE_TURN_PLANNER");
    const previous = turns.length > 1 ? turns[turns.length - 2]! : null;
    if (previous && sameProposal(previous.plan, turn.plan)) return finish("STOPPED_NO_PROGRESS");
  }
  return finish("STOPPED_TURN_BUDGET");
}
