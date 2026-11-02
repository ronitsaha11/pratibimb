"""
v2 training entry point (M22.9): PRE-FLIGHT ONLY. It trains nothing.

    python tools/detector/train_v2.py --preflight --candidate=<n> --g10-config=<approved.json>
        --g10-evidence=<evidence.json> --build-config=<build.json> --run-config=<run.json> --run-id=<id>

This module is the separate pipeline the M22.7 design (`train-v2-design.md`) calls for. In M22.9 the
owner authorised implementing and testing it WITHOUT training, so it contains NO training step at all:
no model is built, no optimizer created, no forward or backward pass, no checkpoint, no prediction.
Run without `--preflight`, it refuses. The training step lands only with a separate authorisation.

It does not import, call, execute or subclass the legacy trainer (`train.py`): that module defines the
legacy dataset path and the T1 model directory at import time. Nothing here takes a split argument;
TRAIN and DEV are read through two explicit functions, and the adapter refuses any other split before
touching a file.

PRE-FLIGHT, in order (any failure stops it):
  1. the shipped T1 artifact's SHA-256 equals the value ADR-0003 records;
  2. the run configuration is schema 2 (M22.12), complete, internally consistent (exact step count,
     schedule ending at the last step, every checkpoint with a DEV loss), consistent with the model
     head, and free of any TEST reference; its approval status is reported (a proposal is pending
     until the owner approves it);
  3. the G10 configuration is APPROVED, and its evidence is format 2, bound to it and to the
     candidate's manifests (`data_v2.G10Policy`);
  4. TRAIN and DEV load as an ACCEPTED dataset (`data_v2.load_accepted_split`): frames verified,
     positives only, occlusion cases and non-visible positives excluded, separation checked, every
     class x size cell at its minimum;
  5. the configured steps per epoch and DEV batches equal the accepted TRAIN and DEV sizes over the
     batch size, with no partial batch, and the configured CPU threads exist on this machine;
     every adapted sample goes through the unchanged v1 input path (`dry_run_v2.tensor_check`), and,
     with `loss.partialOcclusion` "ignore-mask", its partial-occlusion ignore mask is built and totalled;
  6. the output directory is a NEW `artifacts/models/t1-ui-head-v2-<run id>`, outside every protected
     model directory after resolving links and case, and not existing yet. It is NOT created;
  7. the provenance record a future run would write is assembled;
  8. the T1 artifact's SHA-256 is checked again: it must not have changed.
It prints the plan as JSON and writes nothing.
"""

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from data_v2 import AdapterError, G10Policy, acceptance, candidate_root, canonical_sha256, check_separation, load_accepted_split  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PREFLIGHT_ONLY = "PRE-FLIGHT ONLY - no model built, no optimizer, no forward or backward pass, no weights written, no prediction"

# The shipped T1 model: its directory is protected, and its SHA-256 is the one ADR-0003 records
# (docs/adr/ADR-0003-detector-artifact-packaging.md; the registry's feasibility matrix holds its prefix).
T1_MODEL_DIR = ("artifacts", "models", "t1-ui-head")
T1_ARTIFACT = T1_MODEL_DIR + ("t1-ui-head.onnx",)
T1_EXPECTED_SHA256 = "ba6d9e93695b22d17d9dc2b8193966132af85a6a031b08eb453d1d20a05179d0"
PROTECTED_MODEL_DIRS = (T1_MODEL_DIR,)
OUTPUT_PREFIX = "t1-ui-head-v2-"
RUN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,47}$")

# Schema 2 (M22.12) makes every first-run decision explicit and checkable. Schema-1 files (M22.9) are
# refused, not upgraded: a configuration is never completed with defaults.
RUN_CONFIG_SCHEMA = "train-v2-run-config/2"
RUN_CONFIG_KEYS = ("schemaVersion", "status", "approval", "architecture", "data", "batchSize", "optimizer", "schedule", "epochs", "steps", "seed", "determinism", "devEvaluation", "checkpoint", "earlyStopping", "loss")
OPTIMIZERS = ("AdamW", "SGD")
EARLY_STOPPING_MONITORS = ("dev_loss",)
EARLY_STOPPING_ACTIONS = ("record-only", "stop")
SCHEDULES = ("cosine",)
WARMUPS = ("none",)
SCHEDULE_STEPPING = ("optimizer-step",)
DEV_LOSS_AGGREGATIONS = ("dataset-sum",)  # sum of numerators / sum of positive cells over all of DEV
CHECKPOINT_RETENTIONS = ("all",)
BEST_CHECKPOINT_RULES = ("strict-min-dev-loss",)  # ties keep the earlier epoch
DETERMINISM = ("required",)  # torch.use_deterministic_algorithms(True), never warn_only
NON_FINITE_GRADIENT = ("fail",)
PARTIAL_OCCLUSION = ("ignore-mask", "background")


class SafetyError(Exception):
    """A pre-flight safety check failed. Nothing proceeds past it."""


# ── the T1 model guard ────────────────────────────────────────────────────────────────────────


def check_t1(repo_root, expected=T1_EXPECTED_SHA256):
    path = os.path.join(repo_root, *T1_ARTIFACT)
    if not os.path.isfile(path):
        raise SafetyError("the T1 artifact is missing: refusing to proceed without the model it must protect")
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    got = h.hexdigest()
    if got != expected:
        raise SafetyError(f"the T1 artifact's SHA-256 is {got[:16]}..., not the recorded {expected[:16]}...: it changed, stop")
    return got


# ── the output directory ──────────────────────────────────────────────────────────────────────


def _norm(p):
    """Resolved (links followed) and, on Windows, case-folded: the form two paths are compared in."""
    return os.path.normcase(os.path.realpath(p))


def _inside(child, parent):
    return child == parent or child.startswith(parent.rstrip(os.sep) + os.sep)


def assert_safe_output(repo_root, out):
    """
    Refuse an output path that is outside `artifacts/models`, that resolves into (or contains) a
    protected model directory, that passes through a link or junction, or that already exists.
    """
    models = os.path.join(repo_root, "artifacts", "models")
    models_n = _norm(models)
    out_n = _norm(out)
    if out_n == models_n or not _inside(out_n, models_n):
        raise SafetyError("the output directory must be a new directory inside artifacts/models")
    for parts in PROTECTED_MODEL_DIRS:
        prot_n = _norm(os.path.join(repo_root, *parts))
        if _inside(out_n, prot_n) or _inside(prot_n, out_n):
            raise SafetyError(f"the output directory resolves into or over the protected {'/'.join(parts)}")
    p = os.path.abspath(out)
    stop = os.path.abspath(os.path.dirname(models))
    while _norm(p) != _norm(stop) and os.path.dirname(p) != p:
        if os.path.lexists(p) and (os.path.islink(p) or (hasattr(os.path, "isjunction") and os.path.isjunction(p))):
            raise SafetyError("the output path passes through a link or junction: refused")
        p = os.path.dirname(p)
    if os.path.lexists(out):
        raise SafetyError("the output directory already exists: a run is never overwritten")
    return out


def output_dir(repo_root, run_id):
    if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id):
        raise SafetyError("run id must be 3-48 characters of a-z, 0-9 and '-', starting with a letter or digit")
    return assert_safe_output(repo_root, os.path.join(repo_root, "artifacts", "models", OUTPUT_PREFIX + run_id))


# ── the run configuration ─────────────────────────────────────────────────────────────────────


def _mentions_test(v):
    if isinstance(v, str):
        return re.search(r"(^|[^a-z])test([^a-z]|$)", v.lower()) is not None
    if isinstance(v, dict):
        return any(_mentions_test(k) or _mentions_test(x) for k, x in v.items())
    if isinstance(v, list):
        return any(_mentions_test(x) for x in v)
    return False


def validate_run_config(cfg):
    """A complete, consistent configuration, free of TEST. Returns it. Never fills in a default."""
    from head import CLASSES, INPUT_SIZE, STRIDE

    if not isinstance(cfg, dict) or cfg.get("schemaVersion") != RUN_CONFIG_SCHEMA:
        raise SafetyError(f"run configuration schemaVersion must be {RUN_CONFIG_SCHEMA!r}: an older schema is refused, not upgraded")
    missing = [k for k in RUN_CONFIG_KEYS if k not in cfg]
    if missing:
        raise SafetyError(f"run configuration lacks {missing}: nothing is defaulted")
    if not all(isinstance(cfg[k], dict) for k in ("architecture", "data", "optimizer", "schedule", "epochs", "steps", "determinism", "devEvaluation", "checkpoint", "earlyStopping", "loss")):
        raise SafetyError("run configuration sections must be objects")
    if _mentions_test(cfg):
        raise SafetyError("run configuration mentions TEST: TRAIN trains, DEV validates, and nothing else exists here")
    a = cfg["approval"]
    if not isinstance(a, dict) or not isinstance(a.get("approved"), bool):
        raise SafetyError("run configuration must record approval.approved")
    arch = cfg["architecture"]
    if arch.get("model") != "head.UiHead" or arch.get("inputSize") != INPUT_SIZE or arch.get("stride") != STRIDE or list(arch.get("classes", [])) != list(CLASSES):
        raise SafetyError("architecture must be head.UiHead at the head's own input size, stride and class order")
    if not (isinstance(arch.get("width"), list) and len(arch["width"]) == 3 and all(isinstance(w, int) and w > 0 for w in arch["width"])):
        raise SafetyError("architecture.width must be three positive integers")
    data = cfg["data"]
    if data.get("train") != "train" or data.get("validation") != "dev":
        raise SafetyError("data must train on 'train' and validate on 'dev'")
    pos_int = lambda v: isinstance(v, int) and not isinstance(v, bool) and v > 0  # noqa: E731
    pos_num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0  # noqa: E731
    o = cfg["optimizer"]
    if o.get("name") not in OPTIMIZERS or not pos_num(o.get("learningRate")) or not (isinstance(o.get("weightDecay"), (int, float)) and o["weightDecay"] >= 0):
        raise SafetyError(f"optimizer must name one of {OPTIMIZERS} with a positive learningRate and a weightDecay >= 0")
    if not pos_num(o.get("gradientClipNorm")):
        raise SafetyError("optimizer.gradientClipNorm must be a positive number")
    if o.get("nonFiniteGradient") not in NON_FINITE_GRADIENT:
        raise SafetyError(f"optimizer.nonFiniteGradient must be one of {NON_FINITE_GRADIENT}")
    if not pos_int(cfg["batchSize"]) or not pos_int(cfg["epochs"].get("max")) or not isinstance(cfg["seed"], int) or isinstance(cfg["seed"], bool):
        raise SafetyError("batchSize and epochs.max must be positive integers, and seed an integer")
    epochs = cfg["epochs"]["max"]
    steps = cfg["steps"]
    if not pos_int(steps.get("perEpoch")) or not pos_int(steps.get("max")):
        raise SafetyError("steps.perEpoch and steps.max must be positive integers")
    if steps["max"] != steps["perEpoch"] * epochs:
        raise SafetyError(f"steps.max ({steps['max']}) must equal steps.perEpoch x epochs.max ({steps['perEpoch'] * epochs}): the step count is exact")
    sch = cfg["schedule"]
    if sch.get("name") not in SCHEDULES or sch.get("warmup") not in WARMUPS or sch.get("stepEvery") not in SCHEDULE_STEPPING:
        raise SafetyError(f"schedule must be one of {SCHEDULES}, warmup one of {WARMUPS}, stepped every {SCHEDULE_STEPPING}")
    if sch.get("tMaxSteps") != steps["max"] or not pos_int(sch.get("tMaxSteps")):
        raise SafetyError("schedule.tMaxSteps must equal steps.max: the schedule completes exactly at the last step")
    if not (isinstance(sch.get("etaMin"), (int, float)) and not isinstance(sch.get("etaMin"), bool) and 0 <= sch["etaMin"] < o["learningRate"]):
        raise SafetyError("schedule.etaMin must be a number >= 0 and below the learning rate")
    det = cfg["determinism"]
    if det.get("deterministicAlgorithms") not in DETERMINISM or not pos_int(det.get("cpuThreads")):
        raise SafetyError(f"determinism.deterministicAlgorithms must be one of {DETERMINISM} and cpuThreads a positive integer")
    dev = cfg["devEvaluation"]
    if not pos_int(dev.get("everyEpochs")) or dev["everyEpochs"] > epochs or not pos_int(dev.get("batches")) or dev.get("lossAggregation") not in DEV_LOSS_AGGREGATIONS:
        raise SafetyError(f"devEvaluation needs everyEpochs (1..epochs.max), a positive batches count and lossAggregation one of {DEV_LOSS_AGGREGATIONS}")
    ck = cfg["checkpoint"]
    if not pos_int(ck.get("everyEpochs")) or ck["everyEpochs"] > epochs:
        raise SafetyError("checkpoint.everyEpochs must be a positive integer, at most epochs.max")
    if ck.get("retention") not in CHECKPOINT_RETENTIONS or ck.get("best") not in BEST_CHECKPOINT_RULES:
        raise SafetyError(f"checkpoint.retention must be one of {CHECKPOINT_RETENTIONS} and checkpoint.best one of {BEST_CHECKPOINT_RULES}")
    if ck["everyEpochs"] % dev["everyEpochs"]:
        raise SafetyError("checkpoint.everyEpochs must be a multiple of devEvaluation.everyEpochs: every checkpoint needs its DEV loss")
    es = cfg["earlyStopping"]
    if es.get("monitor") not in EARLY_STOPPING_MONITORS or not pos_int(es.get("patience")) or not (isinstance(es.get("minDelta"), (int, float)) and not isinstance(es.get("minDelta"), bool) and es["minDelta"] >= 0):
        raise SafetyError(f"earlyStopping must monitor one of {EARLY_STOPPING_MONITORS} with a positive patience and minDelta >= 0")
    if es.get("action") not in EARLY_STOPPING_ACTIONS:
        raise SafetyError(f"earlyStopping.action must be one of {EARLY_STOPPING_ACTIONS}")
    loss = cfg["loss"]
    if loss.get("function") != "targets.detector_loss" or not pos_num(loss.get("boxWeight")):
        raise SafetyError("loss must be targets.detector_loss with a positive boxWeight")
    if loss.get("partialOcclusion") not in PARTIAL_OCCLUSION:
        raise SafetyError(f"loss.partialOcclusion must be one of {PARTIAL_OCCLUSION}")
    return cfg


def check_plan_against_data(cfg, n_train, n_dev, cpu_count=None):
    """
    The configuration's exact counts against the accepted data and this machine. No partial batch is
    ever planned: TRAIN and DEV must divide exactly by the batch size, and the configured steps per
    epoch and DEV batches must be those quotients. The CPU thread count must exist on this machine.
    """
    b = cfg["batchSize"]
    if n_train % b or n_dev % b:
        raise SafetyError(f"TRAIN ({n_train}) and DEV ({n_dev}) must divide exactly by batchSize {b}: no partial batch is planned")
    if cfg["steps"]["perEpoch"] != n_train // b:
        raise SafetyError(f"steps.perEpoch is {cfg['steps']['perEpoch']}, but {n_train} TRAIN samples / batch {b} = {n_train // b}")
    if cfg["devEvaluation"]["batches"] != n_dev // b:
        raise SafetyError(f"devEvaluation.batches is {cfg['devEvaluation']['batches']}, but {n_dev} DEV samples / batch {b} = {n_dev // b}")
    cpus = os.cpu_count() if cpu_count is None else cpu_count
    if not cpus or cfg["determinism"]["cpuThreads"] > cpus:
        raise SafetyError(f"determinism.cpuThreads {cfg['determinism']['cpuThreads']} exceeds this machine's {cpus} logical CPUs")
    epochs = cfg["epochs"]["max"]
    return {
        "stepsPerEpoch": cfg["steps"]["perEpoch"],
        "maxEpochs": epochs,
        "maxSteps": cfg["steps"]["max"],
        "devBatchesPerEvaluation": cfg["devEvaluation"]["batches"],
        "devEvaluations": epochs // cfg["devEvaluation"]["everyEpochs"],
        "checkpoints": epochs // cfg["checkpoint"]["everyEpochs"],
        "earlyStoppingAction": cfg["earlyStopping"]["action"],
        "partialOcclusion": cfg["loss"]["partialOcclusion"],
        "cpuThreads": cfg["determinism"]["cpuThreads"],
        "logicalCpus": cpus,
    }


# ── data: TRAIN and DEV through separate, explicit interfaces ─────────────────────────────────


def load_train(root, g10):
    """TRAIN, as an accepted dataset: approved G10 positives only."""
    return load_accepted_split(root, "train", g10)


def load_dev(root, g10):
    """DEV, as an accepted dataset, for validation only: approved G10 positives only."""
    return load_accepted_split(root, "dev", g10)


# ── provenance ────────────────────────────────────────────────────────────────────────────────


def _git(repo_root, *args):
    r = subprocess.run(["git", *args], cwd=repo_root, capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def environment():
    import numpy
    import PIL
    import torch

    return {"python": platform.python_version(), "platform": platform.platform(), "torch": torch.__version__, "numpy": numpy.__version__, "pillow": PIL.__version__}


def provenance_plan(repo_root, candidate_n, train, dev, g10, run_cfg, out, t1_sha):
    """The record a future training run must write next to its weights (`run-record.json`)."""
    commit = _git(repo_root, "rev-parse", "HEAD")
    dirty = _git(repo_root, "status", "--porcelain", "--untracked-files=no")
    return {
        "gitCommit": commit,
        "gitTrackedChanges": bool(dirty),
        "dataset": {"version": f"{train['name']}@{train['version']}", "candidate": candidate_n, "renderRevision": train["report"]["renderRevision"]},
        "trainManifestSha256": train["hash"],
        "devManifestSha256": dev["hash"],
        "g10": {"version": g10.version, "configSha256": g10.config_sha256, "thresholdsSha256": g10.thresholds_sha256, "evidenceSha256": g10.evidence_sha256, "approval": g10.approval},
        "architecture": run_cfg["architecture"],
        "schemaVersion": run_cfg["schemaVersion"],
        "hyperparameters": {k: run_cfg[k] for k in ("batchSize", "optimizer", "schedule", "epochs", "steps", "determinism", "devEvaluation", "checkpoint", "earlyStopping", "loss")},
        "seed": run_cfg["seed"],
        "runConfigSha256": canonical_sha256(run_cfg),
        "runConfigApproval": run_cfg["approval"],
        "environment": environment(),
        "outputDirectory": os.path.relpath(out, repo_root).replace(os.sep, "/"),
        "outputModelSha256": "written by a future, separately authorised training run",
        "t1ArtifactSha256": t1_sha,
        "label": "UNADOPTED",
    }


# ── pre-flight ────────────────────────────────────────────────────────────────────────────────


def preflight(repo_root, candidate_n, g10_config, g10_evidence, build_config, run_config, run_id, t1_expected=T1_EXPECTED_SHA256):
    t1_before = check_t1(repo_root, t1_expected)
    with open(run_config, "r", encoding="utf-8") as f:
        run_cfg = validate_run_config(json.load(f))
    g10 = G10Policy.from_files(g10_config, g10_evidence)
    if not g10.approved:
        raise AdapterError("pre-flight needs an APPROVED G10 configuration")
    root = candidate_root(repo_root, candidate_n)
    if not os.path.isdir(root):
        raise AdapterError(f"candidate {candidate_n} does not exist")
    train = load_train(root, g10)
    dev = load_dev(root, g10)
    check_separation(train, dev)
    with open(build_config, "r", encoding="utf-8") as f:
        minimum = json.load(f)["gate"]["minPerClassBucket"]
    accepted = acceptance(train, dev, g10, minimum)
    if not accepted["claimed"]:
        raise AdapterError(f"the candidate is not acceptable for training: {accepted['reason']} {accepted.get('short', '')}")
    plan = check_plan_against_data(run_cfg, len(train["samples"]), len(dev["samples"]))
    import dry_run_v2
    from occlusion_mask_v2 import MaskError

    ignore = run_cfg["loss"]["partialOcclusion"] == "ignore-mask"
    try:
        tensors = {"train": dry_run_v2.tensor_check(root, train, ignore), "dev": dry_run_v2.tensor_check(root, dev, ignore)}
    except MaskError as e:
        raise AdapterError(f"the partial-occlusion ignore mask cannot be built: {e}") from e
    for split, t in tensors.items():
        if t["boxesOutsideLetterbox"] or t["samplesWithTargetsButNoPositiveCell"]:
            raise AdapterError(f"{split}: the v1 input path rejected targets: {t}")
    out = output_dir(repo_root, run_id)
    record = provenance_plan(repo_root, candidate_n, train, dev, g10, run_cfg, out, t1_before)
    t1_after = check_t1(repo_root, t1_expected)
    if t1_after != t1_before:
        raise SafetyError("the T1 artifact changed during pre-flight")
    return {
        "mode": PREFLIGHT_ONLY,
        "candidate": f"artifacts/datasets/{os.path.basename(root)}",
        "g10": {"mode": g10.mode, "version": g10.version, "approval": g10.approval},
        "acceptance": accepted,
        "train": {k: train["report"][k] for k in ("samples", "framesVerified", "positivesKept", "positivesKeptByClassAndBucket", "excluded", "excludedByCategoryClassAndBucket", "g10")},
        "dev": {k: dev["report"][k] for k in ("samples", "framesVerified", "positivesKept", "positivesKeptByClassAndBucket", "excluded", "excludedByCategoryClassAndBucket", "g10")},
        "separation": "TRAIN and DEV share no id, seed, spec hash or frame",
        "tensorCheck": tensors,
        "runConfiguration": {"schemaVersion": run_cfg["schemaVersion"], "status": run_cfg["status"], "approval": run_cfg["approval"], "plan": plan},
        "outputDirectory": {"path": record["outputDirectory"], "exists": os.path.lexists(out), "created": False},
        "provenanceRecordPlan": record,
        "t1": {"before": t1_before, "after": t1_after, "unchanged": True},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="v2 training entry point - PRE-FLIGHT ONLY in M22.9; it trains nothing")
    ap.add_argument("--preflight", action="store_true", help="required: the only mode that exists")
    ap.add_argument("--candidate", type=int, required=True)
    ap.add_argument("--g10-config", required=True)
    ap.add_argument("--g10-evidence", required=True)
    ap.add_argument("--build-config", required=True)
    ap.add_argument("--run-config", required=True)
    ap.add_argument("--run-id", required=True)
    args = ap.parse_args(argv)
    if not args.preflight:
        print("REFUSING: training execution is not authorised (M22.9); only --preflight exists", file=sys.stderr)
        return 3
    plan = preflight(REPO_ROOT, args.candidate, args.g10_config, args.g10_evidence, args.build_config, args.run_config, args.run_id)
    print(PREFLIGHT_ONLY, file=sys.stderr)
    print(json.dumps(plan, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AdapterError, SafetyError) as e:
        print(f"REFUSING: {e}", file=sys.stderr)
        sys.exit(2)
