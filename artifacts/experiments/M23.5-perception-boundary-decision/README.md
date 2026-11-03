---
id: M23.5-perception-boundary-decision
title: "M23.5 — Phase 1 perception boundary and frame-capture decision preparation (OD-R)"
status: recorded — decision preparation only; OD-R AWAITING OWNER APPROVAL (Option A recommended for consideration); no implementation authorised
date: 2026-11-03
label: FACT (source, tests and records read as text); INFERENCE and UNKNOWN marked; no measurement
classification: GOVERNANCE (documentation and static source inspection only) — no model loaded, no frame captured, no test run, no code changed
workstation: 1
---

# M23.5 — perception boundary and frame capture

> **What it is:** preparation of the owner's **OD-R** decision.
> **What is unchanged:** T1 is still loaded and run on frame-capturing passes (OD-P is selected but not implemented). Frame capture and TR-01 are unchanged.

## Hypothesis

Static source, existing tests and existing records can establish three things:
- what each frame-capture option changes;
- which components consume frame bytes;
- whether Phase 1 tasks run without any frame.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `a165c7a` before this milestone, 74 commits on `origin/main` `077f139`, no upstream, no PR.
- **Untracked and untouched:** the two M20 records.
- **Inputs:** source and tests, read as text; the M20 records; the M23.3 and M23.4 documents; ADR-0015.

## Expected result

- a capture and consumer map;
- a test-evidence matrix;
- a three-option comparison;
- an OD-R recommendation;
- ADR-0015 clause drafts;
- an updated register.

## Actual result

1. **Capture needs a toolbar or `Alt+Shift+P` grant:** valid 5 minutes, revoked on navigation. Without it, every pass is refused before any inference, and the handoff declares the structural floor.
2. **Frame consumers.**
   - **Product path:** the realm decode, T1 preprocess, the TR-01 worker copy, and in-place masking.
   - **The masked frame has no product reader.**
   - **Test-only entries:** `PERCEIVE_ONCE` and `STREAM_CONSUME` (reached through the worker's `__host` "TEST-ONLY" members) return geometry, counts and timings, never pixels.
   - **U-1 is narrowed but open:** a static test checks message field names in two files.
3. **The structural path is already exercised end to end.** In the M20 benchmark, 6 bounded tasks completed with every visual pass refused (`detectorRan = 0`; W1, synthetic).
4. **Test gaps:**
   - no test of `visual()` → floor wiring;
   - no `sourceById` test;
   - no run with no `perceive` dependency;
   - no vision-only-element exclusion test.
5. **Option comparison:**
   - **B** has no identified product benefit: it captures and masks frames that nothing reads.
   - **C** needs a consumer, and none exists.
   - **A** is recommended for consideration.

## Conclusion

OD-R is ready for the owner, with Option A recommended for consideration. Nothing is implemented. Visual capability would be reduced, performance effects are unmeasured, and the brief-deliverable consequences need the owner's acceptance (OD-K2).

## Reproducibility

Documentation and static source reading only. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
