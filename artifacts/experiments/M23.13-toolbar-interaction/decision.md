# M23.13 — decision record

**Verdict: OD-W IMPLEMENTED in product builds, after the tests and the product build passed.** Not tried in a browser. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL, and all acceptance criteria stay unapproved.

| Item | Status | Evidence |
|---|---|---|
| Product toolbar opens the side panel | **DONE:** in source, under fakes, and in a real bundle. Not in a browser | `toolbarInteraction.test.ts`; `logs/w1-m23-13-product-build-inspection.json` |
| No grant, ticket, frame, T1, TR-01 or offscreen work from it, including after a failure | **DONE** | same |
| Repeated clicks start nothing | **DONE,** under fakes | same |
| Evidence toolbar | **PRESERVED,** in source and under fakes. Runtime **UNVERIFIED** | `toolbarInteraction.test.ts` |
| Keyboard shortcut | **Same event, by source. No extra decision needed** | `README.md` §2 |
| `tabCapture`, permissions, hosts, CSP | **IDENTICAL** to the previous real build | `logs/w1-m23-13-manifest-comparison.json` |
| Side-panel layout, OD-T wording, consent, tasks, DOM observation, reasoning, click-only, five-turn cap, freshness, postconditions | **UNCHANGED:** no diff in the panel, offscreen document, content script or packages | `git diff`; tests |
| OD-P, OD-R, OD-S, OD-T, OD-U, OD-V | **remain completed** | register |
| ADR-0015; existing ADRs; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-06)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Toolbar tests: `toolbarInteraction.test.ts` | the real worker and offscreen document under fakes | **0** | **29 passed** |
| Side-panel components: `productUiCopy`, `consent`, `clarification`, `declaredTask`, `taskTimings` | as before | **0** | **99 passed** |
| Evidence behaviour with fakes: `diagnosticHooks`, `gestureHarnessAuthority`, `captureAuthority` | as before | **0** | **79 passed** |
| Build separation, inspection, harness contracts | the real config on a fake disk; an in-memory bundle with the **product's** flags; synthetic builds | **0** | **198 passed** |
| DOM-only and static boundaries | as before | **0** | **118 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 155 files passed, 2 skipped; **3595 passed, 22 skipped** of 3617 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, three test files run, the file restored | **0** | **24 of 24 caught,** all restored (checksums) |
| `npm run build -w @pratibimb/extension`, twice: before the commit, then from it | `wxt build`, product flags. **Its hook reads and hashes TR-01, as the integrity check requires** | **0, 0** | no T1 |
| `inspect-product-build.mjs --record <dir> --label m23-13` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `59f4282` |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.12 ended at 3561 passed. 3561 + 29 + 3 + 1 + 1 = 3595.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), any evidence build, any harness, and any browser.

## First-attempt failures and retries

A later pass does not cancel these. **The typecheck passed first time.**

| # | What | First result | Cause | Resolution |
|---|---|---|---|---|
| 1 | **Focused tests** | **exit 1:** 1 failed, 398 passed. The product bundle's listener "matched" a capture reference | checked before assuming: **the code was right.** esbuild joins the following statements with commas, so my test's slice ran on into the next listener and found `capture.revoke` | slice corrected; passed |
| 2 | My first attempt at that one-line fix | an assertion failed in my script, so the fix did not apply, and the focused tests failed again the same way | a shell heredoc mangled the backslashes in it | done from a script file |
| 3 | Console output of the toolbar title | showed `�` in place of the em dash | checked the bytes, because a corrupted title would have been a defect: **the manifest holds exactly the approved string, UTF-8 `E2 80 94`.** Only the console could not display it | no change needed |

**No check was weakened to reach a pass.** 12 product tests were changed to hold a grant directly, since a click no longer makes one: they keep their claim and would otherwise have silently lost it. Two pins of the old toolbar behaviour were changed deliberately.

## What did not happen

- **No model was loaded into a session.** The product build's own hook read TR-01's bytes and hashed them, in each of the two builds, and copied the file into the output. That is the existing integrity check. Nothing else read or hashed a model. T1 was not read.
- **No frame was captured.** Every capture API is a counted fake.
- **No training, inference, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser, evidence build or harness ran.**
- **No change to:** T1, TR-01, model packaging, diagnostic-hook isolation, `tabCapture`, permissions, CSP, egress code, `wxt.config.ts`, any ADR or frozen specification. No gate was signed. B-07 was not touched.

## Labels

- **FACT:** the test, mutation and build results above; the real bundle and manifest as read.
- **INFERENCE:** that `Alt+Shift+P` reaches this handler, from the source and from what `_execute_action` is documented to do.
- **UNKNOWN:** whether Chrome opens the panel from this click or the shortcut; evidence-build runtime.

## Still pending, not resolved here

| ID | Item |
|---|---|
| **OD-X** | the visible `captureStatus` field in the Status box. In a product it now always reads `NO_GRANT` |
| **OD-Y** | branding terminology such as "PratiBimb minimal host" and "Development build" |
| **OD-Z** | remaining acceptance-document wording, including `BRW-04` and the Phase 1 capture description |

**Raised, not decided:** `tabCapture` and `activeTab` now have no product user, and the capture authority is idle in a product.

## Next

A person-run browser smoke, with its own authorisation: it is the only way to show that the panel opens.
