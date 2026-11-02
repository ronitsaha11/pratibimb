# M22.10 — baseline and evaluation plan (design only; NOTHING RUN)

> **Nothing was run:** no T1 inference and no new-model inference, no predictions, and no evaluator invocation.
> **Separate authorisation:** detector inference on DEV, for the new model and for the T1 baseline, needs its own owner authorisation (D8).
> **The blocked runner stays blocked:** this plan does **not** recreate, rename, split, disguise or route anything through the blocked M22 runner (`tests/browser/perception/run-small-target-eval.mjs`). Any DEV evaluation tool is a separate, owner-authorised item.

## 1. Two kinds of number, never mixed

| Kind | What it is | Where it comes from in this experiment |
|---|---|---|
| **Training-time measurements** | TRAIN loss, DEV loss, gradient norms, durations, checkpoint sizes | the training run itself. DEV loss comes from forward passes on DEV inside the run, so **the training authorisation must say explicitly that it includes DEV forward passes for loss** (D3) |
| **DEV detection metrics** | precision, recall, F1, mAP, confusion, per cell | a **separately authorised** DEV evaluation of the selected checkpoint (exported), with the same procedure applied to T1 |
| **Unbiased test metrics** | an estimate of performance on unseen data | **None exist and none will be produced.** No v2 TEST split exists (M22.4 limitation). TEST is out of scope until its authorisation is hardened. The `t1-ui-v1` test split was already read once (`docs/testing/threshold-selection.md` §4) and is not to be accessed |

**Labelling rule:** every DEV figure is labelled **"DEV — validation, selection-biased"**. The reason is that DEV is used three times:
1. checkpoint selection (DEV loss);
2. threshold selection (the frozen rule below);
3. reporting.

A DEV figure is therefore an **optimistic** estimate and is never presented as a measure of detector quality.

## 2. Measurements the experiment must eventually report

| # | Measurement | Definition | Source |
|---|---|---|---|
| 1 | **Training loss** | per step: total, cls and box, plus LR and pre-clip gradient norm. Per epoch: mean over its 150 steps | training run |
| 2 | **DEV loss** | per epoch, eval mode, no grad: Σ over all DEV of the focal numerator / Σ positive cells, and the same for the box term; total = cls + 5 × box. Decomposed by class and size bucket | training run |
| 3 | **Precision** | TP / (TP + FP) at the selected threshold. This is the evaluator's "grounding accuracy" (`threshold-selection.md` §2) | DEV evaluation |
| 4 | **Recall** | TP / (TP + FN) over the 1,408 DEV positives ("element recall") | DEV evaluation |
| 5 | **F1** | harmonic mean of 3 and 4. It is also the quantity the frozen threshold rule maximises | DEV evaluation |
| 6 | **Per-class metrics** | 3, 4 and 5 plus AP@0.5 for each of the 8 classes | DEV evaluation |
| 7 | **Per-size-bucket metrics** | 3, 4 and 5 for each bucket, and **recall for each of the 32 class × bucket cells**, with Wilson 95 % intervals | DEV evaluation |
| 8 | **FP and FN counts** | FN per class × bucket. FP per predicted class and per predicted-box size bucket, since a false positive has no ground-truth bucket. Also: FP on an excluded partial-occlusion control, counted separately (§4) | DEV evaluation |
| 9 | **Confusion analysis** | matching that ignores class (IoU ≥ 0.5) yields an 8 × 8 predicted-vs-true class matrix, plus a background column (FP) and a missed row (FN). Each look-alike pair (button / link / tab, select / textbox, checkbox / radio, icon / button) is reported explicitly | DEV evaluation |
| 10 | **mAP@0.5** | the benchmark contract's Rule 2 metric, reported alongside 3–5, never instead of them (`threshold-selection.md` §1 explains why it cannot choose a threshold) | DEV evaluation |
| 11 | **Model size** | parameter count (expected 61,468); `state_dict` bytes; ONNX bytes and SHA-256 if exported | run record / export |
| 12 | **Training duration** | wall time in total, per epoch, and per step (mean, p50, p95), plus DEV-pass time. Thread count and machine are named. Peak process memory is read through `ctypes` (`GetProcessMemoryInfo`), so no new dependency is needed (`psutil` is not installed on W1) | training run |
| 13 | **Best checkpoint and stopping epoch** | best epoch (minimum DEV loss), its DEV loss, the stop epoch and reason, and (Option A) the epoch where patience 5 would have stopped | training run |
| 14 | **T1 baseline** | 3–10 for the shipped T1 on the same DEV, through the same decode, NMS, matching and threshold rule | DEV evaluation |
| 15 | **Stability** | (if D6 authorises) the spread of 1, 2, 4, 5 and 7 across seeds | repeat runs |

## 3. Matching, decode and threshold rule (fixed in advance, before any DEV prediction exists)

- **Decode:**
  - the shipped decode and NMS: `decodeHeadOutputAccounted` with an explicit `thresholds` argument, which already exists since `840517f` and defaults to the shipped values, plus `projectToCapture`;
  - so measurement uses the exact production post-processing, not a copy;
  - per-class NMS at IoU 0.5.
- **Matching:** the existing QG-05 evaluator (`packages/evaluation/src/evaluator.ts`), used as is (FACT, read):
  - **order:** per class, predictions are sorted by confidence, with ties broken by sample id, then box x, then box y;
  - **match:** each prediction takes the **highest-IoU unclaimed** ground truth of the **same class** in its sample, and is a TP if that IoU is ≥ 0.5; otherwise it is an FP;
  - **once only:** each ground truth matches at most once;
  - **AP:** all-point interpolated (COCO convention).
  - **Data format:** the evaluator is built for the evaluation-dataset format. Whether candidate 2's v2 manifests can be scored directly, or need a tested conversion, is UNKNOWN.
  - **Not reusable:** `tools/detector/run-qg05-eval.mjs` is hard-wired to `t1-ui-v1`, its TEST split and the old rule.
- **Threshold:** the **frozen** rule of `docs/testing/threshold-selection.md`:
  - **select:** maximise `F1(element recall, grounding accuracy)` on DEV;
  - **grid:** 0.05 … 0.90 in steps of 0.05;
  - **ties:** exact ties break to the higher threshold;
  - **interior:** the maximum must be interior, otherwise extend the grid and re-run.
  - The rule is applied **separately** to T1 and to the new model; each gets its own selected threshold, also reported.
  - **Not to be used:** "max mAP on DEV", the rule in `run-qg05-eval.mjs`, which that document already found defective.
- **Precision of the selected threshold:** with 160 DEV screens, the band of near-maximal thresholds is expected to be wide. `threshold-selection.md` §3 found F1 within 0.01 across 0.55–0.65 on 40 screens. Report the band, not just the argmax.
- **Uncertainty:** per-cell recall at n = 44 has a wide Wilson 95 % interval (FACT, arithmetic):

  | Recall | Interval at n = 44 |
  |---|---|
  | 0.8 | [0.660, 0.892] |
  | 0.5 | [0.358, 0.642] |

  So **differences between cells, or between T1 and the new model in one cell, smaller than about 0.2 are not resolvable on DEV.** Per bucket (n = 352) the interval at 0.8 is [0.755, 0.838]; overall (n = 1,408) it is [0.778, 0.820].

## 4. Excluded controls during evaluation (owner decision D10)

- **The problem (FACT):** DEV has 128 partial-occlusion and 128 full-occlusion controls that the adapter excludes from targets. Their pixels stay in the frames.
- **INFERENCE:** a correct detection of a partially occluded control would be scored as an FP.
- **Recommended:**
  - a prediction with IoU ≥ 0.5 against an excluded **partial-occlusion** control is **ignored**, neither TP nor FP, and counted separately;
  - full-occlusion controls are invisible, so a prediction on them stays an FP.
  - This needs the evaluation to read the excluded annotations from the DEV manifest, which `data_v2` does not return today; it would be a new, tested read path.

## 5. The T1 baseline: what it can and cannot show

- **The baseline:** T1 (`ba6d9e93…`) on candidate 2 DEV, same procedure, own selected threshold.
- **Training data (FACT):** T1 was trained on `t1-ui-v1` TRAIN (120 samples, a different generator), and the new model is trained on candidate 2 TRAIN.
- **INFERENCE:** the new model is evaluated **in distribution** and T1 **out of distribution**. A new-model advantage on candidate 2 DEV is therefore expected, and on its own **does not show** better behaviour on real pages or on other generators. Report it as "in-distribution DEV comparison", not "improvement".
- **Small targets:** the question M22 asks is answered by the **very-small and small bucket** rows (§2 #7), not the aggregate.

## 6. Report layout (when the evaluation is authorised)

1. Run record summary: §2 #1, 2, 11, 12 and 13.
2. A table of new model vs T1 on DEV: overall, per bucket, per class; P / R / F1 / AP@0.5; selected thresholds and bands.
3. The 32-cell recall heat table with intervals, for both models.
4. FP / FN breakdowns and the confusion matrix.
5. Limitations, as in `risks.md` §1, verbatim.
6. The label "DEV — validation, selection-biased; no unbiased test estimate exists", on every table.

---

**Amended by M22.12 (2026-11-03).** Parts of this document are superseded by `artifacts/experiments/M22.12-occlusion-mask-and-config/evaluation-plan-update.md`. The text above is kept unchanged as the M22.10 record.
