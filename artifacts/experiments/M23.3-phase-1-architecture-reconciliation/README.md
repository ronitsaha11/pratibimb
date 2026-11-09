---
id: M23.3-phase-1-architecture-reconciliation
title: "M23.3 — Phase 1 architecture reconciliation: static source trace and a proposed ADR-0015"
status: recorded — source trace complete with stated unknowns; ADR-0015 PROPOSED — AWAITING OWNER APPROVAL; nothing approved or adopted
date: 2026-11-03
label: FACT (source and documents read); INFERENCE and UNKNOWN marked; no measurement
classification: ARCHITECTURE GOVERNANCE (documentation and static source inspection only) — no code change, no model loaded, no inference, no frame, no data
workstation: 1
---

# M23.3 — Phase 1 architecture reconciliation

> **What it is:** a static source trace of the Phase 1 product, and a **proposed** architecture ADR.
> **What it is not:**
> - an approval or an adoption;
> - an edit to an existing ADR or to frozen text;
> - a gate signature;
> - an authorisation of Phase 2 or of frame egress.

## Hypothesis

The actual Phase 1 data flow can be established from source alone, precisely enough to:
- correct the T1 record;
- separate local visual processing from the structure-only reasoner boundary;
- write a proposed ADR that a new engineer can rely on.

Anything source cannot establish stays UNKNOWN.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `3e6a2e6` before this milestone, 72 commits on `origin/main` `077f139`, no upstream, no PR.
- **Interrupted session:** it left one uncommitted file, `docs/acceptance/M23.3-source-trace-WORKING-NOTES.md`, which is folded into the documents below and removed. It changed no other file.
- **Untracked and untouched:** the two M20 smoke records.
- **Inputs:** product source, read only. Mainly:
  - `apps/extension/` (offscreen, host-lib, wxt config, probes);
  - `packages/perception`, `privacy`, `egress`, `reasoner`, `plan`, `agent` and `orchestrator`;
  - the governing documents.

## Expected result

- **The pipeline:** each stage traced to its modules, inputs, outputs and boundaries.
- **T1 and TR-01:** their roles separated across five states (present, loaded, invoked, consumed, adopted).
- **Egress:** the egress mechanisms distinguished.
- **The records:** RC-01 to RC-10 completed, and ADR-0015 drafted as PROPOSED.

## Actual result

**T1:**
- **Packaging:** git-ignored; packaged with **no** build-time or runtime hash check (TR-01 has both).
- **Execution:** loaded and run on every perception pass; its output is fused.
- **What its output reaches:** handoff metadata (`source` relabelling; `capability`; `scale_to_css`), the run report, and timing.
- **What it cannot do:** **add an element to the handoff.**
- **What the reasoner sees:** the request omits all of that metadata.
- **No traced influence:** no consumer was found through which T1 changes click eligibility, validation, REFRESH or result verification.
- **Status:** UNADOPTED.

**TR-01:**
- **Input:** a copy of the full frame, in a worker.
- **Output:** `UNREAD_REGION` masks, filled in place into the **local** frame only.
- **What reads it:** no product code reads the sanitized frame.

**Egress:**
- **The product path:** the only product egress is `sendVerified` (JSON planning view, to `127.0.0.1:8995/v1/chat/completions`).
- **The frame path:** `qg04.ts` and `frame.ts` have no product caller.
- **ADRs:** ADR-0013 §3 records the `sendVerified` path. ADR-0012 §7–§8 cover the production frame handoff (RC-11).

**Records:**
- **Reconciliation:** RC-01 to RC-10 are completed, and RC-11 and RC-12 are added.
- **Amendment language:** A-1 to A-9 are drafted, and not applied.
- **ADR-0015:** drafted as **PROPOSED — AWAITING OWNER APPROVAL**.

**Unknowns:**
- **U-1:** complete message-channel proof.
- **U-2:** wider T1 influence.
- **U-3:** the effect of T1 latency or failure on outcomes.
- **U-4:** the identity of the packaged T1 bytes.

**Documents:** listed in `decision.md`.

## Conclusion

- **What Phase 1 is:** it is now described from source (`docs/acceptance/phase-1-data-flow-and-components.md`).
- **The T1 record is corrected:** T1 runs unadopted and unverified, and its output is confined, as traced, to metadata the reasoner does not receive. That conclusion holds for the consumers traced, with U-1 to U-3 remaining open.
- **What needs the owner:** ADR-0015, the amendments, and the T1 policy (OD-N to OD-Q).

## Reproducibility

Documentation and static source reading only. The cited files are listed in each document. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
