"""
M22.17 — per-step timing failures and multi-session resume, through the M22.16 fake-only harness.

The real `run_training` control flow runs with every model, optimizer, scheduler, loss, gradient,
data, checkpoint and clock operation replaced by a test double (see `test_telemetry_integration_v2`):
no model is built, no checkpoint is read or written, no data is read, and the training CLI is never
launched. A "process restart" is a fresh fake clock whose monotonic values are smaller than the last
session's. No TEST.
"""

import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import telemetry_v2 as tel  # noqa: E402
import train_v2  # noqa: E402
from test_telemetry_integration_v2 import CKPT_SECONDS, DEV_SECONDS, STEP_SECONDS, Harness, val  # noqa: E402

EPOCH_S = sum(STEP_SECONDS) + DEV_SECONDS + CKPT_SECONDS


def interrupt_after(epoch_no):
    def hook(epoch):
        if epoch == epoch_no:
            raise KeyboardInterrupt
    return {"after_epoch": hook}


def no_bad_numbers(text):
    def refuse(c):
        raise AssertionError(f"non-strict JSON constant {c}")

    return json.loads(text, parse_constant=refuse)


def all_numbers(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            yield from all_numbers(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_numbers(v)
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        yield obj


# ── per-step timing failures ──────────────────────────────────────────────────────────────────


def test_clock_failures_at_step_start_and_end_leave_those_steps_untimed_and_training_unchanged(tmp_path, monkeypatch):
    clean = Harness(tmp_path / "clean", monkeypatch)
    clean_trace = clean.algorithm_trace(clean.run())
    monkeypatch.undo()
    h = Harness(tmp_path / "faulty", monkeypatch)
    h.step_faults = {(2, "start"): "raise", (4, "stop"): "nan", (5, "stop"): "backwards", (6, "start"): "text"}
    rec = h.run()
    assert h.algorithm_trace(rec) == clean_trace  # every training step ran exactly as without the faults
    s1, s2 = rec["epochs"][0]["timing"]["steps"], rec["epochs"][1]["timing"]["steps"]
    # Epoch 1: steps 1 and 3 timed; step 2's start read failed.
    assert s1["steps"] == 2 and s1["untimedSteps"] == 1 and s1["untimed"] == [{"step": 2, "reason": "start: OSError: injected clock failure at step 2 start"}]
    assert val(s1["totalSeconds"]) == STEP_SECONDS[0] + STEP_SECONDS[2]  # no substituted duration for step 2
    assert val(s1["slowestStepInEpoch"]) in (1, 3)  # named by its real position, never the untimed step 2
    # Epoch 2 (global steps 4-6): NaN at the end of its step 1, a backwards clock at the end of step 2,
    # and a non-numeric read at the start of step 3 - nothing left to time.
    assert s2["steps"] == 0 and s2["summary"]["kind"] == tel.UNAVAILABLE and s2["untimedSteps"] == 3
    assert [u["step"] for u in s2["untimed"]] == [1, 2, 3]
    assert "the clock returned nan" in s2["untimed"][0]["reason"] and "not a finite non-negative" in s2["untimed"][1]["reason"]
    assert "the clock returned 'not a time'" in s2["untimed"][2]["reason"]
    # Phase timing comes from the guarded phase clocks and is unaffected.
    assert all(val(e["timing"]["epoch"]["elapsedSeconds"]) == EPOCH_S for e in rec["epochs"])
    strict = no_bad_numbers(h.record_text())
    # Strict JSON already excludes NaN and infinity; every recorded duration is also non-negative.
    durations = [v["value"] for e in strict["epochs"] for ph in e["timing"].values() if isinstance(ph, dict)
                 for k, v in ph.items() if isinstance(v, dict) and v.get("unit") == "s" and k != "systemSuspendedSeconds"]
    assert durations and all(d >= 0 for d in durations) and all(isinstance(n, (int, float)) for n in all_numbers(strict["epochs"]))
    for e in strict["epochs"]:
        tel.validate(e["timing"])


def test_a_training_failure_in_an_untimed_step_keeps_its_own_code(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch, fail_at_step=2)
    h.step_faults = {(2, "start"): "raise"}
    with pytest.raises(train_v2.TrainingFailure, match="F1"):
        h.run()
    rec = no_bad_numbers(h.record_text())
    assert rec["status"] == "FAILED" and rec["failure"]["code"] == "F1"  # the telemetry fault did not mask it


def test_step_timer_unit_behaviour():
    times = iter([1.0, 1.5, 2.0])
    t = tel.StepTimer(lambda: next(times))
    t.start()
    t.stop()
    t.start()
    with pytest.raises(StopIteration):  # not an observation error: it is not hidden
        t.stop()
    assert t.timed == [(1, 0.5)]


def test_step_timer_never_raises_for_listed_clock_errors():
    def bad():
        raise ValueError("bad clock")

    t = tel.StepTimer(bad)
    for _ in range(3):
        t.start()
        t.stop()
    s = t.summary()
    assert s["steps"] == 0 and s["untimedSteps"] == 3 and all(u["reason"] == "start: ValueError: bad clock" for u in s["untimed"])
    tel.validate(s)


# ── multi-session resume ──────────────────────────────────────────────────────────────────────


def test_a_fresh_session_records_its_index_epochs_hardware_and_timing(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    rec = h.run()
    (ses,) = rec["sessions"]
    assert ses["index"] == 1 and ses["resume"] is False and ses["epochsCompleted"] == [1, 2]
    assert ses["hardware"] == rec["hardware"] and ses["hardware"]["device"] == "cpu"
    assert val(ses["timing"]["elapsedSeconds"]) == 2 * EPOCH_S
    assert [e["session"] for e in rec["epochs"]] == [1, 1]
    t = rec["timing"]
    assert t["sessions"] == 1 and val(t["sessionElapsedSecondsSum"]) == 2 * EPOCH_S
    assert t["betweenSessions"]["kind"] == tel.UNAVAILABLE and "no process was running" in t["betweenSessions"]["reason"]


def test_an_interrupted_then_resumed_run_keeps_history_and_never_crosses_a_restart(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    with pytest.raises(KeyboardInterrupt):
        h.run(hooks=interrupt_after(1))
    before = no_bad_numbers(h.record_text())
    assert before["status"] == "INTERRUPTED" and [e["epoch"] for e in before["epochs"]] == [1]
    assert before["sessions"][0]["epochsCompleted"] == [1] and val(before["sessions"][0]["timing"]["elapsedSeconds"]) == EPOCH_S

    h.restart(perf=5.0)  # a new process: its monotonic clock reads far BELOW the last session's
    rec = h.run(resume=True)
    after = no_bad_numbers(h.record_text())
    assert rec["status"] == "COMPLETED" and rec["optimizerSteps"] == 6
    # History is not overwritten: session 1 and epoch 1 are byte-for-byte what they were.
    assert after["sessions"][0] == before["sessions"][0] and after["epochs"][0] == before["epochs"][0]
    assert after["hardware"] == before["hardware"]  # the run-level hardware stays the first session's
    # The new session, and the epochs it owns.
    s2 = after["sessions"][1]
    assert s2["index"] == 2 and s2["resume"] is True and s2["epochsCompleted"] == [2] and "hardware" in s2
    assert [(e["epoch"], e["session"]) for e in after["epochs"]] == [(1, 1), (2, 2)]  # no duplicate epoch
    # Session-local measurements only: nothing is computed across the restart.
    assert val(s2["timing"]["elapsedSeconds"]) == EPOCH_S and val(after["epochs"][1]["timing"]["epoch"]["elapsedSeconds"]) == EPOCH_S
    assert val(after["timing"]["sessionElapsedSecondsSum"]) == 2 * EPOCH_S  # the sum of the two session-local times
    assert after["timing"]["betweenSessions"]["kind"] == tel.UNAVAILABLE
    for e in after["epochs"]:
        for p in ("epoch", "train", "dev", "checkpoint"):
            assert e["timing"][p]["elapsedSeconds"]["kind"] == tel.MEASURED and val(e["timing"][p]["elapsedSeconds"]) >= 0
    assert after["resumed"][0]["fromEpoch"] == 1


def test_an_interruption_mid_epoch_keeps_completed_epochs_and_the_partial_epoch_is_not_duplicated(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    real_dev = train_v2.dev_loss

    def dev_interrupting_in_epoch_2(model, dev, batch, w):
        if h.calls["dev"] == 1:  # epoch 2's DEV pass, after epoch 1 completed
            raise KeyboardInterrupt
        return real_dev(model, dev, batch, w)

    monkeypatch.setattr(train_v2, "dev_loss", dev_interrupting_in_epoch_2)
    with pytest.raises(KeyboardInterrupt):
        h.run()
    before = no_bad_numbers(h.record_text())
    assert [e["epoch"] for e in before["epochs"]] == [1] and before["sessions"][0]["epochsCompleted"] == [1]
    monkeypatch.setattr(train_v2, "dev_loss", real_dev)
    h.restart()
    rec = h.run(resume=True)
    assert [(e["epoch"], e["session"]) for e in rec["epochs"]] == [(1, 1), (2, 2)] and rec["optimizerSteps"] == 6
    assert rec["sessions"][0] == before["sessions"][0]
    # Session 1 also trained epoch 2's steps before the interruption; that partial epoch has no record.
    assert h.calls["model"] == 9 and val(rec["sessions"][0]["timing"]["elapsedSeconds"]) == EPOCH_S + sum(STEP_SECONDS)


def test_a_missing_measurement_in_a_previous_session_stays_unavailable(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)

    def break_then_interrupt(epoch):
        h.clock.perf -= 1e6  # session 1's closing clock read is unusable
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        h.run(hooks={"after_epoch": break_then_interrupt})
    s1 = no_bad_numbers(h.record_text())["sessions"][0]
    assert s1["timing"]["kind"] == tel.UNAVAILABLE
    h.restart()
    rec = h.run(resume=True)
    assert rec["sessions"][0]["timing"] == s1["timing"]  # still unavailable, never back-filled
    assert val(rec["sessions"][1]["timing"]["elapsedSeconds"]) == EPOCH_S
    assert rec["timing"]["sessionElapsedSecondsSum"] == tel.unavailable("no measured elapsed time for session 1")


def test_three_sessions_serialise_strictly(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    with pytest.raises(KeyboardInterrupt):
        h.run(hooks=interrupt_after(1))
    h.restart(perf=50.0)
    real_dev = train_v2.dev_loss
    monkeypatch.setattr(train_v2, "dev_loss", lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
    with pytest.raises(KeyboardInterrupt):
        h.run(resume=True)  # session 2 is interrupted inside epoch 2: it completes nothing
    monkeypatch.setattr(train_v2, "dev_loss", real_dev)
    h.restart(perf=2.0)
    rec = h.run(resume=True)
    strict = no_bad_numbers(h.record_text())
    assert [s["index"] for s in strict["sessions"]] == [1, 2, 3] and [s["epochsCompleted"] for s in strict["sessions"]] == [[1], [], [2]]
    assert [(e["epoch"], e["session"]) for e in strict["epochs"]] == [(1, 1), (2, 3)]
    elapsed = [val(s["timing"]["elapsedSeconds"]) for s in strict["sessions"]]
    assert elapsed == [EPOCH_S, sum(STEP_SECONDS), EPOCH_S] and val(strict["timing"]["sessionElapsedSecondsSum"]) == sum(elapsed)
    assert json.loads(json.dumps(strict, allow_nan=False)) == strict and rec["status"] == "COMPLETED"
    for s in strict["sessions"]:
        tel.validate({"timing": s["timing"], "hardware": s["hardware"]})


def test_a_telemetry_failure_during_resume_does_not_mask_a_checkpoint_error(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    with pytest.raises(KeyboardInterrupt):
        h.run(hooks=interrupt_after(1))
    s1 = no_bad_numbers(h.record_text())["sessions"][0]
    h.restart()
    h.clock.broken["cpu"] = float("nan")  # every telemetry interval in the resumed session is unusable

    def corrupt(path, sha, ref, meta):
        raise train_v2.TrainingFailure("F7", "checkpoint-e01.pt: SHA-256 differs from the ledger")

    monkeypatch.setattr(train_v2, "verify_checkpoint", corrupt)
    with pytest.raises(train_v2.TrainingFailure, match="F7"):
        h.run(resume=True)
    rec = no_bad_numbers(h.record_text())
    assert rec["status"] == "FAILED" and rec["failure"]["code"] == "F7"
    assert rec["sessions"][0] == s1 and rec["sessions"][1]["index"] == 2 and rec["sessions"][1]["timing"]["kind"] == tel.UNAVAILABLE
    assert [e["epoch"] for e in rec["epochs"]] == [1]


def test_run_timing_unit_behaviour():
    m = lambda v: {"elapsedSeconds": tel.measured(v, "s", "perf")}  # noqa: E731
    r = tel.run_timing([{"index": 1, "timing": m(10.0)}, {"index": 2, "timing": m(5.0)}], [])
    assert val(r["sessionElapsedSecondsSum"]) == 15.0 and "excludes time between sessions" in r["sessionElapsedSecondsSum"]["basis"]
    assert r["epochElapsedRatioToMedian"]["kind"] == tel.UNAVAILABLE  # no epochs
    r = tel.run_timing([{"index": 1, "timing": m(10.0)}, {"index": 2, "timing": tel.unavailable("x")}, {"index": 3}], [])
    assert r["sessionElapsedSecondsSum"] == tel.unavailable("no measured elapsed time for session 2, session 3")
    tel.validate(r)
