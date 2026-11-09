---
id: M23.4-t1-disablement-impact
title: "M23.4 — OD-P selected (disable T1 from active Phase 1 execution): impact, integrity and privacy governance"
status: recorded — OD-P OWNER DECISION SELECTED, IMPLEMENTATION PENDING SEPARATE AUTHORISATION; T1 NOT disabled; no code, package, model or runtime change
date: 2026-11-03
label: FACT (owner decision as given; source and records read as text); INFERENCE and UNKNOWN marked; no measurement
classification: GOVERNANCE (documentation and static source inspection only) — no model loaded, read or hashed; no inference; no frame; no data
workstation: 1
---

# M23.4 — T1 disablement: decision and impact

> **The owner-selected policy:** T1 must not remain an active inference dependency in Phase 1 (OD-P).
> **Current runtime behaviour:** **unchanged.** T1 is still packaged and loaded, and it still runs on passes that capture a frame.
> **The future implementation:** proposed only, in `docs/acceptance/t1-disablement-implementation-readiness-PROPOSED.md`.

## Owner decision

**OD-P — T1 Phase 1 execution policy.**

**Status:** OWNER DECISION SELECTED (2026-11-03), **IMPLEMENTATION PENDING SEPARATE AUTHORISATION.**

**Required future outcome:**
- T1 is not loaded or invoked during normal Phase 1 operation.
- T1 is not a required dependency for perception or task execution.
- Phase 1 keeps its DOM-based observation, grounding and click safety without T1.
- T1 remains UNADOPTED.
- FR-01 remains deferred and not authorised.

**T1 is not disabled.** M23.4 permits no code, package, model or runtime change.

## Hypothesis

Static source can establish:
- every T1 dependency;
- whether a safe fallback already exists;
- what disablement would and would not change.

It must do so while keeping TR-01, the reasoner and the future VLM distinct.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `8767428` before this milestone, 73 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Inputs:**
  - product source and tests, read as text;
  - `.github/workflows/ci.yml`;
  - the M20 benchmark records, read as JSON text;
  - the M23.2 and M23.3 records;
  - ADR-0015.

## Expected result

- **A dependency matrix,** with direct and indirect effects separated.
- **Three assessments:** OD-O integrity, TR-01 acceptance, and the M20 limitation.
- **The ADR-0015 change list,** not applied.
- **A readiness plan.**
- **Updated registers.**

## Actual result

1. **The fallback already exists (FACT).** With no T1 session:
   - the detector refuses `MODEL_ASSET_UNAVAILABLE`;
   - the pass continues to TR-01;
   - fusion marks `NO_DETECTOR`;
   - `visual()` makes the handoff declare the structural floor.

   No schema change is needed. Grounding, click eligibility, planner input, validation, REFRESH, the hit test and postconditions read no T1 output (consumers traced). `overlaySuspected` is only counted.
2. **One coupling.** `visual()` gates the whole capability declaration on `detector.ran`. Without T1, a pass in which TR-01 ran declares `backend: "none"`. This raises **OD-R** (whether Phase 1 keeps capturing frames once T1 is gone). It is a question only.
3. **The TR-01 worker pins its own ORT runtime and model** (`bootstrapOrtRealm("tr01-worker")`, `loadVerifiedModel`), independently of the offscreen T1 load.
4. **Hosted CI never builds the extension.** Its T1 job uses synthetic detections.
5. **Correction to M23.3.**
   - **Inference:** T1 inference runs only on passes that capture a frame (a gesture grant). The session is created on the first perception call.
   - **The M20 benchmark** (all five tracked records) has `detectorRan = 0` and `visualPerceptionRan = 0`, so it **contains no T1 inference**.
   - **Where it is corrected:** the living acceptance documents, and, through the change list, ADR-0015. The committed M23.3 records stay as written.
6. **TR-01:**
   - it is verified at build and run time;
   - it masks the local frame only;
   - the sanitised frame has no product reader (reconfirmed);
   - visual-only PII protection is **not demonstrated in the shipped product.**

## Conclusion

- **OD-P is recorded as selected,** with its implementation pending.
- **The source shows a safe existing fallback.** The proposed implementation reuses it, and adds no detector and no inference route.
- **What remains for the owner:**
  - OD-O (integrity, for any reactivation);
  - OD-Q, OD-F, OD-R and OD-N;
  - an authorisation for the implementation itself.

## Reproducibility

Documentation and static source reading only. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
