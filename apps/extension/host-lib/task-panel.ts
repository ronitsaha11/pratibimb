/**
 * M18 — WHAT THE SIDE PANEL SHOWS FOR A TASK, AND WHAT IT SENDS.
 *
 * Pure functions, so the panel's behaviour is testable without a browser. The panel shows the form
 * the offscreen document issued (`panelFormOf`), keeps the person's list of expectations
 * (`addExpectation`), and builds the one answer it may send (`taskAnswer`). It cannot send a
 * selector, a postcondition or a rule: an expectation is a control id and an offer the form made,
 * plus — for a label change — the label the person typed, which `checkDeclaration` validates.
 *
 * Every label shown is page text and is rendered with `textContent` only.
 */

export type Offer = "TARGET_DISABLED" | "TARGET_RENAMED" | "TARGET_FOCUSED";

export const OFFER_TEXT: Readonly<Record<Offer, string>> = {
  TARGET_DISABLED: "It becomes unavailable (greyed out)",
  TARGET_RENAMED: "Its label changes to…",
  TARGET_FOCUSED: "It takes keyboard focus",
};

export interface PanelControl {
  readonly controlId: string;
  readonly text: string;
  readonly offers: readonly Offer[];
}

export interface PanelForm {
  readonly formId: string;
  readonly origin: string;
  readonly controls: readonly PanelControl[];
  readonly binding: { readonly formId: string; readonly sessionId: string; readonly origin: string; readonly documentId: string };
}

export type Expectation =
  | { readonly controlId: string; readonly expect: "TARGET_DISABLED" | "TARGET_FOCUSED" }
  | { readonly controlId: string; readonly expect: "TARGET_RENAMED"; readonly name: string };

const OFFERS = new Set<string>(["TARGET_DISABLED", "TARGET_RENAMED", "TARGET_FOCUSED"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The form to render, or `null` when the reply is not one this panel can read. */
export function panelFormOf(reply: unknown): PanelForm | null {
  if (!isRecord(reply) || reply.ok !== true || !isRecord(reply.form) || !isRecord(reply.binding)) return null;
  const { form, binding } = reply;
  if (typeof form.formId !== "string" || typeof form.origin !== "string" || !Array.isArray(form.controls)) return null;
  for (const key of ["formId", "sessionId", "origin", "documentId"]) if (typeof binding[key] !== "string") return null;
  if (binding.formId !== form.formId) return null;
  const controls: PanelControl[] = [];
  for (const c of form.controls) {
    if (!isRecord(c) || typeof c.controlId !== "string" || typeof c.name !== "string" || typeof c.role !== "string" || !Array.isArray(c.offers)) return null;
    const offers = c.offers.filter((o): o is Offer => typeof o === "string" && OFFERS.has(o));
    controls.push({ controlId: c.controlId, text: `${c.name || "(unnamed)"} — ${c.role}${c.enabled === false ? ", currently unavailable" : ""}`, offers });
  }
  return {
    formId: form.formId,
    origin: form.origin,
    controls,
    binding: { formId: binding.formId as string, sessionId: binding.sessionId as string, origin: binding.origin as string, documentId: binding.documentId as string },
  };
}

/**
 * Add one expectation, or say why not. One expectation per control; only an offer the form made
 * for it; a label change needs a label.
 */
export function addExpectation(
  form: PanelForm,
  list: readonly Expectation[],
  controlId: string | null,
  expect: string | null,
  name: string
): { readonly ok: true; readonly list: readonly Expectation[] } | { readonly ok: false; readonly reason: string } {
  if (controlId === null) return { ok: false, reason: "Choose a control first." };
  const control = form.controls.find((c) => c.controlId === controlId);
  if (!control) return { ok: false, reason: "That control is not on the form." };
  if (expect === null || !control.offers.includes(expect as Offer)) return { ok: false, reason: "Choose what clicking it should do." };
  if (list.some((e) => e.controlId === controlId)) return { ok: false, reason: "That control already has an expected result." };
  if (expect === "TARGET_RENAMED") {
    if (name.trim() === "") return { ok: false, reason: "Type the label it should change to." };
    return { ok: true, list: [...list, { controlId, expect: "TARGET_RENAMED", name: name.trim() }] };
  }
  return { ok: true, list: [...list, { controlId, expect: expect as "TARGET_DISABLED" | "TARGET_FOCUSED" }] };
}

/** "Submit — button: It becomes unavailable (greyed out)". */
export function describeExpectation(form: PanelForm, expectation: Expectation): string {
  const control = form.controls.find((c) => c.controlId === expectation.controlId);
  const what = expectation.expect === "TARGET_RENAMED" ? `Its label changes to “${expectation.name}”` : OFFER_TEXT[expectation.expect];
  return `${control?.text ?? expectation.controlId}: ${what}`;
}

/** The one answer the panel sends for this form. */
export const taskAnswer = (form: PanelForm, goal: string, list: readonly Expectation[]) => ({
  kind: "DECLARED",
  ...form.binding,
  goal,
  declarations: list.map((e) => ({ ...e })),
});

/**
 * The status line, tied to the task it describes (M19 manual test finding).
 *
 * A bare outcome outlived the page it described: after a reload the panel still said "clicked
 * #submit → CONFIRMED" beside an empty, unsubmitted form. The line now says which task it is — when
 * it was started, and on which site — and that the page may have changed since.
 */
export function taskHeadline(started: { readonly at: Date; readonly origin: string } | null, summary: string): string {
  if (started === null) return summary;
  const time = started.at.toTimeString().slice(0, 8);
  return `Task started ${time} on ${started.origin} (if you reloaded the page since, this is that earlier page): ${summary}`;
}

/** A value-free summary of a task's outcome, for the panel's status line. */
export function summariseTask(status: unknown): string {
  if (!isRecord(status) || !isRecord(status.task)) return "No task started.";
  const task = status.task;
  if (task.state === "RUNNING") return "Running…";
  if (task.state === "FAILED") return `Could not run: ${String(task.refused)}`;
  const loop = isRecord(task.result) && isRecord(task.result.loop) ? task.result.loop : null;
  if (!loop || !Array.isArray(loop.turns)) return "Finished.";
  const turns = loop.turns
    .map((t: unknown, i: number) => {
      if (!isRecord(t)) return `turn ${i + 1}: ?`;
      const steps = isRecord(t.plan) && Array.isArray(t.plan.steps) ? t.plan.steps : [];
      const click = steps.find((s: unknown) => isRecord(s) && s.op === "click") as { target?: string } | undefined;
      const verification = isRecord(t.act) && isRecord(t.act.verification) ? String(t.act.verification.verification) : null;
      const refusal = isRecord(t.refusal) ? String(t.refusal.cause) : null;
      const done = t.declaredDone === true;
      // A click the client refused was never made: say "proposed", not "clicked".
      const what = done
        ? "the model said the task is done"
        : click && verification !== null
          ? `clicked ${click.target} → ${verification}`
          : click
            ? `the model proposed clicking ${click.target}; refused (${refusal ?? "?"}), nothing clicked`
            : `stopped (${refusal ?? "?"})`;
      return `turn ${i + 1}: ${what}`;
    })
    .join("; ");
  return `${String(loop.outcome)} — ${turns}`;
}
