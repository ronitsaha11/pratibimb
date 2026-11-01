# T1 synthetic dataset — version 2.1 specification (draft; not built)

**Draft for owner approval.** Implemented as `tools/dataset/v2/`, version `2.1.0-draft`. It
supersedes `../M22.2-dataset-generator-v2/dataset-v2-spec.md` (kept unchanged, as written). Nothing
has been built from either. The proposed values are in `owner-config-proposal.md`.

| Area | Specification |
|---|---|
| Identity | name `t1-ui-synthetic`, version `2.1.0-draft`; distinct from `t1-ui-rendered@1.0.0` (`t1-ui-v1`), which is unchanged |
| Classes | button, link, textbox, checkbox, radio, select, tab, icon (the T1 head's eight) |
| Size buckets (shorter side, model px) | very-small [0, 8), small [8, 16), medium [16, 32), large [32, ∞). Drawn within 4–7.75, 8–15.75, 16–31.75 and 32–48 |
| Model px | CSS px × 640 ÷ max(viewport w, h), at DPR 1 |
| Viewports | 1280×720, 1280×800, 1024×640, 960×600, 1024×1024, 800×1280 |
| Coverage | an owner-stated schedule with two explicit integer quotas per split × class × bucket: **positives**, plus **occlusion cases** (partial, full) on top. Refused if incomplete. Deferred targets are rescheduled to at most `maxOverflowSamples` overflow samples, otherwise the plan is refused. Planned counts reconcile exactly |
| Dealing | density-weighted (sparse 1, medium 2, dense 3), at least one target per page, at most `maxTargetsPerSample`; no empty page |
| Shapes | per-class aspect ranges (`config.mjs`), drawn log-uniformly; boxes wider than the usable area are clamped, and both the drawn and the realised aspect are recorded |
| Placement | stratified 3 × 3 regions of the usable area, ≥ 8 px clearance. Acceptance: each region 5–25% of centres per viewport shape, on the tested seeds |
| Positioning | every labelled element `position:absolute` at its declared integer box; recorded as `declaredPosition` |
| Hit-safety | a labelled element's corner radius ≤ 0.15 × its shorter side; round icon shapes are drawn inside a rectangular box |
| Appearance | per page: one of 6 palettes, 7 local font stacks, 6 control styles, 3 density levels. Per element: icon glyph (10) and plate (3), checked, underline or selected states, neutral words. No external asset |
| Decor | unlabelled text-line bars, dividers and panels, below labels, never overlapping a labelled element or an occluder |
| Occlusion | only as scheduled, labelled cases, each with its own identified occluder (id, role, kind, target, box, covered share); never a positive; G9 checks observed against declared |
| Provenance | seed, seed derivation, spec hash, viewport, scale, masthead, area, page appearance, per element its declared box, positioning, region, size draw, appearance and occluder; occluders; decor |
| Labels | rendered `getBoundingClientRect`, geometric visibility, M22 hit-test validity, intent, `positive`, and the source above |
| Positive training target | intent `positive` **and** validity `HIT_TESTABLE` |
| Seeds | SHA-256 of the canonical JSON identity `[name, version, "sample", split, index]`; xoshiro128\*\* per named stream |
| Serialisation | canonical JSON, strict: refuses undefined, non-finite numbers and non-plain values |
| Splits | `manifest-<split>.json` and `frames-<split>/`; ids `<split>-<00000>`, fixed width, at most 100,000 per split; no id, seed, exact or near-identical layout across splits |
| TEST | **intended:** a sealed, one-time build. **Today the seal is weak** (public token, unchecked lower-level helpers, predictable seeds, one-time not enforced); planning and the command line refuse TEST until a separate task hardens it |
| Gate before training | G1–G9 PASS on TRAIN and DEV with `requiredChecks: REQUIRED_CHECKS_V2`, `expectedSplits: ["train", "dev"]` and owner-approved thresholds; G4 may hold each split to its own minimum |
