# M23.12 — decision record

**Verdict: OD-T IMPLEMENTED, after verification.** The approved wording is in the manifest and a product panel. Not rebuilt and not seen in a browser. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL, and all Phase 1 acceptance criteria await approval.

| Item | Status | Evidence |
|---|---|---|
| Exact toolbar title, description and privacy explanation | **DONE** | `productUiCopy.test.ts`; `buildSeparation.test.ts` |
| Product panel has no capture field; evidence panel keeps it, with its words | **DONE** | same |
| The privacy sentence is true of a normal task | **CHECKED** under a simulated extension | `productUiCopy.test.ts` |
| No claim about visual PII | **HELD,** by test | same |
| Task behaviour, toolbar action, permissions, `tabCapture`, CSP, hosts, packaging, hooks, TR-01, T1, `sendVerified()`, consent, grounding, click-only, five-turn cap, freshness, postconditions | **UNCHANGED** | no diff in that code; DOM-only tests pass |
| OD-S, OD-U, OD-V | **remain completed** | register |
| ADR-0015; existing ADRs; gates; FR-01 (deferred, unauthorised); B-07 (blocked) | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-04)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| UI-copy tests: `productUiCopy.test.ts` | the real panel code on a fake page; the simulated extension | **0** | **23 passed** |
| Build separation and inspection: `buildSeparation.test.ts`, `product-build-inspection.test.mjs` | the real config on a fake disk; an in-memory bundle with the **product's** flags; a synthetic build | **0** | **62 passed** |
| Component tests: `consent`, `clarification`, `declaredTask`, `taskTimings` | as before | **0** | **76 passed** |
| Harness contracts: `build-separation`, `gesture-harness-gate`, `gestureHarnessAuthority` | as before | **0** | **143 passed** |
| Diagnostic hooks and DOM-only: `diagnosticHooks`, `domOnlyPhase1`, `domOnlyTaskPath` | as before | **0** | **132 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test | **0** on retry (see below) | 154 files passed, 2 skipped; **3561 passed, 22 skipped** of 3583 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, three test files run, the file restored | **0** | **23 of 23 caught,** all restored (checksums) |
| Inspection of the product build already on disk | reads files; **builds nothing** | **1, the expected result** | fails on all seven wording points |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.11 ended at 3528 passed. 3528 + 23 + 7 + 3 = 3561.

**Not run, deliberately:**
- `npm run verify`: its `test:py` step runs the training loop on synthetic fixture frames.
- **A product build:** its hook reads and hashes TR-01, and none was asked for here. **Any evidence build, any harness, and any browser.**

`node --check` was used on the three edited harnesses. It parses and does not execute.

## First-attempt failures and retries

A later pass does not cancel this. **The first attempt at the focused tests (282 of 282) and the typecheck passed.**

| # | What | First result | Cause | Resolution |
|---|---|---|---|---|
| 1 | **Full `npx vitest run`** | **exit 1:** 1 failed, 3560 passed. `coverageBoundary.test.ts`: "a new extension source file must be added…" | the repository requires every new source file to be declared as tested or browser-only, and I had not declared `host-lib/product-copy.ts`. My focused runs did not include that test | listed as tested, since tests import it directly; **retry exit 0** |

**No check was weakened to reach a pass.** Fixtures in three test files were updated, because a synthetic product build must now carry the approved wording. One expectation flipped as intended: the panel no longer asks for the toolbar gesture.

## What did not happen

- **No model was loaded, read or hashed:** no build ran, so not even the build hook's TR-01 check did.
- **No frame was captured.** `getUserMedia` and every capture API are counted fakes.
- **No training, inference, detector evaluation, prediction, ONNX export or dataset access. No TEST.**
- **No browser, build or evidence workflow ran.**
- **No change to:** perception or reasoning code, model packaging, permissions, CSP, frame egress, any ADR or frozen specification. No quality gate was signed.

## Labels

- **FACT:** the test and mutation results above; the manifest the real configuration produces; the previous real build, as read.
- **INFERENCE:** that a rebuild would pass the inspection. It rests on the configuration and the in-memory bundle.
- **UNKNOWN:** how the wording renders in Chrome; whether Chrome displays the shortcut text; evidence-build runtime.

## Raised for the owner, not decided

1. In a product build the toolbar button now has no visible effect. It records a grant nothing uses, and `tabCapture` has no product user.
2. The Status box prints a raw `captureStatus` key, a technical readout rather than a claim.
3. "PratiBimb minimal host", "Development build" and the manifest name "(experiment — not the product)" are outside OD-T, and remain.
4. `BRW-04` and the scope's "Capture: gesture-authorised" still read as product capability (M23.11).

## Next

A rebuild, then a person-run browser smoke, each with its own authorisation. Then the ADR-0015 decisions.
