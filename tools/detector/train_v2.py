"""
v2 training entry point: PRE-FLIGHT (M22.9) and the owner-authorised training step (M22.13).

    python tools/detector/train_v2.py (--preflight | --train [--resume]) --candidate=<n>
        --g10-config=<approved.json> --g10-evidence=<evidence.json> --build-config=<build.json>
        --run-config=<run.json> --run-id=<id>

This module is the separate pipeline the M22.7 design (`train-v2-design.md`) calls for. `--preflight`
builds no model and writes nothing. `--train` is the ONE training run the owner authorised in M22.13:
it needs an APPROVED schema-2 configuration and a clean committed tree, refuses if any v2 run
directory already exists (one run; an interrupted run is resumed, never restarted), repeats the full
pre-flight, then trains (`run_training`). DEV is evaluated for its LOSS only: no decode, no
prediction, no detection metric, no export. Nothing runs by default.

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

TRAINING (`run_training`, M22.13), after that pre-flight:
  - the configuration must be APPROVED and the tracked tree clean; the candidate is fingerprinted;
  - TRAIN and DEV become tensors through the unchanged `data.sample_to_tensors`, with the partial-
    occlusion ignore mask (`occlusion_mask_v2`); every count must equal the pre-flight's;
  - deterministic algorithms on (never warn-only), the configured CPU threads, one seed for the
    initialisation and the per-epoch TRAIN permutation; a FRESH `head.UiHead` (no weights loaded);
  - each step: `loss_v2.detector_loss_v2` (the legacy loss with ignored classification entries at
    zero), backward, clipping that refuses non-finite gradients, AdamW, one cosine scheduler step;
  - each epoch: all TRAIN samples once, then the full-split DEV loss (eval mode, no grad, the same
    mask), a checkpoint written atomically and verified, the T1 hash re-checked, the record updated;
  - the best checkpoint is the strict minimum DEV loss (ties keep the earlier epoch); early
    stopping is recorded and, when record-only, never stops the run;
  - every failure condition stops the run and records it; an interruption is resumable only under
    the same run id, from the last verified checkpoint, with every hash unchanged.
"""

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import time

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


def assert_safe_output(repo_root, out, existing=False):
    """
    Refuse an output path that is outside `artifacts/models`, that resolves into (or contains) a
    protected model directory, that passes through a link or junction, or that already exists.
    With `existing` (a resume of the same run), it must instead exist, as a real directory.
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
    if existing:
        if not os.path.isdir(out) or os.path.islink(out):
            raise SafetyError("a resumed run's directory must already exist as a real directory")
    elif os.path.lexists(out):
        raise SafetyError("the output directory already exists: a run is never overwritten")
    return out


def output_dir(repo_root, run_id, existing=False):
    if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id):
        raise SafetyError("run id must be 3-48 characters of a-z, 0-9 and '-', starting with a letter or digit")
    return assert_safe_output(repo_root, os.path.join(repo_root, "artifacts", "models", OUTPUT_PREFIX + run_id), existing)


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


def preflight(repo_root, candidate_n, g10_config, g10_evidence, build_config, run_config, run_id, t1_expected=T1_EXPECTED_SHA256, resume=False):
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
    out = output_dir(repo_root, run_id, existing=resume)
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
        "outputDirectory": {"path": record["outputDirectory"], "exists": os.path.lexists(out), "created": False, "resume": resume},
        "provenanceRecordPlan": record,
        "t1": {"before": t1_before, "after": t1_after, "unchanged": True},
    }


# ── training (M22.13: owner-authorised, ONE run) ──────────────────────────────────────────────
#
# Training adds no decode, no prediction, no detection metric and no export: DEV is evaluated for its
# LOSS only, in eval mode under no_grad. Weights and checkpoints go only to the new run directory.

BUCKET_NAMES = ("very-small", "small", "medium", "large")
TRAINING_STATUS = ("STARTED", "COMPLETED", "FAILED", "INTERRUPTED")


class TrainingFailure(Exception):
    """A training run stopped on a failure condition. Its record is kept; nothing is retried."""

    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code = code


def _now():
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _write_json_atomic(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(value, f, indent=1, sort_keys=True, allow_nan=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def candidate_fingerprint(root):
    """SHA-256 of both manifests and of every TRAIN and DEV frame: the candidate must not change."""
    out = {}
    for split in ("train", "dev"):
        out[f"manifest-{split}.json"] = _sha256_file(os.path.join(root, f"manifest-{split}.json"))
        frames = os.path.join(root, f"frames-{split}")
        names = sorted(os.listdir(frames))
        listing = "\n".join(f"{n}:{_sha256_file(os.path.join(frames, n))}" for n in names)
        out[f"frames-{split}"] = {"files": len(names), "listSha256": hashlib.sha256(listing.encode()).hexdigest()}
    return out


def peak_memory():
    """This process's peak working set, where the platform reports it (no new dependency)."""
    try:
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes

            class Counters(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                            ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]

            c = Counters()
            c.cb = ctypes.sizeof(Counters)
            k32 = ctypes.windll.kernel32
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            if ctypes.windll.psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(c), c.cb):
                return {"peakWorkingSetBytes": int(c.PeakWorkingSetSize), "workingSetBytes": int(c.WorkingSetSize)}
            return None
        import resource

        return {"peakResidentBytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024}
    except Exception:  # an observation, never a reason to stop
        return None


def prepare_split(root, data, expected):
    """
    Every sample of one accepted split as training tensors, built by the UNCHANGED v1 input path
    (`data.sample_to_tensors`) plus the partial-occlusion ignore mask. Images are kept as uint8 and
    converted per batch; each sample's conversion is checked to reproduce the float tensor exactly.
    A per-cell size-bucket index (for accounting only) is built from each object's own claims, and
    must cover exactly the positive cells. `expected` holds the pre-flight counts; any difference stops.
    """
    import numpy as np
    import torch
    from data import sample_to_tensors
    from head import GRID, INPUT_SIZE, NUM_CLASSES
    from occlusion_mask_v2 import _model_rect, partial_occlusion_ignore_mask
    from targets import CLASS_INDEX, assign_targets

    from data_v2 import bucket_of

    n, a = len(data["samples"]), GRID * GRID
    X = torch.empty((n, 3, INPUT_SIZE, INPUT_SIZE), dtype=torch.uint8)
    P = torch.empty((n, a), dtype=torch.bool)
    BT = torch.empty((n, a, 4), dtype=torch.float32)
    CT = torch.empty((n, a, NUM_CLASSES), dtype=torch.float32)
    IG = torch.empty((n, a, NUM_CLASSES), dtype=torch.bool)
    CB = torch.full((n, a), -1, dtype=torch.int8)
    acct = {b: {"objects": 0, "positiveCells": 0, "nearestCellFallback": 0} for b in BUCKET_NAMES}
    ignored = 0
    idx = np.arange(a)
    ccx, ccy = (idx % GRID + 0.5) * 8, (idx // GRID + 0.5) * 8
    for i, s in enumerate(data["samples"]):
        x, pos, box_t, cls_t = sample_to_tensors(root, s)
        u8 = torch.round(x * 255.0).to(torch.uint8)
        if not torch.equal(u8.float() / 255.0, x):
            raise TrainingFailure("F4", f"{s['id']}: the uint8 image does not reproduce the v1 input tensor exactly")
        m = partial_occlusion_ignore_mask(s, cls_t)
        X[i], P[i], BT[i], CT[i], IG[i] = u8, pos, box_t, cls_t, torch.from_numpy(m["mask"])
        ignored += m["ignoredEntries"]
        vp = s["viewportCss"]
        cb = np.full(a, -1, dtype=np.int8)
        for ann in s["annotations"]:
            r = _model_rect(ann["box"], s)
            if r is None:
                continue
            x0, y0, x1, y1 = r
            claim, _, _ = assign_targets([(x0, y0, x1 - x0, y1 - y0)], [CLASS_INDEX[ann["cls"]]])
            if (cb[claim] >= 0).any():
                raise TrainingFailure("F4", f"{s['id']}: two objects claim one cell; the accounting assumes none (M22.11)")
            k = BUCKET_NAMES.index(bucket_of(min(ann["box"]["w"], ann["box"]["h"]) * INPUT_SIZE / max(vp["w"], vp["h"])))
            cb[claim] = k
            covered = bool(((ccx >= x0) & (ccx <= x1) & (ccy >= y0) & (ccy <= y1)).any())
            acct[BUCKET_NAMES[k]]["objects"] += 1
            acct[BUCKET_NAMES[k]]["positiveCells"] += int(claim.sum())
            acct[BUCKET_NAMES[k]]["nearestCellFallback"] += not covered
        if not np.array_equal(cb >= 0, pos.numpy()):
            raise TrainingFailure("F4", f"{s['id']}: the per-object claims do not reproduce the positive cells")
        CB[i] = torch.from_numpy(cb)
    got = {"samples": n, "positiveCells": int(P.sum()), "ignoredEntries": ignored}
    if got != expected:
        raise TrainingFailure("F4", f"prepared tensors {got} differ from the pre-flight counts {expected}")
    return {"X": X, "P": P, "BT": BT, "CT": CT, "IG": IG, "CB": CB, "n": n, "accounting": {"bySizeBucket": acct, **got}}


def _batch(t, idx):
    X = t["X"][idx].float() / 255.0  # the exact v1 values (checked per sample in prepare_split)
    return X, t["P"][idx], t["BT"][idx].permute(0, 2, 1), t["CT"][idx].permute(0, 2, 1), t["IG"][idx].permute(0, 2, 1)


def dev_loss(model, dev, batch_size, box_weight):
    """
    The full-split DEV loss, eval mode, no gradient: sum of focal numerators / sum of positive cells,
    plus box_weight x sum of box numerators / sum of positive cells (`dataset-sum`), the ignore mask
    applied exactly as in training. Also per class and per size bucket. No decode, no prediction.
    """
    import torch
    from head import CLASSES
    from loss_v2 import loss_terms

    model.eval()
    if model.training:
        raise TrainingFailure("F8", "the model is not in eval mode for the DEV pass")
    f_sum = b_sum = 0.0
    npos = ignored = samples = 0
    per_class = torch.zeros(len(CLASSES), dtype=torch.float64)
    per_bucket = {b: {"cells": 0, "positiveClassFocal": 0.0, "box": 0.0} for b in BUCKET_NAMES}
    with torch.no_grad():
        for start in range(0, dev["n"], batch_size):
            idx = torch.arange(start, start + batch_size)
            X, P, BT, CT, IG = _batch(dev, idx)
            box_raw, cls_raw = model(X)
            f, b, n, focal, box_cell = loss_terms(box_raw, cls_raw, P, BT, CT, IG)
            f_sum += float(f.double())
            b_sum += float(b.double())
            npos += int(n)
            ignored += int(IG.sum())
            samples += len(idx)
            per_class += focal.double().sum(dim=(0, 2))
            pos_focal = (focal * CT).sum(dim=1).double()  # [N,A]: the positive class's term at its cells
            cb = dev["CB"][idx]
            for k, name in enumerate(BUCKET_NAMES):
                sel = cb == k
                per_bucket[name]["cells"] += int(sel.sum())
                per_bucket[name]["positiveClassFocal"] += float(pos_focal[sel].sum())
                per_bucket[name]["box"] += float(box_cell.double()[sel].sum())
    model.train()
    if samples != dev["n"] or npos != int(dev["P"].sum()):
        raise TrainingFailure("F3", f"the DEV pass covered {samples} samples / {npos} positive cells, not {dev['n']} / {int(dev['P'].sum())}")
    total = f_sum / npos + box_weight * b_sum / npos
    import math

    if not all(math.isfinite(v) for v in (total, f_sum, b_sum)):
        raise TrainingFailure("F1", "non-finite DEV loss")
    pos_focal_all = sum(v["positiveClassFocal"] for v in per_bucket.values())
    return {
        "loss": total,
        "cls": f_sum / npos,
        "box": b_sum / npos,
        "positiveCells": npos,
        "ignoredEntries": ignored,
        "samples": samples,
        "clsByClass": {c: float(per_class[i]) / npos for i, c in enumerate(CLASSES)},
        "backgroundClsShare": (f_sum - pos_focal_all) / f_sum if f_sum else None,
        "bySizeBucket": {k: {"cells": v["cells"], "positiveClassFocalPerCell": v["positiveClassFocal"] / v["cells"] if v["cells"] else None,
                             "boxPerCell": v["box"] / v["cells"] if v["cells"] else None} for k, v in per_bucket.items()},
    }


def _finite_state(model, opt):
    import torch

    for p in model.parameters():
        if not torch.isfinite(p).all():
            return False
    for st in opt.state.values():
        for v in st.values():
            if isinstance(v, torch.Tensor) and v.is_floating_point() and not torch.isfinite(v).all():
                return False
    return True


def _rng_state(rng):
    import random

    import torch

    return {"python": random.getstate(), "numpy": rng.bit_generator.state, "torch": torch.get_rng_state()}


def _write_checkpoint(path, payload, model):
    """Atomic: written to `.partial`, flushed, fsynced, renamed (never over an existing file), reloaded
    with weights_only and verified. Returns (sha256, bytes)."""
    import torch

    if os.path.lexists(path) or os.path.lexists(path + ".partial"):
        raise TrainingFailure("F7", f"{os.path.basename(path)} already exists: checkpoints are never overwritten")
    with open(path + ".partial", "wb") as f:
        torch.save(payload, f)
        f.flush()
        os.fsync(f.fileno())
    os.rename(path + ".partial", path)
    sha = _sha256_file(path)
    verify_checkpoint(path, sha, model.state_dict(), {k: payload[k] for k in ("epoch", "globalStep", "runConfigSha256", "datasetHashes", "t1ReferenceSha256")})
    return sha, os.path.getsize(path)


def verify_checkpoint(path, sha, reference_state, metadata):
    import torch

    if _sha256_file(path) != sha:
        raise TrainingFailure("F7", f"{os.path.basename(path)}: SHA-256 differs from the ledger")
    try:
        ck = torch.load(path, map_location="cpu", weights_only=True)
    except Exception as e:
        raise TrainingFailure("F7", f"{os.path.basename(path)} does not load: {type(e).__name__}") from e
    need = {"epoch", "globalStep", "model", "optimizer", "scheduler", "bestDevLoss", "bestEpoch", "earlyStopping", "rng", "datasetHashes", "runConfigSha256", "ignoreMask", "t1ReferenceSha256", "runId"}
    if not need <= set(ck):
        raise TrainingFailure("F7", f"{os.path.basename(path)} lacks {sorted(need - set(ck))}")
    model = ck["model"]
    if set(model) != set(reference_state) or any(tuple(model[k].shape) != tuple(reference_state[k].shape) for k in model):
        raise TrainingFailure("F7", f"{os.path.basename(path)}: the model state does not match UiHead")
    if any(v.is_floating_point() and not torch.isfinite(v).all() for v in model.values()):
        raise TrainingFailure("F7", f"{os.path.basename(path)}: non-finite weights")
    for k, v in metadata.items():
        if ck[k] != v:
            raise TrainingFailure("F7", f"{os.path.basename(path)}: {k} is {ck[k]!r}, expected {v!r}")
    return ck


def run_training(repo_root, candidate_n, g10_config, g10_evidence, build_config, run_config, run_id, resume=False, t1_expected=T1_EXPECTED_SHA256, _hooks=None):
    """
    The one authorised v2 training run (M22.13). Repeats the full pre-flight, then trains with the
    approved configuration exactly as validated. Returns the final run record. On a failure condition
    it stops, records FAILED with the condition, and raises TrainingFailure; on an interruption it
    records INTERRUPTED (resumable under the same run id) and re-raises.
    """
    hooks = _hooks or {}
    with open(run_config, "r", encoding="utf-8") as f:
        cfg = validate_run_config(json.load(f))
    a = cfg["approval"]
    if a.get("approved") is not True or not a.get("approvedBy") or not a.get("approvedOn"):
        raise SafetyError("training needs an APPROVED run configuration (approval.approved, approvedBy, approvedOn)")
    models = os.path.join(repo_root, "artifacts", "models")
    if not resume and os.path.isdir(models) and any(d.startswith(OUTPUT_PREFIX) for d in os.listdir(models)):
        raise SafetyError("a v2 run directory already exists: the authorisation covers one run; resume it or ask the owner")

    plan = preflight(repo_root, candidate_n, g10_config, g10_evidence, build_config, run_config, run_id, t1_expected, resume=resume)
    prov = plan["provenanceRecordPlan"]
    if not prov["gitCommit"] or prov["gitTrackedChanges"]:
        raise SafetyError("training needs a committed, clean tracked tree: the run record names the exact code")
    out = os.path.join(repo_root, *prov["outputDirectory"].split("/"))
    root = candidate_root(repo_root, candidate_n)
    cand_before = candidate_fingerprint(root)
    t1_ref = plan["t1"]["before"]
    run_sha = prov["runConfigSha256"]
    dataset_hashes = {"train": prov["trainManifestSha256"], "dev": prov["devManifestSha256"]}
    record_path = os.path.join(out, "run-record.json")

    import random

    import numpy as np
    import torch
    from head import UiHead
    from loss_v2 import LossInputError, detector_loss_v2

    if resume:
        with open(record_path, "r", encoding="utf-8") as f:
            record = json.load(f)
        if record.get("status") != "INTERRUPTED":
            raise SafetyError(f"only an INTERRUPTED run resumes; this one is {record.get('status')}: owner review")
        for k, v in (("runConfigSha256", run_sha), ("datasetHashes", dataset_hashes), ("gitCommit", prov["gitCommit"]), ("g10", prov["g10"]), ("candidateFingerprint", cand_before), ("runId", run_id)):
            if record.get(k) != v:
                raise SafetyError(f"resume refused: {k} differs from the interrupted run's")
    else:
        os.makedirs(out)
        record = {
            "runId": run_id, "status": "STARTED", "label": "UNADOPTED",
            "authorisation": "M22.13 owner authorisation: one 40-epoch training run on candidate 2",
            "startedAt": _now(), "completedAt": None, "gitCommit": prov["gitCommit"], "gitTrackedChanges": False,
            "dataset": prov["dataset"], "datasetHashes": dataset_hashes, "candidateFingerprint": cand_before, "g10": prov["g10"],
            "runConfig": cfg, "runConfigSha256": run_sha, "schemaVersion": cfg["schemaVersion"],
            "architecture": cfg["architecture"], "seed": cfg["seed"], "environment": prov["environment"], "t1ReferenceSha256": t1_ref,
            "preflight": {"plan": plan["runConfiguration"]["plan"], "tensorCheck": plan["tensorCheck"], "acceptance": plan["acceptance"]},
            "epochs": [], "checkpoints": [], "best": None, "earlyStopping": None, "sessions": [], "failure": None,
        }
    record["sessions"].append({"startedAt": _now(), "resume": resume})
    _write_json_atomic(record_path, record)

    def fail(code, message):
        record["status"] = "FAILED"
        record["failure"] = {"code": code, "message": message, "at": _now()}
        _write_json_atomic(record_path, record)
        raise TrainingFailure(code, message)

    try:
        E, B = cfg["epochs"]["max"], cfg["batchSize"]
        spe, max_steps = cfg["steps"]["perEpoch"], cfg["steps"]["max"]
        o, es_cfg, w = cfg["optimizer"], cfg["earlyStopping"], cfg["loss"]["boxWeight"]
        ignore = cfg["loss"]["partialOcclusion"] == "ignore-mask"

        torch.set_num_threads(cfg["determinism"]["cpuThreads"])
        torch.use_deterministic_algorithms(True)  # never warn_only: a non-deterministic op raises
        random.seed(cfg["seed"])
        torch.manual_seed(cfg["seed"])
        rng = np.random.default_rng(cfg["seed"])

        train = load_train(root, G10Policy.from_files(g10_config, g10_evidence))
        dev = load_dev(root, G10Policy.from_files(g10_config, g10_evidence))
        tc = plan["tensorCheck"]
        exp = {s: {"samples": tc[s]["samples"], "positiveCells": tc[s]["positiveCells"], "ignoredEntries": tc[s]["ignoreMask"]["ignoredEntries"] if ignore else 0} for s in ("train", "dev")}
        t_train = prepare_split(root, train, exp["train"])
        t_dev = prepare_split(root, dev, exp["dev"])
        if not ignore:
            t_train["IG"].zero_()
            t_dev["IG"].zero_()
        record["dataAccounting"] = {
            "train": t_train["accounting"], "dev": t_dev["accounting"],
            "excludedOcclusion": {s: {k: plan[s]["excluded"][k] for k in ("occlusion-partial", "occlusion-full")} for s in ("train", "dev")},
            "note": "very-small objects are reported separately: in TRAIN 25.9 % of them have no grid-cell centre inside their box and train through the nearest cell (M22.11)",
        }

        model = UiHead(width=tuple(cfg["architecture"]["width"]))
        opt = torch.optim.AdamW(model.parameters(), lr=o["learningRate"], weight_decay=o["weightDecay"])
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg["schedule"]["tMaxSteps"], eta_min=cfg["schedule"]["etaMin"])
        record["modelParameters"] = sum(p.numel() for p in model.parameters())
        record["torch"] = {"threads": torch.get_num_threads(), "interopThreads": torch.get_num_interop_threads(), "deterministicAlgorithms": torch.are_deterministic_algorithms_enabled(),
                           "mkldnn": bool(torch.backends.mkldnn.is_available()), "device": "cpu"}
        start_epoch, global_step = 1, 0
        best, best_epoch = None, None
        es = {"bestForPatience": None, "sinceImprovement": 0, "wouldStopAtEpoch": None, "action": es_cfg["action"]}

        if resume:
            if not record["checkpoints"]:
                raise SafetyError("the interrupted run has no verified checkpoint to resume from: owner review")
            listed = {c["file"] for c in record["checkpoints"]}
            stray = sorted(f for f in os.listdir(out) if (f.startswith("checkpoint-") and f not in listed) or f.endswith(".partial"))
            if stray:
                raise SafetyError(f"resume refused: checkpoint files outside the ledger {stray}: owner review")
            last = record["checkpoints"][-1]
            ck = verify_checkpoint(os.path.join(out, last["file"]), last["sha256"], model.state_dict(), {"epoch": last["epoch"], "runConfigSha256": run_sha, "datasetHashes": dataset_hashes, "t1ReferenceSha256": t1_ref})
            if ck["globalStep"] != ck["epoch"] * spe:
                raise SafetyError(f"resume refused: checkpoint step {ck['globalStep']} is not epoch {ck['epoch']} x {spe}")
            model.load_state_dict(ck["model"])
            opt.load_state_dict(ck["optimizer"])
            sched.load_state_dict(ck["scheduler"])
            random.setstate(ck["rng"]["python"])
            rng.bit_generator.state = ck["rng"]["numpy"]
            torch.set_rng_state(ck["rng"]["torch"])
            start_epoch, global_step = ck["epoch"] + 1, ck["globalStep"]
            best, best_epoch, es = ck["bestDevLoss"], ck["bestEpoch"], dict(ck["earlyStopping"])
            record["epochs"] = record["epochs"][: ck["epoch"]]
            record["checkpoints"] = record["checkpoints"][: ck["epoch"]]
            record["resumed"] = record.get("resumed", []) + [{"fromEpoch": ck["epoch"], "at": _now()}]

        record["status"] = "STARTED"
        _write_json_atomic(record_path, record)
        model.train()
        for epoch in range(start_epoch, E + 1):
            t0 = time.time()
            order = rng.permutation(t_train["n"])
            if not np.array_equal(np.sort(order), np.arange(t_train["n"])):
                fail("F3", f"epoch {epoch}: the TRAIN order is not a permutation")
            losses, clss, boxes, norms, lrs, steps_log = [], [], [], [], [], []
            consumed = pos_cells = ign = clipped = 0
            for b in range(spe):
                if global_step >= max_steps or sched.last_epoch != global_step:
                    fail("F3", f"step accounting: global step {global_step}, scheduler step {sched.last_epoch}, max {max_steps}")
                idx = torch.from_numpy(order[b * B:(b + 1) * B].copy())
                if len(idx) != B:
                    fail("F3", f"epoch {epoch} batch {b}: {len(idx)} samples, not {B}")
                X, P, BT, CT, IG = _batch(t_train, idx)
                box_raw, cls_raw = model(X)
                try:
                    loss, cls_l, box_l = detector_loss_v2(box_raw, cls_raw, P, BT, CT, IG, box_weight=w)
                except LossInputError as e:
                    fail("F1", f"epoch {epoch} step {global_step}: {e}")
                if not torch.isfinite(loss):
                    fail("F1", f"epoch {epoch} step {global_step}: non-finite training loss")
                opt.zero_grad(set_to_none=True)
                loss.backward()
                try:
                    gn = float(torch.nn.utils.clip_grad_norm_(model.parameters(), o["gradientClipNorm"], error_if_nonfinite=True))
                except RuntimeError as e:
                    fail("F2", f"epoch {epoch} step {global_step}: non-finite gradient ({type(e).__name__})")
                if gn == 0.0:
                    fail("F2", f"epoch {epoch} step {global_step}: zero gradient norm")
                lr = opt.param_groups[0]["lr"]
                opt.step()
                sched.step()
                global_step += 1
                consumed += len(idx)
                pos_cells += int(P.sum())
                ign += int(IG.sum())
                clipped += gn > o["gradientClipNorm"]
                lv, cv, bv = float(loss.detach()), float(cls_l), float(box_l)
                losses.append(lv)
                clss.append(cv)
                boxes.append(bv)
                norms.append(gn)
                lrs.append(lr)
                steps_log.append({"step": global_step, "lr": lr, "loss": lv, "cls": cv, "box": bv, "gradNorm": gn})
                if "after_step" in hooks:
                    hooks["after_step"](epoch, global_step)
            if consumed != t_train["n"] or pos_cells != int(t_train["P"].sum()) or ign != int(t_train["IG"].sum()):
                fail("F3", f"epoch {epoch}: consumed {consumed} samples, {pos_cells} positive cells, {ign} ignored entries")
            if not _finite_state(model, opt):
                fail("F2", f"epoch {epoch}: non-finite weights or optimizer state")
            train_seconds = time.time() - t0
            d = dev_loss(model, t_dev, B, w)
            improved = best is None or d["loss"] < best  # strict: a tie keeps the earlier epoch
            if improved:
                best, best_epoch = d["loss"], epoch
            if es["bestForPatience"] is None or d["loss"] < es["bestForPatience"] - es_cfg["minDelta"]:
                es["bestForPatience"], es["sinceImprovement"] = d["loss"], 0
            else:
                es["sinceImprovement"] += 1
                if es["wouldStopAtEpoch"] is None and es["sinceImprovement"] >= es_cfg["patience"]:
                    es["wouldStopAtEpoch"] = epoch  # record-only: the run continues
            with open(os.path.join(out, f"steps-e{epoch:02d}.jsonl"), "w", encoding="utf-8", newline="\n") as f:
                for row in steps_log:
                    f.write(json.dumps(row, allow_nan=False) + "\n")
            payload = {
                "runId": run_id, "epoch": epoch, "globalStep": global_step, "model": model.state_dict(), "optimizer": opt.state_dict(),
                "scheduler": sched.state_dict(), "bestDevLoss": best, "bestEpoch": best_epoch, "earlyStopping": dict(es), "rng": _rng_state(rng),
                "datasetHashes": dataset_hashes, "runConfigSha256": run_sha, "ignoreMask": {"mode": cfg["loss"]["partialOcclusion"], "trainEntries": int(t_train["IG"].sum()), "devEntries": int(t_dev["IG"].sum())},
                "t1ReferenceSha256": t1_ref,
            }
            name = f"checkpoint-e{epoch:02d}.pt"
            sha, size = _write_checkpoint(os.path.join(out, name), payload, model)
            if check_t1(repo_root, t1_expected) != t1_ref:
                fail("F6", "the T1 artifact changed")
            record["checkpoints"].append({"epoch": epoch, "file": name, "sha256": sha, "bytes": size, "verified": True})
            record["epochs"].append({
                "epoch": epoch, "globalStep": global_step, "lrFirst": lrs[0], "lrLast": lrs[-1], "lrAfter": opt.param_groups[0]["lr"],
                "train": {"lossMean": sum(losses) / len(losses), "clsMean": sum(clss) / len(clss), "boxMean": sum(boxes) / len(boxes), "lossMin": min(losses), "lossMax": max(losses),
                          "samples": consumed, "steps": len(losses), "positiveCells": pos_cells, "ignoredEntries": ign},
                "gradNorm": {"mean": sum(norms) / len(norms), "min": min(norms), "max": max(norms), "clippedSteps": clipped},
                "dev": d, "devImproved": improved, "bestEpoch": best_epoch, "bestDevLoss": best, "earlyStopping": dict(es),
                "seconds": {"train": train_seconds, "total": time.time() - t0}, "memory": peak_memory(), "checkpointSha256": sha,
            })
            record["best"] = {"epoch": best_epoch, "devLoss": best, "file": f"checkpoint-e{best_epoch:02d}.pt",
                              "sha256": next(c["sha256"] for c in record["checkpoints"] if c["epoch"] == best_epoch), "rule": cfg["checkpoint"]["best"]}
            record["earlyStopping"] = dict(es)
            _write_json_atomic(record_path, record)
            _write_json_atomic(os.path.join(out, "best-checkpoint.json"), record["best"])
            print(json.dumps({"epoch": epoch, "step": global_step, "train": round(record["epochs"][-1]["train"]["lossMean"], 6), "dev": round(d["loss"], 6), "best": best_epoch, "seconds": round(record["epochs"][-1]["seconds"]["total"], 1)}), file=sys.stderr, flush=True)
            if "after_epoch" in hooks:
                hooks["after_epoch"](epoch)

        if global_step != max_steps or sched.last_epoch != max_steps or len(record["epochs"]) != E:
            fail("F3", f"the run ended at step {global_step} (scheduler {sched.last_epoch}) after {len(record['epochs'])} epochs, not {max_steps} / {E}")
        for c in record["checkpoints"]:
            verify_checkpoint(os.path.join(out, c["file"]), c["sha256"], model.state_dict(), {"epoch": c["epoch"], "runConfigSha256": run_sha, "datasetHashes": dataset_hashes, "t1ReferenceSha256": t1_ref})
        if candidate_fingerprint(root) != cand_before:
            fail("F4", "the candidate changed during the run")
        if check_t1(repo_root, t1_expected) != t1_ref:
            fail("F6", "the T1 artifact changed")
        record.update(status="COMPLETED", completedAt=_now(), stopEpoch=E, optimizerSteps=global_step, finalLearningRate=opt.param_groups[0]["lr"], schedulerStep=sched.last_epoch)
        record["sessions"][-1]["endedAt"] = _now()
        _write_json_atomic(record_path, record)
        return record
    except TrainingFailure as e:
        if record.get("status") != "FAILED":  # raised outside fail(), e.g. a checkpoint that does not verify
            record["status"] = "FAILED"
            record["failure"] = {"code": e.code, "message": str(e), "at": _now()}
            _write_json_atomic(record_path, record)
        raise
    except SafetyError as e:
        fail("F6", str(e))
    except KeyboardInterrupt:
        record["status"] = "INTERRUPTED"
        record["sessions"][-1]["endedAt"] = _now()
        _write_json_atomic(record_path, record)
        raise
    except Exception as e:  # F13: recorded by type only (no paths, no stack data)
        if record.get("status") != "FAILED":
            record["status"] = "FAILED"
            record["failure"] = {"code": "F13", "message": type(e).__name__, "at": _now()}
            _write_json_atomic(record_path, record)
        raise


def main(argv=None):
    ap = argparse.ArgumentParser(description="v2 training entry point: --preflight (writes nothing) or --train (the one M22.13-authorised run)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--preflight", action="store_true", help="check everything; build no model; write nothing")
    mode.add_argument("--train", action="store_true", help="the authorised training run: an APPROVED configuration, a clean tree, one run")
    ap.add_argument("--resume", action="store_true", help="with --train: resume an INTERRUPTED run under the same run id")
    ap.add_argument("--candidate", type=int, required=True)
    ap.add_argument("--g10-config", required=True)
    ap.add_argument("--g10-evidence", required=True)
    ap.add_argument("--build-config", required=True)
    ap.add_argument("--run-config", required=True)
    ap.add_argument("--run-id", required=True)
    args = ap.parse_args(argv)
    if args.resume and not args.train:
        print("REFUSING: --resume needs --train", file=sys.stderr)
        return 3
    if not (args.preflight or args.train):
        print("REFUSING: choose --preflight or --train; nothing runs by default", file=sys.stderr)
        return 3
    common = (REPO_ROOT, args.candidate, args.g10_config, args.g10_evidence, args.build_config, args.run_config, args.run_id)
    if args.preflight:
        plan = preflight(*common)
        print(PREFLIGHT_ONLY, file=sys.stderr)
        print(json.dumps(plan, indent=2, allow_nan=False))
        return 0
    try:
        record = run_training(*common, resume=args.resume)
    except TrainingFailure as e:
        print(f"FAILED: {e} (the run record is kept; nothing is retried)", file=sys.stderr)
        return 4
    except KeyboardInterrupt:
        print("INTERRUPTED: the run record is kept; resume with --train --resume and the same run id", file=sys.stderr)
        return 5
    summary = {k: record[k] for k in ("runId", "status", "stopEpoch", "optimizerSteps", "best", "startedAt", "completedAt")}
    print(json.dumps(summary, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AdapterError, SafetyError) as e:
        print(f"REFUSING: {e}", file=sys.stderr)
        sys.exit(2)
