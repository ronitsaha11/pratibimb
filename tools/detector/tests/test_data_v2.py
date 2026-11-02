"""
M22.7 — the v2 TRAIN/DEV data adapter, on SMALL SYNTHETIC CANDIDATES written to a temp directory.
No real candidate, no dataset folder and no model is touched; nothing is trained.

    python -m pytest tools/detector/tests -q
"""

import copy
import hashlib
import json
import os
import sys

import pytest
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from data_v2 import (  # noqa: E402
    AdapterError,
    G10Policy,
    V2SplitDataset,
    acceptance,
    candidate_root,
    check_separation,
    load_split,
    require_split,
)
from head import CLASSES  # noqa: E402

VW, VH = 320, 200  # scale = 640 / 320 = 2 model px per CSS px
THRESHOLDS = {"salienceInvisibleBelow": 1.25, "salienceVisibleAtLeast": 1.5, "coverageContrast": 1.25, "coverageInvisibleBelow": 0.005, "coverageVisibleAtLeast": 0.01}
# shorter side (CSS px) -> bucket at scale 2: 3 -> 6 very-small, 5 -> 10 small, 10 -> 20 medium, 20 -> 40 large
SIZES = {"very-small": 3, "small": 5, "medium": 10, "large": 20}


def _ann(sid, k, cls, bucket, x, y, intent="positive"):
    s = SIZES[bucket]
    box = {"x": x, "y": y, "w": s * 2, "h": s}
    positive = intent == "positive"
    validity = {"positive": "HIT_TESTABLE", "occlusion-partial": "PARTIALLY_OCCLUDED", "occlusion-full": "FULLY_OCCLUDED"}[intent]
    return {"id": f"{sid}-e{k:03d}", "cls": cls, "box": box, "visibility": "VISIBLE", "validity": validity, "intent": intent, "positive": positive, "source": {"bucket": bucket, "declared": dict(box)}}


def _sample(split, i):
    sid = f"{split}-{i:05d}"
    anns = [
        _ann(sid, 0, CLASSES[i % 8], "very-small", 10, 10),
        _ann(sid, 1, CLASSES[(i + 1) % 8], "small", 60, 10),
        _ann(sid, 2, CLASSES[(i + 2) % 8], "medium", 120, 10),
        _ann(sid, 3, CLASSES[(i + 3) % 8], "large", 10, 60),
        _ann(sid, 4, "button", "medium", 120, 60, "occlusion-partial"),
        _ann(sid, 5, "tab", "medium", 200, 60, "occlusion-full"),
    ]
    return {"id": sid, "split": split, "seed": hashlib.sha256(sid.encode()).hexdigest(), "viewportCss": {"w": VW, "h": VH}, "annotations": anns, "specHash": "s" + sid, "framePath": f"frames-{split}/{sid}.png", "htmlSha256": "h" + sid, "frame": {"w": VW, "h": VH}}


def write_candidate(root, n_train=3, n_dev=2):
    """A tiny v2 candidate: manifests, frames, and G10 configuration + classes (provisional)."""
    os.makedirs(root, exist_ok=True)
    classes = {"thresholds": dict(THRESHOLDS), "manifestHashes": {}, "splits": {}}
    for split, n in (("train", n_train), ("dev", n_dev)):
        os.makedirs(os.path.join(root, f"frames-{split}"), exist_ok=True)
        samples = []
        for i in range(n):
            s = _sample(split, i)
            path = os.path.join(root, s["framePath"])
            Image.new("RGB", (VW, VH), (255, 255 - 10 * i, 255 if split == "train" else 200)).save(path)  # every frame distinct
            with open(path, "rb") as f:
                s["frame"]["sha256"] = hashlib.sha256(f.read()).hexdigest()
            samples.append(s)
        manifest = {"name": "t1-ui-synthetic", "version": "2.1.0-draft", "split": split, "meta": {"renderRevision": "r2-test"}, "samples": samples, "hash": f"manifest-hash-{split}"}
        write_json(os.path.join(root, f"manifest-{split}.json"), manifest)
        ids = sorted(a["id"] for s in samples for a in s["annotations"] if a["intent"] == "positive")
        classes["manifestHashes"][split] = manifest["hash"]
        classes["splits"][split] = {"positivesClassified": len(ids), "positiveIdsSha256": hashlib.sha256("\n".join(ids).encode()).hexdigest(), "nonVisible": {}}
    write_json(os.path.join(root, "g10-classes.json"), classes)
    write_json(os.path.join(root, "g10-config.json"), {"status": "PROVISIONAL", "approval": {"approved": False, "approvedBy": None, "approvedOn": None}, "thresholds": dict(THRESHOLDS)})
    return root


def write_json(path, v):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(v, f)


def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def policy(root):
    return G10Policy.from_files(os.path.join(root, "g10-config.json"), os.path.join(root, "g10-classes.json"))


def edit(root, name, fn):
    v = read_json(os.path.join(root, name))
    fn(v)
    write_json(os.path.join(root, name), v)


@pytest.fixture()
def cand(tmp_path):
    return write_candidate(str(tmp_path / "cand"))


# ── loading and accounting ─────────────────────────────────────────────────────────────────────


def test_train_and_dev_load_independently_with_counts_per_class_and_bucket(cand):
    g10 = policy(cand)
    train = load_split(cand, "train", g10)
    dev = load_split(cand, "dev", g10)
    assert (train["report"]["samples"], dev["report"]["samples"]) == (3, 2)
    assert (train["report"]["framesVerified"], dev["report"]["framesVerified"]) == (3, 2)
    assert train["report"]["positivesKept"] == 12 and dev["report"]["positivesKept"] == 8
    kept = train["report"]["positivesKeptByClassAndBucket"]
    assert set(kept) == set(CLASSES) and all(set(row) == {"very-small", "small", "medium", "large"} for row in kept.values())
    assert sum(row["very-small"] for row in kept.values()) == 3  # one very-small positive per sample
    assert kept[CLASSES[0]]["very-small"] == 1 and kept[CLASSES[1]]["small"] == 1


def test_occlusion_cases_are_excluded_and_counted_never_targets(cand):
    train = load_split(cand, "train", policy(cand))
    assert train["report"]["excluded"]["occlusion-partial"] == 3 and train["report"]["excluded"]["occlusion-full"] == 3
    for s in train["samples"]:
        assert len(s["annotations"]) == 4
        assert all(a["id"].endswith(("e000", "e001", "e002", "e003")) for a in s["annotations"])


def test_capture_size_comes_from_the_frame_and_provenance_is_kept(cand):
    s = load_split(cand, "train", policy(cand))["samples"][0]
    assert s["captureSize"] == {"w": VW, "h": VH}
    assert s["provenance"]["specHash"] == "strain-00000" and len(s["provenance"]["frameSha256"]) == 64
    # Box semantics are unchanged: CSS px, top-left origin, the manifest's own values.
    assert s["annotations"][0]["box"] == {"x": 10, "y": 10, "w": 6, "h": 3}


def test_an_adapted_sample_goes_through_the_unchanged_v1_input_path(cand):
    ds = V2SplitDataset(cand, "train", policy(cand))
    x, pos, box_t, cls_t = ds[0]
    assert list(x.shape) == [3, 640, 640]
    assert int(pos.sum()) >= 4  # every target gets at least one positive cell
    assert len(ds) == 3 and ds.hash == "manifest-hash-train"


# ── refusals: splits ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("split", ["test", "holdout", "", "TRAIN"])
def test_any_split_but_train_or_dev_is_refused_before_file_access(split, tmp_path):
    missing_root = str(tmp_path / "does-not-exist")
    with pytest.raises(AdapterError, match="refused"):
        require_split(split)
    with pytest.raises(AdapterError, match="refused"):
        load_split(missing_root, split, None)


def test_a_sample_of_another_split_is_refused(cand):
    edit(cand, "manifest-dev.json", lambda m: m["samples"][0].update(split="train"))
    with pytest.raises(AdapterError, match="does not belong"):
        load_split(cand, "dev", policy(cand))


def test_train_and_dev_sharing_a_seed_or_frame_is_refused(cand):
    g10 = policy(cand)
    train = load_split(cand, "train", g10)
    dev = load_split(cand, "dev", g10)
    assert check_separation(train, dev)
    dev2 = copy.deepcopy(dev)
    dev2["samples"][0]["provenance"]["seed"] = train["samples"][0]["provenance"]["seed"]
    with pytest.raises(AdapterError, match="share 1 seed"):
        check_separation(train, dev2)


# ── refusals: frames ──────────────────────────────────────────────────────────────────────────


def test_a_frame_whose_hash_differs_is_refused(cand):
    Image.new("RGB", (VW, VH), (0, 0, 0)).save(os.path.join(cand, "frames-train", "train-00001.png"))
    with pytest.raises(AdapterError, match="SHA-256"):
        load_split(cand, "train", policy(cand))


def test_a_missing_or_unexpected_frame_is_refused(cand):
    os.remove(os.path.join(cand, "frames-dev", "dev-00001.png"))
    with pytest.raises(AdapterError, match="missing"):
        load_split(cand, "dev", policy(cand))
    cand2 = write_candidate(cand + "-2")
    Image.new("RGB", (4, 4)).save(os.path.join(cand2, "frames-train", "stray.png"))
    with pytest.raises(AdapterError, match="unexpected"):
        load_split(cand2, "train", policy(cand2))


def test_a_frame_of_the_wrong_size_is_refused(cand):
    path = os.path.join(cand, "frames-train", "train-00000.png")
    Image.new("RGB", (VW, VH - 1)).save(path)
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    edit(cand, "manifest-train.json", lambda m: m["samples"][0]["frame"].update(sha256=digest))
    with pytest.raises(AdapterError, match="decodes to"):
        load_split(cand, "train", policy(cand))


def test_a_frame_path_outside_the_split_folder_is_refused(cand):
    edit(cand, "manifest-train.json", lambda m: m["samples"][0].update(framePath="frames-dev/dev-00000.png"))
    with pytest.raises(AdapterError, match="not its own frame"):
        load_split(cand, "train", policy(cand))


# ── refusals: annotations ─────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda a: a.update(id="train-00009-e000"), "does not belong"),
        (lambda a: a.update(cls="slider"), "is not one of"),
        (lambda a: a["box"].update(x=-1), "leaves the viewport"),
        (lambda a: a["box"].update(w=0), "degenerate"),
        (lambda a: a["source"].update(bucket="large"), "declared bucket"),
    ],
)
def test_an_inconsistent_annotation_is_refused(cand, spoil, message):
    edit(cand, "manifest-train.json", lambda m: spoil(m["samples"][0]["annotations"][0]))
    with pytest.raises(AdapterError, match=message):
        load_split(cand, "train", policy(cand))


def test_an_occlusion_case_flagged_positive_is_an_error_not_a_target(cand):
    edit(cand, "manifest-train.json", lambda m: m["samples"][0]["annotations"][5].update(positive=True))
    with pytest.raises(AdapterError, match="flagged as a positive"):
        load_split(cand, "train", policy(cand))


# ── G10 policy ────────────────────────────────────────────────────────────────────────────────


def test_g10_configuration_and_classes_are_required(cand):
    with pytest.raises(AdapterError, match="both required"):
        G10Policy.from_files(None, os.path.join(cand, "g10-classes.json"))
    with pytest.raises(AdapterError, match="G10 policy is required"):
        load_split(cand, "train", None)


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda c: c.pop("approval"), "approval status"),
        (lambda c: c["approval"].update(approved="yes"), "approval status"),
        (lambda c: c["approval"].update(approved=True), "approvedBy"),
        (lambda c: c["thresholds"].pop("coverageContrast"), "must state every threshold"),
        (lambda c: c["thresholds"].update(salienceVisibleAtLeast=1.6), "other thresholds"),
    ],
)
def test_an_incomplete_or_mismatched_g10_configuration_is_refused(cand, spoil, message):
    edit(cand, "g10-config.json", spoil)
    with pytest.raises(AdapterError, match=message):
        policy(cand)


def test_g10_classes_for_another_build_or_not_covering_every_positive_are_refused(cand):
    edit(cand, "g10-classes.json", lambda c: c["manifestHashes"].update(train="another"))
    with pytest.raises(AdapterError, match="another train manifest"):
        load_split(cand, "train", policy(cand))
    cand2 = write_candidate(cand + "-2")
    edit(cand2, "g10-classes.json", lambda c: c["splits"]["dev"].update(positivesClassified=7))
    with pytest.raises(AdapterError, match="do not cover exactly"):
        load_split(cand2, "dev", policy(cand2))


def test_provisional_g10_reports_but_does_not_exclude_and_claims_no_acceptance(cand):
    edit(cand, "g10-classes.json", lambda c: c["splits"]["train"].update(nonVisible={"train-00000-e000": "INVISIBLE", "train-00001-e001": "BORDERLINE"}))
    g10 = policy(cand)
    train = load_split(cand, "train", g10)
    dev = load_split(cand, "dev", g10)
    r = train["report"]
    assert r["g10"]["mode"] == "PROVISIONAL" and r["g10"]["nonVisibleFound"] == {"INVISIBLE": 1, "BORDERLINE": 1}
    assert r["excluded"]["g10-invisible"] == 0 and r["positivesKept"] == 12
    a = acceptance(train, dev, g10, {"train": 1, "dev": 1})
    assert a["claimed"] is False and "not approved" in a["reason"]


def test_approved_g10_excludes_invisible_and_borderline_separately(cand):
    edit(cand, "g10-classes.json", lambda c: c["splits"]["train"].update(nonVisible={"train-00000-e000": "INVISIBLE", "train-00001-e001": "BORDERLINE"}))
    edit(cand, "g10-config.json", lambda c: c["approval"].update(approved=True, approvedBy="fixture owner", approvedOn="2026-11-02"))
    g10 = policy(cand)
    train = load_split(cand, "train", g10)
    dev = load_split(cand, "dev", g10)
    r = train["report"]
    assert r["g10"]["mode"] == "APPROVED"
    assert r["excluded"]["g10-invisible"] == 1 and r["excluded"]["g10-borderline"] == 1 and r["positivesKept"] == 10
    assert all(a["id"] not in ("train-00000-e000", "train-00001-e001") for s in train["samples"] for a in s["annotations"])
    # Acceptance needs every cell at its minimum after exclusions: the fixture's cells hold 0 or 1.
    assert acceptance(train, dev, g10, {"train": 1, "dev": 1})["claimed"] is False


def test_the_candidate_root_names_only_a_numbered_candidate(tmp_path):
    assert candidate_root(str(tmp_path), 2).replace("\\", "/").endswith("artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-2")
    for bad in (0, -1, "2", 1.5, True):
        with pytest.raises(AdapterError):
            candidate_root(str(tmp_path), bad)


# ── M22.8 regression additions ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("only, other", [("train", "dev"), ("dev", "train")])
def test_each_split_loads_without_the_other_splits_files(cand, only, other):
    import shutil

    os.remove(os.path.join(cand, f"manifest-{other}.json"))
    shutil.rmtree(os.path.join(cand, f"frames-{other}"))
    loaded = load_split(cand, only, policy(cand))
    assert loaded["split"] == only and all(s["split"] == only for s in loaded["samples"])


@pytest.mark.parametrize("split", ["test", "holdout"])
def test_a_refused_split_touches_no_file_at_all(cand, monkeypatch, split):
    import builtins

    g10 = policy(cand)  # built before the trap: the policy itself is not under test here

    def trap(*a, **k):
        raise AssertionError("the filesystem was touched for a refused split")

    monkeypatch.setattr(builtins, "open", trap)
    monkeypatch.setattr(os, "listdir", trap)
    monkeypatch.setattr(os.path, "join", trap)
    with pytest.raises(AdapterError, match="refused"):
        load_split(cand, split, g10)


@pytest.mark.parametrize("key", ["id", "seed", "specHash", "frameSha256"])
def test_train_and_dev_sharing_any_identity_is_refused(cand, key):
    g10 = policy(cand)
    train = load_split(cand, "train", g10)
    dev = copy.deepcopy(load_split(cand, "dev", g10))
    if key == "id":
        dev["samples"][0]["id"] = train["samples"][0]["id"]
    else:
        dev["samples"][0]["provenance"][key] = train["samples"][0]["provenance"][key]
    with pytest.raises(AdapterError, match=f"share 1 {key}"):
        check_separation(train, dev)
    with pytest.raises(AdapterError, match="TRAIN split, then the DEV split"):
        check_separation(dev, train)


def test_the_class_mapping_is_the_trainers_eight_classes_in_order():
    import data_v2
    import targets

    expected = ["button", "link", "textbox", "checkbox", "radio", "select", "tab", "icon"]
    assert list(CLASSES) == expected  # head.CLASSES, which is also the v2 generator's order
    assert data_v2.CLASS_INDEX == {c: i for i, c in enumerate(expected)} == targets.CLASS_INDEX


def test_size_bucket_edges_match_the_m22_buckets():
    from data_v2 import bucket_of

    assert [bucket_of(v) for v in (0.0, 7.999, 8.0, 15.999, 16.0, 31.999, 32.0, 500.0)] == [
        "very-small", "very-small", "small", "small", "medium", "medium", "large", "large",
    ]
    with pytest.raises(AdapterError):
        bucket_of(-1.0)


def test_g10_classes_bound_to_the_dev_manifest_too(cand):
    edit(cand, "g10-classes.json", lambda c: c["manifestHashes"].update(dev="another"))
    g10 = policy(cand)
    load_split(cand, "train", g10)  # TRAIN's binding is intact
    with pytest.raises(AdapterError, match="another dev manifest"):
        load_split(cand, "dev", g10)


def test_g10_classes_naming_an_unknown_category_or_id_are_refused(cand):
    edit(cand, "g10-classes.json", lambda c: c["splits"]["train"].update(nonVisible={"train-00000-e000": "FAINT"}))
    with pytest.raises(AdapterError, match="unknown categories or ids"):
        load_split(cand, "train", policy(cand))


def test_every_split_converts_to_tensors_with_targets_inside_the_letterbox(cand):
    import dry_run_v2

    g10 = policy(cand)
    for split in ("train", "dev"):
        out = dry_run_v2.tensor_check(cand, load_split(cand, split, g10))
        assert out["imageShape"] == [3, 640, 640]
        assert out["targets"] == 4 * out["samples"]  # positives only: two occlusion cases per sample excluded
        assert out["boxesOutsideLetterbox"] == 0 and out["samplesWithTargetsButNoPositiveCell"] == 0


def test_the_dry_run_has_no_split_argument_at_all():
    import dry_run_v2

    with pytest.raises(SystemExit):
        dry_run_v2.main(["--candidate=2", "--g10-config=x", "--g10-classes=y", "--build-config=z", "--split=test"])
