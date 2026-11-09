# Phase 1 release-readiness checklist — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.1, 2026-11-03).**
> - **Unchecked:** every box is unchecked. Nothing here is signed, and ticking a box needs the evidence its criterion names.
> - **Classifications:** they follow `core-product-acceptance-PROPOSED.md` §5, and are proposals.
> - **Release workflow:** `agentos/workflows/release.md` is unchanged and still governs. This checklist proposes how it would read for the shipped architecture.
> - **Phase 1 only (M23.2):** following the owner's phased direction, this is the proposed **Phase 1** release checklist for the current structure-only product. Phase 2 capabilities (`phase-2-future-capability-register.md`) are outside it unless separately approved. **Selecting the direction does not tick any box.**

## 1. Mandatory (proposed)

### Governance first

- [ ] **GOV-01:** this acceptance definition approved by the owner.
- [ ] **GOV-03:** gate scopes approved (`quality-gate-mapping-PROPOSED.md`).
- [ ] **OD-K / RSN-07:** ADR recording the shipped REASON stage (local loopback text LLM).
- [ ] **GOV-02:** ADR-0005, 0006, 0007 and 0008 tolerances, tier and lifetime decided (OD-E4–E7).
- [ ] **GOV-04 / OD-L:** B-03 status, the registry byte count and `state.md` consistent.
- [ ] **GOV-06 / OD-J:** the release-candidate commit named, on `main`, reached through a PR.

### Security

- [ ] **SEC-03:** QG-04-S (or the owner's chosen QG-04 structure) signed, every item met.
- [ ] **SEC-02:** F-M13-1 decided (OD-E2).
- [ ] **SEC-06:** B-02 decided by ADR (OD-E3).
- [ ] **SEC-04:** production frame egress still impossible (three locks), re-checked on the candidate.
- [ ] **SEC-01, SEC-08:** CSP v2, one endpoint, no new permission, origin or action type; diffed against the baseline.
- [ ] **SEC-05, REL-03:** fail-closed and the failure path demonstrated on the product build.
- [ ] **SEC-07:** adversarial-page case: observed, not obeyed.

### Privacy

- [ ] **PRV-01:** textual and DOM PII to references before handoff, per class.
- [ ] **PRV-02:** per-class P/R/F1 on the approved corpus; **recall ≥ 0.98** (benchmark contract Rule 2); decoy precision reported.
- [ ] **PRV-05:** consent: Allow once and Deny both honoured.
- [ ] **PRV-06, PRV-07:** vault destruction triggers; no plaintext in any log.
- [ ] **PRV-03, PRV-04:** per OD-F.

### Local reasoning

- [ ] **RSN-01–RSN-05:** pins verified at launch; loopback only; keyed model server; structure-only body; client-side plan validation.

### Function and action safety

- [ ] **FUN-01, FUN-02, FUN-03, FUN-06:** the bounded task set, stop paths, field grounding and model-failure fallback.
- [ ] **FUN-05:** task success after privacy, as a two-row ablation. **Threshold TBD (owner).**
- [ ] **ACT-01:** click is the only executable action.
- [ ] **ACT-02–ACT-05:** at the approved tolerances, tier and lifetime.
- [ ] **ACT-06:** off-screen target never actioned without a scroll (QG-02 criterion 7).
- [ ] **ACT-07:** new-origin navigation handled; vault destroyed first.

### Reliability, performance, CI

- [ ] **REL-01:** bounded task set repeated N times. **N and the pass criterion TBD (owner).**
- [ ] **REL-02:** reasoner lifecycle on each accepted machine.
- [ ] **PRF-01, PRF-02:** latency and resources reported, labelled with machine, backend and browser. **Reporting, not a target** unless OD-H says otherwise.
- [ ] **BRW-01, BRW-04, BRW-05:** the Chrome product build; gesture capture; a benchmarked WASM path for TR-01.
- [ ] **CI-01:** hosted CI green on the candidate, every job.
- [ ] **CI-02:** pins and a reproducibility manifest recorded.
- [ ] **CI-03:** line endings (B-06) resolved.
- [ ] **GOV-05:** demonstration sequences redefined for the shipped architecture and rehearsed ten times (release workflow step 9).

## 1.1 Perception scope (OD-R, M23.6)

- [ ] **Implementation:** the separately authorised implementation of OD-P and OD-R is complete. In normal Phase 1 tasks there is no frame capture, no T1 and no TR-01, with the regression evidence in `dom-only-phase-1-implementation-outline-PROPOSED.md`.

## 2. Owner-approved optional (classification depends on the decision named)

- [ ] **BRW-02, BRW-03:** Firefox product build; Firefox on Linux (OD-A, OD-G). **Mandatory if OD-A chooses option 2 or 3.**
- [ ] **XM-01, XM-02:** second-machine reproduction (OD-B).
- [ ] **HUM-01:** independent operator (OD-C).
- [ ] **Real-site validation** within an approved scope, after AUDIT-0004 D5 (OD-D).
- [ ] **PRF-03:** performance targets (OD-H).
- [ ] **RSN-06:** reasoner adoption (`PINNED` → `ADOPTED`) against an owner-set bar.
- [ ] **FUN-04:** clarification and declared outcomes kept in the acceptance scope.

## 3. Phase 2 and other future capabilities (outside Phase 1; NOT AUTHORISED)

Each Phase 2 entry is `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` (P2-01 to P2-07).

- Frame egress to a server (QG-04-F): B1, B2, B4, B5 and B6 in ADR-0012 §13. **Stays blocked.**
- A server VLM per the dossier (constitution §2; B-03).
- The offline-mode sequence with a local VLM (constitution §10 v1.1).
- Visual-only PII beyond TR-01 masking: signature and ID-card classes (§10 v1.1). **The Phase 1 visual-only PII and face-detection gaps are not moved here;** they remain under OD-F in §1 and §2.

## 4. Deferred: FR-01

- **Not part of this release.** FR-01 (detector performance and generalisation) is `DEFERRED — NOT AUTHORISED FOR EXECUTION`. B-07 stays `BLOCKED`. No release criterion depends on a UI detector. T1 and the epoch-39 checkpoint stay UNADOPTED.
