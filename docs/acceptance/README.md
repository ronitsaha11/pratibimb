# Core-product acceptance — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.1, 2026-11-03; updated M23.2).**
> - **M23.3:** the proposed architecture record is `docs/adr/ADR-0015-phase-1-local-structure-only-architecture.md` (**PROPOSED — AWAITING OWNER APPROVAL**). New engineers should start with `phase-1-data-flow-and-components.md`.
> - **Owner direction (M23.2, 2026-11-03): PHASED ARCHITECTURE.**
>   - **Phase 1** is the current local, loopback, structure-only product, and these documents are its proposed acceptance scope.
>   - **Phase 2** (vision-language and frame-based reasoning) is future scope and **not authorised**.
>   - **What the direction does not do:** approve the acceptance proposal, amend any ADR or the constitution, sign any gate, or lift any blocker. See `artifacts/experiments/M23.2-phased-architecture-decision/`.
> - **What this folder is:** a proposal of what "the core product is accepted" should mean.
> - **What it does not do:** approve anything, sign any gate, change any ADR, frozen specification, gate, security invariant, blocker or threshold, or authorise any implementation, test run, training, inference or evaluation.

## Executive summary

**Where the product stands (FACT):**
- **What it is:** a Chrome MV3 extension that completes bounded tasks on synthetic loopback pages, on one machine (W1), operated by the developer or the owner.
- **What it sends:** structure-only JSON to a local loopback text LLM: `Qwen2.5-0.5B-Instruct` under llama.cpp, `PINNED` and not adopted.
- **What it executes:** clicks only, after allowlist, freshness and human checks.
- **What it never sends:** production frame egress is impossible by three locks.

**What has no executed evidence:** Firefox, a second machine, an independent operator, real sites, the benchmark contract's privacy metrics, and visual-only PII protection.

**Why a definition is needed (FACT).** The quality gates and the release workflow were written for the dossier's architecture: a frame and manifest sent to a server VLM. The product as shipped differs from it in several ways:
- **QG-04's text:** QG-04 forbids network calls before it is signed, and it is unsigned while the product calls the loopback reasoner.
- **The demonstration sequences:** they assume a server, a scanned-image PII case and an offline VLM mode.
- **No record of the substitution:** no ADR records the local text LLM replacing the constitution's server VLM.

**The proposed acceptance standard (PROPOSED — AWAITING OWNER APPROVAL):**
1. **Evidence types:** eight separate types (A–H). A test of one type never stands in for another. A developer-run W1 test is not independent validation, and a synthetic page is not a real site.
2. **Criteria:** 59 criteria in 12 categories (51 proposed mandatory, 1 optional, 7 awaiting an owner decision before classification), each with a source, a proposed class, evidence, the missing evidence and a proposed test.
3. **Thresholds:** only one numeric threshold is authoritative today, PII recall ≥ 0.98 (benchmark contract Rule 2). Every other threshold is **TBD** and names the owner decision it needs.
4. **QG-04 split:** QG-04 would become **QG-04-S**, a structure-only gate of 11 binary items for the shipped product, and **QG-04-F**, the frame gate, unchanged and still blocked. Nothing is relaxed.
5. **Owner decisions:** thirteen framed decisions (OD-A to OD-M; OD-M added in M23.2). Only the phased direction (P-1 to P-3) is resolved. The first three are approving this definition, choosing the QG-04 structure (OD-E1), and recording the REASON-stage substitution (OD-K).
6. **FR-01 stays excluded:** FR-01 (detector research) stays `DEFERRED — NOT AUTHORISED FOR EXECUTION`, and B-07 stays `BLOCKED`. No core criterion depends on a UI detector.

**Evidence status of the 59 proposed criteria** (FACT, counted from §5 of the proposal):

| Status | Count |
|---|---|
| EVIDENCED (of these, one is a recorded statement: GOV-07) | 6 |
| PARTIAL | 28 |
| NOT EVIDENCED | 19 |
| BLOCKED (owner decision) | 2 |
| UNKNOWN | 2 |
| PROPOSED (governance) | 2 |

**These counts describe evidence, not acceptance.** No criterion is accepted until the owner approves the definition.

## Contents

| Document | Purpose |
|---|---|
| `core-product-acceptance-PROPOSED.md` | **The standalone proposal:** the architecture as built, governance gaps (G-1 to G-6), frozen constraints, the evidence standard, and the 12-category acceptance matrix |
| `traceability-matrix.md` | The brief's four deliverables and the 12-stage pipeline, traced to modules and evidence |
| `quality-gate-mapping-PROPOSED.md` | QG-01 to QG-06 mapped onto the shipped architecture; the QG-04-S proposal |
| `owner-decisions.md` | Resolved (P-1 to P-3), awaiting the owner (OD-A to OD-M), and blocked or not authorised, kept separate; questions, context, options and proposed recommendations |
| `phase-1-architecture-scope.md` | M23.2: the owner-selected Phase 1 architecture, its implementation facts, proposed requirements, open decisions and prohibitions |
| `phase-2-future-capability-register.md` | M23.2: Phase 2 capabilities P2-01 to P2-07, all `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| `phase-1-data-flow-and-components.md` | M23.3: the **main Phase 1 architecture description**, source-traced stage by stage (modules, inputs, outputs, boundaries, evidence, unknowns) |
| `t1-tr01-status-reconciliation.md` | M23.3: what T1 and TR-01 actually do, kept separate across present / loaded / invoked / consumed / adopted; T1's downstream influence; the T1 integrity gap |
| `reconciliation-matrix-RC-01-to-RC-12.md` | M23.3: each frozen or governing document against the implementation and the Phase 1 scope, with the proposed action and the approval it needs |
| `proposed-amendment-language-PROPOSED.md` | M23.3: draft wording A-1 to A-9 for frozen or conflicting documents. Not applied |
| `release-readiness-checklist-PROPOSED.md` | Mandatory, owner-approved optional, future, and deferred (FR-01) items |

## How this proposal was made

- **Sources:** it was built read-only from the repository's own records: the constitution, ADRs, gates, the security invariants, the benchmark contract, the model registry, the blocker register, `agentos/state.md` and the experiment records.
- **Nothing executed:** no model was loaded, no detector was evaluated, and no dataset frame, TEST or production browser frame was read.
- **Labels:** every claim is labelled FACT, INFERENCE or UNKNOWN, as `AGENTS.md` §5 requires.
- **No new numbers:** every figure is quoted from an existing record.
