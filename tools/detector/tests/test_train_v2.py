"""
M22.9 — static and behavioural safety guarantees of `train_v2.py`, the separate v2 entry point.

Static: the source is parsed, never executed for training. Behavioural: pre-flight runs on a SMALL
SYNTHETIC repository in a temp directory (a fake T1 artifact, a synthetic candidate), with the model
head, every optimizer, the module call and backward pass trapped, so the tests prove pre-flight builds
no model and takes no step. No real dataset, no real model, no TEST.
"""

import ast
import hashlib
import json
import os
import shutil
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DETECTOR = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(DETECTOR))
sys.path.insert(0, DETECTOR)

import train_v2  # noqa: E402
from data_v2 import AdapterError  # noqa: E402
from test_data_v2 import add_occluder_provenance, approve, edit, read_json, write_candidate, write_json  # noqa: E402

RUNTIME_MODULES = ("train_v2.py", "data_v2.py", "dry_run_v2.py", "occlusion_mask_v2.py", "loss_v2.py", "telemetry_v2.py")
PROPOSED = os.path.join(DETECTOR, "configs", "train-v2-first-run.PROPOSED.json")  # schema 2 (M22.12)
PROPOSED_M22_9 = os.path.join(DETECTOR, "configs", "train-v2-first-experiment.PROPOSED.json")  # schema 1, kept as history


def fixture_run_config(cfg, n_train=3, n_dev=2):
    """The canonical proposal, resized to the tiny synthetic candidate (batch 1) so its exact counts hold."""
    cfg["batchSize"] = 1
    cfg["steps"] = {"perEpoch": n_train, "max": n_train * cfg["epochs"]["max"]}
    cfg["schedule"]["tMaxSteps"] = cfg["steps"]["max"]
    cfg["devEvaluation"]["batches"] = n_dev
    cfg["determinism"]["cpuThreads"] = 1
    return cfg


def _tree(name):
    with open(os.path.join(DETECTOR, name), "r", encoding="utf-8") as f:
        return ast.parse(f.read())


def _code_strings(tree):
    """String constants that are not docstrings."""
    docs = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docs.add(id(first.value))
    return [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs]


# ── static guarantees ─────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", RUNTIME_MODULES)
def test_1_no_runtime_module_imports_the_legacy_trainer(name):
    for node in ast.walk(_tree(name)):
        if isinstance(node, ast.Import):
            assert all(a.name.split(".")[0] != "train" for a in node.names), f"{name} imports train"
        if isinstance(node, ast.ImportFrom):
            assert (node.module or "").split(".")[0] != "train", f"{name} imports from train"
        if isinstance(node, ast.Call) and getattr(node.func, "attr", getattr(node.func, "id", "")) in ("import_module", "__import__"):
            assert not any(isinstance(a, ast.Constant) and str(a.value).split(".")[0] == "train" for a in node.args)


@pytest.mark.parametrize("name", RUNTIME_MODULES)
def test_2_the_legacy_trainer_is_never_invoked(name):
    tree = _tree(name)
    assert not any("train.py" in s for s in _code_strings(tree)), f"{name} names train.py in code"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            assert not any(m in ("runpy",) for m in mods)
        if isinstance(node, ast.Call):
            fn = node.func
            name_ = getattr(fn, "attr", getattr(fn, "id", ""))
            assert name_ not in ("system", "popen", "execv", "execvp", "spawnv", "run_path", "run_module"), f"{name} calls {name_}"
            # The exec / eval BUILTINS; `model.eval()` (the module's evaluation mode) is an attribute call.
            assert not (isinstance(fn, ast.Name) and fn.id in ("exec", "eval")), f"{name} calls the {fn.id} builtin"
            if name_ in ("run", "Popen", "call", "check_call", "check_output"):
                # The only subprocess allowed: git, for the provenance record.
                first = node.args[0] if node.args else None
                assert isinstance(first, ast.List) and isinstance(first.elts[0], ast.Constant) and first.elts[0].value == "git", f"{name}: a subprocess that is not git"


@pytest.mark.parametrize("name", RUNTIME_MODULES)
def test_3_no_test_split_or_path_in_runtime_code(name):
    for s in _code_strings(_tree(name)):
        low = s.lower()
        assert low != "test" and "manifest-test" not in low and "frames-test" not in low, f"{name}: {s!r}"


def test_3b_the_proposed_run_configuration_mentions_no_test():
    cfg = read_json(PROPOSED)
    assert not train_v2._mentions_test(cfg)
    assert train_v2.validate_run_config(cfg) is cfg


def test_4_train_and_dev_have_separate_explicit_interfaces_and_no_split_parameter():
    tree = _tree("train_v2.py")
    funcs = {n.name: n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
    for fn in funcs.values():
        assert "split" not in [a.arg for a in fn.args.args + fn.args.kwonlyargs], f"{fn.name} takes a split"
    for name, split in (("load_train", "train"), ("load_dev", "dev")):
        calls = [c for c in ast.walk(funcs[name]) if isinstance(c, ast.Call) and getattr(c.func, "id", "") == "load_accepted_split"]
        assert len(calls) == 1 and isinstance(calls[0].args[1], ast.Constant) and calls[0].args[1].value == split


@pytest.mark.parametrize("name", ("train_v2.py", "loss_v2.py"))
def test_10_training_has_no_inference_export_or_decode_path(name):
    """M22.13 authorises training only: no detection decode, no prediction, no export, no ONNX."""
    tree = _tree(name)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            assert not any(m.split(".")[0] in ("onnx", "onnxruntime") for m in mods), f"{name} imports {mods}"
            if isinstance(node, ast.ImportFrom):
                assert not {a.name for a in node.names} & {"decode", "ExportWrapper"}, f"{name} imports a decode/export path"
    calls = {getattr(c.func, "attr", getattr(c.func, "id", "")) for c in ast.walk(tree) if isinstance(c, ast.Call)}
    assert not calls & {"export", "decode", "nms", "predict_split", "InferenceSession"}


def test_10b_weights_are_saved_only_by_the_checkpoint_writer():
    tree = _tree("train_v2.py")
    for fn in (n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)):
        saves = [c for c in ast.walk(fn) if isinstance(c, ast.Call) and getattr(c.func, "attr", "") == "save"]
        assert not saves or fn.name == "_write_checkpoint", f"{fn.name} saves"


def test_10c_nothing_runs_by_default():
    base = ["--candidate=2", "--g10-config=x", "--g10-evidence=y", "--build-config=z", "--run-config=w", "--run-id=abc"]
    assert train_v2.main(base) == 3
    assert train_v2.main(base + ["--resume"]) == 3


def test_the_t1_hash_is_the_one_adr_0003_and_the_registry_record():
    with open(os.path.join(REPO, "docs", "adr", "ADR-0003-detector-artifact-packaging.md"), "r", encoding="utf-8") as f:
        assert train_v2.T1_EXPECTED_SHA256 in f.read()
    with open(os.path.join(REPO, "agentos", "registry", "feasibility-matrix.md"), "r", encoding="utf-8") as f:
        assert train_v2.T1_EXPECTED_SHA256[:16] in f.read()


# ── a synthetic repository ────────────────────────────────────────────────────────────────────


@pytest.fixture()
def repo(tmp_path):
    root = tmp_path / "repo"
    t1 = root / "artifacts" / "models" / "t1-ui-head"
    t1.mkdir(parents=True)
    (t1 / "t1-ui-head.onnx").write_bytes(b"fake t1 artifact for M22.9 tests")
    cand = approve(add_occluder_provenance(write_candidate(str(root / "artifacts" / "datasets" / "t1-ui-synthetic-2.1.0-draft-candidate-2"))))
    write_json(str(tmp_path / "build.json"), {"gate": {"minPerClassBucket": {"train": 0, "dev": 0}}})
    write_json(str(tmp_path / "run.json"), fixture_run_config(read_json(PROPOSED)))
    return {
        "root": str(root),
        "cand": cand,
        "args": dict(
            candidate_n=2,
            g10_config=os.path.join(cand, "g10-config.json"),
            g10_evidence=os.path.join(cand, "g10-classes.json"),
            build_config=str(tmp_path / "build.json"),
            run_config=str(tmp_path / "run.json"),
            run_id="fixture-run-01",
            t1_expected=hashlib.sha256(b"fake t1 artifact for M22.9 tests").hexdigest(),
        ),
    }


def _snapshot(root):
    out = {}
    for d, _, files in os.walk(root):
        for f in files:
            p = os.path.join(d, f)
            with open(p, "rb") as fh:
                out[os.path.relpath(p, root)] = hashlib.sha256(fh.read()).hexdigest()
    return out


@pytest.fixture()
def traps(monkeypatch):
    """Make building the model, any optimizer, a module call or a backward pass fail loudly."""
    import head
    import torch

    def boom(*a, **k):
        raise AssertionError("pre-flight built a model, an optimizer, or ran a forward or backward pass")

    monkeypatch.setattr(head.UiHead, "__init__", boom)
    monkeypatch.setattr(torch.optim.Optimizer, "__init__", boom)
    monkeypatch.setattr(torch.nn.Module, "__call__", boom)
    monkeypatch.setattr(torch.Tensor, "backward", boom)
    monkeypatch.setattr(torch, "save", boom)


# ── behavioural guarantees ────────────────────────────────────────────────────────────────────


def test_preflight_passes_writes_nothing_and_builds_no_model(repo, traps):
    before = _snapshot(repo["root"])
    plan = train_v2.preflight(repo["root"], **repo["args"])
    assert plan["mode"].startswith("PRE-FLIGHT ONLY")
    assert plan["g10"]["mode"] == "APPROVED" and plan["acceptance"]["claimed"] is True
    assert plan["train"]["positivesKept"] == 12 and plan["dev"]["positivesKept"] == 8
    assert plan["outputDirectory"] == {"path": "artifacts/models/t1-ui-head-v2-fixture-run-01", "exists": False, "created": False, "resume": False}
    assert plan["t1"]["unchanged"] is True
    rec = plan["provenanceRecordPlan"]
    for k in ("gitCommit", "trainManifestSha256", "devManifestSha256", "g10", "architecture", "hyperparameters", "seed", "environment", "runConfigSha256", "outputModelSha256"):
        assert k in rec
    assert _snapshot(repo["root"]) == before  # nothing written, the output directory included


def test_5_dataset_approval_is_required(repo):
    edit(repo["cand"], "g10-config.json", lambda c: c["approval"].update(approved=False))
    with pytest.raises(AdapterError):
        train_v2.preflight(repo["root"], **repo["args"])


def test_6_g10_evidence_is_required(repo):
    os.remove(repo["args"]["g10_evidence"])
    with pytest.raises(AdapterError, match="evidence file does not exist"):
        train_v2.preflight(repo["root"], **repo["args"])
    with pytest.raises(AdapterError, match="both required"):
        train_v2.preflight(repo["root"], **{**repo["args"], "g10_evidence": None})


def test_7_candidate_manifest_hashes_are_checked(repo):
    edit(repo["cand"], "manifest-dev.json", lambda m: m.update(hash="a-rebuilt-dev-manifest"))
    with pytest.raises(AdapterError, match="another dev manifest"):
        train_v2.preflight(repo["root"], **repo["args"])


def test_the_t1_artifact_is_checked_before_and_a_change_stops_preflight(repo, monkeypatch):
    with pytest.raises(train_v2.SafetyError, match="it changed"):
        train_v2.preflight(repo["root"], **{**repo["args"], "t1_expected": "0" * 64})
    import dry_run_v2

    real = dry_run_v2.tensor_check

    def tamper(root, data, *a, **k):
        with open(os.path.join(repo["root"], *train_v2.T1_ARTIFACT), "ab") as f:
            f.write(b"!")
        return real(root, data, *a, **k)

    monkeypatch.setattr(dry_run_v2, "tensor_check", tamper)
    with pytest.raises(train_v2.SafetyError, match="it changed"):
        train_v2.preflight(repo["root"], **repo["args"])


@pytest.mark.parametrize(
    "rel",
    [
        "artifacts/models/t1-ui-head",
        "artifacts/models/t1-ui-head/sub",
        "artifacts/models/t1-ui-head/../t1-ui-head",
        "artifacts/models",
        "artifacts/elsewhere/run",
        "artifacts/models/../../outside",
    ],
)
def test_8_output_paths_cannot_reach_t1_or_leave_artifacts_models(repo, rel):
    with pytest.raises(train_v2.SafetyError):
        train_v2.assert_safe_output(repo["root"], os.path.join(repo["root"], *rel.split("/")))


def test_8b_case_is_folded_like_windows(repo, monkeypatch):
    monkeypatch.setattr(os.path, "normcase", lambda p: p.lower())  # Windows behaviour, on any platform
    with pytest.raises(train_v2.SafetyError, match="protected"):
        train_v2.assert_safe_output(repo["root"], os.path.join(repo["root"], "artifacts", "models", "T1-UI-HEAD", "run"))


def test_8c_a_link_resolving_into_t1_is_refused(repo):
    link = os.path.join(repo["root"], "artifacts", "models", "t1-ui-head-v2-linked")
    target = os.path.join(repo["root"], "artifacts", "models", "t1-ui-head")
    if os.name == "nt":
        import _winapi

        _winapi.CreateJunction(target, link)  # no privilege needed, unlike a symlink
    else:
        os.symlink(target, link, target_is_directory=True)
    with pytest.raises(train_v2.SafetyError):
        train_v2.assert_safe_output(repo["root"], link)
    with pytest.raises(train_v2.SafetyError):
        train_v2.assert_safe_output(repo["root"], os.path.join(link, "run"))


def test_8d_run_ids_cannot_escape(repo):
    for bad in ("../t1-ui-head", "a/b", "x", "UPPER", "-lead", "t" * 49, ""):
        with pytest.raises(train_v2.SafetyError, match="run id"):
            train_v2.output_dir(repo["root"], bad)


def test_9_an_existing_run_destination_is_refused(repo):
    os.makedirs(os.path.join(repo["root"], "artifacts", "models", "t1-ui-head-v2-fixture-run-01"))
    with pytest.raises(train_v2.SafetyError, match="already exists"):
        train_v2.preflight(repo["root"], **repo["args"])


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda c: c.pop("seed"), "lacks"),
        (lambda c: c["data"].update(validation="test"), "mentions TEST"),
        (lambda c: c["architecture"].update(classes=["button"]), "class order"),
        (lambda c: c["optimizer"].update(name="Adagrad"), "optimizer"),
        (lambda c: c["optimizer"].update(learningRate=0), "optimizer"),
        (lambda c: c.update(batchSize=0), "batchSize"),
        (lambda c: c["earlyStopping"].update(monitor="train_loss"), "earlyStopping"),
        (lambda c: c["loss"].update(function="mse"), "loss"),
        (lambda c: c.pop("approval"), "lacks"),
    ],
)
def test_the_run_configuration_is_validated_without_defaults(spoil, message):
    cfg = read_json(PROPOSED)
    spoil(cfg)
    with pytest.raises(train_v2.SafetyError, match=message):
        train_v2.validate_run_config(cfg)


# ── M22.12: the schema-2 plan is checked against the data and the machine ─────────────────────


def _run(repo, fn):
    edit(os.path.dirname(repo["args"]["run_config"]), "run.json", fn)


def test_preflight_reports_the_exact_plan_and_the_ignore_mask(repo, traps):
    plan = train_v2.preflight(repo["root"], **repo["args"])
    assert plan["runConfiguration"]["schemaVersion"] == train_v2.RUN_CONFIG_SCHEMA
    p = plan["runConfiguration"]["plan"]
    assert (p["stepsPerEpoch"], p["maxSteps"], p["devBatchesPerEvaluation"], p["devEvaluations"], p["checkpoints"]) == (3, 120, 2, 40, 40)
    assert p["earlyStoppingAction"] == "record-only" and p["partialOcclusion"] == "ignore-mask"
    for split, n in (("train", 3), ("dev", 2)):
        m = plan["tensorCheck"][split]["ignoreMask"]
        assert m["cases"]["partial"] == n and m["cases"]["full"] == n and m["ignoredEntries"] > 0
        assert m["ignoredEntries"] == m["ignoredByClass"]["button"]  # the fixture's partial cases are all buttons


def test_a_partial_batch_is_never_planned(repo):
    _run(repo, lambda c: c.update(batchSize=2))
    with pytest.raises(train_v2.SafetyError, match="divide exactly"):
        train_v2.preflight(repo["root"], **repo["args"])


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda c: c.update(steps={"perEpoch": 4, "max": 160}, schedule={**c["schedule"], "tMaxSteps": 160}), "steps.perEpoch"),
        (lambda c: c["devEvaluation"].update(batches=3), "devEvaluation.batches"),
    ],
)
def test_configured_counts_must_match_the_accepted_data(repo, spoil, message):
    _run(repo, spoil)
    with pytest.raises(train_v2.SafetyError, match=message):
        train_v2.preflight(repo["root"], **repo["args"])


def test_cpu_threads_must_exist_on_the_machine():
    cfg = read_json(PROPOSED)
    with pytest.raises(train_v2.SafetyError, match="cpuThreads"):
        train_v2.check_plan_against_data(cfg, 600, 160, cpu_count=4)
    assert train_v2.check_plan_against_data(cfg, 600, 160, cpu_count=16)["cpuThreads"] == 8


def test_the_ignore_mask_needs_occluder_provenance(repo):
    edit(repo["cand"], "manifest-train.json", lambda m: [o.update(rendered=None) for s in m["samples"] for o in s["provenance"]["occluders"]])
    with pytest.raises(AdapterError, match="ignore mask cannot be built"):
        train_v2.preflight(repo["root"], **repo["args"])
    _run(repo, lambda c: c["loss"].update(partialOcclusion="background"))  # the v1 behaviour needs no mask
    assert train_v2.preflight(repo["root"], **repo["args"])["tensorCheck"]["train"].get("ignoreMask") is None


def test_the_m22_9_schema_1_file_is_refused_not_upgraded(repo):
    shutil.copy(PROPOSED_M22_9, repo["args"]["run_config"])
    with pytest.raises(train_v2.SafetyError, match="schemaVersion"):
        train_v2.preflight(repo["root"], **repo["args"])
