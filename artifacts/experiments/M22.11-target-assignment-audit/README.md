---
id: M22.11-target-assignment-audit
title: "M22.11 — training target assignment and loss-semantics audit on candidate 2"
status: recorded — read-only research; NO TRAINING, NO MODEL, NO INFERENCE, NO TEST
date: 2026-11-03
label: FACT (measured on W1 through the real target code and the approved adapter); INFERENCE where marked
classification: RESEARCH (read-only) — no training, no optimizer, no forward or backward pass, no predictions, no weights, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.11 — target assignment and loss-semantics audit

> **No execution:** no model was built (other than by the real target code's pure functions), no optimizer was created, and no forward or backward pass, prediction or weight file exists.
> **Nothing changed:** no repository file was changed during the audit. This record was written afterwards, in M22.12.
> **No TEST:** TEST was not accessed.
> **Candidate 2:** read through the approved adapter (`train_v2.load_train` / `load_dev`, approved G10). The excluded occlusion annotations were read with the adapter's own reader (`data_v2._read_json`) from the same manifest, after the adapter had accepted it and only after its hash was checked against the G10 binding.

## Hypothesis

The v1 target assignment (`targets.assign_targets`) and loss (`targets.detector_loss`) can be audited exactly on candidate 2, without a model. The audit should show:
- whether targets collide or are lost;
- how each size bucket is represented;
- what the loss does with excluded partial-occlusion controls.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300.

**Software:** Python 3.13.14, numpy 2.5.1, torch 2.14.0+cpu (imported for `targets.py` only), pillow 12.3.0.

**Data:** candidate 2, rendered by Chromium 153.0.8010.12 (M22.6).

**Date:** 2026-11-03.

## Expected result

Exact counts, from the real functions, of:
- collisions;
- per-bucket assignment;
- the partial-occlusion supervision path.

Plus the schedule arithmetic.

## Actual result

### Evidence

| Log | Produced by | SHA-256 |
|---|---|---|
| `logs/w1-target-assignment-audit.json` | `harness/audit11.py` | `5f63de98…f699eed9` |
| `logs/w1-fallback-bound-and-shared-squares.json` | `harness/audit11b.py` | `3b41025b…dfcc4896b` |
| `logs/w1-partial-occlusion-receptive-field.json` | `harness/audit11c.py` | `9c122a74…85759db` |
| `logs/w1-partial-samples-and-schedule.json` | `harness/audit11d.py` (re-run in M22.12) | `9266e71c…15f6f0ec` |

- **The first three logs** are the audit's outputs, unchanged. The harness scripts are the exact scripts that produced them, run from the repository root. `audit11b.py` and `audit11c.py` reuse the helpers of `audit11.py`.
- **The fourth log:** `audit11d.py` re-derives two figures that the audit first computed in an inline command whose output was not kept. It gives the same values.
- **Data only:** the harness reads candidate 2 and builds no model.

### 1. Grid-cell collisions (real `assign_targets`)

**Fidelity:** `assign_targets` over the adapter's boxes equals the real `data.sample_to_tensors` output in **600 of 600 TRAIN and 160 of 160 DEV** samples.

**Method:** each object was assigned alone and then jointly, so every shared claim and every winner is visible.

| | TRAIN | DEV |
|---|---|---|
| Cells claimed by more than one object | **0** | **0** |
| Objects losing any cell, or all cells | 0 / 0 | 0 / 0 |
| Pairs whose centres fall in the same grid cell | 0 | 0 |
| Pairs touching the same 8 × 8 cell square, neither claiming it | 16 (15 cross-class) | 10 (9 cross-class) |

- **Breakdown:** 0 in every class, size bucket and viewport.
- **The touching pairs:** 4–6 model px apart, and every shared square's centre lies in the gap between them.
- **Ordering:** the real function was called on two nested boxes, a button around a checkbox. The **larger** object (the button) owns the shared cell. The code comment says the smaller one keeps it. **This is a confirmed defect, with zero effect on candidate 2.**

### 2. Small-object representation (TRAIN; DEV in the log)

| Bucket | Shorter side, model px | Covered cell centres (median, max) | Positive cells | No covered centre |
|---|---|---|---|---|
| very-small | 4.0–7.5 | 1, 15 | 2,994 (1.8 %) | **342 / 1,320 (25.9 %)**; all 342 trained through one nearest cell |
| small | 8.0–15.6 | 4, 58 | 10,154 (6.0 %) | 0 |
| medium | 16.0–31.5 | 18, 252 | 41,570 (24.7 %) | 0 |
| large | 32.0–48.0 | 54, 468 | 113,532 (67.5 %) | 0 |

**IoU ceiling (FACT, from the decode):**
- **Why there is a ceiling:** the decode makes l, t, r, b = exp(·) · 8 > 0, so every predicted box contains its own cell centre.
- **The bound:** for an object with no covered centre, the best IoU any cell can reach is wh / ((w + dx)(h + dy)).
- **TRAIN:** 0.533 to 1.0, mean 0.852. **0 objects are below 0.5**; 4 are below 0.6 and 19 below 0.7.
- **DEV:** minimum 0.594.
- **Box-loss floor:** these cells' box loss averages at least 0.149.

**Receptive field:** the trunk's receptive field is 31 px, centred on input pixel 8c, while the decode uses 8c + 4. This 3.5 px offset is constant and learnable, so it is **no issue**.

### 3. Partial-occlusion supervision

**The path, traced through the real code (FACT):**
1. The adapter drops occlusion cases from the targets.
2. `assign_targets` leaves their cells with `pos = False` and every class target at 0.
3. `detector_loss` applies the focal loss to **every** cell, so those entries become negatives with α 0.75. `pos_mask` gates only the box loss and the normaliser.
4. **There is no ignore mechanism.**

**The generator:** a partial occluder covers the target from `x + floor(w / 2)` to its right edge (`tools/dataset/v2/layout.mjs`). The visible share averages 49.4 %.

| | TRAIN | DEV |
|---|---|---|
| Partial cases with a visible cell centre | 413 / 480 | 104 / 128 |
| Visible-region cells supervised as negatives | 7,405 | 1,909 |
| …whose 31 px receptive field holds no occluder pixel | **5,719** | 1,505 |
| …and lies wholly inside the control | 727 | 151 |
| Full occlusion: visible cell centres | 0 | 0 |

**Full occlusion is correct:** the occluder covers the box plus 1 px on each side.

**Removing samples that contain a partial case is not viable:**
- in TRAIN, 340 of 600 samples contain one, and they hold 2,860 of the 5,280 kept positives;
- that would leave 2,420, below the 32 × 150 = 4,800 that the cell minimums need.

### 4. Loss

**Formula:** L = L_cls + 5 · L_box, with both terms divided by N⁺, the batch's positive-cell count, clamped to at least 1.

**L_cls:** sigmoid focal loss over every cell × 8 classes.
- **Weights:** α 0.25 for positives and 0.75 for negatives, with γ 2.
- **No objectness channel.**

**L_box:** 1 − plain IoU over positive cells only.

**How objects are weighted:**
- an object's weight is proportional to its cell count, as the shares in §2 show;
- N⁺ per sample ranges from 11 to 1,080 (median 242), so the per-cell weight 1 / N⁺ varies with batch composition.

### 5. Schedule (closed form; no scheduler built)

**Steps:** 600 / 4 = 150 per epoch, × 40 epochs = 6,000; DEV has 160 / 4 = 40 batches.

**Learning rate:**

| At the first step of epoch | 1 | 11 | 21 | 31 | 40 |
|---|---|---|---|---|---|
| Learning rate | 3.0e-3 | 2.561e-3 | 1.5e-3 | 4.39e-4 | 4.6e-6 |

The last step runs at 2.06e-10, and the learning rates sum to 9.0015.

**Configuration gaps:**
- the M22.9 and M22.10 proposals disagree on checkpoint frequency and on the early-stopping action;
- the M22.9 validator cannot express record-only stopping, the DEV-evaluation frequency, the DEV-loss aggregation or determinism;
- pre-flight plans steps by rounding up, while v1 drops a partial batch. They agree only because 600 is divisible by 4.

## Conclusion

| Area | Finding | Class |
|---|---|---|
| Collisions | ordering contradicts its comment | **confirmed defect** (0 effect on candidate 2) |
| Collisions | 0 in candidate 2 | **no issue found** |
| Small objects | 25.9 % nearest-cell only; IoU ceiling 0.533–1.0 | **confirmed limitation** |
| Partial occlusion | visible control cells trained as background; no ignore path | **confirmed defect** in supervision semantics |
| Full occlusion | correct | **no issue found** |
| Loss balance | per-cell normalisation favours large objects; N⁺ varies by batch | **confirmed limitation**; batch dependence a **potential risk** |
| Schedule | arithmetic consistent; proposals and validator inconsistent | **potential risk** |

**Hypotheses, not findings:** whether any of this lowers recall after training is INFERENCE until a separately authorised DEV evaluation.

**Follow-up:** M22.12 implements the ignore mask and reconciles the configuration.

## Reproducibility

From the repository root, with the approved G10 files in place (data only; no model):

```bash
python -I artifacts/experiments/M22.11-target-assignment-audit/harness/audit11.py
```
```bash
python -I artifacts/experiments/M22.11-target-assignment-audit/harness/audit11b.py
```
```bash
python -I artifacts/experiments/M22.11-target-assignment-audit/harness/audit11c.py
```
```bash
python -I artifacts/experiments/M22.11-target-assignment-audit/harness/audit11d.py
```

**What to expect:**
- **Output:** each script prints the JSON stored under `logs/`.
- **Timing:** `audit11.py` decodes every TRAIN and DEV frame through `data.sample_to_tensors`, so it takes the longest. Its `seconds` field is wall time and varies between runs.
