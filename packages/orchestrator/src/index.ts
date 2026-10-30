/**
 * `@pratibimb/orchestrator` — one task, once, through every existing gate.
 *
 * It owns sequencing and nothing else. Privacy is `@pratibimb/privacy`, plan structure is
 * `@pratibimb/plan`, the reasoner boundary is `@pratibimb/reasoner`, and the click is `guardedAct` in
 * `@pratibimb/agent`. This package creates no vault, no sanitizer, no verifier, no rehydration path
 * and no click executor, and it cannot reach a page except through the ports it is handed.
 */
export {
  TERMINAL_STATES,
  resultOf,
  runTask,
  succeeded,
  type RefusalStage,
  type RunOptions,
  type RunRecord,
  type RunRefusal,
  type RunState,
  type RunEvent,
  type RunEventName,
  type RunTimings,
  type Transition,
} from "./machine.js";

export {
  MAX_DECLARED_POSTCONDITIONS,
  PostconditionsError,
  checkPostconditions,
  type ClickPostconditions,
} from "./postconditions.js";

export {
  MAX_TASK_TURNS,
  TurnBudgetError,
  checkTurnBudget,
  runTaskLoop,
  turnRequestId,
  type LoopOptions,
  type LoopOutcome,
  type LoopRecord,
} from "./loop.js";

export {
  CATEGORY_OF,
  CONSENT_DETAIL,
  checkConsentAnswer,
  prepareConsent,
  type ConsentAnswer,
  type ConsentRefusal,
  type ConsentRequest,
} from "./consent.js";

export {
  MAX_DECLARATIONS,
  MAX_EXPECTED_NAME,
  MAX_GOAL,
  checkDeclaration,
  declarationProblem,
  isDeclarableControl,
  prepareDeclarationForm,
  viewOfDeclarationForm,
  type DeclarableControl,
  type DeclarationForm,
  type DeclarationFormView,
  type DeclarationOffer,
  type DeclarationProblem,
  type DeclarationRefusal,
  type DeclaredTarget,
  type TaskDeclaration,
} from "./declaration.js";

export {
  CLARIFICATION_DETAIL,
  checkClarificationAnswer,
  prepareClarification,
  type ClarificationAnswer,
  type ClarificationCandidate,
  type ClarificationRefusal,
  type ClarificationRequest,
  type PreparedClarification,
} from "./clarification.js";

export {
  type ClientPorts,
  type GrantDecision,
  type GrantRequest,
  type Observation,
  type StructuralStatus,
} from "./ports.js";

export {
  createLocalPrivacyBoundary,
  viewFrom,
  type LocalBoundaryDeps,
  type PrivacyBoundary,
  type ReleaseAnswer,
  type ReleaseAsk,
  type SanitizeAnswer,
  type SanitizeAsk,
} from "./privacyBoundary.js";
