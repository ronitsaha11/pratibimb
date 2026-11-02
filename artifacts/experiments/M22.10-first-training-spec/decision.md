# M22.10 — decision record

**A specification for the first T1 retraining experiment is ready for owner review. Nothing was trained, built, stepped or predicted, and no code changed.**

| Part | Status | Evidence |
|---|---|---|
| Checkpoint | VERIFIED: HEAD `579bea6`; candidates 1 and 2, the G10 hashes and T1 equal to their records; protected code unchanged | `logs/w1-checkpoint-verification.json` |
| `npm run verify` | PASS: repository check 0 failures and 0 warnings; JavaScript 3,159 passed, 22 skipped; Python 100 passed | this milestone's run |
| Hyper-parameter review | 14 parameters reviewed: **8 kept**, **2 changed** (checkpoint frequency; early stopping, owner decision), **4 kept with additions or corrections** (weight-decay rationale withdrawn, clip logging, determinism, step invariant) | `hyperparameter-review.md` |
| Experiment specification | PROPOSED: success definition, failure conditions F1–F15, recovery, T1 protection | `experiment-specification.md` |
| Evaluation plan | DESIGN ONLY: 15 measurements, the fixed evaluator and frozen threshold rule, DEV figures labelled selection-biased | `evaluation-plan.md` |
| Risks | 14 reviewed. New: partial occlusion trained as background; a latent `assign_targets` ordering defect (0 effect on candidate 2). Also: the known label/raster defect is inactive on candidate 2 (0 of 760 samples) | `risks.md`; `logs/w1-candidate-2-positive-cells.json`; `logs/w1-candidate-2-letterbox-offsets.json` |
| Resources | Analytic. CPU-only; about 81.7 TFLOP (Option A); memory risk from float preloading; **duration UNKNOWN** | `resource-estimate.md` |
| Final configuration | **PROPOSED, PENDING OWNER APPROVAL**, every field marked | `final-configuration.PROPOSED.json` |
| M22.9 proposal file | **UNCHANGED** (canonical `1d9057ea…41c3d`) | `logs/w1-checkpoint-verification.json` |

## Blockers before a training run

1. **D1–D4:** approve the configuration; authorise one implemented and tested training run, including DEV-loss forward passes; and choose the early-stopping option.
2. **D5 and D7:** the resume policy and the wall-clock budget.
3. **D8–D10:** DEV evaluation (detector inference for the new model and T1), export, and the handling of partial occlusion. These are needed before any metric beyond loss.
4. **CI:** the `detector-adapter` job's first run, which needs a push.
5. **TEST** stays out of scope (D12).
