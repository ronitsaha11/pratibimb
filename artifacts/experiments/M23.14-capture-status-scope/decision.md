# M23.14 — decision record

**Verdict: OD-X IMPLEMENTED in product builds, after verification.** Not seen in a browser. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL, and acceptance criteria stay unapproved.

| Item | Status | Evidence |
|---|---|---|
| A product panel shows no `captureStatus`, no `NO_GRANT` and no placeholder | **DONE** | `captureStatusScope.test.ts`; the real build's panel chunk |
| The rest of the Status box | **KEPT:** four fields, valid JSON, no gap | same |
| Evidence panel | **PRESERVED,** in source and under fakes. Runtime **UNVERIFIED** | `captureStatusScope.test.ts` |
| Underlying status and authority | **UNCHANGED:** the real worker is byte-identical | `logs/w1-m23-14-product-build-comparison.json` |
| Toolbar, tasks, DOM observation, consent, grounding, click safety, five-turn cap, freshness, postconditions | **UNCHANGED:** the same bytes | same |
| `tabCapture`, `activeTab`, host permissions, CSP, loopback endpoint | **UNCHANGED:** `manifest.json` is byte-identical | same |
| OD-P, OD-R, OD-S, OD-T, OD-U, OD-V, OD-W | **remain completed** | register |
| OD-Y, OD-Z, the `activeTab` and `tabCapture` review, OD-N, GOV-01, OD-E1 | **not touched: awaiting the owner** | register |
| ADR-0015; existing ADRs; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-06)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Capture-status component tests: `captureStatusScope`, `productUiCopy` | the real panel code on a fake page; the real worker's reply | **0** | **51 passed** |
| Panel build-separation tests: `buildSeparation`, `product-build-inspection`, `build-separation`, `gesture-harness-gate` | the real config on a fake disk; an in-memory bundle with the **product's** flags; synthetic builds | **0** | **202 passed** |
| DOM-only and hook tests: `domOnlyPhase1`, `domOnlyTaskPath`, `diagnosticHooks`, `toolbarInteraction`, `captureAuthority` | as before | **0** | **179 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** | 156 files passed, 2 skipped; **3627 passed, 22 skipped** of 3649 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, three test files run, the file restored | **0** | **14 of 14 caught,** all restored (checksums) |
| `npm run build -w @pratibimb/extension` | `wxt build`, product flags. **Its hook reads and hashes TR-01, as the integrity check requires** | **0** | no T1 |
| `inspect-product-build.mjs --record <dir> --label m23-14` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `09a8754` |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.13 ended at 3595 passed. 3595 + 28 + 4 = 3627.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), any evidence build, any harness, and any browser.

## First-attempt failures and retries

**None.** The focused tests (253 of 253), typecheck, mutation check, full suite, product build and inspection all passed on the first attempt. `verify-repo.py` was run only once this record existed, so it would not fail on a missing README.

**No check was weakened.** One test title was reworded, because the Status box no longer shows the whole reply in a product.

## What did not happen

- **No model was loaded into a session.** The product build's own hook read TR-01's bytes, hashed them and copied the file into the output. That is the existing integrity check. Nothing else read or hashed a model. T1 was not read.
- **No frame was captured.** Every capture API is a counted fake.
- **No training, inference, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser, evidence build or harness ran.**
- **No change to:** capture authority, grant issuance, expiry or revocation, frame capture, `PERCEIVE_ONCE`, `STREAM_CONSUME`, hook routing, T1, TR-01, tasks, the toolbar, permissions, CSP, egress, branding, the manifest, any ADR or frozen specification. No gate was signed. B-07 was not touched.

## Labels

- **FACT:** the test, mutation and build results above; the real build's files as read and compared.
- **INFERENCE:** none needed. An evidence panel prints the original expression, by the source.
- **UNKNOWN:** how the Status box renders in Chrome; evidence-build runtime.

## Still pending, not resolved here

| ID | Item |
|---|---|
| **OD-Y** | branding terminology such as "PratiBimb minimal host" and "Development build". The Status box's place in a product overlaps this |
| **OD-Z** | remaining acceptance-document wording, including `BRW-04` and the Phase 1 capture description |
| **Permission review** | `activeTab` and `tabCapture`, which have no product user |

## Next

A person-run browser smoke, with its own authorisation.
