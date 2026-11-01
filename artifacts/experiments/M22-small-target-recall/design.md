# M22 — small-target recall of the T1 head: pre-registered design

**Frozen 2026-11-01, before any M22 detector run.** Committed on its own, before the harness ran,
so the history shows it was not fitted to the result. Anything decided after the run is labelled
as such in the README.

**Classification.** An engineering investigation of the existing, UNADOPTED T1 head. Not a J7
experiment, not an adoption decision, not an accuracy claim about real websites. DEV synthetic
screens only; the TEST split is never generated, rendered or scored.

## 1. Question

Which stage loses each small element the T1 head misses, how does recall depend on element size
at a fixed capture scale, and what do the obvious levers (score floor, NMS, input magnification)
do to it?

## 2. Fixed for the baseline

| Item | Value |
|---|---|
| Model | `pratibimb-t1-ui-head` @ `ba6d9e93695b`, SHA-256 and size verified before the session |
| Runtime | `onnxruntime-web` 1.29.0, wasm, 1 thread, in Node |
| Capture | DPR 1, long side 1280 CSS px, so **2.0 CSS px per model px** in every cell |
| Preprocessing | shipped `preprocessToTensor` (PIL-exact BILINEAR, raster letterbox, pad 114) |
| Decode | shipped: score floor **0.25**, per-class NMS IoU **0.5**, cap 300 (`PROVISIONAL_THRESHOLDS`) |
| Inverse | shipped `projectToCapture` (with M21's frame bound), then `captureToCss` |
| Fusion | shipped `fuse`, IoU > 0.5 (frozen) |
| Rendering and decode | Chromium (Chrome for Testing), `createImageBitmap` + canvas, as the product does |

## 3. Fixtures and cells

The 20 W1 / Track B DEV specs (`specIdFor(i)`, `seedFor(i) = 20260913 + i`, i = 0..19), rendered
by `@pratibimb/evaluation` `specToHtml` at each cell's viewport.

- **Shape cells (content zoom 1):** the six M21 shapes — 1280×720, 1280×800, 1280×640, 1280×1280,
  960×1280, 720×1280. 120 screens. Results by viewport shape come from these.
- **Size cells (1280×720):** the same specs with CSS `zoom` z ∈ {0.5, 0.75, 1.5, 2, 3} on the page
  content (`main`). The capture scale is unchanged; only the elements' own size changes. 100
  screens. z = 1 is the 1280×720 shape cell.

**Why zoom, and the check behind it.** At 2.0 CSS px per model px the generator's elements span
only about 6–20 model px, so the large bucket would be empty. Zoom populates it without changing
the capture scale, which the brief requires to stay fixed. Checked before freezing (no detector):
under zoom, `getBoundingClientRect` scales exactly (2.000 on x, y, w, h at z = 2) and the viewport
is unchanged; the centre hit test returns the measured element for all but the same 5 elements at
every z, including z = 1, so those 5 are the generator's own overlaps, not a zoom artefact.
**Zoom renders natively**, so a zoomed element is crisp; this is not a resampled image (compare
Track B's NAT and GEOM families). Zoom ≠ 1 is outside the training distribution of element size,
in both directions.

## 4. Ground truth and matching (the project's evaluator, unchanged)

- Labels: `__measure()` of the rendered page (`getBoundingClientRect`), classes as emitted.
- Visibility by the evaluator's rules: VISIBLE wholly inside, CLIPPED partly inside, OFFSCREEN
  excluded from scoring.
- **Matching = `@pratibimb/evaluation` `evaluate()`**: class-aware, predictions in confidence
  order, each ground truth matched at most once, IoU ≥ 0.5. The harness's own matching is checked
  against `evaluate()` on every cell: TP, FP and FN must be identical, or the run refuses.

## 5. Size buckets — by the element's shorter side in model px

Derived from the head's structure (`tools/detector/head.py`): one output grid at stride 8, and a
receptive field of about 31 model px (three stride-2 3×3 convolutions and one stride-1 3×3; my
arithmetic from the layer list, INFERENCE).

| Bucket | Shorter side (model px) | Meaning |
|---|---|---|
| very small | < 8 | less than one stride cell |
| small | 8 – < 16 | one to two cells |
| medium | 16 – < 32 | two to four cells; within the receptive field |
| large | ≥ 32 | beyond the receptive field |

**Per bucket:** ground truth, TP, FN, recall; predictions are assigned to a bucket by **their own**
shorter side, giving TP_b (matched to a ground truth of bucket b) and FP_b (unmatched, own size in
b), and precision_b = TP_b / (TP_b + FP_b); median ground-truth width and height; confidence
quantiles (p10, p50, p90) of matched and of unmatched predictions.

## 6. Attribution of every false negative — the first stage at which its evidence disappears

Evaluated per element, in pipeline order, never from aggregate counts:

| Stage | The element is attributed here when |
|---|---|
| PREPROCESSING | its model-space box has a side under 1 px or lies outside the letterboxed content |
| INFERENCE_NOT_LOCALIZED | no anchor, at any score and of any class, has a positive box with IoU ≥ 0.5 to it (model space) |
| INFERENCE_WRONG_CLASS | localised anchors exist, but none has the element's class as its top class |
| SCORE_FILTER | localised anchors of the right top class exist, but every one scores below 0.25 |
| NMS | one scores ≥ 0.25, but no NMS survivor of the right class has IoU ≥ 0.5 to it (the cap is reported separately) |
| INVERSE_GEOMETRY | a right-class survivor matches in model space, but no projected prediction matches in CSS |
| ASSIGNMENT | a right-class projected prediction matches, but `evaluate()`'s one-to-one matching gave it to another element |

"Top class" is the decode's own rule (argmax, ties to the lower index). The raw-anchor reader that
this needs is checked against the shipped decode: at the shipped floor, its candidate count must
equal `anchors − belowScore − nonPositiveExtent` from `decodeHeadOutputAccounted`, or the run
refuses.

**DOM fusion, separately, by the production rule.** The real `fuse` over a graph built from the
same page's elements and the projected detections. Reported: elements fused `dom+vision`, elements
the evaluator counted as detected that fusion did not attach (FUSION_LOST), fusions to a detection
of another class, and overlay suspicions.

**Cell-centre coverage.** For each element, the number of stride-8 cell centres its model-space box
contains (0 means training assigned it the single nearest cell). Recall is reported by 0 versus ≥ 1.

## 7. Improvement options — experimental, never the shipped configuration

Run on the same 220 screens, from the same raw outputs, through the package's own decode with
explicit parameters. Each is reported against the baseline and **none is adopted**.

| Option | Values |
|---|---|
| D1 score floor | 0.05, 0.10, 0.15, **0.25 shipped**, 0.40, **0.55** (the frozen evaluation operating point, DEV-selected) |
| D2 NMS IoU | 0.3, **0.5 shipped**, 0.7 (floor 0.25) |
| D3 input magnification by tiling | 640×640 CSS tiles (1.0 CSS px per model px, 2× the baseline), overlap ≥ 64 CSS px, shipped decode per tile, per-class NMS 0.5 across tiles in capture space |

Reported per option: recall, precision, F1(recall, precision) (the frozen threshold rule's quantity,
reported, not used to select anything), recall per bucket, predictions per screen, inferences per
screen.

**Not done:** retraining, a new architecture, a different input size (the artifact's input is fixed
at 640), downloading any model, changing any production threshold.

## 8. Hypotheses

- **H1.** Recall is lowest in the very-small bucket and rises with size through medium.
- **H2.** Recall falls again in the large bucket (beyond the receptive field).
- **H3.** False negatives are attributed overwhelmingly to INFERENCE_NOT_LOCALIZED and SCORE_FILTER;
  PREPROCESSING and INVERSE_GEOMETRY receive none (as M21 found for the inverse).
- **H4.** Tiling raises very-small and small recall. Its effect on precision and on large elements
  is not predicted.
- **H5.** Lowering the floor raises small-bucket recall at a precision cost; 0.55 lowers recall
  most in the small buckets.
- No prediction is made about differences between viewport shapes.

## 9. Evidence rules

Records hold counts, model-px size statistics and score quantiles. No page text, no boxes, no
pixels, no paths. Each run writes a new record named by its start time and never overwrites one.
