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
| Coverage | an owner-stated **schedule** with two explicit integer quotas per split × class × bucket: **positives**, and **occlusion cases** (partial, full) added on top. Refused if incomplete; deferred targets are rescheduled to at most `maxOverflowSamples` overflow samples, otherwise the plan is refused. Planned counts must reconcile exactly |
| Shapes | per-class aspect ranges (`config.mjs`); icons also draw circle, square, rounded or glyph |
| Placement | **stratified**: the usable area below the masthead is a 3 × 3 grid of regions; a per-sample seeded permutation assigns targets to regions; a seeded search puts each centre in its region with ≥ 8 px clearance. Acceptance: every region 5–25% of centres per viewport shape, on the tested seeds |
| Positioning | every labelled element `position:absolute` at its declared integer box |
| Occlusion | only as scheduled, labelled cases (`occlusion-partial`, `occlusion-full`), each with its own occluder; never a positive; G9 checks the observed validity matches the declared kind |
| Labels | rendered `getBoundingClientRect`, geometric visibility, M22 hit-test validity, intent, source box, computed position, bucket |
| Positive training target | intent `positive` **and** validity `HIT_TESTABLE` |
| Splits | `manifest-<split>.json` and `frames-<split>/` per split; ids `<split>-<00000>`; seeds from (version, split, index); no id, seed or layout shared across splits |
| TEST | **intended:** planned only by a sealed build, built once, hash recorded at build, never opened by audits. **Today the seal is weak** (public token; lower-level helpers unchecked; seeds predictable; one-time not enforced); `plan.mjs` and `build-v2.mjs` refuse TEST outright until a separate task hardens it |
| Gate before training | G1–G9 PASS on TRAIN and DEV with `requiredChecks: REQUIRED_CHECKS_V2` and `expectedSplits: ["train", "dev"]`, at owner-approved thresholds |
| Leakage | no id, seed, exact or near-identical layout across splits (`elementIou`, `layoutShare` stated by the owner) |

**Open for the owner:**
- the schedule (positive and occlusion-case quotas, `maxTargetsPerSample`, `maxOverflowSamples`);
- the leakage thresholds;
- the split sizes;
- the gate thresholds;
- how non-positive labels enter training;
- whether the viewport and aspect ranges are acceptable.
