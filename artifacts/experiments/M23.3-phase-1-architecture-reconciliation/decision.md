# M23.3 — decision record

**PHASE 1 ARCHITECTURE TRACED FROM SOURCE; ADR-0015 PROPOSED — AWAITING OWNER APPROVAL.**

Nothing is approved, adopted, signed or authorised by this record.

| Item | Status | Evidence |
|---|---|---|
| Phase 1 pipeline, stage by stage | **TRACED** (implementation; not acceptance) | `docs/acceptance/phase-1-data-flow-and-components.md` |
| T1: present / loaded / invoked / consumed | **YES / YES / YES (every pass) / YES (fusion → handoff metadata)** | `docs/acceptance/t1-tr01-status-reconciliation.md` §1 |
| T1 elements in the handoff | **NO:** vision-only elements cannot enter it | same §1, §3 |
| T1 metadata in the reasoner request | **NO** (request body inspected) | same §1 |
| T1 adopted | **NO: UNADOPTED.** FR-01 deferred and not authorised | registry; FR-01 |
| T1 integrity | **NO build-time or runtime check: a gap.** Recorded, not fixed | same §4; OD-O |
| TR-01 role | text regions → `UNREAD_REGION` masks in the **local** frame only. Hash-verified at build and run time | same §2 |
| Visual-only PII protection | **NOT VERIFIED** (M9); not accepted | — |
| Reasoner egress | `sendVerified` only, to the CSP v2 loopback endpoint; frame senders have no product caller | data-flow §5 |
| RC-01 to RC-10 | **COMPLETED as a proposal**, with RC-11 and RC-12 added | `docs/acceptance/reconciliation-matrix-RC-01-to-RC-12.md` |
| Amendment language | **DRAFTED (A-1 to A-9), not applied** | `docs/acceptance/proposed-amendment-language-PROPOSED.md` |
| ADR-0015 | **PROPOSED — AWAITING OWNER APPROVAL**, indexed in `docs/adr/README.md` | `docs/adr/ADR-0015-phase-1-local-structure-only-architecture.md` |
| Existing ADRs, constitution, gates, invariants, blockers, CSP, permissions, egress guard, model packaging | **UNCHANGED** | git diff |
| B-07 | **BLOCKED, unchanged** | `agentos/blockers.md` |
| Unknowns | U-1 to U-4 | data-flow §6 |

**Documents amended (M23.1 and M23.2 acceptance set):**
- `docs/acceptance/core-product-acceptance-PROPOSED.md`;
- `traceability-matrix.md`;
- `phase-1-architecture-scope.md`;
- `quality-gate-mapping-PROPOSED.md` (S4 and S5 reworded, and the QG-05 T1 note);
- `owner-decisions.md` (OD-N to OD-Q; TR-01 under OD-F);
- `README.md`.

**All 59 criteria remain PROPOSED — AWAITING OWNER APPROVAL.**

## Verification

`python scripts/verify-repo.py`, the documentation and governance check. It reads no dataset, model or TEST.
- **Result: exit 0; 0 failures, 0 warnings.**
- **`npm run verify` was not run:** its Python step (`test_training_v2.py`) runs the training loop on synthetic fixture frames.

**No model was loaded,** including `t1-ui-head.onnx` and TR-01. **Nothing was run or read beyond source:** no inference, training, evaluation or prediction; no browser frame, dataset or TEST.
