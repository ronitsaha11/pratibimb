---
id: M21-perception-geometry
title: "M21 — visual perception geometry: where the letterbox loses detections, and one inverse defect"
status: recorded
date: 2026-10-30
label: FACT (measurements, code) / INFERENCE (marked)
classification: ENGINEERING DIAGNOSTIC — not a J7 experiment, not detector adoption evidence
workstation: 1 (LAPTOP-6E14K34L)
---

# M21 — visual perception geometry

> **Result.** On these fixtures, at a fixed 2.0 CSS px per model px, across six screen shapes from
> 2:1 landscape to 9:16 portrait, **no labelled element was lost in the letterbox inverse and no box
> landed in the padding**. Every loss was an element the head never emitted, and those elements
> were small. One real inverse defect was found by arithmetic and fixed: an edge-touching box could
> end past the frame by a rounding error, which the package's own validator treats as malformed.

## Hypothesis

**Not pre-registered in a file.** The working expectation, held before the diagnostic ran and
drawn from QG-03b, C3b and Track B, was:

> **H1.** With scale held fixed, changing only the letterbox (direction and amount) does not change
> which labelled elements survive the shipped path: the inverse drops nothing that the head emitted
> for a real element.
>
> **H2.** Whatever is lost is lost at the model (not emitted), not in preprocessing or the inverse.

Because H1 and H2 were not written down before the run, the result supports them; it does not
confirm a pre-registered prediction.

## Environment

W1 (`LAPTOP-6E14K34L`, Intel Core 7 240H, Windows 10.0.26300). Chromium **153.0.8010.12** (Chrome
for Testing, headless; renders and decodes only). `onnxruntime-web` **1.29.0** in Node v24.22.1,
wasm, 1 thread. Artifact `pratibimb-t1-ui-head` @ `ba6d9e93695b`, SHA-256 and size verified before
the session. Compiled `@pratibimb/perception` from this branch. Also in each record.

## Expected result

- 0 boxes in the padding, 0 labels lost in projection, 0 frames refused by `validateDetections`.
- A small number of NOT_EMITTED labels, skewed to the smallest elements.
- The frame bound (`boundToFrame`) firing rarely or never on real output, since it removes only
  rounding at exact frame edges.

## Actual result

As expected, in every cell; sections 3 and 4. The frame bound fired on **0** real boxes, so the
defect fix has no real-output before/after; it rests on the arithmetic probe and the regression
tests (§4).

## Conclusion

At this scale the letterbox geometry costs nothing measurable, in both orientations, and the losses
are the model's (INFERENCE, with Track B's scale result). The 16–34% figure was a preprocessing
divergence fixed in QG-03b, not a letterbox loss. M21 fixes one real inverse defect and adds
regression coverage and per-stage diagnostics; it decides nothing that is the owner's (§7).

## 1. The historical figure, checked against its source

The brief cites "browser letterboxing caused approximately 16–34% of detections to be lost". The
source of that figure is [`W1-QG03b-letterbox-conformance`](../W1-QG03b-letterbox-conformance/README.md)
(2026-09-11). It says something different:

- **"16–34% of detections changed"**, not were lost, between the browser's preprocessing and the
  Python reference, on the same screenshot.
- **Cause: the resampling kernel.** Canvas `drawImage` is not PIL `BILINEAR`; padding and decode
  were byte-identical (its §3).
- **Fixed then.** `preprocess.ts` reimplements PIL's resampler; every stage matches byte for byte in
  all 8 browser cells and detection agreement went from 74% / 66% to 100%.

Two later experiments closed the remaining geometry questions:

- [`W1-QG03a-C3b`](../W1-QG03a-C3b-letterbox-inverse-attribution/decision.md): the label/raster
  inverse convention **does not explain** off-grid degradation (identical transforms, collapsed
  scores).
- [`W1-TrackB-geometry-appearance`](../W1-TrackB-geometry-appearance/decision.md): the collapse is
  driven by **object scale** (CSS px per model px), not by the transform.

The product source still repeated the old figure: `apps/extension/host/offscreen/main.ts` said the
detections "move 16-34%". That comment is corrected in this milestone (§5).

## 2. The perception pipeline as it ships (read from the code, 2026-10-30)

| Stage | Code | Space out |
|---|---|---|
| Gesture-authorised capture (ADR-0009): tab stream frame, or the worker's PNG | `perception-realm.ts` | RGBA, capture px |
| Geometry from the frame's **own** dimensions; refused if the aspect disagrees with the viewport | `geometryFrom` → `assertGeometryConsistent` | `CaptureGeometry` |
| T1 head preprocessing: PIL-exact BILINEAR, integer **raster** letterbox to 640², pad 114 | `preprocessToTensor` / `rasterLetterbox` | model px (pixels) |
| **New:** the rasterised frame must be the frame the boxes are inverted for | `assertRasterMatchesInverse` | — |
| ORT Web wasm on `ba6d9e93…` (UNADOPTED; runs to record what it produces) | offscreen realm | `[1, 12, 6400]` |
| Decode: score floor 0.25, per-class NMS 0.5, cap 300 (PROVISIONAL) | `decodeHeadOutput` | model px |
| Inverse: drop padding-only boxes, clip to content, **continuous** unpad and unscale | `projectToCapture` (`clipToContent`, `modelToCapture`) | capture px |
| **New:** bound to the frame (removes rounding overshoot only) | `boundToFrame` | capture px |
| Capture → CSS by `scale_to_css` (the one conversion) | `toVisualDetections` → `captureToCss` | CSS px (canonical) |
| Fusion with the DOM graph at IoU > 0.5 (frozen) | `fuse` | provenance per element |
| TR-01 text regions → redaction mask, outward-rounded | `visual-redaction.ts` | capture px |

**What a click can come from.** Only DOM elements. A vision-only detection has a synthetic id and no
selector; `perception-realm.ts` keeps it out of `sourceBySelector`, and nothing in `agent`, `plan`,
`orchestrator` or `extension-transport` reads vision provenance (searched, 2026-10-30). Detections
annotate DOM elements and flag overlays; they never become a target. So nothing here can move a click.

## 3. Where a detection can be lost, and what was measured

Diagnostic: [`tests/browser/perception/run-letterbox-diagnostic.mjs`](../../../tests/browser/perception/run-letterbox-diagnostic.mjs).
Records: [`logs/w1-letterbox-diagnostic-20261030T144359Z.json`](logs/w1-letterbox-diagnostic-20261030T144359Z.json)
and a second, independent run [`…-20261030T144553Z.json`](logs/w1-letterbox-diagnostic-20261030T144553Z.json):
**identical cell results**, and the model gave the same output twice within a run.

- **Fixtures.** The 20 W1 / Track B DEV specs (`seedFor(i) = 20260913 + i`), rendered by the
  evaluation generator at each cell's viewport. DEV only: no TEST sample was generated, rendered or
  scored. Labels are read from the rendered page (`getBoundingClientRect`); only labels wholly
  inside the viewport are attributed.
- **Held fixed.** Long side 1280 CSS px at DPR 1, so **2.0 CSS px per model px in every cell**.
  Only the letterbox direction and amount differ.
- **Path.** Chromium renders and decodes the PNG (as the product does), then the compiled shipped
  package and ORT Web 1.29.0 wasm on the hash-verified artifact.
- **Attribution.** Class-agnostic IoU > 0.5 (the frozen fusion threshold). DETECTED: a projected
  box matches. LOST_IN_PROJECTION: the head emitted a matching box in model space, but no projected
  box survives. NOT_EMITTED: the head emitted nothing for it at the shipped operating point.

| Cell | Viewport | Letterbox (model px) | Visible labels | Detected | Lost in projection | Not emitted | Boxes in padding |
|---|---|---|---|---|---|---|---|
| landscape-16x9 | 1280×720 | 140 top + 140 bottom | 362 | 350 | **0** | 12 | **0** |
| landscape-16x10 | 1280×800 | 120 + 120 | 386 | 383 | **0** | 3 | **0** |
| landscape-2x1 | 1280×640 | 160 + 160 | 318 | 315 | **0** | 3 | **0** |
| square | 1280×1280 | none | 391 | 386 | **0** | 5 | **0** |
| portrait-3x4 | 960×1280 | 80 left + 80 right | 377 | 374 | **0** | 3 | **0** |
| portrait-9x16 | 720×1280 | 140 + 140 | 355 | 344 | **0** | 11 | **0** |

**Stage by stage, all cells (FACT, from the records):**

| Stage | Result |
|---|---|
| Preprocessing | no source pixel cropped in any of 120 screens; padding exactly the pad byte in all 120 |
| Decode | 128,000 anchors per cell; 94.6–95.3% below the score floor, 4.1–4.6% merged by NMS, **0** capped, **0** non-positive extents |
| Inverse | **0** boxes dropped in the padding; **0** degenerate; 143–184 per cell clipped at the content edge (and kept) |
| Frame bound | **0** boxes needed it on this real output |
| Validation | **0** frames refused by `validateDetections`, with or without the M21 bound |
| Size of what was missed | not-emitted elements: shorter side p50 7.5–8.8 model px; detected: p50 13.5–14 |

**INFERENCE** (from the table and Track B): at this scale the letterbox costs nothing measurable. The
losses are a model outcome concentrated in the smallest elements, which is the scale fragility
Track B and C3b already recorded. Class-agnostic: of the detected labels, the head named the class
correctly for 290–345 per cell (`classAgrees`); that is not a geometry question and is not scored here.

**Not established.** Behaviour at other scales (Track B covers those), on real websites, on any other
machine or browser, or for the TR-01 path (which does not letterbox; it resizes by
`DetResizeForTest` and clamps to the frame itself).

## 4. The defect: the inverse could place a box outside the frame

**Found by arithmetic, not by the diagnostic** (FACT; probe in the M21 session over the shipped
functions):

- `clipToContent` then `modelToCapture` over **78,078 frame sizes**: **59,440 of 234,234
  edge-touching boxes (25%)** ended outside the frame, by at most **6.8×10⁻¹³ capture px**.
- Mechanism: the continuous transform is real-valued, so the "unpadded" axis is not exactly zero —
  at 1263×609, `padX = 5.7×10⁻¹⁴`, because `1263 × (640/1263)` is not exactly 640 — and
  `(padX + contentW − padX) / scale` need not equal the frame width.
- Real viewports hit it: **390×844** (phone, portrait) at the bottom edge; **820×1180** (tablet,
  portrait) and **1263×609** at the right edge.
- Why it matters: `Detection.box` is "the space the detector actually saw", and
  `validateDetections` refuses a whole frame for any box outside it. The shipped projection could
  emit output its own package's validator calls malformed. `validateDetections` has no caller in
  the product today, so nothing failed in production; the contract was violated all the same.

**The fix** (`letterbox.ts` `boundToFrame`, used by `projectToCapture`): after the inverse, bound
the box to `[0, w] × [0, h]`. A box already inside comes back **bit for bit** (the same object);
a sliver with nothing inside is dropped, never widened. `computeLetterbox`, `modelToCapture` and the
continuous-versus-raster choice are **unchanged** — that choice is QG-03a-C's, an owner decision.

**Before / after.** On synthetic edge boxes: the three named viewports go from outside the frame and
refused by `validateDetections` to inside and accepted; a sweep of 4,544 frame sizes and every
matrix shape stays inside (`geometryRegression.test.ts`). With the bound disabled, **8 regression
tests fail**; restored, all pass (mutation check, M21 session). **On real head output** in the
diagnostic, the bound changed nothing (0 boxes) — the 120 screens never put a box exactly on a
frame edge. So there is **no real-output before/after** to report, and none is claimed.

## 5. Other changes

- **`assertRasterMatchesInverse`** (`preprocess.ts`): the realm's preprocess hook ignored the
  transform it was handed. It now refuses (`COORDINATE_TRANSFORM_AMBIGUOUS`) unless the rasterised
  frame and the inverse are for the same size and model input. Today both come from the same
  bitmap, so this is defence in depth, not a fix for an observed failure.
- **Per-stage accounting, value-free.** `decodeHeadOutputAccounted` and
  `projectToCaptureAccounted` say where every anchor and every decoded box went; each stage's buckets
  sum to its input. `decodeHeadOutput` and `projectToCapture` return exactly what they did. The
  frozen `Detector` interface is unchanged: counts reach an evaluation through the head runtime's
  optional `onAccounting`, and the realm puts them only in its evaluation-only `detail` (and
  `PERCEIVE_ONCE`), which the run loop never requests. An observer that throws changes nothing.
- **Stale comment corrected** in `apps/extension/host/offscreen/main.ts` (§1).

## 6. Regression coverage added

- `packages/perception/test/geometryRegression.test.ts` — 201 tests: landscape, portrait, square and
  extreme shapes; letterbox orientation and centring; uniform scale; raster versus continuous
  bounded by rounding (extent ≤ 0.5 px, offset ≤ 0.75 px, odd pixel right/bottom); round trips;
  content edges mapping to frame edges; **the overshoot reproduced on the old composition and
  absent from `projectToCapture`**; padding-only boxes dropped; straddling boxes clipped; decode
  accounting identities (including the cap); malformed tensors and detections refused; incompatible
  raster/inverse, rotated or mis-sized captures refused; HiDPI/downscale to the same CSS box.
- `apps/extension/test/perceptionPass.test.ts` — 2 tests: counts reach a collected pass only, and a
  refused pass carries no stale counts.
- `tests/browser/support/letterbox-attribution.test.mjs` — 6 tests for the diagnostic's attribution.

## 7. What was not done

- **No J7 experiment, no B5 measurement, nothing for D1–D4.** None was started.
- **No change** to the coordinate contract, the frozen fusion threshold, `computeLetterbox`, the
  continuous-versus-raster inverse (QG-03a-C), the decode thresholds, the model, the capture policy,
  CSP, manifest, permissions, the endpoint or the 5-turn cap. Click remains the only action.
- **No accuracy claim, no adoption.** T1 stays UNADOPTED; QG-03a stays OPEN.
- **Real-website behaviour, other scales, other machines and browsers:** not measured here.

## Reproducibility

```bash
npm run typecheck
```
```bash
CHROME_PATH="<Chrome for Testing chrome.exe>" node tests/browser/perception/run-letterbox-diagnostic.mjs
```

Needs the T1 artifact at `artifacts/models/t1-ui-head/t1-ui-head.onnx` (never committed; refused
unless its SHA-256 and size match). Each run writes a new record named by its start time;
`M21_DRY_RUN=1` writes nothing.
