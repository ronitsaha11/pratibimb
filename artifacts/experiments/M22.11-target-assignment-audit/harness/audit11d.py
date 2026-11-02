"""M22.11 (data only): samples holding a partial-occlusion case, and the cosine LR schedule in closed form.

No model, no optimizer, no scheduler object, no TEST. Candidate 2 through the approved adapter; the
excluded annotations through the adapter's own reader on the same, hash-bound manifest."""
import json, math, os, sys

sys.path.insert(0, os.path.abspath("tools/detector"))
import data_v2  # noqa: E402
import train_v2  # noqa: E402
from data_v2 import G10Policy, candidate_root  # noqa: E402

g = G10Policy.from_files("tools/dataset/v2/configs/g10-approved-candidate-2.json",
                         "artifacts/experiments/M22.9-training-pipeline/logs/w1-candidate-2-g10-evidence-approved.json")
root = candidate_root(".", 2)
out = {"samplesWithPartialCase": {}}
for name, ld in (("train", train_v2.load_train), ("dev", train_v2.load_dev)):
    ds = ld(root, g)
    m = data_v2._read_json(os.path.join(root, f"manifest-{name}.json"))
    assert m["hash"] == ds["hash"]
    kept = {s["id"]: len(s["annotations"]) for s in ds["samples"]}
    withp = [s["id"] for s in m["samples"] if any(a.get("intent") == "occlusion-partial" for a in s["annotations"])]
    out["samplesWithPartialCase"][name] = {"samples": len(withp), "of": len(kept), "keptPositivesInThem": sum(kept[i] for i in withp), "keptPositives": sum(kept.values())}
T, lr = 6000, 3e-3
f = lambda t: 0.5 * lr * (1 + math.cos(math.pi * t / T))  # noqa: E731
out["cosineClosedForm"] = {
    "what": "lr applied at 0-based optimizer step t = 0.5*lr0*(1+cos(pi*t/T)), lr0 3e-3, T 6000 (CosineAnnealingLR closed form, eta_min 0)",
    "firstStepOfEpoch": {str(e): f(150 * (e - 1)) for e in (1, 6, 11, 16, 21, 26, 31, 36, 40)},
    "lastStep5999": f(5999), "sumOverRun": round(sum(f(t) for t in range(T)), 6),
}
print(json.dumps(out, indent=1))
