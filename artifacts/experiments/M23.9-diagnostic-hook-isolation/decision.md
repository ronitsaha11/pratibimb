# M23.9 — decision record

**Verdict: OD-S, OPTION B, IMPLEMENTED IN PRODUCT BUILDS.** A real product build contains neither diagnostic hook. Not browser-verified, not accepted. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL.

| Item | Status | Evidence |
|---|---|---|
| Hooks, senders, handlers and controls absent from a product build | **DONE** | real build inspection, `problems: []`; `buildSeparation.test.ts`; `diagnosticHooks.test.ts` |
| No capture route, frame or model operation through the hooks | **DONE** | real build output; all 14 counters at zero under fakes |
| Evidence build: both hooks, sender checks, grants, stream authority, TR-01 context, reply shapes | **PRESERVED in source and under test doubles.** Runtime **UNVERIFIED**: none was built | `diagnosticHooks.test.ts` |
| Normal DOM-only tasks | **UNCHANGED** (one expression on the path, same product result) | 65 task-path tests; `content.js` and the panel byte-identical |
| `tabCapture`, permissions, hosts, CSP, loopback endpoint | **UNCHANGED** | `manifest.json` byte-identical; `wxt.config.ts` not edited |
| Gesture authority, stream-id ownership, TR-01 implementation and integrity checks, egress | **NOT EDITED** | `git diff` |
| **Evidence harnesses** | **SIX NOW REFUSE (OD-V); one cannot run on a product build (OD-U). Not changed** | `README.md` §6 |
| OD-T, OD-U, OD-V | **AWAITING OWNER APPROVAL** | register |
| ADR-0015, existing ADRs, gates, FR-01, B-07 | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-04)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Diagnostic-hook tests: `diagnosticHooks.test.ts` | the real worker and offscreen document under fakes | **0** | **49 passed** |
| Build-separation tests: `buildSeparation.test.ts`, `product-build-inspection.test.mjs` | the real config on a fake disk; an in-memory product bundle from source; a synthetic build | **0** | **49 passed** |
| DOM-only boundary tests: `domOnlyPhase1`, `domOnlyTaskPath`, `dom-only-checks`, `csp-product-phase` | as M23.7 and M23.8 | **0** | **125 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 150 files passed, 2 skipped; **3382 passed, 22 skipped** of 3404 |
| `npm run build -w @pratibimb/extension` | `wxt build`, product flags. **Its own hook reads and hashes TR-01, as the integrity check requires** | **0** | see below |
| `node tests/browser/extension/inspect-product-build.mjs --record <dir> --label m23-9` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `712465e` |
| `npm run pin:check` | hashes the ORT runtime files in `node_modules`, **not a model** | **0** | ORT pin OK |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.8 ended at 3343 passed. 3343 + 39 net new (`diagnosticHooks` +26, `buildSeparation` +10, inspection +3) = 3382.

**`verify-repo.py`:** an earlier run, before this file existed, also exited 0, with one warning for the missing `decision.md`.

**Not run, deliberately:**
- `npm run verify`: its `test:py` step runs the training loop on synthetic fixture frames.
- Any evidence build, or any browser harness.

## First-attempt failures and retries

A later pass does not cancel these. **The first attempt at the focused tests, the typecheck and the full suite all passed.**

| # | What | First result | Cause | Resolution |
|---|---|---|---|---|
| 1 | **Rebuild from the source commit** | **exit 1**, after 233 ms: `EBUSY: resource busy or locked, rmdir '…\.output\chrome-mv3'` | **My mistake.** An earlier command had `cd`-ed into that directory, and the shell's working directory was still there, so Windows would not remove it. The build stopped before writing anything | moved out and retried: **exit 0** |
| 2 | **The two steps that ran after that failure, in the same command** | a "byte-identical" line, and an inspection record naming `712465e` | Both read the **earlier, pre-commit build:** the comparison compared that build with itself, and the record's commit was wrong (its build time, 12:27:03Z, preceded the commit, 12:27:58Z). **Neither was valid** | **record overwritten** after the retry, which also checked that the output was rewritten and is newer than the commit. Built at 12:28:38Z; the comparison, re-run, did hold |
| 3 | An inspection command early on | `sed: can't read …` | the same carried working directory; it read nothing and changed nothing | re-run from the root |

Three builds were attempted: one pre-commit (exit 0), the failure above, and the retry (exit 0). The two that completed gave byte-identical text files.

**No check was weakened to reach a pass.** M23.8's tests that pinned "both hooks ship in every build" and the hooks' behaviour on a product build were deliberately changed, as that comparison said they would be: the behaviour is now asserted under the evidence flag, and absence under the product's.

## What did not happen

- **No model was loaded:** no inference session was created, for T1, TR-01 or anything else. **The product build's own hook read TR-01's bytes and hashed them, in each of the two completed builds, and copied the file into the output.** That is the existing integrity check, which the brief asked to confirm. Nothing else read or hashed a model file: the tests use synthetic bytes, and the inspection opens none. T1 was not read.
- **No frame was captured.** `getUserMedia`, `ImageCapture` and the worker were counted fakes.
- **No inference, training, detector evaluation, prediction, ONNX export or dataset access.**
- **No TEST** was planned, seeded, generated or built.
- **No browser ran, and no evidence build was made.** The in-memory bundle test uses the product's flags only.
- **No change to:** `tabCapture`, permissions, CSP, egress code, the gesture-grant authority, stream-id ownership, TR-01's implementation or integrity checks, `wxt.config.ts`, any ADR, gate, security invariant, FR-01 or B-07.
- **No owner decision was resolved by inference.** OD-T and OD-U are untouched, and OD-V is new and open.

## Labels

- **FACT:** the test, build and inspection results above, on W1; the source and the build output as read.
- **INFERENCE:** that the six harnesses will refuse. It rests on `background.ts` reading the flag and on their guards as read. No evidence build was compared, and none was run.
- **UNKNOWN:** whether an evidence build compiles and runs after M23.9; whether Chrome behaves as the fakes assume, including refusing an unminted stream id; the product build's real behaviour, since it was built and read and not run.

## Next

Owner decisions: **OD-V**, then OD-T, OD-U and the ADR-0015 decisions. A person-run smoke needs its own authorisation (`docs/acceptance/dom-only-browser-smoke-procedure-PROPOSED.md`).
