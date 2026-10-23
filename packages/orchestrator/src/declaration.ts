/**
 * M18 — WHAT A CLICK MUST DO, DECLARED BY THE PERSON WHO ASKED FOR IT.
 *
 * Until now the postcondition table (`postconditions.ts`) came with the task from whoever stated it —
 * a harness, a fixture. A control nobody declared could not be clicked, which is the right refusal
 * and made every page but a prepared one unusable. This file is how a person declares it instead:
 *
 *   1. The client reads the page and offers its controls (`prepareDeclarationForm`). For each, only
 *      the ADR-0007 postconditions that can still become true: `TARGET_ENABLED false` for a control
 *      that is enabled now, `TARGET_NAME` with a label the person types that differs from the
 *      current one, `FOCUS_ON_TARGET` when focus is established and elsewhere.
 *   2. The person picks controls and expectations; `checkDeclaration` decides whether that answer is
 *      a declaration. Nothing here takes a selector, an expression or a rule from the person: a
 *      control is named by an id the form issued, and an expectation is one of the form's offers.
 *   3. The result is a `TaskDeclaration`, bound to the form's session, origin and document, the
 *      person's own goal, and each control's identity (selector, role, accessible name). The run
 *      checks those bindings itself (`declarationProblem`), on every turn, before any click.
 *
 * THE MODEL CANNOT TOUCH IT. A plan carries operations and targets only; a click on a control the
 * person did not declare is refused (`NO_DECLARED_POSTCONDITION`), and nothing the model writes is
 * read as an expectation. VERIFY RESULT then checks the declared postcondition on a fresh reading,
 * exactly as before, and the loop continues only on CONFIRMED.
 *
 * NO NEW TIMEOUT. A form is valid for one document and one answer; staleness is decided by the page
 * (document identity and each control's fingerprint), never by a clock.
 */
import { postconditionHoldsNow, type ExpectedPostcondition } from "@pratibimb/agent";
import { type ElementNode } from "@pratibimb/perception";
import { fingerprintOf } from "@pratibimb/privacy";
import { CLICKABLE_ROLES } from "@pratibimb/reasoner";

import { type ClickPostconditions } from "./postconditions.js";

/** The expectations a person may choose — ADR-0007's closed set, as offers. */
export type DeclarationOffer = "TARGET_DISABLED" | "TARGET_RENAMED" | "TARGET_FOCUSED";

/** A control the person may declare an expectation for. `selector` stays in the realm that issued it. */
export interface DeclarableControl {
  readonly controlId: string;
  readonly selector: string;
  readonly role: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly fingerprint: string;
  readonly offers: readonly DeclarationOffer[];
}

export interface DeclarationForm {
  readonly formId: string;
  readonly sessionId: string;
  readonly origin: string;
  readonly documentId: string;
  readonly controls: readonly DeclarableControl[];
  /** Three-valued, as ADR-0007 §5 requires: a selector, `null` for nothing, absent for unknown. */
  readonly focusedSelector?: string | null;
}

/** What the person's UI is shown: the form without selectors or fingerprints. */
export interface DeclarationFormView {
  readonly formId: string;
  readonly origin: string;
  readonly controls: readonly {
    readonly controlId: string;
    readonly role: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly offers: readonly DeclarationOffer[];
  }[];
}

/** One declared control: who it is, and what clicking it must make true. */
export interface DeclaredTarget {
  readonly selector: string;
  readonly fingerprint: string;
  readonly postcondition: ExpectedPostcondition;
}

/** A person's declaration, checked and bound. Frozen. */
export interface TaskDeclaration {
  readonly source: "PERSON";
  readonly formId: string;
  readonly sessionId: string;
  readonly origin: string;
  readonly documentId: string;
  readonly goal: string;
  readonly targets: readonly DeclaredTarget[];
  /** The same declarations as the table the machine already enforces. */
  readonly postconditions: ClickPostconditions;
}

export type DeclarationRefusal =
  | "MALFORMED_DECLARATION"
  | "NOT_THIS_FORM"
  | "SESSION_MISMATCH"
  | "ORIGIN_MISMATCH"
  | "DOCUMENT_CHANGED"
  | "EMPTY_GOAL"
  | "NO_DECLARATION"
  | "TOO_MANY_DECLARATIONS"
  | "DUPLICATE_CONTROL"
  | "UNKNOWN_CONTROL"
  | "UNSUPPORTED_POSTCONDITION"
  | "NOT_OFFERED_FOR_THIS_CONTROL"
  | "INVALID_EXPECTED_NAME"
  | "POSTCONDITION_ALREADY_HOLDS";

/** Enough for a task; a bound on an answer that arrives as a message. */
export const MAX_DECLARATIONS = 8;
/** A label is short structural text; anything longer is not one. */
export const MAX_EXPECTED_NAME = 120;
export const MAX_GOAL = 500;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort();
  const want = [...expected].sort();
  return keys.length === want.length && keys.every((key, i) => key === want[i]);
};
const visible = (node: ElementNode): boolean => node.evidence.kind === "OBSERVED" || node.evidence.kind === "CLIPPED";

/** Is this node a control a person may declare a click for? A visible control role, nothing else. */
export const isDeclarableControl = (node: ElementNode): boolean => CLICKABLE_ROLES.has(node.role) && visible(node);

/**
 * The form for one reading of one document: its declarable controls and, for each, the
 * expectations that are not already true.
 */
export function prepareDeclarationForm(
  reading: {
    readonly nodes: readonly ElementNode[];
    readonly focusedSelector?: string | null;
  },
  binding: { readonly formId: string; readonly sessionId: string; readonly origin: string; readonly documentId: string }
): DeclarationForm {
  const controls: DeclarableControl[] = [];
  for (const node of reading.nodes) {
    if (!isDeclarableControl(node)) continue;
    const offers: DeclarationOffer[] = [];
    if (node.enabled) offers.push("TARGET_DISABLED");
    offers.push("TARGET_RENAMED");
    const focus = "focusedSelector" in reading ? { focusedSelector: reading.focusedSelector } : {};
    if (postconditionHoldsNow({ kind: "FOCUS_ON_TARGET" }, node, focus) === "DOES_NOT_HOLD") offers.push("TARGET_FOCUSED");
    controls.push({
      controlId: `k${controls.length + 1}`,
      selector: node.domRef.selector,
      role: node.role,
      name: node.name,
      enabled: node.enabled,
      fingerprint: fingerprintOf(node.domRef.selector, node.role, node.name),
      offers,
    });
  }
  return {
    ...binding,
    controls,
    ...("focusedSelector" in reading ? { focusedSelector: reading.focusedSelector } : {}),
  };
}

/** The form as the person's UI may see it. */
export const viewOfDeclarationForm = (form: DeclarationForm): DeclarationFormView => ({
  formId: form.formId,
  origin: form.origin,
  controls: form.controls.map(({ controlId, role, name, enabled, offers }) => ({ controlId, role, name, enabled, offers })),
});

/**
 * An answer, as the UI sends it:
 *
 *   { kind: "DECLARED", formId, sessionId, origin, documentId, goal,
 *     declarations: [{ controlId, expect: "TARGET_DISABLED" | "TARGET_FOCUSED" }
 *                    | { controlId, expect: "TARGET_RENAMED", name }] }
 *
 * Exactly these fields. The expectation is an offer the form made for that control; it is turned
 * into the ADR-0007 postcondition here, so the UI never states a postcondition directly.
 */
export function checkDeclaration(
  form: DeclarationForm,
  raw: unknown
): { readonly ok: true; readonly declaration: TaskDeclaration } | { readonly ok: false; readonly cause: DeclarationRefusal; readonly at?: number } {
  const refuse = (cause: DeclarationRefusal, at?: number) => ({ ok: false as const, cause, ...(at === undefined ? {} : { at }) });
  if (!isObject(raw) || raw.kind !== "DECLARED") return refuse("MALFORMED_DECLARATION");
  if (!exactKeys(raw, ["kind", "formId", "sessionId", "origin", "documentId", "goal", "declarations"])) return refuse("MALFORMED_DECLARATION");
  for (const key of ["formId", "sessionId", "origin", "documentId", "goal"]) if (typeof raw[key] !== "string") return refuse("MALFORMED_DECLARATION");

  if (raw.formId !== form.formId) return refuse("NOT_THIS_FORM");
  if (raw.sessionId !== form.sessionId) return refuse("SESSION_MISMATCH");
  if (raw.origin !== form.origin) return refuse("ORIGIN_MISMATCH");
  if (raw.documentId !== form.documentId) return refuse("DOCUMENT_CHANGED");
  const goal = (raw.goal as string).trim();
  if (goal === "" || goal.length > MAX_GOAL) return refuse("EMPTY_GOAL");

  const declarations = raw.declarations;
  if (!Array.isArray(declarations)) return refuse("MALFORMED_DECLARATION");
  if (declarations.length === 0) return refuse("NO_DECLARATION");
  if (declarations.length > MAX_DECLARATIONS) return refuse("TOO_MANY_DECLARATIONS");

  const targets: DeclaredTarget[] = [];
  const table: Record<string, ExpectedPostcondition> = {};
  const seen = new Set<string>();
  for (const [at, entry] of declarations.entries()) {
    if (!isObject(entry) || typeof entry.controlId !== "string" || typeof entry.expect !== "string") return refuse("MALFORMED_DECLARATION", at);
    const renamed = entry.expect === "TARGET_RENAMED";
    if (!exactKeys(entry, renamed ? ["controlId", "expect", "name"] : ["controlId", "expect"])) return refuse("MALFORMED_DECLARATION", at);
    if (seen.has(entry.controlId)) return refuse("DUPLICATE_CONTROL", at);
    seen.add(entry.controlId);

    const control = form.controls.find((c) => c.controlId === entry.controlId);
    if (!control) return refuse("UNKNOWN_CONTROL", at);
    if (!["TARGET_DISABLED", "TARGET_RENAMED", "TARGET_FOCUSED"].includes(entry.expect)) return refuse("UNSUPPORTED_POSTCONDITION", at);
    const offer = entry.expect as DeclarationOffer;

    let postcondition: ExpectedPostcondition;
    if (offer === "TARGET_RENAMED") {
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      // Data compared for equality with the control's accessible name — never parsed or evaluated.
      if (name === "" || name.length > MAX_EXPECTED_NAME || /[\u0000-\u001f\u007f]/.test(name)) return refuse("INVALID_EXPECTED_NAME", at);
      if (name === control.name) return refuse("POSTCONDITION_ALREADY_HOLDS", at);
      postcondition = { kind: "TARGET_NAME", expected: name };
    } else if (!control.offers.includes(offer)) {
      // Disabling a control that is already disabled, or focusing one that has focus or whose focus
      // cannot be read, would be confirmed by doing nothing.
      return refuse(offer === "TARGET_DISABLED" && !control.enabled ? "POSTCONDITION_ALREADY_HOLDS" : "NOT_OFFERED_FOR_THIS_CONTROL", at);
    } else {
      postcondition = offer === "TARGET_DISABLED" ? { kind: "TARGET_ENABLED", expected: false } : { kind: "FOCUS_ON_TARGET" };
    }
    const frozen = Object.freeze(postcondition);
    targets.push(Object.freeze({ selector: control.selector, fingerprint: control.fingerprint, postcondition: frozen }));
    table[control.selector] = frozen;
  }

  return {
    ok: true,
    declaration: Object.freeze({
      source: "PERSON" as const,
      formId: form.formId,
      sessionId: form.sessionId,
      origin: form.origin,
      documentId: form.documentId,
      goal,
      targets: Object.freeze(targets),
      postconditions: Object.freeze(table),
    }),
  };
}

/** Why a run may not use this declaration, or `null`. Checked by the machine, not by the UI. */
export type DeclarationProblem = "DECLARATION_FOR_ANOTHER_SESSION" | "DECLARATION_FOR_ANOTHER_ORIGIN" | "DECLARATION_FOR_ANOTHER_TASK" | "DECLARATION_TABLE_MISMATCH";

export function declarationProblem(
  declaration: TaskDeclaration,
  run: { readonly sessionId: string; readonly origin: string; readonly goal: string; readonly postconditions: ClickPostconditions }
): DeclarationProblem | null {
  if (declaration.sessionId !== run.sessionId) return "DECLARATION_FOR_ANOTHER_SESSION";
  if (declaration.origin !== run.origin) return "DECLARATION_FOR_ANOTHER_ORIGIN";
  if (declaration.goal !== run.goal.trim()) return "DECLARATION_FOR_ANOTHER_TASK";
  // The table the machine enforces must be the person's, entry for entry.
  const declared = declaration.postconditions;
  const given = run.postconditions;
  const keys = Object.keys(given);
  if (keys.length !== Object.keys(declared).length) return "DECLARATION_TABLE_MISMATCH";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(declared, key) || JSON.stringify(declared[key]) !== JSON.stringify(given[key])) return "DECLARATION_TABLE_MISMATCH";
  }
  return null;
}
