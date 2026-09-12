/**
 * ACT — the browser-action executor. ADR-0006.
 *
 * The deliberately boring stage: a validated decision goes in, one browser operation comes
 * out, and a failed validation produces nothing at all. It holds no opinion about whether an
 * action is *safe* — VALIDATE owns freshness, and the human-confirmation tier here is a
 * refusal gate, never a grant.
 *
 * Three properties are worth reading the file for:
 *
 * 1. **The only input is a `FreshnessDecision`.** Not a `ProposedAction`, not a target, not a
 *    selector. The single exported path from a proposal to a page (`validateAndAct`) runs the
 *    validator itself, so no caller can choose an entry point that skips VALIDATE.
 * 2. **The whole of its browser authority is one method** — `PageActionBridge.clickAtCssPoint`.
 *    There is no navigate, no evaluate, no keyboard, no storage, so INV-15/17/18/19 hold by
 *    absence rather than by enforcement.
 * 3. **No field anywhere can hold a typed value.** `type` is refused (ADR-0006 §3), so there is
 *    nothing in this module for a secret to pass through, and nothing to keep out of a log.
 *
 * Absent on purpose: VERIFY RESULT. `EXECUTED` means *dispatched without an immediate error*,
 * never *the page changed as intended*.
 */
import { type CssBox, type ElementNode, type FrameId, type NodeId } from "@pratibimb/perception";

import {
  ALLOWED_ACTIONS,
  bearsFreshnessAttestation,
  type ActionKind,
  type CssPoint,
  type FreshnessDecision,
  type FreshnessTolerance,
  type ProposedAction,
  validateActionFreshness,
} from "./actionFreshness.js";
import { type ElementGraph } from "@pratibimb/perception";

/**
 * The executor's entire authority over a browser.
 *
 * One method. An implementation is an adapter over whatever can actually drive a page — an
 * extension content script in the product (which does not exist yet: there is no
 * `manifest.json` in the repository), Playwright in the experiment harness. Keeping it an
 * interface is what stops a test tool becoming the product's transport, and keeps this package
 * free of `lib.dom`.
 */
export interface PageActionBridge {
  /** The frame this bridge drives. Compared against the decision's frame before dispatch. */
  readonly frameId: FrameId;
  /**
   * Dispatch a real user-style click at a CSS-viewport point.
   *
   * The implementation must use the browser's ordinary actionability path and must NOT force
   * the click past it: a control the browser considers unclickable is a fact, not an obstacle.
   */
  clickAtCssPoint(point: CssPoint): Promise<void>;
}

/** The action kinds this executor performs. Exactly one — see ADR-0006 §3. */
export const EXECUTABLE_ACTIONS = ["click"] as const;
export type ExecutableAction = (typeof EXECUTABLE_ACTIONS)[number];

export type ExecutionStatus = "EXECUTED" | "REJECTED" | "UNSUPPORTED_ACTION" | "EXECUTION_ERROR";

/** Why a precondition refused the action. */
export type RejectionCause =
  | "NOT_VALIDATED"
  | "TARGET_MISSING_IN_DECISION"
  | "BRIDGE_FRAME_MISMATCH"
  | "HUMAN_CONFIRMATION_REQUIRED"
  | "POINT_OUTSIDE_TARGET";

/** Why an allowlisted action is not performed by this executor. */
export type UnsupportedCause =
  | "NOT_ON_ALLOWLIST"
  | "CLEARANCE_PIPELINE_ABSENT"
  | "NO_SAFE_PAYLOAD_CONTRACT"
  | "NO_HUMAN_CONFIRMATION_CHANNEL"
  | "NOT_A_PAGE_OPERATION";

/**
 * How a dispatch failed.
 *
 * `BRIDGE_TIMEOUT` is the important one: it means the outcome is **unknown**. A caller must
 * treat the action as possibly-performed, never as not-performed.
 */
export type ErrorCategory = "BRIDGE_THREW" | "BRIDGE_TIMEOUT";

/**
 * The safe identity of what was acted on, for the ledger a future loop will keep.
 *
 * Role and accessible name only — both already permitted element-graph metadata (structural UI
 * text, never page content). There is no field here for a value, a token or a screenshot.
 */
export interface ActedTarget {
  readonly nodeId: NodeId;
  readonly role: string;
  readonly name: string;
  readonly point: CssPoint;
  readonly box: CssBox;
}

export type ActResult =
  | {
      readonly status: "EXECUTED";
      readonly kind: ExecutableAction;
      readonly target: ActedTarget;
      /** Wall-clock milliseconds spent inside the bridge call. */
      readonly dispatchMs: number;
    }
  | {
      readonly status: "REJECTED";
      readonly cause: RejectionCause;
      readonly detail: string;
      readonly kind?: ActionKind;
    }
  | {
      readonly status: "UNSUPPORTED_ACTION";
      readonly kind: string;
      readonly cause: UnsupportedCause;
      readonly detail: string;
    }
  | {
      readonly status: "EXECUTION_ERROR";
      readonly kind: ExecutableAction;
      readonly category: ErrorCategory;
      /**
       * The error's class name only.
       *
       * The message is deliberately dropped: a bridge message can quote page markup, and
       * INV-21's rule against logging page-derived content outranks a richer string.
       */
      readonly errorName: string;
      readonly dispatchMs: number;
    };

/** `true` only for a dispatch this executor actually performed. */
export const wasDispatched = (r: ActResult): boolean => r.status === "EXECUTED";

/**
 * Why each allowlisted action this executor will not perform is refused.
 *
 * Every entry is a consequence of an existing contract, not a convenience. See ADR-0006 §3 for
 * the full argument; the short version is here so the refusal is readable at the call site.
 */
const REFUSALS: Readonly<Record<Exclude<ActionKind, ExecutableAction>, { cause: UnsupportedCause; detail: string }>> = {
  type: {
    cause: "CLEARANCE_PIPELINE_ABSENT",
    detail:
      "both modes of `type` depend on stages that do not exist: `value_ref` needs the vault " +
      "(RE-HYDRATE), and a literal is admissible only after the action schema's three checks " +
      "(target, D1/D2/D3 shape, vault comparison), none of which is implemented. Typing a " +
      "synthetic string instead would be a secret-handling workaround.",
  },
  scroll: {
    cause: "NO_SAFE_PAYLOAD_CONTRACT",
    detail:
      "the grammar names `scroll` with no payload, and freshness validation treats it as " +
      "targeted — so only a scroll aimed at an already-visible element can pass, which is not " +
      "what scrolling is for. See ADR-0006 §7.",
  },
  select: {
    cause: "NO_SAFE_PAYLOAD_CONTRACT",
    detail: "option identity is not carried by the element graph, so there is nothing to validate an option against.",
  },
  wait: {
    cause: "NOT_A_PAGE_OPERATION",
    detail: "waiting is the loop scheduler's concern; the executor does not own a clock.",
  },
  zoom_request: {
    cause: "NOT_A_PAGE_OPERATION",
    detail: "a request to the capture layer (OBSERVE), not an operation performed on the page.",
  },
  confirm: {
    cause: "NO_HUMAN_CONFIRMATION_CHANNEL",
    detail:
      "there is no confirmation UI, so nothing can represent a human's consent. An executor " +
      "that could emit a confirmation would be fabricating one.",
  },
  done: {
    cause: "NOT_A_PAGE_OPERATION",
    detail: "a terminal signal for the loop, not a browser operation.",
  },
};

/**
 * Accessible names that put a control in the action schema's human-confirmation tier.
 *
 * **PROPOSED — ADR-0006 §6.** The schema names the tier (submit, purchase, delete, sending a
 * message, authentication, new-origin navigation) and names no patterns; these are the smallest
 * explicit list that covers it, matched on word boundaries. They will produce false positives,
 * which is the correct direction to be wrong in: a false positive costs a click, a false
 * negative submits a form.
 */
export const PROPOSED_CONFIRMATION_NAME_PATTERNS: readonly RegExp[] = [
  /\bsubmit\b/i,
  /\bsend\b/i,
  /\bpay\b|\bpayment\b/i,
  /\bpurchase\b|\bbuy\b|\border\b|\bcheckout\b/i,
  /\bdelete\b|\bremove\b|\berase\b/i,
  /\btransfer\b|\bwithdraw\b|\bdeposit\b/i,
  /\bsign\s?in\b|\bsign\s?out\b|\blog\s?in\b|\blog\s?out\b|\blogin\b|\blogout\b/i,
  /\bauthorise\b|\bauthorize\b|\bauthenticate\b/i,
  /\bconfirm\b|\bapprove\b|\baccept\b|\bagree\b/i,
];

export type ConfirmationTier = "ROUTINE" | "CONFIRM_REQUIRED";

/**
 * Screen a target against the confirmation tier. Fails towards CONFIRM_REQUIRED.
 *
 * Role `link` is always CONFIRM_REQUIRED: `ElementNode` carries no `href`, so this code cannot
 * establish that a link stays on the current origin (INV-20), and an unknown destination is not
 * a safe destination.
 *
 * Known weakness, recorded rather than hidden: this reads the accessible name because the
 * element graph does not record that a control is a `type="submit"` button, so a submit named
 * "Continue" passes. The fix is a perception-contract change (ADR-0006 §6).
 */
export function confirmationTierOf(node: Pick<ElementNode, "role" | "name">): ConfirmationTier {
  if (node.role === "link") return "CONFIRM_REQUIRED";
  const name = node.name ?? "";
  return PROPOSED_CONFIRMATION_NAME_PATTERNS.some((p) => p.test(name)) ? "CONFIRM_REQUIRED" : "ROUTINE";
}

const isExecutable = (k: ActionKind): k is ExecutableAction =>
  (EXECUTABLE_ACTIONS as readonly string[]).includes(k);

const centreOf = (b: CssBox): CssPoint => ({
  x: (b.x + b.w / 2) as CssPoint["x"],
  y: (b.y + b.h / 2) as CssPoint["y"],
});

const inside = (p: CssPoint, b: CssBox): boolean =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Default dispatch deadline. A bridge that never returns must not hang the loop. */
export const DEFAULT_DISPATCH_TIMEOUT_MS = 5_000;

export interface ActOptions {
  /** Milliseconds to wait for the bridge before reporting `BRIDGE_TIMEOUT` (outcome unknown). */
  readonly timeoutMs?: number;
}

/**
 * ACT. Execute an action that VALIDATE has already allowed — and nothing else.
 *
 * Takes the decision **union** on purpose. Accepting only `AllowedAction` would make "a failed
 * validation cannot reach the browser" a compile-time claim that any `as` cast erases and no
 * test can exercise; taking the union makes the refusal a real branch the suite can hand a
 * genuine `RE_OBSERVE` and watch do nothing.
 */
export async function act(
  decision: FreshnessDecision,
  bridge: PageActionBridge,
  options: ActOptions = {}
): Promise<ActResult> {
  // 0 — only an ALLOW may proceed. Anything else, including an unrecognised decision, stops.
  if (decision.decision !== "ALLOW") {
    return {
      status: "REJECTED",
      cause: "NOT_VALIDATED",
      detail:
        `the decision handed to ACT is ${String(decision.decision)}` +
        ("reason" in decision ? ` (${decision.reason}: ${decision.detail})` : "") +
        ". The plan must be discarded and the page re-observed; ACT does not execute it.",
    };
  }

  // 1 — and it must be an ALLOW this repository's validator produced, not one shaped like it.
  if (!bearsFreshnessAttestation(decision)) {
    return {
      status: "REJECTED",
      cause: "NOT_VALIDATED",
      detail:
        "the decision is shaped like an ALLOW but carries no freshness attestation, so it was " +
        "not produced by validateActionFreshness. ACT will not execute an unvalidated action.",
    };
  }

  const kind = decision.kind;

  // 2 — the frozen allowlist, re-checked here because INV-13 names the executor as an
  // enforcement point and an executor that trusts its caller's allowlist enforces nothing.
  if (!(ALLOWED_ACTIONS as readonly string[]).includes(kind)) {
    return {
      status: "UNSUPPORTED_ACTION",
      kind: String(kind),
      cause: "NOT_ON_ALLOWLIST",
      detail: `"${String(kind)}" is not in the frozen action allowlist.`,
    };
  }

  // 3 — allowlisted, but this executor may still refuse to perform it.
  if (!isExecutable(kind)) {
    const refusal = REFUSALS[kind as Exclude<ActionKind, ExecutableAction>];
    return { status: "UNSUPPORTED_ACTION", kind, cause: refusal.cause, detail: refusal.detail };
  }

  // 4 — a click needs a target, and the target comes from the decision, never from a caller.
  const node = decision.node;
  const box = decision.viewportBox;
  if (!node || !box) {
    return {
      status: "REJECTED",
      cause: "TARGET_MISSING_IN_DECISION",
      detail: "the ALLOW carries no node or no box, so there is nothing to click. ACT does not look for one.",
      kind,
    };
  }

  // 5 — the bridge must be driving the frame the decision was validated against.
  if (decision.frameId === undefined || decision.frameId !== bridge.frameId) {
    return {
      status: "REJECTED",
      cause: "BRIDGE_FRAME_MISMATCH",
      detail:
        `the decision is valid for frame ${String(decision.frameId)} but the bridge drives frame ` +
        `${String(bridge.frameId)}. A fresh graph is not evidence about a different frame.`,
      kind,
    };
  }

  // 6 — the human-confirmation tier. There is no grant path, so this is always a refusal.
  if (confirmationTierOf(node) === "CONFIRM_REQUIRED") {
    return {
      status: "REJECTED",
      cause: "HUMAN_CONFIRMATION_REQUIRED",
      detail:
        `node ${node.id} (role ${node.role}, name "${node.name}") is in the action schema's ` +
        "human-confirmation tier. No confirmation channel exists, so the action is refused " +
        "rather than performed on a human's behalf.",
      kind,
    };
  }

  // 7 — the point. The validated echo if there is one, the box's centre otherwise; never a
  // coordinate supplied alongside the decision. Re-checked against the box: defensive, and the
  // cheapest possible guarantee that a click lands on the thing that was validated.
  const point = decision.point ?? centreOf(box);
  if (!inside(point, box)) {
    return {
      status: "REJECTED",
      cause: "POINT_OUTSIDE_TARGET",
      detail: `the point (${point.x}, ${point.y}) is not inside the validated box; ACT will not click outside it.`,
      kind,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"TIMEOUT">((resolve) => {
      timer = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
    });
    const outcome = await Promise.race([bridge.clickAtCssPoint(point).then(() => "OK" as const), timeout]);
    if (outcome === "TIMEOUT") {
      return {
        status: "EXECUTION_ERROR",
        kind,
        category: "BRIDGE_TIMEOUT",
        errorName: "DispatchTimeout",
        dispatchMs: Date.now() - started,
      };
    }
    return {
      status: "EXECUTED",
      kind,
      target: { nodeId: node.id, role: node.role, name: node.name, point, box },
      dispatchMs: Date.now() - started,
    };
  } catch (e) {
    // Not swallowed, not converted into success: the failure is reported as a failure, with the
    // error's class name and without its message.
    return {
      status: "EXECUTION_ERROR",
      kind,
      category: "BRIDGE_THREW",
      errorName: e instanceof Error ? e.name : typeof e,
      dispatchMs: Date.now() - started,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * VALIDATE then ACT, as one call — the only exported path from a proposal to a page.
 *
 * It exists so that no caller has to be trusted to validate first: the validation happens
 * here, and the decision it produces is the one ACT receives. A caller that wants the decision
 * for its own ledger gets it back alongside the result.
 */
export async function validateAndAct(
  graph: ElementGraph,
  action: ProposedAction,
  bridge: PageActionBridge,
  options: ActOptions & { readonly tolerance?: FreshnessTolerance } = {}
): Promise<{ readonly decision: FreshnessDecision; readonly result: ActResult }> {
  const decision = validateActionFreshness(graph, action, options.tolerance);
  const result = await act(decision, bridge, options);
  return { decision, result };
}
