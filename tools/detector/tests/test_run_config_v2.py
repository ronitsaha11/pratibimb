"""
M22.12 — the schema-2 run configuration (`train_v2.validate_run_config`) and the canonical first-run
proposal (`configs/train-v2-first-run.PROPOSED.json`). Validation only: nothing is executed, no model,
no optimizer, no data.
"""

import copy
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DETECTOR = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(DETECTOR))
sys.path.insert(0, DETECTOR)

import train_v2  # noqa: E402
from test_data_v2 import read_json  # noqa: E402

PROPOSED = os.path.join(DETECTOR, "configs", "train-v2-first-run.PROPOSED.json")
PROPOSED_M22_9 = os.path.join(DETECTOR, "configs", "train-v2-first-experiment.PROPOSED.json")
M22_10_FINAL = os.path.join(REPO, "artifacts", "experiments", "M22.10-first-training-spec", "final-configuration.PROPOSED.json")


def cfg():
    return read_json(PROPOSED)


def test_the_canonical_proposal_validates_and_is_not_modified():
    c = cfg()
    before = copy.deepcopy(c)
    assert train_v2.validate_run_config(c) is c and c == before
    assert train_v2.validate_run_config(copy.deepcopy(c)) == before  # deterministic: same input, same verdict


def test_the_canonical_proposal_holds_exactly_the_reconciled_first_run_values():
    c = cfg()
    assert c["approval"]["approved"] is False and c["status"].startswith("PROPOSED")
    assert (c["epochs"]["max"], c["steps"]["max"], c["batchSize"], c["steps"]["perEpoch"], c["devEvaluation"]["batches"]) == (40, 6000, 4, 150, 40)
    assert c["checkpoint"] == {"everyEpochs": 1, "retention": "all", "best": "strict-min-dev-loss"}
    assert c["earlyStopping"]["action"] == "record-only" and c["devEvaluation"]["everyEpochs"] == 1 and c["devEvaluation"]["lossAggregation"] == "dataset-sum"
    assert c["schedule"] == {"name": "cosine", "tMaxSteps": 6000, "etaMin": 0, "stepEvery": "optimizer-step", "warmup": "none"}
    assert c["seed"] == 20261102 and c["determinism"] == {"deterministicAlgorithms": "required", "cpuThreads": 8}
    assert c["optimizer"]["nonFiniteGradient"] == "fail"


def test_inherited_values_are_those_the_m22_10_final_configuration_records():
    """Nothing new slipped in: every carried-over value equals the M22.10 record's."""
    f = read_json(M22_10_FINAL)["fields"]
    c = cfg()
    assert c["architecture"]["model"] == f["architecture.model"]["value"] and c["architecture"]["width"] == f["architecture.width"]["value"]
    assert c["architecture"]["inputSize"] == f["architecture.inputSize"]["value"] and c["architecture"]["stride"] == f["architecture.stride"]["value"]
    assert c["architecture"]["classes"] == f["architecture.classes"]["value"]
    assert c["batchSize"] == f["batchSize"]["value"]
    assert c["optimizer"]["name"] == f["optimizer.name"]["value"] and c["optimizer"]["learningRate"] == f["optimizer.learningRate"]["value"]
    assert c["optimizer"]["weightDecay"] == f["optimizer.weightDecay"]["value"] and c["optimizer"]["gradientClipNorm"] == f["optimizer.gradientClipNorm"]["value"]
    assert c["epochs"]["max"] == f["epochs.max"]["value"] and c["steps"]["perEpoch"] == f["stepsPerEpoch"]["value"] and c["steps"]["max"] == f["maxSteps"]["value"]
    assert c["seed"] == f["seed"]["value"] and c["determinism"]["cpuThreads"] == f["determinism.numThreads"]["value"]
    assert c["schedule"]["etaMin"] == f["schedule"]["value"]["etaMin"] and f["schedule"]["value"]["warmup"] == c["schedule"]["warmup"]
    loss = f["loss"]["value"]
    assert (c["loss"]["function"], c["loss"]["boxWeight"]) == (loss["function"], loss["boxWeight"])
    assert f["earlyStopping"]["value"]["option"] == "A"  # record only, the M22.10 recommendation
    assert "patience 5, minDelta 0.001" in f["earlyStopping"]["value"]["mode"] and (c["earlyStopping"]["patience"], c["earlyStopping"]["minDelta"]) == (5, 0.001)


def test_the_m22_9_schema_1_proposal_is_refused():
    with pytest.raises(train_v2.SafetyError, match="schemaVersion"):
        train_v2.validate_run_config(read_json(PROPOSED_M22_9))


def test_record_only_and_stop_are_both_expressible():
    for action in train_v2.EARLY_STOPPING_ACTIONS:
        c = cfg()
        c["earlyStopping"]["action"] = action
        assert train_v2.validate_run_config(c)["earlyStopping"]["action"] == action


@pytest.mark.parametrize(
    "spoil, message",
    [
        (lambda c: c.update(schemaVersion="train-v2-run-config/1"), "schemaVersion"),
        (lambda c: c.pop("schemaVersion"), "schemaVersion"),
        (lambda c: c.pop("steps"), "lacks"),
        (lambda c: c.pop("determinism"), "lacks"),
        (lambda c: c.pop("devEvaluation"), "lacks"),
        (lambda c: c.update(steps=[150, 6000]), "objects"),
        # early-stopping action
        (lambda c: c["earlyStopping"].pop("action"), "earlyStopping.action"),
        (lambda c: c["earlyStopping"].update(action="stop-early"), "earlyStopping.action"),
        # DEV evaluation frequency and loss aggregation
        (lambda c: c["devEvaluation"].update(everyEpochs=0), "devEvaluation"),
        (lambda c: c["devEvaluation"].update(everyEpochs=41), "devEvaluation"),
        (lambda c: c["devEvaluation"].update(batches=0), "devEvaluation"),
        (lambda c: c["devEvaluation"].update(lossAggregation="mean-of-batches"), "devEvaluation"),
        (lambda c: c["devEvaluation"].pop("lossAggregation"), "devEvaluation"),
        # checkpoint frequency and retention
        (lambda c: c["checkpoint"].update(everyEpochs=0), "checkpoint.everyEpochs"),
        (lambda c: c["checkpoint"].update(everyEpochs=41), "checkpoint.everyEpochs"),
        (lambda c: c["checkpoint"].update(retention="last-only"), "checkpoint.retention"),
        (lambda c: c["checkpoint"].update(best="min-dev-loss"), "checkpoint.best"),
        (lambda c: (c["devEvaluation"].update(everyEpochs=2), c["checkpoint"].update(everyEpochs=3)), "multiple of devEvaluation"),
        # determinism and CPU threads
        (lambda c: c["determinism"].update(deterministicAlgorithms="warn"), "determinism"),
        (lambda c: c["determinism"].update(cpuThreads=0), "determinism"),
        (lambda c: c["determinism"].update(cpuThreads=True), "determinism"),
        (lambda c: c["determinism"].update(cpuThreads="8"), "determinism"),
        # non-finite gradient policy
        (lambda c: c["optimizer"].update(nonFiniteGradient="skip"), "nonFiniteGradient"),
        (lambda c: c["optimizer"].pop("nonFiniteGradient"), "nonFiniteGradient"),
        (lambda c: c["optimizer"].update(gradientClipNorm=0), "gradientClipNorm"),
        # exact maximum optimizer steps, and the schedule ending on it
        (lambda c: c["steps"].update(max=5999), "steps.max"),
        (lambda c: c["steps"].update(perEpoch=True), "steps.perEpoch"),
        (lambda c: c["schedule"].update(tMaxSteps=4000), "tMaxSteps"),
        (lambda c: c["schedule"].update(name="step"), "schedule"),
        (lambda c: c["schedule"].update(warmup="linear-500"), "schedule"),
        (lambda c: c["schedule"].update(etaMin=-1), "etaMin"),
        (lambda c: c["schedule"].update(etaMin=0.003), "etaMin"),
        # loss supervision mode, seed type
        (lambda c: c["loss"].update(partialOcclusion="drop-samples"), "partialOcclusion"),
        (lambda c: c["loss"].pop("partialOcclusion"), "partialOcclusion"),
        (lambda c: c.update(seed=True), "seed"),
    ],
)
def test_every_schema_2_field_is_validated_without_defaults(spoil, message):
    c = cfg()
    spoil(c)
    with pytest.raises(train_v2.SafetyError, match=message):
        train_v2.validate_run_config(c)


def test_a_shorter_consistent_schedule_is_accepted():
    """Consistency is checked, not the canonical numbers: 10 epochs x 150 steps with tMax 1500 is valid."""
    c = cfg()
    c["epochs"]["max"], c["steps"]["max"], c["schedule"]["tMaxSteps"] = 10, 1500, 1500
    assert train_v2.validate_run_config(c) is c


APPROVED = os.path.join(DETECTOR, "configs", "train-v2-first-run.APPROVED.json")


def test_the_approved_first_run_configuration_is_the_proposal_with_only_the_approval_recorded():
    """M22.13: the owner approved the M22.12 proposal for one run. Nothing else may differ."""
    a, p = read_json(APPROVED), cfg()
    assert train_v2.validate_run_config(a) is a
    assert a["approval"]["approved"] is True and a["approval"]["approvedBy"] == "project owner" and a["approval"]["approvedOn"] == "2026-11-03"
    assert a["status"].startswith("APPROVED")
    assert {k: v for k, v in a.items() if k not in ("status", "approval")} == {k: v for k, v in p.items() if k not in ("status", "approval")}
    assert a["loss"]["partialOcclusion"] == "ignore-mask"
