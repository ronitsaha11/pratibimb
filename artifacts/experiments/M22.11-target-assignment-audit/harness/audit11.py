"""M22.11 read-only audit: target assignment, small-object signal and partial-occlusion semantics.

Data only. No model is constructed, no optimizer, no forward or backward pass, no inference, no TEST.
Candidate 2 is read through the approved adapter (train_v2.load_train / load_dev, approved G10). The
excluded occlusion annotations are read with the adapter's own reader from the same, hash-bound
manifest, only after the adapter has accepted it.

Uses the REAL implementations:
  data.sample_to_tensors   joint targets exactly as training would build them (image decoded, no model)
  targets.assign_targets   per-object claims (each object alone) and the joint assignment
"""
import json, os, sys, time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.abspath("tools/detector"))
import numpy as np  # noqa: E402
import data  # noqa: E402
import data_v2  # noqa: E402
import train_v2  # noqa: E402
from data_v2 import G10Policy, bucket_of, candidate_root  # noqa: E402
from head import GRID, INPUT_SIZE, STRIDE  # noqa: E402
from targets import CLASS_INDEX, assign_targets, css_box_to_model, letterbox_params  # noqa: E402

CLASSES = list(CLASS_INDEX)
BUCKETS = ["very-small", "small", "medium", "large"]
A = GRID * GRID
IDX = np.arange(A)
CCX = (IDX % GRID + 0.5) * STRIDE
CCY = (IDX // GRID + 0.5) * STRIDE

CFG = "tools/dataset/v2/configs/g10-approved-candidate-2.json"
EV = "artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json"
BINDING = {"train": "f283720fab3ef6086becf51ec47f383b8a20344f9abe1e102c6ec6172c2427f8",
           "dev": "f072507a47ce087ef79b236d769b7d860c27ef536534d9490116d0145034ede1"}


def to_model(box, sample):
    """Exactly the box half of data.sample_to_tensors (lines 52-77)."""
    cap, vp = sample["captureSize"], sample["viewportCss"]
    css_to_cap = cap["w"] / vp["w"]
    scale, pad_x, pad_y = letterbox_params(cap["w"], cap["h"])
    bx = css_box_to_model(box, css_to_cap, scale, pad_x, pad_y)
    cx0, cy0 = max(bx[0], pad_x), max(bx[1], pad_y)
    cx1 = min(bx[0] + bx[2], INPUT_SIZE - pad_x)
    cy1 = min(bx[1] + bx[3], INPUT_SIZE - pad_y)
    if cx1 - cx0 <= 1.0 or cy1 - cy0 <= 1.0:
        return None
    return (cx0, cy0, cx1 - cx0, cy1 - cy0)


def iou_bound(box):
    """Supremum IoU a cell can reach for `box`: decode makes l,t,r,b = exp(.)*stride > 0, so every
    predicted box strictly contains its cell centre p; the best box is bbox(T + p), IoU = wh/((w+dx)(h+dy))."""
    x, y, w, h = box
    dx = np.maximum(0.0, np.maximum(x - CCX, CCX - (x + w)))
    dy = np.maximum(0.0, np.maximum(y - CCY, CCY - (y + h)))
    return (w * h) / ((w + dx) * (h + dy))


def cells_touching(box):
    """Cells whose 8x8 square intersects the box (area > 0)."""
    x, y, w, h = box
    c0, c1 = int(np.floor(x / STRIDE)), int(np.ceil((x + w) / STRIDE)) - 1
    r0, r1 = int(np.floor(y / STRIDE)), int(np.ceil((y + h) / STRIDE)) - 1
    return {r * GRID + c for r in range(max(r0, 0), min(r1, GRID - 1) + 1) for c in range(max(c0, 0), min(c1, GRID - 1) + 1)}


def zero():
    return defaultdict(int)


def audit(name, ds, root):
    # Excluded annotations: the adapter's reader, the same manifest, hash checked against the binding.
    manifest = data_v2._read_json(os.path.join(root, f"manifest-{name}.json"))
    assert manifest["hash"] == ds["hash"] == BINDING[name], "manifest is not the bound, accepted one"
    raw = {s["id"]: s for s in manifest["samples"]}

    objs = []
    coll = {"assignmentCollisionCells": 0, "objectsInAssignmentCollisions": 0, "sameCentreCellPairs": 0,
            "sameCentreCellCrossClassPairs": 0, "touchingSameCellPairs": 0, "touchingSameCellCrossClassPairs": 0,
            "jointEqualsSampleToTensors": 0, "samples": 0}
    by = {k: defaultdict(zero) for k in ("class", "bucket", "viewport")}
    occl = {"partial": defaultdict(zero), "full": defaultdict(zero)}
    occl_totals = Counter()
    per_sample_pos = []

    for s in ds["samples"]:
        coll["samples"] += 1
        vp = f"{s['viewportCss']['w']}x{s['viewportCss']['h']}"
        boxes, cids, meta = [], [], []
        for a in s["annotations"]:
            mb = to_model(a["box"], s)
            if mb is None:
                continue
            boxes.append(mb)
            cids.append(CLASS_INDEX[a["cls"]])
            vpw, vph = s["viewportCss"]["w"], s["viewportCss"]["h"]
            meta.append({"id": a["id"], "cls": a["cls"], "bucket": bucket_of(min(a["box"]["w"], a["box"]["h"]) * INPUT_SIZE / max(vpw, vph)),
                         "cssW": a["box"]["w"], "cssH": a["box"]["h"], "vp": vp})
        # The real joint path, image and all (no model): proves the box half above is faithful.
        _, pos_t, box_t_t, cls_t_t = data.sample_to_tensors(root, s)
        pos_j, box_j, cls_j = assign_targets(boxes, cids)
        if np.array_equal(pos_t.numpy(), pos_j) and np.array_equal(box_t_t.numpy(), box_j) and np.array_equal(cls_t_t.numpy(), cls_j):
            coll["jointEqualsSampleToTensors"] += 1
        per_sample_pos.append(int(pos_j.sum()))

        claims = []
        for k, (b, c) in enumerate(zip(boxes, cids)):
            p1, _, _ = assign_targets([b], [c])  # this object alone, real function
            claims.append(set(np.flatnonzero(p1).tolist()))
        claimers = defaultdict(list)
        for k, cl in enumerate(claims):
            for cell in cl:
                claimers[cell].append(k)
        coll_cells = {cell: ks for cell, ks in claimers.items() if len(ks) > 1}
        coll["assignmentCollisionCells"] += len(coll_cells)
        in_coll = {k for ks in coll_cells.values() for k in ks}
        coll["objectsInAssignmentCollisions"] += len(in_coll)

        centre_cell, touch = [], []
        for k, (x, y, w, h) in enumerate(boxes):
            cx, cy = x + w / 2, y + h / 2
            centre_cell.append((min(int(cx // STRIDE), GRID - 1), min(int(cy // STRIDE), GRID - 1)))
            touch.append(cells_touching(boxes[k]))
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                cross = cids[i] != cids[j]
                if centre_cell[i] == centre_cell[j]:
                    coll["sameCentreCellPairs"] += 1
                    coll["sameCentreCellCrossClassPairs"] += cross
                if touch[i] & touch[j]:
                    coll["touchingSameCellPairs"] += 1
                    coll["touchingSameCellCrossClassPairs"] += cross

        for k, (b, m) in enumerate(zip(boxes, meta)):
            x, y, w, h = b
            covered = int(((CCX >= x) & (CCX <= x + w) & (CCY >= y) & (CCY <= y + h)).sum())
            owned = sum(1 for cell in claims[k] if pos_j[cell] and np.array_equal(box_j[cell], np.array((x + w / 2, y + h / 2, w, h), dtype=np.float32)))
            bound = iou_bound(b)
            assigned_bound = float(max(bound[list(claims[k])])) if claims[k] else 0.0
            rec = {**m, "modelX": x, "modelY": y, "modelW": w, "modelH": h, "centreX": x + w / 2, "centreY": y + h / 2,
                   "centreCell": centre_cell[k], "coveredCentres": covered, "claimed": len(claims[k]), "owned": owned,
                   "fallback": covered == 0, "maxIoUAnyCell": float(bound.max()), "maxIoUAssigned": assigned_bound,
                   "inCollision": k in in_coll}
            objs.append(rec)
            for dim, key in (("class", m["cls"]), ("bucket", m["bucket"]), ("viewport", m["vp"])):
                by[dim][key]["objects"] += 1
                by[dim][key]["inAssignmentCollision"] += k in in_coll
                by[dim][key]["lostAnyCell"] += owned < len(claims[k])
                by[dim][key]["lostAllCells"] += owned == 0

        # ---- partial / full occlusion: what the loss sees ----
        r = raw[s["id"]]
        occ_rect = {o["id"]: (o.get("rendered") or o["box"]) for o in r["provenance"]["occluders"]}
        for a in r["annotations"]:
            if a.get("intent") not in ("occlusion-partial", "occlusion-full"):
                continue
            kind = "partial" if a["intent"] == "occlusion-partial" else "full"
            mb = to_model(a["box"], s)
            o = to_model(occ_rect[a["source"]["occluderId"]], s)
            if mb is None:
                occl_totals[kind + "Dropped"] += 1
                continue
            x, y, w, h = mb
            inside = (CCX >= x) & (CCX <= x + w) & (CCY >= y) & (CCY <= y + h)
            under = np.zeros(A, bool) if o is None else ((CCX >= o[0]) & (CCX <= o[0] + o[2]) & (CCY >= o[1]) & (CCY <= o[1] + o[3]))
            visible = inside & ~under
            key = f"{a['cls']}/{a['source']['bucket']}"
            occl[kind][key]["cases"] += 1
            occl[kind][key]["centresInBox"] += int(inside.sum())
            occl[kind][key]["centresVisible"] += int(visible.sum())
            occl[kind][key]["visibleCentresNegative"] += int((visible & ~pos_j).sum())
            occl[kind][key]["visibleCentresPositiveForAnother"] += int((visible & pos_j).sum())
            occl_totals[kind + "Cases"] += 1
            occl_totals[kind + "CentresInBox"] += int(inside.sum())
            occl_totals[kind + "CentresVisible"] += int(visible.sum())
            occl_totals[kind + "VisibleNegative"] += int((visible & ~pos_j).sum())
            occl_totals[kind + "WithAnyVisibleCentre"] += bool(visible.any())
            occl_totals[kind + "WithNoCentreInBox"] += not inside.any()
            if o is not None:
                ix = max(0.0, min(x + w, o[0] + o[2]) - max(x, o[0]))
                iy = max(0.0, min(y + h, o[1] + o[3]) - max(y, o[1]))
                occl_totals[kind + "VisibleAreaShareSum"] += 1.0 - (ix * iy) / (w * h)
            # Does the occluder lie over any kept positive's assigned cells?
            if o is not None:
                occl_totals[kind + "OccluderOverPositiveCells"] += int((under & pos_j).sum())

    return objs, coll, {d: {k: dict(v) for k, v in m.items()} for d, m in by.items()}, \
        {k: {kk: dict(vv) for kk, vv in v.items()} for k, v in occl.items()}, dict(occl_totals), per_sample_pos


def summarise_bucket(objs):
    out = {}
    for b in BUCKETS:
        o = [r for r in objs if r["bucket"] == b]
        arr = lambda k: np.array([r[k] for r in o], dtype=float)  # noqa: E731
        q = lambda v: {"min": float(v.min()), "p50": float(np.median(v)), "max": float(v.max()), "mean": float(v.mean())}  # noqa: E731
        fb = [r for r in o if r["fallback"]]
        out[b] = {
            "objects": len(o),
            "cssW": q(arr("cssW")), "cssH": q(arr("cssH")),
            "modelW": q(arr("modelW")), "modelH": q(arr("modelH")),
            "modelShorter": q(np.minimum(arr("modelW"), arr("modelH"))),
            "coveredCentres": q(arr("coveredCentres")),
            "coveredCentresHistogram": dict(sorted(Counter(min(int(r["coveredCentres"]), 9) for r in o).items())),
            "assignedPositiveCells": q(arr("owned")), "assignedCellsTotal": int(arr("owned").sum()),
            "noNaturallyCoveredCentre": len(fb),
            "nearestCellOnly": sum(1 for r in fb if r["claimed"] == 1),
            "fallbackMaxIoUAnyCell": q(np.array([r["maxIoUAnyCell"] for r in fb])) if fb else None,
            "fallbackMaxIoUAssignedCell": q(np.array([r["maxIoUAssigned"] for r in fb])) if fb else None,
            "fallbackAssignedBelow0.5": sum(1 for r in fb if r["maxIoUAssigned"] < 0.5),
            "fallbackAnyCellBelow0.5": sum(1 for r in fb if r["maxIoUAnyCell"] < 0.5),
            "fallbackAssignedNotTheBestCell": sum(1 for r in fb if r["maxIoUAssigned"] < r["maxIoUAnyCell"] - 1e-9),
        }
    return out


t0 = time.time()
g10 = G10Policy.from_files(CFG, EV)
root = candidate_root(".", 2)
result = {}
for name, loader in (("train", train_v2.load_train), ("dev", train_v2.load_dev)):
    ds = loader(root, g10)
    objs, coll, by, occl, occl_totals, psp = audit(name, ds, root)
    fb_by_class = Counter(r["cls"] for r in objs if r["fallback"])
    result[name] = {"collisions": coll, "byDimension": by, "buckets": summarise_bucket(objs),
                    "fallbackByClass": dict(fb_by_class),
                    "fallbackByViewport": dict(Counter(r["vp"] for r in objs if r["fallback"])),
                    "objectsByViewport": dict(Counter(r["vp"] for r in objs)),
                    "occlusion": occl, "occlusionTotals": occl_totals,
                    "positiveCellsPerSample": {"min": min(psp), "p50": float(np.median(psp)), "max": max(psp), "total": sum(psp)}}
result["seconds"] = round(time.time() - t0, 1)

# The ordering rule, tested on the real function with two nested boxes (no dataset involved).
big, small = (0.0, 0.0, 100.0, 100.0), (40.0, 40.0, 10.0, 10.0)
pos, bt, ct = assign_targets([big, small], [0, 3])
cell = int(np.flatnonzero((CCX >= 40) & (CCX <= 50) & (CCY >= 40) & (CCY <= 50))[0])
result["orderingProbe"] = {"bigClass": CLASSES[0], "smallClass": CLASSES[3], "sharedCellOwnerClass": CLASSES[int(np.argmax(ct[cell]))],
                           "commentSays": "the SMALL one keeps it", "smallKeepsIt": int(np.argmax(ct[cell])) == 3}
print(json.dumps(result, indent=1, default=lambda v: list(v) if isinstance(v, tuple) else v))
