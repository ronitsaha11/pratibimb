# M23.15 — decision record

**Verdict: OD-Y and OD-Z IMPLEMENTED, as far as existing owner approvals permit, after verification.** Not seen in a browser. **No classification is approved.** ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL. PratiBimb is not declared release-ready.

| Item | Status | Evidence |
|---|---|---|
| Extension name, panel title and heading, offscreen title | **DONE:** PratiBimb — Page Assistant (Development build) | `productIdentity.test.ts`; the real build's files |
| Toolbar title, description, privacy explanation | **UNCHANGED** (OD-T wording) | same |
| Development warning, synthetic-goal text | **KEPT:** true | same |
| Evidence-build wording, package names, source comments, the worker's `justification` | **KEPT** | same |
| `BRW-04` | **DONE:** DOM-only. Class M (proposed) and status PARTIAL unchanged. No cross-browser claim | `acceptanceDocuments.test.ts` |
| Phase 1 capture wording | **DONE:** normal tasks described; evidence diagnostics separate | same |
| Deliverable mapping | **DONE:** `traceability-matrix.md` §1.6 | same |
| 59 criteria, P2-01 to P2-08, historical records | **RETAINED** | same |
| Tasks, DOM observation, consent, grounding, clicks, five-turn cap, freshness, postconditions, fail-closed, egress, hooks, toolbar, status | **UNCHANGED:** all JavaScript byte-identical | `logs/w1-m23-15-product-build-comparison.json` |
| `tabCapture`, `activeTab`, host permissions, CSP, loopback endpoint | **UNCHANGED:** the manifest differs in `name` alone | same |
| ADR-0015; existing ADRs; frozen specifications; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-06)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Product-copy and identity tests: `productIdentity`, `productUiCopy`, `captureStatusScope` | static reads; the real panel code on a fake page | **0** | **66 passed** |
| Acceptance-document tests: `acceptanceDocuments` | the living documents, read as text | **0** | **22 passed** |
| Build-separation tests: `buildSeparation`, `product-build-inspection`, `build-separation`, `gesture-harness-gate` | the real config on a fake disk; an in-memory bundle with the **product's** flags; synthetic builds | **0** | **206 passed** |
| DOM-only and hook tests: `domOnlyPhase1`, `domOnlyTaskPath`, `diagnosticHooks`, `toolbarInteraction`, `captureAuthority` | as before | **0** | **179 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 158 files passed, 2 skipped; **3668 passed, 22 skipped** of 3690 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, four test files run, the file restored | **0** | **40 of 40 caught,** all restored (checksums) |
| `npm run build -w @pratibimb/extension` | `wxt build`, product flags. **Its hook reads and hashes TR-01, as the integrity check requires** | **0** | no T1 |
| `inspect-product-build.mjs --record <dir> --label m23-15` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `13d0447` |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.14 ended at 3627 passed. 3627 + 15 (`productIdentity`) + 22 (`acceptanceDocuments`) + 3 (`buildSeparation`) + 1 (`product-build-inspection`) = 3668.

**The product build was needed:** the manifest's name and the pages' titles exist only in a real build. It was built from `13d0447`, the commit holding the source.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), any evidence build, any harness, and any browser.

## First-attempt failures and retries

| Step | First attempt | Cause | Resolution |
|---|---|---|---|
| Focused tests | exit 1: 261 of 263 | (a) the false-claim scan matched this milestone's own disclaimer line, which lists those claims in order to deny them. (b) The register's M23.15 section did not exist yet | (a) That one line is excluded, and a new test pins its exact text and that it occurs once. (b) The section was written. Second attempt exit 0 |
| Mutation check | stopped at the 19th mutation | the script's own uniqueness check: its target appears twice. No result was lost, and every file was restored | target tightened; a preflight added; rerun **from the start**. A first repair of the script failed on shell escaping, before any mutation ran |
| Full suite | **exit 1, twice:** 2 failed, 3666 passed. Also failed with the two new test files excluded (1 failed) | two M23.14 tests in `captureStatusScope.test.ts` timed out at the 5s default. Each boots the real worker and offscreen modules three times on a fresh module graph. Alone, the file passed 3 of 3 runs, those tests at about 0.5s and 0.9s. **INFERENCE:** parallel load, since M23.14's own full run passed them. Two unhandled `chrome is not defined` rejections were the timed-out tests running on after teardown | **those two tests get a 30s limit. No assertion changed.** Not rerun until green: two consecutive full runs then passed, exit 0 |
| Comparison script | reported all files changed | a bug in the script's parsing of its own snapshot file | fixed; rerun. The first output was discarded |

**No check was weakened.** One scan excludes one line, whose exact text is now pinned. Two tests have a longer time limit.

## What did not happen

- **No model was loaded into a session.** The product build's own hook read TR-01's bytes, hashed them and copied the file into the output. That is the existing integrity check. Nothing else read or hashed a model. T1 was not read.
- **No browser frame was captured.** Every capture API in the tests is a counted fake.
- **No training, inference, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser, evidence build or harness ran.**
- **No change to:** task execution, DOM observation, T1 disablement, TR-01 exclusion, diagnostic hooks, the toolbar interaction, the `captureStatus` rule, `tabCapture`, `activeTab`, evidence-build behaviour, CSP, host permissions, `sendVerified()`, the loopback endpoint, consent, grounding, click eligibility, the five-turn cap, freshness, postconditions or fail-closed behaviour.
- **No ADR or frozen specification was modified.** GOV-01 and the 51 proposed-mandatory classifications are not approved. QG-04-S and QG-04-F are not signed. FR-01 stays deferred and unauthorised. B-07 stays blocked. Nothing was pushed, and no PR was opened.

## Labels

- **FACT:** the test, mutation and build results above; the real build's files as read and compared; the documents as read.
- **INFERENCE:** the timeouts were caused by parallel load (facts: they pass alone, and fail only in a full run).
- **UNKNOWN:** how the name and heading render in Chrome; whether Chrome shows the `justification` anywhere; evidence-build runtime; whether the current build works in a real browser.

## Still pending, not resolved here

| ID | Item |
|---|---|
| **Permission review** | `activeTab` and `tabCapture`, which have no product user |
| **Status box** | its place in a product, as a developer readout. OD-Y did not decide it |
| **Worker `justification`** | keeps the old text. A one-line owner decision, which would change the worker's bytes |
| **`BRW-05`, `REL-03`** | re-scoping them, if the owner wishes (§5.14) |
| **GOV-01 and the 51 classifications** | all Phase 1 acceptance criteria |
| **OD-O, OD-Q, OD-F, OD-N, OD-E1, OD-K, OD-L, OD-M, OD-A to OD-D, OD-G, OD-H, OD-E2 to OD-E8** | as in the register |
| **Gesture harness logs** | a real run of the gesture harnesses overwrites the tracked M4 and M5 logs (raised in M23.11) |

## Next

A person-run browser smoke, with its own authorisation.
