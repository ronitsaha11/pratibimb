# M22.11 — decision record

**The audit found two confirmed defects in the v1 target and loss path. Neither blocks training on candidate 2:**
- the assignment-ordering defect has no effect here;
- the partial-occlusion defect gives negative supervision to 7,405 TRAIN cells, 4.4 % of the 168,250 positive-cell count.

**Nothing was trained or changed.**

| Item | Status | Evidence |
|---|---|---|
| Collisions on candidate 2 | 0 in TRAIN and DEV | `logs/w1-target-assignment-audit.json` |
| Assignment order vs comment | **Confirmed defect** (larger wins); 0 effect here; ADR proposal in M22.12 | same, `orderingProbe` |
| Very-small representation | 1.8 % of positive cells; 25.9 % nearest-cell only; IoU ceiling ≥ 0.533 | same; `logs/w1-fallback-bound-and-shared-squares.json` |
| Partial occlusion | **Confirmed defect**: 7,405 TRAIN visible-region cells negative, 5,719 with an occluder-free receptive field; no ignore path | `logs/w1-partial-occlusion-receptive-field.json` |
| Removing samples that contain a partial case | not viable: 2,420 positives would remain, against 4,800 needed | `logs/w1-partial-samples-and-schedule.json` |
| Schedule | arithmetic consistent; the configuration documents and the validator disagree | same |

**Owner decisions raised:**
- ignore regions for partial occlusion;
- an ADR for the assignment order;
- the canonical configuration and its schema;
- separate DEV reporting for very-small objects that have a covered centre and those that train through the fallback.

M22.12 acts on all of them except the ADR implementation.
