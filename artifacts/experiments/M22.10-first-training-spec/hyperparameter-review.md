# M22.10 — review of the proposed first-experiment configuration

> **Reviewed:** `artifacts/experiments/M22.9-training-pipeline/training-config-proposal.md` and
> `tools/detector/configs/train-v2-first-experiment.PROPOSED.json` (canonical SHA-256 `1d9057ea…41c3d`).
> **Unchanged:** neither file was edited. **Not approved:** nothing here is approved.
> **No execution:** nothing was trained, built, stepped or predicted.
> **Labels:** FACT / INFERENCE / UNKNOWN, as in `AGENTS.md` §5.

## Sources this review rests on

| Evidence | Label |
|---|---|
| `tools/detector/train.py`, `head.py`, `targets.py` as committed (unchanged since `077f139`) | FACT (read) |
| The v1 run trained 4,000 steps, batch 4, on 120 TRAIN samples of a 200-sample set (`agentos/state.md`, 2026-09-10; `train.py` defaults and comment) | FACT (recorded) |
| v1 per-step loss, gradient norms and wall time: **never recorded** in the repository. `artifacts/models/t1-ui-head/` holds only the ONNX file, no model card | FACT (absence checked) |
| No learning-rate, batch or schedule sweep for v1 exists in the repository | FACT (searched `agentos/`, `docs/`, `artifacts/experiments/`) |
| Positive-cell ownership on candidate 2 (`logs/w1-candidate-2-positive-cells.json`) | FACT (measured, data only) |
| Analytic arithmetic over the layer shapes and the schedule (`resource-estimate.md`) | INFERENCE where it predicts behaviour, FACT where it is pure arithmetic |

## Verdicts

**Key:**
- **Inherited** means the value is v1's, carried over.
- **New** means M22.9 chose it.
- **Keep** means recommended unchanged for the first run.
- **Change** means a recommended amendment.

| # | Parameter | Proposed | Origin | Verdict |
|---|---|---|---|---|
| 1 | Architecture | `head.UiHead` 16/32/64 | Inherited | **Keep** |
| 2 | Input resolution | 640 letterbox, pad 114/255 | Inherited, frozen contract | **Keep** (not a free parameter) |
| 3 | Batch size | 4 | Inherited | **Keep** |
| 4 | Optimizer | AdamW | Inherited | **Keep** |
| 5 | Learning rate | 3e-3 | Inherited, never swept | **Keep** for run 1, flagged |
| 6 | Weight decay | 1e-4 | Inherited | **Keep the value; drop the claim** that it mitigates overfitting |
| 7 | Gradient clipping | norm 10 | Inherited | **Keep; add logging and non-finite refusal** |
| 8 | LR schedule | cosine over max steps | Inherited | **Keep**; see the early-stopping interaction |
| 9 | Max epochs | 40 | New | **Keep** as an upper bound |
| 10 | Max optimizer steps | 6,000 (derived) | New | **Keep**; make it a checked invariant |
| 11 | Seed | 20261102 | New | **Keep**; add strict determinism settings |
| 12 | Checkpoint frequency | every 5 epochs + best | New | **Change**: every epoch, all kept |
| 13 | Early stopping | DEV loss, patience 5, min delta 0.001 | New | **Change** (recommended): record, don't stop. Owner decision |
| 14 | Loss | `targets.detector_loss`, box weight 5 | Inherited | **Keep** for attribution; report per bucket |

---

### 1. Architecture — `head.UiHead`, widths 16 / 32 / 64 (Inherited · Keep)

- **FACT:**
  - **Layout:** four conv-BN-ReLU blocks (three at stride 2) and two 1×1 heads, box (4) and class (8).
  - **Parameters:** 61,468 in total. This is arithmetic over `head.py`, and it equals the 61,468 recorded in `W1-QG03-t1-detector-runtime/decision.md`.
  - **Grid:** stride 8, so 80 × 80 = 6,400 anchors.
  - **Class prior:** the class bias starts at a 0.01 prior.
- **Why keep it:**
  - **Attribution:** the experiment asks whether the v2 data changes what the head learns, so changing the model at the same time would make any difference unattributable.
  - **Frozen contract:** the weights must fit the frozen tensor contract (`packages/perception/src/uiDetectorHead.ts`) and the existing export path unchanged.
- **Fresh initialisation:**
  - set `torch.manual_seed(seed)`, then construct `UiHead()`;
  - this gives PyTorch's default conv and BN init plus the prior bias;
  - **no T1 weights are loaded.** Fine-tuning from T1 would be a different experiment.
- **Note (FACT, documentation only):** `UiHead`'s docstring says "the smallest trunk that reaches stride 16", but the code is stride 8. The docstring is stale and the code is what runs. This is not changed here, because `head.py` is protected.

### 2. Input resolution — 640 × 640 letterbox (Inherited · frozen · Keep)

- **FACT:** the input path is `INPUT_SIZE = 640`: a BILINEAR letterbox, a centred 114/255 pad, RGB, scaled to 0..1. It is the frozen `HEAD_CONTRACT`, and the M22 size buckets are defined in model pixels at this scale.
- **Why it isn't tunable:** changing it is a contract change that needs an ADR, so it is not a hyper-parameter of this experiment.

### 3. Batch size — 4 (Inherited · Keep)

- **FACT:** epochs divide exactly, with no partial batch and no dropped sample:
  - TRAIN is 600 samples, so 150 steps per epoch;
  - DEV is 160 samples, so 40 batches.
- **Memory (INFERENCE):** memory does not force 4. Analytic activation memory is about 119 MiB at batch 4 (`resource-estimate.md`).
- **BatchNorm (INFERENCE):** BN at batch 4 is not starved. Per-channel statistics pool N × H × W positions: 409,600 at the first block and 25,600 at the last. Small classification batches can starve BN; this model does not have that problem.
- **Why keep it:** changing batch size couples to the learning rate and confounds the data effect. Keep 4; a batch × LR sweep is a later, separate experiment on DEV.

### 4. Optimizer — AdamW (Inherited · Keep)

- **FACT:** as in v1, `torch.optim.AdamW(model.parameters(), lr, weight_decay)` applies decay to **all** parameters, BN affine and biases included, the class prior bias among them.
- **Why keep it:** changing the parameter grouping would be a change from v1, so it is kept for attribution.

### 5. Learning rate — 3e-3 (Inherited · Keep for run 1 · flagged)

- **FACT:** 3e-3 is `train.py`'s argparse default. No sweep for it exists in the repository, so it is **unvalidated**: v1's success shows only that it worked once at 4,000 steps on 120 samples.
- **INFERENCE:** it is at the high end of usual AdamW rates for a from-scratch conv detector, but v1 converged with it and passed the micro-overfit gate.
- **Recommendation:** keep it for run 1, with no warm-up (v1 had none), and rely on the failure conditions (`experiment-specification.md` §6) to stop a divergence. Make LR the first variable of any later DEV-only sweep.

### 6. Weight decay — 1e-4 (Inherited · keep the value · correct the rationale)

- **FACT (arithmetic):** AdamW's decoupled decay multiplies each weight by (1 − lr_t·wd) per step. Over the proposed 6,000-step cosine schedule, Σ lr_t = 9.0015, so the total shrinkage from decay alone is a factor of **0.9991**: under 0.1 % over the whole run.
- **INFERENCE:** at these values weight decay is, in effect, **not a regulariser**.
- **The correction:** the M22.9 proposal (§5) lists it as an overfitting mitigation, and that claim is not supported. Keep the value for attribution, but remove it from the mitigation list. Early stopping or checkpoint selection on DEV is the only effective mitigation in this run.

### 7. Gradient clipping — max norm 10 (Inherited · Keep · add logging)

- **UNKNOWN:** whether v1's clip ever engaged, since v1 never logged gradient norms.
- **Recommendations:**
  - **Detect bad gradients:** call `clip_grad_norm_(…, 10.0, error_if_nonfinite=True)`, so a non-finite gradient fails closed instead of being clipped into a finite one.
  - **Log every step:** record the pre-clip total norm.
  - **Report:** the fraction of clipped steps.
- **Keep the value**, since a value can't be justified without that log.

### 8. LR schedule — cosine over max steps (Inherited · Keep · interaction noted)

- **FACT:** v1 uses `CosineAnnealingLR(opt, T_max=steps)`, stepped once per optimizer step, with eta_min 0. Under the proposal T_max = 6,000.
- **The interaction (FACT, arithmetic):** at the end of epochs 10, 15, 20 and 30 the LR factor is 0.854, 0.691, 0.500 and 0.146.
- **The consequence (INFERENCE):**
  - if early stopping (patience 5) fires in the first half, the run stops while LR is still high and never reaches the low-LR phase;
  - with cosine, the low-LR phase is commonly where validation loss improves most;
  - so early stopping combined with a cosine schedule fixed to the maximum can stop *because* the schedule had not annealed yet.
- **This is why item 13 recommends a change.**

### 9. Maximum epochs — 40 (New · Keep as upper bound)

- **The comparison with v1 (FACT, arithmetic):**

  | | v1 | v2 proposal |
  |---|---|---|
  | Sample presentations | 4,000 × 4 = 16,000, ≈ 133 per sample | 6,000 × 4 = 24,000, 40 per sample |
  | Object presentations (TRAIN) | — | 5,280 objects × 40 = 211,200 |

- **UNKNOWN:** whether 40 epochs reaches a DEV-loss plateau. v1's loss curve was never recorded, so no evidence exists either way.
- **Recommendation:** keep 40, and require the run to report whether DEV loss was still improving in its last 5 epochs (the `unconverged` flag, `experiment-specification.md` §5). If it was, that is a finding for a later run, not a reason to extend this one.

### 10. Maximum optimizer steps — 6,000 (New, derived · Keep)

- **FACT:** 150 × 40 = 6,000. The pre-flight already derives it.
- **Recommendation:** make it a checked invariant, not a free field:
  - the run refuses to start unless `maxSteps == stepsPerEpoch × maxEpochs`;
  - the scheduler's `T_max` equals `maxSteps`;
  - every completed epoch consumed exactly 150 steps and 600 distinct samples.

### 11. Random seed — 20261102 (New · Keep · strengthen determinism)

- **FACT:** as in v1, one seed drives `torch.manual_seed` (initialisation) and `np.random.default_rng(seed)` (the per-epoch permutation). No other randomness exists: no augmentation and no dropout.
- **The gap:** v1 calls `torch.use_deterministic_algorithms(True, warn_only=True)`, which **warns rather than fails** on a non-deterministic op.
- **Recommendations:**
  - **Fail on a non-deterministic op:** `warn_only=False`, so the run stops at the first one; it fails closed on step 1 if there is any.
  - **Fix and record the thread count:** `torch.set_num_threads(8)`, which is v1's `cpu_count // 2` rule evaluated on W1. On W1 `cpu_count` is 16 and torch's default is 10, so not fixing it gives a different value. INFERENCE: CPU reduction order can depend on the thread count.
  - **Record the build:** `torch.__config__.show()` and `parallel_info()` go in the run record.
- **UNKNOWN:** bitwise run-to-run reproducibility on W1. It can only be shown by repeating a run (owner decision D6).

### 12. Checkpoint frequency — every 5 epochs + best (New · Change)

- **The problem (INFERENCE):** an interruption between checkpoints loses up to 5 epochs.
- **Size:** at ≈ 0.74 MB per full checkpoint (weights plus AdamW state; `resource-estimate.md`), keeping every epoch costs ≈ 30 MB.
- **Recommendations:**
  - checkpoint **every epoch** and **keep all of them**. Nothing inside the run directory is ever overwritten.
  - "Best" is a pointer in the checkpoint ledger, not a copy.
- **Checkpoint contents** are in `experiment-specification.md` §7.

### 13. Early stopping — DEV loss, patience 5, min delta 0.001 (New · Change recommended · owner decision)

- **Two problems (INFERENCE, plus the FACT in item 8):**
  1. the cosine interaction above;
  2. min delta 0.001 is an **absolute** threshold on a loss whose scale is UNKNOWN, since v1 recorded no loss values. Against a DEV loss of 0.5 it is 0.2 %; against 0.05 it is 2 %. The constant has no evidence behind it.
- **Option A (recommended):**
  - run the full cosine schedule to 40 epochs;
  - choose the best checkpoint by DEV loss;
  - compute patience-5 / min-delta-0.001 stopping as a **recorded, non-acting** annotation ("would have stopped at epoch k"), so the proposal's rule is still measured;
  - **benefits:** the run length is fixed, which helps reproducibility and resource planning, and the schedule and stopping cannot interfere.
  - Divergence is still stopped by the failure conditions (§6 of the specification), not by patience.
- **Option B:** as proposed: stop on patience 5 / min delta 0.001.

### 14. Loss — `targets.detector_loss`, box weight 5.0 (Inherited · Keep · report per bucket)

- **FACT (code):**
  - **Classification:** sigmoid focal, α 0.25 for positives and 0.75 for negatives, γ 2, over all 6,400 cells × 8 classes, divided by the batch's positive-cell count.
  - **Box:** 1 − IoU (plain IoU) over positive cells, divided by the same count, weighted 5.0.
  - **Hard-coding:** α and γ are fixed in `targets.py`.
- **FACT (measured, candidate 2 TRAIN):** every class × bucket cell has 165 objects, but **positive cells are not balanced**.

  | | Share of positive cells | Cells per object |
  |---|---|---|
  | large | **67.5 %** | 86.0 |
  | medium | 24.7 % | 31.5 |
  | small | 6.0 % | 7.7 |
  | very-small | **1.8 %** | 2.3 |
  | textbox | 28.0 % | — |
  | checkbox | 3.8 % | — |

  - **Ratios:** large / very-small = 37.9×; across classes, maximum / minimum = 7.3×.
  - **Nearest-cell fallback:** 342 of 1,320 very-small objects (25.9 %) contain no cell centre and train through it.
  - **DEV agrees:** 67.6 % large, 1.8 % very-small, 26.4 % fallback.
- **INFERENCE:**
  - because both terms are normalised per positive **cell**, each object's weight in the loss scales with its cell count;
  - so very-small objects carry about 1.8 % of the positive-cell signal, even though they are a quarter of the objects;
  - and the very-small bucket is the one M22 exists to improve.
- **Why keep the loss anyway:** changing it confounds the data effect. What to do instead:
  - keep it for run 1;
  - report the DEV losses **decomposed by size bucket and class** (computed from the same terms; a diagnostic, not a new objective);
  - make per-object normalisation a candidate second experiment.
- **Other properties (INFERENCE):**
  - **Zero overlap:** plain IoU has no gradient at zero overlap. At initialisation each predicted box contains its own cell centre, and a fallback cell's centre is within half a cell diagonal of its target's centre, so an initial overlap is expected. Whether any positive ends training with IoU 0 is UNKNOWN and should be counted on DEV.
  - **One class per cell:** each cell carries one class.
  - **Similar classes:** focal does not address confusion between look-alike classes (button / link / tab).
- **Ownership-order finding (FACT, latent):**
  - `assign_targets` says "smallest-first, so … the SMALL one keeps it", but it processes objects in ascending area and the **last write wins**, so a larger overlapping object takes the shared cells;
  - **on candidate 2 this has no effect:** 0 objects lost any cell in TRAIN or DEV, because no kept positives overlap (`logs/w1-candidate-2-positive-cells.json`);
  - it would matter for any dataset with nested or overlapping controls;
  - not changed here: `targets.py` is protected and the v1 path is frozen. Recorded for a future ADR.

## Corrections to the M22.9 proposal

| M22.9 statement | Correction |
|---|---|
| "weight decay" listed as an overfitting mitigation (§5) | At 1e-4 × the cosine LR sum it shrinks weights by 0.09 % over the run. Not a mitigation |
| "no repeated passes past the plateau" (§5) | Plateau detection depends on the early-stopping rule, which interacts with the schedule (items 8 and 13) |
| Checkpoint every 5 epochs | Every epoch is recommended, for recovery |
| (implicit) DEV loss as one number | Its reduction must be defined: summed over the whole DEV set, not a mean of batch losses (`experiment-specification.md` §4) |
