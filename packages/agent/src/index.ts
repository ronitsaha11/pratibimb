/**
 * `@pratibimb/agent` — the execution-loop stages that exist.
 *
 * Today that is four:
 *
 * - **VALIDATE + REFRESH** — the action-freshness boundary between perception and any browser
 *   action (ADR-0005);
 * - **HIT-TEST AGREEMENT** — the TOCTOU gate that asks, immediately before the click, whether the
 *   validated element is still topmost at the point about to be clicked (ADR-0007);
 * - **ACT** — the executor, which performs exactly one action kind (`click`) and only on a
 *   decision VALIDATE produced and attested (ADR-0006);
 * - **VERIFY RESULT** — the page readback that decides whether the action actually did anything
 *   (ADR-0007). `EXECUTED` is a dispatch, never a success.
 *
 * `guardedAct` composes all four in order and is the path a caller should use. `act` on its own
 * is the unguarded primitive and performs no hit test; that residual is stated in ADR-0007 §8
 * rather than papered over.
 *
 * Deliberately absent, and absent on purpose rather than by oversight: REASON (no server, B-03),
 * PLAN (no planner), SANITIZE (no PII detectors), VERIFY (no privacy verifier), RE-HYDRATE (no
 * vault). Because the vault and the sanitizer are absent, `type` is refused rather than
 * approximated — see ADR-0006 §3. See `artifacts/reviews/AUDIT-0005-mvp-loop-readiness.md`.
 *
 * This package imports nothing that can reach the network and holds no state, so it cannot
 * weaken Invariant E or the vault invariants. Its entire browser authority is two interface
 * methods: `PageActionBridge.clickAtCssPoint`, which acts, and `HitTestBridge.topmostAtCssPoint`,
 * which only looks.
 */
export {
  ALLOWED_ACTIONS,
  bearsFreshnessAttestation,
  PROPOSED_FRESHNESS_TOLERANCE,
  TARGETED_ACTIONS,
  actionableTarget,
  mustReObserve,
  validateActionFreshness,
  type ActionKind,
  type CssPoint,
  type AllowedAction,
  type FreshnessDecision,
  type FreshnessTolerance,
  type ProposedAction,
  type ReObserve,
  type RejectionReason,
  type TargetClaim,
} from "./actionFreshness.js";

export {
  DEFAULT_DISPATCH_TIMEOUT_MS,
  EXECUTABLE_ACTIONS,
  PROPOSED_CONFIRMATION_NAME_PATTERNS,
  act,
  confirmationTierOf,
  validateAndAct,
  wasDispatched,
  type ActOptions,
  type ActResult,
  type ActedTarget,
  type ConfirmationTier,
  type ErrorCategory,
  type ExecutableAction,
  type ExecutionStatus,
  type PageActionBridge,
  type RejectionCause,
  type UnsupportedCause,
} from "./act.js";

export {
  DEFAULT_HIT_TEST_TIMEOUT_MS,
  PROPOSED_HIT_TEST_TOLERANCE,
  agreesForDispatch,
  bearsHitAgreement,
  dispatchPointOf,
  establishHitAgreement,
  type Agreement,
  type HitTestBridge,
  type HitTestOptions,
  type HitTestResult,
  type HitTestTolerance,
  type MismatchCause,
  type TopmostElement,
  type UnknownCause,
} from "./hitTest.js";

export {
  actedNodeId,
  verifyActionResult,
  wasConfirmed,
  type ExpectedPostcondition,
  type NotConfirmedCause,
  type PostActionObservation,
  type UnknownVerificationCause,
  type VerificationRequest,
  type VerificationResult,
} from "./verifyResult.js";

export {
  guardedAct,
  guardedActionConfirmed,
  guardedActionDispatched,
  type GuardedActOptions,
  type GuardedBridges,
  type GuardedOutcome,
  type ReachedStage,
  type VerificationPlan,
} from "./guardedAct.js";
