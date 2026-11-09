# M22.5 — dataset acceptance decision record

**Passing the gate is not the same as owner acceptance.** Candidate 1 passed G1–G9 on TRAIN, DEV and
both (M22.4). This review finds that the gate cannot see a defect that matters for training. **This
is a recommendation; using any candidate for training is the owner's decision.**

| Question | Answer | Basis |
|---|---|---|
| 1. Is the candidate structurally correct? | **Yes.** Every sample, frame, decode, size, hash and count reconciles, and it matches its build record exactly | `README.md` §1, `logs/w1-candidate-1-audit.json` |
| 2. Is its visual quality adequate? | **No, not as built.** 282 textboxes (`filled` and `flat` styles) and 92 icons (`accent` plate with the `square`, `bars`, `plus` or `chevron` glyph) are effectively invisible: measured contrast 1.00–1.09 | `README.md` §2 (measured and seen) |
| 3. Weak classes or combinations? | **textbox and icon** (14 of 64 cells below their minimum once invisible positives are excluded); the `flat` style (faint edges); `high-contrast / flat` (no edge at all); DEV palette × style coverage (1–10 samples per combination) | §2, §3, §4 |
| 4. Should examples be regenerated? | **Yes: the whole candidate,** as a new candidate after fixing the generator. Editing or dropping labels by hand is never done. Fixes below | — |
| 5. Suitable for a controlled first training experiment? | **Not this candidate.** A fixed candidate that passes the gate **and** a pixel-salience check would be | — |
| 6. Adapter work required? | A new `data_v2.py` (TRAIN and DEV only, positives only, `captureSize` from the frame, frame-hash checks) and a separate `train_v2.py` with no TEST path and a new output directory. `data.py` and `train.py` unchanged | `adapter-design.md` |
| 7. Remaining limitations | see below | — |

## Proposed generator fixes (for approval; NOT made in M22.5)

1. **Textbox:** give every textbox a visible field in every style. For example, `surface` fill plus at least a 1 px `border` edge, or keep `underlined` with a filled field, so no style draws it as page-on-page.
2. **Icon:** draw glyphs with `background-image` (and `background-size` / `-position` / `-repeat`), never the `background:` shorthand, so the plate's `background-color` survives.
3. **A pixel-salience check in the build,** fail-closed like the render checks, at owner-stated thresholds. Every positive must show its own pixels against its surround: for example, ink or edge contrast at least *t*.
4. **Optional, to reduce label ambiguity:**
   - keep divider decor visually distinct from underlined textboxes;
   - make decor panels unlike outlined fields;
   - raise the DEV size, or stratify palette × style, if the owner wants every combination represented in DEV.

After the fixes, build **candidate 2** (candidate 1 is kept unmodified, as the record of this finding), then rerun the M22.4 gate and the M22.5 audit.

## Remaining limitations

- **Hit-testing is not perception.** Defect A is exactly an element that hit-tests perfectly and cannot be seen.
- **The contrast metrics are heuristics.** They under-read thin anti-aliased outlines, and read edge 1 for box-less classes.
- **Synthetic pages only,** not realistic.
- **"large" stops at 48 model px.**
- **Occluders are uniform solid rectangles.**
- **Reproducibility is shown on W1 only.**
- **The TEST seal is still weak.** No TEST exists for this version.
- **No model was trained and no detector was run.** Nothing here measures detection quality.
