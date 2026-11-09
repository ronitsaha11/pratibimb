---
id: M22.12-occlusion-mask-and-config
title: "M22.12 — partial-occlusion classification ignore mask and first-run configuration hardening"
status: recorded — ignore-mask helper and schema-2 configuration implemented and tested; NO TRAINING, NO INFERENCE
date: 2026-11-03
label: FACT (tests, pre-flight and mask counts on W1); INFERENCE where marked
classification: TRAINING SUPPORT (no execution) — no training, no optimizer, no forward or backward pass, no predictions, no weights, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.12 — partial-occlusion ignore mask and configuration hardening

> **No execution:** no model was trained and no optimizer was created. No forward or backward pass, prediction, checkpoint or weight file exists.
> **Structure only:** the receptive-field test builds `UiHead` on PyTorch's **meta** device, which allocates no parameter storage and runs no forward pass.
> **Unchanged:** `train.py`, `data.py`, `targets.py`, `head.py`, the production detector, candidates 1 and 2, and the T1 model.
> **No TEST:** TEST was not accessed.

## Documents

| File | Contents |
|---|---|
| `training-specification-update.md` | Canonical configuration, mask application, added failure conditions |
| `evaluation-plan-update.md` | DEV report groups: size buckets, covered and fallback objects, class, class × size, FN / FP, partial occlusion |
| `adr-proposal-target-assignment-order.md` | Options A, B and C for the shared-cell ordering defect (PROPOSED) |
| `logs/w1-preflight-first-run-candidate-2.json` | Pre-flight of the canonical configuration on candidate 2, including the mask totals |

## Hypothesis

A pure helper, built from the candidate's own occluder provenance and the exact receptive field of `head.UiHead`, can remove the contradictory negative supervision M22.11 found. It should:
- leave positives, box targets and the legacy code untouched;
- not train anything.

The first-run configuration can also be expressed in a validated schema in which every M22.10 decision is checkable.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300, 16 logical CPUs.

**Software:** Python 3.13.14, torch 2.14.0+cpu, numpy 2.5.1, pillow 12.3.0, Node v24.22.1.

**Data:** candidate 2, Chromium 153.0.8010.12 (M22.6), read through the approved adapter only.

## Expected result

- **Mask:** semantics proven by deterministic synthetic tests; counts on candidate 2 measured, with no positive ever masked.
- **Configuration:** the validator refuses every malformed or inconsistent schema-2 field, and the canonical proposal pre-flights cleanly on candidate 2.
- **Nothing executed.**

## Actual result

### 1. Ignore-mask semantics (`tools/detector/occlusion_mask_v2.py`)

**The mask:** a boolean array [A, C] = [6,400, 8] per sample, shaped like `cls_t` from `data.sample_to_tensors`. Stacked and permuted (0, 2, 1) it is [N, C, A], the shape `detector_loss` gives the class logits.

**When an entry (cell a, class c) is ignored:**
1. a **partial**-occlusion case of class c has a visible region (its box minus its occluder's **rendered** box, both in model px through `targets.css_box_to_model` and the same letterbox clip as `sample_to_tensors`);
2. that region intersects cell a's receptive field with positive area;
3. **and** `cls_t[a, c] ≠ 1`, so **positives always take precedence**.

**What is never ignored:**
- other class channels at the cell;
- anything for **full** occlusion, whose pixels are the occluder and correctly background;
- box targets, which are not an input.

**Refusals:** the helper refuses missing or invalid provenance and invalid dimensions or values (`MaskError`).

**Receptive field, exact:**
- **The layers:** `TRUNK_LAYERS` = (3, 2, 1) × 3, (3, 1, 1), and (1, 1, 0) as (kernel, stride, padding).
- **Composed:** a size of 31 px, jump 8, centred on input pixel 8i, so cell (r, c) sees [8c − 15, 8c + 16) × [8r − 15, 8r + 16).
- **Checked:** a test compares the table with the real `UiHead` module structure on the meta device, and confirms there is no pooling or dilation.
- **Limitation:** this is the **convolutional** support. In training mode BatchNorm's batch statistics couple every output weakly to every pixel of the batch. That coupling is not spatial and is not represented.

**Adapter (`data_v2.py`):**
- each sample now carries `occlusionCases`: class, box, intent, and the occluder's rendered box, or `None`;
- an occluder recorded for another element is refused;
- `sample_to_tensors` never reads this key, so the targets are unchanged.

### 2. Measured on candidate 2 (pre-flight, commit `31239ea`)

| Ignored classification entries | TRAIN | DEV |
|---|---|---|
| button | 2,856 | 817 |
| link | 4,415 | 1,319 |
| textbox | 6,172 | 1,253 |
| checkbox | 1,995 | 521 |
| radio | 2,072 | 563 |
| select | 4,299 | 1,223 |
| tab | 3,061 | 785 |
| icon | 2,083 | 518 |
| **Total** | **26,953** (0.088 % of 30,720,000 class entries) | **6,999** (0.085 % of 8,192,000) |
| Partial cases with a visible region | 480 / 480 | 128 / 128 |
| Samples with ignored entries | 340 | 87 |
| Full-occlusion cases (nothing ignored) | 480 | 128 |
| **Positive-precedence conflicts** (stay supervised) | **14** (radio 3, select 6, tab 5) | **40** (link 40) |
| Ignored entries at cells positive for another class | 156 | 24 |

**Why this exceeds M22.11's 7,405 visible-region cells:** M22.11 counted cells whose **centre** lies in the visible part. The mask covers every cell whose 31 px field **sees** it, as the owner specified.

**What a conflict is:** a nearby positive of the **same class**, whose entry stays a positive.

**These are exact counts, not training-quality evidence.**

### 3. Tests (`tests/test_occlusion_mask_v2.py`, 35)

**The twelve required properties:**
1. the right entries are masked;
2. unrelated classes stay supervised;
3. full occlusion masks nothing;
4. positive precedence, with conflicts counted;
5. union over several cases;
6. independent classes;
7. empty input gives an all-false mask;
8. invalid dimensions or values are refused (5 cases);
9. missing provenance is refused (8 cases);
10. identical output on repeated input, with no input mutated;
11. box targets are untouched and not an input;
12. the shape matches the loss tensor.

**Also covered:**
- **receptive-field boundaries (7 cases):** an edge exactly on a field boundary is not a hit, half a pixel in is a hit, and the canvas edges behave correctly;
- an occluder covering everything leaves nothing visible;
- **letterboxed coordinates:** checked against the real `sample_to_tensors` at 1280 × 720;
- the adapter's `occlusionCases`, including the foreign-occluder refusal;
- the receptive field against the real module.

**The reference:** expected masks come from an independent pixel-by-pixel reference, not from the helper's window arithmetic.

### 4. Configuration schema 2 (`train_v2.validate_run_config`)

**New fields:**
- `schemaVersion` (`train-v2-run-config/2`; schema 1 is refused, not upgraded);
- `steps` {perEpoch, max};
- `determinism` {deterministicAlgorithms: required, cpuThreads};
- `devEvaluation` {everyEpochs, batches, lossAggregation: dataset-sum};
- `checkpoint` {everyEpochs, retention: all, best: strict-min-dev-loss};
- `earlyStopping.action` (record-only or stop);
- `optimizer.nonFiniteGradient` (fail) and `gradientClipNorm`;
- `schedule` {name, tMaxSteps, etaMin, stepEvery, warmup};
- `loss.partialOcclusion` (ignore-mask or background).

**Cross-checks:**
- `steps.max` = per epoch × epochs = `schedule.tMaxSteps`;
- the checkpoint frequency is a multiple of the DEV frequency;
- eta_min is below the learning rate.

**Pre-flight (`check_plan_against_data`):**
- exact divisibility, so no partial batch;
- per-epoch and DEV batch counts equal the data's quotients;
- the thread count is at most the machine's CPU count.

**Tests (`tests/test_run_config_v2.py`, 41; plus 7 in `test_train_v2.py`):**
- the canonical values are pinned, and the inherited ones equal the M22.10 final configuration record;
- the M22.9 file is refused;
- both early-stopping actions are expressible;
- 35 malformed or inconsistent fields are refused;
- a shorter consistent plan is accepted;
- the pre-flight data and machine checks, and the mask-provenance refusal.

### 5. Canonical pre-flight on candidate 2

**Result:** PASS at commit `31239ea`, with tracked changes false and the configuration hash `2cb331b5…ef3d8b`.

**Plan:**
- 150 steps per epoch, 40 epochs, 6,000 steps;
- 40 DEV batches per evaluation, 40 evaluations, 40 checkpoints;
- early stopping record-only, partial occlusion ignore-mask;
- 8 of 16 CPUs.

**Data:** TRAIN 600 samples, 5,280 targets, 168,250 positive cells; DEV 160 samples, 1,408 targets, 44,308 positive cells.

**Output:** `t1-ui-head-v2-first-run-01`, not created.

**T1:** unchanged.

### 6. Target-assignment ordering

**ADR proposal:** written (`adr-proposal-target-assignment-order.md`). It recommends A, smaller-object priority, with a stable area-then-index key, in a v2-only function, plus a collision metric in pre-flight. This is the owner's provisional preference.

**Before implementation:** owner approval and regression evidence.

**`targets.py`:** unchanged.

**Candidate 2:** 0 collisions, so this has **no** effect on its current assignment.

### 7. Verification

See `decision.md`.

## Conclusion

The partial-occlusion contradiction now has a tested, exact, opt-in remedy. The first run's configuration is unambiguous and machine-checked.

**Before a run:**
- approve `train-v2-first-run.PROPOSED.json`, including `partialOcclusion: ignore-mask`;
- authorise the training step, including the masked loss variant and its bitwise-equivalence test;
- separately authorise DEV inference.

## Reproducibility

```bash
python -m pytest tools/detector/tests -q
```
```bash
python -I tools/detector/train_v2.py --preflight --candidate=2 --g10-config=tools/dataset/v2/configs/g10-approved-candidate-2.json --g10-evidence=artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json --build-config=tools/dataset/v2/configs/m22.4-train-dev.json --run-config=tools/detector/configs/train-v2-first-run.PROPOSED.json --run-id=first-run-01
```
```bash
python -I tools/detector/dry_run_v2.py --candidate=2 --g10-config=tools/dataset/v2/configs/g10-approved-candidate-2.json --g10-classes=artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json --build-config=tools/dataset/v2/configs/m22.4-train-dev.json --tensors --ignore-mask
```
```bash
npm run verify
```

**Same counts either way:** the dry run reproduces the pre-flight's mask totals exactly (measured: identical per-class counts).
