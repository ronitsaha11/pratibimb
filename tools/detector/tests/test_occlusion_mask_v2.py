"""
M22.12 — the partial-occlusion classification ignore mask (`occlusion_mask_v2`).

Synthetic, in-memory samples; a reference implementation that tests every input pixel of every
receptive field, so the helper's window arithmetic is never checked against itself. The receptive
field is checked against the real `head.UiHead` module structure, built on the META device: no
parameter storage, no forward pass, no weights. Nothing is trained; no real dataset is read.
"""

import copy
import inspect
import os
import sys

import numpy as np
import pytest
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import occlusion_mask_v2 as om  # noqa: E402
from data_v2 import AdapterError, load_split  # noqa: E402
from head import CLASSES, GRID, INPUT_SIZE, NUM_CLASSES, STRIDE  # noqa: E402
from targets import assign_targets  # noqa: E402
from test_data_v2 import add_occluder_provenance, edit, policy, write_candidate  # noqa: E402

A = GRID * GRID
BUTTON, TAB, CHECKBOX = CLASSES.index("button"), CLASSES.index("tab"), CLASSES.index("checkbox")


def sample(cases, w=640, h=640):
    """A CSS viewport equal to the capture: at 640 x 640, CSS px are model px (scale 1, no pad)."""
    return {"id": "fixture-00000", "captureSize": {"w": w, "h": h}, "viewportCss": {"w": w, "h": h}, "occlusionCases": cases}


def case(cls, box, occluder=None, intent=om.PARTIAL, cid="fixture-00000-e000"):
    x, y, w, h = box
    c = {"id": cid, "cls": cls, "intent": intent, "box": {"x": x, "y": y, "w": w, "h": h}, "occluder": None}
    if occluder is not None:
        ox, oy, ow, oh = occluder
        c["occluder"] = {"x": ox, "y": oy, "w": ow, "h": oh}
    return c


def no_targets():
    return np.zeros((A, NUM_CLASSES), dtype=np.float32)


def reference_hits(visible_rects):
    """Independent reference: a cell is hit if any pixel index of its receptive field (from
    `receptive_field`, pixel by pixel) overlaps a visible rectangle with positive area."""
    size, jump, centre0 = om.receptive_field()
    half = (size - 1) // 2
    hit = np.zeros(A, dtype=bool)
    for a in range(A):
        r, c = divmod(a, GRID)
        xs = range(int(jump * c + centre0) - half, int(jump * c + centre0) + half + 1)
        ys = range(int(jump * r + centre0) - half, int(jump * r + centre0) + half + 1)
        for x0, y0, x1, y1 in visible_rects:
            if any(i < x1 and i + 1 > x0 for i in xs) and any(j < y1 and j + 1 > y0 for j in ys):
                hit[a] = True
                break
    return hit


# ── the receptive field comes from the real architecture ──────────────────────────────────────


def test_receptive_field_is_31_px_with_jump_8_centred_on_8i():
    assert om.receptive_field() == (31, 8, 0.0)
    assert om.WX0[0] == -15 and om.WX1[0] == 16 and om.WX0[1] == -7 and om.WY0[GRID] == -7


def test_trunk_layers_match_the_real_uihead_module_structure():
    import head
    import torch

    with torch.device("meta"):  # structure only: no storage, no forward
        model = head.UiHead()
    convs = [m for m in model.modules() if isinstance(m, torch.nn.Conv2d)]
    spec = [(m.kernel_size[0], m.stride[0], m.padding[0]) for m in convs]
    assert all(m.kernel_size[0] == m.kernel_size[1] and m.stride[0] == m.stride[1] and m.padding[0] == m.padding[1] and m.dilation == (1, 1) for m in convs)
    assert spec[:4] == list(om.TRUNK_LAYERS[:4])  # the four conv-bn blocks, in forward order
    assert spec[4:] == [om.TRUNK_LAYERS[4]] * 2  # the 1x1 box and class heads, side by side
    assert not any(isinstance(m, (torch.nn.MaxPool2d, torch.nn.AvgPool2d, torch.nn.Upsample)) for m in model.modules())
    assert om.receptive_field()[1] == STRIDE and GRID * STRIDE == INPUT_SIZE


# ── 1, 2: a partial case masks its own class where its visible part is seen ───────────────────


def test_1_a_partial_control_masks_its_class_where_the_receptive_field_sees_the_visible_part():
    # Box [100, 140) x [100, 116); occluder over its right half from x = 120: visible [100, 120).
    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))]), no_targets())
    expected = reference_hits([(100, 100, 120, 116)])
    assert np.array_equal(r["mask"][:, BUTTON], expected)
    cols = sorted({a % GRID for a in np.flatnonzero(expected)})
    rows = sorted({a // GRID for a in np.flatnonzero(expected)})
    assert cols == list(range(11, 17)) and rows == list(range(11, 17))  # 8c-15 < 120 and 8c+16 > 100
    assert r["ignoredEntries"] == 36 == r["ignoredByClass"]["button"]
    assert r["cases"] == {"partial": 1, "partialWithVisibleRegion": 1, "partialOutsideLetterbox": 0, "full": 0}


def test_2_unrelated_classes_stay_supervised():
    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))]), no_targets())
    others = [i for i in range(NUM_CLASSES) if i != BUTTON]
    assert not r["mask"][:, others].any()
    assert all(v == 0 for c, v in r["ignoredByClass"].items() if c != "button")


# ── 3: full occlusion ignores nothing ─────────────────────────────────────────────────────────


def test_3_a_fully_occluded_control_creates_no_ignore_region():
    full = case("tab", (200, 200, 40, 16), (199, 199, 42, 18), intent=om.FULL)
    no_occ = case("tab", (300, 300, 40, 16), None, intent=om.FULL)  # a full case needs no occluder
    r = om.partial_occlusion_ignore_mask(sample([full, no_occ]), no_targets())
    assert not r["mask"].any() and r["ignoredEntries"] == 0 and r["cases"]["full"] == 2


# ── 4: positives take precedence ──────────────────────────────────────────────────────────────


def test_4_positive_targets_are_never_masked_and_conflicts_are_counted():
    # A real button target right next to the partial button, and a checkbox target inside its field.
    pos, box_t, cls_t = assign_targets([(124.0, 96.0, 40.0, 24.0), (104.0, 120.0, 8.0, 8.0)], [BUTTON, CHECKBOX])
    want = reference_hits([(100, 100, 120, 116)])
    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))]), cls_t)
    button_pos = cls_t[:, BUTTON] == 1
    assert not (r["mask"][:, BUTTON] & button_pos).any()  # precedence
    assert r["positiveConflicts"] == int((want & button_pos).sum()) > 0
    assert r["positiveConflictsByClass"]["button"] == r["positiveConflicts"]
    assert np.array_equal(r["mask"][:, BUTTON], want & ~button_pos)
    # The checkbox target's own entry stays positive and unmasked; only its button entry is ignored.
    cb = cls_t[:, CHECKBOX] == 1
    assert not r["mask"][cb, CHECKBOX].any()
    assert r["ignoredOnCellsPositiveForAnotherClass"] == int((r["mask"][:, BUTTON] & cb & want).sum()) > 0


# ── 5, 6: several cases combine; classes stay independent ─────────────────────────────────────


def test_5_multiple_partial_controls_combine_as_the_union():
    a = case("button", (100, 100, 40, 16), (120, 99, 21, 18), cid="s-e000")
    b = case("button", (130, 200, 60, 20), (160, 199, 31, 22), cid="s-e001")
    both = om.partial_occlusion_ignore_mask(sample([a, b]), no_targets())["mask"]
    one = om.partial_occlusion_ignore_mask(sample([a]), no_targets())["mask"]
    two = om.partial_occlusion_ignore_mask(sample([b]), no_targets())["mask"]
    assert np.array_equal(both, one | two)


def test_6_multiple_classes_are_represented_independently():
    a = case("button", (100, 100, 40, 16), (120, 99, 21, 18), cid="s-e000")
    t = case("tab", (104, 104, 40, 16), (124, 103, 21, 18), cid="s-e001")  # overlapping fields, other class
    r = om.partial_occlusion_ignore_mask(sample([a, t]), no_targets())
    assert np.array_equal(r["mask"][:, BUTTON], reference_hits([(100, 100, 120, 116)]))
    assert np.array_equal(r["mask"][:, TAB], reference_hits([(104, 104, 124, 120)]))
    assert r["ignoredEntries"] == r["ignoredByClass"]["button"] + r["ignoredByClass"]["tab"]


# ── 7, 8, 9: empty input, invalid dimensions, missing provenance ──────────────────────────────


def test_7_no_occlusion_case_gives_an_all_false_mask():
    r = om.partial_occlusion_ignore_mask(sample([]), no_targets())
    assert r["mask"].shape == (A, NUM_CLASSES) and not r["mask"].any() and r["ignoredEntries"] == 0 and r["positiveConflicts"] == 0


@pytest.mark.parametrize("bad", [np.zeros((A, NUM_CLASSES - 1)), np.zeros((A - 1, NUM_CLASSES)), np.zeros((NUM_CLASSES, A)), np.zeros((1, A, NUM_CLASSES)), np.full((A, NUM_CLASSES), 0.5)])
def test_8_invalid_dimensions_or_values_are_refused(bad):
    with pytest.raises(om.MaskError):
        om.partial_occlusion_ignore_mask(sample([]), bad)


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda s: s.pop("occlusionCases"), "no occlusion provenance"),
        (lambda s: s.update(occlusionCases=None), "no occlusion provenance"),
        (lambda s: s["occlusionCases"][0].update(occluder=None), "missing provenance"),
        (lambda s: s["occlusionCases"][0]["occluder"].pop("w"), "missing provenance"),
        (lambda s: s["occlusionCases"][0].update(intent="positive"), "not an occlusion case"),
        (lambda s: s["occlusionCases"][0].update(cls="slider"), "class"),
        (lambda s: s["occlusionCases"][0]["box"].update(w=float("nan")), "box"),
        (lambda s: s.pop("captureSize"), "captureSize"),
    ],
)
def test_9_missing_or_invalid_provenance_is_refused(spoil, message):
    s = sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))])
    spoil(s)
    with pytest.raises(om.MaskError, match=message):
        om.partial_occlusion_ignore_mask(s, no_targets())


# ── 10, 11, 12: determinism, box targets untouched, shape ─────────────────────────────────────


def test_10_repeated_input_gives_identical_output_and_inputs_are_not_modified():
    s = sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18)), case("tab", (300, 300, 30, 12), (315, 299, 16, 14), cid="s-e001")])
    _, _, cls_t = assign_targets([(124.0, 96.0, 40.0, 24.0)], [BUTTON])
    s0, c0 = copy.deepcopy(s), cls_t.copy()
    r1 = om.partial_occlusion_ignore_mask(s, cls_t)
    r2 = om.partial_occlusion_ignore_mask(s, cls_t)
    assert np.array_equal(r1["mask"], r2["mask"]) and {k: v for k, v in r1.items() if k != "mask"} == {k: v for k, v in r2.items() if k != "mask"}
    assert s == s0 and np.array_equal(cls_t, c0)


def test_11_the_mask_never_touches_box_regression_targets():
    assert list(inspect.signature(om.partial_occlusion_ignore_mask).parameters) == ["sample", "cls_t"]  # box targets are not an input
    pos, box_t, cls_t = assign_targets([(124.0, 96.0, 40.0, 24.0)], [BUTTON])
    p0, b0 = pos.copy(), box_t.copy()
    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))]), cls_t)
    assert np.array_equal(pos, p0) and np.array_equal(box_t, b0)
    assert set(r) == {"mask", "ignoredByClass", "ignoredEntries", "positiveConflicts", "positiveConflictsByClass", "ignoredOnCellsPositiveForAnotherClass", "cases"}


def test_12_the_mask_matches_the_classification_loss_tensor_shape():
    import torch

    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (120, 99, 21, 18))]), no_targets())
    assert r["mask"].shape == (A, NUM_CLASSES) and r["mask"].dtype == bool
    # The trainer stacks per-sample [A, C] targets and permutes (0, 2, 1); detector_loss reshapes the class
    # logits [N, C, GRID, GRID] to [N, C, A]. Shapes only - no model.
    batch = np.stack([r["mask"], r["mask"]]).transpose(0, 2, 1)
    assert batch.shape == tuple(torch.zeros(2, NUM_CLASSES, GRID, GRID).reshape(2, NUM_CLASSES, -1).shape)


# ── receptive-field boundaries ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "visible_x0, visible_x1, col, hit",
    [
        (176.0, 190.0, 20, False),  # cell 20 sees [145, 176): a region starting at 176 only touches it
        (175.5, 190.0, 20, True),  # half a pixel inside
        (100.0, 145.0, 20, False),  # ends exactly where the field starts
        (100.0, 145.5, 20, True),
        (0.0, 4.0, 2, True),  # cell 2 sees [1, 32): the region [0, 4) is inside
        (0.0, 1.0, 2, False),  # [0, 1) ends where it starts
        (630.0, 640.0, 79, True),  # the last cell's field runs past the canvas
    ],
)
def test_receptive_field_boundaries(visible_x0, visible_x1, col, hit):
    # The target runs 20 px past the strip and the occluder covers it from visible_x1 rightwards, so the
    # visible region is exactly [visible_x0, visible_x1) x [300, 316) (at the canvas edge the occluder is
    # clipped away entirely and the target is clipped to 640).
    s = sample([case("button", (visible_x0, 300.0, (visible_x1 - visible_x0) + 20.0, 16.0), (visible_x1, 299.0, 40.0, 18.0))])
    c = s["occlusionCases"][0]
    assert om._subtract(om._model_rect(c["box"], s), om._model_rect(c["occluder"], s)) == [(visible_x0, 300.0, visible_x1, 316.0)]
    m = om.partial_occlusion_ignore_mask(s, no_targets())["mask"][:, BUTTON]
    row = 300 // STRIDE  # its field spans y = 281 .. 312, inside the strip's rows
    assert bool(m[row * GRID + col]) is hit
    assert np.array_equal(m, reference_hits([(visible_x0, 300.0, visible_x1, 316.0)]))


def test_an_occluder_covering_the_whole_target_leaves_nothing_visible():
    r = om.partial_occlusion_ignore_mask(sample([case("button", (100, 100, 40, 16), (90, 90, 60, 40))]), no_targets())
    assert r["ignoredEntries"] == 0 and r["cases"]["partial"] == 1 and r["cases"]["partialWithVisibleRegion"] == 0


def test_letterboxed_coordinates_follow_sample_to_tensors(tmp_path):
    """At 1280 x 720 (scale 0.5, pad 140 rows) the helper's model box is the one the real input path
    assigns: its centre equals the box target at the positive cells data.sample_to_tensors builds."""
    from data import sample_to_tensors

    (tmp_path / "frames-train").mkdir()
    Image.new("RGB", (1280, 720), (255, 255, 255)).save(tmp_path / "frames-train" / "f.png")
    box = {"x": 401.0, "y": 203.0, "w": 90.0, "h": 30.0}
    s = sample([case("button", (500, 300, 80, 24), (540, 298, 42, 28))], w=1280, h=720)
    s["framePath"] = "frames-train/f.png"
    s["annotations"] = [{"cls": "button", "box": box, "visibility": "VISIBLE"}]
    _, pos, box_t, cls_t = sample_to_tensors(str(tmp_path), s)
    x0, y0, x1, y1 = om._model_rect(box, s)
    cells = np.flatnonzero(pos.numpy())
    assert np.allclose(box_t.numpy()[cells[0]], [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0])
    r = om.partial_occlusion_ignore_mask(s, cls_t)
    vis = om._subtract(om._model_rect(s["occlusionCases"][0]["box"], s), om._model_rect(s["occlusionCases"][0]["occluder"], s))
    assert vis == [(250.0, 290.0, 270.0, 302.0)]  # x 500..540 CSS -> 250..270 model; y 300..324 -> 150+140 .. 162+140
    assert np.array_equal(r["mask"][:, BUTTON], reference_hits(vis) & (cls_t.numpy()[:, BUTTON] != 1))


# ── the adapter carries occlusion provenance ──────────────────────────────────────────────────


def test_the_adapter_carries_occlusion_cases_with_their_rendered_occluder(tmp_path):
    root = write_candidate(str(tmp_path / "cand"))
    s0 = load_split(root, "train", policy(root))["samples"][0]
    assert [(c["intent"], c["cls"], c["occluder"]) for c in s0["occlusionCases"]] == [("occlusion-partial", "button", None), ("occlusion-full", "tab", None)]

    add_occluder_provenance(root, ("train",))
    s0 = load_split(root, "train", policy(root))["samples"][0]
    part, full = s0["occlusionCases"]
    b = part["box"]
    assert part["occluder"] == {"x": b["x"] + b["w"] // 2, "y": b["y"] - 1, "w": b["w"] - b["w"] // 2 + 1, "h": b["h"] + 2}  # floor(w/2), ceil(w/2)+1
    assert full["occluder"] is None  # the fixture's full case has no occluder recorded; the mask never needs one
    assert part["id"] not in {a["id"] for a in s0["annotations"]}  # occlusion cases are never targets
    assert om.partial_occlusion_ignore_mask(s0, np.zeros((A, NUM_CLASSES)))["ignoredEntries"] > 0

    edit(root, "manifest-train.json", lambda m: [o.update({"for": "someone-else"}) for s in m["samples"] for o in s["provenance"]["occluders"]])
    with pytest.raises(AdapterError, match="recorded for another element"):
        load_split(root, "train", policy(root))
