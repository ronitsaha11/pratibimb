"""
M22.13 — the v2 training loop (`train_v2.run_training`), exercised on the SMALL SYNTHETIC fixture in a
temporary, git-initialised repository: 3 TRAIN and 2 DEV frames, batch 1, 2 epochs. Running the loop
is the only way to test it; these are not training runs on candidate data, and everything they write
lives in pytest's temp directory. No real dataset, no real model, no TEST, no inference, no export.
"""

import json
import os
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import train_v2  # noqa: E402
from test_data_v2 import add_occluder_provenance, approve, edit, read_json, write_candidate, write_json  # noqa: E402
from test_train_v2 import PROPOSED, fixture_run_config  # noqa: E402

T1_BYTES = b"fake t1 artifact for M22.13 tests"
RUN_ID = "fixture-run-01"


def _git(root, *args):
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


def make_repo(base, epochs=2, approved=True):
    root = base / "repo"
    t1 = root / "artifacts" / "models" / "t1-ui-head"
    t1.mkdir(parents=True)
    (t1 / "t1-ui-head.onnx").write_bytes(T1_BYTES)
    cand = approve(add_occluder_provenance(write_candidate(str(root / "artifacts" / "datasets" / "t1-ui-synthetic-2.1.0-draft-candidate-2"))))
    write_json(str(base / "build.json"), {"gate": {"minPerClassBucket": {"train": 0, "dev": 0}}})
    cfg = fixture_run_config(read_json(PROPOSED))
    cfg["epochs"]["max"] = epochs
    cfg["steps"]["max"] = cfg["steps"]["perEpoch"] * epochs
    cfg["schedule"]["tMaxSteps"] = cfg["steps"]["max"]
    if approved:
        cfg["approval"] = {"approved": True, "approvedBy": "fixture owner", "approvedOn": "2026-11-03"}
    write_json(str(base / "run.json"), cfg)
    (root / ".gitignore").write_text("artifacts/models/t1-ui-head-v2-*/\n", encoding="utf-8")
    _git(root, "init", "-q")
    _git(root, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "add", "-A")
    _git(root, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "fixture")
    import hashlib

    args = dict(candidate_n=2, g10_config=os.path.join(cand, "g10-config.json"), g10_evidence=os.path.join(cand, "g10-classes.json"),
                build_config=str(base / "build.json"), run_config=str(base / "run.json"), run_id=RUN_ID, t1_expected=hashlib.sha256(T1_BYTES).hexdigest())
    return {"root": str(root), "cand": cand, "args": args, "out": os.path.join(str(root), "artifacts", "models", "t1-ui-head-v2-" + RUN_ID)}


def _record(r):
    return read_json(os.path.join(r["out"], "run-record.json"))


def _state(path):
    import torch

    return torch.load(path, map_location="cpu", weights_only=True)


@pytest.fixture()
def repo(tmp_path):
    return make_repo(tmp_path)


def test_a_complete_run_trains_exactly_the_configured_steps_and_records_everything(repo):
    import torch

    rec = train_v2.run_training(repo["root"], **repo["args"])
    assert rec["status"] == "COMPLETED" and rec["stopEpoch"] == 2 and rec["optimizerSteps"] == 6 and rec["schedulerStep"] == 6
    assert rec["finalLearningRate"] < 1e-12  # the cosine schedule ended on the last step, not beyond
    assert [e["globalStep"] for e in rec["epochs"]] == [3, 6] and all(e["train"]["samples"] == 3 and e["train"]["steps"] == 3 for e in rec["epochs"])
    assert all(e["dev"]["samples"] == 2 for e in rec["epochs"])
    assert all(e["train"]["ignoredEntries"] > 0 and e["dev"]["ignoredEntries"] > 0 for e in rec["epochs"])  # the mask is applied, TRAIN and DEV
    assert rec["dataAccounting"]["train"]["bySizeBucket"]["very-small"]["objects"] == 3
    files = sorted(os.listdir(repo["out"]))
    assert files == ["best-checkpoint.json", "checkpoint-e01.pt", "checkpoint-e02.pt", "run-record.json", "steps-e01.jsonl", "steps-e02.jsonl"]
    for c in rec["checkpoints"]:
        ck = _state(os.path.join(repo["out"], c["file"]))
        assert c["verified"] and ck["epoch"] == c["epoch"] and ck["globalStep"] == 3 * c["epoch"] and ck["runId"] == RUN_ID
        assert set(ck["rng"]) == {"python", "numpy", "torch"} and ck["scheduler"]["last_epoch"] == 3 * c["epoch"]
    devs = [e["dev"]["loss"] for e in rec["epochs"]]
    best = min(range(2), key=lambda i: (devs[i], i)) + 1  # strict minimum; a tie keeps the earlier epoch
    assert rec["best"]["epoch"] == best and read_json(os.path.join(repo["out"], "best-checkpoint.json")) == rec["best"]
    assert rec["earlyStopping"]["action"] == "record-only"
    # Fresh initialisation, real learning: the weights moved from the seeded initial state.
    torch.manual_seed(rec["seed"])
    import head

    init = head.UiHead().state_dict()
    final = _state(os.path.join(repo["out"], "checkpoint-e02.pt"))["model"]
    assert any(not torch.equal(init[k], final[k]) for k in init if init[k].is_floating_point())
    with open(os.path.join(repo["out"], "steps-e01.jsonl"), encoding="utf-8") as f:
        assert [json.loads(line)["step"] for line in f] == [1, 2, 3]


def test_an_interrupted_run_resumes_to_exactly_the_uninterrupted_result(tmp_path):
    import torch

    a = make_repo(tmp_path / "a")
    train_v2.run_training(a["root"], **a["args"])
    b = make_repo(tmp_path / "b")

    def stop(epoch):
        if epoch == 1:
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        train_v2.run_training(b["root"], **b["args"], _hooks={"after_epoch": stop})
    assert _record(b)["status"] == "INTERRUPTED" and len(_record(b)["checkpoints"]) == 1
    rec = train_v2.run_training(b["root"], **b["args"], resume=True)
    assert rec["status"] == "COMPLETED" and rec["optimizerSteps"] == 6 and rec["resumed"][0]["fromEpoch"] == 1
    ka, kb = _state(os.path.join(a["out"], "checkpoint-e02.pt")), _state(os.path.join(b["out"], "checkpoint-e02.pt"))
    assert all(torch.equal(ka["model"][k], kb["model"][k]) for k in ka["model"])  # bitwise: optimizer, scheduler and RNG restored
    assert [e["dev"]["loss"] for e in _record(a)["epochs"]] == [e["dev"]["loss"] for e in rec["epochs"]]


def test_an_unapproved_configuration_is_refused_before_anything_is_created(tmp_path):
    r = make_repo(tmp_path, approved=False)
    with pytest.raises(train_v2.SafetyError, match="APPROVED"):
        train_v2.run_training(r["root"], **r["args"])
    assert not os.path.exists(r["out"])


def test_a_dirty_tracked_tree_is_refused(repo):
    with open(os.path.join(repo["root"], ".gitignore"), "a", encoding="utf-8") as f:
        f.write("# changed\n")
    with pytest.raises(train_v2.SafetyError, match="clean tracked tree"):
        train_v2.run_training(repo["root"], **repo["args"])
    assert not os.path.exists(repo["out"])


def test_one_run_only_a_second_run_directory_is_refused(repo):
    os.makedirs(os.path.join(repo["root"], "artifacts", "models", "t1-ui-head-v2-earlier"))
    with pytest.raises(train_v2.SafetyError, match="one run"):
        train_v2.run_training(repo["root"], **repo["args"])


def test_a_non_finite_loss_stops_the_run_and_records_the_failure(repo, monkeypatch):
    import loss_v2
    import torch

    real = loss_v2.detector_loss_v2

    def nan_loss(*a, **k):
        loss, c, b = real(*a, **k)
        return loss * torch.tensor(float("nan")), c, b

    monkeypatch.setattr(loss_v2, "detector_loss_v2", nan_loss)
    with pytest.raises(train_v2.TrainingFailure, match="F1"):
        train_v2.run_training(repo["root"], **repo["args"])
    rec = _record(repo)
    assert rec["status"] == "FAILED" and rec["failure"]["code"] == "F1" and rec["checkpoints"] == []
    with pytest.raises(train_v2.SafetyError, match="only an INTERRUPTED run resumes"):
        train_v2.run_training(repo["root"], **repo["args"], resume=True)  # a failure is never retried silently


def test_a_t1_change_stops_the_run(repo):
    def tamper(epoch, step):
        if step == 2:
            with open(os.path.join(repo["root"], *train_v2.T1_ARTIFACT), "ab") as f:
                f.write(b"!")

    with pytest.raises(train_v2.TrainingFailure, match="F6"):
        train_v2.run_training(repo["root"], **repo["args"], _hooks={"after_step": tamper})
    assert _record(repo)["failure"]["code"] == "F6"


def test_a_corrupted_checkpoint_fails_verification_and_resume_is_refused(tmp_path):
    r = make_repo(tmp_path)

    def stop(epoch):
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        train_v2.run_training(r["root"], **r["args"], _hooks={"after_epoch": stop})
    path = os.path.join(r["out"], "checkpoint-e01.pt")
    with open(path, "r+b") as f:
        f.seek(100)
        f.write(b"\x00\x00\x00\x00")
    with pytest.raises(train_v2.TrainingFailure, match="F7"):
        train_v2.verify_checkpoint(path, _record(r)["checkpoints"][0]["sha256"], {}, {})
    with pytest.raises(train_v2.TrainingFailure, match="F7"):
        train_v2.run_training(r["root"], **r["args"], resume=True)


def test_resume_refuses_a_changed_configuration(tmp_path):
    r = make_repo(tmp_path)
    with pytest.raises(KeyboardInterrupt):
        train_v2.run_training(r["root"], **r["args"], _hooks={"after_epoch": lambda e: (_ for _ in ()).throw(KeyboardInterrupt())})
    edit(os.path.dirname(r["args"]["run_config"]), "run.json", lambda c: c["earlyStopping"].update(patience=6))
    with pytest.raises(train_v2.SafetyError, match="runConfigSha256"):
        train_v2.run_training(r["root"], **r["args"], resume=True)


def test_nothing_outside_the_run_directory_is_written(repo):
    def snapshot():
        out = {}
        for d, dirs, files in os.walk(repo["root"]):
            dirs[:] = [x for x in dirs if x != ".git" and not x.startswith("t1-ui-head-v2-")]
            for f in files:
                p = os.path.join(d, f)
                out[os.path.relpath(p, repo["root"])] = os.path.getmtime(p), os.path.getsize(p)
        return out

    before = snapshot()
    train_v2.run_training(repo["root"], **repo["args"])
    assert snapshot() == before  # T1, the candidate and everything else untouched
