# M22.1 — proposed future T1 dataset version and its quality gate

**PROPOSAL for owner review. Nothing here is implemented in the generator, and `t1-ui-v1` is not
changed.** The validator in §3 exists (`tests/browser/support/dataset-quality-gate.mjs`); its
thresholds for training are the owner's to set.

## 1. What a new version must fix (from M22.1's findings)

| Finding (FACT) | Required change |
|---|---|
| The icon's inline `left`/`top` are ignored because `[role=img]` has no `position` rule; every icon renders at the origin under the masthead | Position the icon explicitly (`position:absolute`), and make the gate's source-consistency check (§3, G8) a hard failure for every class |
| One fixed 22×22 icon box in every sample | Icons drawn from a seeded distribution of **shape** (circle, square, rounded, glyph-like), **size**, **position** (corners, toolbars, inline beside text, inside buttons) and **count** (zero to several per screen) |
| No observable icon example | The gate refuses any class with zero HIT_TESTABLE examples in any split |
| No element of 32 model px or more in any class; very-small only for checkbox and radio | A **seeded size schedule** per class that covers all four M22 buckets. Size via element dimensions and content zoom, recorded per sample. Not by resampling the image: Track B showed resampling changes appearance |
| Overlaps from layout (later buttons over links, tabs, buttons) | Layout either avoids overlap by construction, or labels occlusion explicitly: each annotation carries its M22 validity category, and FULLY_OCCLUDED labels are never training positives |

## 2. Dataset rules

1. **Labels from the rendered document,** as today (`getBoundingClientRect`), plus the M22 hit-test
   validity per label. The hit test is a proxy, not pixel visibility. A pixel-level check (render
   with and without the element and compare) is the stronger option, at a higher cost.
2. **Only HIT_TESTABLE labels are positive training targets.** PARTIALLY_OCCLUDED,
   SAMPLING_SENSITIVE and PARTIALLY_CLIPPED labels are kept and marked; how training treats them
   (ignore region, or excluded) is a training decision to record before training.
3. **Valid boundaries:** every box finite and positive; the stated visibility equal to what the
   geometry says.
4. **Split separation by construction:**
   - **Disjoint seeds:** keep the current per-split offsets.
   - **Disjoint layouts:** no identical annotation signature across splits (G7).
   - **No shared spec draw:** a spec is generated for exactly one split.
   - **One manifest per split** (`manifest-train.json`, `manifest-dev.json`, `manifest-test.json`),
     with frames in per-split folders. Then TRAIN and DEV can be audited without opening TEST,
     which M22.1 could not do.
5. **TEST is sealed:** generated once, hashed, and not opened by any audit, tuning or development
   step. Its manifest hash is recorded before any model is evaluated on it.
6. **Reproducible:** generator version, seed, per-split counts, the size schedule and the
   validity rule are all recorded in each manifest; the build is deterministic; frames stay out of
   Git, as today.
7. **New version identity:** `t1-ui-v2` (or similar), with its own name, version and hash.
   `t1-ui-v1` and every record made against it are kept unchanged.

## 3. The quality gate

Implemented as `runDatasetGate` (G1–G7), with deterministic tests; G8 is proposed.

| Check | Passes when | Validity terms used |
|---|---|---|
| G1 non-degenerate | every box finite, width and height > 0 | — |
| G2 visibility matches geometry | stated VISIBLE / CLIPPED / OFFSCREEN equals the box's geometry | — |
| G3 labels observable | no label stated VISIBLE is anything but HIT_TESTABLE | HIT_TESTABLE, PARTIALLY_OCCLUDED, FULLY_OCCLUDED, SAMPLING_SENSITIVE |
| G4 class × size coverage | every class has ≥ *N* observable examples in every size bucket, per split | HIT_TESTABLE (or VISIBLE when no validity is present) |
| G5 duplicates | no exact, and no near (IoU ≥ *t*), same-class pair within a sample | — |
| G6 suspicious repetition | no (class, box) recurring in ≥ *s* of a split's samples (at least 2) | — |
| G7 split integrity | ids unique; no seed and no identical layout in two splits | — |
| **G8 source consistency** *(proposed)* | no element's declared position is ignored by the browser | — |

- **No default thresholds.** *N*, *t* and *s* are required options. The gate refuses to run
  without them, and the record states the values used. M22.1 used *N* = 1, *t* = 0.9 and
  *s* = 0.5 to *report*; these are not proposed training thresholds.
- **Independence.** The gate is pure: it needs no detector, no browser and no pixels. The hit-test
  validities come from the fixture audit's classification, computed when the dataset is rendered.

## 4. Before any retraining (prerequisites)

1. The owner decides to retrain. This proposal does not.
2. The fixed generator passes G1–G8 on TRAIN and DEV, with the owner's *N*, *t* and *s* recorded
   before the build.
3. A recorded decision on how non-HIT_TESTABLE labels enter training.
4. The size schedule and the class list frozen before the build, with the reasoning written down.
5. TEST built and sealed once, its hash recorded, and not opened until the frozen evaluation.
6. A pre-registered evaluation design for the retrained model, including the M22 size buckets and
   attribution stages, run on DEV before any TEST read.
7. The current artifact `ba6d9e93…` and every record against `t1-ui-v1` kept for comparison.
8. Registry, ADR and gate steps for model adoption as the repository requires; retraining by itself
   adopts nothing.
