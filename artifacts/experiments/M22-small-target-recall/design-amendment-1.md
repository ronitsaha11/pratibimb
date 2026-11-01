# M22 — design amendment 1: occluded fixture elements

**Written 2026-11-01, after the design was frozen (`design.md`, commit `11dabc5`) and BEFORE any
M22 detector run.** `design.md` is not edited; this file amends it, and where they differ, this
file governs. Nothing below was informed by detector output: no detector had been run on an M22
cell.

## 1. What was found (FACT, no detector)

A fixture audit rendered all 20 DEV specs in all 11 planned cells (220 screens) and asked the
browser's own hit test, at the centre of every measured element wholly inside the viewport,
whether the element is what is there.

**240 of 3,476 measured elements fail.** Two causes:

| Cause | Elements | Where |
|---|---|---|
| **The corner icon `#ic0` is never visible.** `specToHtml` gives it `left`/`top` but its stylesheet has no `position` rule for `[role=img]` (buttons, inputs, selects, labels, links and tabs are `position:absolute`; the icon is not). So it renders in normal flow at the page origin, under the absolutely positioned masthead, which paints over it. `__measure()` still reports it as a visible icon. | 220 — one per screen | every cell |
| **Overlaps in dense layouts.** A later-placed button covers part of a link, a tab or another button. | 20 | mostly zoom ≤ 1 |

Per cell (failing / measured inside the viewport): 1280×720 20/362 · 1280×800 22/386 ·
1280×640 22/318 · 1280×1280 20/391 · 960×1280 20/377 · 720×1280 20/355 · zoom 0.5 28/431 ·
zoom 0.75 28/411 · zoom 1.5 20/230 · zoom 2 20/143 · zoom 3 20/72.

**Correction to `design.md` §3.** It says "all but the same 5 elements" fail. That figure came
from 5 specs in one cell; the full audit above supersedes it.

### The same defect is in the training data (FACT)

`specToHtml` also rendered the T1 training set (`1e8808d`). In `artifacts/datasets/t1-ui-v1`,
**every `icon` annotation in the train split (120 of 120) and the dev split (40 of 40) is that
element: box (0, 0, 22, 22), under the masthead.** The head's `icon` class was therefore trained
only on an element that is not visible. What it learned to call an icon is not established here.

*Disclosure:* the first count of this was taken over all 200 samples, which read the TEST split's
annotation metadata (box positions only; no frame, no evaluation). It was recomputed over train
and dev only, and only those figures are used. The TEST split remains unevaluated.

## 2. Treatment — option B: exclude and report, do not fix the generator

**Option A (correct the generator) is not taken.** `specToHtml` produced the pinned `t1-ui-v1`
dataset and the W1 / Track B DEV specs. Changing it changes those datasets' identity and the
training distribution the shipped artifact was fit to. That is a retraining decision for the
owner, not a fixture fix inside an evaluation.

**Validity rule, applied per element before any detector output is read:**

- An element is **VALID** when the browser's hit test at the centre of its visible part (its box
  clipped to the viewport) returns the element, a descendant of it, or a label whose control it is.
- Otherwise it is **OCCLUDED**.
- OFFSCREEN elements stay excluded as the evaluator excludes them.

**How the two populations are scored:**

| Population | Ground truth | Predictions |
|---|---|---|
| **Full** (as the project's evaluator scores the fixtures today) | every VISIBLE and CLIPPED element | all; checked against `evaluate()` exactly as `design.md` §4 requires |
| **Valid** (the M22 result) | VISIBLE and CLIPPED elements that are VALID | a prediction matched (by the full population's matching) to an OCCLUDED element is **ignored** — neither TP nor FP; every other prediction counts as in the full population |

The valid population is what M22's recall, precision, buckets and attribution report. The full
population is reported alongside it so the effect of the exclusion is visible. Occluded elements
are counted per cell and per cause, and are never attributed to a pipeline stage.

**Consequence stated in advance.** The valid population contains **no icon**, because the only
icon in every spec is the occluded one. M22 therefore says nothing about the `icon` class.

## 3. Everything else in `design.md` stands

Cells, buckets, matching, attribution stages, options, hypotheses and evidence rules are unchanged.
