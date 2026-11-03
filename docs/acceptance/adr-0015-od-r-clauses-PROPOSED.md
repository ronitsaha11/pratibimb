# ADR-0015 — clauses to add once OD-R is resolved — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.5, 2026-11-03).**
> - **Not applied:** these are drafts for the **proposed** ADR-0015, in addition to M23.4's C-1 to C-10. **None is applied.**
> - **ADR-0015 is unchanged,** and stays **PROPOSED — AWAITING OWNER APPROVAL.** No existing ADR is modified.
> - **Only one set applies:** the set matching the owner's OD-R choice.

## If OD-R = A (DOM-only Phase 1)

- **R-A1, §3.1, Capture row:**
  > "Phase 1 (intended, OD-R): ordinary task execution initiates no frame capture. ADR-0009 continues to govern capture wherever capture occurs (evidence builds, a future approved consumer). Implementation pending separate authorisation."
- **R-A2, §3.1, TR-01 row:**
  > "Phase 1 (intended): not invoked in the normal product path. It remains a hash-verified capability in the codebase and in evidence builds, for a future frame path under QG-04-F. Its product acceptance is OD-F."
- **R-A3, §3.2:**
  > "Phase 1 (intended): no pixels are decoded in task runs. The handoff always declares the structural floor (`backend: \"none\"`, `tiers_fired: [\"T0\",\"T2\"]`, `source: \"dom\"`)."
- **R-A4, §7 (consequences):**
  > "In task runs, no local vision model executes; brief Deliverables 1 and 2 are reconciled under OD-K2 and A-5."
- **R-A5, §8 (open decisions):** OD-R → *selected (A), implementation pending*.

## If OD-R = B (T1 off, capture kept)

- **R-B1, §3.1, Capture row:**
  > "Phase 1: capture retained under ADR-0009 with no product consumer of the frame; the reason for retention is recorded here."
- **R-B2, §3.2:**
  > "TR-01 masks the local frame; the handoff declares the structural floor, because the capability declaration is gated on the UI detector (`visual()`)."

## If OD-R = C (capture for a named consumer only)

- **R-C1:**
  > "Phase 1 capture is permitted only for the consumer named in ADR-XXXX, with its purpose, boundary and consent. Otherwise, as A."

## In every case

- **R-0:**
  > "OD-R changes no CSP, permission, endpoint, egress path, action type, consent rule, five-turn cap or postcondition check; production frame egress remains impossible; Phase 2 is not authorised."
