"""
v2 TRAIN/DEV data adapter (M22.7): a v2 synthetic candidate -> the sample shape the existing loader
already turns into tensors. NO TRAINING HAPPENS HERE, and the v1 loader (`data.py`) and the trainer
(`train.py`) are unchanged: this module only reads, checks and adapts.

WHY A SEPARATE ADAPTER (M22.5 `adapter-design.md`). Pointed at the current loader, a v2 candidate
would fail (no `manifest.json`, no `captureSize`), and a naive patch would be worse: the v1 rule takes
every non-OFFSCREEN annotation as a target, so it would train on the intentional occlusion cases,
half of them fully hidden.

WHAT IT DOES, per split, TRAIN or DEV only (anything else is refused before any file is touched):
  - opens exactly `<root>/manifest-<split>.json`; checks its split, name and ids;
  - requires the split's frame folder to hold exactly the referenced frames (none missing, none
    extra), each frame's SHA-256 to match the manifest, and its decoded size to equal the recorded
    frame size and the CSS viewport (the build is DPR 1), from which `captureSize` is derived;
  - checks every annotation belongs to its sample, has one of the eight `head.CLASSES`, a finite
    box inside the viewport, and a size bucket that agrees with its rendered box;
  - keeps POSITIVES ONLY: `positive is True`, intent `positive`, validity `HIT_TESTABLE`. Intentional
    occlusion cases are never targets; they, and any other non-positive, are counted as exclusions.
    A positive flag on an occlusion case is an error, not an exclusion;
  - applies a G10 policy (below) and reports every exclusion separately.
Boxes stay in CSS viewport px, top-left origin: exactly the semantics `sample_to_tensors` converts.

G10 POLICY. G10 (the pixel-visibility diagnostic, `tools/dataset/v2/visibility.mjs`) has NO approved
thresholds. The adapter therefore REQUIRES a threshold configuration and the per-positive classes
computed from it (`audit-candidate.mjs --g10-out`), and records the configuration's approval status:
  - the classes must have been computed with exactly the configuration's thresholds, against this
    candidate's manifests (their hashes), and must cover every positive (a hash of the ids);
  - APPROVED (`approval.approved` true, with `approvedBy` and `approvedOn`): INVISIBLE and BORDERLINE
    positives are excluded, and counted separately;
  - PROVISIONAL (anything else): nothing is excluded for G10; what WOULD be excluded is reported as
    a diagnostic, and the report says no dataset acceptance is claimed.
"""

import hashlib
import json
import math
import os
import re

from PIL import Image

from head import CLASSES, INPUT_SIZE

SPLITS = ("train", "dev")
DATASET_NAME = "t1-ui-synthetic"
CANDIDATE_PREFIX = "t1-ui-synthetic-2.1.0-draft-candidate-"
G10_THRESHOLD_KEYS = ("salienceInvisibleBelow", "salienceVisibleAtLeast", "coverageContrast", "coverageInvisibleBelow", "coverageVisibleAtLeast")
G10_NON_VISIBLE = ("BORDERLINE", "INVISIBLE")
# The M22 size buckets: shorter side in model px (CSS px x 640 / max(viewport w, h)).
BUCKETS = (("very-small", 0.0, 8.0), ("small", 8.0, 16.0), ("medium", 16.0, 32.0), ("large", 32.0, math.inf))
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}


class AdapterError(Exception):
    """A candidate, a configuration or a request the adapter refuses. Never a partial result."""


def require_split(split):
    """TRAIN or DEV only. Refused before any path is built or any file is touched."""
    if split not in SPLITS:
        raise AdapterError(f"the v2 adapter reads {' and '.join(SPLITS)} only; refused {split!r} before any file access")


def candidate_root(repo_root, n):
    """The one place a numbered candidate lives. Nothing else under artifacts/datasets is named."""
    if not isinstance(n, int) or isinstance(n, bool) or n < 1:
        raise AdapterError(f"candidate number must be a positive integer, got {n!r}")
    return os.path.join(repo_root, "artifacts", "datasets", f"{CANDIDATE_PREFIX}{n}")


def bucket_of(shorter_model_px):
    for name, lo, hi in BUCKETS:
        if lo <= shorter_model_px < hi:
            return name
    raise AdapterError(f"no size bucket for {shorter_model_px} model px")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── G10 policy ────────────────────────────────────────────────────────────────────────────────


class G10Policy:
    """A G10 threshold configuration plus the per-positive classes computed from it."""

    def __init__(self, config, classes):
        thresholds = config.get("thresholds")
        if not isinstance(thresholds, dict) or any(not isinstance(thresholds.get(k), (int, float)) for k in G10_THRESHOLD_KEYS):
            raise AdapterError(f"G10 configuration must state every threshold: {', '.join(G10_THRESHOLD_KEYS)} (no default is invented)")
        approval = config.get("approval")
        if not isinstance(approval, dict) or not isinstance(approval.get("approved"), bool):
            raise AdapterError("G10 configuration must record its approval status: approval.approved true or false")
        if approval["approved"] and not (_nonempty(approval.get("approvedBy")) and _nonempty(approval.get("approvedOn"))):
            raise AdapterError("an approved G10 configuration must name approval.approvedBy and approval.approvedOn")
        if classes.get("thresholds") != thresholds:
            raise AdapterError("the G10 classes were computed with other thresholds than this configuration states")
        self.thresholds = dict(thresholds)
        self.approved = approval["approved"]
        self.approval = dict(approval)
        self.status = config.get("status")
        self.classes = classes

    @classmethod
    def from_files(cls, config_path, classes_path):
        if not config_path or not classes_path:
            raise AdapterError("a G10 threshold configuration and the G10 classes computed from it are both required")
        return cls(_read_json(config_path), _read_json(classes_path))

    @property
    def mode(self):
        return "APPROVED" if self.approved else "PROVISIONAL"

    def split_classes(self, split, manifest_hash, positive_ids):
        """The non-VISIBLE classes of one split, after proving they belong to this build and cover every positive."""
        if (self.classes.get("manifestHashes") or {}).get(split) != manifest_hash:
            raise AdapterError(f"the G10 classes were computed for another {split} manifest (hash mismatch)")
        entry = (self.classes.get("splits") or {}).get(split)
        if not entry:
            raise AdapterError(f"the G10 classes hold no {split} entry")
        ids_hash = hashlib.sha256("\n".join(sorted(positive_ids)).encode("utf-8")).hexdigest()
        if entry.get("positivesClassified") != len(positive_ids) or entry.get("positiveIdsSha256") != ids_hash:
            raise AdapterError(f"the G10 classes do not cover exactly the {split} positives")
        non_visible = entry.get("nonVisible") or {}
        bad = {k: v for k, v in non_visible.items() if v not in G10_NON_VISIBLE or k not in set(positive_ids)}
        if bad:
            raise AdapterError(f"the G10 classes hold unknown categories or ids: {sorted(bad)[:5]}")
        return non_visible


def _nonempty(v):
    return isinstance(v, str) and v.strip() != ""


# ── one split ─────────────────────────────────────────────────────────────────────────────────


def _empty_cells():
    return {c: {b[0]: 0 for b in BUCKETS} for c in CLASSES}


def load_split(root, split, g10, verify_frames=True):
    """
    Load and check one split. Returns a dict: `name`, `version`, `split`, `hash`, `samples` (adapted,
    ready for `data.sample_to_tensors`), and `report`. Raises AdapterError on anything inconsistent.
    """
    require_split(split)
    if not isinstance(g10, G10Policy):
        raise AdapterError("a G10 policy is required (G10Policy.from_files); there is no default")
    manifest = _read_json(os.path.join(root, f"manifest-{split}.json"))
    if manifest.get("split") != split:
        raise AdapterError(f"manifest-{split}.json declares split {manifest.get('split')!r}")
    if manifest.get("name") != DATASET_NAME:
        raise AdapterError(f"manifest-{split}.json is not a {DATASET_NAME} manifest")
    samples = manifest.get("samples") or []
    ids = [s.get("id") for s in samples]
    if len(set(ids)) != len(ids):
        raise AdapterError(f"{split}: duplicate sample ids")
    id_re = re.compile(rf"^{split}-\d{{5}}$")
    frames_dir = f"frames-{split}"
    referenced = set()
    for s in samples:
        if s.get("split") != split or not id_re.match(s.get("id") or ""):
            raise AdapterError(f"{split}: sample {s.get('id')!r} does not belong to this split")
        if s.get("framePath") != f"{frames_dir}/{s['id']}.png":
            raise AdapterError(f"{s['id']}: frame path {s.get('framePath')!r} is not its own frame in {frames_dir}/")
        referenced.add(s["id"] + ".png")
    on_disk = set(os.listdir(os.path.join(root, frames_dir)))
    missing = sorted(referenced - on_disk)
    unexpected = sorted(on_disk - referenced)
    if missing or unexpected:
        raise AdapterError(f"{split}: frames missing {missing[:5]} ({len(missing)}), unexpected {unexpected[:5]} ({len(unexpected)})")

    # Every annotation belongs to its sample, once — checked before anything is matched by id.
    all_ids = set()
    for s in samples:
        for a in s.get("annotations", []):
            aid = a.get("id") or ""
            if not aid.startswith(s["id"] + "-e") or aid in all_ids:
                raise AdapterError(f"{s['id']}: annotation {aid!r} does not belong to this sample, or repeats")
            all_ids.add(aid)

    # The audit classifies every annotation intended as a positive; the same set is hashed here.
    positive_ids = [a["id"] for s in samples for a in s.get("annotations", []) if a.get("intent") == "positive"]
    non_visible = g10.split_classes(split, manifest.get("hash"), positive_ids)

    kept = _empty_cells()
    excluded = {"occlusion-partial": 0, "occlusion-full": 0, "not-positive": 0, "g10-borderline": 0, "g10-invisible": 0}
    g10_diagnostic = {"BORDERLINE": 0, "INVISIBLE": 0}
    ranges = {"minX": math.inf, "minY": math.inf, "maxRight": -math.inf, "maxBottom": -math.inf}
    adapted = []
    frames_verified = 0
    for s in samples:
        vp = s.get("viewportCss") or {}
        frame = s.get("frame") or {}
        if not (frame.get("w") == vp.get("w") and frame.get("h") == vp.get("h")):
            raise AdapterError(f"{s['id']}: frame {frame.get('w')}x{frame.get('h')} is not the viewport {vp.get('w')}x{vp.get('h')} (the build is DPR 1)")
        if verify_frames:
            path = os.path.join(root, frames_dir, s["id"] + ".png")
            if sha256_file(path) != frame.get("sha256"):
                raise AdapterError(f"{s['id']}: frame SHA-256 does not match the manifest")
            with Image.open(path) as img:
                if img.size != (frame["w"], frame["h"]):
                    raise AdapterError(f"{s['id']}: frame decodes to {img.size[0]}x{img.size[1]}, manifest says {frame['w']}x{frame['h']}")
            frames_verified += 1
        scale = INPUT_SIZE / max(vp["w"], vp["h"])
        keep = []
        for a in s.get("annotations", []):
            aid = a["id"]  # association checked above
            cls = a.get("cls")
            if cls not in CLASS_INDEX:
                raise AdapterError(f"{aid}: class {cls!r} is not one of {CLASSES}")
            b = a.get("box") or {}
            if not all(isinstance(b.get(k), (int, float)) and math.isfinite(b[k]) for k in ("x", "y", "w", "h")) or b["w"] <= 0 or b["h"] <= 0:
                raise AdapterError(f"{aid}: degenerate box {b}")
            bucket = (a.get("source") or {}).get("bucket")
            if bucket_of(min(b["w"], b["h"]) * scale) != bucket:
                raise AdapterError(f"{aid}: rendered box is not in its declared bucket {bucket!r}")
            intent = a.get("intent")
            if intent != "positive":
                if a.get("positive") is not False:
                    raise AdapterError(f"{aid}: an {intent!r} annotation is flagged as a positive")
                excluded[intent if intent in ("occlusion-partial", "occlusion-full") else "not-positive"] += 1
                continue
            if a.get("positive") is not True or a.get("validity") != "HIT_TESTABLE":
                excluded["not-positive"] += 1
                continue
            inside = b["x"] >= 0 and b["y"] >= 0 and b["x"] + b["w"] <= vp["w"] and b["y"] + b["h"] <= vp["h"]
            if not inside:
                raise AdapterError(f"{aid}: a positive box leaves the viewport")
            category = non_visible.get(aid)
            if category:
                g10_diagnostic[category] += 1
                if g10.approved:
                    excluded["g10-" + category.lower()] += 1
                    continue
            ranges["minX"] = min(ranges["minX"], b["x"])
            ranges["minY"] = min(ranges["minY"], b["y"])
            ranges["maxRight"] = max(ranges["maxRight"], b["x"] + b["w"])
            ranges["maxBottom"] = max(ranges["maxBottom"], b["y"] + b["h"])
            kept[cls][bucket] += 1
            keep.append({"cls": cls, "box": {"x": b["x"], "y": b["y"], "w": b["w"], "h": b["h"]}, "visibility": a.get("visibility"), "id": aid})
        adapted.append({
            "id": s["id"],
            "split": split,
            "framePath": s["framePath"],
            "viewportCss": {"w": vp["w"], "h": vp["h"]},
            # Derived from the frame itself (verified above), never assumed.
            "captureSize": {"w": frame["w"], "h": frame["h"]},
            "annotations": keep,
            "provenance": {"seed": s.get("seed"), "specHash": s.get("specHash"), "frameSha256": frame.get("sha256"), "htmlSha256": s.get("htmlSha256")},
        })

    ranges = {k: (None if math.isinf(v) else v) for k, v in ranges.items()}  # None when no positive was kept
    report = {
        "split": split,
        "manifestHash": manifest.get("hash"),
        "renderRevision": (manifest.get("meta") or {}).get("renderRevision"),
        "samples": len(adapted),
        "framesVerified": frames_verified,
        "framesMissing": 0,
        "framesUnexpected": 0,
        "positivesKept": sum(sum(v.values()) for v in kept.values()),
        "positivesKeptByClassAndBucket": kept,
        "excluded": excluded,
        "g10": {
            "mode": g10.mode,
            "status": g10.status,
            "nonVisibleFound": g10_diagnostic,
            "excludedForG10": g10.approved,
            "note": None if g10.approved else "PROVISIONAL thresholds: non-visible positives are reported, not excluded; no dataset acceptance is claimed",
        },
        "boxRangeCss": ranges,
    }
    return {"name": manifest["name"], "version": manifest.get("version"), "split": split, "hash": manifest.get("hash"), "samples": adapted, "report": report}


def check_separation(train, dev):
    """TRAIN and DEV share no sample id, seed, spec hash or frame."""
    if train["split"] != "train" or dev["split"] != "dev":
        raise AdapterError("check_separation takes the TRAIN split, then the DEV split")
    for key in ("id", "seed", "specHash", "frameSha256"):
        get = (lambda s: s[key]) if key == "id" else (lambda s: s["provenance"][key])
        shared = {get(s) for s in train["samples"]} & {get(s) for s in dev["samples"]}
        if shared:
            raise AdapterError(f"TRAIN and DEV share {len(shared)} {key} value(s)")
    return True


def acceptance(train, dev, g10, minimum):
    """
    Whether this candidate may be called an accepted training dataset. Never with provisional G10
    thresholds. With approved ones, only if every class x bucket cell keeps at least its minimum.
    """
    if not g10.approved:
        return {"claimed": False, "reason": "G10 thresholds are not approved: results are diagnostic, and no dataset acceptance is claimed"}
    short = []
    for split, data in (("train", train), ("dev", dev)):
        need = minimum[split]
        for cls, row in data["report"]["positivesKeptByClassAndBucket"].items():
            for bucket, n in row.items():
                if n < need:
                    short.append(f"{split}/{cls}/{bucket}: {n} < {need}")
    if short:
        return {"claimed": False, "reason": "cells below their minimum after G10 exclusions", "short": short}
    return {"claimed": True, "reason": "G10-approved visible positives meet every cell minimum (still subject to the owner's acceptance of the candidate)"}


class V2SplitDataset:
    """
    The same interface as `data.SplitDataset` (`name`, `version`, `hash`, `samples`, `len`, `[i]`), over
    an adapted v2 split. `[i]` uses the UNCHANGED `data.sample_to_tensors`, so letterboxing, the
    CSS -> capture -> model conversion and target assignment are the v1 path exactly.
    """

    def __init__(self, root, split, g10, limit=None):
        loaded = load_split(root, split, g10)
        self.root = root
        self.name = loaded["name"]
        self.version = loaded["version"]
        self.hash = loaded["hash"]
        self.report = loaded["report"]
        self.samples = loaded["samples"] if limit is None else loaded["samples"][:limit]

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        from data import sample_to_tensors  # the v1 path, unchanged

        return sample_to_tensors(self.root, self.samples[i])
