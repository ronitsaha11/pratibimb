---
id: M22.2-dataset-generator-v2
title: "M22.2 — a versioned, isolated generator for a future T1 dataset"
status: recorded — generator implemented and unit-tested; NO DATASET GENERATED
date: 2026-11-01
label: FACT (code and tests) / no dataset result exists
classification: ENGINEERING — no rendering, no detector, no training, no TEST data
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.2 — v2 synthetic dataset generator

> **No v2 dataset has been generated, nothing has been rendered, and no model has been retrained.**
> This record is about code and its tests. It contains **no dataset-quality result**, because no
> dataset exists to measure.

## Hypothesis

A generator that positions every labelled element explicitly, schedules every class into every
size bucket, labels occlusion explicitly and separates splits by construction removes, **by
design**, each defect M22.1 found in the v1 recipe. Only a rendered v2 build and a gate run can
show that it does in practice; M22.2 did neither.

## Environment

W1, Node v24.22.1, Vitest. No browser was used.

## Expected result

Unit tests showing, on in-memory fixtures:
- explicit positioning of every labelled element;
- seeded variety;
- full class × size coverage;
- reproducibility and stable ordering;
- explicit occlusion handling;
- per-split manifests;
- leakage refusal;
- gate failures for each injected defect, including G8 and G9.

## Actual result

- **`tools/dataset/v2/`:** architecture and policy in its [`README.md`](../../../tools/dataset/v2/README.md).
- **Dataset specification:** [`dataset-v2-spec.md`](dataset-v2-spec.md).
- **Tests:** 31 v2 tests (`tools/dataset/v2/test/v2.test.mjs`), plus 21 gate tests (8 new for G8
  and G9). All pass.

Two defects were found in my own first draft, and fixed, while writing the tests:
1. **The occlusion share was silently lost.** It was applied as `round(elements × share)` per
   sample, which rounds to zero with a few targets per sample. It is now a per-element seeded
   draw.
2. **G3 counted labelled occlusion cases as failures.** It now leaves declared occlusion cases to G9
   and still fails undeclared occlusion.

**Plan-only exercise** with a throwaway example schedule (not committed): 40 TRAIN and 12 DEV
samples planned, occlusion share 0.1, no leakage, no target deferred. Occlusion cases come out of the
scheduled quotas, so quotas must allow for them.

## Conclusion

The generator exists, is isolated from v1, and its rules are tested. Whether it produces a dataset
that passes the gate is **not known**. That needs the owner's schedule and thresholds, the render
step, a build and a gate run.

## Reproducibility

```bash
npx vitest run tools/dataset tests/browser/support/dataset-quality-gate.test.mjs
```
```bash
node tools/dataset/v2/build-v2.mjs --schedule=<owner schedule.json> --counts=train:<n>,dev:<m> --occlusion=<share>:<kinds>
```
