---
id: M23.6-dom-only-phase-1-decision
title: "M23.6 — OD-R recorded: APPROVED — OPTION A, DOM-ONLY PHASE 1 (implementation not authorised)"
status: recorded — OD-R SELECTED BY OWNER, IMPLEMENTATION NOT AUTHORISED; ADR-0015 updated and still PROPOSED — AWAITING OWNER APPROVAL; runtime unchanged
date: 2026-11-03
label: FACT (owner decision as given; documents read); no measurement
classification: GOVERNANCE (documentation only) — no code, no model, no frame, no data
workstation: 1
---

# M23.6 — DOM-only Phase 1 perception scope

## Owner decision

**OD-R: APPROVED — OPTION A: DOM-ONLY PHASE 1.** Decided by the owner on 2026-11-03.

**Status: SELECTED BY OWNER — IMPLEMENTATION NOT AUTHORISED.**

**Required architecture** (intended; **not yet in the runtime**):
1. no browser-frame capture during normal Phase 1 task execution;
2. no T1 model loading or inference as a Phase 1 product dependency;
3. no normal-task TR-01 invocation;
4. DOM-based element discovery and the structural handoff;
5. the existing grounding and click-eligibility safeguards;
6. the existing consent and human-approval requirements;
7. the existing five-turn execution cap;
8. the existing freshness and postcondition verification.

**What is outside normal task execution:**
- **Evidence builds:** separately authorised evidence-build operation is not normal task execution, and is not removed.
- **Model assets:** T1 and TR-01 assets are not deleted or modified.
- **TR-01:** it is retained as a separate component.

## Hypothesis

The decision can be recorded throughout the governance set, including the proposed ADR-0015, without:
- claiming it is implemented;
- approving ADR-0015;
- changing any existing ADR, security restriction or criterion status.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `124aa94` before this milestone, 75 commits on `origin/main` `077f139`, no upstream, no PR.
- **Untracked and untouched:** the two M20 records.

## Expected result

- **OD-R recorded as selected,** with its implementation status "not implemented".
- **ADR-0015 updated,** and still PROPOSED.
- **The acceptance documents** mark the exclusions.
- **The implications and an outline** are recorded.

## Actual result

- **ADR-0015** (still **PROPOSED — AWAITING OWNER APPROVAL**, version 1.1):
  - §1 records the owner decisions;
  - §3.1 marks the intended exclusions per row;
  - the new **§3.6** states the precise scope, the evidence-build distinction and what is unchanged;
  - §6 adds the rejected Options B and C;
  - §7 adds the consequences;
  - §8 marks OD-P and OD-R as selected but not implemented.
- **M23.4 corrections applied to ADR-0015:** C-2 (T1 runs only on frame-capturing passes) and C-7 (M20 ran no T1 inference), so that the ADR does not contradict the recorded decision. The other M23.4 and M23.5 proposals (C-3 to C-6, C-9, C-10; the R-B and R-C sets) are superseded or remain proposals.
- **The ADR index row** is updated.
- **Acceptance documents:**
  - the Phase 1 scope, core proposal (§1.1, PRV-03, P2-08), traceability, the Phase 2 register (P2-08), the release checklist (§1.1) and the register mark the exclusions;
  - every criterion stays PROPOSED;
  - the brief's visual requirements are recorded as **not fulfilled** by Phase 1.
- **Implications and outline:** `docs/acceptance/dom-only-phase-1-implementation-outline-PROPOSED.md`.

## Conclusion

The DOM-only Phase 1 direction is recorded as owner-selected. **Implementation is not authorised, and the runtime is unchanged:** frames are still captured on gesture-granted passes, and T1 and TR-01 still run on them.

## Reproducibility

Documentation only. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
