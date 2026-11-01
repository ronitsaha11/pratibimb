# M22.2 — decision record

**Generator implemented and tested. No dataset generated, nothing rendered, no model trained.**

| Part | Status | Evidence |
|---|---|---|
| Isolated v2 generator (`tools/dataset/v2/`) | IMPLEMENTED; unit-tested | `tools/dataset/v2/test/v2.test.mjs` (31 tests) |
| Gate G8 source-to-render, G9 occlusion labels | IMPLEMENTED; unit-tested | `tests/browser/support/dataset-quality-gate.test.mjs` (21 tests) |
| Render step | **NOT IMPLEMENTED** — deliberately, in this milestone | — |
| v2 dataset | **NOT BUILT** | — |
| v1 builder, `t1-ui-v1`, T1 artifact | UNCHANGED | — |

**The owner must decide before any build:**
- the schedule;
- the occlusion setting;
- the split sizes;
- the gate thresholds;
- how non-positive labels enter training;
- approval to implement the render step and to build TRAIN/DEV;
- separately, approval of the sealed TEST build.
