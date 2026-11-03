---
id: M22.18-closure-audit
title: "M22.18 — M22 research status, blocker and closure audit (recorded in M22.19)"
status: recorded retrospectively in M22.19 — read-only audit delivered in conversation on 2026-11-03; its recommendation was acted on by the owner's Option B
date: 2026-11-03
label: FACT (records and git metadata read); recommendations are recommendations
classification: AUDIT (read-only) — no code, no execution, no model, no data, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.18 — M22 status and closure audit

> **How it was delivered:** read-only, in the conversation of 2026-11-03.
> **What this file records:** the audit's findings and recommendation as delivered, with one correction (below). The full milestone matrix is consolidated in the M22.19 record, so it is not duplicated here.

## Hypothesis

A complete read-only reading of the M22 records can show:
- what is complete, partial, blocked or awaiting the owner;
- what closing M22 would honestly require.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`).

**Git:** branch `spike/m22-small-target-recall`, HEAD `a58ec93`, 67 commits on `077f139`, no upstream.

## Expected result

A status matrix, the blocker's status, closure criteria, and one recommendation.

## Actual result

**Status of the records:**
- **Complete as scoped:** M22.1–M22.7, M22.9, M22.11, M22.12, M22.15–M22.17.
- **Partial:** M22.8, whose hosted CI job has never run.
- **Planning only:** M22.10.
- **Training experiment only, detection UNKNOWN:** M22.13.
- **Unrecorded:** M22.14, a design delivered in chat. Recorded in M22.19.
- **Blocked:** **M22 itself** (its original question).

**The original question is unanswered:**
- the M22 decision record read "**NO VERDICT. The evaluation has not been run.**";
- hypotheses H1–H5 are untested;
- no detection metric exists for T1 on candidate 2, or for T1-v2.

**The blocker:**
- the M22 runner was never written; an attempt was stopped by a safety classifier;
- it was recorded in `state.md` but **not** in `agentos/blockers.md`.

**Retraining prerequisites unmet:** the retraining prerequisites of M22.1 (`future-dataset-spec.md` §4) item 5 (a sealed TEST) and item 6 (a pre-registered evaluation run on DEV) were unmet.

**Telemetry:**
- **Closed defects:** M22.15–M22.17.
- **Verified only with fakes:** real-run behaviour is unverified.
- **Open:** the clock-under-suspension question, the resume `torch` block, and the F6 label on resume refusals.

**Recommendation:** keep M22 open pending an owner decision on the blocker's scope and on M22's scope. If the evaluation stays blocked, the right course is a **separately approved change of research scope**.

**The owner's response:** **Option B** (M22.19): re-scope M22 to its engineering deliverables and defer detector-performance research to FR-01.

## Correction

M22.18, M22.10 and M22.9 reported three commit subjects as **over the 90-character limit**: `a7e905c`, `12ac35f` and `579bea6`, at 93, 92 and 93 characters. That counted the whole subject.

**`CONTRIBUTING.md` §3 sets the limit after the `: `.** Measured that way the subjects are **74, 73 and 74 characters**, within the rule. **No commit-subject violation exists.** The earlier statements are corrected here and left in place in their own records.

## Conclusion

The audit's recommendation was decided by the owner as Option B. The records it found missing (M22.14, M22.18) and the unregistered blocker are addressed in M22.19.

## Reproducibility

Read-only. It is reproduced by reading `artifacts/experiments/M22*` and `agentos/` at `a58ec93`, and with:

```bash
git log --format='%h %s' 077f139..a58ec93
```
