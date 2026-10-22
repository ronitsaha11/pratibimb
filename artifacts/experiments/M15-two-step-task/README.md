# M15 — a two-step task in the real extension, planned by the real local model

> **Status: DEMONSTRATED on W1, synthetic page, 3 of 3 runs.**
>
> - Two dependent actions, each verified by the page's own state.
> - The model's `done`, recorded as its claim.
> - The three runs were identical. That is not a reliability rate: the model runs at temperature 0,
>   and even so its output varied between runs on another page (below).
> - **Not a J7 experiment.** No frame was captured, and no gate or specification is closed or changed
>   by it.

## Hypothesis

With M15's client-declared postconditions:

1. The product extension can complete a task that needs two dependent clicks.
2. Each click's effect is confirmed by VERIFY RESULT on a fresh reading.
3. The proposals come from the real local model, Qwen2.5-0.5B-Instruct, through the normal gates.
4. Nothing is clicked that the client did not authorise.

## Environment

| Item | Value |
|---|---|
| Machine | W1 (`LAPTOP-6E14K34L`) |
| Date | 2026-10-22 |
| Browser | Chrome for Testing 153.0.8010.12 (`chromium-1243`), headed |
| Extension | **product build**, no evidence flags. `connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`; permissions unchanged. |
| Model | `Qwen/Qwen2.5-0.5B-Instruct-GGUF` @ `9217f5db79a2…`, `qwen2.5-0.5b-instruct-q4_k_m.gguf` (SHA-256 checked against `models/…/acquisition.json` before each run); llama.cpp b10956 on 127.0.0.1:8977 |
| Model access | through `tests/browser/demo/reasoner-service.mjs` (recording front on 127.0.0.1:8995) |
| Fixture | `tests/browser/extension/fixture/two-step.html`, served by the loopback demo server at `/two-step/` |
| Perception | the product's no-gesture DOM floor; no capture |
| Harness | `tests/browser/extension/run-two-step-task.mjs`. It supplies no plan, retries nothing and substitutes nothing. It answers approvals, and none was asked for: the page holds no values. |

**The task:**
- **Goal:** "Confirm the slot, then book it."
- **Turn budget:** `maxTurns` = 3.
- **Postconditions** declared by the task:

| Target | Declared postcondition |
|---|---|
| `#confirm-slot` | `TARGET_NAME` "Slot confirmed" |
| `#book` | `TARGET_ENABLED` false |

`#book` is disabled until `#confirm-slot` has been clicked.

## Expected result

Each run:
1. `click #confirm-slot` → CONFIRMED;
2. on a fresh reading, `click #book` → CONFIRMED;
3. then stops: on `done`, as COMPLETED_AS_DECLARED, or on a refusal, with nothing further clicked.

## Actual result

Final record: [`logs/w1-cft-two-step-task.json`](logs/w1-cft-two-step-task.json), fixture v2 `d4fbe0b6…`.

**3 of 3 runs, identical:**

| Turn | Model proposal | Gate result |
|---|---|---|
| 1 | `click #confirm-slot` | CONFIRMED: "#confirm-slot is named "Slot confirmed", as expected." |
| 2 | `click #book` | CONFIRMED: "#book is disabled, as expected." |
| 3 | `done` | `COMPLETED_AS_DECLARED`; nothing acted on |

The harness judged nine properties on every run, and **all held**:

| Property | Value in all 3 runs |
|---|---|
| turns within budget | 3 / 3 |
| every turn answered by `LOCAL_MODEL` | yes; no fallback |
| value-shaped text reaching the model (front's PII tripwire) | none |
| first step confirmed, and the page agrees | yes (`window.__clicks`) |
| second step taken from a fresh reading | yes: a new frame, `#book` actionable where it was not on turn 1 |
| second step confirmed, and the page agrees (stage 2) | yes |
| loop stopped on a supported outcome | yes |
| clicks the page received | exactly one per button |
| egress | to the loopback reasoner endpoint only, 3 requests per run |

### How it got there: six earlier records, each kept

Each earlier record exposed a defect, which was fixed in code or in the fixture before the next one.
None was "fixed" by supplying the model's answer. All records are in `logs/`.

| Record | What happened | Fix |
|---|---|---|
| `…-before-adapter-fix.json` | The model was **never asked**: `localModelReasoner` refused any page without a PII reference, so the deterministic planner answered with nothing. | Ask on click-only pages; offer `click` and `done` only. |
| `…-before-enabled-context.json` | The model planned both clicks at once, into a still-disabled `#book`. The validator refused; nothing was clicked. | Buttons carry the manifest's `enabled` field in the model's context; clicks are grounded to enabled controls. |
| `…-before-one-click.json` | The model repeated the same click inside one plan. The validator refused (`DUPLICATE_TARGET`). | A plan is one action: `validatePlan` refuses `MORE_THAN_ONE_CLICK`, and with no references the grammar allows one step. |
| `…-fixture-v1-confirm-stays-enabled.json` | Step 1 CONFIRMED; the model then re-clicked the still-enabled "Slot confirmed". **M15's pre-action check refused it** (`POSTCONDITION_ALREADY_HOLDS`). | The fixture now disables a completed step, as real forms do (v1 `b11538f5…` → v2 `d4fbe0b6…`). |
| `…-before-per-turn-cycle.json` | Step 1 CONFIRMED; the model correctly proposed `#book`. The execution gate refused (`BRIDGE_FRAME_MISMATCH`) because the extension reused turn 1's one-action transport cycle. **An M14 integration defect.** | `nextTurn()` gives each turn its own cycle. |
| `…-status-offered-as-clickable.json` | Both steps CONFIRMED. The model then proposed clicking the status line; it was refused (`NO_DECLARED_POSTCONDITION`), with nothing clicked. | Click grounding is restricted to control roles. |

### The M2 application page through the same harness — a model-reliability finding

`M15_TASK=application`: the fill-and-submit page, goal "Submit my application with my registered
mobile number", `#submit → TARGET_ENABLED false`.
Record: [`logs/w1-cft-application-task.json`](logs/w1-cft-application-task.json).

This was run because M14's real-model M2 regression check failed. That failure, `successDidNotFallBack`,
traces to **M14's `done` grammar branch, not to M15**. Controls run on the real M2 harness:

| Adapter | Who planned the M2 task |
|---|---|
| `main` | the model |
| M14 | the deterministic fallback |
| M15 | the deterministic fallback |

With the final M15 code, three runs of the application page gave:

| Run | Model's raw proposal | Outcome |
|---|---|---|
| 1 | four `insert`s into already-filled fields | refused; deterministic planner completed the task, CONFIRMED (as M14) |
| 2, 3 | `insert #mobile_confirm` with the **NAME** reference, then three clicks | `PRIVACY_REFUSED` by the binder; **nothing clicked** |

So **at temperature 0 the model's output varied between runs on this page.** Every wrong proposal was
refused before any value was restored or any control clicked.

Diagnostic variants of the adapter were run once each on this page; their records were overwritten,
and their outputs are quoted from the session:

| Variant | Model output |
|---|---|
| empty-field `insert` grounding | NAME reference |
| no `done` while a field is fillable | NAME reference |
| `main`'s prompt | NAME reference |
| `main`'s grammar with M15's prompt | four inserts |

**No variant restored `main`'s correct choice.**
- **INFERENCE:** picking the matching reference for an empty field is beyond this model without the
  field's expected class in the handoff. Adding that is a manifest change and out of scope.
- **Decision:** the adapter keeps M14's `insert` grammar, so this page is no worse than the parent PR.

## Conclusion

- **On W1, on one synthetic two-step page, the product extension completed a two-action task**
  planned turn by turn by the real local model. Each action's effect was confirmed by the page's own
  state, and the second action came from a fresh reading that the first action had changed.
- Every refusal along the way stopped the run **without** an unauthorised or unverified click. The
  stop rules held in each of the six earlier configurations.
- **Not claimed:**
  - any reliability rate. The two-step runs were identical, but output varied between runs on the
    application page;
  - other pages, longer tasks, or other models;
  - anything about J7, B5 or frame egress (no frame was captured).

## Reproducibility

```bash
CHROME_PATH=<chrome for testing> node tests/browser/extension/run-two-step-task.mjs
```

The harness builds the product extension and starts llama-server on 127.0.0.1:8977 and the recording
front on 127.0.0.1:8995. It refuses unless the model file matches its pinned SHA-256. `M15_RUNS`
(default 3) sets the number of runs.
