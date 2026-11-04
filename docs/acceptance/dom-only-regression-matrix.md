# DOM-only Phase 1 — regression and evidence matrix (M23.8)

> **Status:** what M23.8's tests establish about M23.7's boundary (M23.8, 2026-11-04, at `740a245` plus tests).
> - **What "behavioural" means here:** the real `background.ts`, `offscreen/main.ts`, task run, orchestrator, privacy boundary, execution gate and egress guard ran in Node under a fake `chrome`, with every capture, model and worker API counted (`apps/extension/test/support/simulatedExtension.ts`). **It is a model of a browser, not a browser.**
> - **Evidence type:** in the terms of `core-product-acceptance-PROPOSED.md` §4, all of this is **type A** (unit and integration). None of it is type B to H. **No browser ran. No acceptance criterion is approved or re-rated by it.**
> - **Nothing real was involved:** no frame, no model file, no worker, no model server.

## 1. The M23.7 boundary, requirement by requirement

| Requirement | Expected evidence | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|---|
| An ordinary task captures no frame | Behavioural test | `domOnlyTaskPath.test.ts` A: all 14 capture, decode, model and worker counters stay at zero. It holds with a person's toolbar grant live, across a multi-turn task, on the side-panel route, with a canvas and an image on the page, and when the model is down | **behavioural** (simulated) | PASS | a real browser run |
| T1 is not loaded in product builds | Packaging assertion | `buildSeparation.test.ts`: the real `wxt.config.ts` hook, on a fake disk, packages no T1 and never stats or reads its path. M23.7's build output: no `t1-ui-head.onnx` (`w1-m23-7-product-build-inspection.json`). The offscreen chunk still names the file, behind the guard | **configuration executed**; **build output by name** | PASS | a build from a later commit |
| T1 inference is not invoked | Behavioural regression test | `domOnlyTaskPath.test.ts` B: no T1 fetch, no session, no inference, no ORT bootstrap. The only fetch is the reasoner | **behavioural** (simulated) | PASS | a real browser run |
| TR-01 is not invoked | Behavioural regression test | `domOnlyTaskPath.test.ts` C: no worker, no init, no frame, no canvas | **behavioural** (simulated) | PASS | a real browser run |
| DOM observation remains functional | Non-empty synthetic observation test | `domOnlyTaskPath.test.ts` D: every element with its role, name and state. An empty page and an unreadable tab are explicit non-results | **behavioural** (simulated page) | PASS | real pages (OD-D) |
| The structural reasoner handoff remains valid | Handoff construction test | D and E: a real verified handoff and the real request body. K: a vision-only detection stays out | **behavioural** (simulated); **integration** | PASS | a real model's answers |
| Click safety remains intact | Existing and focused regression tests | F, H and I below, plus the existing `d64Transport`, `orchestrator`, `loop`, `agent` and `plan` suites, all green | **behavioural** (simulated); **unit** | PASS | a real browser's event dispatch |
| Diagnostic hooks are understood | Static call-path audit | `diagnostic-hook-boundary-map.md`, plus `diagnosticHooks.test.ts`, which also runs the handlers | **static**; **behavioural** (simulated) | DONE: 8 findings. **No hook changed** | Chrome's delivery rules |
| Evidence-build functionality | Static inspection only; runtime unverified | `buildSeparation.test.ts` executes the configuration for each flag; `domOnlyTaskPath.test.ts` runs evidence-flagged wiring under fakes | **configuration executed**; **behavioural** (simulated) | Configuration and wiring hold. **Runtime UNVERIFIED** | whether an evidence build compiles or runs. See `evidence-build-preservation-assessment.md` |

**Do the zeroes mean anything?** Yes, because the same rig and the same checks fail when perception comes back:

| Control | What it does | What it shows |
|---|---|---|
| A regression double, no grant | `task-perception.ts` stops gating, in a product build | capture requested, T1 fetched, session created. `noPerceptionPassRan` and `noPerceptionRealmWasBuilt` fail, **while the task still reports CONFIRMED**, which is why only these checks catch it |
| The same double, with a grant | as above, plus a toolbar grant | frames, T1 inference and TR-01 frames are counted; the handoff claims `wasm` and tier T1; the floor checks fail |
| The evidence flag, with the real policy | `__EVIDENCE_BUILD__` true | the wiring evidence builds depend on is intact, and the same product checks do not hold |

No product source was changed or mutated for this. M23.7's mutation check against the old source stands on its own record.

## 2. Structural and security regressions

| Requirement | New test (`domOnlyTaskPath.test.ts` unless named) | Existing suites that also cover it |
|---|---|---|
| Non-empty DOM observation | D: "the handoff holds every DOM element…" | `packages/perception` |
| Structural handoff fields | D; E: "sends the approved structural fields and nothing else" | `packages/privacy/test/handoff.test.ts`; `packages/reasoner/test/localModel.test.ts` |
| DOM grounding | F: eight rejected plans, on a page with no fallback plan and on one with | `packages/plan` |
| Invalid reference rejection | F: an unissued reference and a real reference in the wrong field are `HOSTILE`, with **no fallback** | `packages/plan`, `packages/orchestrator/test/fill.test.ts` |
| Ambiguous reference handling | G: the person is asked before anything is sent; a decline stops the run; a page cannot read or answer the question | `packages/orchestrator/test/clarification.test.ts` |
| Click target eligibility | E: the decoder is offered only visible, enabled controls. F: a disabled control, a text field, an undeclared control and an off-screen control are not clicked | `oneClickAuthority.test.ts`; `d64Transport.test.ts` |
| Freshness validation | H: no structural observer; a page moving after REFRESH; a target removed while planning; a declared control renamed while planning | `packages/agent`; `structuralStaleness.test.ts` |
| Hit-testing | H: an overlay arriving while planning gets `DIFFERENT_ELEMENT`, and no click lands | `d64Transport.test.ts` C02, C05–C07, R1 |
| Postcondition verification | I: a click that changes nothing is `NOT_CONFIRMED` and stops the task; a result already true refuses the click | `packages/agent/test/verifyResult.test.ts`; `postconditions.test.ts` |
| Consent requirements | J: grant and panel routes, allow and deny; masked preview; only the panel may answer a consent; a page cannot answer a grant | `consent.test.ts` (both); `pageValueBoundary.test.ts` |
| Five-turn cap | I: five turns, five clicks, a sixth control untouched; budgets of 6, 0, 1.5 and `"5"` refused | `packages/orchestrator/test/loop.test.ts` |
| `sendVerified()` boundary | E: an off-machine destination is refused before any byte moves; a stored value in the goal stops at SANITIZE | `packages/egress/test/guard.test.ts` |
| No frame payload in the request | E: `structuralRequestProblems` is empty; no image marker, no value, no perception metadata; every message is text | `webpEgressBoundary.test.ts`; `productionFrameEgress.test.ts` |
| No T1 or TR-01 in ordinary tasks | A, B, C, and the negative controls | `domOnlyPhase1.test.ts` (static) |
| QG-04 safeguards | not re-tested here: `networkBoundary`, `productionFrameEgress`, `qg04`, `qg04Fallback`, `guard` all green and **unmodified**. **No gate is signed** | — |
| CSP, permissions, endpoint | `buildSeparation.test.ts`; `csp-product-phase.test.mjs` | `extensionCsp.test.ts` |

**Two behaviours these tests made explicit** (existing, recorded policy; not changed):
- **Fallback:** a plan the validator finds merely unusable (an unknown target, a disabled control, an unknown operation, a second click) is never executed, but the deterministic planner may then answer, through every gate (`packages/reasoner/src/fallback.ts`). So "refused" does not always mean "nothing happens next".
- **The goal:** a stored value typed into a goal stops the task at SANITIZE and nothing is sent. The person's own goal text is still echoed in the local run record (`record.goal`).

## 3. Vacuous assertions replaced

| Where | Before | After |
|---|---|---|
| `run-consent-task.mjs`, `run-declared-task.mjs` | `perception.every(...)`, which held for **any** run once the array became empty | `domOnlyTaskChecks` (`tests/browser/support/dom-only-checks.mjs`): 11 claims, including a non-empty first handoff, the structural floor, DOM sourcing, no vision-only element, and an approved structural request. **An empty run now fails 9 of them** |

The harnesses themselves cannot be run safely here (a real browser and a real model), so the claims are tested in isolation, against adversarial records and against real task records from the rig. **The harness edits are verified by static tests only; neither harness was run.**

## 4. The M13 CSP harness's product phase

**The assertion was extracted, not weakened.** `ortSmokeCheck` (`tests/browser/support/csp-product-phase.mjs`) is now what the harness calls. Its evidence branch is M13's condition unchanged. Its product branch is stricter than M23.7's, because it also requires `ok: false` and no `modelBytes` or `outputDims`.

| Tested | How |
|---|---|
| The product-phase condition | `csp-product-phase.test.mjs`: replies that should pass and replies that should not, including one where a model loaded |
| The real `ORT_SMOKE` handler satisfies it | `diagnosticHooks.test.ts`: product and evidence flags, with ORT replaced by a double. A regression that loads T1 fails it |
| ORT can be packaged without T1 | `buildSeparation.test.ts`; M23.7's build output, by name |
| Loopback hosts, CSP v2, no new endpoint or permission | `productManifestProblems`, against the manifest the real `wxt.config.ts` produces and against M23.7's built manifest |
| The harness still has its channel and evidence-phase checks | `csp-product-phase.test.mjs` (static) |

| **Unverified** | Why |
|---|---|
| Chrome enforcing this CSP on the M23.7 build; the channel attacks | they need a browser. The harness's evidence phase captures a frame and runs T1 and TR-01, so **it was not run** |
| The real ORT runtime bootstrapping under this CSP in the product build | ORT is a double here |
| The side-panel and offscreen-reload checks | they need a browser |

## 5. Verification

The commands, exit codes and counts are in `artifacts/experiments/M23.8-dom-only-boundary-assurance/decision.md`.
