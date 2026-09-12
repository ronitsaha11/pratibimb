/**
 * The composed execution path: VALIDATE → HIT-TEST → ACT → VERIFY RESULT. ADR-0007.
 *
 * The four stages are separate modules on purpose and they stay separate here — this file
 * sequences them, it does not merge them. Each one can refuse, each refusal stops everything
 * after it, and the outcome says exactly how far the action got:
 *
 *     PROPOSE
 *         ↓
 *     VALIDATE ──── RE_OBSERVE ───────────────→ stop. nothing was touched.
 *         ↓ ALLOW
 *     HIT-TEST ──── MISMATCH / UNKNOWN ───────→ stop. ACT is never called.
 *         ↓ MATCH
 *       ACT ─────── REJECTED / UNSUPPORTED ───→ nothing was dispatched.
 *         ↓ EXECUTED (dispatched — NOT "worked")
 *   VERIFY RESULT → CONFIRMED / NOT_CONFIRMED / UNKNOWN
 *
 * TWO PROPERTIES ARE WORTH READING THE FILE FOR.
 *
 * 1. **`act` is called from exactly one place**, inside the `MATCH` branch, and there is no other
 *    statement between the hit test and the dispatch. The gate's whole value is the size of the
 *    window it closes; a caller that re-plans, re-observes or awaits something unrelated in
 *    between has reopened the hole this exists to shut.
 * 2. **A dispatch is never reported as a success.** `EXECUTED` reaches the caller as `EXECUTED`,
 *    and the only thing that can say the action worked is VERIFY RESULT reading the page back. A
 *    caller that supplies no readback gets `verification: null`, which the exported predicate
 *    treats as not-confirmed.
 *
 * WHAT THIS IS NOT. It is not an agent loop. It does not observe, plan, retry, recover, choose a
 * target, or decide what to do next; every one of those belongs to an orchestration layer that
 * does not exist (AUDIT-0005). It performs one proposed action, once, and reports what happened.
 */
import { type ElementGraph } from "@pratibimb/perception";

import {
  type FreshnessDecision,
  type FreshnessTolerance,
  type ProposedAction,
  validateActionFreshness,
} from "./actionFreshness.js";
import { act, type ActOptions, type ActResult, type PageActionBridge } from "./act.js";
import {
  agreesForDispatch,
  establishHitAgreement,
  type HitTestBridge,
  type HitTestOptions,
  type HitTestResult,
} from "./hitTest.js";
import {
  type ExpectedPostcondition,
  type PostActionObservation,
  verifyActionResult,
  type VerificationResult,
} from "./verifyResult.js";

/**
 * The two bridges, kept apart.
 *
 * Separate fields rather than one object with three methods, because looking and touching are
 * different authorities and an adapter may legitimately hold only one of them. A hit-test bridge
 * cannot click; an action bridge cannot look.
 */
export interface GuardedBridges {
  readonly action: PageActionBridge;
  readonly hitTest: HitTestBridge;
}

/**
 * How to verify the result — both halves or neither.
 *
 * Coupled in one object so a caller cannot declare an expectation and then forget to supply the
 * observation that would test it, which would leave an expectation recorded and unchecked.
 */
export interface VerificationPlan {
  readonly expect: ExpectedPostcondition;
  /** Observe the page AFTER the action. Must produce a genuinely fresh frame. */
  readonly observe: () => Promise<PostActionObservation>;
}

export interface GuardedActOptions extends ActOptions {
  readonly tolerance?: FreshnessTolerance;
  readonly hitTest?: HitTestOptions;
  readonly verify?: VerificationPlan;
}

/** The furthest stage the action reached. Nothing after it ran. */
export type ReachedStage = "VALIDATE" | "HIT_TEST" | "ACT" | "VERIFY_RESULT";

export interface GuardedOutcome {
  readonly reached: ReachedStage;
  readonly decision: FreshnessDecision;
  /** `null` when validation refused, so the hit test was never performed. */
  readonly hit: HitTestResult | null;
  /** `null` when the hit test did not return MATCH, so ACT was never called. */
  readonly result: ActResult | null;
  /** `null` when ACT was never called, or when the caller supplied no readback to verify against. */
  readonly verification: VerificationResult | null;
}

/**
 * The single predicate for "did this action actually work?".
 *
 * `null` is false, `UNKNOWN` is false, `EXECUTED` on its own is false. Only the page saying so
 * counts, which is the whole point of the stage.
 */
export const guardedActionConfirmed = (o: GuardedOutcome): boolean =>
  o.verification !== null && o.verification.verification === "CONFIRMED";

/** `true` only if a browser operation was actually dispatched. Not a claim that it worked. */
export const guardedActionDispatched = (o: GuardedOutcome): boolean =>
  o.result !== null && o.result.status === "EXECUTED";

/**
 * Run one proposed action through the whole protected sequence.
 *
 * Fail-closed at every boundary, and the failures are structural rather than conditional: the
 * function returns early, so the code that follows a gate is unreachable when the gate refuses.
 * There is no flag that could be set wrong and no default branch that could be mistaken for
 * permission.
 */
export async function guardedAct(
  graph: ElementGraph,
  action: ProposedAction,
  bridges: GuardedBridges,
  options: GuardedActOptions = {}
): Promise<GuardedOutcome> {
  // ── VALIDATE ───────────────────────────────────────────────────────────────────────────────
  const decision = validateActionFreshness(graph, action, options.tolerance);
  if (decision.decision !== "ALLOW") {
    return { reached: "VALIDATE", decision, hit: null, result: null, verification: null };
  }

  // ── HIT-TEST AGREEMENT ─────────────────────────────────────────────────────────────────────
  // Immediately before the dispatch, and nothing happens in between.
  const hit = await establishHitAgreement(decision, bridges.hitTest, options.hitTest ?? {});
  if (!agreesForDispatch(hit)) {
    // MISMATCH and UNKNOWN are both refusals. `act` is not called, so no bridge click occurs.
    return { reached: "HIT_TEST", decision, hit, result: null, verification: null };
  }

  // ── ACT ────────────────────────────────────────────────────────────────────────────────────
  const result = await act(decision, bridges.action, options);

  // ── VERIFY RESULT ──────────────────────────────────────────────────────────────────────────
  const plan = options.verify;
  const node = decision.node;
  const frame = decision.frameId;
  if (!plan || !node || frame === undefined) {
    // Either no readback was supplied, or there is no target to verify against — which a MATCH
    // cannot actually produce, since the hit test refuses a decision without one. Reported as a
    // dispatch with `verification: null` rather than as an optimistic success.
    return { reached: "ACT", decision, hit, result, verification: null };
  }
  const observation = await plan.observe();
  const verification = verifyActionResult({
    result,
    acted: node,
    actedFrameId: frame,
    expected: plan.expect,
    observation,
  });
  return { reached: "VERIFY_RESULT", decision, hit, result, verification };
}
