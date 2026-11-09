# M22.12 — decision record

**The partial-occlusion ignore mask and the schema-2 first-run configuration are implemented, tested and pre-flighted on candidate 2. Nothing was trained, built, stepped or predicted.**

| Part | Status | Evidence |
|---|---|---|
| M22.11 record | committed separately (`388cb95`, `f28c18e`) | `artifacts/experiments/M22.11-target-assignment-audit/` |
| Ignore-mask helper | `occlusion_mask_v2.py`: pure, exact receptive field (31 px, jump 8, checked against `UiHead` on the meta device), positive precedence, full occlusion ignored, box targets untouched | `tests/test_occlusion_mask_v2.py` (35) |
| Mask on candidate 2 | TRAIN 26,953 ignored entries, DEV 6,999; positive conflicts 14 / 40 (stay supervised) | `logs/w1-preflight-first-run-candidate-2.json` |
| Adapter | carries `occlusionCases` with the rendered occluder; refuses a foreign occluder; targets unchanged | same tests; pre-flight tensor counts equal M22.9's (168,250 / 44,308) |
| Configuration schema 2 | `validate_run_config` expresses and checks every M22.10 decision; schema 1 refused | `tests/test_run_config_v2.py` (41) and `tests/test_train_v2.py` (+7) |
| Canonical proposal | `configs/train-v2-first-run.PROPOSED.json`, canonical `2cb331b5…ef3d8b`, **PENDING OWNER APPROVAL** | pre-flight PASS at `31239ea` |
| Assignment-order ADR | PROPOSED (A, smaller wins, stable key, v2-only); `targets.py` unchanged; 0 effect on candidate 2 | `adr-proposal-target-assignment-order.md` |
| Specifications | training and evaluation updates | `training-specification-update.md`, `evaluation-plan-update.md` |
| Preservation | candidates 1 and 2 unchanged; T1 equals ADR-0003; no model directory created; legacy files unchanged | this milestone's checks |

## Remaining approvals before a training run

1. **Configuration:** approve `train-v2-first-run.PROPOSED.json`, including **`loss.partialOcclusion: "ignore-mask"`**. The alternative is `background`, which is v1's behaviour.
2. **Training step:** authorise implementing and executing it in the v2 training support, for one run, including:
   - DEV-loss forward passes;
   - the masked loss variant, with its bitwise-equivalence test against `detector_loss` when the mask is all false;
   - checkpoints and the run record.
3. **Assignment order:** decide the ADR (A, B or C) and whether a v2-only assignment function is acceptable. Not needed for candidate 2.
4. **Resume policy and wall-clock budget** (M22.10 D5 and D7).
5. **DEV inference** for the new model and the T1 baseline, the evaluation tool, export and the ORT pin (M22.10 D8 and D9).
6. **CI:** the `detector-adapter` job's first run, which needs a push.
7. **TEST:** stays out of scope.
