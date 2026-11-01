# M22.3 — decision record

**Generator improved and tested; a configuration proposed. No dataset generated, nothing rendered,
no model trained, TEST untouched.**

| Part | Status | Evidence |
|---|---|---|
| Provenance (sample, element, occluder, decor) | IMPLEMENTED; unit-tested | `tools/dataset/v2/test/v2.test.mjs` §8 |
| Appearance variety, hit-safe boxes | IMPLEMENTED; unit-tested | §9, §9b |
| SHA-256 seeds, strict canonical JSON, fixed-width ids, stable hashes | IMPLEMENTED; unit-tested | §10, §11 |
| Per-split G4 minimum | IMPLEMENTED; unit-tested | `tests/browser/support/dataset-quality-gate.test.mjs` |
| TRAIN 600 / DEV 160 configuration | **PROPOSED, NOT APPROVED** | `owner-config-proposal.md` |
| Plan-only check of that configuration | exact reconciliation, 0 deferred, 0 leaks, byte-identical reruns | `README.md` §Plan-only results |
| Render step | **NOT IMPLEMENTED** | — |
| v2 dataset | **NOT BUILT** | — |
| TEST authorisation | **UNCHANGED, still weak**; TEST refused | `README.md` §TEST |
| v1 builder, `t1-ui-v1`, T1 artifact | UNCHANGED | — |

**The owner must decide before any build.** The full list, with suggested values, is in
`owner-config-proposal.md`.
- split sizes, positive and occlusion-case quotas, `maxTargetsPerSample`, `maxOverflowSamples`;
- leakage thresholds;
- gate thresholds, and whether G4 equal to the quotas, with no margin, is intended;
- aspect ranges, appearance sets, density weights, hit-safe radius;
- the version name;
- how non-positive labels enter training;
- approval to implement the render step and to build TRAIN/DEV;
- separately, a task to harden TEST authorisation before any TEST build.
