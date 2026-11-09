"""M22.11 follow-up (data only): fallback IoU-bound margins and the pairs sharing an 8x8 cell square."""
import json, os, sys
from collections import Counter
import importlib.util

sys.path.insert(0, os.path.abspath("tools/detector"))
spec = importlib.util.spec_from_file_location("a11", os.path.join(os.path.dirname(__file__), "audit11.py"))
src = open(spec.origin, encoding="utf-8").read().split("\nt0 = time.time()")[0]  # helpers only, no run
ns = {"__file__": spec.origin}
exec(compile(src, spec.origin, "exec"), ns)

import numpy as np  # noqa: E402
g10 = ns["G10Policy"].from_files(ns["CFG"], ns["EV"])
root = ns["candidate_root"](".", 2)
out = {}
for name, loader in (("train", ns["train_v2"].load_train), ("dev", ns["train_v2"].load_dev)):
    ds = loader(root, g10)
    bounds, pairs = [], []
    for s in ds["samples"]:
        bx, meta = [], []
        for a in s["annotations"]:
            mb = ns["to_model"](a["box"], s)
            if mb is None:
                continue
            vp = s["viewportCss"]
            bx.append(mb)
            meta.append((a["cls"], ns["bucket_of"](min(a["box"]["w"], a["box"]["h"]) * 640 / max(vp["w"], vp["h"]))))
        for b, m in zip(bx, meta):
            x, y, w, h = b
            if not ((ns["CCX"] >= x) & (ns["CCX"] <= x + w) & (ns["CCY"] >= y) & (ns["CCY"] <= y + h)).any():
                bounds.append(float(ns["iou_bound"](b).max()))
        touch = [ns["cells_touching"](b) for b in bx]
        for i in range(len(bx)):
            for j in range(i + 1, len(bx)):
                shared = touch[i] & touch[j]
                if shared:
                    a, b = bx[i], bx[j]
                    gap = max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]), b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]))
                    pos, _, cls_t = ns["assign_targets"](bx, [ns["CLASS_INDEX"][m[0]] for m in meta])
                    owners = Counter("pos" if pos[c] else "background" for c in shared)
                    pairs.append({"pair": sorted([f"{meta[i][0]}/{meta[i][1]}", f"{meta[j][0]}/{meta[j][1]}"]), "gapModelPx": round(gap, 3),
                                  "sharedCells": len(shared), "sharedCellsPositive": owners["pos"]})
    b = np.array(bounds)
    out[name] = {"fallbackObjects": len(b), "boundMin": float(b.min()),
                 "below": {t: int((b < t).sum()) for t in (0.5, 0.6, 0.7, 0.8, 0.9)},
                 "touchingPairs": pairs}
print(json.dumps(out, indent=1))
