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

**Plan-only exercise, before the hardening below** (superseded): with a throwaway example schedule,
40 TRAIN and 12 DEV samples planned at occlusion share 0.1, no leakage, no target deferred. Occlusion
cases then came out of the scheduled quotas; the hardening makes them additional.

## Hardening after the architecture review (2026-11-01)

The read-only review found four blocking defects. Three are fixed here, still plan-only. The fourth,
TEST authorisation, is left for a separate task. Each result below is measured on the tested seeds,
in memory.

| Defect | Change | Result |
|---|---|---|
| **Placement bias.** Sparse pages: x quarters 0.95 / 0.05 / 0 / 0, y quarters 1.00 / 0 / 0 / 0. Dense: y 0.67 / 0.32 / 0.01 / 0 | stratified 3 × 3 placement over the usable area | sparse x 0.21 / 0.30 / 0.29 / 0.20, y 0.17 / 0.31 / 0.28 / 0.24; dense x 0.21 / 0.29 / 0.28 / 0.23, y 0.18 / 0.29 / 0.28 / 0.25; each 3 × 3 region 7.2–14.4% (sparse) and 9.4–12.5% (dense) on every viewport shape. Pre-stated criteria: 5–25% per region, top third ≤ 45%, other edge thirds ≥ 20% |
| **Quotas consumed by occlusion.** 16 of 32 cells below quota | separate positive and occlusion-case quotas; deferred targets rescheduled to overflow samples; exact reconciliation or refusal | positives preserved exactly in every cell; occlusion cases added on top; an unplaceable schedule is refused with a diagnostic |
| **Gate false passes A–F** | `requiredChecks`, `expectedSplits`, completeness checks, observed-versus-declared occlusion, `absolute`-only G8, `minPerClassBucket ≥ 1` | all six now fail; a complete, correct v2 dataset still passes; M22.1's schema still passes under its own required checks |
| (leakage) **A layout shifted by 1 px across splits was not caught** | `layoutSimilarity` with owner-supplied `elementIou` and `layoutShare` | caught; same-split near-duplicates are reported, not thrown |

**Disclosure.** The first M22.2 test suite planned two TEST ids and seeds in memory (with the seal
token), and called the path helpers with `"test"`. It did so during M22.2's verification; no file
was involved. Those calls are removed. The suite now names TEST only in two refusal checks, which
throw before anything is computed.

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
