# M22.7 — decision record

**Adapter and dry run implemented; candidate 2 loads. No model was trained, no optimizer step taken,
no weights written, no detector inference run, no TEST touched.**

| Part | Status | Evidence |
|---|---|---|
| `data_v2.py` adapter (TRAIN and DEV only, positives only, frame-verified) | IMPLEMENTED; 31 Python tests pass | `tools/detector/tests/test_data_v2.py` |
| G10 configuration interface (explicit, approval recorded, no default) | IMPLEMENTED | same; `configs/g10-provisional-UNAPPROVED.json` (`approved: false`) |
| `dry_run_v2.py` (no model, no prediction) | IMPLEMENTED; candidate 2: 600 + 160 samples, 760 frames verified, 165 / 44 positives per cell, 1,120 occlusion cases excluded, tensors checked | `logs/w1-dry-run-candidate-2.json` |
| G10 on candidate 2 | PROVISIONAL: 0 BORDERLINE, 0 INVISIBLE; **acceptance not claimed** | `logs/w1-candidate-2-g10-classes-provisional.json` |
| `train_v2.py` | **DESIGN ONLY** | `train-v2-design.md` |
| Legacy `data.py`, `train.py`, `targets.py`, `head.py` | UNCHANGED since `077f139` | `git diff` |
| Candidates 1 and 2 | UNCHANGED, byte for byte, before and after | `logs/w1-candidate-preservation.json` |
| T1 model | UNCHANGED (SHA-256 `ba6d9e93…5179d0` = registry) | — |
| `npm run verify` | PASS: 3,156 passed, 22 skipped; repository check 0 failures | — |

**For the owner:**
1. **G10 thresholds.** Approve them. Until then the adapter reports G10 as diagnostic, and no candidate can be called an accepted training dataset.
2. **Candidate 2.** Decide whether it becomes the training dataset.
3. **Training.** Authorise implementing and running `train_v2.py` under `train-v2-design.md`, or change that design.
4. **The Python tests.** Decide whether `tools/detector/tests` should join `npm run verify`. Today they run separately, and `scripts` were not changed.
