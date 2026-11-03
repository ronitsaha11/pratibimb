# M23.7 — decision record

**DOM-ONLY PHASE 1 IMPLEMENTED IN PRODUCT BUILDS (owner-authorised). Not accepted. ADR-0015 is still PROPOSED — AWAITING OWNER APPROVAL.**

| Item | Status | Evidence |
|---|---|---|
| Normal product task captures no frame | **IMPLEMENTED:** no perception port in product task runs | `main.ts`; `task-perception.ts`; `domOnlyPhase1.test.ts` A |
| T1 not loaded or invoked; not packaged in product builds | **IMPLEMENTED** | `wxt.config.ts`; `main.ts`; tests B; product build output |
| TR-01 not started by a product task | **IMPLEMENTED** (follows from no perception pass); TR-01 packaging, hash checks and worker unchanged | tests C; build output |
| Evidence builds | **UNCHANGED** (configuration and source tests; no evidence build was run) | tests D |
| `tabCapture` and all permissions, CSP | **UNCHANGED** | built manifest; tests D |
| Structural pipeline and safeguards | **UNCHANGED** (no edits to those modules; full suite green) | full Vitest run |
| Handoff declaration | always the structural floor in product tasks; no false T1 claim | tests E |
| Browser-level verification and performance | **PENDING:** not run; no claim | — |
| OD-P, OD-R | **SELECTED and now IMPLEMENTED in product builds;** acceptance pending | register |
| ADR-0015; existing ADRs; gates; FR-01; B-07 | **unchanged** | git diff |

## Verification

Exit codes:
- `npm run typecheck`: **0**.
- Focused Vitest, first attempt: **1** (one test bug in the new test). Retry: **0**.
- Mutation check against the old source: **1**, as expected (6 failed).
- Full `npx vitest run`: **0** (3177 passed, 22 skipped).
- `npm run pin:check`: **0**.
- Product `npm run build`: **0**.
- `python scripts/verify-repo.py`: **0**.

**`npm run verify` was not run** (training step).

**Nothing was loaded by hand, captured or run:**
- no model was loaded or hashed by hand. The product build's own TR-01 hash check ran as part of the build;
- no frame was captured;
- no inference, training, evaluation or prediction;
- no dataset or TEST.
