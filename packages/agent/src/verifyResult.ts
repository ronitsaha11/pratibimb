/**
 * VERIFY RESULT — did the page actually do what the action asked for? ADR-0007.
 *
 * THE ONE SENTENCE THIS MODULE EXISTS FOR:
 *
 *     EXECUTED != CONFIRMED.
 *
 * `ActResult.status === "EXECUTED"` means a browser operation was dispatched without an
 * immediate error. It does not mean the click landed on anything, that a handler ran, that focus
 * moved, that a form submitted, or that the page noticed at all. An agent that treats dispatch as
 * success will report a completed task after clicking a dead pixel, and will keep doing it
 * confidently. Every "probably worked" in a UI agent is this bug.
 *
 * So the page is asked, and the page's answer is the evidence. Not the executor's bookkeeping,
 * not the fact that no exception was thrown, not a timer.
 *
 * THREE STATES, AND THE THIRD IS NOT A FAILURE.
 *
 * `CONFIRMED` — the expected postcondition was positively observed.
 * `NOT_CONFIRMED` — reliable evidence shows it did not occur.
 * `UNKNOWN` — the evidence does not settle it.
 *
 * `UNKNOWN` is a first-class answer and it is collapsed in neither direction. Reporting it as
 * success invents a result; reporting it as failure invents one too, and a loop that retries on a
 * false failure can double-submit a form. A dispatch whose outcome is genuinely unknown — a
 * bridge timeout, a target that vanished — stays unknown, and recovery is the orchestration
 * layer's problem, not this module's. **Nothing here retries anything.**
 *
 * THE POSTCONDITION IS DECLARED, NEVER GUESSED.
 *
 * There is no "something changed" check. A generic diff would confirm an action because an
 * unrelated timer ticked — the QG-02 fixture has exactly such a timer, which is why it is a good
 * place to be careful. The caller states what it expected in terms the element graph can already
 * answer, and this module evaluates that one claim.
 *
 * NO SERVER, NO MODEL, NO NETWORK.
 *
 * This is a pure function over an `ActResult` and a fresh observation. No detector runs, nothing
 * is fetched, nothing is stored, and the observation is structured data rather than a script — so
 * there is no path here through which arbitrary page JavaScript could be executed, and no field
 * in which a secret could travel.
 */
import { type ElementGraph, type ElementNode, type FrameId, type NodeId } from "@pratibimb/perception";

import { type ActResult } from "./act.js";

/**
 * What the caller expected the page to look like afterwards.
 *
 * Deliberately a tiny closed set, and every member is answerable from the element graph plus one
 * focus reading. Each was chosen because it is a real observable of the controlled MVP fixture,
 * not because it might be useful later: a postcondition nothing can currently observe would be a
 * promise rather than a check.
 */
export type ExpectedPostcondition =
  /** Focus moved to the element that was clicked. */
  | { readonly kind: "FOCUS_ON_TARGET" }
  /** The clicked element's enabled state is now this. */
  | { readonly kind: "TARGET_ENABLED"; readonly expected: boolean }
  /** The clicked element's accessible name is now this. */
  | { readonly kind: "TARGET_NAME"; readonly expected: string };

/**
 * A fresh reading of the page, taken AFTER the action.
 *
 * Structured, never a script: the caller hands over a graph it built with the ordinary perception
 * builder and, separately, which element holds focus. Nothing here can carry a value, an inner
 * text or a screenshot.
 */
export interface PostActionObservation {
  /** A graph built from a NEW observation. Verifying against the pre-action graph proves nothing. */
  readonly graph: ElementGraph;
  /**
   * Which element holds focus, by stable DOM reference.
   *
   * Three-valued on purpose, and the distinction is the whole reason this field is not a boolean:
   *
   * - a selector — that element has focus;
   * - `null` — reliably NOTHING has focus (body, or focus was lost);
   * - the property absent — the observer could not establish focus at all, which is an UNKNOWN
   *   and must never be read as "nothing has focus".
   */
  readonly focusedSelector?: string | null;
  /** Index among identical siblings for the focused element, where the selector is not unique. */
  readonly focusedNth?: number;
}

/** Reliable evidence that the expected postcondition did not occur. */
export type NotConfirmedCause =
  | "ACTION_NOT_DISPATCHED"
  | "FOCUS_ELSEWHERE"
  | "FOCUS_ABSENT"
  | "STATE_DIFFERS";

/** The evidence does not settle the question. Every one of these stays unknown. */
export type UnknownVerificationCause =
  | "DISPATCH_OUTCOME_UNKNOWN"
  | "OBSERVATION_STALE"
  | "NO_STABLE_REFERENCE"
  | "TARGET_ABSENT_AFTER_ACTION"
  | "TARGET_AMBIGUOUS"
  | "TARGET_IDENTITY_CHANGED"
  | "FOCUS_NOT_OBSERVED"
  | "MALFORMED_REQUEST";

export type VerificationResult =
  | {
      readonly verification: "CONFIRMED";
      readonly postcondition: ExpectedPostcondition["kind"];
      /** What the page showed. The page's own answer, quoted back so a ledger can hold it. */
      readonly evidence: string;
    }
  | {
      readonly verification: "NOT_CONFIRMED";
      readonly postcondition: ExpectedPostcondition["kind"];
      readonly cause: NotConfirmedCause;
      readonly detail: string;
    }
  | {
      readonly verification: "UNKNOWN";
      readonly postcondition: ExpectedPostcondition["kind"];
      readonly cause: UnknownVerificationCause;
      readonly detail: string;
    };

/**
 * `true` only for a positively observed postcondition.
 *
 * One expression, so a caller cannot get the polarity wrong by enumerating the failures. Anything
 * that is not exactly `CONFIRMED` — including `UNKNOWN`, including a state this module has never
 * heard of — is not a confirmed action.
 */
export const wasConfirmed = (v: VerificationResult): boolean => v.verification === "CONFIRMED";

/**
 * What VERIFY RESULT needs in order to answer.
 *
 * `acted` is the full `ElementNode` rather than ACT's `ActedTarget` because `ActedTarget` carries
 * only the positional `nodeId`, and re-identifying a target by a positional id across a fresh
 * observation is precisely the rebinding bug MVP-1 demo E measured. The node carries `domRef`,
 * which survives.
 */
export interface VerificationRequest {
  readonly result: ActResult;
  /** The node VALIDATE allowed and ACT acted on. */
  readonly acted: ElementNode;
  /** The frame the action was validated and dispatched against. */
  readonly actedFrameId: FrameId;
  readonly expected: ExpectedPostcondition;
  readonly observation: PostActionObservation;
}

const matchesRef = (n: ElementNode, selector: string, nth?: number): boolean =>
  n.domRef.selector === selector && (n.domRef.nth ?? null) === (nth ?? null);

/**
 * VERIFY RESULT. Decide whether the page did what the action was supposed to make it do.
 *
 * Pure and synchronous: everything it needs has already been observed. The order of the branches
 * is the order of the evidence — what ACT reported first, then whether the observation is even
 * capable of answering, then the postcondition itself. A later check never overrides an earlier
 * `UNKNOWN`, because an unknown dispatch cannot be rescued by a confident-looking page.
 */
export function verifyActionResult(request: VerificationRequest): VerificationResult {
  const { result, acted, actedFrameId, expected, observation } = request;
  const kind = expected.kind;
  const confirmed = (evidence: string): VerificationResult => ({
    verification: "CONFIRMED",
    postcondition: kind,
    evidence,
  });
  const not = (cause: NotConfirmedCause, detail: string): VerificationResult => ({
    verification: "NOT_CONFIRMED",
    postcondition: kind,
    cause,
    detail,
  });
  const unknown = (cause: UnknownVerificationCause, detail: string): VerificationResult => ({
    verification: "UNKNOWN",
    postcondition: kind,
    cause,
    detail,
  });

  // 1 — nothing was dispatched, and ACT's own refusal is the reliable evidence of that. The page
  //     is not consulted: there is no action whose effect could be there.
  if (result.status === "REJECTED" || result.status === "UNSUPPORTED_ACTION") {
    return not(
      "ACTION_NOT_DISPATCHED",
      `ACT returned ${result.status} (${result.cause}), so no browser operation occurred and the ` +
        "expected postcondition cannot have been produced by one."
    );
  }

  // 2 — the dispatch itself is unknown. A TIMEOUT means the click may well have landed, and a
  //     bridge that threw may have thrown after dispatching. Neither is a failure and neither is
  //     a success. This is checked BEFORE the page is read, because a page that happens to look
  //     right does not establish that THIS action is what made it so.
  if (result.status === "EXECUTION_ERROR") {
    return unknown(
      "DISPATCH_OUTCOME_UNKNOWN",
      `ACT returned EXECUTION_ERROR (${result.category}); whether the operation reached the page is ` +
        "unestablished, so the outcome is unknown rather than failed. Recovery is the loop's decision, not this stage's."
    );
  }

  // 3 — an EXECUTED result must be about the node we were handed.
  if (result.target.nodeId !== acted.id) {
    return unknown(
      "MALFORMED_REQUEST",
      `ACT reported node ${result.target.nodeId} but verification was asked about ${acted.id}.`
    );
  }

  // 4 — the observation must be a NEW one. Re-reading the graph the action was validated against
  //     would "confirm" a postcondition that was already true before the click, which is the
  //     dressed-up version of assuming success.
  if (observation.graph.frameId === actedFrameId) {
    return unknown(
      "OBSERVATION_STALE",
      `the observation is frame ${String(observation.graph.frameId)}, the same frame the action was ` +
        "dispatched against. It cannot show what the action changed; observe the page again."
    );
  }

  // 5 — re-identify the target by its STABLE reference, never by the positional node id.
  const selector = acted.domRef.selector;
  if (!selector) {
    return unknown(
      "NO_STABLE_REFERENCE",
      `node ${acted.id} carries no DOM selector, so it cannot be re-identified in a fresh observation.`
    );
  }
  const candidates = observation.graph.nodes.filter((n) => matchesRef(n, selector, acted.domRef.nth));
  if (candidates.length === 0) {
    // The target is gone. It may have vanished BECAUSE the action worked, or instead of it. The
    // final state cannot establish which, so this is unknown and not a failure.
    return unknown(
      "TARGET_ABSENT_AFTER_ACTION",
      `${selector} is not present in the fresh observation. Whether the action produced the expected ` +
        "state before the element disappeared cannot be established from this evidence."
    );
  }
  if (candidates.length > 1) {
    return unknown(
      "TARGET_AMBIGUOUS",
      `${selector} matches ${candidates.length} elements in the fresh observation, so no single one can ` +
        "be read as the target."
    );
  }
  const now = candidates[0] as ElementNode;
  if (now.role !== acted.role) {
    return unknown(
      "TARGET_IDENTITY_CHANGED",
      `${selector} was role "${acted.role}" and is now "${now.role}"; it cannot be assumed to be the same control.`
    );
  }

  // 6 — the declared postcondition, and only it.
  switch (expected.kind) {
    case "FOCUS_ON_TARGET": {
      if (!("focusedSelector" in observation)) {
        return unknown(
          "FOCUS_NOT_OBSERVED",
          "the observation does not report focus at all, so whether focus moved is unestablished. " +
            "An unreported focus is not an absent focus."
        );
      }
      const focused = observation.focusedSelector;
      if (focused === undefined) {
        return unknown("FOCUS_NOT_OBSERVED", "the observation reports focus as unestablished.");
      }
      if (focused === null) {
        return not("FOCUS_ABSENT", `nothing holds focus after the action; ${selector} does not.`);
      }
      const nthAgrees = (acted.domRef.nth ?? null) === (observation.focusedNth ?? null);
      if (focused === selector && nthAgrees) {
        return confirmed(`the page reports focus on ${selector}, which is the element that was clicked.`);
      }
      return not(
        "FOCUS_ELSEWHERE",
        `the page reports focus on ${focused}${observation.focusedNth === undefined ? "" : `[${observation.focusedNth}]`}, ` +
          `not on the clicked ${selector}. The click was dispatched; the intended effect was not produced.`
      );
    }
    case "TARGET_ENABLED": {
      if (now.enabled === expected.expected) {
        return confirmed(`${selector} is ${now.enabled ? "enabled" : "disabled"}, as expected.`);
      }
      return not(
        "STATE_DIFFERS",
        `${selector} is ${now.enabled ? "enabled" : "disabled"}; the expected state was ` +
          `${expected.expected ? "enabled" : "disabled"}.`
      );
    }
    case "TARGET_NAME": {
      if (now.name === expected.expected) {
        return confirmed(`${selector} is named "${now.name}", as expected.`);
      }
      return not(
        "STATE_DIFFERS",
        `${selector} is named "${now.name}"; the expected name was "${expected.expected}".`
      );
    }
  }
}

/**
 * The node id an `ActResult` acted on, or `null` if nothing was dispatched.
 *
 * A small helper so a ledger does not have to widen the union by hand — and so "was there a node
 * at all?" is answered by a function rather than by an optional-chain that quietly yields
 * `undefined` for a refusal.
 */
export const actedNodeId = (r: ActResult): NodeId | null => (r.status === "EXECUTED" ? r.target.nodeId : null);
