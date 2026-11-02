# `tools/detector` — the T1 detector tooling

The legacy pipeline: `data.py` (v1 loader), `train.py` (v1 trainer, `t1-ui-v1` →
`artifacts/models/t1-ui-head`), `head.py`, `targets.py` and the QG harness scripts. It is unchanged by
M22.

## The v2 data adapter (M22.7, M22.8): data only, no training

| File | Does |
|---|---|
| `data_v2.py` | Loads a v2 synthetic candidate's TRAIN and DEV **separately**, and refuses any other split before touching a file. It checks frame sets, SHA-256s and sizes; derives `captureSize` from the frame; checks each annotation's sample, class, box and size bucket. It keeps **positives only** (occlusion cases are excluded and counted), and applies an explicit G10 policy (below). `V2SplitDataset` feeds the unchanged `data.sample_to_tensors` |
| `dry_run_v2.py` | Loads TRAIN and DEV, checks they share nothing, reports counts and exclusions, and with `--tensors` runs every sample through the v1 input path. **No model, no optimizer, no prediction, no split argument** |
| `tests/` | The pytest suite (synthetic candidates in a temp directory; never a real dataset folder) |
| `requirements-test.txt` | The suite's exact dependency pins (CPU torch) |

**G10 policy.** The pixel-visibility diagnostic's thresholds are **not approved by the owner**.
- **Inputs:** the adapter requires a threshold configuration that records its approval status, and the per-positive classes computed from it (`tools/dataset/v2/audit-candidate.mjs --g10-out`).
- **Binding:** the classes must use exactly those thresholds, belong to the candidate's manifests, and cover every positive.
- **While `approval.approved` is false:** nothing is excluded for G10, and **no dataset acceptance is claimed**.
- **Once approved:** INVISIBLE and BORDERLINE positives are excluded and counted separately.

**Candidate status.** Candidate 2 (`artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-2`) is a **draft**. It passes G1–G9 and loads through the adapter, and it awaits the owner's G10 and visual acceptance.

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

**Not implemented.** The design of a future, separate `train_v2.py` is
`artifacts/experiments/M22.7-training-adapter/train-v2-design.md`, reviewed in
`artifacts/experiments/M22.8-verification-readiness/training-architecture-review.md`. It must:
- never call `train.py`;
- never use TEST;
- never write to the T1 model's directory.
