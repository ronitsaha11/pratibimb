# Future `tools/detector/train_v2.py`: design only (NOT implemented, NOT run)

> M22.7 implements only the adapter (`data_v2.py`) and the dry run (`dry_run_v2.py`). This page
> describes a training entry point for a later, separately authorised milestone. **No training code
> exists, and no model was trained.**

## Principles

1. **Never the legacy trainer.**
   - `train_v2.py` does not import or call `train.py`'s `main`.
   - It does not touch `DATA = artifacts/datasets/t1-ui-v1`, `OUT = artifacts/models/t1-ui-head`, or the legacy `("dev", "test")` prediction loop.
   - It may import the model and loss *definitions* (`head.UiHead`, `targets.detector_loss`, `head.decode`), which are pure functions of their inputs.
2. **TRAIN trains, DEV validates, TEST does not exist.**
   - Data comes only from `data_v2.V2SplitDataset(root, "train" | "dev", g10)`, which refuses any other split before touching a file.
   - The entry point has no split argument, and no TEST path, fallback or prediction.
3. **A new output directory, never the T1 model's.**
   - Output goes to `artifacts/models/t1-ui-head-v2-<run id>/`.
   - The run refuses if that directory exists.
   - It also refuses if the resolved path is `artifacts/models/t1-ui-head`, or is inside it.
   - The shipped T1 artifact (SHA-256 `ba6d9e93…5179d0`) is checked before and after the run and must be unchanged.
4. **Gated on the data.**
   - The run starts only after `dry_run_v2.py` passes on the same candidate.
   - It requires an **approved** G10 configuration: with provisional thresholds the run refuses.
   - It requires `acceptance(...)["claimed"]` to be true, so every cell is at its minimum after G10 exclusions.
   - It requires the owner's explicit acceptance of the candidate, recorded in the run configuration.
5. **Provenance in every output.** A `run-record.json` holds:
   - **Data:** the candidate name and number, both manifest hashes, the G10 configuration (thresholds and approval) and the G10 class file's hash, and the adapter's per-class × bucket counts and exclusions.
   - **Run:** the training seed and every hyper-parameter, and the git commit with the hashes of `data_v2.py`, `train_v2.py`, `head.py` and `targets.py`.
   - **Environment:** the torch version, device and determinism settings.
   - **Model:** the SHA-256 of every file written, and the label UNADOPTED.

## Shape

```
train_v2.py --candidate=<n> --g10-config=<approved.json> --g10-classes=<classes.json>
            --build-config=<config.json> --run-config=<run.json>
  1. refuse unless: the dry run passes in-process (same checks), the G10 config is approved, acceptance is
     claimed, and the run config names the owner's candidate acceptance
  2. train  = V2SplitDataset(root, "train", g10)    # positives only; occlusion cases never targets
     dev    = V2SplitDataset(root, "dev", g10)
  3. train UiHead on train (seeded, deterministic algorithms as train.py sets them)
  4. evaluate on dev only: loss and the DEV threshold sweep; no TEST, no claim of detector quality
  5. write weights + run-record.json to the new directory; verify the T1 artifact hash is unchanged
```

## What stays out of scope until separately authorised

- Running it.
- Comparing any resulting model with T1.
- Exporting it to ONNX for the product.
- Adopting it.
- Building or evaluating TEST, including the blocked M22 recall runner.
