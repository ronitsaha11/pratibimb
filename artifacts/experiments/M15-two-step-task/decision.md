# M15 — decision record

**Verdict: DEMONSTRATED** — W1, one synthetic two-step page, real extension, real local model:
3 of 3 runs, with two actions each confirmed by VERIFY RESULT, then the model's `done`.
Reproducibility at temperature 0, not a reliability rate. **Not a J7 experiment.**

## What M15 changed in the product

- **Postconditions are declared by the client, per click target**, from ADR-0007's closed set. The
  orchestrator no longer assumes "submit disables itself" for every click.
  - A click with no declaration is refused before any grant, restoration or click.
  - So is one whose postcondition already holds.
  - The model cannot set its own success condition: `parsePlan` drops the field.
- **A failed read-back after a click is `UNKNOWN` (`OBSERVATION_FAILED`)**, recorded with the
  dispatch. It is no longer an exception that escapes the turn.
- **One action per plan:** `validatePlan` refuses `MORE_THAN_ONE_CLICK`.
- **The local model is asked on pages with no references.** Its context shows each button's
  `enabled` state (the manifest's own field), clicks are grounded to enabled controls, and with
  nothing to restore a plan is one step.
- **Each turn acts through its own transport cycle.** This fixes an M14 integration defect that
  refused every second turn in the real extension.

## Unchanged

- Executable actions are click only (ADR-0006).
- No CSP, permission, manifest, egress, model pin or threshold change.
- Production frame egress disabled.
- F-M13-1 open; J7/B5 and D1–D4 untouched.

## Open

- Postconditions must be declared per task. A control nobody declared cannot be clicked. That is the
  intended fail-closed behaviour, and it means a general-purpose task needs a source of declarations
  (a task template or the person). That is not decided here.
- The small model needed unambiguous grounding: the earlier records are the evidence.
- **On the M2 fill-and-submit page the model is unreliable** since M14 added `done`:
  - one run in three was completed by the deterministic fallback;
  - two in three stopped on a privacy refusal, because the model inserted the NAME reference into the
    mobile field. Nothing was clicked in those runs.
  - `main`'s adapter got this page right, and no M15 variant restored that.
  - Reliable reference choice needs more than this model, or the field's class in the handoff, which
    is a manifest decision. Recorded in the README; not decided here.
