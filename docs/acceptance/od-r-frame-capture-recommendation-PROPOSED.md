# OD-R — frame capture after T1 removal — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.5, 2026-11-03).**
> - **This is a recommendation, not a decision.** The owner decides OD-R.
> - **No implementation is authorised.** Frame capture and TR-01 behave exactly as they do today.

## Recommendation

**PROPOSED — AWAITING OWNER APPROVAL: Option A, a DOM-only Phase 1.** Ordinary Phase 1 task execution would initiate no frame capture and invoke neither T1 nor TR-01, once a separately authorised change implements it.

**Reasons** (from `phase-1-perception-options-comparison.md`):
1. **Fits the selected direction:** it matches the phased architecture. Phase 1 is local, loopback and structure-only, and vision-language and frame-based capability are Phase 2.
2. **Nothing uses the frame:** after OD-P, no product component consumes a captured frame except TR-01, and TR-01's masked frame has no product reader (FACT).
3. **No benefit from keeping it:** Option B decodes full-page frames for no consumer. Its benefit is none identified, and its cost is retained pixel exposure plus resources (UNKNOWN, not measured).
4. **Already exercised:** the functional path A would make permanent is the one the M20 benchmark already exercised. That evidence is limited to W1 and synthetic pages.

**Not claimed:** identical visual capability (it is reduced), any performance change (unmeasured), or acceptance of visual-only PII protection (OD-F stays open).

## Consequences that need recording if A is chosen

- **Brief Deliverables 1 and 2:**
  - in task runs, no local vision model would execute;
  - visual masking would not be exercised in the product;
  - this needs the owner's explicit acceptance in the deliverable mapping (OD-K2 / A-5).
- **OD-F (TR-01 acceptance)** narrows to whether TR-01 stays as a **dormant, evidence-build capability** for a future frame path (Phase 2 / QG-04-F).
- **ADR-0015** needs the clauses in `adr-0015-od-r-clauses-PROPOSED.md`.
- **ADR-0009** (gesture-authorised capture) **is not changed.** It governs capture *when* capture happens.

## If the owner prefers B or C

- **B:** record that capture is retained without a product consumer, and why.
- **C:** require the four justification conditions in the comparison document before any capture is used.

## Separate decisions (unchanged by this recommendation)

| ID | Status |
|---|---|
| OD-P | **SELECTED:** disable T1; implementation pending |
| OD-O | AWAITING OWNER APPROVAL: T1 integrity for any reactivation |
| OD-Q | AWAITING OWNER APPROVAL: completeness of the T1 influence trace |
| OD-R | **AWAITING OWNER APPROVAL:** this recommendation |
| OD-F | AWAITING OWNER APPROVAL: TR-01 redaction acceptance |
| OD-N | AWAITING OWNER APPROVAL: ADR-0015 |
| GOV-01 | AWAITING OWNER APPROVAL: Phase 1 acceptance definition |
| OD-E1 | AWAITING OWNER APPROVAL: QG-04-S scope |
