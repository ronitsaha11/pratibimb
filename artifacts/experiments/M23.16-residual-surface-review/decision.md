# M23.16 — decision record

**Verdict: REVIEW COMPLETE. Nothing decided.** The owner's decisions are RD-1 to RD-10 in `docs/acceptance/residual-product-surface-decision-report-PROPOSED.md`. This is not product acceptance or browser validation.

## Verification (W1, 2026-11-06)

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Acceptance and identity tests: `acceptanceDocuments`, `productIdentity` | documents and source read as text; the real panel code on a fake page | **0** | **37 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test. No browser, no model | **0** | 158 files passed, 2 skipped; **3668 passed, 22 skipped** of 3690 |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The test count is M23.15's: no test was added or changed.**

**First-attempt failures:** none in these commands. Four citations in the draft report were corrected after a spot check against the sources, before any commit.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), `npm run reasoner:check`, any build, any evidence build, any harness, and any browser.

## What did not happen

- **No product source, UI string, test, acceptance criterion, classification, permission, CSP or egress code changed.** The existing build's files still match M23.15's recorded hashes, and no build ran.
- **No model was loaded, opened or hashed.** The reasoner's model file and runtime binary were checked for existence only. T1 and TR-01 were not read.
- **No browser frame was captured. Chrome was not launched.** No extension was loaded, and no page was interacted with.
- **No training, inference, detector evaluation, ONNX export or dataset access. No TEST.**
- **No owner decision changed.** The register was not edited. No gate was signed. ADR-0015 stays PROPOSED. FR-01 stays deferred and NOT AUTHORISED. B-07 stays blocked, and its evaluation was not attempted.
- **Nothing was pushed, and no PR was opened.**

## Labels

- **FACT:** what the source, the existing build's text and the documents say, as read.
- **INFERENCE:** the effect of removing `HOST_STATUS` or a permission; the proposed order of work. Each is marked in the report.
- **UNKNOWN:** whether Chrome displays `justification`; Chrome's documented warnings as observed; whether a page can force a verification failure; the current build's behaviour in any browser.

## Next

The owner's decisions. A smoke test needs its own authorisation.
