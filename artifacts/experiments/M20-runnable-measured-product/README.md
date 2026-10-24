# M20 — the runnable product, measured, and run by a person

> **Status: DEMONSTRATED on W1 — launcher, benchmark, and a person-operated run in Chrome's real side
> panel (Allow once, then Deny), PASS.** One run per scenario: no reliability rate.
>
> W1 only, synthetic loopback pages, product build. **Not a J7 experiment and not a privacy-metric
> run; J7/B5 and D1–D4 are unchanged.** Measurements: [`artifacts/benchmarks/M20-w1-product/`](../../benchmarks/M20-w1-product/README.md).

## Hypothesis

From a clean W1 checkout, a person can:

- start the pinned local reasoner with one documented command (`npm run reasoner`), which:
  - verifies exactly what is pinned;
  - serves only the CSP's one endpoint, on loopback;
  - refuses what it must refuse;
  - logs no content;
  - leaves no process behind when stopped;
- run the product build in Chrome's real side panel against that service;
- see, per turn, what happened and how long each measured stage took.

Every run leaves a value-free, ordered, monotonic record of its state transitions.

## Environment

| Item | Value |
|---|---|
| Machine | W1 `LAPTOP-6E14K34L`, Intel Core 7 240H (16 logical), Windows 10.0.26300 |
| Date | 2026-10-23 (UTC) |
| Browser | Chrome for Testing 153.0.8010.12 (`chromium-1243`), headed |
| Extension | **Product build**, no evidence flags. CSP `connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`; permissions `offscreen`, `sidePanel`, `activeTab`, `tabCapture`; host `http://127.0.0.1/*`. All unchanged. |
| Reasoner | `scripts/reasoner/reasoner.mjs` (what `npm run reasoner` runs). Qwen2.5-0.5B-Instruct Q4_K_M @ `9217f5db79a2`, 491 400 032 B, SHA-256 `74a4da8c…d7a9db`; llama.cpp b10956 CPU x64 on 127.0.0.1:8977, behind the launcher's front on 127.0.0.1:8995 |
| Node | v24.19.0 |

## Expected result

1. **Launcher.**
   - `--check` verifies the model (size, then full SHA-256) and the runtime (archive SHA-256, then
     every installed `.exe`/`.dll` against it) and starts nothing.
   - A start serves `/health` reporting the pin, and answers a real verified handoff sent through
     `localModelReasoner`.
   - It refuses: a web-page origin (403), a remote origin (403), a foreign Host (421), another path
     (404), GET on the endpoint (405), non-JSON (400), and value-shaped text (422, not forwarded).
   - Its request log carries no body.
   - A second start is refused (exit 2) and stops nothing.
   - `--stop` leaves no process and no listener.
2. **Benchmark.** Complete stage, cold/warm, resource and disk figures for at least ten steps,
   without raising the 5-turn cap (`artifacts/benchmarks/M20-w1-product/`).
3. **Person, real side panel.** For the M2 application page:
   - **Allow once:** the trail shows `CONSENT_REQUESTED → CONSENT_ANSWERED(ALLOWED_ONCE) →
     BINDER_REVALIDATED → VALUE_RESTORED → PAGE_REFRESHED → CLICK_AUTHORIZED → CLICK_DISPATCHED →
     RESULT_OBSERVED → RESULT_VERIFIED(CONFIRMED)`, the page holds the registered number, and Submit
     is disabled.
   - **Deny:** the trail ends at `CONSENT_ANSWERED(CONSENT_DENIED)`; nothing is restored, clicked or
     submitted.
   - Both records are value-free, ordered and new.

## Actual result

### 1. Launcher lifecycle — PASS

Record: [`logs/w1-launcher-lifecycle-20261023T203334Z.json`](logs/w1-launcher-lifecycle-20261023T203334Z.json),
produced by [`harness/launcher-lifecycle.mjs`](harness/launcher-lifecycle.mjs). All eight checks held:

| Check | Result |
|---|---|
| `/health` reports the pinned model, SHA-256 and endpoint | PASS |
| Real inference through `localModelReasoner` (Vitest `launcher.live.test.ts`, 2 passed) | PASS |
| Refusals: web origin 403, remote origin 403, rebinding Host 421, other path 404, GET 405, non-JSON 400, value-shaped text 422 | PASS |
| The launcher's request log does not contain the value-shaped request's digits | PASS |
| A second launcher is refused (exit 2, "already in use … Nothing was stopped") | PASS |
| The first instance still serves afterwards | PASS |
| After `--stop`: no process left | PASS |
| After `--stop`: no listener on 8995 or 8977 | PASS |

Cold start in that run, measured: verify 651 ms, model load 3169 ms, total 3839 ms.

**Found and fixed while building this: stop order.** `--stop` first stopped the launcher, then the
model. On Windows, `process.kill` ends the launcher outright and its signal handlers do not run.
`--stop` now stops the model first, and the launcher follows it down (`reasoner.mjs`, `stopRecorded`).

### 2. Benchmark — COMPLETE

Reference record: [`../../benchmarks/M20-w1-product/w1-cft-product-benchmark-20261023T203520Z.json`](../../benchmarks/M20-w1-product/w1-cft-product-benchmark-20261023T203520Z.json).

- 6 of 6 tasks `COMPLETED_AS_DECLARED`; 15 steps.
- Warm step p50 448.7 / p95 1438.8 ms (n = 14). Reasoner round trip p50 438.0 / p95 1391.4 ms.
  Cold first step 2680.6 ms.
- 0 of 15 steps network-free.

Details, method and caveats: the benchmark README. Two earlier runs are kept beside it, with what
each lacks.

**Found and fixed while building this: a floating-point artifact.** An unrounded difference of
`performance.now()` values printed as `…9000000001`. That matched the synthetic mobile number, and
the orchestrator's existing "never quotes the secret" test caught it. Durations are now kept to
0.01 ms. No assertion was changed.

### 3. A person, Chrome's real side panel — PASS (17 of 17 checks)

Record: [`logs/w1-cft-product-sidepanel-smoke-20261023T213953Z.json`](logs/w1-cft-product-sidepanel-smoke-20261023T213953Z.json),
produced by `tests/browser/extension/run-product-smoke.mjs`.

**Who did what.**

- **The person:**
  - started the reasoner with `npm run reasoner` in their own terminal;
  - opened Chrome's real side panel;
  - typed the goal, read the page, declared the expected result and started each task;
  - pressed **Allow once**, then reloaded the page, then pressed **Deny**;
  - closed the browser.
- **The harness:**
  - checked `/health` against the pin;
  - built the product extension;
  - launched Chrome for Testing with it loaded via `--load-extension` (the person did not use Load
    unpacked);
  - served the synthetic page;
  - observed and wrote the record.

The harness pressed nothing, answered nothing and injected nothing.

**Allow once** — 9 of 9 checks. Outcome `COMPLETED_AS_DECLARED`; the page holds the registered
number, Submit is disabled, and the verifier says `CONFIRMED`. Turn 1's trail, in ms since the run
started:

| Event | ms |
|---|---|
| `RUN_STARTED` | 0 |
| `OBSERVED` | 1809.7 |
| `SANITIZED` | 1818.2 |
| `HANDOFF_VERIFIED` | 1818.2 |
| `PLAN_REQUESTED` | 1818.4 |
| `PLAN_RECEIVED(USABLE)` | 2978.5 |
| `PLAN_VALIDATED(OK)` | 2979.0 |
| `CONSENT_REQUESTED(PHONE)` | 2979.1 |
| `CONSENT_ANSWERED(ALLOWED_ONCE)` | 4564.9 |
| `BINDER_REVALIDATED(OK)` | 4566.0 |
| `VALUE_RESTORED(PHONE)` | 4567.9 |
| `PAGE_REFRESHED` | 4962.4 |
| `CLICK_AUTHORIZED` | 4966.9 |
| `CLICK_DISPATCHED` | 4968.1 |
| `RESULT_OBSERVED` | 5385.5 |
| `RESULT_VERIFIED(CONFIRMED)` | 5385.7 |
| `RUN_ENDED(DONE:CONFIRMED)` | 5385.7 |

Turn 2 ended `DONE:DECLARED_DONE`. Consent wait: 1586 ms.

**Deny** — 8 of 8 checks. Outcome `STOPPED_REFUSED`, refusal `AWAIT_GRANT / CONSENT_DENIED`. The
trail ends `CONSENT_REQUESTED(PHONE)@1509.4 → CONSENT_ANSWERED(CONSENT_DENIED)@4087.6 →
RUN_ENDED(REFUSED:CONSENT_DENIED)@4087.7`. No `BINDER_REVALIDATED`, `VALUE_RESTORED`,
`PAGE_REFRESHED`, `CLICK_*` or `RESULT_*` event; no restoration, act or verify-result timing. The
page: confirmation field empty, Submit enabled, 0 Submit clicks.

**What the person saw.**

- **Allow:** the panel read `COMPLETED_AS_DECLARED — turn 1: clicked #submit → CONFIRMED`, with the
  timing view. On the page: the confirmation field filled, Submit greyed out, and "Application
  submitted".
- **Deny:** the panel read `STOPPED_REFUSED` with `CONSENT_DENIED` and "nothing clicked", and the
  restore, re-read, click and verify-result rows read "not measured". On the page: the field empty,
  Submit enabled, and "Not submitted".

**Value-free.** None of the fixture's synthetic values, nor the preview, appears in the record. It
contains no local path and no user name, only codes, field ids, classes and times.

**An unexplained Submit sequence (Allow scenario), kept as recorded.** The record's
`page.submitClicks` is **2**, while the run authorised and dispatched exactly **one** click
(`CLICK_AUTHORIZED → CLICK_DISPATCHED`, once). Before the browser closed, the page's own event log
(`window.__submitEvents`, event types and coordinates only) was read through the harness's page
handle, read-only, at about 21:58 UTC. It held two complete
`pointerdown → mousedown → pointerup → mouseup → click` sequences on Submit:

| # | Coordinates (CSS px) | What it is |
|---|---|---|
| 1 | pointer (122.4, 611.4), mouse (122, 611) | **Unexplained.** Its source is not established. |
| 2 | (112, 610) exactly | **The agent-authorised, dispatched click.** The permit point is rounded to whole pixels by design, and the run recorded exactly one dispatch. |

The page log lists sequence 1 first. **The person's observation:** "I did not intentionally click
Submit before or during the task." No claim is made about sequence 1's source. What is established:
- the run's pre-click check found Submit still enabled and the expected result not yet true;
- the form was submitted only after the agent's click, which the verifier confirmed.

The record is not edited, and this diagnostic is not part of it.

**Earlier session, kept as written:**
[`logs/w1-cft-product-sidepanel-smoke-20261023T205646Z.json`](logs/w1-cft-product-sidepanel-smoke-20261023T205646Z.json)
— verdict FAIL, no task recorded.

- **What the harness recorded.** The harness of that version waited 20 minutes for the Allow task,
  then 20 more for the Deny reload. It then closed the browser itself. Its record shows no task seen
  in its window.
- **What else happened.** The reasoner's terminal shows the person's two model requests arriving
  during that session, so the Allow run most likely completed after the harness had stopped looking
  for it (inference). The person's panel then showed `COMPLETED_AS_DECLARED`, but closing the
  browser destroyed the page state, so that run is **not** counted.
- **The fix.** The harness no longer times out or closes the browser on the person. It waits until
  the person closes it or presses Ctrl+C.

## Conclusion

On W1, from the documented commands, a person ran the shipped product end to end in Chrome's real
side panel:

- The product launcher served the pinned model on the one CSP endpoint.
- Allow once restored the value once, then clicked and verified.
- Deny restored and clicked nothing.
- Both runs left an ordered, monotonic, value-free trail, and the panel showed measured per-stage
  timings.

The launcher's lifecycle and the W1 benchmark stand on their own records.

**Not shown:**
- reliability (one run per scenario);
- any other machine or browser;
- loading the build by hand;
- ordinary websites;
- frame egress (blocked);
- anything about J7/B5 or D1–D4.

## Reproducibility

```bash
npm run reasoner:stop
```
```bash
node artifacts/experiments/M20-runnable-measured-product/harness/launcher-lifecycle.mjs
```
```bash
CHROME_PATH="<CfT 153 chrome.exe>" node tests/browser/extension/run-product-benchmark.mjs
```

For the human run, start `npm run reasoner` in one terminal, then in another:

```bash
CHROME_PATH="<CfT 153 chrome.exe>" node tests/browser/extension/run-product-smoke.mjs
```

Each harness writes a new record named by its start time and refuses to overwrite one.
