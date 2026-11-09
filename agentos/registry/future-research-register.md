# Future research register — PratiBimb

> **Research questions deliberately deferred out of a closed scope.** An entry here is a **record**, not an authorisation.
> - **Executing an entry:** it needs its own explicit owner authorisation, and it may need the resolution of a recorded blocker (`agentos/blockers.md`).
> - **What an entry is not:** it is not a plan, and it carries no execution steps.

## Status vocabulary

| Status | Meaning |
|---|---|
| `DEFERRED — NOT AUTHORISED FOR EXECUTION` | Recorded so it is not lost; nothing may be run for it |
| `AUTHORISED` | The owner has authorised specific work; the authorisation and its limits are cited |
| `CLOSED` | Answered with recorded evidence, or withdrawn by the owner |

---

## FR-01 — Detector Performance and Generalisation Research

| Field | Value |
|---|---|
| **Status** | **`DEFERRED — NOT AUTHORISED FOR EXECUTION`** |
| **Origin** | M22's original question (`artifacts/experiments/M22-small-target-recall/design.md` §1, hypotheses §8), deferred by the owner's **Option B** on 2026-11-03 (`artifacts/experiments/M22.19-scope-amendment-closure/`) |
| **Blocker** | **B-07**: the M22 evaluation restriction, in force. This entry does not lift it and does not suggest a way around it |

**Research questions (none answered):**
1. The original T1's small-target recall.
2. T1-v2's detection precision, recall, F1 and AP/mAP.
3. Recall by class and by size.
4. M22 hypotheses **H1–H5**.
5. A comparison between T1 and T1-v2.
6. Attribution of detector false positives and false negatives.
7. Generalisation beyond the synthetic candidate 2.
8. An independent TEST evaluation (a sealed TEST does not exist).
9. The evidence needed before any detector adoption.

**Stated explicitly:**
- **None of these outcomes has been established.**
- **Loss is not detection:** training and DEV loss (M22.13: DEV 3.983 → 2.893) is not detection performance.
- **The checkpoint is unadopted:** the epoch-39 checkpoint (`a485425d…`) is **UNADOPTED**, and so is the original T1 (`ba6d9e93…`).
- **Acceptance is not quality:** candidate 2's conditional acceptance (M22.9) does not prove detector quality.
- **No claim without evidence:** no claim of detector improvement is permitted without actual, authorised detection evidence.

**Open questions inherited from M22.14:** these were never decided, and they are not approvals:
- inference authorisation;
- whether a baseline evaluation is the blocked operation;
- the scorer's `test`-split requirement;
- the full-occlusion rule;
- the headline view;
- ONNX export and the `onnxruntime` version.

**Prerequisites recorded earlier,** still unmet (`artifacts/experiments/M22.1-dataset-quality/future-dataset-spec.md` §4):
- a TEST built and sealed once (item 5);
- a pre-registered evaluation run on DEV before any TEST read (item 6).
