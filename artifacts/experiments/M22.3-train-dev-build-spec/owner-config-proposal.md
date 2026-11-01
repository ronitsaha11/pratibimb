# M22.3 — proposed TRAIN/DEV configuration (for owner decision; NOT APPROVED)

> **Nothing here is approved.** The values are the architecture review's candidates, plus three the
> brief left open (the overflow limit and the two leakage thresholds). Each is checked against a
> plan-only run (`README.md` §Plan-only results). No code default was changed: the generator and the
> gate still refuse to run without every value being stated.

## Fields

| Field | Required | Suggested | Rationale | Owner decision |
|---|---|---|---|---|
| Generator version | yes (fixed in code) | `t1-ui-synthetic@2.1.0-draft` | M22.3 changed every output (seeds, appearance, provenance), so the version moved off `2.0.0-draft` | Approve the name, or set a release name before the build |
| TRAIN requested samples | yes (`--counts`) | 600 | Review candidate. 5,760 targets at 12 per page use 80% of 7,200 slots | Approve 600 |
| DEV requested samples | yes (`--counts`) | 160 | Review candidate. 1,536 targets use 80% of 1,920 slots | Approve 160 |
| Classes | yes (config + gate `classes`) | the eight T1 classes | The T1 head's classes; G4 checks every one | Confirm |
| Size buckets | yes (config) | the four M22 buckets | They are the buckets M22 measures recall in | Confirm |
| TRAIN positives per class × bucket | yes (schedule) | 150 | Review candidate. 4,800 positives | Approve 150, for all 32 cells, or per cell |
| DEV positives per class × bucket | yes (schedule) | 40 | Review candidate. 1,280 positives | Approve 40 |
| Partial-occlusion cases per cell | yes (schedule) | TRAIN 15, DEV 4 | 10% of the positive quota, **added on top** of it (exact: 10% of 150 and of 40) | Approve 10%, and whether occlusion cases are wanted at all |
| Full-occlusion cases per cell | yes (schedule) | TRAIN 15, DEV 4 | as above | as above |
| `maxTargetsPerSample` | yes (schedule) | 12 | Review candidate. Pages get 6–12 targets (mean 9.6) | Approve 12 |
| `maxOverflowSamples` | yes (schedule) | 60 | **Not a review value.** Headroom only: the plan used none (0 targets deferred). 60 pages add 720 slots, 10% of TRAIN's slots. It is one value for both splits | Approve 60, or set a smaller value |
| Viewports | yes (config) | the six existing | Landscape, square, portrait; every bucket has an integer CSS size at every scale (tested) | Confirm the range |
| Aspect ranges | yes (config) | as `config.mjs` (widened in M22.3, drawn log-uniformly) | Wider shapes, with both ends drawn equally often | Approve the ranges |
| Appearance sets | yes (config) | 6 palettes, 7 local font stacks, 6 control styles, 10 icon glyphs × 3 plates, 3 density levels, 3 decor kinds | Variety without external assets; all deterministic from the seed | Approve, or name sets to add or remove |
| Density weights | yes (config) | sparse 1, medium 2, dense 3 | At 80% use, pages get 6–12 targets; genuinely sparse pages (1–3) would need more samples or other weights | Approve, or ask for sparser pages |
| `HIT_SAFE_RADIUS` | yes (config) | 0.15 of the shorter side | The largest radius that keeps every 9×9 grid point inside the box is 0.19; 0.15 leaves a margin | Approve |
| Leakage `elementIou` | yes (`--leakage`) | 0.5 | **Not a review value.** A 1 px shift scores IoU close to 1; 0.5 is the usual detection-match level | Approve a value |
| Leakage `layoutShare` | yes (`--leakage`) | 0.5 | **Not a review value.** Measured: the most similar TRAIN/DEV pair scores 0.182, and no pair reaches 0.25. A copy shifted by 1 px scores 1.0 | Approve a value |
| G4 `minPerClassBucket` | yes | `{ train: 150, dev: 40 }` (per split, new in M22.3) | Equal to the positive quotas, as the brief asked. **No margin:** one planned positive that does not render HIT_TESTABLE fails G4 | Approve equality, or set a lower floor |
| G5 `nearDuplicateIou` | yes | 0.9 | Review candidate. Planned layouts keep 8 px clearance, so planned near-duplicate pairs are 0 | Approve 0.9 |
| G6 `repetitionShare` | yes | 0.02 | Review candidate. That is 12 of 600 TRAIN or 4 of 160 DEV samples. On the plan, no (class, box) occurs in more than 1 sample | Approve 0.02 |
| G8 `sourceTolerancePx` | yes | 0.5 CSS px | Review candidate. Boxes are integers at DPR 1; how exactly the browser reproduces them is UNKNOWN until a render | Approve 0.5 |
| `requiredChecks` | yes | `REQUIRED_CHECKS_V2` (G1–G9) | A required check that does not apply fails the gate | Approve |
| `expectedSplits` | yes | `["train", "dev"]` | A missing split fails G4 and G7; TEST is not part of this build | Approve |
| How non-positive labels enter training | not in code yet | — | Occlusion cases and non-HIT_TESTABLE labels are recorded but never positives; whether the trainer ignores them, or treats them as negatives, is not decided | **Decide before training** |
| Rendering | not implemented | — | The render step is the next piece of code | **Approve implementing it** |

## Theoretical capacity

| | TRAIN | DEV |
|---|---|---|
| Positives (32 cells × quota) | 32 × 150 = **4,800** | 32 × 40 = **1,280** |
| Partial occlusion (32 × 10%) | 32 × 15 = 480 | 32 × 4 = 128 |
| Full occlusion (32 × 10%) | 32 × 15 = 480 | 32 × 4 = 128 |
| **Targets** | **5,760** | **1,536** |
| Requested slots (samples × 12) | 600 × 12 = 7,200 | 160 × 12 = 1,920 |
| Utilisation | 5,760 / 7,200 = **80%** | 1,536 / 1,920 = **80%** |
| Headroom in requested pages | 1,440 slots (20%) | 384 slots (20%) |
| Overflow allowance (60 × 12) | +720 → 7,920 slots | +720 → 2,640 slots |
| Mean targets per page | 9.6 | 9.6 |

Slot count is the arithmetic bound. Geometry is a second bound: a page can run out of room before
it reaches 12 targets, for example with several large, wide textboxes. **Measured on the plan-only
run, geometry did not bind:** 0 targets deferred at the first layout, 0 overflow pages used, in both
splits.

## What the owner is asked to approve before a build

1. **Splits and quotas:** split sizes, positive quotas and occlusion-case quotas.
2. **Plan limits:** `maxTargetsPerSample` and `maxOverflowSamples`.
3. **Leakage thresholds:** `elementIou` and `layoutShare`.
4. **Gate thresholds:** the G4 minima, including whether they leave a margin, plus G5, G6 and G8.
5. **Generation ranges:** the aspect ranges, the appearance sets, the density weights and the hit-safe radius.
6. **Version name.**
7. **Training:** how non-positive labels enter it.
8. **Rendering:** whether to implement the render step.

TEST is not part of this approval. A separate task must harden TEST authorisation first.
