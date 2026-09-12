# MVP-2 — HIT-TEST AGREEMENT and VERIFY RESULT, against a real browser

> **Workstation 1 (`LAPTOP-6E14K34L`). Local controlled fixture only.**
> No external site was contacted, no real data or credential was used, no account exists, no
> security control was bypassed, and the detector was never loaded.

## Hypothesis

Two claims, tested separately because they fail separately.

**H-HITTEST.** A click validated against one observation can be dispatched to a *different*
element, because the page may change in the milliseconds between validation and dispatch and
`page.mouse.click` sends the event to whatever is topmost. A read-only query of the topmost
element, performed immediately before dispatch, will detect that and refuse — and a refusal will
produce **zero click events in the page**, measured by the page itself.

**H-VERIFY.** `ActResult.status === "EXECUTED"` does not establish that the intended thing
happened. A stage that reads the page back after the action can distinguish *dispatched* from
*worked*, and will return `NOT_CONFIRMED` for a click that landed and did nothing useful, and
`UNKNOWN` — not success and not failure — where the evidence does not settle it.

**What would falsify them.** H-HITTEST fails if an overlay over the validated point still lets a
click through, or if a refusal nonetheless produces a page click event. H-VERIFY fails if a
dispatch is ever reported as `CONFIRMED` without the page showing the expected state, or if a
genuinely undetermined outcome is collapsed into either success or failure.

## Environment

| | |
|---|---|
| Workstation | **1** — `LAPTOP-6E14K34L` |
| CPU / RAM | Intel Core 7 240H, 16 logical CPUs, 23.64 GiB |
| GPU | Intel Graphics 32.0.101.7077 · NVIDIA GeForce RTX 5050 Laptop 32.0.16.1074 *(neither used — no detector, no GPU work)* |
| OS | Windows 11 Home Single Language 10.0.26200 |
| Node / npm | v24.19.0 / 12.0.2 |
| Browser | **Chromium 151.0.7922.34**, headless, viewport 1024×768, DPR 1 |
| Chromium binary | `ms-playwright/chromium-1234/chrome-win64/chrome.exe` via `CHROME_PATH` |
| Page | `tests/browser/qg02/fixture/form.html` — the repository's own QG-02 fixture, **read, never modified**, served from `http://127.0.0.1:8983` by the harness |
| Network | loopback only; no external request was issued |
| Detector | **not loaded** |

**Environment limitation, recorded rather than worked around.** Playwright in this repository
expects `chromium-1243`; this workstation has `chromium-1234`, and `npx playwright install` fails
here (download failure). The harness supports `CHROME_PATH`, so the run used the Chromium already
present. This is a property of W1, not a defect in the harness, and the browser version above is
the one that actually ran.

## Expected result

| demo | expected |
|---|---|
| A — valid click | MATCH → EXECUTED → CONFIRMED, exactly **1** page click event |
| B — overlay over the point | MISMATCH → ACT never called → **0** page click events |
| C — hit test cannot answer | UNKNOWN → ACT never called → **0** page click events |
| D — dispatched, state absent | MATCH → EXECUTED → **NOT_CONFIRMED** |
| E — dispatch outcome unknown | EXECUTION_ERROR(BRIDGE_TIMEOUT) → **UNKNOWN** |
| F — target disappears | EXECUTED → **UNKNOWN**, not a failure |
| G — stale frame | VALIDATE refuses; the hit test is never reached |
| H — confirmation tier | MATCH, and ACT refuses anyway → **0** page click events |

## Actual result

**All eight as expected. Verdict `AS DESIGNED`, `problems: []`.** Raw log:
[`logs/mvp2.json`](logs/mvp2.json).

| demo | VALIDATE | HIT-TEST | ACT | VERIFY RESULT | page click events |
|---|---|---|---|---|---|
| A valid click | ALLOW | **MATCH** | EXECUTED | **CONFIRMED** | **1** (`#phone`) |
| B overlay | ALLOW | **MISMATCH** `DIFFERENT_ELEMENT` | NOT_CALLED | — | **0** |
| C cannot answer | ALLOW | **UNKNOWN** `BRIDGE_THREW` | NOT_CALLED | — | **0** |
| D label click | ALLOW | MATCH | EXECUTED | **NOT_CONFIRMED** `FOCUS_ELSEWHERE` | 2 |
| E bridge stops answering | ALLOW | MATCH | EXECUTION_ERROR `BRIDGE_TIMEOUT` | **UNKNOWN** `DISPATCH_OUTCOME_UNKNOWN` | 1 |
| F target removed | ALLOW | MATCH | EXECUTED | **UNKNOWN** `TARGET_ABSENT_AFTER_ACTION` | 1 |
| G stale frame | **RE_OBSERVE** `FRAME_MISMATCH` | NOT_REACHED | NOT_CALLED | — | **0** |
| H help link | ALLOW | MATCH | **REJECTED** `HUMAN_CONFIRMATION_REQUIRED` | — | **0** |

**Exactly one of eight demos is CONFIRMED.** Five page click events occurred across the whole
run, all of them in demos where a click was supposed to happen.

### The three results worth more than the table

**1 — the overlay is detected by stable reference, and the page stays untouched.** In demo B a
consent banner was appended over `#cancel` *after* the observation the plan was built from. The
hit test at `(680, 380)` reported `#consent-banner` instead of `#cancel`, ACT was never called,
and `document`-level click counting recorded **0** events. Without this gate the click would have
been dispatched successfully — `page.mouse.click` does not force past actionability — and landed
on the banner, which is the failure mode the stage exists for.

**2 — demo D is the honest shape of "EXECUTED but useless".** The fixture's `<label for="phone">`
means clicking the label focuses the *input*. The click was real and had a real effect — the page
counted **two** click events, one on the label and one synthesised on the input — and focus moved
to `#phone`, not to `#phone-label`. The expected postcondition therefore did not occur, and the
answer is `NOT_CONFIRMED`. An agent that treated `EXECUTED` as success would have reported this
as a completed step.

**3 — demo E shows the conservatism, and it costs something.** The bridge clicked and then stopped
answering. `document.activeElement` is `#phone`, exactly what a confirmation would look like — and
VERIFY RESULT still reports `UNKNOWN`, because ACT could not establish that the dispatch completed
and a page that happens to look right does not prove *this* action made it so. That is deliberate,
and it is a real cost: a timeout that actually landed is reported as unknown and will force a
re-observation. The alternative — letting the final state upgrade an unknown dispatch — cannot
distinguish "my click did this" from "it was already like this", so it is not available.

### One thing this run measured that was not its subject

The fixture's real rects, as Chromium reports them at 1024×768, are recoverable from the
hit-test points in the log: `#phone` centre `(550, 276)`, `#cancel` `(680, 380)`, `#phone-label`
`(550, 230)`, `#help-link` `(480, 319)` — i.e. `#cancel` is at `x=620, w=120`. The deterministic
counterpart test in `packages/agent/test/guardedActOnMvpFixture.test.ts` uses these measured
values. **`packages/agent/test/actOnMvpFixture.test.ts` (PR #60) uses different numbers for the
same elements** — `#cancel` at `x=32, w=96` — while describing them as the rects a real Chromium
measured. Those tests pass, because they are internally consistent and `#phone`'s centre happens
to coincide, but the description does not match this measurement. Recorded for the author of that
PR; **not changed here**, because it is another open PR's file.

## Conclusion

**H-HITTEST: SUPPORTED** on W1, for this fixture, this browser and this overlay. An element that
became topmost after validation was detected, and every refusal cost the page zero click events.

**H-VERIFY: SUPPORTED** on W1. Dispatch and result are now separate answers, and the two
uncertain cases (an unestablished dispatch, a vanished target) returned `UNKNOWN` rather than
being collapsed in either direction.

**What this does NOT establish.** Nothing about real websites — one synthetic local fixture, one
browser, one machine, one overlay shape. Nothing about iframes, shadow DOM, `pointer-events`
trickery, CSS transforms or animations in flight, all of which can make "topmost" a harder
question than `elementFromPoint` answers. Nothing about task completion: `type` is still refused,
there is no observation loop, no planner, no server, no SANITIZE and no vault, so **no task was
completed and none could be**. The detector remains **UNADOPTED**, V1 remains experimental, and
the W-A real-data collection gate remains **CLOSED**.

**A residual, stated rather than buried.** `act()` remains callable directly and performs no hit
test. The gate is enforced by `guardedAct`, which is the exported composed path; a caller that
reaches past it to the primitive gets the pre-ADR-0007 behaviour. See ADR-0007 §8.

## Reproducibility

```bash
npm ci
npm run typecheck                 # the harness loads dist/, not src/
CHROME_PATH="<path to a Chromium>" node artifacts/experiments/MVP-2-hit-test-verify-result/harness/run-mvp2.mjs
```

Deterministic: fixed viewport, fixed fixture, fixed points, no detector, no network, no timing
dependence except demo E's deliberate 400 ms dispatch deadline. The harness **refuses to run**
if `PROVISIONAL_THRESHOLDS` has moved, if ACT claims to execute anything but `click`, or if the
agent package ever exports a confirmation-grant path, and it exits non-zero if any of the twelve
end-of-run assertions fails.

The CI-runnable counterpart, which needs no browser, is
`packages/agent/test/guardedActOnMvpFixture.test.ts`.
