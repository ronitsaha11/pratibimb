# M23.17 — decision record

**Verdict: RD-5 AND RD-6 IMPLEMENTED in product builds, after verification.** Not run in a browser. No evidence build made. Not product acceptance, and no authority for a Chrome smoke test.

| Item | Status | Evidence |
|---|---|---|
| A product declares neither `tabCapture` nor `activeTab` | **DONE** | the real manifest; `logs/w1-m23-17-product-build-inspection.json` |
| Evidence builds' declarations | **PRESERVED:** generated manifests byte-identical, all five flags. Runtime **UNVERIFIED** | `logs/w1-m23-17-product-build-comparison.json` |
| The contract allows exactly that difference | **DONE,** and fails closed | `build-separation.test.mjs`, `csp-product-phase.test.mjs`, `gesture-harness-gate.test.mjs` |
| Tasks, DOM observation, T1 disablement, TR-01 exclusion, hooks, capture, grants, stream IDs, toolbar, `HOST_STATUS`, consent, grounding, the five-turn ceiling, freshness, postconditions, fail-closed, egress | **UNCHANGED:** all JavaScript and both pages byte-identical | comparison log |
| CSP, host permissions, connect-src, reasoner endpoint | **UNCHANGED** | same |
| ADRs, QG-04, gates, FR-01, B-07, the M23.16 report | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-06)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Manifest, contract and harness tests: `csp-product-phase`, `build-separation`, `gesture-harness-gate`, `product-build-inspection`, `buildSeparation`, `domOnlyPhase1`, `visualBoundary`, `permissionIsolation`, `diagnosticHooks` | synthetic builds; the real config on a fake disk; an in-memory bundle with the **product's** flags; harnesses read as text; the real worker under fakes | **0** | **353 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test. No browser, no model | **0** | 159 files passed, 2 skipped; **3717 passed, 22 skipped** of 3739 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, eight test files run, the file restored | **0** | **47 of 47 caught,** all restored (checksums) |
| `npm run build -w @pratibimb/extension` | `wxt build`, product flags. **Its hook reads and hashes TR-01, as the integrity check requires** | **0** | no T1 |
| `inspect-product-build.mjs --record <dir> --label m23-17` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `b48c069` |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.16 ended at 3668 passed. Per file: `build-separation` +15, `permissionIsolation` +11, `buildSeparation` +8, `csp-product-phase` +8, `gesture-harness-gate` +5, `product-build-inspection` +2. 3668 + 49 = 3717.

**The mutation run came before one later edit:** time limits on three new test groups, which changes no assertion. The full suite passed before and after it.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), any evidence build, any harness, and any browser.

## First-attempt failures and retries

| Step | First attempt | Cause | Resolution |
|---|---|---|---|
| Focused tests | exit 1: 351 of 353 | (a) `buildSeparation.test.ts:607`, an older test pinning equal permissions across flags, not in my initial list of pins. (b) My own test expected a capture request to leave every counter at zero, but the rig counts the attempt itself | (a) Now requires exactly the approved two. (b) Now asserts `captureRequests: 1` and nothing else. Second attempt exit 0 |
| Typecheck | exit 2 | `routeSurface` is not on the rig's control-plane type | a cast in the test. Second attempt exit 0 |
| Mutation check, full suite, product build, inspection, pin check, `verify-repo.py` | **passed first time** | — | — |

**One precaution, not a failure:** `permissionIsolation` boots real modules repeatedly, the pattern that timed out in M23.15, and the slowest new tests took 2 to 3 seconds. Those groups have a 30-second limit from the start.

**No check was weakened.** Tests that pinned four product permissions now pin two. `PERMISSIONS_DIFFER_FROM_PRODUCT` gave way to stricter codes.

## What did not happen

- **No model was loaded into a session.** The product build's own hook read TR-01's bytes, hashed them and copied the file into the output. That is the existing integrity check. Nothing else read or hashed a model. T1 was not read.
- **No browser frame was captured.** Every capture API in the tests is a counted fake.
- **No training, inference, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser, evidence build or harness ran. No Chrome.**
- **No product source changed:** `git diff` is empty under `apps/extension/host`, `apps/extension/host-lib` and `packages`.
- **QG-04 was not modified, and no gate was signed.** ADR-0015 was not approved or edited. FR-01 stays deferred and NOT AUTHORISED. B-07 stays blocked. Nothing was pushed, and no PR was opened.

## Labels

- **FACT:** the test, mutation and build results; the real build's files and the real config's output, as read and compared.
- **INFERENCE:** that Chrome runs the product correctly with neither permission (facts: no source path uses them; the real worker runs under fakes with the API absent).
- **UNKNOWN:** the current build in any real browser; evidence-build runtime; a real evidence build against the revised contract; Chrome's documented warning, as observed.

## Corrections to M23.16

The M23.16 report stands as written, as a record of what was then known. **Two of its statements turned out wrong:**

- It named `judgeBuildSeparation` as what removal would trip. **Each harness's own `sharedRouteIdenticalToProduct` would have too.**
- It said a search found neither check in the gesture harnesses, so they "appear unaffected". **They depend on `identifyBuild`, which held evidence manifests to the product's list.** The search looked in the wrong file.

## Still pending, not resolved here

| ID | Item |
|---|---|
| **RD-1** | worker `justification` |
| **RD-2** | Status box, including the fixed `NEEDS_USER` line |
| **RD-3, RD-4** | BRW-05, REL-03 |
| **RD-7** | three corrections to earlier documents |
| **RD-8** | the panel's turn budget |
| **RD-9, RD-10** | the order of work, and the Chrome smoke test |
| **ADR-0015's permission list** | names both. To update before OD-N |
| **GOV-01, OD-N, OD-E1 and the rest** | as in the register |

## Next

The owner's remaining decisions. A smoke test needs its own authorisation.
