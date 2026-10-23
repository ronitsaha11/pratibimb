# M16 — the client decides which stored value goes into which field

> **Status: the fix is in.** On W1 the real local model completed the M2 page in every run recorded
> here, with no fallback: 4 runs on the M14 branch, then 7 more on the M15 branch after the merge. That is the result of a handful of runs at temperature 0. **It is not a
> reliability rate**, and it is not a J7 experiment: no gate, specification or J7/B5 decision is
> touched by it.

## Hypothesis

If privacy pairs each empty field with the one reference that fits it, the validator enforces that
pairing, and the local model's grammar offers only that pairing, then on the M2 page the real model
plans the correct fill and submit without a fallback. Every refusal stays a refusal.

## The defect

M15 recorded it on the M2 fill-and-submit page (`M15-two-step-task/logs/w1-cft-application-task.json`):

| Run | Model's raw proposal | Outcome |
|---|---|---|
| 1 | four `insert`s into fields that already held values, no click | `UNUSABLE` → the deterministic fallback completed the task |
| 2, 3 | `insert #mobile_confirm` with the **NAME** reference, then clicks | the binder refused `CLASS_MISMATCH` (`PRIVACY_REFUSED`, no fallback); nothing restored, nothing clicked |

## Root cause

| Label | Finding |
|---|---|
| FACT | The local adapter's grammar let `insert.ref` be **any** issued reference and `insert.target` **any** element (`packages/reasoner/src/localModel.ts`, before this change). |
| FACT | The manifest gives each reference a class, but an **empty field has no redaction, so the handoff carries no class for it**. The model saw the field's name ("Confirm mobile number") and four references, and had to match them itself. |
| FACT | The client already knew the answer. `classifyField` (privacy's D1) classifies `#mobile_confirm` as `PHONE` (autocomplete `tel`, type `tel`, label), and the core realm holds that, value-free, in the `BindView` the binder decides on. The remote boundary sends it across as `classified.view.fields`. |
| FACT | The binder refused the mismatch correctly, before any grant, restoration or click. The refusal is `HOSTILE`, so no fallback ran. **The protection worked; the planning did not.** |
| INFERENCE (from the M15 records) | The model was asked to make a choice that is the client's to make. `main`'s adapter got this page right, but no M15 variant reproduced that, so its correct choice was not robust. M14's `done` branch changed the model's decoding enough to expose the problem; `done` did not cause it. |
| FACT | Run 1 fell back because four inserts with no click is a refusal that is not `HOSTILE` (a model being bad at its job), and the policy allows a fallback for that. |

So the problem is not that the model is small. It is that **the model was the party choosing which
private value goes into which field**. The fix moves that choice to privacy.

## The fix

| Where | What |
|---|---|
| `packages/privacy/src/fill.ts` (new) | **`fieldFit`** is the class half of `bind`, now shared: `bind` calls it, in the same order and with the same causes. **`groundFill`** pairs each empty field with the **one** reference that fits it. Otherwise it withholds the field: `AMBIGUOUS_FIELD` (unknown or free-text), `CRITICAL_FIELD` (OTP), `NO_MATCHING_REFERENCE`, `CONFLICTING_REFERENCES` (more than one fits; neither is chosen), `UNKNOWN_TARGET`. |
| `packages/orchestrator/src/machine.ts` | After VERIFY PAYLOAD, grounds the empty fields (text boxes with no redaction) against the handoff's references. Passes the pairing to the reasoner and to the validator, and records it as `record.fill` (ids, tokens, codes). |
| `packages/plan/src/validate.ts` | **The client-side authority.** A reference insert must be exactly a pairing privacy grounded, or it is refused with `REFERENCE_NOT_GROUNDED` and a `fillCause`. The binder still runs first, so `NAME → mobile` is still reported with the binder's own `CLASS_MISMATCH`. Where the client could not decide, the refusal tells the person why and asks them, e.g. "say which value it takes". |
| `packages/reasoner/src/fallback.ts` | `REFERENCE_NOT_GROUNDED` is `HOSTILE`, like `PRIVACY_REFUSED`: no fallback planner answers instead, so a different value is never substituted. |
| `packages/reasoner/src/contract.ts` | `ReasonerRequest.fill`: the client's pairing. `sendToReasoner` refuses (`FILL_NOT_FROM_HANDOFF`) a pairing that names an element or a reference the verified handoff does not carry. |
| `packages/reasoner/src/localModel.ts` | Each `insert` the grammar offers is one pairing, target and reference together. With nothing to fill, a plan is one step. The model still decides **whether** to fill and **what** to click. It can no longer write a reference into a field privacy did not pair it with. |

**Unchanged:**
- the manifest, its schema and the action schema;
- the ADRs, gates, CSP and permissions;
- the egress path and the model pins;
- the privacy thresholds and the binder's causes and order;
- request, session and origin checks, and stale-view protection;
- per-turn capability revocation and VERIFY RESULT.

The handoff the verifier approves is byte-for-byte what it was. Frame egress stays disabled in the
product build.

## Environment

| Item | Value |
|---|---|
| Machine | W1 `LAPTOP-6E14K34L` |
| Date | 2026-10-22 (UTC) |
| Browser | Chrome for Testing `chromium-1243` (153.0.8010.12), headed |
| Model | Qwen2.5-0.5B-Instruct Q4_K_M, SHA-256 `74a4da8c…a7d9db`, matching `acquisition.json` |
| Runtime | llama.cpp b10956 on 127.0.0.1:8977, behind the recording front on 127.0.0.1:8995 (the product's only `connect-src`) |

## Expected result

On every run, the SUCCESS act:
- is planned by `LOCAL_MODEL`;
- inserts `<PII:PHONE:1>` into `#mobile_confirm` and clicks `#submit`;
- is CONFIRMED.

The REFUSAL and OUTAGE acts behave as in M2.

## Actual result

**Harness:** `tests/browser/extension/run-extension-loop.mjs`, on the M14 branch (`feature/bounded-task-loop`) with
this fix. It runs three acts:
- **SUCCESS** — the real model;
- **REFUSAL** — a hostile front returning the raw phone number;
- **OUTAGE** — nothing listening.

| Record | Build | SUCCESS act | Classification |
|---|---|---|---|
| `w1-cft153-m2-loop-product-run1.json` | product | `insert #mobile_confirm <PII:PHONE:1>`, `click #submit` → CONFIRMED | **model-completed** |
| `w1-cft153-m2-loop-product-run2.json` | product | same | **model-completed** |
| `w1-cft153-m2-loop-product-run3.json` | product | same | **model-completed** |
| `w1-cft153-m2-loop-evidence-build.json` | `M3_WORKER_FRAME=1` evidence build | same | **model-completed**; all 72 harness checks PASS |

In every record:

| Act | Result |
|---|---|
| SUCCESS | `reasonerKind` `LOCAL_MODEL`, no fallback. `record.fill` = `#mobile_confirm` ↔ `<PII:PHONE:1>`, nothing withheld. |
| REFUSAL | `LITERAL_REFUSED` / `LEAKAGE_EVENT`, no fallback, nothing restored. |
| OUTAGE | Fell back to the deterministic planner, recorded as such. |

**The product-build runs report 8 checks FAIL.** Every one is a perception check:
- `aRealFrameWasCaptured`, `theDetectorRanOnThePinnedArtifact`, and the related checks.

The product build captures no frame (frame egress disabled), and the committed M2 record
(`a330526`) was made with the frame-capture evidence build. The evidence-build run shows that every
other check holds with this change.

### On the M15 branch, after the merge

Run with `feature/action-result-verification`, after `feature/bounded-task-loop` was merged into it
(merge `0fdd000`): product build, same machine, browser and model.

**The M2 page as a multi-turn task:**
- harness `M15_TASK=application M15_RUNS=5 node tests/browser/extension/run-two-step-task.mjs`;
- `maxTurns` 2;
- `#submit` → `TARGET_ENABLED false`.

| Run | Turn 1 (model's raw proposal) | Turn 2 | Page | Classification |
|---|---|---|---|---|
| 1–5 | `insert #mobile_confirm <PII:PHONE:1>`, `click #submit` → CONFIRMED | `done` | "Application submitted", submit disabled | **model-completed** (5 of 5) |

In every run:
- every turn was answered by `LOCAL_MODEL`, with no fallback;
- one grant was answered;
- the front's tripwire found no value-shaped text in any model request;
- egress went only to `127.0.0.1:8995`.

Record: `w1-cft153-application-task-after-merge.json`.

The harness's `firstStepConfirmedByThePage` and `second…` properties read the **two-step page's**
counters, so on this page they are `false` by construction. The page truth above is what counts.

Compare M15's three runs on the same page: 1 fallback-completed, 2 privacy-refused.

**The M2 loop harness on the merged code:** 2 runs, both **model-completed**. The SUCCESS act was
the same plan as above → CONFIRMED, and `record.fill` paired `#mobile_confirm` with `<PII:PHONE:1>`.
The same 8 perception checks fail on the product build, as above.

Records: `w1-cft153-m2-loop-after-merge-run{1,2}.json`.

**Control — the M15 two-step page:**
- `M15_RUNS=3 node tests/browser/extension/run-two-step-task.mjs`;
- 3 of 3 runs, each `click #confirm-slot` → CONFIRMED, then `click #book` → CONFIRMED, then `done`;
- all nine harness properties held;
- every turn was answered by `LOCAL_MODEL`.

This is unchanged from M15. The page has no fillable field, so privacy paired nothing and the
grammar offered no `insert`.

Record: `w1-cft153-two-step-control-after-merge.json`.

### Totals

| | Model-completed | Privacy-refused | Fallback-completed |
|---|---|---|---|
| M2 page, M14 branch | 4 | 0 | 0 |
| M2 page, M15 branch (loop harness and application task) | 7 | 0 | 0 |
| Two-step control | 3 | 0 | 0 |

**The only fixture value in these logs** is the harness's own read-back of the synthetic confirm
field (`page.confirmValue`), exactly as in the committed M2 record. Nothing the extension sent
contains one: the harness's `leaks` checks PASS.

## Conclusion

On W1, with the client deciding the pairing, the real local model completed the M2 task in every
recorded run. That is 11 of 11 across both branches, against 0 of 3 in M15. Every refusal path
behaved as before, and the two-step control was unchanged.

**Not claimed:**

- **Any reliability rate.** Fourteen runs at temperature 0, on two pages and one machine. M15 saw this
  model's output vary between runs at temperature 0.
- **That the model now "understands" field types.** It does not have to: it is offered only
  pairings the client made, and anything else it writes is refused.
- **Other pages, other models, longer tasks, J7, B5 or frame egress.**

## Reproducibility

```bash
npm run build -w @pratibimb/extension
CHROME_PATH=<chrome for testing> node tests/browser/extension/run-extension-loop.mjs
```

On the M15 branch, the application task and the two-step control:

```bash
M15_TASK=application M15_RUNS=5 node tests/browser/extension/run-two-step-task.mjs
M15_RUNS=3 node tests/browser/extension/run-two-step-task.mjs
```

Each harness writes into the historical `M2-…/logs/` or `M15-…/logs/` files. Those records were
copied here, and the historical files were restored with `git checkout --`.
