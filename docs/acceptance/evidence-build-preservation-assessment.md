# Evidence-build preservation assessment (M23.8, updated M23.9)

> **Status:** assessment at `740a245` (M23.8, 2026-11-04), updated for OD-S (M23.9). **§5 is the current position on the harnesses, and corrects §1.**
> - **No evidence build was made.** It would package the T1 asset, so neither M23.7, M23.8 nor M23.9 built one.
> - **Runtime preservation of evidence builds is UNVERIFIED.** What follows establishes what the configuration selects and what the wiring asks for, under fakes. It does not establish that an evidence build runs.
> - **No model file was loaded, read or hashed.**

## 1. What the configuration selects

`apps/extension/test/buildSeparation.test.ts` loads the real `wxt.config.ts` once per flag and runs its real `build:publicAssets` hook against a fake disk. So this is the configuration executed, not just read.

| Question | Finding | Evidence type |
|---|---|---|
| Does T1 remain packaged in evidence builds? | **Yes, for each of the five flags,** by path and without opening the file. A build with an evidence flag and no T1 file still refuses, as every build did before M23.7 | configuration executed |
| Is it absent from product builds? | **Yes.** The product hook never stats or reads the T1 path | configuration executed; M23.7 build output by name |
| Does TR-01 remain packaged with its integrity check? | **Yes, in both.** It hashes the bytes, refuses a mismatch (`Refusing to package it`) and refuses a missing file. The worker's `loadVerifiedModel` is unchanged (source) | configuration executed against synthetic bytes; source |
| Do the evidence aliases remain configured? | **Yes.** Each flag selects its own probe and no other | configuration executed |
| Do the diagnostic routes remain available? | **Yes, in source.** `PERCEIVE_ONCE` and `STREAM_CONSUME` are in every evidence build, and since M23.9 in no product build. `WORKER_FRAME` compiles in only with `M3_WORKER_FRAME=1`. `serveTr01Probe` resolves to the real probe only with `TR01_PROBE=1` | source; configuration executed |
| Do the CSP and permissions differ intentionally? | **Yes, and only as designed.** The CSP differs in `connect-src` alone (`'self' http://127.0.0.1:8995`). Permissions are identical. Host permissions gain `<all_urls>` only with `M3_WORKER_FRAME=1` | configuration executed |
| Do evidence-flagged tasks keep their perception pass? | **Yes, under fakes.** With the flag a task asks for a frame and loads T1; with a grant it runs T1 and TR-01 and declares the visual tier. Pixels stay local, and the model request is still structural | simulated extension (`domOnlyTaskPath.test.ts`) |

**Corrected M23.9.** At M23.8 `__EVIDENCE_BUILD__` was read only in `host/offscreen/main.ts`, so the product/evidence comparison of `background.js`, `content.js` and the manifest's route should have been unaffected. **M23.9 had to make `background.ts` read it,** because the hooks' senders are there. See §5.

## 2. What is not verified

- **That an evidence build compiles and runs after M23.7.** Not built.
- **That T1 loads and runs in an evidence build:** the session and inference were fakes. A real run would load T1, which is not authorised here.
- **That the bytes an evidence build would package are the expected T1.** No check exists (OD-O).
- **Any harness below.** None was run in M23.7 or M23.8.

## 3. Harnesses: what M23.7 changed for each (read, not run)

**"Evidence builds are unchanged" (M23.7) is true of builds with an evidence flag. It is not the whole story.** Two human-in-the-loop harnesses and one evaluation harness are defined on the *product* build, and M23.7 did not report the effect on them.

| Harness | Build | Uses | Effect of M23.7 | Status |
|---|---|---|---|---|
| `run-gesture-capture.mjs` (M4) | **product, by declaration.** Its guard only refuses `<all_urls>` and `captureVisibleTab` | mint, `consumeProbe`, `perceiveOnce` | **`theDetectorRanOnThePinnedArtifact` and `fusionJoinedDomAndVision` cannot pass on a product build.** Its gesture, mint, consume and worker-traffic checks are not affected | **needs a decision (OD-U).** A `TR01_PROBE=1` build would satisfy its guard, but its "product build" statement would then be false |
| `run-gesture-acts.mjs` (M5) | **product, by declaration,** same guard | tasks with perception | **`everyCaptureUsedTheStreamRoute` and `successPerceivedVisually` cannot pass:** a product task has no perception to read | **needs a decision (OD-U)** |
| `run-detector-eval.mjs` (M3.1) | whatever is built; its message says `npm run build` | `perceiveOnce` | on a product build it would report every target missed, not a refusal (hook finding F-6) | **not to be run:** detector evaluation is not authorised. Recorded so that no one reads an all-miss result as a measurement |
| `run-gesture-redaction`, `run-webp-loopback`, `run-artifact-verifier` | product, then `TR01_PROBE=1` | `perceiveOnce` on the evidence build | none expected | UNVERIFIED |
| `run-text-region-eval`, `run-extension-loop` | `M3_WORKER_FRAME=1` | `perceiveOnce`; tasks with perception | none expected: the flag keeps T1 and the task's pass | UNVERIFIED |
| `run-capture-determinism`, `run-stream-*`, `run-tr01-worker`, `run-visual-mask`, `run-structural-stale` | evidence flags | their probes | none expected | UNVERIFIED |
| `run-csp-negative` | product, then evidence | channel attacks; `ORT_SMOKE` | product-phase ORT check changed in M23.7; extracted and tested in M23.8. Evidence phase unchanged | **partly tested** (`dom-only-regression-matrix.md` §4); the harness itself not run |
| `run-consent-task`, `run-declared-task` | product | tasks | vacuous check replaced in M23.8 | checks tested; harness not run |
| `run-two-step-task`, `run-clarification-task`, `run-product-benchmark`, `run-product-smoke`, `run-sidepanel-smoke`, `run-dispatch-stress` | product | tasks | no check depends on perception. Their stale wording about a "no-gesture floor" is corrected in M23.8 | not run |

## 4. What would verify it

A separately authorised run: build with an evidence flag, then run an evidence harness. That loads T1 and captures frames, so it needs the owner's authorisation, and OD-O bears on which T1 file it may use.

## 5. What OD-S changed (M23.9): read, not run

**The M23.8 OD-S comparison said flagged harnesses were unchanged. It had not followed its own observation above to its consequence.**

| Harness | Effect of M23.9 | Status |
|---|---|---|
| `run-gesture-redaction`, `run-webp-loopback`, `run-artifact-verifier`, `run-capture-determinism`, `run-stream-j7`, `run-stream-re1` | **Each refuses unless both builds' `background.js` hashes match** (`routeIdenticalToProduct`). They cannot now match. Formal runs refuse before anything starts. `run-capture-determinism` has no dry-run path; the others' dry runs skip this check | **OD-V. Not changed.** INFERENCE that they differ, from source: no evidence build was compared |
| `run-gesture-capture` | declared on the product build; `consumeProbe` and `perceiveOnce` are gone from it, so it throws. A `TR01_PROBE=1` build would have both drivers and pass its guard | **OD-U. Not changed** |
| `run-gesture-acts` | none new | OD-U, as before |
| `run-detector-eval` | on a product build it now throws, rather than reporting every target missed | not authorised to run |
| `run-text-region-eval`, `run-extension-loop`, `run-tr01-worker`, `run-visual-mask`, `run-re1-product`, `run-structural-stale` | evidence flags, no worker comparison, drivers present | UNVERIFIED |
| `run-csp-negative`, `run-qg04-interception`, and the product task harnesses | no gated member used | not run |

**What was preserved, by source and test double only:** both hooks and all four drivers; their code (moved verbatim); sender checks; the gesture-grant requirement; stream ownership; TR-01's context and integrity checks; reply shapes (`apps/extension/test/diagnosticHooks.test.ts`).

**Still UNVERIFIED:** whether an evidence build compiles and runs after M23.9.
