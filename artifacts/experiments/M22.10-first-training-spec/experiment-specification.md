# M22.10 — first T1 retraining experiment: specification (FOR OWNER APPROVAL)

> **Status:** PROPOSED, PENDING OWNER APPROVAL.
> **Not authorised:** training is not authorised, and nothing in this document was executed.
> **Not implemented:** there is no training loop. It is to be implemented only under a separate owner authorisation, with its own tests, as a training step inside `tools/detector/train_v2.py`. `train.py` is never imported, called or subclassed.
> **No TEST:** TEST is not used, read, planned, seeded or referenced.

## 1. Question and scope

**The question:** with the architecture, input path and loss held fixed, what does `head.UiHead` learn from candidate 2's approved TRAIN data? How does it behave on candidate 2's DEV data?

**What the run produces:** a trained, **UNADOPTED** checkpoint series and its run record. Out of scope:
- detector inference;
- ONNX export (deferred, §9);
- any change to T1, the production detector, the registry or the shipped thresholds.

## 2. Inputs

| # | Item | Specification |
|---|---|---|
| 1 | Dataset | **Candidate 2 only**: `t1-ui-synthetic@2.1.0-draft`, render revision `r2-m22.6-visual-fixes`. Loaded through `data_v2.load_accepted_split`, approved G10 only (`g10-approved-1`, configuration `5cbb059f…7fedbbddf`, thresholds `fcce918a…dce78b1`, evidence `404e0b28…5c29b533`) |
| 2 | TRAIN | `train_v2.load_train`: the TRAIN manifest, which must hash to `f283720f…2427f8`. 600 samples, 5,280 approved VISIBLE positives, 165 per class × size cell. **The only data that produces gradients** |
| 3 | DEV | `train_v2.load_dev`: the DEV manifest, which must hash to `f072507a…4ede1`. 160 samples, 1,408 positives, 44 per cell. **Used for:** DEV loss, checkpoint selection and the early-stopping annotation. **Not used for:** gradients. **Never** in an optimizer step |
| 4 | TEST | **None.** No code path names it. The run configuration is refused if it mentions it (existing `validate_run_config`) |
| 5 | Model | Fresh `head.UiHead()` built after `torch.manual_seed(seed)`. No weights loaded from anywhere |
| 6 | Seed | One seed (proposed 20261102) drives the torch initialisation and the numpy per-epoch permutation |
| 7 | Configuration | An **approved** run configuration (`approval.approved: true`, approver and date), validated field by field with no defaults. Its canonical SHA-256 goes in the run record |
| 8 | Output | A new directory, `artifacts/models/t1-ui-head-v2-<run id>`, through the existing `assert_safe_output` guard. It must not exist, cannot resolve into or over `t1-ui-head`, and cannot pass through a link or junction |

## 3. Run procedure (for the implementer; mirrors the existing pre-flight, then adds the step)

**Before any training:**
1. **Pre-flight** (the existing code path, unchanged), all of which must pass:
   - T1 hash equals ADR-0003;
   - the configuration is approved and valid;
   - the G10 evidence is bound;
   - TRAIN and DEV are accepted and their cell minimums met;
   - the tensor path is good;
   - the output guard passes;
   - git tracked changes are **false**. The run refuses on a dirty tracked tree; untracked files, such as the two kept M20 records, are allowed and listed.
2. **Create the output directory.** It is the only directory created. Write `run-record.json` with the full `provenance_plan`, status `STARTED`, before step 1.
3. **Determinism:**
   - `torch.manual_seed(seed)`;
   - `np.random.default_rng(seed)`;
   - `torch.use_deterministic_algorithms(True)` (not `warn_only`);
   - `torch.set_num_threads(8)`;
   - record `torch.__config__.show()` and `torch.__config__.parallel_info()`.
4. **Load data:**
   - load TRAIN and DEV tensors;
   - verify 600 / 160 samples, 5,280 / 1,408 targets and 168,250 / 44,308 positive cells. These are the measured pre-flight values, so a mismatch is a data change, and the run stops.

**Each epoch e = 1 … maxEpochs:**

5. **Permutation:**
   - draw one permutation of the 600 TRAIN indices;
   - assert that it is a permutation, with every index exactly once;
   - run exactly 150 steps of batch 4.
6. **Each step, in this order:**
   - forward in train mode;
   - `detector_loss`;
   - finite-loss check;
   - `zero_grad`;
   - `backward`;
   - finite-gradient check with the pre-clip norm logged (`clip_grad_norm_(…, 10.0, error_if_nonfinite=True)`);
   - `opt.step()`;
   - `sched.step()`.
   - **Log** step, LR, total, cls and box loss, and the pre-clip norm.
7. **DEV loss pass:**
   - set `model.eval()` and assert it;
   - under `torch.no_grad()`, run over all 160 DEV samples in batches of 4;
   - accumulate the **numerators and the positive-cell denominator over the whole set**, so DEV loss is Σ focal / Σ num_pos and Σ (1 − IoU) / Σ num_pos, independent of batching;
   - also decompose it by class and size bucket;
   - set `model.train()` and assert it.
8. **Checkpoint and checks:**
   - write `checkpoint-e<NN>.pt` (§7) atomically, reload it and verify it;
   - append to `checkpoints.json`;
   - re-hash the T1 artifact;
   - update `run-record.json`.
9. **Annotate:** update the best-DEV-loss pointer, and the early-stopping annotation (Option A) or decision (Option B).

**After the last epoch:**

10. **End checks:**
    - re-hash the TRAIN and DEV manifests and the T1 artifact;
    - write the final `run-record.json` with status `COMPLETED`, the best epoch, the stop epoch and reason, the durations, and every checkpoint's SHA-256.

The run never writes outside its output directory and never deletes anything.

## 4. Deterministic configuration record

`run-record.json` holds, as `provenance_plan` already assembles plus the run's own fields:

| Group | Fields |
|---|---|
| Code | git commit, tracked-change flag (must be false), untracked files listed, `train_v2.py` SHA-256 |
| Data | dataset name, version and render revision; TRAIN and DEV manifest hashes; G10 configuration, threshold and evidence hashes and approval; sample, target and positive-cell counts |
| Model | architecture (model, widths, stride, input, class order), parameter count (61,468 expected), initialisation statement |
| Configuration | every hyper-parameter, the seed, the run-configuration canonical SHA-256 and approval |
| Environment | Python, torch, numpy and pillow versions; `torch.__config__` output; thread count; deterministic-algorithms flag; OS and CPU; machine id |
| Results | per-epoch TRAIN loss (mean over steps; cls and box), DEV loss (total, cls, box, per class and bucket), LR, clipped-step fraction, per-epoch wall time |
| Checkpoints | path, SHA-256, epoch, step, bytes, verified flag |
| Outcome | status (STARTED / COMPLETED / FAILED / INTERRUPTED), stop epoch and reason, best epoch, failure condition id if any |
| Protection | T1 hash at start, after every checkpoint, and at the end |
| Label | `UNADOPTED`. The model registry is unchanged |

All JSON is written with sorted keys and a trailing newline. Timestamps go only in fields that are excluded from the configuration hash.

## 5. What a successful run is

A run is **SUCCESSFUL** if and only if **all** of the following hold:

1. **Completion:** the run reached its stop condition, which is 40 epochs under Option A, or the patience rule or 40 epochs under Option B, with no failure condition (§6) raised.
2. **Steps:** exactly 150 × (epochs run) optimizer steps executed, each epoch consuming all 600 TRAIN samples once.
3. **Finite values:** every logged loss, gradient norm and DEV loss is finite.
4. **Checkpoints:** every checkpoint was written, reloaded and verified, and its SHA-256 is in the ledger.
5. **Best checkpoint:** a best DEV-loss checkpoint is identified.
6. **T1:** the hash equals ADR-0003 at start, after every checkpoint and at end.
7. **Manifests:** the TRAIN and DEV hashes are equal at start and end.
8. **Run record:** complete, with status `COMPLETED`.

**What success does not mean:** "successful" is an **engineering** outcome. It says nothing about detector quality, which needs the separately authorised DEV evaluation (`evaluation-plan.md`) and, for an unbiased claim, a TEST evaluation that does not exist yet.

**Reported alongside success, not as a failure:**
- **`unconverged`:** DEV loss improved by at least min delta in the last 5 epochs;
- **`overfitting signal`:** DEV loss at the end exceeds its minimum by more than min delta while TRAIN loss kept falling;
- **the epoch of the minimum DEV loss.**

## 6. Failure conditions (all fail closed: stop, record, never retry silently)

| Id | Condition | Detected by | Action |
|---|---|---|---|
| F1 | **NaN or infinite loss** (total, cls or box) on any step | `torch.isfinite` on the three values before `backward` | Stop before the step is applied; status FAILED; the last verified checkpoint stays as is |
| F2 | **Invalid gradients**: any non-finite gradient, or a non-finite or exactly zero total pre-clip norm | `clip_grad_norm_(…, error_if_nonfinite=True)` plus an explicit zero-norm check | Stop before `opt.step()`; FAILED |
| F3 | **Missing batches**: an epoch with ≠ 150 steps, a batch ≠ 4, a permutation that is not complete and duplicate-free, or a DEV pass not covering exactly 160 samples / 1,408 targets / 44,308 positive cells | counters asserted at the end of each epoch and each DEV pass | FAILED |
| F4 | **Dataset hash mismatch**: a TRAIN or DEV manifest hash ≠ binding (`f283720f…`, `f072507a…`), a frame hash or size mismatch, or counts ≠ §3 step 4 | the adapter at load (existing); re-hash at the end and on resume | Refuse to start, or FAILED |
| F5 | **G10 evidence mismatch**: configuration, threshold or evidence hash ≠ recorded, or any adapter G10 refusal | `G10Policy` (existing, fail-closed) | Refuse to start |
| F6 | **Unexpected T1 hash change** | re-hash `t1-ui-head.onnx` at start, after each checkpoint, at end | Stop at once; FAILED with `T1_CHANGED`; touch nothing; escalate to the owner. The run is invalid regardless of its other results |
| F7 | **Invalid checkpoint**: write error, reload error, SHA-256 ≠ written, keys or shapes ≠ `UiHead`, any non-finite tensor, metadata (epoch, step, configuration hash, dataset hashes, git commit) ≠ the run's | reload and compare immediately after each atomic write | FAILED |
| F8 | **DEV data loading failure**: DEV refused by the adapter, or a DEV pass raising | DEV is loaded **before** step 1; any DEV-pass exception | Refuse to start; or FAILED. **Never train without DEV** |
| F9 | Configuration not approved, invalid, or mentioning TEST | `validate_run_config` (existing) plus an approval check | Refuse to start |
| F10 | Output directory unsafe or existing | `assert_safe_output` (existing) | Refuse to start |
| F11 | Tracked changes in the working tree | `git status` at start | Refuse to start |
| F12 | Non-deterministic op hit | `use_deterministic_algorithms(True)` raises | FAILED |
| F13 | Out of memory, disk full, or any unexpected exception | the top-level handler | FAILED with the exception type; no stack data containing local paths goes in the record |
| F14 | Wall-clock budget exceeded (owner-set; see D7) | elapsed time checked after each epoch | Stop; status `STOPPED_BUDGET`; not a success |
| F15 | Operator interruption (Ctrl-C) | `KeyboardInterrupt` | status `INTERRUPTED`; the last verified checkpoint is usable for resume (§7) |

**Common rules on failure:**
- The output directory is **kept, never deleted or overwritten**, and labelled by its status.
- A retry uses a **new run id**, except for an authorised resume (§7).
- No checkpoint from a FAILED run may be evaluated.

## 7. Checkpoints, recovery and failure handling

- **Contents** of `checkpoint-e<NN>.pt`:
  - model `state_dict`, including the BN running statistics;
  - AdamW state;
  - scheduler state;
  - torch RNG state and the numpy `Generator.bit_generator.state`;
  - epoch, global step;
  - run-configuration hash, dataset hashes, git commit.
  - Written via `torch.save`.
- **Atomic write:**
  - write to `checkpoint-e<NN>.pt.partial` in the run directory;
  - flush and fsync;
  - rename to the final name, which must not already exist;
  - reload with `torch.load(weights_only=True)` and verify (F7);
  - record the SHA-256 in `checkpoints.json`.
  - A leftover `.partial` marks an incomplete write and is never loaded.
- **Frequency:** every epoch, all kept, at an estimated ≈ 0.74 MB each (`resource-estimate.md`).
- **Best:** the minimum DEV loss, with ties going to the **earlier** epoch. The best is a ledger pointer, not a copy.
- **Resume policy (owner decision D5; recommended):**
  - **Allowed only:** after F15 (interruption) or F13 caused by an external event, such as a power or OS failure. Never after F1–F12.
  - **Starting point:** resume only from the **last verified** checkpoint in the same run directory, after re-running the full pre-flight with **identical** git commit, configuration hash, dataset hashes, G10 hashes and environment versions.
  - **Flagged:** the resumed run is marked `resumed: true`, and the epochs re-run are listed.
  - **UNKNOWN:** whether a resumed run is bitwise identical to an uninterrupted one. A resumed run is therefore not described as equivalent unless that is shown.
- **Training only:** nothing is exported and nothing is predicted (§9).

## 8. T1 protection, before and after

- **Hash check:** `t1-ui-head.onnx` must hash to `ba6d9e93695b22d17d9dc2b8193966132af85a6a031b08eb453d1d20a05179d0` (ADR-0003; 302,960 bytes):
  - before the output directory is created;
  - after every checkpoint;
  - at the end.
- **Output guard:** the run's only output root is the guarded `t1-ui-head-v2-<run id>`.
- **Registry and shipping:** no file under `artifacts/models/t1-ui-head/`, the model registry, `PROVISIONAL_THRESHOLDS` or the production detector is written.

## 9. Deliberately deferred

| Item | Why deferred | Needs |
|---|---|---|
| ONNX export of the best checkpoint, and the ORT-versus-torch parity check | the export probe runs the model (inference). v1's lesson: measure the exported artifact, so export belongs with evaluation. **FACT:** native `onnxruntime` is 1.20.1 on W1 and is not in the pinned test requirements. The QG-03a-B3-1 reference used native 1.29.0 | the DEV evaluation authorisation, plus a pinned onnxruntime version (D9) |
| DEV detection metrics; T1 baseline on DEV | detector inference | its own authorisation (D8) |
| Seed repeats (2–3 seeds) | each is a full run | D6 |
| Learning-rate or batch sweep, per-object loss normalisation, ignore-masks for partial occlusion, augmentation | each is a separate, attributable change | later experiments |

---

**Amended by M22.12 (2026-11-03).** Parts of this document are superseded by `artifacts/experiments/M22.12-occlusion-mask-and-config/training-specification-update.md`. The text above is kept unchanged as the M22.10 record.
