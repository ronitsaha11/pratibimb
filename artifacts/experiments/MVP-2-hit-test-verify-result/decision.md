# MVP-2 — decision record

## Verdict

**H-HITTEST SUPPORTED. H-VERIFY SUPPORTED.** Measured 2026-09-13 on **workstation 1**
(`LAPTOP-6E14K34L`), Chromium 151.0.7922.34, against the repository's own QG-02 fixture served
from loopback. **Local controlled evidence — synthetic, one page, one browser, one machine.**

| | |
|---|---|
| **HIT-TEST AGREEMENT** | **implemented and exercised against a real browser.** MATCH / MISMATCH / UNKNOWN; only MATCH dispatches |
| **VERIFY RESULT** | **implemented and exercised against a real browser.** CONFIRMED / NOT_CONFIRMED / UNKNOWN |
| **Overlay refusal** | **0 page click events**, counted by the page, in every refusing demo |
| **`EXECUTED` → `CONFIRMED`** | **never automatic.** 8 demos, 4 dispatches, **1** confirmation |
| **Detector** | **UNADOPTED.** Not loaded anywhere in MVP-2, not shipped, not approved |
| **V1** | **experimental only.** Unused here |
| **Capture policy** | **NONE.** No capture occurred; no size, scale or deployment boundary is stated or implied |
| **W-A gate** | **CLOSED.** No external site, no real data, no credential, no account |

## What is proven — W1

1. **A click validated against one observation can be delivered to a different element, and the
   hit test catches it.** Demo B: a banner appended over `#cancel` after the plan was made was
   reported as topmost at `(680, 380)`; ACT was never called and the page recorded zero click
   events. `page.mouse.click` does not force past actionability, so without the gate the event
   would have gone to the banner.
2. **UNKNOWN refuses as hard as MISMATCH.** Demo C: a hit-test bridge that could not answer
   produced `UNKNOWN`/`BRIDGE_THREW` and zero page click events.
3. **Dispatch and result are now different questions.** Demo D: a real click on `<label
   for="phone">` produced two page click events and moved focus to `#phone` — and the declared
   postcondition `FOCUS_ON_TARGET` was `NOT_CONFIRMED`.
4. **Genuinely undetermined outcomes stay undetermined.** Demo E (`BRIDGE_TIMEOUT`) and demo F (a
   removed target) both returned `UNKNOWN`, neither upgraded to success nor downgraded to failure
   — and demo E returned `UNKNOWN` while `document.activeElement` looked exactly like a
   confirmation.
5. **The earlier boundary is not bypassed.** Demo G: a stale frame was refused by VALIDATE and the
   hit-test bridge was never consulted. Demo H: a MATCH did not become permission — the
   confirmation tier still refused the help link.
6. **The gate is not decorative.** Five deliberate source mutations — permitting UNKNOWN, skipping
   the stable-reference comparison, upgrading a timeout to CONFIRMED, dropping the
   stale-observation guard, and dispatching regardless of agreement — each broke between 1 and 6
   tests. The suite detects the removal of every property it claims.

## What is NOT proven

1. **Nothing about real websites.** One synthetic local fixture, one overlay shape.
2. **Nothing about hard topmost cases.** Iframes, shadow DOM, `pointer-events: none`, CSS
   transforms and in-flight animations are all situations where `elementFromPoint` is a weaker
   answer than it looks. None was tested and none is claimed.
3. **Nothing about task completion.** `type` is still refused, there is no observation loop, no
   planner, no server, no SANITIZE, no RE-HYDRATE and no vault. No task was completed.
4. **No production transport exists.** Both bridges are interfaces; the repository has no
   `manifest.json` and no content script, so nothing here runs in a shipped extension.
5. **The postcondition vocabulary is three kinds** — focus, enabled state, accessible name. It
   covers the controlled fixture and nothing was claimed beyond it. Navigation, submission and
   value change are not observable by this stage.
6. **Cross-machine behaviour.** W1 only. The prior ACT work (MVP-1) is **W2 evidence** and stays
   labelled W2; nothing here converts it.

## The residual, stated plainly

`act()` remains exported and callable without a hit test. The gate is enforced by `guardedAct`,
the composed path, and by the fact that `act` is documented as the primitive — **not** by a
mechanism that makes an unguarded dispatch impossible. Making the agreement a required argument to
`act()` would be stronger; it would also mean rewriting the tests of **PR #60, which is another
author's open PR**, and this run does not do that. Recorded as ADR-0007 §8 rather than left for a
reviewer to discover.

## Deviations

1. **Playwright's bundled Chromium is absent on W1** (`chromium-1243` expected, `chromium-1234`
   present, `npx playwright install` fails here). Ran against the Chromium that exists, via the
   harness's `CHROME_PATH` support. An environment limitation, recorded, not a harness defect.
2. **Parameterised page probes are built as complete expressions**, because Playwright evaluates a
   string as an expression and does not apply an argument to it. The first run silently returned
   `undefined` for every hit test — which the gate correctly reported as `MALFORMED_TOPMOST`, an
   honest refusal to read an answer it could not read, rather than a false MATCH. Every substituted
   value is checked to be a finite number or a plain element id first.

## Not changed

Production decoder, threshold (0.55), `PROVISIONAL_THRESHOLDS` (0.25 / 0.5), NMS, model weights,
preprocessing, detector packaging, the frozen TEST split, D5, D2, and every privacy and egress
invariant. No network capability, no storage, no vault, no secret handling and no PII logging was
added. `ALLOWED_ACTIONS` and `EXECUTABLE_ACTIONS` are unchanged: this executor still performs
exactly one action kind.

## Follow-ups

| id | item |
|---|---|
| **Hit test in hard DOM** | iframes, shadow DOM and `pointer-events` — *if and when* a fixture needs them. Not required for anything currently gating |
| **ACT's unguarded primitive** | make the agreement a required argument once PR #60 has merged, so the change touches settled code |
| **Postcondition vocabulary** | navigation and submission need contracts the element graph does not carry today |
| **`actOnMvpFixture.test.ts` geometry** | its rects do not match this run's measurement; for the author of PR #60 |
