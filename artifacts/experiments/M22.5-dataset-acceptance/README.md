---
id: M22.5-dataset-acceptance
title: "M22.5 — acceptance review of TRAIN/DEV candidate 1, and trainer compatibility"
status: recorded — candidate STRUCTURALLY CORRECT; NOT RECOMMENDED for training as built (two generator defects make 374 positives effectively invisible)
date: 2026-11-02
label: FACT (read-only audit and pixel measurements, W1) / visual judgements labelled as such
classification: DATASET REVIEW — read-only; no training, no detector, no TEST, candidate unmodified
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.5 — candidate 1 acceptance review

> Read-only. Only `artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-1/` was read; nothing
> else under `artifacts/datasets` was named, listed or opened, and nothing in the candidate was
> written. No model was trained, no detector was run, no TEST data exists or was touched.

## Hypothesis

Candidate 1, which passed G1–G9 in M22.4, is also structurally sound when re-checked independently,
visually adequate, and fit for a controlled first training experiment once an adapter exists.

## Environment

W1, Node v24.22.1, Vitest. The frames under review were rendered by Chromium 153.0.8010.12 (M22.4).
The audit itself uses no browser.

## Expected result

- An independent recount equal to the build record.
- Every frame decoding at its declared size.
- No private value.
- Visual review and pixel contrast measurements finding every positive perceivable.
- A list of what the trainer would need.

## Method

**Integrity and distribution:** `tools/dataset/v2/audit-candidate.mjs --candidate=1` (new, read-only). It recomputes everything from the candidate's own files:
- ids, frame presence and decoding: every chunk CRC checked, inflated and unfiltered by `tools/dataset/v2/png.mjs`;
- sizes, hashes and manifest hashes;
- per-cell positives and occlusion;
- bucket membership from the rendered boxes;
- a scan for paths and personal data.

Output: `logs/w1-candidate-1-audit.json`.

**Contrast:**
- *(a) Declared:* the palette's CSS colour pairs, computed with the WCAG 2.x contrast-ratio formula.
- *(b) Measured:* on every positive's decoded pixels.
  - **Edge contrast:** the strongest colour holding at least 15% of the element's 2 px inner edge band, against the dominant colour of a 3 px ring just outside the box.
  - **Ink contrast:** the strongest colour inside the box, holding at least 0.5% of its area, against the dominant colour inside.
  - **Flag:** an element is flagged for review below **1.25** on a metric. That is an audit threshold, not a standard.
- *Not claimed:* WCAG conformance. Only the ratio formula is used.

**Visual review:** I inspected contact sheets of crops from real frames. They were written outside the repository and are not committed.
- one sheet per class: 4 size rows × 12 crops, spread over palette × style combinations;
- the low-salience flags, the low-edge flags, and the occlusion cases;
- 3 of the 7 full frames that, between them, cover all 6 viewports, 6 palettes, 7 fonts, 6 styles and 10 glyphs. *Limitation:* the other 4 were not viewed.

Judgements below are mine, made by eye. **Visual judgement**, not measurement, is how they are labelled.

## Actual result

### 1. Candidate integrity: all checks pass

| Check | TRAIN | DEV |
|---|---|---|
| Samples, and the planned id sequence `<split>-00000…` exactly | 600, yes | 160, yes |
| Unique ids | 600 | 160 |
| Frame files present / missing / unexpected | 600 / 0 / 0 | 160 / 0 / 0 |
| Frames decoded (CRC, inflate, unfilter) / failures | 600 / 0 | 160 / 0 |
| Frame size equals the viewport and the recorded size | all | all |
| Frame SHA-256 equals the manifest's | all | all |
| `framePath` resolves inside the split's own frame folder | all | all |
| Annotations: counted / build record | 6,240 / 6,240 | 1,664 / 1,664 |
| Manifest hash: recomputed = stored = build record | `95db7b6f…1a571f0e` | `f0cb43d1…b3172e1` |
| Valid positives per cell, recomputed (positive, HIT_TESTABLE on both grids with every point hit, inside the viewport, ≤ 0.5 px from source, `absolute`) | 165 in all 32 | 44 in all 32 |
| Partial / full occlusion observed as declared | 480/480, 480/480 | 128/128, 128/128 |
| Bucket from the rendered box disagrees with the declared one | 0 | 0 |
| Cells disagreeing with the build record | 0 | 0 |
| Strings scanned for paths or personal data / hits | 109,887 in total / 0 | |

### 2. Visual quality: two generator defects, and lesser issues

#### Defect A: textboxes invisible in two of six control styles (FACT: measured and seen)

**Code:** a textbox is drawn with `background: var(--page)`. The `filled` and `flat` styles set its border width to 0.

**Result:** the control is the same colour as the page, with no edge. It is still hit-testable, so it passed G3, G4 and G9.

**Measured:** **282 textbox positives** (TRAIN 216, DEV 66) have edge contrast **1.00** and ink contrast **1.00**: no pixel inside differs from the surround. The contact sheet shows blank crops.

#### Defect B: icon plates lost for four glyphs (FACT: code, measured and seen)

**Code:** `square`, `bars`, `plus` and `chevron` are drawn with the CSS `background:` shorthand. It resets the `background-color` plate set just before it. With an `accent` plate the glyph is drawn in the on-accent colour, straight onto the page.

**Measured:** declared contrast of on-accent ink on the page is **1.00–1.09** across the six palettes. **92 icon positives** (TRAIN 71, DEV 21) are affected. The sheets show white-on-white and dark-on-navy glyphs.

#### Effect on the quotas, if invisible positives are not counted

| Cell | TRAIN valid → visible (minimum 150) | DEV valid → visible (minimum 40) |
|---|---|---|
| textbox very-small / small / medium / large | 165 → 107 / 109 / 116 / 112 | 44 → 30 / 25 / 28 / 27 |
| icon very-small / small / medium / large | 165 → 145 / 149 / 148 / 147 | 44 → 36 / 37 / 41 / 41 |

**14 of 64 cells fall below their minimum.** G1–G9 cannot see this: hit-testing does not test visibility, and no check measures pixels.

#### Lesser findings (visual judgement unless stated)

- **Lookalike decor.**
  - In the `underlined` style a textbox renders as a single line, close in appearance to the unlabelled `divider` decor.
  - Bordered decor `panel`s look like large outlined textboxes or empty cards.

  Unlabelled lookalikes are negatives that resemble positives.
- **Clipped labels.** Some labels are cut by `overflow: hidden` ("Clos", "Ope", "Done" cut at the right).
- **Illegible text at very-small size** (6–7 px font). It is inherent to the bucket: a very-small control is recognisable by shape, not text.
- **Faint boundaries in the `flat` style.** Surface on page has a declared contrast of 1.14–1.35, so the text carries the control. Measured: 72–78% of `flat`-style positives in the light palettes have edge contrast below 1.25, though their ink is visible.
- **Native radios and checkboxes at large size** are drawn as large outlined circles and boxes: recognisable, not realistic.
- **Occluders are plain solid rectangles,** one colour per palette. A model could learn that cue.
- **Positioning:** no unintended overlap or misplacement was seen (also G5, G8: 0 duplicates, 0 px displacement).

#### Metric limitations (stated, not hidden)

**Edge contrast is 1 by design for:**
- links, which have no box;
- icons without a plate;
- radios, whose circle covers little of the box's edge band.

**Ink contrast under-reads for thin anti-aliased outlines,** for example large radios, which were clearly visible on the sheet. Of the 544 positives flagged on both metrics, the 282 textboxes and 92 icons above are confirmed invisible. The rest were mostly radios and very-small links or icons that the sheets show to be visible or faint. They were **not** each judged individually.

### 3. Contrast results

**Declared CSS pairs (WCAG 2.x ratio; measurement only):**

| Palette | text/page | accent/page | text/surface | on-accent/accent | accent/surface | border/page | surface/page | occluder/page | decor/page |
|---|---|---|---|---|---|---|---|---|---|
| slate-light | 18.88 | 11.90 | 16.18 | 11.90 | 10.19 | 2.14 | 1.17 | 5.50 | 1.24 |
| sand-light | 14.61 | 5.01 | 12.52 | 5.40 | 4.29 | 2.12 | 1.17 | 6.06 | 1.19 |
| mint-light | 14.60 | 6.14 | 12.80 | 6.45 | 5.38 | 1.91 | 1.14 | 5.59 | 1.14 |
| graphite-dark | 13.52 | 7.68 | 10.03 | 8.40 | 5.70 | 2.70 | 1.35 | 5.50 | 1.17 |
| navy-dark | 14.52 | 9.75 | 11.21 | 10.30 | 7.53 | 2.88 | 1.30 | 7.30 | 1.14 |
| high-contrast | 21.00 | 11.45 | 21.00 | 11.45 | 11.45 | 21.00 | **1.00** | 9.74 | 1.41 |

**What the table shows:**
- Text and accent pairs are high everywhere: the lowest is 4.29.
- Control **edges** are weak where they rely on surface against page (1.00–1.35), and moderate where they rely on the border (1.91–2.88).
- In `high-contrast`, surface equals page, so a `flat` control there has no edge at all.

**Measured on pixels, per class:** median edge / median ink contrast (n = 836 positives per class):

| Class | Median edge / ink | Note |
|---|---|---|
| button | 2.88 / 11.90 | |
| tab | 5.01 / 11.90 | |
| select | 2.88 / 12.80 | |
| checkbox | 4.73 / 4.54 | |
| link | 1.00 / 7.68 | edge 1 by design |
| radio | 1.00 / 5.01 | edge 1 by design |
| icon | 1.08 / 7.68 | |
| textbox | **2.14 / 2.14** | its 5th–25th percentiles are 1.00: defect A |

**Flags:**
- edge < 1.25: 2,601;
- ink < 1.25: 583;
- both: 544.

The worst palette × style combinations for edge are all `flat` (72–78% low edge in the light palettes).

### 4. Class and size distribution: complete

**Coverage:**
- **Positives:** exactly 165 per cell in TRAIN and 44 in DEV, in all 32 cells.
- **Viewports:** all six. TRAIN has 95–105 samples per viewport and 844–930 positives; DEV has 23–32 samples.
- **Appearance:** all 6 palettes, 7 fonts, 6 styles and 10 glyphs on 3 plates are present. TRAIN glyphs: 57–77 icons each.
- **Weak combination coverage:** in DEV, palette × style combinations hold **1–10 samples**; in TRAIN, 7–24.

**Shorter side in model px, observed within each configured bucket:**

| Bucket | Observed range | Configured range | Observed median |
|---|---|---|---|
| very-small | 4–7.5 | [0, 8) | 6 |
| small | 8–15.6 | [8, 16) | 11.5 |
| medium | 16–31.5 | [16, 32) | 23.75 |
| large | 32–48 | [32, ∞) | 40 |

- **No positive outside its bucket.**
- **"large" stops at 48 model px** by generation, so larger controls are not represented.

**Aspect ratios** (TRAIN, realised) span each configured range:

| Class | Observed aspect |
|---|---|
| button | 1.0–5.96 |
| link | 1.5–12 |
| textbox | 3–16 |
| select | 2.5–9.97 |
| tab | 1.19–5 |
| icon | 0.74–1.36 |
| checkbox, radio | 1 |

**Targets per sample:** 6 or 7 on sparse pages, 12 on most others. Density varies only between those two levels at this utilisation.

**Confidence that every configured bucket is represented:** FACT, from a complete recount, in both splits, for **valid** positives. For **visible** positives the textbox and icon cells above fall short.

### 5. Trainer compatibility

The candidate **cannot be used by the current trainer**, and must not be naively patched in. `adapter-design.md` has the full comparison and a proposed adapter:
- `data.py` needs `manifest.json` and `captureSize`; v2 has neither.
- Its target rule would train on all 1,120 occlusion cases.
- `train.py` is hard-wired to `t1-ui-v1`, predicts on a `test` split, and writes over the T1 model directory.

## Conclusion

**Structure:** candidate 1 is structurally correct, complete, and exactly as its build record says.

**Visual quality:** not adequate for training as built. Two deterministic generator defects make **374 positives** effectively invisible, and those are concentrated in the textbox and icon classes. Training on them would teach the detector to report controls where nothing is visible.

**Recommendation:** fix the defects, add a pixel-salience check to the build, and build a new candidate, after owner approval. See `decision.md`.

## Reproducibility

```bash
node tools/dataset/v2/audit-candidate.mjs --candidate=1 [--sheets=<absolute directory outside the repository>]
```
