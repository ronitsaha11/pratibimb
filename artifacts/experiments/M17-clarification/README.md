# M17 — the person decides which stored value a field takes, when two fit

> **Status: DEMONSTRATED on W1, synthetic page, one run per scenario.**
>
> - The real extension asked the question in its own side panel page, by the label of the field each
>   candidate came from, and showed no value.
> - The answer was honoured exactly, and the page's own check decided the result.
> - Declining left the field empty and asked no planner.
>
> **Not a reliability rate, and not a J7 experiment.**
>
> The second half of this record diagnoses the eight perception checks M16 reported failing on the
> product build.

## Hypothesis

When privacy withholds an empty field because two stored values fit it (`CONFLICTING_REFERENCES`),
the run can stop before anything is sent or planned, and ask the person in the extension's UI which
value it takes. The question names candidates without values. The answer is bound to that question.

Given a choice, the run continues through every existing gate:
- the pairing,
- the validator,
- the binder,
- the human grant,
- REFRESH and the permit gate,
- VERIFY RESULT.

Given no choice, nothing is filled and nothing is submitted.

## Environment

| Item | Value |
|---|---|
| Machine | W1 `LAPTOP-6E14K34L` |
| Date | 2026-10-22 (UTC) |
| Browser | Chrome for Testing 153.0.8010.12 (`chromium-1243`), headed |
| Extension | **Product build**, no evidence flags, for the clarification runs. `connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`. Permissions unchanged. |
| Model | Qwen2.5-0.5B-Instruct Q4_K_M, SHA-256 checked against `acquisition.json`; llama.cpp b10956 on 127.0.0.1:8977, behind the recording front on 127.0.0.1:8995 |
| Fixture | `tests/browser/extension/fixture/two-phones.html`: the M2 page plus a filled "Alternate mobile number" (synthetic) |
| Harness | `tests/browser/extension/run-clarification-task.mjs` |

**The task:**
- **Goal:** "Submit my application with my registered mobile number."
- **Turn budget:** `maxTurns` 2.
- **Postcondition:** `#submit` → `TARGET_ENABLED false`.

## Expected result

| Scenario | The person picks | Expected |
|---|---|---|
| `c1` | "The number from “Mobile number”" | the registered number is restored, submit is CONFIRMED, then `done` |
| `c2` | "The number from “Alternate mobile number”" | the alternate number is restored, as chosen; the page refuses it, so NOT_CONFIRMED and STOPPED_UNVERIFIED |
| `decline` | "Don't use either" | REFUSED at AWAIT_CLARIFICATION; no planner asked, nothing filled, nothing clicked |

## Actual result

Record: [`logs/w1-cft-clarification-task.json`](logs/w1-cft-clarification-task.json). **PASS: 27 of
27 judged properties held across the three scenarios.**

**What the panel showed, read off the rendered page (identical in all three runs):**

> More than one stored phone could go into "Confirm mobile number". Which one should PratiBimb use?
> ◯ The number from “Mobile number”  ◯ The number from “Alternate mobile number”
> [Use this value] (disabled until one is chosen)  [Don't use either]

| Scenario | Model's raw proposals | Result |
|---|---|---|
| `c1` | `insert #mobile_confirm <PII:PHONE:1>` + `click #submit`, then `done` | Confirm holds the REGISTERED number. "Application submitted"; CONFIRMED; COMPLETED_AS_DECLARED. 1 grant asked and answered. |
| `c2` | `insert #mobile_confirm <PII:PHONE:2>` + `click #submit` | Confirm holds the ALTERNATE number. "Mobile number does not match"; NOT_CONFIRMED; STOPPED_UNVERIFIED. 1 grant. |
| `decline` | none (the model was never asked) | Confirm EMPTY; no click; no grant; REFUSED `CLARIFICATION_DECLINED` at AWAIT_CLARIFICATION. |

In every run:
- the question was asked once, before SEND;
- the front's tripwire found no value-shaped text in any model request;
- egress went only to the loopback reasoner;
- the record contains none of the fixture's values. The confirm field is recorded as which number
  it holds, not as text.

**How it got here.** The first execution of this harness produced the same three outcomes. One
judged property failed on `decline` because of a bug in the harness's own judge: a declined run has
no SEND state, and `indexOf` returned −1. The judge was fixed and the harness re-run, which
overwrote that record. The product behaviour did not change between the two runs.

## The clarification, as implemented

| Part | Where | What it does |
|---|---|---|
| Candidates | `packages/privacy/src/fill.ts` | `groundFill` names the candidates of a `CONFLICTING_REFERENCES` field (tokens the handoff carries). Given a person's choice, it applies it only if that reference still fits the field on this view. Otherwise the field is withheld as `CHOICE_NOT_A_CANDIDATE`. A choice for a non-conflicting, unknown-type, OTP or non-empty field is refused. |
| Question and answer check | `packages/orchestrator/src/clarification.ts` | `prepareClarification` builds the question. Candidates are `c1`, `c2`…, each with the label of its source field and its class; the token mapping stays in the core realm. **Indistinguishable labels → no question:** `CANDIDATES_INDISTINGUISHABLE`, "Enter the value yourself". `checkClarificationAnswer` requires exactly the answer's fields, each equal to the question's: clarification id, session, origin, view, document, target and candidate set. It also checks expiry and that the candidate id is one offered. Any extra field (an action, a value, a reference) is `MALFORMED_ANSWER`. |
| The wait | `packages/orchestrator/src/machine.ts` | New human-decision state `AWAIT_CLARIFICATION`, after VERIFY PAYLOAD and before SEND, entered only for a conflicting field. Every other run's path is unchanged. If the page's structural signal moved while the person chose, the choice is not applied (`CLARIFICATION_STALE`). Privacy then re-grounds with the choice. Any non-answer stops the run: declined, refused, failed, unavailable, expired or stale. |
| Extension | `apps/extension/host-lib/clarification-desk.ts`, `clarification-panel.ts`, `host/offscreen/main.ts`, `host/sidepanel/` | The offscreen document parks the question (`CLARIFY_PEEK` / `CLARIFY_DECIDE`). Only this extension's own pages may read or answer it, by sender URL. One answer per question; an answer to an older question does not settle the current one. The panel renders labels with `textContent`, has no free-text input, and builds the typed answer from the question's own fields. |

**Unchanged:**
- the manifest, action schema, ADRs and gates;
- CSP and permissions;
- the egress path and the model pins;
- privacy thresholds;
- the reinsertion policy (`NOT_AN_EMPTY_FIELD`);
- `done` semantics, the turn budget, per-turn revocation and postconditions.

Click remains the only executable action.

## The eight perception checks M16 reported failing on the product build

**What M16 wrote was imprecise.** "Frame capture was disabled in the product build" is not what
happens. Corrected here.

| | Product build | Evidence build (`M3_WORKER_FRAME=1`) |
|---|---|---|
| How a frame is obtained | Only after a **person invokes the extension on the tab** (`activeTab`), through the gesture stream route. This is ADR-0009, APPROVED 2026-09-24. `captureVisibleTab` is absent from the bundle. | `captureVisibleTab` in the worker, with `<all_urls>`: the `DEGRADED_TEST_ROUTE`, compiled in only by the flag |
| In an automated run | Every pass refuses with typed `NO_ACTIVE_TAB_GRANT`. No frame, no detector, no fusion. The handoff declares the structural floor `["T0","T2"]`. The DOM loop continues. | A frame is captured, T1 runs, fusion joins, and the handoff declares `["T0","T1","T2"]` |
| Frame **egress** (sending a frame off the client) | Blocked in both (ADR-0012 §13, QG-04 unsigned; B2 and B5 open). **Unrelated to these eight checks.** | same |

**FACT** (records in `logs/`):
- **Product build** (`w1-cft153-m2-loop-product-build.json`): every pass refused with
  `NO_ACTIVE_TAB_GRANT`, `route: null`, `workerSawPixels: false`. The route category is
  `NO_CAPTURE`. The SUCCESS act was the real model, CONFIRMED.
- **Evidence build** (`w1-cft153-m2-loop-evidence-build.json`): `WORKER_FRAME`; all 72 checks PASS.

**Classification:**
- **(a) expected fail-closed behaviour under an approved decision (ADR-0009);**
- **(b) a harness that asserts evidence-build behaviour of a product build.** The harness itself
  says "this runner is automated, so it is always the degraded one".

It is **not** a missing product capability. The product's gesture route was verified
human-in-the-loop in M4 (12/12) and M5 (29/29), per those records. It is not a build or wiring defect
either.

**Fix, in the harness only** (`run-extension-loop.mjs`):
- It asks the loaded build which it is (`captureState().workerFrameEnabled`).
- **On the product build:** the eight frame-requiring checks are set aside by name. They are not
  counted as passes, and the values they read are kept in `notApplicableOnThisBuild`. They are
  replaced by three product checks:
  - every pass refused with `NO_ACTIVE_TAB_GRANT` and held no pixels;
  - the handoff declares the structural floor;
  - no element claims vision.
- **On the evidence build,** or if the build cannot be read, nothing changes.

| Build | Checks | Result |
|---|---|---|
| Product | 67 (= 72 − 8 + 3) | **PASS**, 0 failing |
| Evidence | 72 | **PASS** |

**What would verify product-build perception:** a person invoking the extension on the tab, as in
M4/M5's gesture harnesses. Nothing here enabled capture without a gesture, and nothing touched frame
egress.

## Conclusion

On W1 the real extension asked a person, in its own panel, which of two stored phone numbers a field
takes. It showed no value, honoured the answer exactly through every gate, and filled and submitted
nothing when declined.

The eight product-build perception "failures" are the product refusing capture without a person's
invocation, as ADR-0009 requires. They were scored by assertions written for the evidence build.

**Not claimed:**
- any reliability rate;
- other pages;
- a person in the loop: the harness clicked the panel's controls;
- the real side panel: the same page was opened in a tab, because a harness cannot open Chrome's
  side panel;
- product-build perception without a gesture;
- anything about J7, B5 or frame egress.

## Reproducibility

```bash
CHROME_PATH=<chrome for testing> node tests/browser/extension/run-clarification-task.mjs
npm run build -w @pratibimb/extension && CHROME_PATH=<…> node tests/browser/extension/run-extension-loop.mjs
M3_WORKER_FRAME=1 npm run build -w @pratibimb/extension && CHROME_PATH=<…> node tests/browser/extension/run-extension-loop.mjs
```

`run-extension-loop.mjs` writes into `M2-page-value-boundary/logs/`. Those records were copied here,
and the historical file was restored with `git checkout --`. Rebuild the product extension
afterwards.
