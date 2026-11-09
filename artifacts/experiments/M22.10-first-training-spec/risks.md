# M22.10 — risks and limitations of the first training experiment

> **Labels:** FACT = observed or measured on W1; INFERENCE = an interpretation of named FACTs; UNKNOWN = must be measured.
> **No new numbers:** every figure is either recorded in the cited evidence or arithmetic over it.

## 1. Limitations to be quoted, unchanged, in any report of this experiment

1. **Synthetic only:**
   - every TRAIN and DEV frame comes from one generator (`t1-ui-synthetic@2.1.0-draft`, render revision r2), rendered by one browser build (Chromium 153.0.8010.12, headless, DPR 1, offline);
   - G10 is approved **only** for that environment;
   - **no real page** is in TRAIN or DEV.
2. **No unbiased estimate:**
   - DEV selects the checkpoint and the threshold, so DEV figures are selection-biased;
   - no v2 TEST split exists.
3. **Same generator for DEV:** DEV shares TRAIN's generator. DEV loss detects overfitting **to the TRAIN samples**, but not overfitting **to the generator**.
4. **Narrow resolution:** at n = 44 per class × bucket cell, per-cell recall differences below about 0.2 are not resolvable (Wilson 95 % interval at 0.8 is [0.660, 0.892]).
5. **Not a like-for-like baseline:** T1 was trained on a different generator (`t1-ui-v1`), so a new-model advantage on candidate 2 DEV is an in-distribution comparison.

## 2. Review of each risk

### 2.1 Synthetic dataset realism (HIGH for any external claim; does not block the experiment)

- **FACT:**
  - layouts are stratified 3 × 3 placements;
  - appearance comes from seeded palettes and the generator's word set;
  - occluders are solid shapes;
  - the M22.9 proposal §5 names the "Go"/"OK" word share, solid occluders, grid-aligned layouts and palette shading as generator artefacts.
- **INFERENCE:** a head can learn such regularities instead of control appearance. Nothing in this experiment can show it hasn't, because DEV shares the generator (limitation 3).
- **Mitigation, within scope:** none beyond reporting. **Outside scope:** real-page data, or a second generator, under its own approval.

### 2.2 Very-small text and very-small controls (HIGH for the M22 question)

- **FACT (measured, `logs/w1-candidate-2-positive-cells.json`):**
  - very-small objects average **2.27** positive cells each in TRAIN (DEV 2.21), against 86.0 for large;
  - **342 of 1,320** very-small TRAIN objects (25.9 %) contain no cell centre and train through the single nearest cell (DEV 93 of 352, 26.4 %);
  - all 6,688 positives are G10 VISIBLE, with minimum salience 1.622 and minimum coverage@1.25 of 0.012 (TRAIN) and 0.011 (DEV) (M22.9).
- **INFERENCE:**
  - **Visible but not necessarily classifiable:** G10 VISIBLE means contrast with the surround, not legibility or class-distinguishability. A very-small link and a very-small button may be separable only by text that is not legible at model resolution.
  - **Small share of the loss:** very-small objects contribute about 1.8 % of the positive-cell loss signal (§2.6).
  - **Expectation:** very-small-bucket recall is therefore the most likely place for the experiment to show little or no gain. That would be a result, not a failure.

### 2.3 Faint native controls (MEDIUM)

- **FACT:** checkbox, radio and select include native-rendered controls. M22.6 fixed visibility defects, and under approved G10 all are VISIBLE.
- **INFERENCE:**
  - native rendering is Chromium-specific, so other browsers render these controls differently (cf. QG-03 letterbox findings, where Chromium and Firefox resampling disagree);
  - checkbox and radio also have the smallest share of positive cells: 3.8 % and 3.9 % of TRAIN cells.
- **UNKNOWN:** the effect of both on DEV recall until measured.

### 2.4 Appearance distribution (MEDIUM)

- **FACT:** appearance is seeded and drawn from a finite palette and word set (`tools/dataset/v2/appearance.mjs`). There is **no augmentation** in this run (inherited).
- **INFERENCE:** the head sees only the generator's appearance range, so any shift in appearance (themes, fonts, DPR other than 1) is untested.
- **Mitigation:** none within scope. Augmentation is a separate, measurable change.

### 2.5 Overfitting (MEDIUM)

- **FACT:**
  - 61,468 parameters against 600 TRAIN images (5,280 objects and 168,250 positive cells);
  - weight decay 1e-4 shrinks weights by a factor of 0.9991 over the whole run, so it is not an effective regulariser (`hyperparameter-review.md` §6);
  - no dropout or augmentation.
- **INFERENCE:** the effective mitigations are best-checkpoint selection on DEV and the 40-epoch cap.
- **Signals to report:** the DEV-minus-TRAIN loss gap per epoch, and the `overfitting signal` flag (`experiment-specification.md` §5).

### 2.6 Class and size balance (MEDIUM; FACT-based)

- **FACT:** objects are exactly balanced: 165 per class × bucket in TRAIN, 44 in DEV.
- **FACT:** positive **cells** are not:

  | | TRAIN | DEV |
  |---|---|---|
  | very-small | 1.8 % | 1.8 % |
  | small | 6.0 % | 6.4 % |
  | medium | 24.7 % | 24.3 % |
  | large | 67.5 % | 67.6 % |

  - **Classes (TRAIN):** from textbox 28.0 % down to checkbox 3.8 %, a 7.3× spread.
- **INFERENCE:** the loss is normalised per cell, so its signal follows the cell shares, not the object shares (`hyperparameter-review.md` §14).

### 2.7 Dataset size (MEDIUM)

- **FACT:** TRAIN has 600 samples and 5,280 objects; DEV has 160 samples and 1,408 objects. v1 trained on 120 samples.
- **INFERENCE:** that is enough to train this 61K-parameter head (v1 trained it on 120), but too few for DEV to resolve per-cell differences (§1.4).

### 2.8 Is batch size 4 appropriate? (LOW)

- **FACT:** 600 and 160 divide exactly.
- **INFERENCE:**
  - analytic activation memory is about 119 MiB, so memory does not force it (`resource-estimate.md`);
  - BN statistics pool at least 25,600 positions per channel, so they are not starved;
  - changing it couples to the LR and confounds attribution.
- **Verdict:** appropriate for run 1.

### 2.9 Is the step limit consistent with the dataset size? (LOW–MEDIUM)

- **FACT:** 6,000 steps is 40 passes over 600 samples. v1's 4,000 steps was about 133 passes over 120.
- **UNKNOWN:** whether 40 passes reach a plateau, since no v1 loss curve was recorded.
- **INFERENCE:** consistent as an upper bound; the `unconverged` flag reports the case where it is not.
- **Cosine interaction:** see `hyperparameter-review.md` §8 and §13.

### 2.10 Is the existing loss appropriate for all eight classes? (MEDIUM)

- **FACT:** sigmoid focal over 8 independent classes, one class per cell, and plain-IoU box loss.
- **INFERENCE:**
  - it trains all eight classes, as v1 did;
  - weaknesses for this dataset: per-cell normalisation under-weights very-small objects, checkbox and radio (§2.6), and nothing in the loss targets look-alike-class confusion;
  - plain IoU has no gradient at zero overlap (`hyperparameter-review.md` §14).
- **Verdict:** appropriate as the **fixed** loss of a data-attribution experiment. Not shown to be appropriate for the small-target goal; the per-bucket DEV loss and recall will show it.

### 2.11 Partially occluded controls are trained as background (MEDIUM; new in M22.10)

- **FACT:** the adapter excludes 480 partial-occlusion and 480 full-occlusion TRAIN controls (128 + 128 DEV) from the targets (`data_v2.py`; pre-flight log). Their pixels remain in the frames.
- **INFERENCE:**
  - every cell of a partially occluded, partly visible control is a **negative** for all classes, so the head is penalised for detecting a visible part of a real control;
  - a correct detection of one on DEV would score as an FP.
- **Options:**
  - **Training:** keep as is for run 1, for attribution with v1, which had no occlusion cases; or mask those cells out of the loss (an ignore region), a target change for a later run.
  - **Evaluation:** ignore predictions matching an excluded partial-occlusion control (`evaluation-plan.md` §4).
- **Owner decision D10.**

### 2.12 Latent ownership-order defect in `assign_targets` (LOW here)

- **FACT:** the comment says the smaller object keeps a shared cell, but the code lets the **larger** one take it (last write wins in ascending-area order). Measured effect on candidate 2: **0 objects** lost any cell, because no kept positives overlap.
- **INFERENCE:** harmless for this experiment, but wrong for any dataset with nested controls.
- **Action:** record it for a future ADR. `targets.py` is protected and not changed.

### 2.13 Environment and reproducibility (LOW–MEDIUM)

- **FACT:**
  - torch 2.14.0+cpu, where CUDA is unavailable to the pinned environment;
  - torch's default is 10 threads, while v1's rule gives 8 on W1;
  - v1 used `warn_only=True` determinism;
  - free RAM was 3.70 GiB of 23.64 GiB when measured.
- **INFERENCE:**
  - **Memory:** v1-style preloading of float tensors (≈ 3.70 GiB for TRAIN + DEV, with a transient stack peak above that) could exceed the free memory available at that moment (`resource-estimate.md`).
  - **Reproducibility:** unrecorded thread counts and warn-only determinism make reproduction UNKNOWN.
- **Mitigations (recommended):**
  - uint8 preloading (about 0.87 GiB), converting to float per batch, which gives identical values because `x / 255.0` is computed the same way;
  - fixed threads;
  - strict determinism.

### 2.14 The known label/raster defect (`preprocessing-contract.md` §6) (LOW here)

- **FACT (record):**
  - `data.letterbox_image` places pixels by the raster rule (a rounded size and a floor-divided pad), while `targets` labels by the continuous rule;
  - on `t1-ui-v1` this offset 84 of 200 samples by up to 0.667 model px;
  - the W1-QG03b decision says closing it "requires a retrain".
- **FACT (measured, `logs/w1-candidate-2-letterbox-offsets.json`):**
  - candidate 2 has six capture sizes (800×1280, 960×600, 1024×640, 1024×1024, 1280×720, 1280×800), all of which letterbox to whole-pixel geometry;
  - **0 of 600 TRAIN and 0 of 160 DEV samples** carry the offset;
  - the same check gives 0.667 for 960×640, the contract's worst case.
- **INFERENCE:**
  - the first retrain is unaffected, so there is no reason to bundle the fix into run 1;
  - but a model trained only on offset-free geometry never sees the offset that production frames of other sizes carry, so on such frames its boxes may be off by up to 0.667 model px;
  - that is far inside an IoU 0.5 match (cf. W1-QG03b), but it is a reason to fix the defect, under an ADR, before any adoption.
- **Action:** none in this experiment. It stays open as recorded technical debt.
