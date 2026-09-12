# MVP-1 — ACT against a real browser, on a controlled local page

> **The short version.** A validated action now reaches a real Chromium and changes real page
> state. Ten other actions — stale, moved, renamed, removed, off-screen, submit, link,
> `type` — produced **zero** click events in the page. The agent still **cannot complete the
> form task**, and this experiment does not claim otherwise: `type` is refused by design, and the
> DOM-poor page offers nothing to act on at all.

- **Date:** 2026-09-12 · **Workstation:** W2 (`LAPTOP-SRCINK2B`) · **Branch:** `feature/act-executor`
- **Implements:** [ADR-0006](../../../docs/adr/ADR-0006-act-browser-action-executor.md)
- **Follows:** `MVP-0-dom-sufficiency` (which clicked with **no** validation) and
  [ADR-0005](../../../docs/adr/ADR-0005-action-freshness-validation.md)
- **Log:** [`logs/mvp1.json`](logs/mvp1.json) · **Harness:** [`harness/run-mvp1.mjs`](harness/run-mvp1.mjs)
- **Verdict:** [`decision.md`](decision.md)

## Hypothesis

**H1.** A decision that VALIDATE allows can be dispatched to a real browser through a single-method
bridge, and the page will show the effect.

**H2.** No refused action — refused by validation, by the confirmation tier, or as unsupported —
produces any browser operation. The page itself, not the harness, is the witness.

**H3.** The controlled MVP task (fill the form and submit) **still cannot be completed**, and the
blocking reasons are architectural rather than detector-quality.

## Environment

| | |
|---|---|
| Host | `LAPTOP-SRCINK2B`, Windows 11 build 26200, AMD Ryzen AI 7 350, 16 threads, 23.0 GiB |
| Node | v26.4.0 |
| Browser | Chrome for Testing 153.0.8010.12, headless, launched via Playwright with `CHROME_PATH` |
| Pages | both served from `127.0.0.1:8982` by the harness. **Mode A** = the repository's own QG-02 fixture `tests/browser/qg02/fixture/form.html`, read and **never modified**. **Mode B** = the MVP-0 canvas fixture, generated locally from fabricated strings |
| Detector | **not loaded.** ACT consumes element-graph nodes; a detector candidate is not one |
| Authorisation | local fixtures only. No external site contacted, no real data, no real PII, no credential, no security control bypassed, no CAPTCHA, no authentication |

`CHROME_PATH` is required on this machine: Playwright's bundled Chromium fails with
`spawn UNKNOWN` under the Windows side-by-side loader, a known local defect unrelated to this work.

## Expected result

1. **A** (click a fresh, visible, enabled, routine control) → `EXECUTED`, one bridge call, the page
   records one click, focus moves.
2. **B–E2** (stale frame · moved · renamed · removed · last-removed) → `RE_OBSERVE`, ACT refuses,
   **no** page click.
3. **F, G** (submit · link) → validation **allows**, ACT refuses at the confirmation tier, **no**
   page click.
4. **H** (below the fold) → `RE_OBSERVE` `NOT_VISIBLE`.
5. **I** (`type`) → `UNSUPPORTED_ACTION`, the field stays empty.
6. **J** (canvas page) → no claim can be constructed at all.

## Actual result

**PASS — 11 demonstrations, 0 assertion failures.** Every assertion is in the harness, so a run
that flatters the result fails instead of printing one.

| # | demonstration | VALIDATE | ACT | bridge calls | page clicks |
|---|---|---|---|---|---|
| A | click the validated phone field | `ALLOW` | **`EXECUTED`** | 1, at (550, 276) | `{phone: 1}`, focus → `#phone` |
| B | claim from an earlier frame | `RE_OBSERVE` `FRAME_MISMATCH` | `REJECTED` `NOT_VALIDATED` | 0 | none |
| C | Cancel moved 60 CSS px, same frame | `RE_OBSERVE` `MOVED_BEYOND_TOLERANCE` | `REJECTED` | 0 | none |
| D | Cancel became "Delete my account" | `RE_OBSERVE` `NAME_CHANGED` | `REJECTED` | 0 | none |
| E | Cancel removed — **id rebound** | `RE_OBSERVE` `NAME_CHANGED` | `REJECTED` | 0 | none |
| E2 | last element removed | `RE_OBSERVE` `TARGET_MISSING` | `REJECTED` | 0 | none |
| F | **Submit, fully visible and fresh** | **`ALLOW`** | **`REJECTED` `HUMAN_CONFIRMATION_REQUIRED`** | 0 | none |
| G | a link | `ALLOW` | `REJECTED` `HUMAN_CONFIRMATION_REQUIRED` | 0 | none |
| H | Submit below the fold | `RE_OBSERVE` `NOT_VISIBLE` | `REJECTED` | 0 | none |
| I | `type` into the tel field | `ALLOW` | `UNSUPPORTED_ACTION` `CLEARANCE_PIPELINE_ABSENT` | 0 | none, field still `""` |
| J | the DOM-poor canvas page | not reached | not called | 0 | 0 actionable nodes |

**H1 holds.** **H2 holds** — ten refusals, zero page clicks, witnessed by listeners the page
itself kept. **H3 holds**, for the reasons below.

### Three findings, including two that are about this architecture rather than this code

**1. `NodeId` is positional within a snapshot, so a claim's id can rebind to a different
element.** Demo E removes `#cancel` and the id the plan held then resolves to a *surviving
neighbour*. The action is still refused — by the **name** check, not by the id lookup — which is
exactly why ADR-0005 checks identity before geometry. The consequence to be honest about:
`TARGET_MISSING` fires only when nothing can rebind (demo E2), and **safety here rests on role,
name and geometry rather than on the id**. Two adjacent controls with the same role *and* name
would rebind and then be caught only by geometry.

**2. A detector candidate is not an `ElementNode`, so a vision-only target cannot be acted on at
all.** On the canvas page the DOM exposes **0** actionable nodes, so there is nothing to build a
claim from regardless of what the detector grounded — MVP-0 measured 4/7 grounded there. The
missing link is fusion producing a node with visual evidence for an element the DOM does not
describe. **This, not detector precision, is why the canvas task cannot run.**

**3. ACT clicks a coordinate, and nothing yet proves the validated element is the topmost element
at that point.** An overlay inserted after observation would receive the click. Hit-testing
(`elementFromPoint` agreeing with the validated node) is a bridge-level gap, named here rather
than silently accepted.

### What did NOT happen, and must not be read as success

- **No form was filled and nothing was submitted.** `type` is refused, and `submit` is refused at
  the confirmation tier — so the controlled task ends after one click on one field.
- **No detector change.** Not loaded; threshold 0.55, `PROVISIONAL_THRESHOLDS` 0.25/0.5, NMS,
  decode, weights all untouched, asserted by the harness before it runs.
- **No VERIFY RESULT.** `EXECUTED` means *dispatched*. The focus change in demo A is evidence the
  harness collected, not a guarantee the executor provides.

## Conclusion

The boundary works and it is the boundary that was specified: `ALLOW` → dispatch, anything else →
nothing. The confirmation tier is the most valuable result — a perfectly fresh, visible, enabled
submit button is refused, which is the behaviour a privacy-and-safety submission needs to be able
to demonstrate on demand.

The agent is still two stages short of completing its own MVP task, and both are privacy stages:
**SANITIZE** (so a literal can be cleared) and **RE-HYDRATE** (so a vault reference can be typed).
Building either to make this experiment look finished would have been the wrong trade.

## Reproducibility

```bash
npm ci
npm run typecheck          # the harness imports the compiled dist of both packages
CHROME_PATH="<path to a working Chrome/Chromium>" \
  node artifacts/experiments/MVP-1-act-executor/harness/run-mvp1.mjs
```

Deterministic: no detector, no network, no timing-dependent assertion, fresh page per
demonstration, fixed viewports (1024×768, and 1024×1600 where `#submit` must be on screen). The
harness exits non-zero and prints each failed assertion if any demonstration deviates. Its
CI-runnable counterpart, using the same measured rects without a browser, is
`packages/agent/test/actOnMvpFixture.test.ts`.
