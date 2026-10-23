/**
 * M19 — "MAY PRATIBIMB PUT THIS STORED VALUE INTO THIS FIELD, ON THIS SITE?", ASKED OF THE PERSON.
 *
 * The run already asks a human before any stored value is restored (AWAIT_GRANT). Until M19 that
 * answer arrived as a bare `{ granted: true }` from whatever answered `requestGrant` — in the
 * extension, the control plane. This file is the question and the answer check for the person's own
 * panel: the consent is bound to exactly one pending restoration, and an answer is worth something
 * only if it answers that one.
 *
 * WHAT AN ALLOW IS. One use: this reference, into this field (by fingerprint), on this origin and
 * document, in this session, for this turn. The machine turns it into the same one-shot `UseGrant`
 * it always has; the binder still decides whether the grant suffices, and the value is restored only
 * through privacy's `rehydrate`. Nothing is cached: the next restoration, on this site or any other,
 * asks again. An allow authorises no click: the declared postcondition, REFRESH, the permit gate and
 * VERIFY RESULT govern the action as before.
 *
 * WHAT IS NOT HERE. The masked preview the panel shows is produced where the value is (privacy's
 * `consentPreview`, in the page realm) and attached by the extension; it never enters this realm,
 * the request below, or any record. No expiry is enforced on the answer: ADR-0008 §5 leaves every
 * TTL an owner decision, and M19 does not make one. Staleness is decided by the page instead.
 */
import { type PiiClass } from "@pratibimb/privacy";

import { type GrantRequest } from "./ports.js";

/** What the person is asked. Value-free: no value, no preview, no reference token for the UI. */
export interface ConsentRequest {
  readonly consentId: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly origin: string;
  readonly documentId: string;
  readonly viewId: string;
  /** The field, by selector and by the label the person sees. */
  readonly target: string;
  readonly targetLabel: string;
  readonly fingerprint: string;
  /** The reference to be restored. For the extension to fetch the preview; never shown. */
  readonly ref: string;
  readonly piiClass: PiiClass;
  /** "PratiBimb is about to put your phone number into “Confirm mobile number” on http://…". */
  readonly statement: string;
  /** The click that follows, if the restoration happens. Stated, not authorised, by this consent. */
  readonly then: { readonly target: string; readonly label: string };
}

/** An answer. Exactly these fields. */
export type ConsentAnswer =
  | {
      readonly kind: "ALLOW_ONCE";
      readonly consentId: string;
      readonly sessionId: string;
      readonly origin: string;
      readonly documentId: string;
      readonly target: string;
    }
  | { readonly kind: "DENY"; readonly consentId: string };

export type ConsentRefusal =
  | "MALFORMED_CONSENT"
  | "CONSENT_DENIED"
  | "NOT_THIS_CONSENT"
  | "SESSION_MISMATCH"
  | "ORIGIN_MISMATCH"
  | "DOCUMENT_CHANGED"
  | "TARGET_MISMATCH";

/** The words for a class, as the person reads them. */
export const CATEGORY_OF: Readonly<Record<PiiClass, string>> = {
  PHONE: "phone number",
  NAME: "name",
  DOB: "date of birth",
  AADHAAR: "Aadhaar number",
  OTP: "one-time code",
  UNKNOWN: "stored value",
};

/** The question for one pending restoration. */
export function prepareConsent(
  grant: GrantRequest,
  binding: { readonly consentId: string; readonly requestId: string; readonly documentId: string; readonly viewId: string }
): ConsentRequest {
  return Object.freeze({
    consentId: binding.consentId,
    sessionId: grant.sessionId,
    requestId: binding.requestId,
    origin: grant.origin,
    documentId: binding.documentId,
    viewId: binding.viewId,
    target: grant.target,
    targetLabel: grant.targetLabel,
    fingerprint: grant.fingerprint,
    ref: grant.ref,
    piiClass: grant.piiClass,
    statement: `PratiBimb is about to put your ${CATEGORY_OF[grant.piiClass]} into “${grant.targetLabel}” on ${grant.origin}.`,
    then: { target: grant.action.target, label: grant.action.label },
  });
}

const ALLOW_KEYS = ["consentId", "documentId", "kind", "origin", "sessionId", "target"];
const DENY_KEYS = ["consentId", "kind"];
const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, i) => key === expected[i]);
};

/** The authoritative check. Whatever the panel did, this decides whether an answer means anything. */
export function checkConsentAnswer(request: ConsentRequest, raw: unknown): { readonly ok: true } | { readonly ok: false; readonly cause: ConsentRefusal } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, cause: "MALFORMED_CONSENT" };
  const answer = raw as Record<string, unknown>;
  if (answer.kind === "DENY") {
    if (!exactKeys(answer, DENY_KEYS) || typeof answer.consentId !== "string") return { ok: false, cause: "MALFORMED_CONSENT" };
    return { ok: false, cause: answer.consentId === request.consentId ? "CONSENT_DENIED" : "NOT_THIS_CONSENT" };
  }
  if (answer.kind !== "ALLOW_ONCE" || !exactKeys(answer, ALLOW_KEYS) || !ALLOW_KEYS.every((key) => typeof answer[key] === "string")) {
    return { ok: false, cause: "MALFORMED_CONSENT" };
  }
  if (answer.consentId !== request.consentId) return { ok: false, cause: "NOT_THIS_CONSENT" };
  if (answer.sessionId !== request.sessionId) return { ok: false, cause: "SESSION_MISMATCH" };
  if (answer.origin !== request.origin) return { ok: false, cause: "ORIGIN_MISMATCH" };
  if (answer.documentId !== request.documentId) return { ok: false, cause: "DOCUMENT_CHANGED" };
  if (answer.target !== request.target) return { ok: false, cause: "TARGET_MISMATCH" };
  return { ok: true };
}

export const CONSENT_DETAIL: Readonly<Record<ConsentRefusal | "CONSENT_FAILED" | "CONSENT_STALE", string>> = {
  MALFORMED_CONSENT: "the answer was not one this client can read; nothing was restored.",
  CONSENT_DENIED: "you did not allow it; the value was not restored and nothing was submitted.",
  NOT_THIS_CONSENT: "the answer was for a different request; nothing was restored.",
  SESSION_MISMATCH: "the answer belongs to another session; nothing was restored.",
  ORIGIN_MISMATCH: "the answer was given for another site; nothing was restored.",
  DOCUMENT_CHANGED: "the page changed before the answer arrived; nothing was restored.",
  TARGET_MISMATCH: "the answer names a different field; nothing was restored.",
  CONSENT_FAILED: "the request could not be shown; nothing was restored.",
  CONSENT_STALE: "the page changed while you were deciding; nothing was restored.",
};
