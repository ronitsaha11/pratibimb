---
id: M22.13-first-training-run
title: "M22.13 — first v2 T1 retraining run (candidate 2, 40 epochs, 6,000 steps)"
status: recorded — training run COMPLETED; candidate UNADOPTED; NO detection evaluation, NO export, NO TEST
date: 2026-11-03
label: FACT (training run, checkpoints and verification on W1); INFERENCE where marked
classification: TRAINING RUN (owner-authorised, one run) — DEV loss only; no inference, no detection metric, no ONNX export, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.13 — the first v2 T1 retraining run

> **Training ran, detection did not:** the training **executed successfully**, and that is all this record claims.
> **No detection measurement:** no detection was decoded, no precision, recall, AP or F1 was computed, and no T1 baseline was run.
> **Nothing exported:** no ONNX export was made.
> **No TEST:** TEST was not accessed.
> **Loss is not quality:** a lower DEV **loss** is not evidence of better detection.
> **The candidate:** `t1-ui-head-v2-first-run-01` is **UNADOPTED**. The shipped T1 model is untouched.

## Owner authorisation (M22.13)

**Authorised:**
- implementing the v2 training loop and the partial-occlusion ignore-mask loss;
- **one** 40-epoch training run on candidate 2, with TRAIN forward and backward passes and optimizer steps;
- a forward-only DEV loss pass after every epoch;
- checkpoints and a complete record.

**Not authorised:** TEST, detection evaluation, T1 baseline inference, ONNX export, further hyper-parameter or seed runs, or any change to T1.

**Recorded as:** `tools/detector/configs/train-v2-first-run.APPROVED.json`. It is the M22.12 proposal with only `status` and `approval` set (project owner, 2026-11-03), and a test holds every other field equal.

## Hypothesis

The M22.10–M22.12 specification can be executed exactly as written: 40 epochs, exactly 6,000 optimizer steps, every TRAIN sample each epoch and the full DEV split each epoch. It should finish with:
- every safety check holding;
- every checkpoint verifiable;
- a reproducible record.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300, Intel Core 7 240H (16 logical CPUs). **CPU only**, 8 torch threads, deterministic algorithms required.

**Software:** Python 3.13.14, torch 2.14.0+cpu (mkldnn available), numpy 2.5.1, pillow 12.3.0.

**Code:** commit `95b0ffb` (clean tracked tree), schema `train-v2-run-config/2`, configuration hash `e2cd897c…aa248`.

**Data:**
- **Dataset:** `t1-ui-synthetic@2.1.0-draft` candidate 2, render revision `r2-m22.6-visual-fixes`.
- **Manifests:** TRAIN `f283720f…2427f8`, DEV `f072507a…4ede1`.
- **G10:** `g10-approved-1`, configuration `5cbb059f…7fedbbddf`, thresholds `fcce918a…dce78b1`, evidence `404e0b28…5c29b533`.

## Expected result

- **Steps:** 40 epochs and 6,000 steps, with every TRAIN sample consumed each epoch and all 160 DEV samples each epoch.
- **Checkpoints:** 40, each verified.
- **Best checkpoint:** the strict minimum DEV loss.
- **Untouched:** T1 and both candidates.
- **No failure condition.**

## Actual result

### 1. Implementation (committed before the run)

| Commit | What |
|---|---|
| `0b8f210` | `loss_v2.py`: `targets.detector_loss` repeated operation for operation. Ignored classification entries are set to zero with `torch.where`. A mask over a positive, wrong shapes and non-finite inputs are refused. 24 tests, including **bitwise value and gradient equality with `detector_loss` under an all-false mask** (3 seeds) |
| `fe892dd` | `train_v2 --train` (`run_training`): approved configuration, clean tree, one run, full pre-flight, then the loop. 10 loop tests on the synthetic fixture (completion, **bitwise equality of an interrupted-and-resumed run with an uninterrupted one**, refusals, F1, F6, F7). Static guarantees: no export, ONNX or decode, and weights saved only by the checkpoint writer |
| `95b0ffb` | the approved configuration |

**Before the run:**
- 227 Python tests;
- `npm run verify` PASS (3,159 JavaScript tests passed, 22 skipped; Python 227);
- the final pre-flight PASS with the approved configuration.

### 2. The run

**Timing:** started 2026-11-02T20:31:58Z and completed 2026-11-03T08:08:37Z (UTC), in **one session with no interruption or resume**.

**Status:** **COMPLETED**, with no failure condition raised.

**Counts:** 40 epochs; **6,000 optimizer steps**; the scheduler at step 6,000, its learning rate ending at 0.0 and never stepped beyond the end.

**Every epoch** consumed all 600 TRAIN samples (150 steps), 168,250 positive cells and 26,953 ignored entries, then evaluated all 160 DEV samples (40 batches), 44,308 positive cells and 6,999 ignored entries.

**Model:** fresh `UiHead` 16/32/64, **61,468 parameters**, with no weights loaded.

**Checkpoints:**
- 40 of them, each written atomically and reloaded and verified;
- 771,324–771,388 bytes each, 30.85 MB in total;
- every one re-verified after the run, independently: SHA-256, keys and shapes against `UiHead` (meta device), finite weights, step = epoch × 150, scheduler step, configuration, dataset and T1 hashes.
- **Step logs:** contiguous, steps 1 to 6,000.

### 3. Loss progression (DEV loss with the ignore mask; dataset-sum aggregation)

| Epoch | Step | LR (first step) | TRAIN loss | TRAIN cls / box | DEV loss | DEV cls / box | Grad norm mean / max | Clipped steps | Best |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | 3.000e-03 | 4.2713 | 0.6490 / 0.7245 | 3.9830 | 0.5645 / 0.6837 | 4.32 / 53.67 | 5 | 1 |
| 5 | 750 | 2.927e-03 | 3.5964 | 0.4549 / 0.6283 | 3.7545 | 0.4649 / 0.6579 | 4.87 / 20.93 | 8 | 5 |
| 9 | 1350 | 2.714e-03 | 3.3930 | 0.4223 / 0.5941 | 3.3865 | 0.4410 / 0.5891 | 4.75 / 31.55 | 9 | 9 |
| 10 | 1500 | 2.641e-03 | 3.3215 | 0.4138 / 0.5815 | 4.3454 | 0.8919 / 0.6907 | 3.95 / 25.06 | 3 | 9 |
| 15 | 2250 | 2.181e-03 | 3.1520 | 0.3854 / 0.5533 | 3.2543 | 0.4414 / 0.5626 | 3.90 / 17.06 | 3 | 15 |
| 20 | 3000 | 1.618e-03 | 3.0514 | 0.3634 / 0.5376 | 3.9827 | 0.6175 / 0.6730 | 4.16 / 19.96 | 6 | 19 |
| 25 | 3750 | 1.036e-03 | 2.9562 | 0.3475 / 0.5217 | 2.9896 | 0.3552 / 0.5269 | 4.04 / 15.60 | 5 | 25 |
| 30 | 4500 | 5.258e-04 | 2.8988 | 0.3394 / 0.5119 | 3.5105 | 0.4131 / 0.6195 | 4.97 / 30.14 | 8 | 25 |
| 31 | 4650 | 4.393e-04 | 2.8755 | 0.3352 / 0.5080 | 2.9102 | 0.3360 / 0.5148 | 3.41 / 11.72 | 2 | 31 |
| 35 | 5250 | 1.635e-04 | 2.8487 | 0.3296 / 0.5038 | 2.9139 | 0.3357 / 0.5156 | 3.27 / 8.98 | 0 | 34 |
| 38 | 5700 | 4.145e-05 | 2.8319 | 0.3281 / 0.5008 | 2.8948 | 0.3336 / 0.5123 | 4.05 / 37.40 | 8 | 38 |
| **39** | 5850 | 1.847e-05 | 2.8437 | 0.3318 / 0.5024 | **2.8933** | 0.3323 / 0.5122 | 3.38 / 18.90 | 4 | **39** |
| 40 | 6000 | 4.624e-06 | 2.8370 | 0.3271 / 0.5020 | 2.8979 | 0.3336 / 0.5129 | 3.45 / 20.07 | 2 | 39 |

All 40 epochs, with every field, are in `logs/w1-run-record-first-run-01.json`.

**Training loss:** the mean TRAIN loss fell from 4.271 to 2.837, almost monotonically.

**DEV loss:**
- it fell from 3.983 (epoch 1) to **2.893 (epoch 39)**;
- **while the learning rate was high, it rose sharply on individual epochs:** 4.39 (epoch 7), 4.35 (10), 3.98 (20), 3.51 (30);
- it settled as the cosine schedule annealed, and epochs 31–40 all lie within 2.893–2.951.
- **INFERENCE, not tested:** batch-4 BatchNorm running statistics, used in eval mode, are a plausible cause of the spikes.

### 4. Gradients and numerical stability

**Gradients:**
- the pre-clip gradient norm averaged 3.1–5.0 per epoch, with a maximum of **53.67** (epoch 1);
- **185 of 6,000 steps were clipped** at norm 10 (summed from the per-epoch counts).

**Numerical stability:**
- no non-finite loss, gradient, weight or optimizer state, and no zero gradient norm;
- no non-deterministic operation was hit (deterministic algorithms on, never warn-only).

### 5. Ignore mask and data accounting (each epoch, every count equal to the pre-flight's)

| | TRAIN | DEV |
|---|---|---|
| Ignored classification entries | 26,953 | 6,999 |
| Positive cells | 168,250 | 44,308 |
| Excluded occlusion cases (partial / full) | 480 / 480 | 128 / 128 |
| Very-small objects / of them nearest-cell fallback | 1,320 / **342 (25.9 %)** | 352 / **93** |
| Positive cells: very-small / small / medium / large | 2,994 / 10,154 / 41,570 / 113,532 | 779 / 2,833 / 10,761 / 29,935 |

**Per-bucket DEV terms at the best epoch (diagnostic losses, not detection metrics):**

| Bucket | Box term per positive cell | Positive-class focal term per cell |
|---|---|---|
| very-small | **0.602** | 0.251 |
| small | 0.537 | 0.216 |
| medium | 0.513 | 0.217 |
| large | 0.507 | 0.278 |

**INFERENCE:** the very-small bucket keeps the highest box term. That is consistent with its IoU ceiling (M22.11), but it is not a recall measurement.

### 6. Best checkpoint and early stopping

**Best checkpoint:**
- `checkpoint-e39.pt`, DEV loss 2.8933307699, SHA-256 **`a485425dfb4ea7f73d91707d4e9a8eb6a10a7a0be36f8dbe6d95f71e26025c0d`**;
- the strict minimum, independently confirmed;
- `best-checkpoint.json` points to it.

**Early stopping (record-only):**
- patience 5 with min delta 0.001 **would have stopped the run at epoch 30**;
- it did not, by configuration. Under the M22.9 acting rule (option B), the kept model would have been epoch 25's (DEV 2.9896).

### 7. All checkpoint SHA-256s

| Epoch | SHA-256 |
|---|---|
| 1 | `2468d69f6f3c0fd2f7adb8901c8d66675bde2e0086f6b97af6de05b9f6eaeda5` |
| 2 | `95e6200bc63c7091ca6b4196fdec60db657763d49dc104b87b957720b619f506` |
| 3 | `98eafa90e9657d1060b66ece41ec49d8f561d2743e5a7a658415c37cc47b61ed` |
| 4 | `fd42d7e7b3e04a790eacda60227fe241f4a629a2723ada4976ca1580f7dfbc2a` |
| 5 | `31c4d348be9a4ac75c551c4d136a9594a590734b9f43506499f9a1a43a589ab7` |
| 6 | `9d5b8afadfe0f92cce4207ce8a6af27f16ba2b8cc7cfee37d96c05096325528f` |
| 7 | `ef6208f6c6cecbb0f3c6d4097f314defbf3e96438586b39953894a42dab2ee3f` |
| 8 | `2c6cb0f7bd31de28254a2cca43b44a4ba660584c9862d4a6aa499ddaa1f4c03c` |
| 9 | `6e2ecc4c86c1572644f1f4b6d59014ded0623ba90477904707e466ce6907a08c` |
| 10 | `715221bb10e383364617f275f17b32fd15362158da918b759b26601431a53b9d` |
| 11 | `e3325d2c223c26ddd018a65f2372bcf219e718bab61b7bb58d92bc6cf850378e` |
| 12 | `136857bb021bcdca90416ed5db09df6c2f4cdccc137d32770d68224380657fb7` |
| 13 | `acac079fb77a858fd7d1474af10f7dfd7b72f3d41f5d12b752382d21670569d0` |
| 14 | `224fc226781897cc5fbc509a6db23d5ec02d43f813e1bb88d3a6cda7d4735519` |
| 15 | `86b11f187c492aa2f11d428f7ae1a1181b136cbe23e8a599e4cf8f82b9a2ea18` |
| 16 | `af50a18b4e8780400913c81525894dbb56465b2b0165c460b330ce8d89b582e1` |
| 17 | `dae71698aca9ad115aef71aeb7300a13f3cdef812ab1c43816fbde9991d745cc` |
| 18 | `3a62ac78b6adef3b4a3c7d80c07ac995ef0b412cff180aef4e133b04ba57f488` |
| 19 | `86d094edce12e6efb453f61f3a3e1097c78e81f0bafe1f7606d8a74d10fbaf5c` |
| 20 | `406c80e58453a93b499a0187a000d8f161938e4505ad3d530397d6a11c4a28c6` |
| 21 | `0750637f427b40b2115074ae98f17581188ac9855b5134bef30d7064251d7dad` |
| 22 | `152a0c174a416f379ee12b23fe7fc1807027cd330029d7beed143811142be183` |
| 23 | `54b85d70abea1036d826bab821f99cb98f537212d31e8f62abd6461cb0347de8` |
| 24 | `40d1d35edef2e3ea82e329755ec0c74dddf9418f4c247e3f4b30619ad8711b0e` |
| 25 | `58740a5d0eaf2cfa2bf28ca916bc33f1c12af3f987f24aa43a234b33f51a0a48` |
| 26 | `3eb8d8d87c65faa03417e22bb70baf4107ca28452fce70c81fe8433ca8741383` |
| 27 | `eeff01af0f0e1ba53f1a165b27ccc65ddfe3d346dee77827d9d1a4c0495b2952` |
| 28 | `fb21531480f846537bd49d0b3ac6b30829dddcccf48c0762c23b48c52dbf083f` |
| 29 | `a3af521cd266a3c4ab2362af3f2a6b82bad269bbf16f829dafdd5a0cab920ff8` |
| 30 | `aa2e19bea65d2e6b28fa0d39c9e37962a8363e2dea3f75b2db752b3bed60e2d0` |
| 31 | `cbfee8af9ce57212cc25d27ec934f0681a27639770a3c04a1a0e559bd5123b7f` |
| 32 | `d5893aec4eff75270a0d4cc53f7ccea2cb4dd3d592b32b6673f167ad076e87f0` |
| 33 | `3df442092e0be46364585d65eef71d724c9143599e24af5e0b506fcb66839a9e` |
| 34 | `a3388e26e31da4cef6634fc8c25b66cac83eda88ab8b87c7fa3b25ae55110fc9` |
| 35 | `79306513128594dbee3044da05d5a0de55e004dc4278a269bac94b2e3e32f674` |
| 36 | `658029968e9dd8ecefbc3b84632d1c1ab5fa86fa82a7c5b06fda4a25ce278871` |
| 37 | `c67896e89dd463eb382122f6771f0e23177f965dc2ae9799208e7164e35e9956` |
| 38 | `5cb7eac97334fcae3f4e2abb7c34801655b09c6b82f9afacae1daef7db4a265a` |
| 39 | `a485425dfb4ea7f73d91707d4e9a8eb6a10a7a0be36f8dbe6d95f71e26025c0d` (best) |
| 40 | `6b5b42e77df4b8dc5cb852d5f46caa34185dd77cb940e8a414e44607b68fcfde` |

**Where they are kept:** under the git-ignored `artifacts/models/t1-ui-head-v2-first-run-01/`, together with:
- `run-record.json`;
- `best-checkpoint.json`;
- `steps-e01.jsonl` … `steps-e40.jsonl`.

**What is committed:** no weight is committed. The sanitized record is `logs/w1-run-record-first-run-01.json`, which drops only the inline copy of the configuration file.

### 8. Resources (FACT where measured)

**Timing:** 41,736 s of wall time across the 40 epochs.
- **Undisturbed epochs** took 54–213 s.
- **Two slow stretches:** epochs 13–16 (411–725 s) and 28–36 (about 480–513 s).
- **One outlier:** **epoch 39 took 31,445 s**.
- **INFERENCE:** the machine was starved of CPU or suspended. A read at epoch 14 showed total CPU load at 26 % while the run needed more. The 8.7-hour epoch is consistent with system sleep. Neither affects the computation: the run is deterministic, and its counts and checks all held.

**Memory:**
- **External observation** (Windows process list, epoch 14): working set 1,524 MB, peak working set 1,840 MB.
- **The in-process reader:** `train_v2.peak_memory` returned no value on this machine, so the per-epoch `memory` field is `null`. **That is a limitation of this record**, to be fixed in code before any further run.

## Conclusion

The first separately trained T1-v2 candidate exists. Training **executed successfully** with every safety property held:
- 40 epochs, exactly 6,000 steps;
- all data consumed every epoch, the ignore mask applied;
- 40 verified checkpoints;
- the strict-minimum best at epoch 39;
- T1 and both candidates unchanged.

**What is unknown:** whether the candidate **detects** better than T1 — or at all well — is **UNKNOWN**. That needs the separately authorised DEV detection evaluation (`artifacts/experiments/M22.12-occlusion-mask-and-config/evaluation-plan-update.md`), whose figures will be selection-biased, and later a TEST evaluation.

## Reproducibility

```bash
python -I tools/detector/train_v2.py --train --candidate=2 --g10-config=tools/dataset/v2/configs/g10-approved-candidate-2.json --g10-evidence=artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json --build-config=tools/dataset/v2/configs/m22.4-train-dev.json --run-config=tools/detector/configs/train-v2-first-run.APPROVED.json --run-id=<new id>
```

**Run 1 is not authorised to be repeated.** A repeat would be a second run: the command refuses while `t1-ui-head-v2-first-run-01` exists, and it needs a new owner authorisation.

**Same weights expected:** deterministic algorithms, fixed threads and one seed are expected to reproduce the same weights at commit `95b0ffb` on W1.
- **Evidence for it:** the fixture tests show bitwise interrupt-and-resume equivalence.
- **Not shown:** bitwise equality of two full candidate-2 runs, which would itself be a second run.
