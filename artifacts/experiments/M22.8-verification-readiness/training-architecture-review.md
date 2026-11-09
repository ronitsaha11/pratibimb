# Review of `train-v2-design.md` (M22.7): no training implemented or run

The design is in `artifacts/experiments/M22.7-training-adapter/train-v2-design.md`, preserved as
written. This review checks it against the M22.8 requirements and lists amendments a future
implementation must also satisfy.

| Requirement | Design | Verdict |
|---|---|---|
| Uses TRAIN for training | `V2SplitDataset(root, "train", g10)` | **meets** |
| Uses DEV for validation | `V2SplitDataset(root, "dev", g10)`; loss and threshold sweep on DEV only | **meets** (see note 4) |
| Never calls the legacy trainer | "does not import or call `train.py`'s `main`"; imports model and loss definitions only | **meets**, with amendment 1 |
| No TEST path | adapter refuses any other split before file access; no split argument, no TEST prediction | **meets**, with amendment 2 |
| Writes to a new model output directory | `artifacts/models/t1-ui-head-v2-<run id>/`; refuses if it exists | **meets** |
| Cannot overwrite the existing T1 model | refuses the T1 directory "or inside it" | **meets**, with amendment 3 |
| Checks the T1 model hash before and after | "checked before and after the run and must be unchanged" | **meets**, with amendment 3 |
| Records training configuration and dataset hashes | `run-record.json`: candidate, manifest hashes, G10 configuration and approval, counts, seed, hyper-parameters, git commit, source hashes, environment, model hashes | **meets** |

## Amendments for the future implementation

1. **Do not import `train.py` at all.** Its module defines `DATA` (the legacy dataset path) and `OUT` (the T1 model directory) at import time. Take `UiHead`, `decode` and `detector_loss` from `head.py` and `targets.py` only. Add a test that `train_v2.py` imports nothing from `train`.
2. **Make "no TEST" testable.** Add a static test that `train_v2.py` has no `split` argument and never passes a split other than `"train"` or `"dev"`. The adapter's refusal-before-file-access test already covers the data side (`test_a_refused_split_touches_no_file_at_all`).
3. **Compare against the registry, and guard paths robustly.**
   - The T1 check compares the artifact's SHA-256 with the **registry value** (`ba6d9e93…5179d0`) before the run (refuse to start on a mismatch) and after (fail the run).
   - Output-path guards compare **resolved, case-normalised** paths. Windows paths are case-insensitive, so `T1-UI-HEAD` must not slip past a string comparison.
4. **What DEV can claim.** Using DEV for both validation (early stopping, threshold sweep) and reporting means DEV figures are tuned, not an unbiased estimate. Any claim of detector quality needs a separately authorised evaluation. TEST stays out of scope until its authorisation is hardened.

## Not in scope

Implementing `train_v2.py`, running it, comparing a model with T1, exporting it, adopting it, and building or evaluating TEST. None of these is authorised.
