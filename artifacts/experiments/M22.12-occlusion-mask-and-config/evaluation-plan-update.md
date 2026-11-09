# M22.12 — DEV evaluation plan update (amends M22.10 `evaluation-plan.md`)

> **Design only:** no inference was run.
> **Selection-biased:** DEV results stay labelled **"DEV — validation, selection-biased"**. DEV selects the checkpoint and the threshold, and no unbiased test estimate exists.
> **The blocked runner stays blocked:** the M22 evaluation runner (`tests/browser/perception/run-small-target-eval.mjs`) is untouched. Any DEV evaluation tool is a separate, owner-authorised item.

## 1. Report groups

Every group is reported for both the new model and T1, at each model's own threshold under the frozen rule (`docs/testing/threshold-selection.md`).

| Group | What it holds | Why |
|---|---|---|
| Size bucket | very-small, small, medium, large: P, R, F1, TP, FP, FN; per-bucket recall with Wilson 95 % intervals | M22's question is very-small and small recall |
| **Covered centre vs nearest-cell fallback** | recall for objects whose box contains a grid-cell centre, and separately for objects trained through the nearest cell. In DEV the fallback group is 93 of 352 very-small objects; the other buckets have none (M22.11) | the 25.9 % fallback group has an IoU ceiling of 0.533–1.0 (M22.11), so it may behave differently |
| Class | P, R, F1, AP@0.5 for each of the 8 classes | — |
| Class × size bucket | recall for each of the 32 cells (n = 44 each), with intervals | per-cell differences below about 0.2 are not resolvable (M22.10) |
| False negatives | FN per class × bucket, and per covered / fallback | — |
| False positives | FP per predicted class and per predicted-box size bucket | an FP has no ground-truth bucket |
| **Partial-occlusion exclusion** | predictions matching (IoU ≥ 0.5, same class) an excluded **partial-occlusion** control are **ignored**: neither TP nor FP. They are counted separately per class (DEV: 128 cases) | consistent with the training ignore mask |
| Full occlusion | a prediction on a fully occluded control is an FP | its pixels are the occluder |
| Ignored regions | the DEV ignore-mask totals the run used (6,999 entries; per class in `logs/w1-preflight-first-run-candidate-2.json`). DEV loss is reported with the mask applied, and also without it as a diagnostic | — |
| Confusion | 8 × 8 class confusion among class-agnostic IoU ≥ 0.5 matches, plus background and missed rows | — |

## 2. What the evaluation needs

These are UNKNOWN or not yet built, and each needs authorisation:
1. **Excluded annotations:** the evaluator must read the DEV excluded-annotation list. The adapter now carries `occlusionCases` on every sample (M22.12), so this needs no new manifest reader.
2. **Covered or fallback flag:** each DEV object needs one. It is computable exactly from the same geometry as M22.11; that is data only.
3. **Dataset format:** whether the existing evaluator (`packages/evaluation`) can take candidate 2's format directly, or needs a tested conversion, is UNKNOWN (M22.10).
4. **Inference:** detector inference on DEV, for the new model and for T1, needs its own owner authorisation (M22.10 D8).

## 3. Labels

| Kind of figure | Label |
|---|---|
| DEV metrics | DEV, validation, selection-biased |
| Training-time losses | measured during the run |
| Figures with no measured source | UNKNOWN |

The mask arithmetic (26,953 / 6,999 ignored entries) is an exact count. It is **not** evidence of any training-quality effect.
