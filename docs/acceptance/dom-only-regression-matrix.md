# DOM-only Phase 1 — regression and evidence matrix (M23.8, updated M23.9, M23.10, M23.11, M23.12, M23.13, M23.14)

> **Status:** what M23.8's tests establish about M23.7's boundary (M23.8, 2026-11-04, at `740a245` plus tests).
> - **What "behavioural" means here:** the real `background.ts`, `offscreen/main.ts`, task run, orchestrator, privacy boundary, execution gate and egress guard ran in Node under a fake `chrome`, with every capture, model and worker API counted (`apps/extension/test/support/simulatedExtension.ts`). **It is a model of a browser, not a browser.**
> - **Evidence type:** in the terms of `core-product-acceptance-PROPOSED.md` §4, all of this is **type A** (unit and integration). None of it is type B to H. **No browser ran. No acceptance criterion is approved or re-rated by it.**
> - **Nothing real was involved:** no frame, no model file, no worker, no model server.
> - **M23.14:** §11 adds OD-X. Real product build compared; not seen in a browser.
> - **M23.13:** §10 adds OD-W. Real product build inspected; not tried in a browser. That build is also the OD-T wording's first.
> - **M23.12:** §9 adds OD-T. Not rebuilt and not seen in a browser.
> - **M23.11:** §8 adds OD-U. Tests and a mutation check; neither harness was run.
> - **M23.10:** §7 adds OD-V. Tests and a mutation check; no harness was run.
> - **M23.9:** §6 adds OD-S. It is the one row here with a real build behind it. That build was made and read, not run.

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
| Diagnostic hooks are understood | Static call-path audit | `diagnostic-hook-boundary-map.md`, plus `diagnosticHooks.test.ts`, which also runs the handlers | **static**; **behavioural** (simulated) | DONE: 8 findings. **M23.8 changed no hook;** M23.9 implemented OD-S (§6) | Chrome's delivery rules |
| Evidence-build functionality | Static inspection only; runtime unverified | `buildSeparation.test.ts` executes the configuration for each flag; `domOnlyTaskPath.test.ts` runs evidence-flagged wiring under fakes | **configuration executed**; **behavioural** (simulated) | Configuration and wiring hold. **Runtime UNVERIFIED** | whether an evidence build compiles or runs. See `evidence-build-preservation-assessment.md` |

**Do the zeroes mean anything?** Yes, because the same rig and the same checks fail when perception comes back:

| Control | What it does | What it shows |
|---|---|---|
| A regression double, no grant | the build's gates stop gating (since M23.9 the double flips the flag, as the gate sits in `main.ts`; M23.8's mocked `task-perception.ts`) | capture requested, T1 fetched, session created. `noPerceptionPassRan` and `noPerceptionRealmWasBuilt` fail, **while the task still reports CONFIRMED**, which is why only these checks catch it |
| The same double, with a grant | as above, plus a toolbar grant (the double flips the flag, so its toolbar still grants) | frames, T1 inference and TR-01 frames are counted; the handoff claims `wasm` and tier T1; the floor checks fail |
| The evidence flag, with the real policy | `__EVIDENCE_BUILD__` true | the wiring evidence builds depend on is intact, and the same product checks do not hold |

No product source was changed or mutated for this in M23.8. M23.7's mutation check against the old source stands on its own record.

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

## 6. OD-S: the hooks absent from a product build (M23.9)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| `PERCEIVE_ONCE`, `STREAM_CONSUME` absent | no extension file of a real build names either (`w1-m23-9-product-build-inspection.json`). `buildSeparation.test.ts`: an in-memory product bundle names neither, and removing a gate makes the search find it | **real build output**; **bundle from source** | PASS | a run of that build |
| Their senders absent | all four drivers absent from the built worker; `diagnosticHooks.test.ts` names the control plane's members exactly | **real build output**; **behavioural** (simulated) | PASS, with one limit: the generic `toOffscreen` stays, names no kind, and finds no handler | — |
| Their handlers absent | each kind answered exactly as a kind nobody defined, from every sender of this extension | **real build output**; **behavioural** (simulated) | PASS | Chrome's delivery |
| Their controls absent | no control in the panel's code or page, or in any built panel file | **static**; **real build output** | PASS | — |
| No capture route reachable | no `CAPTURE_FRAME`, no `getUserMedia` call, no `chromeMediaSourceId`, no `grabFrame` in the build. With a live grant, nothing is minted or captured | **real build output**; **behavioural** (simulated) | PASS | a real browser |
| No frame or model operation through the hooks | all 14 counters stay at zero; ORT is not brought up | **behavioural** (simulated) | PASS | a real browser |
| TR-01 not reachable | the offscreen bundle has no way to start it. TR-01 stays packaged, with its hash check | **real build output**; **configuration executed** | PASS | — |
| Permissions, CSP, hosts | `manifest.json` byte-identical to the build before this milestone; `wxt.config.ts` not edited | **real build output**; `git diff` | UNCHANGED | — |
| Normal tasks | the 65 task-path tests pass; `content.js` and the panel are byte-identical. One expression changed on the task path, with an identical product result | **behavioural** (simulated); **real build output** | UNCHANGED | a real browser |
| Evidence: both hooks registered and routed | control plane members; each driver reaches its handler; the TR-01 probe keeps its context and drives a pass | **behavioural** (doubles) | PASS. **Runtime UNVERIFIED** | whether an evidence build compiles or runs |
| Evidence: invalid senders refused | another extension refused; only the offscreen document gets a ticket. **A content script is still accepted by both hooks (F-3), preserved** | **behavioural** (doubles) | PASS as stated | Chrome's delivery |
| Evidence: missing or invalid grants refused | no grant; a grant ended by navigation; a grant on another tab. Expiry is in `captureAuthority.test.ts`, unchanged | **behavioural** (doubles); **unit** | PASS | Chrome's `activeTab` |
| Evidence: invalid stream ids refused | **by the fake browser only.** The handler has no check of its own (F-4), and none was added | **behavioural** (doubles) | PASS as stated | whether Chrome refuses one (UNKNOWN) |
| Evidence: reply shapes unchanged | exact field lists and failure shapes | **behavioural** (doubles) | PASS | — |
| Evidence harnesses | **six refuse (OD-V)**; one cannot run on a product build (OD-U) | **static** | **NOT PRESERVED, by necessity. Reported.** *M23.10: resolved for the six, §7* | — |

Commands, exit codes and counts: `artifacts/experiments/M23.9-diagnostic-hook-isolation/decision.md`.

## 7. OD-V: the six harnesses' build contract (M23.10)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| Product and evidence workers may differ, and must | `build-separation.test.mjs` (1, D): passes when they differ, refuses when identical | **unit** (synthetic builds) | PASS | two real builds |
| Product hooks absent | the M23.9 inspection, run through the contract. Any one marker fails alone (6, 7). On the real M23.9 build: `boundaryProblems: []` | **unit**; **real build output** (product half only) | PASS | — |
| Evidence hooks registered | (3, 8): each required name, removed one at a time, fails. The names are tied to source | **unit**; **static** | PASS | **a real evidence bundle** |
| Evidence workers agree | (C): drift fails. The configuration and the worker's module graph support the expectation | **unit**; **configuration executed** | PASS on fixtures. **The real comparison is UNVERIFIED** | two real evidence builds |
| `content.js` guard | (4, 9): a modified file fails | **unit** | RETAINED | — |
| Manifest guard | (5, 10): a change in any field fails | **unit** | RETAINED | — |
| CSP, hosts and permissions outside the approved variation | (11): `<all_urls>`, a new permission, `tabCapture` removed, a changed `script-src`, a wider `connect-src` all fail | **unit** | RETAINED | Chrome's enforcement |
| Nothing unexamined reads as checked | (12): a missing build is a problem; a dry run is `DRY_RUN_NOT_EVIDENCE`. The real product build alone gets `NOT_EXAMINED` | **unit**; **real build output** | PASS | — |
| All six wired, with their own checks kept | `build-separation.test.mjs`, seven tests per harness, read as text | **static** | PASS | **a real run of any of them** |
| The checks catch regressions | 58 deliberate mutations, 58 caught (`w1-m23-10-mutation-check.json`) | **mutation** | PASS | — |
| OD-U harnesses not touched | not wired into the contract (test); no diff | **static**; `git diff` | UNCHANGED *(M23.10; see §8)* | — |

Commands, exit codes and counts: `artifacts/experiments/M23.10-evidence-harness-reconciliation/decision.md`.

## 8. OD-U: the two gesture harnesses (M23.11)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| Product build refused | the real product build: identity `PRODUCT`, refused | **real build output**, gate called directly; **unit** | PASS | — |
| Evidence build accepted by the selection logic | synthetic evidence builds | **unit** | PASS | **a real evidence build** |
| Missing artifacts fail closed | each missing file, and an empty directory | **unit** | PASS | — |
| Unknown identity fails closed | 14 disagreeing builds, each required name alone, and an unreadable manifest | **unit** | PASS | — |
| No automatic build | no child process or build command in either harness; no `process.env` in the contract | **static** | PASS | — |
| No browser on refusal | the gate runs first, unconditionally, read from both harnesses; a fake browser never starts | **static**; **unit** | PASS | — |
| Assertions preserved | both `checks` blocks pinned by SHA-256 to `20914f1`; 41 names | **static** | UNCHANGED | **whether they pass** |
| Output schema | record fields, `build` entries and file names | **static** | UNCHANGED | — |
| Grant and stream authority | each harness's sequence under a controlled gesture authority | **behavioural** (simulated) | PASS, those evaluated | a real browser |
| One contract | both harnesses call one function; identity agrees with `judgeBuildSeparation` | **static**; **unit** | PASS | — |
| Worker differences are not failures | no comparison in either harness; any worker's bytes accepted | **static**; **unit** | PASS | — |
| The six OD-V harnesses | no diff; they do not take this gate; their 73 tests pass | `git diff`; **static** | UNCHANGED | — |
| The checks catch regressions | 47 deliberate mutations, 47 caught | **mutation** | PASS | — |

Commands, exit codes and counts: `artifacts/experiments/M23.11-gesture-harness-isolation/decision.md`.

## 9. OD-T: the product's wording (M23.12)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| Exact toolbar title | the real `wxt.config.ts`, per flag | **configuration executed** | PASS | a real build; Chrome's display |
| Exact description and privacy explanation | the real panel code on a fake page; an in-memory product bundle | **behavioural** (fake DOM); **bundle from source** | PASS | real rendering |
| No stale wording in the product UI | manifest, page and bundle; the updated inspection fails the real previous build on all seven points | **configuration executed**; **bundle from source**; **real build output** (negative) | PASS | a new real build |
| Evidence wording scoped | five original messages kept in an evidence panel; none in a product bundle; the privacy sentence absent from an evidence panel | **behavioural** (fake DOM); **bundle from source** | PASS | an evidence build |
| The privacy sentence is true of a normal task | all 14 counters at zero with a grant live; structure-only request; no image marker | **behavioural** (simulated) | PASS | a real browser |
| It makes no visual-PII claim | the strings; a test | **unit** | PASS | — |
| Toolbar action and task behaviour unchanged | no diff in the worker, offscreen document or content script; the panel asks for the same things; DOM-only tests pass | `git diff`; **behavioural** (simulated) | UNCHANGED | a real browser |
| Permissions, CSP, packaging | per flag; the `<style>` hash against the last built manifest | **configuration executed** | UNCHANGED | — |
| The checks catch regressions | 23 deliberate mutations, 23 caught | **mutation** | PASS | — |

Commands, exit codes and counts: `artifacts/experiments/M23.12-product-ui-language/decision.md`.

## 10. OD-W: the product's toolbar (M23.13)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| Click opens the side panel | `sidePanel.open({ tabId })`, once; in the real minified listener | **behavioural** (simulated); **real build output** | PASS | **that Chrome opens it** |
| No grant | authority still has none, and reports `NO_GRANT`; no `.grant(` in the real listener | **behavioural** (simulated); **real build output** | PASS | — |
| No ticket, frame, T1, TR-01, offscreen work | all 14 counters at zero; no message sent | **behavioural** (simulated) | PASS | a real browser |
| Repeated clicks | five clicks start no task, session or run; a click during a task disturbs nothing | **behavioural** (simulated) | PASS | Chrome's own handling of a repeat |
| Missing tab | window used if there is one; otherwise reported, and nothing else | **behavioural** (simulated) | PASS | — |
| Panel API failure, with no capture fallback | rejected, thrown and absent API: reported; no grant, message or capture; a later click retries | **behavioural** (simulated) | PASS | a real failure |
| Within the user gesture | `open` called before the listener returns; nothing awaited first | **unit**; **static** | PASS | Chrome's gesture rule |
| Evidence toolbar | still grants, per tab; navigation still revokes; opens nothing | **behavioural** (doubles) | PRESERVED. **Runtime UNVERIFIED** | an evidence build |
| Keyboard shortcut | no command listener in source; `_execute_action` only | **static** | same route | whether Chrome treats it as a gesture |
| Expiry and revocation | `captureAuthority.test.ts` no diff and passing | **unit** | UNCHANGED | — |
| Permissions, hosts, CSP | identical to the previous real build; per flag in the config | **real build output**; **configuration executed** | UNCHANGED | — |
| The checks catch regressions | 24 deliberate mutations, 24 caught | **mutation** | PASS | — |

Commands, exit codes and counts: `artifacts/experiments/M23.13-toolbar-interaction/decision.md`.

## 11. OD-X: `captureStatus` in the panel (M23.14)

| Requirement | Actual evidence | Kind | Result | Not established |
|---|---|---|---|---|
| Product does not render it | given the real worker's reply, the Status box has no such key. The real panel chunk does not name it | **behavioural** (fake DOM); **real build output** | PASS | real rendering |
| Product does not render `NO_GRANT`, or any status value or placeholder | all five values, each absent | **behavioural** (fake DOM); **real build output** | PASS | — |
| Evidence renders it | exactly `JSON.stringify(reply, null, 2)` | **behavioural** (doubles) | PRESERVED. **Runtime UNVERIFIED** | an evidence build |
| Evidence values and updates | all five; follows the worker on each panel load | **behavioural** (doubles) | PRESERVED | an evidence build |
| Underlying status unchanged | the real worker is byte-identical to the previous build; `HOST_STATUS` still reports it | **real build output**; **behavioural** (simulated) | UNCHANGED | — |
| Other Status information | the same four fields; valid JSON; no gap; failure message kept | **behavioural** (fake DOM) | PASS | real rendering |
| OD-T wording | unchanged | **behavioural** (fake DOM) | PASS | — |
| Tasks and security | worker, offscreen chunk, content script and manifest byte-identical | **real build output** | UNCHANGED | a real browser |
| The checks catch regressions | 14 deliberate mutations, 14 caught | **mutation** | PASS | — |

Commands, exit codes and counts: `artifacts/experiments/M23.14-capture-status-scope/decision.md`.
