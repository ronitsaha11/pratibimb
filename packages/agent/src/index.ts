/**
 * `@pratibimb/agent` — the execution-loop stages that exist.
 *
 * Today that is two:
 *
 * - **VALIDATE + REFRESH** — the action-freshness boundary between perception and any browser
 *   action (ADR-0005);
 * - **ACT** — the executor, which performs exactly one action kind (`click`) and only on a
 *   decision VALIDATE produced and attested (ADR-0006).
 *
 * Deliberately absent, and absent on purpose rather than by oversight: VERIFY RESULT (nothing
 * reads the page back), REASON (no server, B-03), PLAN (no planner), SANITIZE (no PII
 * detectors), VERIFY (no verifier), RE-HYDRATE (no vault). Because the vault and the sanitizer
 * are absent, `type` is refused rather than approximated — see ADR-0006 §3.
 * See `artifacts/reviews/AUDIT-0005-mvp-loop-readiness.md`.
 *
 * This package imports nothing that can reach the network and holds no state, so it cannot
 * weaken Invariant E or the vault invariants. Its entire browser authority is one interface
 * method, `PageActionBridge.clickAtCssPoint`.
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
