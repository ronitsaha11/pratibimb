# M23.11 — decision record

**Verdict: OD-U (Option B) IMPLEMENTED in the two harnesses, after the static and synthetic tests passed.** Neither harness was run. **Evidence-build runtime validation is outstanding.** ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL.

| Item | Status | Evidence |
|---|---|---|
| Both harnesses evidence-build-only, behind one fail-closed gate | **IMPLEMENTED** | `build-separation.mjs`; the two harnesses |
| The real product build is refused | **DONE,** gate called directly | `logs/w1-m23-11-real-product-build-refused.json` |
| All 41 checks, record fields and files | **UNCHANGED** (checks byte-identical to `20914f1`) | `gesture-harness-gate.test.mjs`; `README.md` §3 |
| OD-S and OD-V | **remain implemented;** the six harnesses have no diff | `git diff` |
| OD-T | **AWAITING OWNER;** no wording changed | register |
| ADR-0015; existing ADRs; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-04)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Harness-selection tests: `gesture-harness-gate.test.mjs`, `gestureHarnessAuthority.test.ts` | synthetic builds; a fake browser; harnesses read as text; the real worker and offscreen document under fakes | **0** | **70 passed** |
| Diagnostic-hook tests: `diagnosticHooks.test.ts` | as before | **0** | **49 passed** |
| Build-separation tests: `build-separation.test.mjs`, `buildSeparation.test.ts`, `product-build-inspection.test.mjs` | as before | **0** | **125 passed** |
| DOM-only tests: `domOnlyPhase1`, `domOnlyTaskPath`, `dom-only-checks`, `csp-product-phase` | as before | **0** | **125 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 153 files passed, 2 skipped; **3528 passed, 22 skipped** of 3550 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, the gate's tests run, the file restored | **0** | **47 of 47 caught,** all restored (checksums) |
| Gate on the real product build | reads files; **no harness, build, browser or server** | **0** | identity `PRODUCT`, refused |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.10 ended at 3458 passed. 3458 + 59 + 11 = 3528.

**Not run, deliberately:**
- `npm run verify`: its `test:py` step runs the training loop on synthetic fixture frames.
- **Either gesture harness, any other harness, and any build.**

`node --check` was used on both harnesses, to check syntax. It parses and does not execute.

## First-attempt failures and retries

A later pass does not cancel these. **The first attempt at the focused tests passed: 192 of 192.**

| # | What | First result | Cause | Resolution |
|---|---|---|---|---|
| 1 | Gate test file, after I rewrote one assertion | **Failed to parse;** the mutation script stopped, as it should, with "the tests do not pass before mutating" | my fix script wrote a literal line break into a string in the test | corrected; 59 passed |
| 2 | **First complete mutation run** | exit 0, but **46 of 47: one missed** | changing M4's description back to "The product build" was not caught: my test looked only for the old wording | added a check that each harness states its scope; **all 47 re-run, 47 caught** |

**One tangled assertion of my own** was rewritten on review, before the mutation run.

**No check was weakened to reach a pass.** Two pins that said OD-U was open were deliberately changed.

## What did not happen

- **No evidence build was made, and no browser or harness was run.** Chrome was not launched, and the fixture server did not start.
- **No frame was captured.**
- **No model was loaded, read or hashed:** no build ran, so not even the build hook's TR-01 check did. T1 and TR-01 are judged by file name, and are directories in the fixtures.
- **No inference, training, detector evaluation, prediction, ONNX export or dataset access: no TRAIN, DEV or TEST.**
- **No change to:** `tabCapture`, CSP, permissions, `PERCEIVE_ONCE`, `STREAM_CONSUME`, diagnostic-hook behaviour, authority checks, evidence-build security boundaries, the build architecture, `wxt.config.ts`, the six OD-V harnesses, any ADR, gate, FR-01 or B-07.
- **No toolbar or side-panel wording changed.** OD-T is untouched.

## Labels

- **FACT:** the test and mutation results above; the real product build's refusal; both `checks` blocks unchanged.
- **INFERENCE:** that a real evidence build satisfies `identifyBuild`. It rests on the configuration and partly measured names.
- **UNKNOWN:** whether an evidence build compiles and runs; whether either harness's 41 checks pass today.

## Documentation still describing these as product functionality (reported; OD-T and acceptance are not changed here)

| Where | What it says |
|---|---|
| The M4, M5 and M5.1 records | their bodies describe a product build, as was true then. **A dated note was added at each reproduction step.** Otherwise unedited |
| `core-product-acceptance-PROPOSED.md`, lines 25 and 129 (`BRW-04`) | "capture is gesture-authorised"; "Gesture-authorised capture works in each accepted browser" |
| `phase-1-architecture-scope.md`, line 37 | "Capture \| gesture-authorised" |
| `traceability-matrix.md`, line 23 | TR-01 "in the product perception pass" |
| Both harnesses' prompts | "PratiBimb: perceive this tab": the real toolbar title, which is OD-T |

**The acceptance criteria are the owner's,** and they stay PROPOSED. These lines should be read against OD-R, OD-S and OD-U when the owner next reviews them.

## Next

Owner decisions: OD-T, then the ADR-0015 decisions. Before any real run of either harness: its authorisation, and the overwrite risk in `README.md`, limitation 6.
