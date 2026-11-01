# T1 synthetic dataset — version 2 specification (draft; not built)

**Draft for owner approval.** Implemented as `tools/dataset/v2/`, version `2.0.0-draft`. Nothing has
been built from it.

| Area | Specification |
|---|---|
| Identity | name `t1-ui-synthetic`, version `2.0.0-draft`; distinct from `t1-ui-rendered@1.0.0` (`t1-ui-v1`), which is unchanged |
| Classes | button, link, textbox, checkbox, radio, select, tab, icon (the T1 head's eight) |
| Size buckets (shorter side, model px) | very-small [0, 8), small [8, 16), medium [16, 32), large [32, ∞) — the M22 buckets. Drawn within 4–7.75, 8–15.75, 16–31.75 and 32–48 |
| Model px | CSS px × 640 ÷ max(viewport w, h), at DPR 1 |
| Viewports | 1280×720, 1280×800, 1024×640, 960×600, 1024×1024, 800×1280 (landscape, square, portrait) |
| Coverage | an owner-stated **schedule**: a quota per split, class and bucket; refused if incomplete or unplaceable |
| Shapes | per-class aspect ranges (`config.mjs`); icons also draw circle, square, rounded or glyph |
| Placement | seeded shelf packing below the masthead with 8–24 px clearance; positives never overlap; unplaceable targets reported, never dropped |
| Positioning | every labelled element `position:absolute` at its declared integer box |
| Occlusion | only as labelled cases (`occlusion-partial`, `occlusion-full`), each with its own occluder, at a stated per-element probability; never a positive |
| Labels | rendered `getBoundingClientRect`, geometric visibility, M22 hit-test validity, intent, source box, computed position, bucket |
| Positive training target | intent `positive` **and** validity `HIT_TESTABLE` |
| Splits | `manifest-<split>.json` and `frames-<split>/` per split; ids `<split>-<00000>`; seeds from (version, split, index); no id, seed or layout shared across splits |
| TEST | planned only with the seal token; built once; hash recorded at build; never opened by audits |
| Gate before training | G1–G9 PASS on TRAIN and DEV at owner-approved thresholds |

**Open for the owner:**
- the schedule;
- the occlusion share and kinds;
- the split sizes;
- the gate thresholds;
- how non-positive labels enter training;
- whether the viewport and aspect ranges are acceptable.
