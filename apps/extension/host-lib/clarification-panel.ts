/**
 * M17 — WHAT THE SIDE PANEL SHOWS FOR A "WHICH STORED VALUE?" QUESTION, AND WHAT IT SENDS BACK.
 *
 * Pure functions, so the panel's whole behaviour is testable without a browser: `panelViewOf` reads
 * the question the offscreen document holds (untrusted shape, checked here), and `panelAnswer` turns
 * a person's selection into the typed answer. The panel cannot send free text, a value, a reference
 * or an action: the answer is built here, from the question's own fields and one candidate id the
 * question offered.
 *
 * Every string shown is a field label the verified handoff already carries. The DOM code renders it
 * with `textContent` only, because a label is page-controlled text.
 */

export interface PanelOption {
  readonly candidateId: string;
  /** "The number from “Mobile number”". */
  readonly text: string;
}

export interface PanelView {
  readonly clarificationId: string;
  readonly question: string;
  readonly fieldLabel: string;
  readonly options: readonly PanelOption[];
}

/** The fields of a question the panel needs, as the offscreen document reported them. */
interface QuestionShape {
  readonly clarificationId: string;
  readonly sessionId: string;
  readonly origin: string;
  readonly viewId: string;
  readonly documentId: string;
  readonly target: string;
  readonly targetLabel: string;
  readonly piiClass: string;
  readonly candidateSetId: string;
  readonly question: string;
  readonly candidates: readonly { readonly candidateId: string; readonly sourceLabel: string }[];
}

const KIND_WORD: Readonly<Record<string, string>> = { PHONE: "number", NAME: "name", DOB: "date of birth", AADHAAR: "Aadhaar number" };

const isQuestion = (raw: unknown): raw is QuestionShape => {
  if (typeof raw !== "object" || raw === null) return false;
  const q = raw as Record<string, unknown>;
  const strings = ["clarificationId", "sessionId", "origin", "viewId", "documentId", "target", "targetLabel", "piiClass", "candidateSetId", "question"];
  if (!strings.every((key) => typeof q[key] === "string")) return false;
  if (!Array.isArray(q.candidates) || q.candidates.length < 2) return false;
  return q.candidates.every(
    (c: unknown) =>
      typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).candidateId === "string" && typeof (c as Record<string, unknown>).sourceLabel === "string"
  );
};

/** What to render for the question waiting, or `null` when there is none (or it is not readable). */
export function panelViewOf(raw: unknown): PanelView | null {
  if (!isQuestion(raw)) return null;
  const word = KIND_WORD[raw.piiClass] ?? "value";
  return {
    clarificationId: raw.clarificationId,
    question: raw.question,
    fieldLabel: raw.targetLabel,
    options: raw.candidates.map((candidate) => ({ candidateId: candidate.candidateId, text: `The ${word} from “${candidate.sourceLabel}”` })),
  };
}

/**
 * The answer for a selection: a candidate id the question offered, or `null` to decline.
 *
 * Returns `null` for a selection the question did not offer — the panel then sends nothing, and the
 * person is asked again rather than a different value being used.
 */
export function panelAnswer(raw: unknown, candidateId: string | null): Record<string, string> | null {
  if (!isQuestion(raw)) return null;
  if (candidateId === null) return { kind: "DECLINED", clarificationId: raw.clarificationId };
  if (!raw.candidates.some((candidate) => candidate.candidateId === candidateId)) return null;
  return {
    kind: "CHOSEN",
    clarificationId: raw.clarificationId,
    sessionId: raw.sessionId,
    origin: raw.origin,
    viewId: raw.viewId,
    documentId: raw.documentId,
    target: raw.target,
    candidateSetId: raw.candidateSetId,
    candidateId,
  };
}
