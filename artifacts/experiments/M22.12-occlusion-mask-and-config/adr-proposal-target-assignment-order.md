# ADR proposal — which object owns a shared grid cell in `targets.assign_targets`

> **Status:** PROPOSED. **Not an ADR yet**, and nothing is implemented. On approval it is to be filed under `docs/adr/` with the next free number.
> **Frozen code:** `tools/detector/targets.py` is unchanged and stays unchanged until this is decided and regression evidence exists.
> **Owner's provisional preference:** smaller-object priority. It requires owner approval and regression evidence before implementation.

## Context

**The defect (FACT, M22.11):**
- **What the comment says:** `assign_targets` says objects are processed "Smallest-first, so that where two objects claim the same cell the SMALL one keeps it".
- **What the code does:** it iterates in ascending area and overwrites `box_t[c]` and `cls_t[c]` for every claimed cell, so **the last, larger object wins**.
- **Shown on the real function:** called on a button box around a checkbox box, the shared cell went to the button.
- **Classification:** confirmed defect (`artifacts/experiments/M22.11-target-assignment-audit/`, `orderingProbe`).

**Effect on candidate 2: none (FACT).**
- In TRAIN and DEV, 0 cells are claimed by more than one object, 0 objects lose a cell, and 0 pairs have centres in the same cell.
- The current assignment of candidate 2 is therefore identical under any ownership rule.

**Where it matters:** any dataset with nested or overlapping controls, for example a checkbox inside a selectable row, an icon inside a button, or a tab strip inside a card. The v1 dataset (`t1-ui-v1`) is outside this milestone's access rules, so its collision count is UNKNOWN.

## Options

### A. The smaller object wins a shared cell

- **Small-object learning:** a small object inside a larger one keeps its cells.
  - Small objects have few cells to lose: a very-small object has a median of 1 covered centre (M22.11).
  - A large object has many cells (median 54) and loses only the few it shares.
  - This matches the comment's stated intent, and the minimal-area tie rule common in anchor-free detectors such as FCOS (INFERENCE: a convention, not evidence for this data).
- **Determinism:** the order is decided by area.
  - The current `np.argsort` uses numpy's default sort, which is not stable.
  - Equal areas are ordered deterministically for one numpy build, but this is not guaranteed across builds.
  - The ADR should require an explicit key, area then input index, with a stable sort.
- **Overlapping controls:**
  - the larger control's box target is still regressed from its remaining cells;
  - its classification at the shared cells becomes the small class;
  - a fully contained large control always keeps cells outside the small one.

### B. The larger object wins (the current behaviour)

- **Small-object learning:** a small object fully inside a larger one can lose **all** its cells. It then contributes nothing to the loss and is silently unlabelled. This is the failure the comment was written to prevent, and the worst outcome for M22's small-target goal.
- **Determinism:** the same sort concern as A.
- **The only argument for it:** it is what `t1-ui-v1`, and therefore T1, was trained with, so keeping it keeps T1 exactly reproducible.

### C. Explicit conflict refusal

- **Behaviour:** assignment raises, or pre-flight refuses, on any cell claimed by two objects.
- **Small-object learning:** neither object loses silently, but the dataset is refused instead of learned.
- **Determinism:** fully deterministic.
- **Overlapping controls:**
  - real UIs nest controls, so a refusing rule cannot train on them;
  - it suits a gate, not an assignment rule;
  - candidate 2 passes it today.

## Recommendation (for the owner)

1. **Adopt A for the v2 pipeline,** with a stable key of area, then input index.
2. **Implement it without touching `targets.py`:**
   - add a separate `assign_targets_v2` in the v2 training support;
   - leave v1's function as is, so T1's recipe stays reproducible;
   - this is a decision in itself, because two assignment functions must then be kept equivalent wherever no cell is shared.
3. **Keep C as a pre-flight metric, not a refusal:**
   - count shared cells, objects that lose cells, and objects that lose all cells, per class and size bucket;
   - refuse only if an object would lose **all** its cells, since that is a silently dropped label under any rule.

**Regression evidence required before implementing A:**
- **(a) Candidate 2 identity:** byte-identical `pos`, `box_t` and `cls_t` to v1 `assign_targets` on every candidate 2 TRAIN and DEV sample. This must hold, because there are 0 collisions.
- **(b) Synthetic nested cases:** small-in-large, two equal-area overlaps, and three-deep nesting, with the expected owners.
- **(c) Determinism:** the stable tie-break, shown under repeated runs and permuted input order.
- **(d) Pre-flight report:** the C-style collision report on candidate 2 shows 0.

## Consequences

- **Candidate 2:** no change, because there are 0 collisions; the first run's targets are identical whichever option is chosen.
- **Future datasets with nesting:** under A, small controls keep their labels.
- **The v1 path:** unchanged.
- **Two assignment functions:** a v1 and a v2 function then exist. Requirement (a) and a permanent test keep them identical wherever no cell is shared.
