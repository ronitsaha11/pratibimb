# M22.9 — decision record

**G10 approved and verified on candidate 2; the training pipeline exists up to, and not including,
training. No model was trained, no optimizer created or stepped, no inference run, no TEST touched.**

| Part | Status | Evidence |
|---|---|---|
| G10 thresholds | **APPROVED** by the project owner, 2026-11-02, for candidate 2 in its rendering environment only. A separately versioned file, bound to candidate 2's manifest hashes; the provisional file is kept | `tools/dataset/v2/configs/g10-approved-candidate-2.json` |
| Approved-G10 evidence for candidate 2 | 6,688 positives classified: 6,688 VISIBLE, 0 BORDERLINE, 0 INVISIBLE; ids complete and unique; bound by hash | `logs/w1-candidate-2-g10-evidence-approved.json` |
| Candidate 2 condition (≥ 150 TRAIN / ≥ 40 DEV visible positives per cell) | **MET**: 165 / 44 in all 32 cells | same; `logs/w1-preflight-candidate-2.json` |
| Adapter (`data_v2.py`) | approved G10 enforced fail-closed; 15 new tests | `tests/test_data_v2.py` |
| `train_v2.py` | **PRE-FLIGHT ONLY**: no training step exists; 37 safety tests | `tests/test_train_v2.py` |
| Pre-flight on candidate 2 | PASS: accepted TRAIN and DEV, tensor path, output guard (directory not created), T1 unchanged | `logs/w1-preflight-candidate-2.json` |
| First-experiment hyper-parameters | **PROPOSED, PENDING OWNER REVIEW** | `training-config-proposal.md`; `tools/detector/configs/train-v2-first-experiment.PROPOSED.json` |
| Candidates 1 and 2, T1 model, legacy loader, trainer and head, production detector | **UNCHANGED** | `logs/w1-preservation.json` |
| `npm run verify` | PASS: repository check 0 failures; JavaScript 3,159 passed, 22 skipped; Python 100 passed | this milestone's run |

## Blockers before an actual training run

1. **Hyper-parameters.** Approve them, or amend `train-v2-first-experiment.PROPOSED.json`, setting `approval` with the approver and date.
2. **Training authorisation.** Authorise the training step: model construction, optimizer, the training loop, checkpoints and the run record. It is not implemented and must arrive with that authorisation, tested.
3. **DEV evaluation.** The experiment's report (`training-config-proposal.md` §7) includes DEV detection metrics and a T1 baseline on DEV. Both are **detector inference**, and need their own authorisation.
4. **CI.** Confirm the `detector-adapter` job passes on its first run. That needs a push, which is not part of this task.
5. **TEST** stays out of scope. Any claim of detector quality needs a separately authorised evaluation, after TEST authorisation is hardened.
