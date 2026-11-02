# M22.6 — decision record, and the G10 threshold proposal

**Candidate 2 is a DRAFT.** Passing G1–G9 is not the same as owner acceptance. G10 is diagnostic
until the owner approves its thresholds. Nothing here approves a training dataset.

| Part | Status | Evidence |
|---|---|---|
| Candidate 1 | **preserved**, byte-identical before and after | `logs/w1-candidate-1-preservation.json` |
| Textbox and icon-plate fixes | **done**: every palette × style and glyph × plate rendered and measured | `logs/w1-render-fixtures.json`; `test/visual-fixes.test.mjs` |
| Decor, label, native-control and occluder improvements | **done** | `README.md` §2 |
| G10 pixel diagnostic | **implemented**, with no default thresholds | `visibility.mjs`, `test/g10.test.mjs` |
| Candidate 2 | **built**: G1–G9 PASS on TRAIN, DEV and both; 165 / 44 valid positives per cell; reproduced byte for byte on W1 | `logs/w1-build-record-candidate-2.json`, `logs/w1-candidate-2-audit-g10-provisional.json` |
| G10 on candidate 2 | **diagnostic only**: 6,688 VISIBLE at the provisional thresholds | same |
| Trainer adapter | **not implemented** (not authorised) | M22.5 `adapter-design.md` |

## G10 thresholds proposed for the owner (NOT approved)

**What the thresholds decide.** An element is:
- **INVISIBLE** if its salience is below *s₁* **or** its coverage@*c* is below *v₁*;
- **VISIBLE** if its salience is at least *s₂* **and** its coverage@*c* is at least *v₂*;
- **BORDERLINE** otherwise.

**Proposed values:**

| Threshold | Proposed | Range the evidence supports | Basis (`logs/w1-g10-calibration.json`) |
|---|---|---|---|
| *s₁* `salienceInvisibleBelow` | **1.25** | 1.10–1.60 | candidate 1's invisible positives: at most 1.093. Its other positives: at least 1.913. Candidate 2: at least 1.622. Anywhere in 1.10–1.60 catches all 374 and flags no visible element in either candidate |
| *s₂* `salienceVisibleAtLeast` | **1.5** | *s₁*–1.62 | candidate 2's faintest elements (unchecked native controls) sit at 1.62–2.0. Above 1.62 they become BORDERLINE |
| *c* `coverageContrast` | **1.25** | 1.1–1.5 | coverage at 1.1, 1.25 and 1.5 all separate the two groups (`logs/w1-candidate-1-audit-g10-metrics-only.json`) |
| *v₁* `coverageInvisibleBelow` | **0.005** | 0.001–0.011 | candidate 1's invisible positives: 0. Visible ones: at least 0.013. Candidate 2: at least 0.011 |
| *v₂* `coverageVisibleAtLeast` | **0.01** | *v₁*–0.011 | at 0.015, 5 candidate-2 positives become BORDERLINE; at 0.02, 18 (large links, selects, buttons and tabs whose ink is a small share of a large box) |

**Error risks:**
- **False "visible"** (a non-visible element passes):
  - G10 only asks whether a real patch of pixels stands out from the surround. A stray mark, a border line with nothing recognisable inside it, or a high-contrast blob all pass.
  - G10 cannot tell whether that patch *looks like* the class. Recognisability needs human review or a separate check.
  - Raising *s₂* or *v₂* reduces this only for faint elements, and does not touch recognisability.
- **False "invisible" or borderline** (a visible element fails):
  - *Faint controls:* genuinely faint but legitimate controls, such as grey unchecked native controls at 1.6–2.0, become BORDERLINE as *s₂* rises past 1.62.
  - *Large controls with small text:* these have low coverage, so they are hit as *v₂* rises past 0.011.
  - *Anti-aliasing:* small anti-aliased marks can fall under *k*. The k-th-highest rule needs at least 3 pixels, or 0.5% of the box, at the salience level.
- **Calibration limits:**
  - one known defect set (candidate 1), and one machine and browser;
  - the margins are wide for salience and **narrow for coverage** (0.011 against 0.013).

## Owner decisions

1. **G10 thresholds.** Approve these, or others, before G10 may be called an acceptance gate.
2. **Candidate 2 visual acceptance.** Accept candidate 2, or ask for changes.
3. **Remaining limitations to accept or fix:**
   - faint unchecked native controls;
   - the `card` occluder looking like a field;
   - the "Go"/"OK" share (20.5%);
   - illegible very-small text.
4. **G10 in the build.** Whether G10 should run inside the build as a fail-closed check once approved, like the render checks.
5. **The adapter.** Whether a future adapter should take only G10-VISIBLE positives. That would add a filter, not change the data contract, so M22.5's design stands.
6. **TEST:** stays prohibited, and still needs its own authorisation task.
