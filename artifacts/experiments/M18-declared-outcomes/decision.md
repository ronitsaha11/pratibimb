# M18 — decision record

**Decision:** the expected result of a click may be declared by the person, in the extension's panel,
as well as by whoever states the task (the control plane, as in M15).

**How the person declares:**
- The client reads the page and offers its visible control-role elements. For each, it offers only
  ADR-0007 results that are not already true.
- The person picks controls and results. A control is an id the form issued, and a result is one of
  the form's offers; for a label change, the person also types the label.
- `checkDeclaration` turns that answer into a bound `TaskDeclaration`.

**What the machine checks on every turn:**
- session, origin, goal and table, before reading the page;
- the document, after reading it;
- each control's identity (selector, role, accessible name), at VALIDATE and again on the reading
  the click is made from;
- the declared result, which must not already hold, immediately before the click (M15's check);
- the declared result again on a fresh reading after the click (VERIFY RESULT).

The loop continues only on CONFIRMED.

## Within contract

- **Postconditions: ADR-0007's closed set only** (`FOCUS_ON_TARGET`, `TARGET_ENABLED false`,
  `TARGET_NAME`). Nothing outside it can be expressed.
  - `TARGET_ENABLED true` is not offered, because a disabled control cannot be clicked.
  - A typed label is data compared for equality. It is validated for length and control characters;
    it is never parsed or evaluated.
- **No new action.** Click remains the only executable action (ADR-0006). One click per plan, as
  before.
- **No new timeout.** A form is valid for one document and one accepted answer. Staleness is
  decided by the page, never by a clock, so ADR-0008 §5 and the clarification/grant TTL question
  are untouched.
- **No manifest, schema, ADR or gate change.** The declaration never reaches a reasoner: the model
  sees the same handoff and grammar as before, and its plan carries operations and targets only.
- **Extension:**
  - Three offscreen messages, `TASK_PREPARE`, `TASK_START` and `TASK_STATUS`, accepted only from this
    extension's own pages.
  - A control-plane `RUN_TASK` carrying a declaration is refused (`DECLARATION_ONLY_FROM_THE_PANEL`),
    so nothing but the panel's form can claim to be the person's declaration.
  - One build-time constant, `__REASONER_ENDPOINT__`, is derived from the same two constants the CSP
    pins. The CSP and permissions are byte-identical.

## Still for the owner — not decided here

1. **Grant prompt in the panel.** A panel-started task that needs a value restored still waits for
   the value-use grant through the control plane. Building a human-facing grant surface is a
   privacy-UX decision, and it is not made here.
2. **M16 Q1–Q3:**
   - whether `ReasonerRequest.fill` is acceptable;
   - that giving the pairing to a remote planner needs a manifest change and an ADR;
   - whether to keep the reinsertion policy.

   All unchanged.
3. **ADR-0008 §5 TTLs**, including the clarification TTL. Unchanged; M18 adds none.
4. **Masked previews (M17).** Not implemented.
5. **J7 / B5 / D1–D4, F-M13-1, production frame egress.** Untouched and open.
