# M19 — the person allows one restoration, in the extension's panel

> **Status: DEMONSTRATED on W1, synthetic pages, one run per scenario — a HARNESS DEMONSTRATION.**
>
> The shipped side panel page ran in its own popup window and the harness pressed its buttons. A
> harness cannot open Chrome's side panel, so **Chrome's real side-panel surface was not exercised**,
> and no person was in the loop.
>
> **Not a reliability rate, not a J7 experiment.** Decision record:
> [`docs/adr/ADR-0014-panel-consent-with-masked-preview.md`](../../../docs/adr/ADR-0014-panel-consent-with-masked-preview.md).

## Hypothesis

For a task the person started in the side panel, the client can:
- ask, before any stored value is restored, about exactly that restoration, showing site, field,
  category and a masked preview, and never the value;
- restore the value only after an **Allow once** that answers that very request, re-checked by the
  binder;
- restore nothing, and submit nothing, on Deny or on any stale, replayed or forged answer.

## Environment

| Item | Value |
|---|---|
| Machine | W1 `LAPTOP-6E14K34L` |
| Date | 2026-10-23 (UTC) |
| Browser | Chrome for Testing 153.0.8010.12 (`chromium-1243`), headed |
| Extension | **Product build**, no evidence flags. CSP and permissions unchanged (`connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`; `offscreen`, `sidePanel`, `activeTab`, `tabCapture`). |
| Model | Qwen2.5-0.5B-Instruct Q4_K_M, SHA-256 checked against `acquisition.json`; llama.cpp b10956 on 127.0.0.1:8977, behind the recording front on 127.0.0.1:8995 |
| Fixtures | `tests/browser/demo/fixture/application.html` (M2); `tests/browser/extension/fixture/two-phones.html` (M17). Synthetic values. |
| Harness | `tests/browser/extension/run-consent-task.mjs` |

**How each task was stated, in the panel (M18):**
1. Goal: "Submit my application with my registered mobile number."
2. **Read this page**.
3. Declare "Submit application": "It becomes unavailable".
4. **Start task**.

## Expected result

| Scenario | The person… | Expected |
|---|---|---|
| allow | presses **Allow once** | the registered number is restored into "Confirm mobile number"; the click is CONFIRMED by the page |
| deny | presses **Deny** | nothing is restored, nothing is clicked |
| stale | (the harness, as a stale panel) answers the *previous* request, then this request but the *previous* document | the first is turned away by the desk, which keeps waiting; the second is refused by the orchestrator (`DOCUMENT_CHANGED`); nothing is restored or clicked |
| clarify-allow | on the two-numbers page, chooses "Mobile number" (M17), then **Allow once** | that number is restored; the click is CONFIRMED |

## Actual result

Record: [`logs/w1-cft-consent-task.json`](logs/w1-cft-consent-task.json). **PASS: 52 of 52 judged
properties held, on the first execution.**

**What the panel showed, every time:**

> **Allow PratiBimb to use your phone number?**
> Site: `http://127.0.0.1:8975` · Field: Confirm mobile number · Value: *(masked preview)* (hidden; only this preview is shown)
> PratiBimb is about to put your phone number into “Confirm mobile number” on http://127.0.0.1:8975.
> If you allow it, PratiBimb will then click “Submit application”, and check the page shows the expected result.
> [Allow once] [Deny]

**The preview is not in this record.** Its shape was the expected one in every run: eight dots and
the last two digits of the synthetic registered number. The record keeps only that shape, and
booleans for whether it was those two digits (yes) and whether it contained a full stored value
(no). The harness refuses to write a record that contains any stored value.

| Scenario | Model's raw proposals | Consent | Result |
|---|---|---|---|
| allow | `insert #mobile_confirm <PII:PHONE:1>` + `click #submit`, then `done` | ALLOWED_ONCE | Confirm holds the REGISTERED number. Submit CONFIRMED (page disabled it); one click; COMPLETED_AS_DECLARED. |
| deny | same first proposal | CONSENT_DENIED | Confirm EMPTY; 0 clicks; STOPPED_REFUSED. Panel: "Denied. Nothing was restored." |
| stale | same first proposal | 1st answer (previous request's id): desk `NOT_THIS_CONSENT`, still waiting. 2nd (this id, previous document): passed by the desk, refused `DOCUMENT_CHANGED` by the orchestrator | Confirm EMPTY; 0 clicks; STOPPED_REFUSED |
| clarify-allow | same first proposal, after the person chose `c1` | ALLOWED_ONCE | Confirm REGISTERED; submit CONFIRMED; COMPLETED_AS_DECLARED |

In every run:
- the control plane's grant path was never asked;
- every turn was answered by `LOCAL_MODEL`, with no fallback;
- the front's tripwire found no value-shaped text;
- egress went only to the loopback reasoner;
- perception refused with `NO_ACTIVE_TAB_GRANT`, so no frame was taken.

### Regression on this branch

| Check | Result |
|---|---|
| M17 clarification harness (control-plane grants, unchanged path) | PASS |
| M18 declared-outcome harness | PASS, same outcomes as M18 |
| M2 loop, **product** build ([`logs/w1-cft153-m2-loop-product-build.json`](logs/w1-cft153-m2-loop-product-build.json)) | PASS, 67/67 |
| M2 loop, **evidence** build ([`logs/w1-cft153-m2-loop-evidence-build.json`](logs/w1-cft153-m2-loop-evidence-build.json)) | PASS, 72/72 |
| CSP negative (product and evidence) | PASS; F-M13-1 still open |
| QG-04 interception | PASS |

Every harness that rewrites an older experiment's `logs/` was restored with `git checkout --`.

### Found and fixed on the way: the mobile normaliser

`normaliseIndianMobile` stripped a leading `91` unconditionally. A valid ten-digit mobile that
begins 91 therefore lost two digits and was rejected, so the D2 channel did not classify it as
PHONE.
- **FACT:** the old implementation rejected all five bare 91-prefixed regression cases.
- **Fix:** a prefix (`+91`, `0091`, `91`, `0`) is stripped only when exactly ten digits remain.
- **Regression tests** in `packages/privacy/test/validators.test.ts` cover:
  - bare 91-prefixed mobiles, preserved and classified as PHONE;
  - six prefixed forms;
  - ten malformed forms that still fail closed.
- No fixture or golden file contained a 91-prefixed ten-digit number.

## Addendum: the real Chrome side panel, operated by a person (2026-10-23/24, W1)

Record: [`logs/w1-cft-real-sidepanel-smoke.json`](logs/w1-cft-real-sidepanel-smoke.json).
Harness: `tests/browser/extension/run-sidepanel-smoke.mjs`.
- **Human-in-the-loop.** The owner opened PratiBimb in **Chrome's own side panel** and made every
  click. The harness only launched the product build and the local model, and observed: it sent no
  answer and pressed nothing.
- **Verdict PASS, 31/31 checks.** Chrome for Testing 153.0.8010.12, product build, real Qwen.

| Scenario | Questions | Consent | Restored | Field after | Submit clicks | Outcome |
|---|---|---|---|---|---|---|
| Allow once | consent | `ALLOWED_ONCE` | `#mobile_confirm` | registered | 1, CONFIRMED | COMPLETED_AS_DECLARED |
| Deny | consent | `CONSENT_DENIED` | — | empty | 0 | STOPPED_REFUSED |
| Stale (page reloaded while the consent waited, then Allow once) | consent | `CONSENT_STALE` | — | empty | 0 | STOPPED_REFUSED |
| Two numbers | which-number (chose `c1`, "Mobile number"), then consent | `ALLOWED_ONCE` | `#mobile_confirm` | registered | 1, CONFIRMED | COMPLETED_AS_DECLARED |

In every scenario:
- the consent was asked in the panel, and the control-plane grant path was never asked;
- the expected result was declared by the person;
- no value-shaped text reached the model;
- egress went only to the loopback reasoner;
- the record holds no stored value and no preview text.

**What the person observed, and what only the record shows:**
- Scenarios 1–3: the owner saw each final page and panel state, and it matched the record.
- Scenario 4: the browser closed itself the moment the scenario ended (a harness defect, since
  fixed), so **its final screen was not seen by the owner**. That scenario is harness-recorded
  evidence only.
- The order consent → restore → click is enforced by the run's state machine. This record holds
  outcomes, not timestamps, so the order was not observed with timestamps.

**Found by the first attempt, fixed before the run above** (`ae6dc28`):
- The consent and which-number boxes sat below three inert placeholder sections in the real side
  panel, out of view. The inert "Grants" buttons looked like consent controls.
- The status line outlived the page it described.
- The harness reloaded the page the moment a scenario ended.

After the run, the harness was changed once more: it now keeps the browser open until the person
closes it. The committed record was produced by the version before that change.

**Not claimed:** any reliability rate; other pages or values; anything about J7, B5 or frame egress.

## Conclusion

On W1, for tasks stated in the extension's panel page, the client asked about each stored-value
restoration before making it, showing only a masked preview. It restored the value only on an Allow
once that answered that exact request, then let the ordinary gates verify the click. Deny and stale
answers restored and submitted nothing.

**Not claimed:**
- Chrome's real side-panel surface;
- a person in the loop;
- any reliability rate;
- previews for classes other than a validated mobile number (generic by design);
- anything about J7, B5 or frame egress.

## Reproducibility

```bash
CHROME_PATH=<chrome for testing> node tests/browser/extension/run-consent-task.mjs
```
