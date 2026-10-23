/**
 * M19 — WHAT THE SIDE PANEL SHOWS FOR A CONSENT REQUEST, AND WHAT IT SENDS BACK.
 *
 * Pure functions, so the panel's behaviour is testable without a browser. `consentViewOf` reads the
 * question the offscreen document holds (untrusted shape, checked here); `consentAnswer` builds the
 * one answer the panel may send — "Allow once" or "Deny" — from the question's own fields. There is
 * no option to reveal the full value, no "always allow", and no free text.
 *
 * The preview is rendered only as one of the two shapes privacy produces; anything else is replaced
 * by the generic indicator rather than shown. Labels are page text: rendered with `textContent`.
 */

export interface ConsentScreen {
  readonly consentId: string;
  readonly heading: string;
  readonly site: string;
  readonly field: string;
  readonly category: string;
  readonly preview: string;
  readonly statement: string;
  readonly then: string;
}

const GENERIC = "••••••";
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

interface QuestionShape {
  readonly consentId: string;
  readonly sessionId: string;
  readonly origin: string;
  readonly documentId: string;
  readonly target: string;
  readonly targetLabel: string;
  readonly category: string;
  readonly preview: { readonly style: string; readonly text: string };
  readonly statement: string;
  readonly then: { readonly target: string; readonly label: string };
}

const isQuestion = (raw: unknown): raw is QuestionShape => {
  if (!isRecord(raw)) return false;
  for (const key of ["consentId", "sessionId", "origin", "documentId", "target", "targetLabel", "category", "statement"]) if (typeof raw[key] !== "string") return false;
  return isRecord(raw.preview) && typeof raw.preview.text === "string" && isRecord(raw.then) && typeof raw.then.label === "string" && typeof raw.then.target === "string";
};

/** Only privacy's two shapes are shown; anything else becomes the generic indicator. */
const safePreview = (p: { readonly style: string; readonly text: string }): string =>
  (p.style === "SUFFIX" && /^•{1,12}[0-9]{2}$/.test(p.text)) || (p.style === "GENERIC" && p.text === GENERIC) ? p.text : GENERIC;

export function consentViewOf(raw: unknown): ConsentScreen | null {
  if (!isQuestion(raw)) return null;
  return {
    consentId: raw.consentId,
    heading: `Allow PratiBimb to use your ${raw.category}?`,
    site: raw.origin,
    field: raw.targetLabel,
    category: raw.category,
    preview: safePreview(raw.preview),
    statement: raw.statement,
    then: `If you allow it, PratiBimb will then click “${raw.then.label}”, and check the page shows the expected result.`,
  };
}

/** The answer for a choice: allow this one use, or deny. Built from the question; nothing else. */
export function consentAnswer(raw: unknown, allow: boolean): Record<string, string> | null {
  if (!isQuestion(raw)) return null;
  if (!allow) return { kind: "DENY", consentId: raw.consentId };
  return { kind: "ALLOW_ONCE", consentId: raw.consentId, sessionId: raw.sessionId, origin: raw.origin, documentId: raw.documentId, target: raw.target };
}
