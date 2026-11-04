---
id: M23.8-dom-only-boundary-assurance
title: "M23.8 — DOM-only boundary assurance and regression hardening"
status: recorded — M23.7's boundary now has behavioural tests under a simulated extension; diagnostic hooks audited and left unchanged; OD-S prepared; no browser run; acceptance criteria still PROPOSED; ADR-0015 still PROPOSED
date: 2026-11-04
label: FACT (test results on W1; source and an existing build read as text); INFERENCE and UNKNOWN marked
classification: ASSURANCE (tests and documentation only) — no product source changed, no model loaded, read or hashed, no frame captured, no inference, no training, no dataset
workstation: 1
---

# M23.8 — DOM-only boundary assurance

> **What it is:** independent checks of what M23.7 delivered, and stronger regression tests.
> **What it is not:** a browser validation, a product change, an approval, or a decision on any hook.

## Hypothesis

M23.7's DOM-only boundary can be shown by running the real task path rather than reading it, without a browser, a model or a frame. The exact reach of the diagnostic hooks can be established. Weak assertions can be made able to fail.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `740a245` before this milestone, 77 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4.
- **Inputs:** the M23.3 to M23.7 records, ADR-0015, product source and harnesses read as text, and the M23.7 product build output (manifest, file names and JavaScript text only).

## Expected result

- An ordinary task's capture, model and worker activity is observed to be zero, and the same observation fails when perception is put back.
- Each hook's reach is established and classified.
- The vacuous harness assertions are replaced.
- The M13 product-phase assertion is tested on its own, or the limit is stated.
- Evidence-build preservation is assessed and stated as unverified at run time.

## Actual result

### 1. A behavioural rig, not a browser

`apps/extension/test/support/simulatedExtension.ts` runs the real `host/background.ts` and `host/offscreen/main.ts`, and through them the real task run, orchestrator, privacy boundary, execution gate, VERIFY RESULT and egress guard, with the real page agent. `chrome`, the page, the model server, ORT and every capture and worker API are fakes, and each capture, model or worker request lands on a counter. It is a model of a browser: it shows what this repository's code asks for, and says nothing about what Chrome does. The first run failed closed for lack of a structural observer, which the page then gained.

### 2. Tests added

| File | Tests | What |
|---|---|---|
| `apps/extension/test/domOnlyTaskPath.test.ts` | 65 | the ordinary task, negative controls, structure, the reasoner boundary, grounding, ambiguity, freshness, hit test, postconditions, five-turn cap, consent, vision-only exclusion |
| `apps/extension/test/diagnosticHooks.test.ts` | 23 | who reaches `PERCEIVE_ONCE` and `STREAM_CONSUME`, and what they do; the real `ORT_SMOKE` against the M13 check |
| `apps/extension/test/buildSeparation.test.ts` | 30 | the real `wxt.config.ts`, per flag, on a fake disk |
| `tests/browser/support/dom-only-checks.test.mjs` | 25 | the claims that replace the vacuous assertion, and the harness wiring |
| `tests/browser/support/csp-product-phase.test.mjs` | 17 | M13's product-phase condition; the manifest and package checks |
| `tests/browser/support/product-build-inspection.test.mjs` | 6 | inspecting a build without opening a model |

**Total: 166 new tests.** Comment-only changes: `coverageBoundary.test.ts`, `taskLoopWiring.test.ts`.

### 3. Harnesses (edited, not run)

- `run-consent-task.mjs`, `run-declared-task.mjs`: the vacuous `productBuildCapturedNoFrame` is replaced by `domOnlyTaskChecks`.
- `run-csp-negative.mjs`: its ORT condition moved to `csp-product-phase.mjs`. The evidence branch is unchanged, and the product branch is stricter.
- `run-two-step-task.mjs`, `run-clarification-task.mjs`, `run-product-benchmark.mjs`, `run-sidepanel-smoke.mjs`: wording that would have written a false statement about the "no-gesture floor" into future records is corrected.
- New: `tests/browser/extension/inspect-product-build.mjs`, read-only, run once here.

### 4. Findings

**Boundary:** an ordinary task captures nothing and asks for no model or worker, including with a toolbar grant live, on the panel route, across turns, and with visual regions on the page. A regression double that rewires perception fails the checks. **It also still reports CONFIRMED,** which is exactly why a task-outcome check could not have caught it.

**Corrections to M23.7:**

| M23.7 said | What is true |
|---|---|
| hooks are "reachable only through the DevTools-only `__host` control plane" | that is the only sender **in source**. The handlers accept **any context of this extension,** including its content script, and they do not refuse tab senders as `RUN_TASK` does (`diagnostic-hook-boundary-map.md`, F-2, F-3) |
| "Evidence builds are unchanged" | true of builds with a flag. **`run-gesture-capture.mjs` and `run-gesture-acts.mjs` are defined on the product build, and four of their checks can no longer pass there.** M23.7 did not report this (`evidence-build-preservation-assessment.md` §3, OD-U) |

**New findings:**
- **F-6:** `PERCEIVE_ONCE`'s reply has no `detector` field, so on a product build T1's refusal reads as `detections: []`. `run-detector-eval.mjs` would report every target missed rather than a refusal. It is not authorised to run; this is recorded so no one reads such a result as a measurement.
- **OD-T:** the side panel still says "Click the toolbar button to let PratiBimb look at this tab", and the toolbar title says "perceive this tab". Neither is true of a product task.
- **Fallback, stated plainly:** a plan the validator finds merely unusable is never executed, but the deterministic planner may then answer, through every gate. This is recorded policy; my first tests had assumed otherwise.

**The M23.7 build output (`logs/w1-m23-7-product-build-inspection.json`):** no boundary problem; no `t1-ui-head.onnx`; TR-01 and ORT present; both hooks and `__host` drivers present; the side panel's capture text present. It predates this milestone's tests, and no product source has changed since.

### 5. Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | This assurance record | here, and `decision.md` |
| 2 | Diagnostic-hook reachability and boundary map | `docs/acceptance/diagnostic-hook-boundary-map.md` |
| 3 | Owner-decision comparison | `docs/acceptance/od-s-diagnostic-hooks-comparison-PROPOSED.md` |
| 4 | Corrected harness assertions | `tests/browser/support/dom-only-checks.mjs`; the two harnesses |
| 5 | M13 product-phase verification | `tests/browser/support/csp-product-phase.mjs`; `docs/acceptance/dom-only-regression-matrix.md` §4 |
| 6 | Evidence-build preservation assessment | `docs/acceptance/evidence-build-preservation-assessment.md` |
| 7 | Structural and security regression matrix | `docs/acceptance/dom-only-regression-matrix.md` |
| 8 | Human browser smoke procedure | `docs/acceptance/dom-only-browser-smoke-procedure-PROPOSED.md` |
| 9 | Owner-decision register | `docs/acceptance/owner-decisions.md` (OD-S, OD-T, OD-U) |
| 10 | State and changelog | `agentos/state.md`, `CHANGELOG.md` |

## Known limitations

1. **No browser ran.** The product's real runtime behaviour after M23.7 is still not validated (`dom-only-browser-smoke-procedure-PROPOSED.md`).
2. **All new tests are evidence type A.** The rig's fakes encode my reading of Chrome's messaging, and a wrong reading would not show up here.
3. **`content.ts` and `page-surface-dom.ts` did not run.** The rig repeats `serveBoundary`'s few lines and uses a simulated page, so real DOM reading is not exercised.
4. **The edited harnesses were not run.** Their new checks are tested in isolation, against synthetic records and against real task records from the rig. Their wiring is checked statically.
5. **The evidence phase of `run-csp-negative.mjs` and every evidence harness: not run.** Evidence-build runtime preservation is **UNVERIFIED**.
6. **No performance measurement.** New product performance evidence is still pending.
7. **ADR-0015's status note still predates M23.7.** It is unedited, and it stays PROPOSED.

## Conclusion

Within a simulated browser, M23.7's boundary holds and is now guarded by tests that fail if perception returns. The audit found two statements in M23.7's record that were too strong, and they are corrected here. Nothing about the product changed. The hooks, the visible capture wording and the affected harnesses are now owner decisions (OD-S, OD-T, OD-U). A browser run remains outstanding.

## Reproducibility

```bash
npx vitest run apps/extension/test/domOnlyTaskPath.test.ts apps/extension/test/diagnosticHooks.test.ts apps/extension/test/buildSeparation.test.ts tests/browser/support/dom-only-checks.test.mjs tests/browser/support/csp-product-phase.test.mjs tests/browser/support/product-build-inspection.test.mjs
```

```bash
npx vitest run
```

```bash
npm run typecheck
```

```bash
node tests/browser/extension/inspect-product-build.mjs
```

```bash
python scripts/verify-repo.py
```

See `decision.md` for the results.
