/**
 * M19 — WHERE "MAY PRATIBIMB PUT THIS STORED VALUE INTO THIS FIELD?" WAITS FOR THE PERSON.
 *
 * The orchestrator asks through `ClientPorts.consent`; for a task the person started in the side
 * panel, the question is parked here, in the offscreen document, with the masked preview the page
 * realm produced, until the side panel reads it (`CONSENT_PEEK`) and answers (`CONSENT_DECIDE`).
 *
 * A DESK, NOT AN AUTHORITY. It keeps one question at a time and one answer per question, and turns
 * away an answer to any other question. Whether an answer means anything is decided by the
 * orchestrator's `checkConsentAnswer`, then by the binder — so a panel bug can stop a run, never
 * restore a value.
 *
 * THE PREVIEW STAYS HERE. It is handed to the panel on PEEK and to nothing else: not to the
 * orchestrator, not to the run's record, not to the service worker's control plane. The reference
 * token and the field fingerprint are kept back too; the panel needs neither.
 */
import { CATEGORY_OF, type ConsentRequest } from "@pratibimb/orchestrator";
import { GENERIC_PREVIEW, type ConsentPreview } from "@pratibimb/privacy";

/** What the panel is shown. No reference, no fingerprint; the preview is the masked one. */
export interface ConsentView {
  readonly consentId: string;
  readonly sessionId: string;
  readonly origin: string;
  readonly documentId: string;
  readonly target: string;
  readonly targetLabel: string;
  readonly category: string;
  readonly preview: ConsentPreview;
  readonly statement: string;
  readonly then: { readonly target: string; readonly label: string };
}

export type ConsentDeskRefusal = "NOTHING_PENDING" | "NOT_THIS_CONSENT" | "MALFORMED_CONSENT";

export interface ConsentDesk {
  ask(request: ConsentRequest, preview: ConsentPreview | null): Promise<unknown>;
  peek(): ConsentView | null;
  decide(answer: unknown): { readonly answered: true } | { readonly answered: false; readonly refused: ConsentDeskRefusal };
  /** End of run, or the panel went away: the question ends as a denial nobody gave. */
  clear(): void;
}

export function createConsentDesk(): ConsentDesk {
  let pending: { readonly view: ConsentView; readonly answer: (raw: unknown) => void } | null = null;
  const deny = (consentId: string) => ({ kind: "DENY", consentId });

  return {
    ask(request, preview) {
      return new Promise<unknown>((resolve) => {
        // A question still waiting is not silently replaced: it ends denied.
        if (pending) pending.answer(deny(pending.view.consentId));
        pending = {
          view: Object.freeze({
            consentId: request.consentId,
            sessionId: request.sessionId,
            origin: request.origin,
            documentId: request.documentId,
            target: request.target,
            targetLabel: request.targetLabel,
            category: CATEGORY_OF[request.piiClass],
            // No safe preview: the type is shown, the value is not.
            preview: preview ?? ({ style: "GENERIC", text: GENERIC_PREVIEW } as const),
            statement: request.statement,
            then: request.then,
          }),
          answer: resolve,
        };
      });
    },
    peek: () => pending?.view ?? null,
    decide(answer) {
      if (pending === null) return { answered: false, refused: "NOTHING_PENDING" };
      if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return { answered: false, refused: "MALFORMED_CONSENT" };
      if ((answer as { consentId?: unknown }).consentId !== pending.view.consentId) return { answered: false, refused: "NOT_THIS_CONSENT" };
      const { answer: resolve } = pending;
      pending = null;
      resolve(answer);
      return { answered: true };
    },
    clear() {
      if (pending === null) return;
      const { view, answer } = pending;
      pending = null;
      answer(deny(view.consentId));
    },
  };
}
