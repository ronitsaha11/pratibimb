# M22.10 — memory and compute estimate (analytic; NOT MEASURED)

> **What this is:** every figure is either a FACT about the machine or the architecture, or arithmetic over the layer shapes in `tools/detector/head.py`, labelled INFERENCE where it predicts runtime behaviour.
> **What it is not:** no model was built, no tensor was allocated for this estimate, and nothing was timed.
> **Duration:** **training duration is UNKNOWN** and is not estimated.
> **GPU memory:** no figure is given, because the pinned environment has no GPU path.

## 1. Environment (FACT, W1, 2026-11-03)

| | |
|---|---|
| Machine | W1, `LAPTOP-6E14K34L`, Windows 11 10.0.26300 |
| CPU | Intel Core 7 240H: 10 cores, 16 logical processors (`os.cpu_count()` 16) |
| RAM | 23.64 GiB total; **3.70 GiB free** at the time of reading (varies) |
| Disk | D: 221.8 GiB free |
| GPUs present | Intel Graphics; NVIDIA GeForce RTX 5050 Laptop GPU. WMI `AdapterRAM` reads 4,293,918,720 bytes, but it is a 32-bit field, so the actual VRAM is UNKNOWN |
| Python stack | Python 3.13.14; torch **2.14.0+cpu** (`torch.cuda.is_available()` = False); numpy 2.5.1; pillow 12.3.0 |
| torch threads | default **10** on W1. v1's rule `cpu_count // 2` gives **8** |
| Other packages | native `onnxruntime` 1.20.1 and `onnx` 1.22.0 installed, neither pinned in `requirements-test.txt`; `psutil` not installed |

**Device choice:** the run is **CPU-only** under the pinned environment. Using the NVIDIA GPU would need a CUDA torch build, which is a dependency change outside the pinned stack. It would also bring its own determinism caveats. It is owner decision D11, and not recommended for run 1.

## 2. Model (FACT, arithmetic over `head.py`)

| Layer | Output | Parameters | MACs per sample |
|---|---|---|---|
| conv-bn 3→16, s2 | 16 × 320 × 320 | 432 + 32 | 44,236,800 |
| conv-bn 16→32, s2 | 32 × 160 × 160 | 4,608 + 64 | 117,964,800 |
| conv-bn 32→64, s2 | 64 × 80 × 80 | 18,432 + 128 | 117,964,800 |
| conv-bn 64→64 | 64 × 80 × 80 | 36,864 + 128 | 235,929,600 |
| box 1×1 (64→4) | 4 × 80 × 80 | 260 | 1,638,400 |
| cls 1×1 (64→8) | 8 × 80 × 80 | 520 | 3,276,800 |
| **Total** | | **61,468** (equals `W1-QG03-t1-detector-runtime/decision.md`) | **521,011,200** |

- **Forward:** ≈ 1.04 GFLOP per sample, counting 2 FLOP per MAC and ignoring BN and ReLU.
- **Weights:** 61,468 × 4 B = 245,872 B.
- **Weights plus AdamW moments:** × 3 = 737,616 B.
- **Checkpoint (INFERENCE):** about 0.74 MB per full checkpoint, plus BN buffers (352 floats) and serialisation overhead, which is UNKNOWN until written. 40 checkpoints come to about 30 MB.
- **ONNX export (INFERENCE):** the same graph as T1's 302,960-byte artifact, so expected to be the same order of size. Not claimed equal.

## 3. Memory (INFERENCE; not measured)

| Item | Bytes | Note |
|---|---|---|
| One letterboxed image as float32 | 4,915,200 | 3 × 640 × 640 × 4 |
| One sample's targets | 313,600 | `pos` 6,400 B + `box_t` 102,400 + `cls_t` 204,800 |
| **TRAIN preloaded, float32 (v1 style)** | **2.75 GiB** images + 179 MiB targets | v1 preloaded its 120 samples (≈ 590 MB, per its comment) |
| DEV preloaded, float32 | 0.73 GiB + 48 MiB | |
| **TRAIN + DEV, float32** | **≈ 3.70 GiB** | `torch.stack` over a list transiently holds both, so the peak is higher |
| TRAIN + DEV as uint8 images | ≈ 0.87 GiB + targets | convert per batch (`/ 255.0`), giving the same values as v1's path |
| Activations, batch 4 | ≈ 119 MiB | input plus conv and BN outputs of the four blocks, kept for backward. Excludes autograd and oneDNN workspaces and loss temporaries, which are UNKNOWN |
| Parameters, gradients, AdamW | ≈ 1 MB | |

- **The risk (INFERENCE):** v1-style float preloading needs about 3.7 GiB plus a transient peak, while 3.70 GiB was free when W1 was read. Peak memory is therefore a real risk on W1 at that load. uint8 preloading, or per-batch decoding, removes most of it.
- **Recommendation:** uint8 preloading. The training implementation's tests must show the tensors are identical to `data.sample_to_tensors`'s.
- **Measure, don't project:** the run records peak working-set memory (`evaluation-plan.md` §2 #12).

## 4. Compute (INFERENCE; arithmetic, not a duration)

| Work | FLOP |
|---|---|
| One training step (batch 4; backward taken as about 2× forward, a common approximation) | ≈ 12.5 GFLOP |
| 6,000 steps | ≈ 75.0 TFLOP |
| DEV loss pass per epoch (160 forwards) | ≈ 167 GFLOP |
| 40 DEV passes | ≈ 6.7 TFLOP |
| **Total, Option A (full 40 epochs)** | **≈ 81.7 TFLOP** |

**Why no duration is given:**
- **No throughput measurement:** this workload's sustained CPU throughput on W1 has not been measured, and no measurement of it is permitted in this milestone, because it would need forward and backward passes.
- **v1 gives no anchor:** v1's wall time was never recorded in the repository.
- **How it will be measured:** the training run measures it. Epoch 1's wall time, × 40, plus DEV passes, gives the first measured projection, recorded in `run-record.json`.
- **Budget:** the owner's wall-clock budget (D7) is checked against that projection after epoch 1, and against elapsed time after every epoch (F14).

**Machine observations:**
- **Torch import (FACT, M22.9, environmental):** importing torch took 13.6 s, and the pre-flight took about 5 minutes on W1.
- **Throughput (INFERENCE):** W1 is not idle-fast, so measured throughput may vary with machine load. The run records the thread count and load conditions.

## 5. Disk (INFERENCE)

| Item | Size |
|---|---|
| Checkpoints | ≈ 30 MB |
| Logs and run record | well under 10 MB at one JSON line per step × 6,000 steps |
| Free on D: | 221.8 GiB (FACT) |

**Not a constraint.**
