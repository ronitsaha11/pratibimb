# M23.10 — decision record

**Verdict: OD-V IMPLEMENTED in the six harness contracts.** No harness was run. Evidence-build runtime remains UNVERIFIED. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL.

| Item | Status | Evidence |
|---|---|---|
| OD-V: worker equality replaced in all six harnesses | **IMPLEMENTED** | `tests/browser/support/build-separation.mjs`; the six harnesses |
| OD-S | **remains implemented;** no product source changed | `git diff` |
| `content.js`, manifest route, permissions, host permissions, CSP comparisons | **RETAINED** | contract; `build-separation.test.mjs` |
| Each harness's own security, redaction, artifact, capture and stream checks | **RETAINED, not edited** | `README.md` §3; `git diff` |
| OD-U: `run-gesture-capture.mjs`, `run-gesture-acts.mjs` | **AWAITING OWNER; files not edited** | `git diff` |
| OD-T | **AWAITING OWNER** | register |
| ADR-0015; existing ADRs; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-04)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Six-harness contract: `build-separation.test.mjs` | synthetic builds; harnesses read as text | **0** | **73 passed** |
| Diagnostic-hook tests: `diagnosticHooks.test.ts` | the real worker and offscreen document under fakes | **0** | **49 passed** |
| Build-separation tests: `buildSeparation.test.ts`, `product-build-inspection.test.mjs` | the real config on a fake disk; an in-memory bundle with the **product's** flags | **0** | **52 passed** |
| DOM-only tests: `domOnlyPhase1`, `domOnlyTaskPath`, `dom-only-checks`, `csp-product-phase` | as before | **0** | **125 passed** |
| Static boundary tests: `networkBoundary`, `visualBoundary`, `coverageBoundary`, `extensionCsp`, `productionFrameEgress`, `webpEgressBoundary`, `captureAuthority` | source read; units | **0** | **72 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 151 files passed, 2 skipped; **3458 passed, 22 skipped** of 3480 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, the contract's tests run, the file restored | **0** | **58 of 58 caught,** all restored (checksums) |
| Contract's product half, on the existing M23.9 build | reads files; **builds nothing** | **0** | `boundaryProblems: []`; verdict `NOT_EXAMINED`, as it must be |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.9 ended at 3382 passed. 3382 + 73 + 3 = 3458.

**Not run, deliberately:**
- `npm run verify`: its `test:py` step runs the training loop on synthetic fixture frames.
- **Any evidence build, any build at all, and any of the six harnesses.**

## First-attempt failures and retries

A later pass does not cancel these. **The first attempt at the focused tests, the typecheck and the full suite all passed.**

| # | What | First result | Cause | Resolution |
|---|---|---|---|---|
| 1 | **First mutation run** | **exit 1,** `OSError: [Errno 22]` writing `run-stream-j7.mjs`, after 47 caught | the write **restoring** the file failed. Cause unconfirmed; most likely a brief Windows lock. **It left a mutation in the working tree:** that harness's content-and-manifest refusal line was missing | the suite caught it (1 failed, 72 passed). I put the line back and read the file's entire diff. The script now retries a write, and the run was repeated from the start: **58 of 58, every file confirmed by checksum.** Nothing was committed in that state |
| 2 | `verify-repo.py`, first run | **exit 1,** `M23.10-… has no README.md` | the experiment folder existed before its record did | written; **exit 0** |

**Two weak assertions of my own** were removed before the mutation run, on review: one tangled expression that always evaluated the same way, and one test that restated a value without proving anything.

**No check was weakened to reach a pass.** The one test deliberately changed is M23.9's pin of the old guard, which said it would flip when OD-V was decided.

## What did not happen

- **No model was loaded, read or hashed.** No build ran, so not even the build hook's TR-01 check ran. Model names in the fixtures are directories.
- **No frame was captured, and no real stream was consumed.**
- **No inference, training, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser ran, and no harness or gesture workflow ran.**
- **No runtime security behaviour changed.** No product source changed, including `PERCEIVE_ONCE`, `STREAM_CONSUME`, the gesture-grant authority, stream-id handling, sender validation, worker routing, TR-01, response structures, build separation, CSP, permissions, `tabCapture` and `wxt.config.ts`.
- **No owner decision was resolved by inference.** OD-U and OD-T are untouched.

## Labels

- **FACT:** the test and mutation results above; the configuration as executed; the worker's module graph with the product's flags; the existing product build as read.
- **INFERENCE:** that `TR01_PROBE=1` and `STRUCTURAL_PROBE=1` give identical workers; that all of part B's names survive into a real evidence bundle.
- **UNKNOWN:** whether an evidence build compiles and runs; whether any of the six passes end to end.

## Next

Owner decisions: OD-U and OD-T, then the ADR-0015 decisions. A real run of any of the six needs its own authorisation, and the first one tests the two inferences above.
