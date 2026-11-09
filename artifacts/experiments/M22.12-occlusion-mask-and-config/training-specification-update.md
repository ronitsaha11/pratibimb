# M22.12 — training specification update (amends M22.10 `experiment-specification.md`)

> **Status:** PROPOSED, PENDING OWNER APPROVAL.
> **Not implemented:** no training loop, optimizer or loss wrapper. Nothing here was executed.
> **What it changes:** this document amends the M22.10 specification only where stated below; everything else there still stands.

## 1. The canonical configuration

**The file:** `tools/detector/configs/train-v2-first-run.PROPOSED.json`.
- **Format:** schema `train-v2-run-config/2`.
- **Canonical SHA-256:** `2cb331b5…ef3d8b`, as computed by pre-flight.
- **What it is:** the M22.10 final configuration expressed in the validated schema.
- **The M22.9 file:** `train-v2-first-experiment.PROPOSED.json` is schema 1 and is kept unchanged as history. The validator refuses it.

| Setting | Value | Origin |
|---|---|---|
| Epochs, steps | 40 full epochs; **exactly 6,000** optimizer steps; 150 per epoch at batch 4 | M22.10 |
| DEV | every epoch, 40 batches; DEV loss = Σ numerators / Σ positive cells over all 160 samples | M22.10 |
| Checkpoints | every epoch, all kept, never overwritten (≈ 30 MB in total, an M22.10 estimate) | M22.10 |
| Best checkpoint | **strict minimum** DEV loss; ties keep the earlier epoch | M22.10 |
| Early stopping | patience 5, min delta 0.001, **record-only**: computed and recorded, never terminates run 1 | M22.10 option A |
| Schedule | cosine, tMax = 6,000 = the last step, eta_min 0, no warm-up | v1 |
| Seed, threads | 20261102; 8 CPU threads | M22.10 |
| Determinism | deterministic algorithms **required** (fail, never warn) | M22.10 |
| Gradients | clip norm 10; **fail** on any non-finite gradient | v1 clip; M22.10 policy |
| Optimizer, loss | AdamW 3e-3, weight decay 1e-4; `targets.detector_loss`, box weight 5 | v1 |
| Partial occlusion | **`ignore-mask`** | M22.12; **pending owner decision**. The alternative `background` is the v1 behaviour |

**What the validator now enforces:**
- the exact step count: `steps.max` = per epoch × epochs = the schedule's `tMaxSteps`;
- every checkpoint has a DEV loss;
- every enumerated policy has a valid value.

**What pre-flight now enforces:**
- TRAIN and DEV divide exactly by the batch size, so no partial batch is ever planned;
- the configured per-epoch and DEV batch counts equal the real quotients;
- the CPU thread count exists on the machine.

**Measured on W1:** 600 / 4 = 150 and 160 / 4 = 40; 8 threads of 16 logical CPUs (`logs/w1-preflight-first-run-candidate-2.json`).

**The "≥ min delta" ambiguity is removed:**
- **Best checkpoint:** the **strict** minimum.
- **Record-only patience:** counts epochs since the last improvement of at least min delta.
- **Two definitions, both recorded:** they can name different epochs, and both are recorded.

## 2. Applying the partial-occlusion ignore mask (for the future training step)

**Where the mask comes from:** `occlusion_mask_v2.partial_occlusion_ignore_mask(sample, cls_t)` returns a boolean mask [A, C] per sample.

**How a training step must use it:**
- stack the per-sample masks exactly as it stacks `cls_t`, then permute (0, 2, 1) to [N, C, A];
- in the focal classification term, ignored entries contribute **zero** to the numerator;
- the normaliser N⁺ is **unchanged**, because the mask never touches a positive, so N⁺ is the same positive-cell count;
- the box term is **unchanged**, because the mask has no box component.

**The same mask must be applied to the DEV loss:** otherwise DEV loss would measure a different objective from the one optimised.

**`detector_loss` takes no mask, and `targets.py` stays unchanged.** So the training step needs a masked variant inside the v2 training support. Its required test:
- with an all-false mask, it must equal `targets.detector_loss` **bitwise** on the same tensors;
- the masked count must equal the helper's `ignoredEntries`.

That test computes a loss on tensors, not on a model. It still belongs with the training authorisation, because it is part of the training step.

**Logging:** per epoch, record the ignored-entry count (constant: 26,953 TRAIN and 6,999 DEV) and the masked numerator's share.

## 3. Failure conditions added

| Id | Condition | Action |
|---|---|---|
| F16 | The ignore mask cannot be built: missing or foreign occluder provenance, invalid dimensions | refuse to start (pre-flight raises) |
| F17 | Run-time masked-entry count ≠ the pre-flight count, per split | FAILED |
| F18 | Configured steps or DEV batches ≠ the data's exact quotients, or a partial batch | refuse to start (pre-flight raises) |

Conditions F1–F15 of M22.10 still apply.
