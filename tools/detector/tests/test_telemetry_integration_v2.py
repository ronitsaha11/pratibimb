"""
M22.16 — integration assurance for the M22.15 telemetry inside `train_v2.run_training`.

THE HARNESS RUNS THE REAL `run_training` CONTROL FLOW WITH EVERY TRAINING, MODEL, DATA AND
CHECKPOINT OPERATION REPLACED BY A TEST DOUBLE:
  - pre-flight, the candidate root and fingerprint, the G10 policy, TRAIN/DEV loading and tensor
    preparation, the DEV loss, the checkpoint writer and verifier, and the T1 hash check are fakes;
  - `head.UiHead` is a fake model (no parameters, no convolution); the optimizer, the scheduler, the
    loss, gradient clipping and `Tensor.backward` are fakes that only count calls;
  - the real adapter, `data.sample_to_tensors`, `torch.load` and `torch.save` are trapped and fail the
    test if reached;
  - every clock (monotonic, process CPU, UTC, the Windows tick pair) and the memory reader are fakes
    driven by the test, so every expected telemetry value is exact.
Nothing real is trained, inferred, loaded, read or saved; the only file writes are the run record and
its step logs, in pytest's temp directory. No TEST.
"""

import datetime
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DETECTOR = os.path.dirname(HERE)
sys.path.insert(0, DETECTOR)

import telemetry_v2 as tel  # noqa: E402
import train_v2  # noqa: E402
from test_data_v2 import read_json, write_json  # noqa: E402

APPROVED = os.path.join(DETECTOR, "configs", "train-v2-first-run.APPROVED.json")
A, C, N_TRAIN, N_DEV = 4, 8, 3, 2
STEP_SECONDS = (0.5, 1.5, 0.5)  # each epoch's three steps, as the fake model consumes them
DEV_SECONDS, CKPT_SECONDS = 10.0, 2.0
CPU_PER_SECOND = {"train": 4.0, "dev": 1.0, "checkpoint": 1.0}  # process CPU seconds per elapsed second
THREADS = 8  # the configuration's cpuThreads: the utilisation denominator


class FakeClock:
    """perf (s), process CPU (s), GetTickCount64 (ms) and QueryUnbiasedInterruptTime (100 ns): the
    tick pair advances together except while 'suspended', when only the biased counter moves."""

    def __init__(self):
        self.perf, self.cpu, self.biased_ms, self.unbiased = 1000.0, 50.0, 7_000_000, 900_000_000_000
        self.base = datetime.datetime(2026, 11, 3, tzinfo=datetime.timezone.utc)
        self.phase = "train"
        self.broken = {}

    def advance(self, seconds, suspended=0.0):
        self.perf += seconds
        self.cpu += (seconds - suspended) * CPU_PER_SECOND[self.phase]
        self.biased_ms += round(seconds * 1000)
        self.unbiased += round((seconds - suspended) * 10**7)

    def perf_fn(self):
        return self.perf

    def cpu_fn(self):
        return self.broken.get("cpu", self.cpu)

    def utc_fn(self):
        return (self.base + datetime.timedelta(seconds=self.perf - 1000.0)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    def ticks_fn(self):
        return self.broken.get("ticks", (self.biased_ms, self.unbiased))


class Harness:
    def __init__(self, tmp_path, monkeypatch, *, ticks=True, memory="windows", dev_suspend=None, sabotage=None, fail_at_step=None):
        import torch

        self.tmp, self.mp, self.clock = tmp_path, monkeypatch, FakeClock()
        self.calls = {"model": 0, "backward": 0, "opt_step": 0, "zero_grad": 0, "sched_step": 0, "checkpoints": [], "dev": 0, "clip": 0}
        self.dev_suspend = dev_suspend or {}  # epoch -> suspended seconds during its DEV phase
        self.sabotage = sabotage or {}  # epoch -> callable(clock), applied during DEV
        self.fail_at_step = fail_at_step
        self.root = str(tmp_path / "repo")
        os.makedirs(os.path.join(self.root, "artifacts", "models"))
        cfg = read_json(APPROVED)  # the approved schema-2 configuration, resized for the fake data
        cfg["batchSize"] = 1
        cfg["epochs"]["max"] = 2
        cfg["steps"] = {"perEpoch": N_TRAIN, "max": 2 * N_TRAIN}
        cfg["schedule"]["tMaxSteps"] = 2 * N_TRAIN
        cfg["devEvaluation"]["batches"] = N_DEV
        assert cfg["determinism"]["cpuThreads"] == THREADS
        self.run_config = str(tmp_path / "run.json")
        write_json(self.run_config, cfg)
        self.out = os.path.join(self.root, "artifacts", "models", "t1-ui-head-v2-harness-01")
        h = self

        # ── traps: reaching any real data, model or weight operation fails the test ──
        def trap(name):
            def f(*a, **k):
                raise AssertionError(f"harness reached the real {name}")
            return f

        import data
        import data_v2

        monkeypatch.setattr(data_v2, "load_split", trap("adapter (data_v2.load_split)"))
        monkeypatch.setattr(train_v2, "load_accepted_split", trap("adapter (load_accepted_split)"))
        monkeypatch.setattr(data, "sample_to_tensors", trap("data.sample_to_tensors"))
        monkeypatch.setattr(torch, "load", trap("torch.load"))
        monkeypatch.setattr(torch, "save", trap("torch.save"))
        monkeypatch.setattr(torch, "set_num_threads", lambda n: None)  # no process-wide side effect
        monkeypatch.setattr(torch, "use_deterministic_algorithms", lambda *a, **k: None)
        monkeypatch.setattr(torch, "set_rng_state", lambda state: None)  # a resume restores RNG state: no global side effect

        # ── pre-flight, data and checkpoint doubles ──
        plan = {
            "provenanceRecordPlan": {"gitCommit": "f" * 40, "gitTrackedChanges": False, "outputDirectory": "artifacts/models/t1-ui-head-v2-harness-01",
                                     "runConfigSha256": "c" * 64, "trainManifestSha256": "a" * 64, "devManifestSha256": "b" * 64,
                                     "dataset": {"version": "fake"}, "g10": {"version": "fake"}, "environment": {"python": "fake"}},
            "t1": {"before": "e" * 64},
            "tensorCheck": {s: {"samples": n, "positiveCells": n * 2, "ignoreMask": {"ignoredEntries": 0}} for s, n in (("train", N_TRAIN), ("dev", N_DEV))},
            "runConfiguration": {"plan": {"fake": True}}, "acceptance": {"claimed": True},
            "train": {"excluded": {"occlusion-partial": 0, "occlusion-full": 0}}, "dev": {"excluded": {"occlusion-partial": 0, "occlusion-full": 0}},
        }
        monkeypatch.setattr(train_v2, "preflight", lambda *a, **k: plan)
        monkeypatch.setattr(train_v2, "candidate_root", lambda repo_root, n: os.path.join(repo_root, "fake-candidate"))
        monkeypatch.setattr(train_v2, "candidate_fingerprint", lambda root: {"fake": 1})
        monkeypatch.setattr(train_v2, "check_t1", lambda repo_root, expected=None: "e" * 64)

        class FakeG10:
            @staticmethod
            def from_files(*a):
                return "fake-g10"

        monkeypatch.setattr(train_v2, "G10Policy", FakeG10)
        monkeypatch.setattr(train_v2, "load_train", lambda root, g10: "fake-train")
        monkeypatch.setattr(train_v2, "load_dev", lambda root, g10: "fake-dev")

        def fake_tensors(root, data_obj, expected):
            n = expected["samples"]
            P = torch.zeros((n, A), dtype=torch.bool)
            P[:, :2] = True
            return {"X": torch.zeros((n, 1, 1, 1), dtype=torch.uint8), "P": P, "BT": torch.zeros((n, A, 4)), "CT": torch.zeros((n, A, C)),
                    "IG": torch.zeros((n, A, C), dtype=torch.bool), "CB": torch.zeros((n, A), dtype=torch.int8), "n": n,
                    "accounting": {"samples": n, "positiveCells": 2 * n, "ignoredEntries": 0}}

        monkeypatch.setattr(train_v2, "prepare_split", fake_tensors)

        def fake_dev(model, dev, batch, w):
            h.calls["dev"] += 1
            h.clock.phase = "dev"
            e = h.calls["dev"]
            if e in h.sabotage:
                h.sabotage[e](h.clock)
            h.clock.advance(DEV_SECONDS, suspended=h.dev_suspend.get(e, 0.0))
            h.clock.phase = "checkpoint"
            return {"loss": 3.0 - 0.5 * e, "cls": 0.3, "box": 0.4, "positiveCells": 4, "ignoredEntries": 0, "samples": N_DEV}

        monkeypatch.setattr(train_v2, "dev_loss", fake_dev)

        self.store = {}

        def fake_write(path, payload, model):
            assert not os.path.exists(path)
            h.calls["checkpoints"].append(dict(payload))
            h.store[os.path.basename(path)] = dict(payload)
            h.clock.advance(CKPT_SECONDS)
            h.clock.phase = "train"
            return "%064x" % payload["epoch"], 1000 + payload["epoch"]

        monkeypatch.setattr(train_v2, "_write_checkpoint", fake_write)
        monkeypatch.setattr(train_v2, "verify_checkpoint", lambda path, sha, ref, meta: h.store.get(os.path.basename(path), {}))

        # ── model, loss and optimisation doubles ──
        class FakeModel:
            def __init__(self, width=None):
                self.training = True

            def __call__(self, X):
                h.calls["model"] += 1
                h.clock.advance(STEP_SECONDS[(h.calls["model"] - 1) % len(STEP_SECONDS)])
                return torch.zeros((X.shape[0], 4, 2, 2)), torch.zeros((X.shape[0], C, 2, 2))

            def train(self, mode=True):
                self.training = mode

            def eval(self):
                self.training = False

            def parameters(self):
                return iter(())

            def state_dict(self):
                return {}

            def load_state_dict(self, state):
                pass

        class FakeOpt:
            def __init__(self, params, lr, weight_decay):
                self.param_groups, self.state = [{"lr": lr}], {}

            def zero_grad(self, set_to_none=True):
                h.calls["zero_grad"] += 1

            def step(self):
                h.calls["opt_step"] += 1

            def state_dict(self):
                return {"fake": True}

            def load_state_dict(self, state):
                assert state == {"fake": True}

        class FakeSched:
            def __init__(self, opt, T_max, eta_min):
                self.opt, self.last_epoch, self.T_max = opt, 0, T_max

            def step(self):
                self.last_epoch += 1
                self.opt.param_groups[0]["lr"] *= 0.5
                h.calls["sched_step"] += 1

            def state_dict(self):
                return {"last_epoch": self.last_epoch}

            def load_state_dict(self, state):
                self.last_epoch = state["last_epoch"]

        import head
        import loss_v2

        monkeypatch.setattr(head, "UiHead", FakeModel)
        monkeypatch.setattr(torch.optim, "AdamW", FakeOpt)
        monkeypatch.setattr(torch.optim.lr_scheduler, "CosineAnnealingLR", FakeSched)

        def fake_loss(*a, **k):
            step = h.calls["model"]
            v = float("nan") if step == h.fail_at_step else 1.0 / step
            return torch.tensor(v), torch.tensor(0.3), torch.tensor(0.1)

        monkeypatch.setattr(loss_v2, "detector_loss_v2", fake_loss)
        monkeypatch.setattr(torch.Tensor, "backward", lambda self, *a, **k: h.calls.__setitem__("backward", h.calls["backward"] + 1))

        def fake_clip(params, max_norm, error_if_nonfinite=False):
            h.calls["clip"] += 1
            return torch.tensor(12.0 if h.calls["clip"] == 2 else 2.5)

        monkeypatch.setattr(torch.nn.utils, "clip_grad_norm_", fake_clip)

        # ── telemetry sources: the fake clock, and a scripted memory reader ──
        real_clocks = tel.Clocks
        monkeypatch.setattr(tel, "Clocks", lambda: real_clocks(perf=h.clock.perf_fn, cpu=h.clock.cpu_fn, utc=h.clock.utc_fn,
                                                                ticks=h.clock.ticks_fn if ticks else None, platform_name="win32" if ticks else "linux"))
        import time

        self.step_faults = {}  # (global step, "start" | "stop") -> "raise" | "nan" | "text" | "backwards"
        self._reading = None
        real_timer = tel.StepTimer

        class HarnessStepTimer(real_timer):
            """The real StepTimer; it only tells the harness which step and which read is happening."""

            def _read(self, when):
                h._reading = (len(h.calls["checkpoints"]) * N_TRAIN + self._step, when)
                return super()._read(when)

        monkeypatch.setattr(tel, "StepTimer", HarnessStepTimer)

        def step_clock():  # what StepTimer reads at the start and the end of every step
            fault = h.step_faults.get(h._reading)
            if fault == "raise":
                raise OSError(f"injected clock failure at step {h._reading[0]} {h._reading[1]}")
            if fault == "nan":
                return float("nan")
            if fault == "text":
                return "not a time"
            if fault == "backwards":
                return h.clock.perf - 100.0
            return h.clock.perf

        monkeypatch.setattr(time, "perf_counter", step_clock)  # the per-step timer in run_training
        real_memory = tel.process_memory
        script = iter([{"workingSet": 100_000_000, "peakWorkingSet": 150_000_000, "private": 90_000_000}])

        def counters():  # epoch 1: real counters; afterwards: the OS call fails
            try:
                return next(script)
            except StopIteration:
                raise OSError("GetProcessMemoryInfo failed, Win32 error 6") from None

        monkeypatch.setattr(tel, "_windows_counters", counters)
        if memory == "raise":
            def boom():
                raise TypeError("a malformed counter structure")

            monkeypatch.setattr(tel, "process_memory", boom)
        else:
            plat = "win32" if memory == "windows" else "sunos5"
            monkeypatch.setattr(tel, "process_memory", lambda: real_memory(plat))

    def run(self, resume=False, hooks=None):
        return train_v2.run_training(self.root, 2, "g10.json", "g10-evidence.json", "build.json", self.run_config, "harness-01",
                                     resume=resume, t1_expected="e" * 64, _hooks=hooks)

    def restart(self, perf=5.0):
        """A new process: a fresh fake clock whose monotonic values are SMALLER than the last
        session's, as after a restart; UTC continues forward."""
        old = self.clock
        new = FakeClock()
        new.perf, new.cpu, new.biased_ms, new.unbiased = perf, 1.0, 1_000, 10_000
        new.base = old.base + datetime.timedelta(seconds=(old.perf - 1000.0) + 3600.0 - (perf - 1000.0))
        self.clock = new

    def record_text(self):
        with open(os.path.join(self.out, "run-record.json"), "r", encoding="utf-8") as f:
            return f.read()

    def record_strict(self):
        def no_constants(c):
            raise AssertionError(f"non-strict JSON constant {c}")

        return json.loads(self.record_text(), parse_constant=no_constants)

    def algorithm_trace(self, rec):
        """What the training algorithm did, independent of telemetry."""
        return {
            "calls": {k: v for k, v in self.calls.items() if k != "checkpoints"},
            "payloads": [(p["epoch"], p["globalStep"], p["bestEpoch"], p["bestDevLoss"], sorted(p)) for p in self.calls["checkpoints"]],
            "status": rec["status"], "steps": rec.get("optimizerSteps"),
            "epochs": [(e["epoch"], e["globalStep"], e["train"]["lossMean"], e["dev"]["loss"], e["gradNorm"]["clippedSteps"], e["bestEpoch"]) for e in rec["epochs"]],
        }


def val(x):
    assert x["kind"] in (tel.MEASURED, tel.DERIVED), x
    return x["value"]


# ── the complete lifecycle, with exact expected telemetry ─────────────────────────────────────


def test_the_full_lifecycle_records_exact_telemetry(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch, dev_suspend={2: 7.0})
    rec = h.run()
    assert rec["status"] == "COMPLETED" and rec["optimizerSteps"] == 6
    assert h.calls["model"] == 6 and h.calls["backward"] == 6 and h.calls["opt_step"] == 6 and h.calls["sched_step"] == 6 and len(h.calls["checkpoints"]) == 2
    train_s, epoch_s = sum(STEP_SECONDS), sum(STEP_SECONDS) + DEV_SECONDS + CKPT_SECONDS
    for e in rec["epochs"]:
        t = e["timing"]
        tel.validate(t)
        # Timestamps: UTC, at the fake clock's instants, and contiguous phase boundaries.
        assert t["epoch"]["startedAt"] == t["train"]["startedAt"] and t["train"]["endedAt"] == t["dev"]["startedAt"]
        assert t["dev"]["endedAt"] == t["checkpoint"]["startedAt"] and t["checkpoint"]["endedAt"] == t["epoch"]["endedAt"]
        assert all(t[p]["startedAt"].endswith("Z") and t[p]["startedAt"] < t[p]["endedAt"] for p in ("epoch", "train", "dev", "checkpoint"))
        # Monotonic elapsed time: exact, non-negative, phases summing to the epoch.
        for p, want in (("train", train_s), ("dev", DEV_SECONDS), ("checkpoint", CKPT_SECONDS), ("epoch", epoch_s)):
            assert t[p]["elapsedSeconds"]["kind"] == tel.MEASURED and "perf_counter" in t[p]["elapsedSeconds"]["source"] and t[p]["elapsedSeconds"]["unit"] == "s"
            assert val(t[p]["elapsedSeconds"]) == want >= 0
        assert val(t["train"]["elapsedSeconds"]) + val(t["dev"]["elapsedSeconds"]) + val(t["checkpoint"]["elapsedSeconds"]) == val(t["epoch"]["elapsedSeconds"])
        assert e["seconds"] == {"train": train_s, "total": epoch_s}  # the compatibility field, from the same monotonic clock
        # Process CPU: measured, in seconds, labelled with its source.
        assert t["train"]["processCpuSeconds"] == tel.measured(train_s * CPU_PER_SECOND["train"], "s", t["train"]["processCpuSeconds"]["source"])
        assert "process_time" in t["train"]["processCpuSeconds"]["source"]
        # Thread share: CPU seconds / (elapsed seconds x the CONFIGURED threads), derived, a fraction.
        share = t["train"]["cpuShareOfConfiguredThreads"]
        assert share["kind"] == tel.DERIVED and share["unit"] == "fraction" and f"x {THREADS} configured threads" in share["basis"]
        assert val(share) == CPU_PER_SECOND["train"] / THREADS == 0.5
        # Per-step summary.
        st = t["steps"]
        assert st["steps"] == 3 and val(st["totalSeconds"]) == train_s and val(st["meanSeconds"]) == train_s / 3
        assert (val(st["minSeconds"]), val(st["p50Seconds"]), val(st["p95Seconds"]), val(st["maxSeconds"]), val(st["slowestStepInEpoch"])) == (0.5, 0.5, 1.5, 1.5, 2)
    # Windows suspend evidence: ms and 100 ns units reconciled; only epoch 2's DEV phase was suspended.
    t1, t2 = rec["epochs"][0]["timing"], rec["epochs"][1]["timing"]
    assert [val(t1[p]["systemSuspendedSeconds"]) for p in ("train", "dev", "checkpoint", "epoch")] == [0.0, 0.0, 0.0, 0.0]
    assert [val(t2[p]["systemSuspendedSeconds"]) for p in ("train", "dev", "checkpoint", "epoch")] == [0.0, 7.0, 0.0, 7.0]
    assert t2["dev"]["systemSuspendedSeconds"]["kind"] == tel.DERIVED and "QueryUnbiasedInterruptTime" in t2["dev"]["systemSuspendedSeconds"]["basis"]
    assert val(t2["dev"]["processCpuSeconds"]) == (DEV_SECONDS - 7.0) * CPU_PER_SECOND["dev"]  # no CPU while suspended
    # Memory keeps its status: measured in epoch 1, unavailable (with the OS error) in epoch 2.
    m1, m2 = rec["epochs"][0]["memory"], rec["epochs"][1]["memory"]
    assert m1["workingSet"] == tel.measured(100_000_000, "bytes", m1["workingSet"]["source"]) and val(m1["peakWorkingSet"]) == 150_000_000
    assert m2["workingSet"]["kind"] == tel.UNAVAILABLE and "Win32 error 6" in m2["workingSet"]["reason"]
    assert "process lifetime" in m1["peakScope"]
    # Session and run.
    s = rec["sessions"][0]["timing"]
    assert val(s["elapsedSeconds"]) == 2 * epoch_s and val(s["systemSuspendedSeconds"]) == 7.0
    assert [val(r) for r in rec["timing"]["epochElapsedRatioToMedian"]] == [1.0, 1.0] and rec["timing"]["sessions"] == 1
    assert rec["hardware"]["device"] == "cpu" and rec["hardware"]["clocks"]["perf_counter"]["monotonic"] is True
    # Strict JSON round trip of the written record, and the checkpoint payload carries no telemetry.
    strict = h.record_strict()
    assert strict["epochs"][1]["timing"] == t2 and json.loads(json.dumps(strict, allow_nan=False)) == strict
    expected_payload = {"runId", "epoch", "globalStep", "model", "optimizer", "scheduler", "bestDevLoss", "bestEpoch", "earlyStopping", "rng", "datasetHashes", "runConfigSha256", "ignoreMask", "t1ReferenceSha256"}
    assert all(set(p) == expected_payload for p in h.calls["checkpoints"])


def test_unsupported_platforms_are_explained_in_the_record(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch, ticks=False, memory="unsupported")
    rec = h.run()
    for e in rec["epochs"]:
        for p in ("epoch", "train", "dev", "checkpoint"):
            sus = e["timing"][p]["systemSuspendedSeconds"]
            assert sus["kind"] == tel.UNAVAILABLE and "no suspend-aware tick pair on platform 'linux'" in sus["reason"]
            assert e["timing"][p]["elapsedSeconds"]["kind"] == tel.MEASURED  # the rest is still measured
        assert all(e["memory"][k] == tel.unavailable("no supported memory API on platform 'sunos5'") for k in ("workingSet", "peakWorkingSet", "privateBytes"))
    for e in h.record_strict()["epochs"]:  # the telemetry fields, not the whole record (which has its own nulls)
        tel.validate({"timing": e["timing"], "memory": e["memory"]})


# ── malformed telemetry: never a valid number, never a change to training ─────────────────────


def _clean_trace(tmp_path, monkeypatch):
    h = Harness(tmp_path / "clean", monkeypatch)
    return h.algorithm_trace(h.run())


def backwards(clock):
    clock.perf -= 20.0  # the monotonic clock "goes backwards" during DEV


def nan_cpu(clock):
    clock.broken["cpu"] = float("nan")


def garbage_ticks(clock):
    clock.broken["ticks"] = ("not", "numbers")


def nan_ticks(clock):
    clock.broken["ticks"] = (float("nan"), 0)


@pytest.mark.parametrize("sabotage", [backwards, nan_cpu, garbage_ticks, nan_ticks])
def test_malformed_clocks_become_explicitly_unavailable_and_training_is_unchanged(tmp_path, monkeypatch, sabotage):
    clean = _clean_trace(tmp_path, monkeypatch)
    monkeypatch.undo()
    h = Harness(tmp_path / "broken", monkeypatch, sabotage={1: sabotage})
    rec = h.run()
    assert h.algorithm_trace(rec) == clean  # same calls, steps, losses, payloads and status
    strict = h.record_strict()  # no NaN or infinity reached the record
    for e in strict["epochs"]:
        tel.validate(e["timing"])
        tel.validate(e["seconds"])
    t = strict["epochs"][0]["timing"]
    assert t["dev"]["kind"] == tel.UNAVAILABLE and t["dev"]["reason"].startswith("telemetry")
    assert t["train"]["elapsedSeconds"]["kind"] == tel.MEASURED  # the unaffected phase is kept


def test_a_failing_memory_reader_does_not_change_training(tmp_path, monkeypatch):
    clean = _clean_trace(tmp_path, monkeypatch)
    monkeypatch.undo()
    h = Harness(tmp_path / "broken", monkeypatch, memory="raise")
    rec = h.run()
    assert h.algorithm_trace(rec) == clean
    assert all(e["memory"]["kind"] == tel.UNAVAILABLE and "TypeError" in e["memory"]["reason"] for e in rec["epochs"])


def test_a_training_failure_keeps_its_own_code_even_when_telemetry_breaks(tmp_path, monkeypatch):
    def break_everything(clock):
        clock.perf -= 1e6
        clock.broken["ticks"] = None

    h = Harness(tmp_path, monkeypatch, fail_at_step=5, sabotage={1: break_everything})
    with pytest.raises(train_v2.TrainingFailure, match="F1"):
        h.run()
    rec = h.record_strict()  # persisted, strict JSON
    assert rec["status"] == "FAILED" and rec["failure"]["code"] == "F1"
    assert rec["sessions"][0]["timing"]["kind"] == tel.UNAVAILABLE  # the broken clock is reported, not raised
    tel.validate(rec["sessions"][0]["timing"])


def test_an_interruption_records_session_timing(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    monkeypatch.setattr(train_v2, "dev_loss", lambda *a: (_ for _ in ()).throw(KeyboardInterrupt()))
    with pytest.raises(KeyboardInterrupt):
        h.run()
    rec = h.record_strict()
    assert rec["status"] == "INTERRUPTED" and val(rec["sessions"][0]["timing"]["elapsedSeconds"]) == sum(STEP_SECONDS)


def test_the_harness_reaches_no_real_model_data_or_weights(tmp_path, monkeypatch):
    h = Harness(tmp_path, monkeypatch)
    h.run()
    written = sorted(os.listdir(h.out))
    assert written == ["best-checkpoint.json", "run-record.json", "steps-e01.jsonl", "steps-e02.jsonl"]  # no weight file
    assert not os.path.exists(os.path.join(h.root, "fake-candidate"))
