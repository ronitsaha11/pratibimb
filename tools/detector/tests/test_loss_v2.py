"""
M22.13 — the v2 masked loss (`loss_v2`) against the unchanged reference `targets.detector_loss`.

Inputs are seeded random tensors standing in for model outputs, with targets from the real
`assign_targets` and masks from the real `occlusion_mask_v2`. No model is built and nothing is trained.
"""

import os
import sys

import numpy as np
import pytest
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import loss_v2  # noqa: E402
import occlusion_mask_v2 as om  # noqa: E402
from head import CLASSES, GRID, NUM_CLASSES  # noqa: E402
from targets import assign_targets, detector_loss  # noqa: E402

A = GRID * GRID
BUTTON, LINK, TAB = CLASSES.index("button"), CLASSES.index("link"), CLASSES.index("tab")


def _sample(cases):
    return {"id": "fixture-00000", "captureSize": {"w": 640, "h": 640}, "viewportCss": {"w": 640, "h": 640}, "occlusionCases": cases}


def _case(cls, box, occ, intent=om.PARTIAL):
    return {"id": "x", "cls": cls, "intent": intent, "box": dict(zip("xywh", box)), "occluder": dict(zip("xywh", occ)) if occ else None}


def batch(seed=0, cases=((("button", (100, 100, 40, 16), (120, 99, 21, 18)),), ())):
    """Two samples: targets from assign_targets, masks from occlusion_mask_v2, random 'model outputs'."""
    objs = ([(124.0, 96.0, 40.0, 24.0), (300.0, 300.0, 6.0, 6.0), (400.0, 40.0, 120.0, 40.0)], [BUTTON, LINK, TAB])
    P, BT, CT, IG = [], [], [], []
    for sample_cases in cases:
        pos, box_t, cls_t = assign_targets(*objs)
        m = om.partial_occlusion_ignore_mask(_sample([_case(*c) for c in sample_cases]), cls_t)["mask"]
        P.append(torch.from_numpy(pos))
        BT.append(torch.from_numpy(box_t))
        CT.append(torch.from_numpy(cls_t))
        IG.append(torch.from_numpy(m))
    g = torch.Generator().manual_seed(seed)
    n = len(cases)
    box_raw = (torch.randn(n, 4, GRID, GRID, generator=g) * 0.5).requires_grad_(True)
    cls_raw = (torch.randn(n, NUM_CLASSES, GRID, GRID, generator=g) * 2 - 3).requires_grad_(True)
    return box_raw, cls_raw, torch.stack(P), torch.stack(BT).permute(0, 2, 1), torch.stack(CT).permute(0, 2, 1), torch.stack(IG).permute(0, 2, 1)


def grads(fn, box_raw, cls_raw, *rest):
    b, c = box_raw.detach().clone().requires_grad_(True), cls_raw.detach().clone().requires_grad_(True)
    out = fn(b, c, *rest)
    out[0].backward()
    return out, b.grad, c.grad


# ── the critical regression: an empty mask is the legacy loss, bitwise ────────────────────────


@pytest.mark.parametrize("seed", [0, 1, 7])
def test_an_all_false_mask_reproduces_detector_loss_exactly_values_and_gradients(seed):
    box_raw, cls_raw, P, BT, CT, _ = batch(seed)
    empty = torch.zeros_like(CT, dtype=torch.bool)
    (l1, c1, b1), gb1, gc1 = grads(lambda b, c: detector_loss(b, c, P, BT, CT), box_raw, cls_raw)
    (l2, c2, b2), gb2, gc2 = grads(lambda b, c: loss_v2.detector_loss_v2(b, c, P, BT, CT, empty), box_raw, cls_raw)
    assert torch.equal(l1, l2) and torch.equal(c1, c2) and torch.equal(b1, b2)
    assert torch.equal(gb1, gb2) and torch.equal(gc1, gc2)


def test_the_formula_and_normalisation_are_those_of_detector_loss():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    loss, cls_l, box_l = loss_v2.detector_loss_v2(box_raw, cls_raw, P, BT, CT, IG)
    f, b, n, focal, box_cell = loss_v2.loss_terms(box_raw, cls_raw, P, BT, CT, IG)
    assert torch.equal(focal.sum(), f) and torch.equal(box_cell.sum(), b) and not focal[IG].any()
    npos = n.clamp(min=1).float()
    assert torch.equal(cls_l, (f / npos).detach()) and torch.equal(box_l, (b / npos).detach())
    assert torch.equal(loss, f / npos + 5.0 * (b / npos))
    assert int(n) == int(P.sum())  # the normaliser is the positive-cell count, independent of the mask


# ── the mask's effect ─────────────────────────────────────────────────────────────────────────


def test_masked_entries_get_no_gradient_and_every_other_entry_gets_the_legacy_gradient():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    assert IG.any()
    _, _, g_legacy = grads(lambda b, c: detector_loss(b, c, P, BT, CT), box_raw, cls_raw)
    _, _, g_masked = grads(lambda b, c: loss_v2.detector_loss_v2(b, c, P, BT, CT, IG), box_raw, cls_raw)
    gl, gm = g_legacy.reshape(2, NUM_CLASSES, -1), g_masked.reshape(2, NUM_CLASSES, -1)
    assert torch.all(gm[IG] == 0) and torch.all(gl[IG] != 0)  # the negative push is removed exactly there
    assert torch.equal(gm[~IG], gl[~IG])  # nothing else changes: same numerator terms, same normaliser


def test_other_classes_at_masked_cells_stay_supervised():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    _, _, g = grads(lambda b, c: loss_v2.detector_loss_v2(b, c, P, BT, CT, IG), box_raw, cls_raw)
    g = g.reshape(2, NUM_CLASSES, -1)
    cells = IG[0, BUTTON].nonzero().flatten()
    others = [i for i in range(NUM_CLASSES) if i != BUTTON]
    assert not IG[0][others][:, cells].any() and torch.all(g[0][others][:, cells] != 0)


def test_a_mask_over_a_positive_entry_is_refused():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    bad = IG.clone()
    bad[CT == 1] = True
    with pytest.raises(loss_v2.LossInputError, match="positive"):
        loss_v2.detector_loss_v2(box_raw, cls_raw, P, BT, CT, bad)


def test_full_occlusion_creates_no_mask_so_the_loss_is_the_legacy_loss():
    full = (("tab", (200, 200, 40, 16), (199, 199, 42, 18), om.FULL),)
    box_raw, cls_raw, P, BT, CT, IG = batch(cases=(full, ()))
    assert not IG.any()
    assert torch.equal(loss_v2.detector_loss_v2(box_raw, cls_raw, P, BT, CT, IG)[0], detector_loss(box_raw, cls_raw, P, BT, CT)[0])


def test_the_box_term_and_its_gradient_do_not_depend_on_the_mask():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    bt0 = BT.clone()
    (_, _, b_legacy), gb_legacy, _ = grads(lambda b, c: detector_loss(b, c, P, BT, CT), box_raw, cls_raw)
    (_, _, b_masked), gb_masked, _ = grads(lambda b, c: loss_v2.detector_loss_v2(b, c, P, BT, CT, IG), box_raw, cls_raw)
    assert torch.equal(b_legacy, b_masked) and torch.equal(gb_legacy, gb_masked) and torch.equal(BT, bt0)


# ── fail closed ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "make",
    [
        lambda IG: IG[:, :-1],  # a class missing
        lambda IG: IG[:1],  # a sample missing
        lambda IG: IG.reshape(2, NUM_CLASSES, GRID, GRID),  # grid layout, not [N,C,A]
        lambda IG: IG.float(),  # not bool
        lambda IG: IG.numpy(),  # not a tensor
    ],
)
def test_invalid_mask_dimensions_or_types_are_refused(make):
    box_raw, cls_raw, P, BT, CT, IG = batch()
    with pytest.raises(loss_v2.LossInputError, match="ignore mask"):
        loss_v2.detector_loss_v2(box_raw, cls_raw, P, BT, CT, make(IG))


@pytest.mark.parametrize("which", ["box_raw", "cls_raw", "BT", "CT"])
@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_non_finite_inputs_are_refused(which, bad):
    box_raw, cls_raw, P, BT, CT, IG = batch()
    t = {"box_raw": box_raw.detach().clone(), "cls_raw": cls_raw.detach().clone(), "BT": BT.contiguous().clone(), "CT": CT.contiguous().clone()}
    t[which].view(-1)[5] = bad
    with pytest.raises(loss_v2.LossInputError, match="non-finite"):
        loss_v2.detector_loss_v2(t["box_raw"], t["cls_raw"], P, t["BT"], t["CT"], IG)


def test_mismatched_target_shapes_are_refused():
    box_raw, cls_raw, P, BT, CT, IG = batch()
    with pytest.raises(loss_v2.LossInputError, match="targets"):
        loss_v2.detector_loss_v2(box_raw, cls_raw, P[:, :-1], BT, CT, IG)


def test_the_reference_loss_is_untouched():
    """The legacy function is the reference: it takes no mask, exactly as before."""
    import inspect

    assert list(inspect.signature(detector_loss).parameters) == ["box_raw", "cls_raw", "pos_mask", "box_t", "cls_t", "box_weight"]
    assert np.isclose(inspect.signature(detector_loss).parameters["box_weight"].default, 5.0)
