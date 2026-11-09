---
id: M22.10-first-training-spec
title: "M22.10 — first T1 retraining experiment: specification review for owner approval"
status: recorded — specification PROPOSED, PENDING OWNER APPROVAL; NO TRAINING, NO INFERENCE, NO CODE CHANGE
date: 2026-11-03
label: FACT (checkpoint verification and a data-only measurement on W1); INFERENCE and UNKNOWN as marked in each document
classification: PLANNING (read-only) — no training, no optimizer, no forward or backward pass, no predictions, no weights, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.10 — first training experiment: specification review

> **No execution:** no model was built or trained, no optimizer was created, and no forward or backward pass, prediction, checkpoint or weight file exists.
> **No code change:** no file under `tools/`, `packages/`, `scripts/`, `tests/` or `docs/` was changed.
> **Configuration proposal untouched:** `train-v2-first-experiment.PROPOSED.json` is unchanged.
> **Preserved:** candidates 1 and 2 and the T1 model are byte-identical to their M22.9 records.
> **No TEST:** TEST was not accessed, planned or seeded.

## Documents

| File | Contents |
|---|---|
| `hyperparameter-review.md` | Every proposed parameter, inherited vs new, with verdicts and corrections to the M22.9 proposal |
| `experiment-specification.md` | Inputs, run procedure, configuration record, success definition, failure conditions F1–F15, checkpoints and recovery, T1 protection |
| `evaluation-plan.md` | What must eventually be reported, the fixed matching, decode and threshold rule, and the validation vs test distinction. **Nothing run** |
| `risks.md` | Risks and limitations, with FACT / INFERENCE / UNKNOWN |
| `resource-estimate.md` | Memory and compute from the architecture and W1. **Duration UNKNOWN** |
| `final-configuration.PROPOSED.json` | The final proposed configuration, every field marked INHERITED / RECOMMENDED / PENDING OWNER APPROVAL |
| `logs/w1-checkpoint-verification.json` | Phase 1 evidence |
| `logs/w1-candidate-2-positive-cells.json` | Data-only measurement of positive-cell ownership per class × bucket (no model) |
| `logs/w1-candidate-2-letterbox-offsets.json` | Data-only check of the known label/raster defect (`preprocessing-contract.md` §6) on candidate 2's capture sizes |

## Hypothesis

The M22.9 proposal can be turned into a complete, reproducible and fail-closed experiment specification without running anything. Its inherited values can be justified or corrected from the code, the records and arithmetic alone. Whatever needs measurement is labelled UNKNOWN rather than estimated.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300, Intel Core 7 240H (10 cores / 16 threads), 23.64 GiB RAM.

**Software:** Python 3.13.14, torch 2.14.0+cpu (no CUDA), numpy 2.5.1, pillow 12.3.0, Node v24.22.1.

**Data:** candidate 2, as rendered by Chromium 153.0.8010.12 in M22.6. It was read only through the approved adapter.

## Expected result

**Checkpoint:** verified unchanged.

**Specification and review:** every parameter reviewed, with a full specification, evaluation plan, risk analysis and analytic resource estimate.

**Configuration:** a final configuration with every field marked.

**Nothing executed.**

## Actual result

### 1. Verified checkpoint (FACT, 2026-11-03)

- **Git:**
  - branch `spike/m22-small-target-recall`, HEAD `579bea6`, 50 commits on `077f139`;
  - no upstream, no tracked changes;
  - the two M20 records are kept, untracked.
  - **Over-length subjects** (already disclosed, not amended): `a7e905c` 93 characters, `12ac35f` 92, `579bea6` 93.
- **Candidates:** 1 and 2 have identical file and frame-list hashes to M22.9's `w1-preservation.json`.
- **G10:**
  - `g10-approved-1` is APPROVED (project owner, 2026-11-02);
  - the configuration hash `5cbb059f…7fedbbddf` and thresholds hash `fcce918a…dce78b1` were recomputed and agree;
  - the evidence's canonical hash is `404e0b28…5c29b533` and its raw file hash `d5be72d7…49378`;
  - the evidence names the same configuration, thresholds and manifests (`f283720f…`, `f072507a…`).
- **T1:** `t1-ui-head.onnx`, 302,960 bytes, SHA-256 `ba6d9e93…5179d0`, equal to ADR-0003.
- **Code:**
  - unchanged since `077f139`: `train.py`, `data.py`, `head.py`, `targets.py`, `docs/adr`, `agentos/gates`, `docs/architecture` and `docs/security`;
  - the production detector's only branch change is the earlier `840517f`, which made the decode thresholds an explicit parameter defaulting to the shipped values.
- **Architecture:** `UiHead` 16/32/64, stride 8, input 640, 61,468 parameters, which is arithmetic and equals the W1-QG03 record.
- **`npm run verify`:** PASS. The repository check reports 0 failures and 0 warnings; 3,159 JavaScript tests passed and 22 were skipped; 100 Python tests passed.

### 2. Main findings

1. **Positive cells are heavily skewed toward large objects** (FACT, measured):

   | Bucket | Share of TRAIN positive cells |
   |---|---|
   | very-small | 1.8 % |
   | large | 67.5 % |

   - **Objects are balanced, cells are not:** each cell has 165 objects, yet the large / very-small cell ratio is 37.9×.
   - **Fallback:** 25.9 % of very-small objects train through the nearest-cell fallback.
   - **INFERENCE:** the inherited loss gives very-small objects little signal, and they are the bucket M22 exists to improve.
2. **Weight decay is not a regulariser here** (FACT, arithmetic): it shrinks weights by a factor of 0.9991 over the run, so the M22.9 claim that it mitigates overfitting is withdrawn.
3. **Early stopping interacts with the cosine schedule** (FACT, arithmetic, plus INFERENCE): LR is still 0.69 of its peak at epoch 15. Recommended: run the full schedule, choose the best checkpoint by DEV loss, and record early stopping instead of acting on it (D4).
4. **Partially occluded controls are trained as background** (FACT, code, plus INFERENCE): 480 TRAIN and 128 DEV. Owner decision D10, for training and evaluation.
5. **Latent `assign_targets` ordering defect** (FACT): the comment says the smaller object keeps a shared cell, but the code gives it to the larger. It has **0 effect on candidate 2**, because no positives overlap. Recorded, not changed.
6. **Memory risk on W1** (INFERENCE): v1-style float preloading is about 3.70 GiB, and 3.70 GiB was free when measured. uint8 preloading (about 0.87 GiB) is recommended.
7. **The existing QG-05 runner cannot be reused** (FACT): it is hard-wired to `t1-ui-v1`, its TEST split and the defective "max mAP" rule. Only the evaluator library and the frozen F1 threshold rule carry over.
8. **No unbiased metric is possible in this experiment:** every DEV figure is selection-biased.
9. **The known label/raster defect is inactive on candidate 2** (FACT, measured): all six capture sizes letterbox to whole-pixel geometry, so 0 of 760 samples carry the offset. The same check reproduces the contract's 0.667 px for 960×640. There is no reason to bundle the fix into run 1, but it should be fixed, under an ADR, before adoption (`risks.md` §2.14; D13).

## Conclusion

The specification is complete and awaits the owner. Training stays blocked until D1–D4 are decided. Every detection metric stays blocked until D8–D10 are decided.

### Owner decisions required

| Id | Decision | Recommendation |
|---|---|---|
| D1 | Approve or amend `final-configuration.PROPOSED.json` | approve as marked |
| D2 | Authorise implementing **and** executing the training step in `train_v2.py` (model, optimizer, loop, checkpoints, run record), with its tests, for **one** run | authorise one run |
| D3 | State that the training authorisation includes **DEV forward passes for DEV loss** (no decode, no predictions) | include |
| D4 | Early stopping: **A**, record only and run the full 40 epochs; or **B**, stop at patience 5 / minimum improvement 0.001 | A |
| D5 | Resume policy | only after interruption or external failure, from the last verified checkpoint, flagged |
| D6 | Seed repeats (2–3 seeds) and a repeat-run determinism check | decide after run 1 |
| D7 | Wall-clock budget (F14) | owner sets a value; projected after epoch 1 |
| D8 | Authorise **DEV detector inference** for the selected checkpoint and the T1 baseline, plus the evaluation tool. It must not be, recreate or route through the blocked M22 runner | separate authorisation after run 1 |
| D9 | ONNX export and ORT parity, and which native `onnxruntime` version to pin. W1 has 1.20.1; the QG-03a-B3-1 reference used 1.29.0 | with D8 |
| D10 | Partially occluded controls: training (unchanged, or an ignore mask) and evaluation (ignore matches) | training unchanged for run 1; ignore in evaluation |
| D11 | Device: CPU (pinned) or GPU (a new torch build) | CPU |
| D12 | Path to an unbiased estimate (v2 TEST, after its authorisation is hardened) | later milestone |
| D13 | Open an ADR for the `assign_targets` ordering defect, the label/raster defect (`preprocessing-contract.md` §6) and the stale `UiHead` docstring | yes, before adoption or any dataset with overlapping controls |

**Carried over from M22.9:**
- **CI:** the `detector-adapter` job's first run needs a push.
- **Subject length:** optionally reword the over-length subject of `579bea6`.

## Reproducibility

```bash
npm run verify
```

**The positive-cell measurement:** this milestone adds no code, so the throwaway script that produced `logs/w1-candidate-2-positive-cells.json` is not committed. Its method is stated in that log, and it reproduces from unchanged code:
1. `train_v2.load_train` / `load_dev` under the approved G10 files;
2. the box half of `data.sample_to_tensors`;
3. `targets.assign_targets`, with a mirror that records which object owns each cell.

Its totals equal the M22.9 pre-flight's positive-cell counts: 168,250 and 44,308.
