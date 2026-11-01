---
id: M22.4-train-dev-candidate
title: "M22.4 — controlled TRAIN/DEV rendering and dataset validation"
status: recorded — candidate 1 built and PASSED G1–G9 on TRAIN, DEV and both; NO MODEL TRAINED, NO DETECTOR RUN
date: 2026-11-02
label: FACT (rendered on W1, measured, gated) / reproducibility FACT on W1 only
classification: DATASET GENERATION AND VALIDATION — owner-authorised, TRAIN and DEV only; no TEST, no detector, no training
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.4 — TRAIN/DEV candidate dataset

> **Owner authorisation:** implement the v2 renderer and generate a local TRAIN/DEV candidate from
> the M22.3 configuration, with 10% positive oversampling. **TEST is out of scope:** no TEST sample
> was planned, seeded, rendered, written or read. **No model was trained and no detector was run;**
> nothing here is a recall or precision figure, or a claim about model quality.

## Hypothesis

The approved configuration is feasible, and the v2 generator plus a browser renderer produce a
TRAIN/DEV dataset in which every scheduled positive is a valid positive by the M22 rule, and every
scheduled occlusion case is observed as declared. Such a dataset passes G1–G9 and reproduces exactly.

## Environment

**Machine:** W1, Windows 11 (`win32 10.0.26300`), Node v24.22.1.

**Browser:** Chromium 153.0.8010.12, headless, launched by Playwright 1.63.0, in this context:
- `deviceScaleFactor` 1;
- offline, with every request aborted;
- `colorScheme` light, `reducedMotion` reduce;
- locale en-US, timezone UTC.

**Source:** commit `68ace3c`.

## Configuration (approved; `tools/dataset/v2/configs/m22.4-train-dev.json`)

| | TRAIN | DEV |
|---|---|---|
| Requested samples | 600 | 160 |
| Positives scheduled per class × size cell (G4 minimum) | 165 (150) | 44 (40) |
| Partial / full occlusion cases per cell, on top | 15 / 15 | 4 / 4 |
| Scheduled targets | 5,280 + 480 + 480 = **6,240** | 1,408 + 128 + 128 = **1,664** |
| Slots (samples × 12) and utilisation | 7,200, 86.7% | 1,920, 86.7% |

**Shared settings:**
- at most 12 targets per sample and 60 overflow samples;
- the six viewports;
- G1–G9 required, expected splits TRAIN and DEV;
- G5 0.9, G6 0.02, G8 0.5 px;
- leakage `elementIou` 0.5 and `layoutShare` 0.5.

The build checks that the schedule's totals equal these stated totals before it plans anything.

## Expected result

**Feasibility:**
- the plan reconciles exactly.

**Render:**
- every planned sample renders with no defect.

**Validity:**
- G4 finds at least 150 (TRAIN) and 40 (DEV) valid positives in every one of the 32 cells;
- every occlusion case is observed as declared.

**Validation:**
- G1–G9 PASS on TRAIN, on DEV and on both together.

**Reproducibility:**
- a second build reproduces the specs, HTML and annotations, and the frames where rendering is deterministic.

## Actual result

### Renderer

`tools/dataset/v2/render.mjs` and `build-candidate.mjs`, described in `tools/dataset/v2/README.md`
§Rendering.

**Per sample, the renderer:**
- loads the spec's standalone HTML with `setContent` at the spec's exact viewport and DPR 1;
- reads back every labelled element's rect and computed `position`, and every occluder's rect;
- classifies each element by `elementFromPoint` at the 5 × 5 and 9 × 9 grid points, using the tested `hitMatches` and `classifyElement`;
- captures the PNG frame.

**Render defects refuse the build:**
- a wrong viewport, DPR or frame size;
- a missing or extra element or occluder;
- an occluder away from its declared box;
- any network request;
- a browser error.

**A positive counts toward G4 only if it is:**
- intended as a positive;
- HIT_TESTABLE on both grids, which requires its box to be wholly inside the viewport;
- within 0.5 px of its declared box;
- positioned `absolute`.

### Candidate 1: **PASS**

Destination: `artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-1/` (git-ignored, about 17 MB).

| | TRAIN | DEV |
|---|---|---|
| Samples: requested / overflow / planned / rendered | 600 / 0 / 600 / 600 | 160 / 0 / 160 / 160 |
| PNG frames written | 600 | 160 |
| Failed renders | 0 | 0 |
| Annotations | 6,240 | 1,664 |
| Positives: planned → observed HIT_TESTABLE | 5,280 → 5,280 | 1,408 → 1,408 |
| Valid positives per cell (G4), min–max over 32 cells | **165–165** (minimum 150) | **44–44** (minimum 40) |
| Positives excluded by G4 for source geometry | 0 | 0 |
| Partial occlusion: planned → observed PARTIALLY_OCCLUDED | 480 → 480 (15 in every cell) | 128 → 128 (4 in every cell) |
| Full occlusion: planned → observed FULLY_OCCLUDED | 480 → 480 (15 in every cell) | 128 → 128 (4 in every cell) |
| Any other validity (SAMPLING_SENSITIVE, clipped, unexpected occlusion) | 0 | 0 |
| G8 worst edge difference, rendered against declared | 0 px | 0 px |
| Viewports (samples) | 1280×720 105, 1280×800 97, 1024×640 104, 960×600 95, 1024×1024 100, 800×1280 99 | 26, 24, 23, 29, 32, 26 |

**Gate.** G1–G9 all PASS, with no required check NOT_APPLICABLE, in each of three runs:
- **TRAIN alone:** G5 has 0 duplicate pairs, G6 0 repeated boxes, G7 TRAIN only.
- **DEV alone:** the same.
- **TRAIN and DEV together:** G7 finds no shared id, seed or layout.

**Leakage at plan time:** 0 cross-split matches over 288,420 pairs. The full record is in `logs/w1-build-record-candidate-1.json`.

**Hashes** (SHA-256; full values are in the build record and manifests):

| | TRAIN | DEV |
|---|---|---|
| Plan | `eb122aee…ec30719dd` | `7b850e6a…a25492be` |
| Manifest | `95db7b6f…1a571f0e` | `f0cb43d1…b3172e1` |
| Spec hashes (list) | `25580179…b2fbb` | `9fc88bd1…5413a` |
| Frames (list) | `798680b5…265014` | `e1ab8857…0140` |

**Configuration hashes:**
- generator configuration `456d5bdf…5703a`;
- build configuration `8db43d9d…a3d22`;
- schedule `5af3df64…ddece`;
- the source hash of every generator module is in the record.

### Reproducibility

The same configuration and source were built again into a scratch directory outside the repository, then compared with `compare-builds.mjs` (`logs/w1-reproducibility-candidate-1-vs-scratch.json`).

**All 760 samples are identical:**
- same ids;
- spec hash, HTML hash, annotations and provenance;
- **PNG frame hash**;
- manifest content apart from the destination label.

**Scope of this result:**
- **FACT, W1 only:** rendering was byte-deterministic on W1 with this Chromium build.
- **UNKNOWN:** another machine, GPU, font set or Chromium version. Different local fonts would change the frames. The font stacks are recorded; the resolved faces are not.

## Limitations

- **No training-readiness claim.** Nothing shows yet that this dataset trains a better detector. No model was trained and no detector was run.
- **Training adapter missing.** `tools/detector/data.py` reads a single `manifest.json`. The v2 candidate has one manifest per split, so training would need an adapter. That is not done, and training is not authorised.
- **Hit tests are not pixels.** They do not prove pixel-level visibility. Examples: a dark glyph on a dark plate, or text clipped by `overflow: hidden`.
- **Synthetic pages only.** No claim of realism.
- **One machine.** Reproducibility is shown on W1 only.
- **TEST seal still weak.** TEST authorisation is unchanged, and no TEST data exists for this version.

## Conclusion

Candidate 1 meets the approved configuration exactly:
- every scheduled positive is a valid positive;
- every occlusion case was observed as declared;
- G1–G9 pass on TRAIN, DEV and both;
- the build reproduces byte for byte on W1.

It is a **candidate**: using it for training needs a further owner decision.

## Reproducibility

```bash
node tools/dataset/v2/build-candidate.mjs --config=tools/dataset/v2/configs/m22.4-train-dev.json --candidate=<new number>
node tools/dataset/v2/build-candidate.mjs --config=tools/dataset/v2/configs/m22.4-train-dev.json --scratch-out=<absolute directory outside the repository>
node tools/dataset/v2/compare-builds.mjs --a=<build> --b=<build>
```
