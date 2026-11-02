"""
v2 data dry run (M22.7): load a v2 TRAIN/DEV candidate through the adapter and check that the
existing training input path accepts it. NO MODEL, NO WEIGHTS, NO OPTIMIZER STEP, NO PREDICTION.

    python tools/detector/dry_run_v2.py --candidate=<n> --g10-config=<thresholds.json> --g10-classes=<classes.json> --build-config=<config.json> [--tensors [--ignore-mask]]

  - TRAIN and DEV are loaded separately (`data_v2.load_split`): every frame's SHA-256 is checked,
    missing or unexpected frames are refused, and every annotation's class, box and bucket checked.
  - Positives are counted per class x size bucket; occlusion cases and other non-positives, and
    the G10 classes, are reported as exclusions. With PROVISIONAL G10 thresholds, nothing is excluded
    for G10 and no dataset acceptance is claimed.
  - TRAIN and DEV are checked to share no id, seed, spec hash or frame.
  - `--tensors` also runs every adapted sample through the UNCHANGED `data.sample_to_tensors` (the
    letterbox and target assignment the trainer uses) and checks the result: image shape, every
    target box inside the letterboxed content, and at least one positive cell per sample with a
    target. That builds input tensors only; no model is constructed.
  - `--ignore-mask` (with `--tensors`) builds every sample's partial-occlusion classification ignore
    mask (`occlusion_mask_v2`, M22.12) against its real class targets and totals it per class.

There is no TEST argument, path or fallback: the adapter reads TRAIN and DEV only. Only the numbered
candidate directory is read. Prints one JSON report; no path, no page text.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_v2 import AdapterError, G10Policy, acceptance, candidate_root, check_separation, load_split  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def tensor_check(root, data, ignore_mask=False):
    """
    Run the unchanged v1 input path over every adapted sample. No model is involved. With
    `ignore_mask`, also build each sample's partial-occlusion classification ignore mask
    (`occlusion_mask_v2`, M22.12) against its real `cls_t`, and total it.
    """
    from data import sample_to_tensors
    from head import CLASSES, INPUT_SIZE
    from targets import css_box_to_model, letterbox_params

    out = {"samples": 0, "targets": 0, "positiveCells": 0, "samplesWithTargetsButNoPositiveCell": 0, "boxesOutsideLetterbox": 0, "imageShape": None}
    if ignore_mask:
        from occlusion_mask_v2 import partial_occlusion_ignore_mask

        agg = {"ignoredEntries": 0, "ignoredByClass": {c: 0 for c in CLASSES}, "positiveConflicts": 0, "positiveConflictsByClass": {c: 0 for c in CLASSES},
               "ignoredOnCellsPositiveForAnotherClass": 0, "samplesWithIgnoredEntries": 0,
               "cases": {"partial": 0, "partialWithVisibleRegion": 0, "partialOutsideLetterbox": 0, "full": 0}}
        out["ignoreMask"] = agg
    for s in data["samples"]:
        x, pos, box_t, cls_t = sample_to_tensors(root, s)
        if ignore_mask:
            m = partial_occlusion_ignore_mask(s, cls_t)
            for k in ("ignoredEntries", "positiveConflicts", "ignoredOnCellsPositiveForAnotherClass"):
                agg[k] += m[k]
            for k in ("ignoredByClass", "positiveConflictsByClass", "cases"):
                for kk, v in m[k].items():
                    agg[k][kk] += v
            agg["samplesWithIgnoredEntries"] += m["ignoredEntries"] > 0
        out["imageShape"] = list(x.shape)
        if list(x.shape) != [3, INPUT_SIZE, INPUT_SIZE]:
            raise AdapterError(f"{s['id']}: input tensor shape {list(x.shape)}")
        scale, pad_x, pad_y = letterbox_params(s["captureSize"]["w"], s["captureSize"]["h"])
        css_to_cap = s["captureSize"]["w"] / s["viewportCss"]["w"]
        for a in s["annotations"]:
            bx = css_box_to_model(a["box"], css_to_cap, scale, pad_x, pad_y)
            if bx[0] < pad_x - 1e-6 or bx[1] < pad_y - 1e-6 or bx[0] + bx[2] > INPUT_SIZE - pad_x + 1e-6 or bx[1] + bx[3] > INPUT_SIZE - pad_y + 1e-6:
                out["boxesOutsideLetterbox"] += 1
        n_pos = int(pos.sum())
        out["samples"] += 1
        out["targets"] += len(s["annotations"])
        out["positiveCells"] += n_pos
        if s["annotations"] and n_pos == 0:
            out["samplesWithTargetsButNoPositiveCell"] += 1
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="v2 TRAIN/DEV data dry run: no model, no training, no prediction")
    ap.add_argument("--candidate", type=int, required=True)
    ap.add_argument("--g10-config", required=True)
    ap.add_argument("--g10-classes", required=True)
    ap.add_argument("--build-config", required=True, help="the candidate's build configuration, for the per-cell G4 minimums")
    ap.add_argument("--tensors", action="store_true", help="also run the unchanged v1 input path over every sample")
    ap.add_argument("--ignore-mask", action="store_true", help="with --tensors: also build and total the partial-occlusion ignore masks")
    args = ap.parse_args(argv)
    if args.ignore_mask and not args.tensors:
        raise AdapterError("--ignore-mask needs --tensors: the mask is built against each sample's real class targets")

    root = candidate_root(ROOT, args.candidate)
    if not os.path.isdir(root):
        raise AdapterError(f"candidate {args.candidate} does not exist")
    g10 = G10Policy.from_files(args.g10_config, args.g10_classes)
    with open(args.build_config, "r", encoding="utf-8") as f:
        minimum = json.load(f)["gate"]["minPerClassBucket"]

    train = load_split(root, "train", g10)
    dev = load_split(root, "dev", g10)
    check_separation(train, dev)
    report = {
        "run": "M22.7 v2 data dry run — no model, no weights, no optimizer step, no prediction; TRAIN and DEV only",
        "candidate": f"artifacts/datasets/{os.path.basename(root)}",
        "dataset": f"{train['name']}@{train['version']}",
        "g10": {"mode": g10.mode, "status": g10.status, "approval": g10.approval, "thresholds": g10.thresholds},
        "train": train["report"],
        "dev": dev["report"],
        "separation": "TRAIN and DEV share no id, seed, spec hash or frame",
        "minimumPerCell": minimum,
        "acceptance": acceptance(train, dev, g10, minimum),
    }
    if args.tensors:
        report["tensorCheck"] = {"train": tensor_check(root, train, args.ignore_mask), "dev": tensor_check(root, dev, args.ignore_mask)}
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AdapterError as e:
        print(f"REFUSING: {e}", file=sys.stderr)
        sys.exit(2)
