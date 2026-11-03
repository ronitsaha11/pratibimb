# ADR-0015 — annotated change proposal (M23.4) — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL.**
> - **What this is:** a list of edits to the **proposed** ADR-0015. **None is applied;** ADR-0015 is unchanged by M23.4, and stays **PROPOSED — AWAITING OWNER APPROVAL**.
> - **What it does not do:** it supersedes no existing ADR.
> - **How the edits would be applied:** together with OD-N, in a separate change.

| # | ADR-0015 location | Current text (summary) | Proposed change | Reason |
|---|---|---|---|---|
| C-1 | status line and §1 | records the phased direction and the Phase 1 architecture as implemented | add: "**OD-P selected (owner, 2026-11-03): T1 is to be disabled from active Phase 1 execution; implementation pending separate authorisation.**" | record the owner's selection without claiming it is implemented |
| C-2 | §3.1, T1 row | "loaded (ORT WASM) and run on **every** perception pass" | "loaded on the first perception call (`ensurePerception`); inference runs on every pass that **captures a frame** (gesture grant); **intended Phase 1 policy: disabled (OD-P), not yet implemented**" | correction (`m20-benchmark-limitation-note.md` §3) and the policy |
| C-3 | §3.1 | no "intended" column | add an **Intended Phase 1 (policy)** column: T1 disabled; TR-01 unchanged; reasoner unchanged | separate implemented from intended |
| C-4 | §3.3 (T1's role) | what T1 output can and cannot reach | keep it as the description of **current** behaviour. Add: "With T1 disabled, the existing null-runtime path applies: `MODEL_ASSET_UNAVAILABLE`, fusion `NO_DETECTOR`, the handoff's structural-floor declaration" | the existing fallback (`t1-dependency-and-disablement-impact.md` §1) |
| C-5 | §3.4 (integrity gap) | recorded, remedy undecided | add: "**OD-O prerequisites I-1 to I-7 apply to any future T1 reactivation or adoption** (proposed)" | `t1-artifact-integrity-policy-PROPOSED.md` |
| C-6 | §3.1, TR-01 row | "visual-only PII protection NOT VERIFIED" | add: "a separate capability; **unaffected by OD-P**; no product reader of the sanitised frame; product acceptance is OD-F" | `tr01-privacy-acceptance-assessment.md` |
| C-7 | §7 (consequences) | "Every product measurement depends on an unverified T1 file" | "Product measurements **in which T1 inference ran** depend on an unverified T1 file. The M20 benchmark ran none (`detectorRan = 0`)" | correction |
| C-8 | §8 (open decisions) | OD-P listed as open | OD-P → **selected, implementation pending**. Add OD-R (frame capture after T1 removal) | register |
| C-9 | §3.2 and §5 | frame-egress restrictions; invariants unchanged | **no change:** restate that OD-P neither enables nor touches frame egress, CSP, permissions or `sendVerified` | preservation |
| C-10 | §3.5 (Phase 2) | Phase 2 not authorised | **no change**; add that disabling T1 does not reassign detector work to Phase 2. Detector research stays FR-01 | separation |
