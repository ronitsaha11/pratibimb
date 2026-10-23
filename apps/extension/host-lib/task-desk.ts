/**
 * M18 — WHERE A PERSON'S TASK, AND WHAT EACH CLICK MUST DO, IS DECLARED.
 *
 * The side panel asks the offscreen document to read the page (`TASK_PREPARE`); the form that
 * comes back offers the page's controls and, for each, only ADR-0007 expectations that are not yet
 * true. The person picks, and the panel sends one answer (`TASK_START`). This desk holds the form,
 * hands the answer to `checkDeclaration`, and lets one accepted answer start one run.
 *
 * THE DESK DECIDES NOTHING ABOUT THE DECLARATION. `checkDeclaration` does, and the machine checks
 * the bound declaration again on every turn. The desk only keeps to one form at a time and one
 * start per form, so a second press of "Start", or an answer to a form the page has since replaced,
 * cannot start a second run.
 *
 * NOTHING HERE IS A VALUE. The form holds control roles, accessible names, ids and offers — the
 * transport's value-free vocabulary — and the person's goal and expected labels, which are theirs.
 */
import {
  checkDeclaration,
  viewOfDeclarationForm,
  type DeclarationForm,
  type DeclarationFormView,
  type DeclarationRefusal,
  type TaskDeclaration,
} from "@pratibimb/orchestrator";

declare global {
  // eslint-disable-next-line no-var
  var __REASONER_ENDPOINT__: string;
}

/** What the panel needs to answer a form: its view, and the bindings the answer must echo. */
export interface FormForPanel {
  readonly form: DeclarationFormView;
  readonly binding: { readonly formId: string; readonly sessionId: string; readonly origin: string; readonly documentId: string };
}

export type StartRefusal = DeclarationRefusal | "NO_FORM" | "FORM_ALREADY_USED";

export interface TaskDesk {
  /** Hold a new form. Any earlier one is replaced: an answer to it is then refused. */
  hold(form: DeclarationForm, target: { readonly tabId: number; readonly frameId: number }): FormForPanel;
  /** Check an answer against the form held. Once accepted, the form is spent. */
  start(
    raw: unknown
  ): { readonly ok: true; readonly declaration: TaskDeclaration; readonly target: { readonly tabId: number; readonly frameId: number } } | { readonly ok: false; readonly cause: StartRefusal; readonly at?: number };
  clear(): void;
}

export function createTaskDesk(): TaskDesk {
  let held: { readonly form: DeclarationForm; readonly target: { readonly tabId: number; readonly frameId: number } } | null = null;
  const spent = new Set<string>();

  return {
    hold(form, target) {
      held = { form, target };
      return {
        form: viewOfDeclarationForm(form),
        binding: { formId: form.formId, sessionId: form.sessionId, origin: form.origin, documentId: form.documentId },
      };
    },
    start(raw) {
      const formId = typeof raw === "object" && raw !== null ? (raw as { formId?: unknown }).formId : undefined;
      if (typeof formId === "string" && spent.has(formId)) return { ok: false, cause: "FORM_ALREADY_USED" };
      if (held === null) return { ok: false, cause: "NO_FORM" };
      const checked = checkDeclaration(held.form, raw);
      if (!checked.ok) return checked;
      const { target } = held;
      spent.add(held.form.formId);
      held = null;
      return { ok: true, declaration: checked.declaration, target };
    },
    clear() {
      // The spent forms stay spent: a replayed answer is refused for the life of this document.
      held = null;
    },
  };
}
