# First training experiment: configuration proposal (PENDING OWNER REVIEW; NOT APPROVED)

> **The file:** `tools/detector/configs/train-v2-first-experiment.PROPOSED.json`, with `approval.approved: false`.
> **Not approved:** none of these values is approved. Training is not authorised in M22.9, and nothing here was run.
> **No TEST:** TEST was not used, and must never be used, to choose any value.

## 1. Keep the existing architecture for the first experiment

`head.UiHead` (widths 16 / 32 / 64, stride 8, 640 input, the eight classes in their order) is the shipped T1 head.

**Why keep it:** the question the first experiment answers is whether the v2 data changes what the head learns. Changing the model at the same time would make any difference unattributable.

**Same input path:** it also means the trained weights fit the existing export and runtime path unchanged. The 640 letterbox, pad value and decode are frozen product contracts.

## 2. Fixed for the first experiment

| Fixed | Why |
|---|---|
| Architecture, widths, stride, input size, class order | attribution (above) and the frozen runtime contract |
| Input path: letterbox, `css_box_to_model`, `assign_targets` (≥ 1 positive cell per object) | identical to v1; the dry run and pre-flight check it |
| Loss: `targets.detector_loss` (focal α 0.25, γ 2; box weight 5.0) | v1's loss; changing it would confound the data effect |
| No augmentation | v1 had none; adding it is a separate, measurable change |
| Data: candidate 2 TRAIN, approved-G10 VISIBLE positives only; DEV for validation | owner decision of M22.9 |

## 3. Proposed values

| Setting | Proposed | Source | Vary later? |
|---|---|---|---|
| Batch size | 4 | v1 | yes, with the learning rate |
| Optimizer | AdamW | v1 | rarely |
| Learning rate | 3e-3 | v1 | **yes**, first to sweep (on DEV only) |
| Weight decay | 1e-4 | v1 | yes |
| Gradient clip norm | 10.0 | v1 | rarely |
| Schedule | cosine over the run's maximum steps | v1 (cosine over its steps) | yes |
| Epoch limit | 40 → 150 steps/epoch × 40 = **6,000 steps** | v1 ran 4,000 steps on 120 samples (≈ 133 epochs); 600 samples need fewer passes | yes |
| Seed | 20261102 | new, recorded | repeat at 2–3 seeds before any claim |
| Checkpoint | every 5 epochs, plus the best DEV loss | — | — |
| Early stopping | DEV loss; patience 5 epochs; min delta 0.001 | — | yes |

## 4. Epochs and stopping

**Stopping condition:** the run stops at whichever comes first:
- 40 epochs;
- 5 epochs without a DEV-loss improvement of at least 0.001.

The kept model is the **best DEV-loss checkpoint**, not the last one.

**Why 40 epochs:** it gives the loss room to plateau. That is an INFERENCE from v1 having trained to a plateau in fewer passes over a smaller set; the run will show whether it holds. 6,000 steps of the same small head v1 trained on CPU is a modest cost. It is an upper bound, not a target.

## 5. Avoiding overfitting the synthetic set

**Risk:** the data is synthetic and regular, so a head can learn generator artefacts instead of controls. Examples:
- the "Go"/"OK" word share;
- solid occluders;
- grid-aligned layouts;
- palette-specific shading.

**Mitigations within this experiment:**
- early stopping on DEV;
- weight decay;
- no repeated passes past the plateau;
- reporting the per-cell DEV results, not one aggregate.

**Mitigations after it:** if DEV shows artefact learning, add appearance augmentation, or real-page data under its own approval. Do not tune harder on DEV.

## 6. How DEV is used

**Allowed uses:**
- early stopping;
- choosing the best checkpoint;
- the decode-threshold sweep;
- reporting.

**What DEV figures are:** tuned figures, not an unbiased estimate.

**Claims of detector quality:** these require a **separately authorised evaluation**. TEST stays out of scope until its authorisation is hardened.

## 7. What the eventual experiment must report

All on DEV, labelled as tuned:
- **Losses:** loss curves (TRAIN and DEV; classification and box components).
- **Detection quality:** per class × size cell, precision and recall at the chosen threshold, using the M22 matching rule (IoU ≥ 0.5, valid-first).
- **Calibration:** the threshold sweep curve and the chosen threshold.
- **Comparison:** the same DEV figures for the **shipped T1 head on the same DEV**, as the baseline. Running T1 on DEV is detector inference, which needs its own authorisation.
- **Stability:** seed spread (2–3 seeds).
- **Provenance:** the full record (`train_v2.provenance_plan`) and the output model's SHA-256, labelled UNADOPTED.
