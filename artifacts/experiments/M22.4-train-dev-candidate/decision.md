# M22.4 — decision record

**TRAIN/DEV candidate 1 built, validated and reproduced on W1. No model trained, no detector run,
no TEST.**

| Part | Status | Evidence |
|---|---|---|
| v2 renderer and candidate build | IMPLEMENTED; unit-tested (renderer checks, refusals) | `tools/dataset/v2/test/render.test.mjs` |
| G4 counts only source-consistent positives | IMPLEMENTED; unit-tested | `tests/browser/support/dataset-quality-gate.test.mjs` |
| Candidate 1 (`t1-ui-synthetic-2.1.0-draft-candidate-1`) | **PASS**: G1–G9 on TRAIN, DEV and both; 165 / 44 valid positives in every cell; every occlusion observed | `logs/w1-build-record-candidate-1.json` |
| Failed candidates | none | — |
| Reproducibility | all 760 samples identical, frames included (W1, Chromium 153.0.8010.12) | `logs/w1-reproducibility-candidate-1-vs-scratch.json` |
| Training on the candidate | **NOT AUTHORISED; not done** | — |
| Detector evaluation (M22 runner) | **BLOCKED; not attempted** | — |
| TEST | **NOT PLANNED, NOT BUILT**; authorisation still weak | — |
| v1 builder, `t1-ui-v1`, T1 artifact, production detector | UNCHANGED | — |

**For the owner:**
- whether candidate 1 becomes the training dataset;
- a training adapter, because v2 has one manifest per split;
- authorisation to train;
- a separate task to harden TEST authorisation before any TEST build.
