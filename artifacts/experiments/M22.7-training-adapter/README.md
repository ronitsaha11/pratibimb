---
id: M22.7-training-adapter
title: "M22.7 — an isolated v2 TRAIN/DEV training adapter and data dry run"
status: recorded — adapter and dry run implemented and tested; candidate 2 loads; NO MODEL TRAINED, NO INFERENCE
date: 2026-11-02
label: FACT (adapter tests; dry run on candidate 2, W1)
classification: DATA COMPATIBILITY — no training, no detector inference, no TEST, candidates unmodified
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.7 — v2 training adapter

> **No model was trained, no optimizer step was taken, no weights were written, and no detector
> inference was run.** The legacy loader (`tools/detector/data.py`) and trainer (`train.py`) are
> unchanged. Only candidate 2's directory was read for the dry run. TEST does not exist in this code
> path.

## Hypothesis

A separate adapter can load candidate 2's TRAIN and DEV into the existing training input path with:
- every frame verified;
- positives only;
- occlusion cases excluded and counted;
- G10 applied explicitly, with its approval status recorded.

All of that without modifying the legacy loader or trainer.

## Environment

W1, Python 3.13.14, torch 2.14.0+cpu, Pillow 12.3.0, pytest 9.1.1, Node v24.22.1.

## Expected result

- Both splits load separately.
- Frame hashes, sizes, associations and buckets are verified.
- Counts reconcile with M22.6.
- Occlusion cases are excluded.
- The G10 mode is PROVISIONAL, with acceptance not claimed.
- The unchanged `sample_to_tensors` accepts every sample.

## Actual result

### Architecture

| Piece | Does |
|---|---|
| `tools/detector/data_v2.py` (new) | `require_split` (TRAIN or DEV, refused before any file access); `load_split`; `G10Policy`; `check_separation`; `acceptance`; `V2SplitDataset`, with the interface of `data.SplitDataset` over the unchanged `data.sample_to_tensors` |
| `tools/detector/dry_run_v2.py` (new) | Loads TRAIN and DEV, checks separation, reports counts, exclusions and acceptance, and with `--tensors` runs every sample through the v1 input path. No model is constructed |
| `tools/detector/tests/test_data_v2.py` (new) | 31 tests on small synthetic candidates in a temp directory |
| `tools/dataset/v2/audit-candidate.mjs` | `--g10-out`: the per-positive G10 classes, tied to the threshold configuration, the manifest hashes and a hash of every classified positive id |
| `tools/dataset/v2/configs/g10-provisional-UNAPPROVED.json` | Gains an explicit `approval` block (`approved: false`). Its thresholds are unchanged |

**`load_split` per split:**
1. **Files:** it opens exactly `manifest-<split>.json`. The split's frame folder must hold exactly the referenced frames.
2. **Frames:** each frame's SHA-256 must match the manifest, and its decoded size must equal the recorded size and the viewport. `captureSize` is derived from the frame.
3. **Annotations:** each must belong to its sample, use one of the eight `head.CLASSES` (same order as v2), have a finite box (positives inside the viewport), and sit in a bucket that agrees with its rendered box.
4. **Positives only:** it keeps annotations that are `positive is True`, intent `positive` and HIT_TESTABLE. Occlusion cases and other non-positives are counted as exclusions. An occlusion case flagged positive is an error.
5. **Box semantics:** boxes stay in CSS viewport px with a top-left origin, which is the input `sample_to_tensors` converts.
6. **Provenance:** seed, spec hash, frame hash and HTML hash are kept.

**G10 policy:**
- **Inputs:** a threshold configuration with an `approval` block, plus the classes computed from it, are both required. There is no default.
- **Binding:** the classes must use exactly those thresholds, be computed against these manifests, and cover exactly these positives (by id hash).
- **APPROVED** (`approved: true`, with `approvedBy` and `approvedOn`): INVISIBLE and BORDERLINE positives are excluded and counted separately.
- **PROVISIONAL** (anything else): nothing is excluded for G10, non-visible positives are only reported, and `acceptance` refuses to claim the dataset.

### Candidate 2 dry run (`logs/w1-dry-run-candidate-2.json`)

Run with the provisional thresholds and `--tensors`.

| | TRAIN | DEV |
|---|---|---|
| Samples loaded | 600 | 160 |
| Frames: verified / missing / unexpected | 600 / 0 / 0 | 160 / 0 / 0 |
| Positives kept | 5,280: **165 in every one of 32 cells** | 1,408: **44 in every cell** |
| Excluded: partial occlusion | 480 | 128 |
| Excluded: full occlusion | 480 | 128 |
| Excluded: other non-positive | 0 | 0 |
| G10 non-visible found (BORDERLINE / INVISIBLE) | 0 / 0 | 0 / 0 |
| G10 exclusions | none: PROVISIONAL mode | none: PROVISIONAL mode |
| Kept box range, CSS px (min x, min y, max right, max bottom) | 16, 61, 1264, 1263 | 16, 63, 1264, 1257 |
| `sample_to_tensors`: samples / input shape | 600 / [3, 640, 640] | 160 / [3, 640, 640] |
| Targets / positive cells assigned | 5,280 / 168,250 | 1,408 / 44,308 |
| Samples with targets but no positive cell | 0 | 0 |
| Target boxes outside the letterboxed content | 0 | 0 |

**Further results:**
- **Separation:** TRAIN and DEV share no sample id, seed, spec hash or frame.
- **Acceptance:** **not claimed.** "G10 thresholds are not approved: results are diagnostic, and no dataset acceptance is claimed."
- **G10 classes** (`logs/w1-candidate-2-g10-classes-provisional.json`): 5,280 + 1,408 positives classified, all VISIBLE, bound to manifest hashes `f283720f…` (TRAIN) and `f072507a…` (DEV).

### Tests

- **Adapter:** `python -m pytest tools/detector/tests -q`: **31 passed**. The tests cover:
  - **Loading and accounting:** TRAIN and DEV load independently; counts per class × bucket; occlusion cases excluded and counted; `captureSize` and provenance; the v1 tensor path.
  - **Split and frame refusals:** `test`, `holdout`, empty and case-variant splits are refused before file access; a sample of another split; shared seeds or frames between TRAIN and DEV; hash mismatches; missing or unexpected frames; wrong sizes; frame paths outside the split folder.
  - **Annotation refusals:** an unassociated id, an unknown class, a box leaving the viewport, a degenerate box, a bucket mismatch, an occlusion case flagged positive.
  - **G10 policy:** a missing configuration or classes; missing approval; approved without an approver; missing or mismatched thresholds; classes for another build; incomplete coverage; provisional reporting without exclusion or acceptance; approved exclusion of INVISIBLE and BORDERLINE, counted separately.
  - **Command line:** the dry run accepts no split argument.
- **These Python tests are not part of `npm run verify`,** whose scripts this milestone does not change. They are run separately.
- **`npm run verify`:** see `decision.md`.

## Conclusion

Candidate 2 loads cleanly into the existing input path through a separate adapter, positives only, with every frame verified. G10 remains provisional, so the adapter claims no acceptance. Training remains a separate, unauthorised step (`train-v2-design.md`).

## Reproducibility

```bash
node tools/dataset/v2/audit-candidate.mjs --candidate=2 --g10=tools/dataset/v2/configs/g10-provisional-UNAPPROVED.json --g10-out=<file outside the repository>
python tools/detector/dry_run_v2.py --candidate=2 --g10-config=tools/dataset/v2/configs/g10-provisional-UNAPPROVED.json --g10-classes=<that file> --build-config=tools/dataset/v2/configs/m22.4-train-dev.json --tensors
python -m pytest tools/detector/tests -q
```
