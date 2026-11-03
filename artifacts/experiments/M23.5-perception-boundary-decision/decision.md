# M23.5 — decision record

**OD-R PREPARED: AWAITING OWNER APPROVAL.** Option A (a DOM-only Phase 1) is recommended for consideration. **Nothing is implemented or authorised.**

| Item | Status | Evidence |
|---|---|---|
| Three-option comparison (A, B, C) | **PREPARED** | `docs/acceptance/phase-1-perception-options-comparison.md` |
| Capture chain and frame consumers | **MAPPED:** confirmed product consumers listed; test-only entries return no pixels; U-1 narrowed, open | `docs/acceptance/frame-capture-and-consumer-map.md` |
| Fallback evidence | **inventoried** (present, not run); four future regression tests identified | `docs/acceptance/fallback-test-evidence-matrix.md` |
| Structural path end to end | **evidenced:** M20 benchmark, 6 bounded tasks, `detectorRan = 0` (W1, synthetic) | M20 records |
| OD-R recommendation | **PROPOSED — AWAITING OWNER APPROVAL: Option A** | `docs/acceptance/od-r-frame-capture-recommendation-PROPOSED.md` |
| ADR-0015 clauses for each OD-R outcome | **DRAFTED, not applied;** ADR-0015 stays PROPOSED | `docs/acceptance/adr-0015-od-r-clauses-PROPOSED.md` |
| OD-P | **SELECTED; implementation pending; T1 NOT disabled** | register |
| OD-O, OD-Q, OD-F, OD-N, GOV-01, OD-E1 | **AWAITING OWNER APPROVAL** | register |
| Source, tests, capture, TR-01, T1, packaging, schemas, CSP, permissions, egress, existing ADRs, gates, B-07 | **UNCHANGED** | git diff |

## Verification

`python scripts/verify-repo.py`, the documentation and governance check.
- **Result: exit 0; 0 failures, 0 warnings.**
- **`npm run verify` was not run:** its Python step runs the training loop on synthetic fixture frames.
- **No test suite was run;** tests were read as text.

**Nothing was loaded, captured or run:**
- no T1 or TR-01 model was loaded, read or hashed;
- no frame was captured;
- no inference, training, evaluation or prediction;
- no dataset or TEST.

**B-07 is BLOCKED and unchanged.**
