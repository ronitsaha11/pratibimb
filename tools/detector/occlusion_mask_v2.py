"""
Partial-occlusion classification ignore mask (M22.12). A PURE helper: plain data and numpy arrays in,
numpy arrays out. It builds no model, computes no loss, and trains nothing.

WHY (M22.11). The v2 adapter excludes partially occluded controls from the targets, but their visible
half stays in the frame. `targets.detector_loss` applies the classification term to EVERY cell, so the
cells that see that visible half are supervised as "no control here" - 5,719 TRAIN cells on candidate 2
see no occluder pixel at all. The loss has no ignore path. This helper says which classification
entries a training step should leave out of the loss; applying it is the training step's job.

THE MASK, per sample, shaped like `cls_t` from `data.sample_to_tensors`: [A, C] = [GRID*GRID, 8].
Stacked over a batch and permuted (0, 2, 1) it is [N, C, A], the shape `detector_loss` gives the class
logits. An entry (cell a, class c) is IGNORED when:
  - a PARTIAL-occlusion case of class c has a visible region (its box minus its occluder's rendered
    box) that intersects the receptive field of cell a; and
  - the entry is not a positive target (`cls_t[a, c] != 1`): positives always take precedence.
Only the occluded control's own class channel is ignored; every other class at that cell stays
supervised. FULL occlusion ignores nothing: its pixels are the occluder, correctly background. Box
targets are not an input and cannot change.

RECEPTIVE FIELD, exact for this architecture. `TRUNK_LAYERS` lists every spatial layer of
`head.UiHead` in forward order as (kernel, stride, padding); a test checks it against the real module
structure. Composing them gives a field of 31 px with jump 8 centred on input pixel index 8*i: output
cell (row r, col c) sees pixel indices 8c-15 .. 8c+15 and 8r-15 .. 8r+15, i.e. the continuous span
[8c-15, 8c+16) x [8r-15, 8r+16). A visible region intersects it when the overlap has positive area.
LIMITATION, stated rather than hidden: this is the CONVOLUTIONAL support. In training mode BatchNorm
normalises with batch statistics, so strictly every output depends weakly on every pixel of the batch;
that global coupling is not a spatial receptive field and is not represented.

COORDINATES. Boxes are CSS px; they go to model px with the same `targets.css_box_to_model` and the
same clip to the letterboxed content as `data.sample_to_tensors`.
"""

import math

import numpy as np

from head import CLASSES, GRID, INPUT_SIZE, NUM_CLASSES, STRIDE
from targets import css_box_to_model, letterbox_params

# Every spatial layer of head.UiHead in forward order: (kernel, stride, padding). Four conv-bn blocks,
# then the 1x1 box and class heads (one entry: both are 1x1, stride 1, no padding).
TRUNK_LAYERS = ((3, 2, 1), (3, 2, 1), (3, 2, 1), (3, 1, 1), (1, 1, 0))

PARTIAL = "occlusion-partial"
FULL = "occlusion-full"
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}
A = GRID * GRID


class MaskError(ValueError):
    """An input the helper refuses. Never a partial mask."""


def receptive_field(layers=TRUNK_LAYERS):
    """
    Compose (kernel, stride, padding) layers. Returns (size, jump, centre0): output index i sees input
    pixel indices jump*i + centre0 - (size-1)/2 ... jump*i + centre0 + (size-1)/2.
    """
    size, jump, centre0 = 1, 1, 0.0
    for k, s, p in layers:
        size += (k - 1) * jump
        centre0 += jump * ((k - 1) / 2 - p)
        jump *= s
    return size, jump, centre0


def _windows():
    size, jump, centre0 = receptive_field()
    if jump != STRIDE or GRID * jump != INPUT_SIZE or size % 2 != 1:
        raise MaskError(f"receptive field (size {size}, jump {jump}) does not fit stride {STRIDE} and grid {GRID}")
    half = (size - 1) / 2
    idx = np.arange(A)
    col, row = idx % GRID, idx // GRID
    # Pixel indices lo..hi inclusive cover the continuous span [lo, hi + 1).
    x0 = jump * col + centre0 - half
    y0 = jump * row + centre0 - half
    return x0, x0 + size, y0, y0 + size


WX0, WX1, WY0, WY1 = _windows()


def _finite_box(b):
    return isinstance(b, dict) and all(isinstance(b.get(k), (int, float)) and not isinstance(b.get(k), bool) and math.isfinite(b[k]) for k in ("x", "y", "w", "h")) and b["w"] > 0 and b["h"] > 0


def _model_rect(box, sample):
    """CSS box -> model px (x0, y0, x1, y1), clipped to the letterboxed content exactly as
    `data.sample_to_tensors` clips a target; None when nothing of it remains (the same > 1 px rule)."""
    cap, vp = sample["captureSize"], sample["viewportCss"]
    scale, pad_x, pad_y = letterbox_params(cap["w"], cap["h"])
    bx = css_box_to_model(box, cap["w"] / vp["w"], scale, pad_x, pad_y)
    x0, y0 = max(bx[0], pad_x), max(bx[1], pad_y)
    x1, y1 = min(bx[0] + bx[2], INPUT_SIZE - pad_x), min(bx[1] + bx[3], INPUT_SIZE - pad_y)
    if x1 - x0 <= 1.0 or y1 - y0 <= 1.0:
        return None
    return (x0, y0, x1, y1)


def _subtract(r, o):
    """Rectangle r minus rectangle o: up to four disjoint rectangles of positive area."""
    if o is None:
        return [r]
    x0, y0, x1, y1 = r
    ox0, oy0, ox1, oy1 = max(o[0], x0), max(o[1], y0), min(o[2], x1), min(o[3], y1)
    if ox0 >= ox1 or oy0 >= oy1:
        return [r]
    parts = [(x0, y0, x1, oy0), (x0, oy1, x1, y1), (x0, oy0, ox0, oy1), (ox1, oy0, x1, oy1)]
    return [p for p in parts if p[2] > p[0] and p[3] > p[1]]


def _validate_sample(sample):
    if not isinstance(sample, dict):
        raise MaskError("a sample dict is required")
    for key in ("captureSize", "viewportCss"):
        v = sample.get(key)
        if not (isinstance(v, dict) and all(isinstance(v.get(k), (int, float)) and v[k] > 0 for k in ("w", "h"))):
            raise MaskError(f"sample {sample.get('id')!r}: {key} is missing or invalid")
    cases = sample.get("occlusionCases")
    if not isinstance(cases, list):
        raise MaskError(f"sample {sample.get('id')!r}: no occlusion provenance (occlusionCases); load it through data_v2")
    return cases


def partial_occlusion_ignore_mask(sample, cls_t):
    """
    The classification ignore mask for one adapted v2 sample. `cls_t` is that sample's [A, C] class
    target array from `data.sample_to_tensors` (a torch tensor or a numpy array; it is not modified).

    Returns a dict: `mask` (bool [A, C], True = leave out of the classification loss), `ignoredByClass`,
    `ignoredEntries`, `positiveConflicts` (entries a partial case would ignore but that are positive
    targets, so stay supervised) and `positiveConflictsByClass`, `ignoredOnCellsPositiveForAnotherClass`,
    and `cases` counts. Refuses (MaskError) on invalid dimensions or missing provenance.
    """
    cases = _validate_sample(sample)
    t = np.asarray(cls_t.numpy() if hasattr(cls_t, "numpy") else cls_t)
    if t.shape != (A, NUM_CLASSES):
        raise MaskError(f"cls_t must be [{A}, {NUM_CLASSES}] like data.sample_to_tensors; got {list(t.shape)}")
    if not np.all((t == 0) | (t == 1)):
        raise MaskError("cls_t must be a 0/1 one-hot target array")
    positive = t == 1

    want = np.zeros((A, NUM_CLASSES), dtype=bool)
    counts = {"partial": 0, "partialWithVisibleRegion": 0, "partialOutsideLetterbox": 0, "full": 0}
    for case in cases:
        if not isinstance(case, dict):
            raise MaskError(f"sample {sample.get('id')!r}: an occlusion case is not a record")
        intent, cls = case.get("intent"), case.get("cls")
        if intent not in (PARTIAL, FULL):
            raise MaskError(f"{case.get('id')!r}: intent {intent!r} is not an occlusion case")
        if cls not in CLASS_INDEX:
            raise MaskError(f"{case.get('id')!r}: class {cls!r} is not one of {CLASSES}")
        if not _finite_box(case.get("box")):
            raise MaskError(f"{case.get('id')!r}: box is missing or invalid")
        if intent == FULL:
            counts["full"] += 1  # its pixels are the occluder: background, correctly; nothing ignored
            continue
        counts["partial"] += 1
        if not _finite_box(case.get("occluder")):
            raise MaskError(f"{case.get('id')!r}: a partial-occlusion case without its occluder's rendered box (missing provenance)")
        target = _model_rect(case["box"], sample)
        if target is None:
            counts["partialOutsideLetterbox"] += 1
            continue
        visible = _subtract(target, _model_rect(case["occluder"], sample))
        if not visible:
            continue
        counts["partialWithVisibleRegion"] += 1
        hit = np.zeros(A, dtype=bool)
        for x0, y0, x1, y1 in visible:
            hit |= (WX0 < x1) & (WX1 > x0) & (WY0 < y1) & (WY1 > y0)
        want[hit, CLASS_INDEX[cls]] = True

    conflicts = want & positive
    mask = want & ~positive
    other_positive = positive.any(axis=1, keepdims=True) & ~positive
    return {
        "mask": mask,
        "ignoredByClass": {c: int(mask[:, i].sum()) for i, c in enumerate(CLASSES)},
        "ignoredEntries": int(mask.sum()),
        "positiveConflicts": int(conflicts.sum()),
        "positiveConflictsByClass": {c: int(conflicts[:, i].sum()) for i, c in enumerate(CLASSES)},
        "ignoredOnCellsPositiveForAnotherClass": int((mask & other_positive).sum()),
        "cases": counts,
    }
