---
id: M22.6-visual-remediation
title: "M22.6 — visual defect remediation, the G10 pixel diagnostic, and TRAIN/DEV candidate 2"
status: recorded — candidate 2 built; G1–G9 PASS; G10 DIAGNOSTIC ONLY (thresholds unapproved); candidate 2 is a DRAFT
date: 2026-11-02
label: FACT (rendered, measured, audited on W1) / visual judgements labelled as such
classification: DATASET REMEDIATION — owner-authorised; TRAIN and DEV only; no training, no detector, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.6 — visual remediation and candidate 2

> **Candidate 2 is a draft.** It passes G1–G9. The pixel diagnostic G10 has **no approved
> thresholds**, so its results below are diagnostic only, and **no visual acceptance is claimed**.
> No model was trained, no detector was run, and no TEST data was planned, rendered or read.
> Candidate 1 was read only, and is byte-identical before and after this milestone
> (`logs/w1-candidate-1-preservation.json`).

## Hypothesis

Two deterministic rendering defects caused candidate 1's 374 invisible positives:
- **Defect A:** page-on-page textboxes in the `filled` and `flat` styles;
- **Defect B:** icon plates erased by the CSS `background:` shorthand.

Fixing them, together with the lesser findings, should make every positive measurably visible on its pixels without moving any box.

## Environment

**Machine:** W1, Node v24.22.1.

**Browser:** Chromium 153.0.8010.12, headless, launched by Playwright 1.63.0, in this context:
- DPR 1;
- offline, with every request aborted;
- `colorScheme` light, `reducedMotion` reduce;
- locale en-US, timezone UTC.

**Source:** commits `4906332` (fixes) and `8f917da` (G10). Render revision `r2-m22.6-visual-fixes`.

## Expected result

**Unchanged geometry:** every box is unchanged, because the seeds are those of candidate 1.

**Defects removed:** both, as shown by:
- a browser fixture matrix covering every palette × style and every glyph × plate;
- per-element pixel metrics on candidate 2.

**Candidate 2 checks:**
- G1–G9 pass on TRAIN, DEV and both;
- G4 at least 150 / 40 per cell;
- every occlusion case is observed as declared;
- no leakage or failed render;
- byte-identical reproduction.

## Actual result

### 1. Candidate 1 defects (baseline, from M22.5)

| Defect | Cause | Positives |
|---|---|---|
| A: invisible textboxes | textbox background = page colour; `filled` and `flat` set its border width to 0 | 282 |
| B: lost icon plates | `background:` shorthand on `square`, `bars`, `plus`, `chevron` reset the plate's `background-color` | 92 |

G10 on candidate 1 (`logs/w1-candidate-1-audit-g10-metrics-only.json`, metrics only):
- **The 374 defects:** salience 1.00–1.093, and 0% coverage.
- **The other 6,314:** salience at least 1.913, and coverage at least 1.3%.

There is no overlap between the two groups.

### 2. Generator fixes (`tools/dataset/v2`, render revision r2)

| Area | Fix |
|---|---|
| Textbox | Each control style has its own textbox treatment, and none is page-on-page. `outlined`: page field + 1 px `border`. `heavy-outline`: page + 2 px. `raised`: page + 1 px `fieldEdge`. `filled`: tinted `field` + 1 px `fieldEdge` + 2 px accent bottom rule. `flat`: tinted `field` + 1 px `fieldEdge` bottom rule. `underlined`: tinted `field` + 2 px accent bottom rule. New palette tokens `field` and `fieldEdge`. The high-contrast `surface` is #e2e2e2, no longer the page's #ffffff |
| Icon | The plate is `background-color`. The glyph uses `background-image`, `-position`, `-size` and `-repeat` longhands. The shorthand is never used on an icon |
| Decor | Dividers are **dashed**, so a divider no longer looks like an underlined field. Panels are **borderless with a header band**, so they no longer look like outlined fields. The high-contrast decor colour was lightened |
| Labels | The word and font size are fitted to the box width: estimated character width 0.66 em, with 2-letter words for the narrowest boxes and a 4 px font floor. **The box never changes.** The renderer measures the residual overflow |
| Native checkbox and radio | Drawn at the browser's natural 13 px and scaled to the box from its top-left corner. The rendered rect is still the declared box |
| Occluders | Four looks (solid, banded, striped, card). Geometry unchanged: still a full rectangle over the declared box |
| Very-small text | **Unchanged and still illegible** (fonts 4–7 px; 910 of 3,952 labels are below 8 px). The size buckets and their evaluation are not redefined |

**Rendered-pixel evidence** (`tools/dataset/v2/render-fixtures.mjs`, `logs/w1-render-fixtures.json`): 36 fixture pages, one per palette × style, holding 1,908 elements. All pass.

| Group | Result | Candidate 1 |
|---|---|---|
| Textboxes | lowest salience in any palette × style 1.91 | 1.00 |
| Icons | lowest salience for every glyph × plate 5.0 | 1.00–1.09 for the lost plates |
| Native controls | at least 4.2, all HIT_TESTABLE | — |
| Labels | no overflow on these fixtures | — |
| Occlusion | all 288 cases observed as declared | — |

I also viewed the fixture pages by eye; see the judgements in §5.

### 3. Candidate 2 planned against actual counts

**Configuration:** the approved M22.4 configuration (`configs/m22.4-train-dev.json`), unchanged. Destination: `artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-2/` (git-ignored, about 18 MB).

| | TRAIN planned | TRAIN rendered and validated | DEV planned | DEV rendered and validated |
|---|---|---|---|---|
| Samples (requested + overflow) | 600 + 0 | 600 frames | 160 + 0 | 160 frames |
| Failed renders | — | 0 | — | 0 |
| Positives | 5,280 (165 × 32) | 5,280 HIT_TESTABLE; G4 valid **165 in every cell** (minimum 150) | 1,408 (44 × 32) | 1,408; **44 in every cell** (minimum 40) |
| Partial occlusion | 480 | 480 observed PARTIALLY_OCCLUDED | 128 | 128 |
| Full occlusion | 480 | 480 observed FULLY_OCCLUDED | 128 | 128 |
| Annotations | 6,240 | 6,240 | 1,664 | 1,664 |

**Geometry is unchanged from candidate 1:** all 7,904 annotations have the same id, class, intent, declared box and rendered box.

**Independent audit** (`logs/w1-candidate-2-audit-g10-provisional.json`). Every check holds:
- ids are exactly the planned sequence;
- every frame is present, with none extra, and each decodes;
- sizes and frame hashes match;
- manifest hashes recompute equal to the stored values and the build record;
- no annotation count or cell disagrees with the build record;
- no bucket disagrees with the rendered box;
- 113,265 strings scanned, with no paths or personal data;
- all 6 palettes, 7 fonts, 6 styles, 6 viewports, 10 glyphs and 3 plates are present.

### 4. Structural gate results (G1–G9): PASS

| Run | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | G9 |
|---|---|---|---|---|---|---|---|---|---|
| TRAIN | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (worst 0 px) | PASS |
| DEV | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TRAIN + DEV | PASS | PASS | PASS | PASS | PASS | PASS | PASS (no shared id, seed or layout) | PASS | PASS |

No required check was NOT_APPLICABLE. Leakage at plan time: 0 cross-split matches over 288,420 pairs. Build record: `logs/w1-build-record-candidate-2.json`.

### 5. Pixel diagnostic (G10): DIAGNOSTIC ONLY

**Metrics** (`visibility.mjs`, per positive, on the decoded PNG):

| Metric | Definition |
|---|---|
| Salience | the k-th highest contrast to the surround inside the box, k = max(3, ⌈0.5% of the box⌉) |
| Coverage@c | the share of box pixels at contrast ≥ c to the surround, for c in {1.1, 1.25, 1.5, 2, 3} |
| Fill | the box's dominant colour against the surround |
| Edge | the strongest colour in the 2 px inner band against the surround |
| Ink | the k-th highest contrast to the box's own dominant colour |

**Class-specific readings:**
- textbox: field or edge;
- icon: plate against page, and glyph against plate (or glyph against page with no plate);
- text controls: boundary, and text against fill;
- link: text against page;
- native controls: mark against page.

**Not claimed:** contrast is the WCAG 2.x ratio, **not** a conformance claim, and **not** a measure of recognisability.

**Candidate 2 distributions** (minimum / median salience; coverage@1.25 minimum):

| Class | Min salience | Median salience | Coverage minimum |
|---|---|---|---|
| button | 2.45 | 13.52 | 0.014 |
| link | 2.14 | 7.68 | 0.012 |
| textbox | **1.91** | 4.47 | 0.023 |
| checkbox | **1.62** | 4.73 | 0.265 |
| radio | **1.65** | 5.01 | 0.238 |
| select | 5.01 | 14.60 | 0.013 |
| tab | 2.26 | 14.52 | 0.011 |
| icon | **5.01** | 9.75 | 0.089 |

**The 374 former defects in candidate 2:**
- salience 2.69–21, median 6.14;
- coverage at least 66.7%;
- textboxes at least 2.69, icons at least 5.0.

**At the provisional, unapproved thresholds** (`configs/g10-provisional-UNAPPROVED.json`): **6,688 VISIBLE, 0 BORDERLINE, 0 INVISIBLE**, so 165 / 44 usable positives per cell. No positive is at candidate 1's invisible level (salience < 1.1).

**Calibration** (`logs/w1-g10-calibration.json`) and the threshold proposal are in `decision.md`.

**Visual review (judgements by eye).** I viewed:
- all **7** representative full frames, which between them cover every viewport, palette, font, style and glyph;
- one sheet per class (4 sizes × 12 palette/style combinations);
- the glyph × plate sheet (all 30);
- the 48 lowest-salience positives;
- the occlusion sheet (both kinds);
- 3 fixture pages: high-contrast/flat, navy-dark/filled, mint-light/underlined.

**What I found:**
- **Defects A and B are gone.** No invisible textbox, and no lost plate.
- **Faintest elements:** the lowest-salience positives are unchecked native checkboxes and radios with grey edges on light pages (salience 1.6–2.0), and thin-edged textboxes in light palettes. All are visible but faint.
- **Labels:** no longer clipped.
- **Occlusion cases:** the right look, in four varied styles.
- **Positioning:** no unintended overlap or misplacement.

**Text clipping, measured:** 4 of 2,964 measured labels (buttons, links and tabs) still overflow, all very-small, by at most 2 px. Select labels are not measured, and 18 labels could not be fitted at a 4 px font.

### 6. Reproducibility

The candidate was rebuilt into a scratch directory outside the repository and compared with `compare-builds.mjs` (`logs/w1-reproducibility-candidate-2-vs-scratch.json`).
- **Result:** **all 760 samples identical.** Spec hash, HTML, annotations, provenance and **frame hash** all match, and the manifest content is identical apart from the destination label.
- **Generator output:** specs, HTML, annotations and provenance are deterministic by construction (FACT, tests and comparison).
- **Pixels:** byte-identical **on W1 with this Chromium** (FACT). Another machine, font set or browser is UNKNOWN.

## Remaining visual limitations

1. **G10 measures visibility, not recognisability,** and its thresholds are not approved.
2. **Faint native controls.** Unchecked checkboxes and radios on light pages use the browser's grey edge: salience 1.62–2.0, 21 positives below 2.0. 37 textboxes with thin light edges also sit below 2.0.
3. **The `card` occluder,** drawn with page fill, border and top band, can resemble an empty field next to the control it half covers. This is a new lookalike.
4. **Label words now correlate with box shape.** 20.5% of labels are "Go" or "OK", mostly in narrow or square boxes.
5. **Very-small text is illegible** (fonts 4–7 px), and documented as such.
6. **Native control appearance is browser-specific.**
7. **Candidate 2 reuses candidate 1's seeds,** so its layouts are not a new sample. That is deliberate: it makes the comparison exact.
8. **Reproducibility:** W1 only.
9. **Synthetic pages only.**

## Conclusion

The two M22.5 defects are fixed at their source, without moving a box. Candidate 2 passes G1–G9, and every positive measures as visible, with a clear margin over candidate 1's invisible elements. **Candidate 2 remains a draft** until the owner approves G10 thresholds and visual acceptance (`decision.md`).

## Reproducibility

```bash
node tools/dataset/v2/render-fixtures.mjs [--frames=<absolute directory outside the repository>]
node tools/dataset/v2/build-candidate.mjs --config=tools/dataset/v2/configs/m22.4-train-dev.json --candidate=<new number>
node tools/dataset/v2/audit-candidate.mjs --candidate=2 --g10=tools/dataset/v2/configs/g10-provisional-UNAPPROVED.json [--sheets=<dir outside the repo>] [--elements-out=<file outside the repo>]
node tools/dataset/v2/compare-builds.mjs --a=<build> --b=<build>
```
