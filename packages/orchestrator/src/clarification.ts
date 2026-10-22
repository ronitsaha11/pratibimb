/**
 * M17 — WHEN TWO STORED VALUES COULD GO INTO ONE FIELD, THE PERSON SAYS WHICH.
 *
 * Privacy withholds an empty field that more than one reference fits (`CONFLICTING_REFERENCES`,
 * M16), because choosing between two phone numbers is not something the client may guess and not
 * something a model may decide. This file is how the person is asked, and how their answer is
 * checked before it means anything.
 *
 * WHAT THE PERSON IS SHOWN. For each candidate, the label of the field it was read from — the
 * accessible name the verified handoff already carries — and its class. No value, no masked value,
 * no token: candidates are named `c1`, `c2`… and only this realm knows which reference each stands
 * for. If the labels cannot tell the candidates apart, nobody is asked to pick blind: the run stops
 * and the person is told to enter the value themselves.
 *
 * WHAT AN ANSWER IS. Evidence of intent, bound to exactly one question: this clarification, this
 * session, this origin, this view, this document, this field and this candidate set. An answer for
 * anything else is refused, and so is one with a field this file does not know — an answer cannot
 * carry an action, a target to click or a value. A valid answer only names a candidate; privacy then
 * re-grounds the field with it (`groundFill`), the validator holds the plan to that pairing, and the
 * binder, the human grant, REFRESH, the permit gate and VERIFY RESULT all still run.
 *
 * DECLINING IS ALWAYS AVAILABLE AND ALWAYS STOPS. Nothing else is chosen instead.
 */
import { type FillWithheld, type PiiClass, type Redaction, type VerifiedHandoff } from "@pratibimb/privacy";

/** One stored value a person may choose, described without it. */
export interface ClarificationCandidate {
  /** Opaque: `c1`, `c2`… Mapped to a reference only in the realm that asked. */
  readonly candidateId: string;
  /** The label of the field this value was read from, as the verified handoff names it. */
  readonly sourceLabel: string;
  readonly piiClass: PiiClass;
}

/** What a person is asked. Value-free; every string in it is already in the verified handoff. */
export interface ClarificationRequest {
  readonly clarificationId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly origin: string;
  readonly viewId: string;
  readonly documentId: string;
  /** The empty field the value would go into, and its label. */
  readonly target: string;
  readonly targetLabel: string;
  readonly piiClass: PiiClass;
  readonly candidates: readonly ClarificationCandidate[];
  /** Identifies exactly this set of candidates. An answer naming another set is refused. */
  readonly candidateSetId: string;
  readonly expiresAt: number;
  /** In the person's words. */
  readonly question: string;
}

/**
 * A person's answer. Exactly these fields, and nothing else.
 *
 * `CHOSEN` echoes every binding of the question it answers; `DECLINED` needs only to say which
 * question it declines.
 */
export type ClarificationAnswer =
  | {
      readonly kind: "CHOSEN";
      readonly clarificationId: string;
      readonly sessionId: string;
      readonly origin: string;
      readonly viewId: string;
      readonly documentId: string;
      readonly target: string;
      readonly candidateSetId: string;
      readonly candidateId: string;
    }
  | { readonly kind: "DECLINED"; readonly clarificationId: string };

export type ClarificationRefusal =
  | "MALFORMED_ANSWER"
  | "CLARIFICATION_DECLINED"
  | "NOT_THIS_CLARIFICATION"
  | "SESSION_MISMATCH"
  | "ORIGIN_MISMATCH"
  | "STALE_VIEW"
  | "DOCUMENT_CHANGED"
  | "TARGET_MISMATCH"
  | "CANDIDATE_SET_CHANGED"
  | "UNKNOWN_CANDIDATE"
  | "CLARIFICATION_EXPIRED";

/** A question ready to ask, with the mapping that never leaves this realm. */
export interface PreparedClarification {
  readonly request: ClarificationRequest;
  /** candidateId → reference token. Kept here; not part of the request. */
  readonly tokens: ReadonlyMap<string, string>;
}

const normalise = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Prepare the question for one conflicting field, or say why it cannot be asked fairly.
 *
 * `INDISTINGUISHABLE` when two candidates come from fields with the same label, or any has none:
 * a person shown "Mobile number" twice has nothing to choose by, and showing more would mean
 * showing the value.
 */
export function prepareClarification(
  withheld: FillWithheld,
  handoff: VerifiedHandoff,
  binding: {
    readonly clarificationId: string;
    readonly sessionId: string;
    readonly requestId: string;
    readonly origin: string;
    readonly viewId: string;
    readonly documentId: string;
    readonly expiresAt: number;
  }
): { readonly ok: true; readonly prepared: PreparedClarification } | { readonly ok: false; readonly cause: "CANDIDATES_INDISTINGUISHABLE" | "NOT_A_CONFLICT" } {
  const tokens = withheld.candidates ?? [];
  if (withheld.cause !== "CONFLICTING_REFERENCES" || tokens.length < 2) return { ok: false, cause: "NOT_A_CONFLICT" };

  const labelOf = (id: string): string => handoff.elements.find((element) => element.id === id)?.name ?? "";
  const spans: Redaction[] = [];
  for (const token of tokens) {
    const span = handoff.redactions.find((redaction) => redaction.token === token && redaction.method === "token_reference");
    if (!span) return { ok: false, cause: "CANDIDATES_INDISTINGUISHABLE" };
    spans.push(span);
  }
  const labels = spans.map((span) => labelOf(span.targetId));
  const distinct = new Set(labels.map(normalise));
  if (labels.some((label) => normalise(label) === "") || distinct.size !== labels.length) {
    return { ok: false, cause: "CANDIDATES_INDISTINGUISHABLE" };
  }

  const candidates = spans.map((span, index) => ({
    candidateId: `c${index + 1}`,
    sourceLabel: labels[index]!.trim(),
    piiClass: span.class,
  }));
  const mapping = new Map(candidates.map((candidate, index) => [candidate.candidateId, tokens[index]!]));
  const targetLabel = labelOf(withheld.target).trim() || withheld.target;
  const piiClass = spans[0]!.class;

  return {
    ok: true,
    prepared: {
      tokens: mapping,
      request: {
        ...binding,
        target: withheld.target,
        targetLabel,
        piiClass,
        candidates,
        // The source fields identify the set: a reading where the candidates came from other fields,
        // or in another order, is another set.
        candidateSetId: `${withheld.target}|${candidates.map((c, i) => `${c.candidateId}=${spans[i]!.targetId}`).join(",")}`,
        question: `More than one stored ${piiClass.toLowerCase()} could go into "${targetLabel}". Which one should PratiBimb use?`,
      },
    },
  };
}

const CHOSEN_KEYS = ["candidateId", "candidateSetId", "clarificationId", "documentId", "kind", "origin", "sessionId", "target", "viewId"];
const DECLINED_KEYS = ["clarificationId", "kind"];

const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

/**
 * Check an answer against the question it claims to answer. The authoritative check: whatever the
 * panel did, this is what decides whether an answer means anything.
 */
export function checkClarificationAnswer(
  prepared: PreparedClarification,
  raw: unknown,
  now: number
): { readonly ok: true; readonly token: string; readonly candidateId: string } | { readonly ok: false; readonly cause: ClarificationRefusal } {
  const request = prepared.request;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, cause: "MALFORMED_ANSWER" };
  const answer = raw as Record<string, unknown>;
  const strings = (keys: readonly string[]): boolean => keys.every((key) => typeof answer[key] === "string");

  if (answer.kind === "DECLINED") {
    if (!exactKeys(answer, DECLINED_KEYS) || !strings(["clarificationId"])) return { ok: false, cause: "MALFORMED_ANSWER" };
    if (answer.clarificationId !== request.clarificationId) return { ok: false, cause: "NOT_THIS_CLARIFICATION" };
    return { ok: false, cause: "CLARIFICATION_DECLINED" };
  }
  if (answer.kind !== "CHOSEN" || !exactKeys(answer, CHOSEN_KEYS) || !strings(CHOSEN_KEYS)) {
    return { ok: false, cause: "MALFORMED_ANSWER" };
  }

  // Identity first, as everywhere else: an answer to another question is not a wrong answer to this one.
  if (answer.clarificationId !== request.clarificationId) return { ok: false, cause: "NOT_THIS_CLARIFICATION" };
  if (answer.sessionId !== request.sessionId) return { ok: false, cause: "SESSION_MISMATCH" };
  if (answer.origin !== request.origin) return { ok: false, cause: "ORIGIN_MISMATCH" };
  if (answer.viewId !== request.viewId) return { ok: false, cause: "STALE_VIEW" };
  if (answer.documentId !== request.documentId) return { ok: false, cause: "DOCUMENT_CHANGED" };
  if (answer.target !== request.target) return { ok: false, cause: "TARGET_MISMATCH" };
  if (answer.candidateSetId !== request.candidateSetId) return { ok: false, cause: "CANDIDATE_SET_CHANGED" };
  if (now >= request.expiresAt) return { ok: false, cause: "CLARIFICATION_EXPIRED" };

  const token = prepared.tokens.get(answer.candidateId as string);
  if (token === undefined) return { ok: false, cause: "UNKNOWN_CANDIDATE" };
  return { ok: true, token, candidateId: answer.candidateId as string };
}

/** What a person is told when the run stops here. Never a value. */
export const CLARIFICATION_DETAIL: Readonly<Record<ClarificationRefusal | "CANDIDATES_INDISTINGUISHABLE" | "CLARIFICATION_UNAVAILABLE" | "CLARIFICATION_FAILED" | "CLARIFICATION_STALE" | "CHOICE_NOT_A_CANDIDATE", string>> = {
  MALFORMED_ANSWER: "the answer was not one this client can read; nothing was filled.",
  CLARIFICATION_DECLINED: "you chose not to pick a stored value; the field was left empty and nothing was submitted.",
  NOT_THIS_CLARIFICATION: "the answer was for a different question; nothing was filled.",
  SESSION_MISMATCH: "the answer belongs to another session; nothing was filled.",
  ORIGIN_MISMATCH: "the answer was given for another site; nothing was filled.",
  STALE_VIEW: "the answer was given for an earlier reading of the page; nothing was filled.",
  DOCUMENT_CHANGED: "the page changed before the answer arrived; nothing was filled.",
  TARGET_MISMATCH: "the answer names a different field; nothing was filled.",
  CANDIDATE_SET_CHANGED: "the stored values on offer changed before the answer arrived; nothing was filled.",
  UNKNOWN_CANDIDATE: "the answer names a stored value that was not offered; nothing was filled.",
  CLARIFICATION_EXPIRED: "the question expired before it was answered; nothing was filled.",
  CANDIDATES_INDISTINGUISHABLE: "more than one stored value could go into this field, and they cannot be told apart without showing them. Enter the value yourself; nothing was filled.",
  CLARIFICATION_UNAVAILABLE: "more than one stored value could go into this field and there is no way to ask you which; nothing was filled.",
  CLARIFICATION_FAILED: "the question could not be asked; nothing was filled.",
  CLARIFICATION_STALE: "the page changed while you were choosing; nothing was filled.",
  CHOICE_NOT_A_CANDIDATE: "the chosen value no longer fits the field; nothing was filled, and no other value was substituted.",
};
