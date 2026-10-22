/**
 * M17 — WHERE A "WHICH STORED VALUE?" QUESTION WAITS FOR A PERSON.
 *
 * The orchestrator asks through `ClientPorts.clarify`; in the extension the question is parked here,
 * in the offscreen document, until the side panel reads it (`CLARIFY_PEEK`) and answers it
 * (`CLARIFY_DECIDE`). The shape mirrors the grant: nothing in the core realm answers its own
 * question, and the reasoner cannot reach this at all.
 *
 * THIS IS A DESK, NOT AN AUTHORITY. It checks only that an answer is for the question waiting and
 * that the question is answered once. Whether the answer means anything is decided by the
 * orchestrator's `checkClarificationAnswer` and then by privacy — so a panel bug, or a message from
 * somewhere it should not come from, can at worst stop a run, never fill a field.
 *
 * NOTHING HERE IS A VALUE. The question carries field labels the verified handoff already holds,
 * classes and opaque candidate ids; the answer carries ids.
 */
import { type ClarificationRequest } from "@pratibimb/orchestrator";

export type DeskRefusal = "NOTHING_PENDING" | "NOT_THIS_CLARIFICATION" | "MALFORMED_ANSWER";

export interface ClarificationDesk {
  /** Park a question; resolves with whatever the person's answer was, unchecked. */
  ask(request: ClarificationRequest): Promise<unknown>;
  /** The question waiting, or `null`. */
  peek(): ClarificationRequest | null;
  /** Hand an answer to the waiting question. Once: a second answer finds nothing pending. */
  decide(answer: unknown): { readonly answered: true } | { readonly answered: false; readonly refused: DeskRefusal };
  /** End of run: the question goes, and the run's wait ends as a decline nobody gave. */
  clear(): void;
}

export function createClarificationDesk(): ClarificationDesk {
  let pending: { readonly request: ClarificationRequest; readonly answer: (raw: unknown) => void } | null = null;

  return {
    ask(request) {
      return new Promise<unknown>((resolve) => {
        // A question still waiting from before is not silently replaced: it ends unanswered.
        pending?.answer({ kind: "DECLINED", clarificationId: pending.request.clarificationId });
        pending = { request, answer: resolve };
      });
    },
    peek: () => pending?.request ?? null,
    decide(answer) {
      if (pending === null) return { answered: false, refused: "NOTHING_PENDING" };
      if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return { answered: false, refused: "MALFORMED_ANSWER" };
      // An answer to an older question — a panel left open across runs — does not settle this one.
      if ((answer as { clarificationId?: unknown }).clarificationId !== pending.request.clarificationId) {
        return { answered: false, refused: "NOT_THIS_CLARIFICATION" };
      }
      const { answer: resolve } = pending;
      pending = null;
      resolve(answer);
      return { answered: true };
    },
    clear() {
      if (pending === null) return;
      const { request, answer } = pending;
      pending = null;
      answer({ kind: "DECLINED", clarificationId: request.clarificationId });
    },
  };
}
