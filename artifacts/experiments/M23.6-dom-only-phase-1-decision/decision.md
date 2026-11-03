# M23.6 — decision record

**OD-R: APPROVED — OPTION A: DOM-ONLY PHASE 1 (owner, 2026-11-03). SELECTED BY OWNER — IMPLEMENTATION NOT AUTHORISED.**

| Item | Status |
|---|---|
| OD-R | **SELECTED (Option A); not implemented** |
| OD-P | **SELECTED; not implemented** |
| ADR-0015 | **updated (§1, §3.1, §3.2, new §3.6, §6, §7, §8; version 1.1); PROPOSED — AWAITING OWNER APPROVAL.** Not approved, adopted or merged |
| Existing ADRs (0001–0014), constitution, gates, invariants, blockers | **UNCHANGED** |
| Acceptance criteria and classifications | **all PROPOSED — AWAITING OWNER APPROVAL** |
| Brief visual requirements (Deliverables 1, 2) | **not fulfilled by Phase 1;** deferred (P2-08, OD-K2); the brief is unchanged |
| Runtime (frame capture, T1, TR-01, packaging, CSP, permissions, egress, `sendVerified`, schemas, fallback) | **UNCHANGED** |
| Evidence builds | **unchanged; out of scope** |
| Model assets | **not touched** |
| B-07 / FR-01 | **BLOCKED / DEFERRED — NOT AUTHORISED; unchanged** |
| Still awaiting the owner | OD-O, OD-Q, OD-F, OD-N, GOV-01, OD-E1, OD-K, OD-L, OD-M; OD-A to OD-D, OD-G; OD-H; OD-E2 to OD-E8 |

## Verification

`python scripts/verify-repo.py`, the documentation and governance check.
- **Result: exit 0; 0 failures, 0 warnings.**
- **`npm run verify` was not run.**

**Nothing was loaded, captured or run:**
- no model was loaded or hashed;
- no frame was captured;
- no inference, training, evaluation, dataset or TEST access.
