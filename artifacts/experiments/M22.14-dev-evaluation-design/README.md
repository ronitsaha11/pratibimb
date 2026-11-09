---
id: M22.14-dev-evaluation-design
title: "M22.14 — DEV detection evaluation design and readiness (status record)"
status: recorded retrospectively in M22.19 — DESIGN ONLY, delivered in conversation on 2026-11-03; NOT APPROVED, NOT AN AUTHORISATION, NEVER EXECUTED; deferred to FR-01
date: 2026-11-03
label: FACT (what was inspected and found, read-only); the design itself is a proposal
classification: DESIGN (read-only) — no inference, no predictions, no metrics, no model loading, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.14 — DEV detection evaluation design (status record)

> **This is a status record, not a plan.**
> - **How M22.14 was delivered:** in the conversation of 2026-11-03, read-only, and never committed at the time.
> - **What this file records:** its existence, what it found and what it left for the owner, from that delivered text only. No detail has been added.
> - **What it does not contain:** execution steps, deliberately.
> - **What it is not:** it authorises nothing, and it does not lift the evaluation restriction (`agentos/blockers.md` B-07).
> - **Its status since M22.19:** the owner's Option B scope change defers all detector-performance research to **FR-01** (`agentos/registry/future-research-register.md`), which is **not authorised for execution**.

## Hypothesis

A controlled DEV detection evaluation of the T1-v2 epoch-39 checkpoint and of the original T1 could be designed from existing, verified components, without the blocked M22 runner.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`).

**Starting point:** HEAD `339a6c2`.

**What was done:** read-only inspection of code and records.

## Expected result

A design, and the list of decisions needed before any inference.

## Actual result

### Verified at the time (FACT, read-only)

- **Checkpoints:** all 40 re-hash to the M22.13 record; the best, `checkpoint-e39.pt`, is `a485425d…26025c0d`. Files were read for hashing only, never loaded.
- **Data and T1:** candidates 1 and 2, the G10 and manifest hashes, and T1 (`ba6d9e93…`, ADR-0003) were unchanged.

### What the inspection found

- **The scorer refuses a dataset without every split.** `packages/evaluation` `evaluate()` always validates the dataset, and `assertNoLeakage` refuses any dataset in which `train`, `dev` or `test` is empty (`labels.ts`, `EMPTY_SPLIT`). A DEV-only dataset therefore cannot be scored without a sample labelled `test`. A never-rendered placeholder construction exists as precedent in the M22 helpers; it is not TEST data, but it needs an owner decision under the TEST prohibition.
- **The old QG-05 runner (`tools/detector/run-qg05-eval.mjs`) is not reusable.** It is tied to `t1-ui-v1`, its TEST split and the superseded max-mAP threshold rule.
- **The legacy decode is not reusable either.** The legacy Python `predict_split` keeps every class above 0.05 per anchor and does not clip to the content, whereas the shipped decode keeps one best class per anchor. Any evaluation must follow the shipped decode.
- **Runtimes:**
  - **T1:** the original T1 exists only as ONNX; there is no `.pt`.
  - **T1-v2:** it exists only as a PyTorch checkpoint. ONNX export is not authorised.
  - **Consequence:** the two models could only run on different runtimes, an asymmetry that would have to be stated.
- **Committed, tested helpers exist:** `tests/browser/support/small-target-eval.mjs` holds pure matching and accounting helpers, including the M22 amendment-2 matching rule.
- **Two pre-registered rules disagree.** On full occlusion, M22 design amendment 2 ignores predictions on any excluded element, while the M22.12 plan counts predictions on full occlusion as false positives.

### Biases it stated

- every DEV figure would be selection-biased;
- T1-v2 would be evaluated in distribution, T1 out of distribution;
- T1's icon class is unusable (M22.1);
- with 44 objects per cell, differences below about 0.2 are not resolvable.

### Left for the owner (never decided)

1. Authorise DEV inference of T1-v2 and the original T1.
2. Rule whether the T1 baseline, which serves the same purpose as the blocked M22 evaluation, is the blocked operation.
3. Decide the scorer's `test`-split requirement: placeholders, or a scorer change behind an ADR.
4. Decide the full-occlusion rule.
5. Choose the headline view.

**Also raised:** ONNX export and the `onnxruntime` version (W1 has 1.20.1; the earlier reference used 1.29.0).

## Conclusion

**Overtaken by Option B.** M22.14 produced a design and a decision list, not an evaluation. None of its decisions was taken. In M22.19 the owner chose Option B: M22's engineering scope closes, and detector-performance research moves to FR-01, deferred and not authorised.

**What this record is not:** permission to execute.

## Reproducibility

Read-only. It is reproduced by reading the files named above at commit `339a6c2` or later. Nothing was executed.
