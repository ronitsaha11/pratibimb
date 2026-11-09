# M22 — design amendment 2: the fixture validity classification

**Written 2026-11-01, before any M22 detector run.** Amends `design-amendment-1.md` §2 (validity
rule and scoring); `design.md` and amendment 1 are not edited. Where they differ, this file
governs. No detector has been loaded for any M22 cell; nothing below is a recall figure.

## 1. The discrepancy this resolves

Amendment 1 defined validity at "the centre of its visible part (its box clipped to the
viewport)". Its audit (`d23c5af`) tested only elements wholly inside the viewport, at one point.
Partly visible elements were never audited, and a single point misclassifies elements whose centre
alone is covered or uncovered. A proposed fix (valid iff at least half of sampled points hit) was
**not approved**: a sampled hit fraction is not visible pixel area and gives no IoU guarantee.

## 2. The approved classification (owner decision, 2026-11-01)

Per measured element, from its `getBoundingClientRect` box and the viewport:

| Category | Definition |
|---|---|
| **HIT_TESTABLE** | wholly inside the viewport, and **all 25** points of the 5×5 grid hit |
| **PARTIALLY_OCCLUDED** | wholly inside; **1–24** of the 25 points hit |
| **FULLY_OCCLUDED** | wholly inside; **0** of the 25 points hit |
| **SAMPLING_SENSITIVE** | wholly inside, and the 9×9 grid over the same region gives a different category from the 5×5 grid |
| **PARTIALLY_CLIPPED** | the box extends outside the viewport and has a non-empty intersection with it; sampled only inside the intersection; its hit fractions reported |
| **OFFSCREEN** | no intersection (the evaluator's existing exclusion) |

- **Grid:** points at the centres of an n×n partition of the element's box ∩ viewport.
- **A hit:** `document.elementFromPoint` returns the element, a descendant of it, or a `<label>`
  whose `control` is the element. An ancestor, a sibling, an overlay or nothing is not a hit.
- **Primary population:** HIT_TESTABLE only. Every other category is reported by cell, class,
  size bucket and category, and none is silently dropped.
- **Limits, stated as part of the rule:** a grid hit is the browser's hit test, not a pixel.
  Neither grid proves pixel-level visibility, and no category guarantees an IoU. PARTIALLY_CLIPPED
  elements stay out of primary recall because their full ground-truth boxes extend beyond the
  captured frame.

## 3. Scoring: two paths

| Path | Ground truth | Matching | Predictions |
|---|---|---|---|
| **A. Full-population diagnostic** | every element the evaluator evaluates (not OFFSCREEN) | the evaluator's, cross-checked against `evaluate()` exactly | TP or FP, as `evaluate()` counts them |
| **B. Primary** | HIT_TESTABLE only, filtered **before** matching | the same validated matching on that population; then the still-unmatched predictions are matched, by the same rule, against the excluded (non-OFFSCREEN) elements | TP, FP, or **IGNORED** (matched only to an excluded element) |

Path B never matches the full population first and removes matches afterwards, so a prediction
that could match a valid element is never lost to an excluded one. `predictions = TP + FP +
IGNORED` and `FN = primary ground truth − TP`. Implemented as `matchValidPopulation`
(`tests/browser/support/small-target-eval.mjs`); the frozen evaluator and the `Detector` interface
are unchanged.

## 4. Applied to the planned fixtures (FACT, no detector)

`tests/browser/perception/audit-m22-fixtures.mjs`, record
[`logs/w1-fixture-audit-20261101T163950Z.json`](logs/w1-fixture-audit-20261101T163950Z.json):
the 20 DEV specs in all 11 cells, 220 screens, Chromium 153 headless. A second, independent run
gave identical counts in every cell.

| Category | Elements |
|---|---|
| **HIT_TESTABLE — primary population** | **3,196** |
| PARTIALLY_OCCLUDED | 49 |
| FULLY_OCCLUDED | 229 |
| SAMPLING_SENSITIVE | 2 |
| PARTIALLY_CLIPPED | 216 |
| OFFSCREEN | 999 |
| **All measured** | **4,691** |

- **Reconciles with amendment 1's audit:** the wholly-inside elements are 3,196 + 49 + 229 + 2 =
  3,476, the same count. The grid finds **280** not hit-testable where the centre point found 240.
- **The occluded icon:** all 220 `icon` elements are FULLY_OCCLUDED (every failing point returns the
  masthead). The primary population contains **no icon**.
- **By class (primary / all measured):** button 815 / 1,416 · link 724 / 976 · textbox 649 / 759 ·
  tab 484 / 660 · checkbox 175 / 220 · radio 175 / 220 · select 174 / 220 · icon 0 / 220.
- **By size bucket (primary):** very small 451 · small 1,903 · medium 779 · **large 63**, all from
  the zoom-2 (32) and zoom-3 (31) cells. Large-bucket evidence will be thin.
- **5×5 versus 9×9:** 2 elements change category (both links, in 1280×800); they are
  SAMPLING_SENSITIVE and excluded.
- **Primary population per cell:** 1280×720 333 · 1280×800 359 · 1280×640 293 · 1280×1280 370 ·
  960×1280 357 · 720×1280 335 · zoom 0.5 392 · zoom 0.75 372 · zoom 1.5 210 · zoom 2 123 · zoom 3 52.

**Observed and not explained:** at 25 sample points on links in two cells (5 in 1280×720, 20 in
1280×800), `elementFromPoint` returned no element at a point inside the viewport. Those links are
PARTIALLY_CLIPPED, occluded or sampling-sensitive, so none is in the primary population; why the
browser returns nothing there is not established.

## 5. Everything else stands

Cells, buckets, the attribution stages, the options and the hypotheses of `design.md` are
unchanged. Amendment 1's findings (the occluded icon, the training labels, the TEST metadata
disclosure, and option B) stand; only its validity rule and scoring table are replaced by §2–§3.
