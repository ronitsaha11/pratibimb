# M22.13 — decision record

**The one authorised training run COMPLETED: 40 epochs, 6,000 optimizer steps, best checkpoint epoch 39 (DEV loss 2.8933). This is training execution only: no detection evaluation, no export, no TEST. The candidate is UNADOPTED.**

| Part | Status | Evidence |
|---|---|---|
| Masked loss | equals `detector_loss` bitwise (value and gradients) with an empty mask; masked entries get zero gradient; positives, box term and normaliser untouched | `tests/test_loss_v2.py` (24) |
| Training loop | the authorised loop with fail-closed conditions; interrupt-and-resume bitwise equal to an uninterrupted run (fixture) | `tests/test_training_v2.py` (10); `tests/test_train_v2.py` |
| Approved configuration | the M22.12 proposal with only the approval set (project owner, 2026-11-03) | `configs/train-v2-first-run.APPROVED.json`; a test |
| Pre-training gate | 227 Python tests; `npm run verify` PASS; final pre-flight PASS at `95b0ffb` | this milestone's runs |
| Run | COMPLETED in one session: 40 epochs, 6,000 steps (scheduler 6,000, final LR 0.0); 600 TRAIN and 160 DEV samples every epoch; no failure condition | `logs/w1-run-record-first-run-01.json` |
| Loss | TRAIN 4.271 → 2.837; DEV 3.983 → 2.893 (best, epoch 39); DEV spikes while the learning rate was high | same |
| Stability | no non-finite value; 185 / 6,000 steps clipped; max gradient norm 53.67 (epoch 1) | same |
| Checkpoints | 40, all re-verified after the run; best `checkpoint-e39.pt` `a485425d…26025c0d` | README §7 |
| Early stopping (record-only) | would have stopped at epoch 30; the run continued by configuration | same |
| Preservation | T1 `ba6d9e93…5179d0` unchanged; candidates 1 and 2 unchanged; legacy code, production detector and earlier records unchanged; weights only in the git-ignored run directory | this milestone's checks |
| Limitation | the in-process memory reader returned no value; external peak working set 1,840 MB (epoch 14). Slow epochs from machine contention or sleep (epoch 39: 31,445 s) | README §8 |

## Remaining approvals (detector evaluation)

1. **DEV detection evaluation:** inference of the best checkpoint on DEV, and **T1 baseline inference** on the same DEV, through the shipped decode and NMS, scored with the frozen threshold rule and the M22.12 report groups. The figures are labelled selection-biased.
2. **The evaluation tool:** it must not be, recreate or route through the blocked M22 runner. Also decide how candidate 2's format reaches the existing evaluator.
3. **ONNX export and the ORT parity check** of the selected checkpoint, with the pinned native `onnxruntime` version (W1 has 1.20.1; the earlier reference used 1.29.0).
4. **A fix to `train_v2.peak_memory`** before any further run (it returns no value on W1).
5. **Any further run** (another seed, a sweep, or a fixed assignment order per the ADR proposal) needs its own authorisation.
6. **TEST** stays out of scope until its authorisation is hardened; no unbiased estimate exists.
7. **CI:** the `detector-adapter` job's first run needs a push.
