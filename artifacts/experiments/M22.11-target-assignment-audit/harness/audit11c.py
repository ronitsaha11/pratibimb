"""M22.11 (data only): partial-occlusion visible cells whose receptive field contains no occluder pixel.

Receptive field of head.UiHead (four 3x3 convs, strides 2,2,2,1, padding 1; 1x1 heads):
RF = 1 + 2*(1 + 2 + 4 + 8) = 31 px; output cell (r, c) is centred on input pixel index 8c (8r), so it sees
pixel indices [8c-15, 8c+15], i.e. the continuous span [8c-15, 8c+16). Zero padding at the canvas edge is
irrelevant here (all windows are tested against the occluder only)."""
import json, os, sys

sys.path.insert(0, os.path.abspath("tools/detector"))
src_path = os.path.join(os.path.dirname(__file__), "audit11.py")
src = open(src_path, encoding="utf-8").read().split("\nt0 = time.time()")[0]
ns = {"__file__": src_path}
exec(compile(src, src_path, "exec"), ns)
import numpy as np  # noqa: E402

G, S = ns["GRID"], ns["STRIDE"]
COL = ns["IDX"] % G
ROW = ns["IDX"] // G
WX0, WX1 = S * COL - 15.0, S * COL + 16.0
WY0, WY1 = S * ROW - 15.0, S * ROW + 16.0

g10 = ns["G10Policy"].from_files(ns["CFG"], ns["EV"])
root = ns["candidate_root"](".", 2)
out = {}
for name, loader in (("train", ns["train_v2"].load_train), ("dev", ns["train_v2"].load_dev)):
    ds = loader(root, g10)
    manifest = ns["data_v2"]._read_json(os.path.join(root, f"manifest-{name}.json"))
    assert manifest["hash"] == ds["hash"] == ns["BINDING"][name]
    raw = {s["id"]: s for s in manifest["samples"]}
    tot = {"visibleNegativeCells": 0, "rfFreeOfOccluder": 0, "rfFreeOfOccluderAndInsideControl": 0}
    by_bucket = {}
    for s in ds["samples"]:
        r = raw[s["id"]]
        occ = {o["id"]: (o.get("rendered") or o["box"]) for o in r["provenance"]["occluders"]}
        for a in r["annotations"]:
            if a.get("intent") != "occlusion-partial":
                continue
            mb, o = ns["to_model"](a["box"], s), ns["to_model"](occ[a["source"]["occluderId"]], s)
            if mb is None or o is None:
                continue
            x, y, w, h = mb
            CCX, CCY = ns["CCX"], ns["CCY"]
            inside = (CCX >= x) & (CCX <= x + w) & (CCY >= y) & (CCY <= y + h)
            under = (CCX >= o[0]) & (CCX <= o[0] + o[2]) & (CCY >= o[1]) & (CCY <= o[1] + o[3])
            vis = inside & ~under
            touches_occ = (WX0 < o[0] + o[2]) & (WX1 > o[0]) & (WY0 < o[1] + o[3]) & (WY1 > o[1])
            in_ctrl = (WX0 >= x) & (WX1 <= x + w) & (WY0 >= y) & (WY1 <= y + h)
            b = a["source"]["bucket"]
            d = by_bucket.setdefault(b, {"visibleNegativeCells": 0, "rfFreeOfOccluder": 0})
            tot["visibleNegativeCells"] += int(vis.sum()); d["visibleNegativeCells"] += int(vis.sum())
            tot["rfFreeOfOccluder"] += int((vis & ~touches_occ).sum()); d["rfFreeOfOccluder"] += int((vis & ~touches_occ).sum())
            tot["rfFreeOfOccluderAndInsideControl"] += int((vis & ~touches_occ & in_ctrl).sum())
    out[name] = {**tot, "byBucket": by_bucket}
print(json.dumps(out, indent=1))
