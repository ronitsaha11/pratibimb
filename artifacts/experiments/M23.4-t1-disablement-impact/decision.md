# M23.4 — decision record

**OD-P: OWNER DECISION SELECTED — IMPLEMENTATION PENDING SEPARATE AUTHORISATION. T1 IS NOT DISABLED.**

| Item | Status | Evidence |
|---|---|---|
| OD-P: disable T1 from active Phase 1 execution | **SELECTED (owner, 2026-11-03); implementation pending; NOT implemented** | README; `docs/acceptance/owner-decisions.md` |
| T1 current behaviour | packaged (no hash check), loaded on the first perception call, inference on frame-capturing passes, fused | `docs/acceptance/t1-dependency-and-disablement-impact.md` §1 |
| Existing fallback for "no T1" | **present and tested:** `MODEL_ASSET_UNAVAILABLE` → `NO_DETECTOR` → structural-floor declaration | same §1, §2 |
| T1 dependencies in grounding, planning, validation, REFRESH, hit test, postconditions | **none found** (consumers traced); UNKNOWN U-1 to U-3 remain | same §2, §3 |
| OD-O: integrity policy for future reactivation | **PROPOSED (I-1 to I-7); AWAITING OWNER APPROVAL;** not implemented; no digest computed | `docs/acceptance/t1-artifact-integrity-policy-PROPOSED.md` |
| TR-01 (OD-F) | **verified artifact; product visual-redaction acceptance UNRESOLVED;** no product reader of the sanitised frame | `docs/acceptance/tr01-privacy-acceptance-assessment.md` |
| M20 benchmark | historical, unchanged. **Contains no T1 inference** (`detectorRan = 0`); T1 file identity unverified; one machine | `docs/acceptance/m20-benchmark-limitation-note.md` |
| M23.3 overstatement ("run on every pass"; "M20 depends on T1") | **CORRECTED** in the living documents; ADR-0015 corrections proposed (C-2, C-7) | same; `docs/acceptance/adr-0015-change-proposal-PROPOSED.md` |
| ADR-0015 | **PROPOSED — AWAITING OWNER APPROVAL, unchanged.** Changes C-1 to C-10 proposed, not applied | change proposal |
| Implementation readiness | **design proposal only** | `docs/acceptance/t1-disablement-implementation-readiness-PROPOSED.md` |
| New question | **OD-R:** whether Phase 1 keeps capturing frames after T1 is disabled | register |
| Source, packaging, model, CSP, permissions, egress code, TR-01 integration, existing ADRs, frozen text, gates, B-07 | **UNCHANGED** | git diff |

**Component separation:**

| Component | Status |
|---|---|
| T1 | currently invoked (frame passes), unadopted; owner selected its disablement, implementation pending |
| TR-01 | verified artifact; visual-redaction product acceptance unresolved; **not affected by OD-P** |
| Phase 1 LLM | local structure-only reasoner; `PINNED`, not adopted |
| Future VLM | Phase 2; NOT AUTHORISED |

## Verification

`python scripts/verify-repo.py`, the documentation and governance check. It reads no dataset, model or TEST.
- **Result: exit 0; 0 failures, 0 warnings.**
- **`npm run verify` was not run:** its Python step runs the training loop on synthetic fixture frames.

**Nothing was loaded, read or run beyond text:**
- no model was loaded, read or hashed, including `t1-ui-head.onnx` and TR-01;
- no inference, training, evaluation or prediction;
- no browser frame, dataset or TEST.

**B-07 is BLOCKED and unchanged.**
