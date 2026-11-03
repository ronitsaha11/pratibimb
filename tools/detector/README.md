# `tools/detector` — the T1 detector tooling

The legacy pipeline: `data.py` (v1 loader), `train.py` (v1 trainer, `t1-ui-v1` →
`artifacts/models/t1-ui-head`), `head.py`, `targets.py` and the QG harness scripts. It is unchanged by
M22, and nothing in the v2 tooling imports or calls `train.py`.

**Scope (M22.19).** The v2 tooling here is M22's engineering deliverable, and that scope is closed. **No
detection result exists for T1 or T1-v2.** Detector-performance research is deferred to **FR-01**
(`agentos/registry/future-research-register.md`), which is **not authorised for execution**, and the M22
evaluation restriction remains in force (`agentos/blockers.md` B-07). The epoch-39 checkpoint is UNADOPTED.

## The v2 data adapter (M22.7–M22.9)

| File | Does |
|---|---|
| `data_v2.py` | Loads a v2 synthetic candidate's TRAIN and DEV **separately**, and refuses any other split before touching a file. It checks frame sets, SHA-256s and sizes; derives `captureSize` from the frame; checks each annotation's sample, class, box and size bucket. It keeps **positives only**, applies the G10 policy below, and reports exclusions by category, class and size bucket. `load_accepted_split` loads a split **as an accepted dataset**: approved G10 only. `V2SplitDataset` feeds the unchanged `data.sample_to_tensors` |
| `dry_run_v2.py` | Loads TRAIN and DEV, checks they share nothing, reports counts and exclusions. With `--tensors` it runs every sample through the v1 input path; adding `--ignore-mask` also totals the ignore masks. No model |
| `train_v2.py` | The separate v2 entry point: `--preflight` (M22.9; writes nothing) and `--train` (M22.13: the one owner-authorised run, needing an APPROVED configuration). See "Training" below |
| `loss_v2.py` | `targets.detector_loss` with the partial-occlusion ignore mask: ignored classification entries contribute zero; bitwise equal to the legacy loss under an empty mask (M22.13) |
| `telemetry_v2.py` | Observation-only training telemetry (M22.15–M22.17). Monotonic phase timing with UTC boundaries; process CPU share; per-step timing (`StepTimer`: failed reads stated as untimed); Windows memory and suspend evidence; append-only sessions and run timing. Every value is tagged measured, derived or unavailable-with-reason, and no telemetry failure reaches the training control flow |
| `occlusion_mask_v2.py` | The partial-occlusion classification ignore mask (M22.12): a pure helper. For each partial-occlusion case, it ignores that class's channel wherever a cell's receptive field (31 px, exact for `UiHead`) sees the control's visible part. Positives always win; full occlusion ignores nothing; box targets are untouched |
| `configs/train-v2-first-run.APPROVED.json` | The same configuration with the owner's M22.13 approval for one run: the only configuration `--train` was run with |
| `configs/train-v2-first-run.PROPOSED.json` | The canonical first-run configuration, schema `train-v2-run-config/2` (M22.12): **proposed, pending owner approval** |
| `configs/train-v2-first-experiment.PROPOSED.json` | The M22.9 proposal, schema 1: kept as history; the validator refuses it |
| `tests/` | The pytest suite (synthetic candidates and a synthetic repository in a temp directory; never a real dataset, real weights or TEST). `test_training_v2.py` runs the real training loop with the real `UiHead` architecture on a 3-frame synthetic fixture; the telemetry integration and resume tests replace every model, data and checkpoint operation with fakes |
| `requirements-test.txt` | The suite's exact dependency pins (CPU torch) |

**G10 policy.** The adapter requires a G10 threshold configuration that records its approval status, plus the evidence computed from it (`tools/dataset/v2/audit-candidate.mjs --g10-out`).

- **Approved:**
  - The configuration is `tools/dataset/v2/configs/g10-approved-candidate-2.json`, approved by the project owner on 2026-11-02, for candidate 2 in its rendering environment only.
  - The evidence must be format 2 (every positive with its metrics), bound to that configuration, its thresholds and the candidate's manifests. The configuration is bound to them too.
  - Every category is recomputed from its metrics. A missing metric or a missing, duplicate or unexpected id is a refusal.
  - INVISIBLE and BORDERLINE positives are excluded and counted.
- **Provisional:**
  - The configuration is `g10-provisional-UNAPPROVED.json`, kept as historical evidence.
  - Nothing is excluded for G10, and no acceptance is claimed.

**Candidate status.** Candidate 2 (`artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-2`) is **conditionally accepted** by the owner (M22.9) for a first controlled training experiment, subject to approved-G10 verification. That verification passed: every cell kept 165 TRAIN / 44 DEV visible positives, against minimums of 150 / 40.

## Running the tests

```bash
python -m pip install -r tools/detector/requirements-test.txt
```
```bash
npm run test:py
```

**Inside `npm run verify`:**
- `npm run test:py` runs `scripts/verify-python.py`. That script checks the Python version and every pinned dependency, then runs `python -m pytest tools/detector/tests`.
- It is the **last step of `npm run verify`**, so a failing Python test fails verification.
- It **fails, never skips,** when Python or a dependency is missing, printing the install command, or when no test is collected.
- A version drift from the pins is a warning locally, and a failure with `PRATIBIMB_STRICT_PY_PINS=1`.

**In CI:** the `detector-adapter` job installs the pins on Python 3.13 and runs the same runner in strict mode.

## Training

**M22.13:** `--train` ran once: `artifacts/models/t1-ui-head-v2-first-run-01` (git-ignored), COMPLETED, best checkpoint epoch 39, UNADOPTED. It refuses while a v2 run directory exists; a further run needs a new owner authorisation. The record is at `artifacts/experiments/M22.13-first-training-run/`. That run predates the M22.15–M22.17 telemetry, and **no real run has produced it yet**.

### Pre-flight

```bash
python tools/detector/train_v2.py --preflight --candidate=2 \
  --g10-config=tools/dataset/v2/configs/g10-approved-candidate-2.json \
  --g10-evidence=artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json \
  --build-config=tools/dataset/v2/configs/m22.4-train-dev.json \
  --run-config=tools/detector/configs/train-v2-first-run.PROPOSED.json --run-id=<id>
```

**What `train_v2.py` checks and assembles:**
- the T1 artifact's SHA-256 against ADR-0003, before and after;
- the run configuration (schema 2), with no defaults and no TEST reference. It checks the exact step count, a schedule that ends on the last step, and that every checkpoint has a DEV loss;
- that the configured steps per epoch and DEV batches are the data's exact quotients (no partial batch), and that the CPU thread count exists;
- with `loss.partialOcclusion: ignore-mask`, every sample's ignore mask, totalled per class;
- approved G10 evidence;
- TRAIN and DEV, through separate `load_train` and `load_dev`, as an accepted dataset, including the cell minimums and the v1 tensor path;
- a new `artifacts/models/t1-ui-head-v2-<run id>` output directory, which is **not created**;
- the provenance record a future run would write.

It prints the plan as JSON.

**What pre-flight does not do:** it builds no model, no optimizer, no forward or backward pass, no checkpoint and no prediction. `--train` adds the training step and nothing else: no decode, no detection metric, no export. With neither flag, the command refuses.

**Design and review:**
- `artifacts/experiments/M22.7-training-adapter/train-v2-design.md`;
- `artifacts/experiments/M22.8-verification-readiness/training-architecture-review.md`;
- the M22.9 record;
- the M22.12 record (the ignore mask, schema 2, the assignment-order ADR proposal).
