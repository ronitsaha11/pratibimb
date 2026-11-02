# G10 acceptance review (for the owner; NOTHING IS APPROVED HERE)

> The provisional configuration `tools/dataset/v2/configs/g10-provisional-UNAPPROVED.json` is
> unchanged: same thresholds, and its approval block still reads `approved: false`. This page sets out
> the evidence for the decision. The decision is the owner's.

## Thresholds under review (provisional)

| Threshold | Value | Effect |
|---|---|---|
| `salienceInvisibleBelow` | 1.25 | below it: INVISIBLE |
| `salienceVisibleAtLeast` | 1.5 | VISIBLE needs at least this, and coverage at least `coverageVisibleAtLeast` |
| `coverageContrast` | 1.25 | coverage counts pixels at contrast ≥ 1.25 to the surround |
| `coverageInvisibleBelow` | 0.005 | below it: INVISIBLE |
| `coverageVisibleAtLeast` | 0.01 | see above |

Between the "invisible" and "visible" cuts an element is BORDERLINE.

## 1. Candidate 1 calibration (M22.6, `w1-g10-calibration.json`)

The 374 known-invisible positives are M22.5's defects A and B. The other 6,314 were judged visible.

| Cut | Known invisible caught | Others flagged |
|---|---|---|
| salience < 1.05 | 312 / 374 | 0 |
| salience < 1.10 … < 1.75 (every tested value) | **374 / 374** | **0** |
| salience < 2.0 | 374 | 74 |
| coverage@1.25 < 0.001 … < 0.011 | **374 / 374** | **0** |
| coverage@1.25 < 0.015 | 374 | 1 |
| coverage@1.25 < 0.02 | 374 | 11 |

The separation is perfect inside both windows:
- **Known invisible:** salience at most **1.093**, coverage exactly **0**.
- **Every other positive:** salience at least **1.913**, coverage at least **0.013**.

## 2. Candidate 2: minimum salience and coverage per class (M22.6 audit)

Candidate 2 has n = 836 positives per class. The table gives salience and coverage@1.25 at the minimum (p0), 1st, 5th and 50th percentiles.

| Class | Salience p0 | p1 | p5 | p50 | Coverage p0 | p1 | p5 | p50 |
|---|---|---|---|---|---|---|---|---|
| checkbox | **1.622** | 1.796 | 2.779 | 4.731 | 0.265 | 0.266 | 0.279 | 0.866 |
| radio | **1.647** | 2.082 | 3.029 | 5.005 | 0.238 | 0.241 | 0.244 | 0.584 |
| textbox | 1.913 | 1.913 | 2.122 | 4.465 | 0.023 | 0.026 | 0.036 | 0.997 |
| link | 2.143 | 3.075 | 4.888 | 7.680 | **0.012** | 0.019 | 0.028 | 0.090 |
| tab | 2.258 | 3.833 | 5.005 | 14.521 | **0.011** | 0.045 | 0.083 | 0.549 |
| button | 2.449 | 3.966 | 5.005 | 13.522 | 0.014 | 0.028 | 0.058 | 0.469 |
| select | 5.005 | 5.005 | 6.142 | 14.598 | 0.013 | 0.027 | 0.051 | 0.435 |
| icon | 5.005 | 5.005 | 5.005 | 9.754 | 0.089 | 0.133 | 0.148 | 0.460 |

**Where the weak values come from:**
- *Weakest palette × style combinations:* sand-light with heavy-outline, outlined or underlined (1.622), and mint-light with flat or heavy-outline (1.647). These are unchecked native controls with a grey edge on a light page.
- *Weakest glyph × plate:* bars (5.005 on every plate).
- *Lowest coverage:* large or medium links, buttons, selects and tabs whose text is a small share of a large box.

**At the provisional thresholds:** 6,688 VISIBLE, 0 BORDERLINE, 0 INVISIBLE.

## 3. Borderline policy

**Adapter behaviour** (`tools/detector/data_v2.py`):
- **With an approved configuration:** BORDERLINE positives are **excluded** from training, exactly like INVISIBLE ones, and counted separately (`g10-borderline` and `g10-invisible`).
- **With a provisional configuration:** nothing is excluded, both counts are reported as diagnostics, and dataset acceptance is refused.

**Sensitivity on candidate 2** (positives that would turn BORDERLINE as the "visible" cuts rise):

| `salienceVisibleAtLeast` | Count | `coverageVisibleAtLeast` | Count |
|---|---|---|---|
| 1.5 (provisional) | 0 | 0.01 (provisional) | 0 |
| 1.62 | 0 | 0.011 | 0 |
| 1.75 | 8 | 0.015 | 5 |
| 2.0 | 58 (radio 8, checkbox 13, textbox 37) | 0.02 | 18 |
| 2.5 | 175 | 0.05 | 354 |

## 4. Risks

**False acceptance** (G10 says VISIBLE, but a person, or the detector, cannot see the control):
- **G10 measures whether pixels stand out, not what they are.** A stray mark, a lone edge or a blob passes. It says nothing about recognisability or class identity.
- **The k-th-highest rule is weak on large boxes.** k = max(3, 0.5% of the box), so on a large box a small high-contrast patch is enough.
- **Defect families are only partly tested.** Candidate 1's defects were all-or-nothing (contrast ≈ 1). A *partially* faint family would sit in the middle of the scale, where calibration is thin.

**False rejection** (a visible control is called BORDERLINE or INVISIBLE, and lost from training):
- **The coverage margin is narrow.**
  - Candidate 2's lowest coverage is 0.011 (a tab) against `coverageVisibleAtLeast` 0.01.
  - Candidate 1's visible minimum was 0.013.
  - A different machine, font set or anti-aliasing could push a few large text controls below 0.01. Those would become BORDERLINE and be excluded once the thresholds are approved.
- **Faint native controls.** Raising `salienceVisibleAtLeast` above 1.62 starts excluding legitimate, faint, unchecked native controls, which a real page also shows.
- **Biased exclusions.** Exclusions concentrate in particular classes and styles (radio, checkbox, textbox; large text controls). That would bias the training set against those cases.

## 5. Are the provisional thresholds adequate for candidate 2?

**For the purpose they were calibrated for, yes on the evidence** (INFERENCE from the FACTs above).
- They separate candidate 1's invisible elements from its visible ones with no overlap.
- They accept every candidate 2 positive.
- **Salience margins are comfortable:** the invisible cut of 1.25 sits above the defects' 1.093, and the visible cut of 1.5 sits below candidate 2's minimum of 1.622.
- **The coverage margin is narrow:** the visible cut of 0.01 against a minimum of 0.011.

**Options for the owner (not decided here):**
1. **Approve as is,** accepting the narrow coverage margin.
2. **Approve with `coverageVisibleAtLeast` lowered to 0.005,** equal to the invisible cut.
   - *Effect:* the coverage BORDERLINE band disappears, and a positive is INVISIBLE only when essentially none of its pixels stands out.
   - *Basis:* that is exactly how candidate 1's defects measured (coverage 0), and it removes the false-rejection risk above.
   - *Unchanged:* salience still separates the classes with margin.
3. **Withhold approval** and keep G10 diagnostic only.

Whichever option is chosen, **visual review stays necessary:** G10 cannot judge recognisability.
