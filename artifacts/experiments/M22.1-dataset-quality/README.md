---
id: M22.1-dataset-quality
title: "M22.1 — T1 dataset label quality: TRAIN and DEV, by recipe regeneration"
status: recorded
date: 2026-11-01
label: FACT (regenerated TRAIN/DEV labels, code) / INFERENCE (marked)
classification: DATA QUALITY AUDIT — no detector, no TEST data, no change to the pinned dataset
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.1 — T1 dataset label quality

> **Result.** The T1 dataset recipe produces labels that fail three of seven quality checks on
> TRAIN and DEV:
> - **Unobservable labels.** 162 labels called VISIBLE are fully occluded, including every icon.
> - **Missing sizes.** No class has a single example of 32 model px or more, and there is no
>   observable icon at all.
> - **Fixed repetition.** The same icon box appears in every sample.
>
> Boxes are well formed, there are no duplicates, and the train and dev splits share no seed or
> layout. **The pinned `t1-ui-v1` was not opened** (see Method). No detector was run.

## Hypothesis

**Not pre-registered**; this is an audit, written after M22's fixture finding. The working
expectation was that the icon defect found in M22's fixtures is present in the T1 training recipe
for every icon, and that the recipe's other classes are well formed but narrow in size.

## Environment

W1 (`LAPTOP-6E14K34L`, Intel Core 7 240H, Windows). Chromium 153.0.8010.12 (Chrome for Testing,
headless; renders and hit-tests only), Node v24.22.1, `@pratibimb/evaluation` generator 1.0.0.

## Method

**Data source — and what was NOT inspected.**

- The pinned dataset `artifacts/datasets/t1-ui-v1` keeps TRAIN, DEV and TEST labels in **one**
  `manifest.json`, and all frames in one `frames/` folder (`tools/dataset/build-dataset.mjs`). Its
  TRAIN and DEV cannot be read without reading TEST. **It was not opened or listed** in M22.1.
- Instead, [`tools/dataset/audit-recipe-splits.mjs`](../../../tools/dataset/audit-recipe-splits.mjs)
  rebuilds the builder's own TRAIN (120) and DEV (40) plans: seed 20260910, split offsets 0 and
  1,000,000, each spec's own viewport, DPR 1, labels from `__measure()`, visibility by geometry.
  The TEST plan is never constructed (the script refuses if it is), and no frame is written.
- **Identity with the pinned files is not verified**, because the only artifact to compare
  against holds TEST. That the recipe reproduces them is INFERENCE, supported by a deterministic
  recipe and by the icon count matching M22's earlier read of the pinned train/dev labels
  (120 / 40).

**Disclosure of earlier TEST access (M22, 2026-11-01), both before this task:**
1. A count of icon labels read the pinned manifest's annotation box positions for all splits,
   TEST included (recorded in `M22-small-target-recall/design-amendment-1.md`).
2. A search command, `grep -rln "ic0" artifacts/datasets`, read the raw bytes of every file under
   `artifacts/datasets`, TEST frames included. It reported one DEV frame. Nothing was displayed or
   evaluated. This second access had not been disclosed until now.

Neither was repeated. M22.1 touched no TEST data.

**Checks.**
- Per label: the M22 hit-test validity (5×5 and 9×9 grids,
  [`fixture-validity.mjs`](../../../tests/browser/support/fixture-validity.mjs)).
- Per label: whether the element's declared inline `left`/`top` were ignored because its computed
  `position` is `static`.
- The dataset gate, G1–G7 ([`dataset-quality-gate.mjs`](../../../tests/browser/support/dataset-quality-gate.mjs),
  §Quality gate below), run with thresholds stated for this report: at least 1 observable example
  per class per size bucket, near-duplicate at IoU ≥ 0.9, and repetition at ≥ 50% of a split's
  samples.

A hit test is not pixel visibility: no check here proves an element is visible on screen.

## Expected result

Every icon unobservable; the other classes well formed; few very-small and few large examples.

## Actual result

Record: [`logs/w1-recipe-train-dev-audit-20261101T170000Z.json`](logs/w1-recipe-train-dev-audit-20261101T170000Z.json).
A second, independent run gave identical gate results.

### Gate results (TRAIN + DEV, 160 samples)

| Check | Result | Evidence |
|---|---|---|
| G1 non-degenerate boxes | PASS | 0 invalid |
| G2 stated visibility matches geometry | PASS | 0 mismatches |
| **G3 labels observable** | **FAIL** | 198 VISIBLE labels are not HIT_TESTABLE; **162 are FULLY_OCCLUDED** (160 icons, 1 checkbox and 1 radio in train) |
| **G4 class × size coverage** | **FAIL** | 37 of 64 class × bucket × split cells are empty |
| G5 duplicates | PASS | 0 exact, 0 near |
| **G6 suspicious repetition** | **FAIL** | one icon box (0, 0, 22, 22) in **100%** of TRAIN (120/120) and DEV (40/40) |
| G7 split integrity | PASS | no shared id, seed or layout between TRAIN and DEV |

### Verified defects (FACT)

1. **The icon class is never observable.** Every icon, 120 of 120 in TRAIN and 40 of 40 in DEV,
   is FULLY_OCCLUDED. **Root cause, in the generator source:** `specToHtml` declares the icon's
   `left`/`top` inline, but its stylesheet gives `[role=img]` no `position` rule. So the computed
   position is `static`, the declared coordinates are ignored (160 of 160 icons; no other class),
   and the icon renders in normal flow at the origin, under the absolutely positioned masthead.
2. **The icon class never varies.** Every icon is 22 × 22 CSS px at the same coordinates (shorter
   side 11–14.7 model px only through the viewport's scale). One fixed box in every sample is what
   G6 detects.
3. **Two non-icon labels are fully occluded** (TRAIN: 1 checkbox, 1 radio); further labels are
   partially occluded (TRAIN 23, DEV 6) or sampling-sensitive (TRAIN 6, DEV 1). These are overlap
   cases, like M22's.

### Class and size coverage (FACT; HIT_TESTABLE labels, shorter side in model px)

| Class | TRAIN v.small / small / medium / large | DEV v.small / small / medium / large |
|---|---|---|
| button | 0 / 74 / 379 / **0** | 0 / 25 / 127 / **0** |
| link | 0 / 403 / 3 / **0** | 0 / 140 / 0 / **0** |
| textbox | 0 / 69 / 335 / **0** | 0 / 17 / 108 / **0** |
| checkbox | 20 / 95 / 0 / **0** | 2 / 38 / 0 / **0** |
| radio | 20 / 95 / 0 / **0** | 2 / 38 / 0 / **0** |
| select | 0 / 41 / 75 / **0** | 0 / 9 / 31 / **0** |
| tab | 0 / 99 / 211 / **0** | 0 / 30 / 79 / **0** |
| icon | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 0** |

- **No class has a large (≥ 32 model px) example.** The largest shorter side in either split is
  30.67 model px.
- **Very-small (< 8) examples exist only for checkbox and radio** (22 in TRAIN and DEV combined
  for each).
- **Links are almost all small;** DEV has no medium link.

### Suspicious patterns (needing visual validation, not established as defects)

- **Aspect ratios are narrow by class.** Checkboxes and radios are always 1:1, and links 3.7–10.2.
  This is what the generator draws; whether it is too narrow for real interfaces is a coverage
  question, not a label error.
- **Partial occlusion is a hit-test result,** not a measured pixel fraction.

## Conclusion

The T1 recipe's labels are geometrically well formed and split-clean, but they **cannot teach the
icon class** (no observable example) and **cannot teach large elements** (none exist).
INFERENCE: any T1 claim about icons is unsupported by its training data, and its behaviour on
elements of 32 model px or more is outside what it was trained on. M22's pre-registered H2
(recall falls for large elements) cannot then be attributed to the receptive field alone; absent
training data is an equal candidate.

## Recommendation

See [`decision.md`](decision.md) and the proposal [`future-dataset-spec.md`](future-dataset-spec.md).
In short: keep `t1-ui-v1` pinned and unchanged; make no icon claim for the current T1 artifact;
build a new dataset version only from a fixed generator and only after it passes the gate; and
retrain only on your decision, with the evidence listed there.

## Reproducibility

```bash
npm run typecheck
```
```bash
CHROME_PATH="<Chrome for Testing chrome.exe>" node tools/dataset/audit-recipe-splits.mjs
```

`M22_1_DRY_RUN=1` writes nothing; otherwise each run writes a new record named by its start
time. The script never opens `artifacts/datasets` and never constructs a TEST sample.
