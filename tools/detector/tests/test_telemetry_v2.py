"""
M22.15 — training telemetry (`telemetry_v2`). Pure tests with injected clocks and in-memory values; the
only real OS calls are this process's own memory and tick counters. No model, no training, no
inference, no dataset, no TEST.
"""

import ast
import hashlib
import json
import math
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DETECTOR = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(DETECTOR))
sys.path.insert(0, DETECTOR)

import telemetry_v2 as tel  # noqa: E402

WINDOWS = sys.platform == "win32"


def snap(perf, cpu, ticks=None, utc="2026-11-03T00:00:00.000000Z", err=None):
    return {"utc": utc, "perf": perf, "cpu": cpu, "ticks": ticks, "ticksError": err if ticks is None else None}


# ── timing ────────────────────────────────────────────────────────────────────────────────────


def test_interval_measures_elapsed_and_cpu_and_derives_the_thread_share():
    r = tel.interval(snap(10.0, 2.0, (1_000, 0), utc="a"), snap(30.0, 82.0, (21_000, 200_000_000), utc="b"), cpu_threads=8)
    assert r["startedAt"] == "a" and r["endedAt"] == "b"
    assert r["elapsedSeconds"] == tel.measured(20.0, "s", r["elapsedSeconds"]["source"]) and "perf_counter" in r["elapsedSeconds"]["source"]
    assert r["processCpuSeconds"]["value"] == 80.0 and r["processCpuSeconds"]["kind"] == tel.MEASURED
    assert r["cpuShareOfConfiguredThreads"]["kind"] == tel.DERIVED and math.isclose(r["cpuShareOfConfiguredThreads"]["value"], 80.0 / (20.0 * 8))
    # 20 s of GetTickCount64 against 20 s of unbiased interrupt time: nothing suspended.
    assert r["systemSuspendedSeconds"]["kind"] == tel.DERIVED and r["systemSuspendedSeconds"]["value"] == 0.0
    tel.validate(r)


def test_suspended_time_is_the_biased_minus_unbiased_difference():
    # 3,600 s by GetTickCount64 (includes suspension), 600 s by QueryUnbiasedInterruptTime (excludes it).
    r = tel.interval(snap(0.0, 0.0, (0, 0)), snap(3600.0, 100.0, (3_600_000, 600 * 10**7)))
    assert r["systemSuspendedSeconds"]["value"] == 3000.0 and "GetTickCount64" in r["systemSuspendedSeconds"]["basis"]
    assert "cpuShareOfConfiguredThreads" not in r  # no thread count given: not derived


def test_missing_suspend_evidence_is_explicitly_unavailable():
    r = tel.interval(snap(0.0, 0.0, None, err="no suspend-aware tick pair on platform 'linux'"), snap(1.0, 0.5, None, err="x"))
    assert r["systemSuspendedSeconds"] == tel.unavailable("no suspend-aware tick pair on platform 'linux'")
    tel.validate(r)


@pytest.mark.parametrize("start, end", [(snap(5.0, 0.0), snap(4.0, 1.0)), (snap(0.0, 2.0), snap(1.0, 1.0)), (snap(0.0, 0.0), snap(float("nan"), 0.0))])
def test_a_clock_going_backwards_or_non_finite_is_refused(start, end):
    with pytest.raises(tel.TelemetryError, match="backwards or is not finite"):
        tel.interval(start, end)


def test_clocks_snapshot_uses_the_injected_clocks_and_reports_tick_failures():
    c = tel.Clocks(perf=lambda: 1.5, cpu=lambda: 0.25, utc=lambda: "T", ticks=lambda: (7, 9))
    assert c.snapshot() == {"utc": "T", "perf": 1.5, "cpu": 0.25, "ticks": (7, 9), "ticksError": None, "errors": []}

    def broken():
        raise OSError("QueryUnbiasedInterruptTime failed, Win32 error 5")

    s = tel.Clocks(perf=lambda: 1.0, cpu=lambda: 0.0, utc=lambda: "T", ticks=broken).snapshot()
    assert s["ticks"] is None and "Win32 error 5" in s["ticksError"]
    s = tel.Clocks(platform_name="linux").snapshot()
    assert s["ticks"] is None and "no suspend-aware tick pair" in s["ticksError"]

    def bad_perf():
        raise OSError("clock unavailable")

    s = tel.Clocks(perf=bad_perf, cpu=lambda: 0.0, utc=lambda: "T", ticks=lambda: (1, 2)).snapshot()  # M22.16: never raises
    assert s["perf"] is None and s["errors"] == ["perf: OSError: clock unavailable"]
    with pytest.raises(tel.TelemetryError, match="snapshot incomplete: start perf: OSError"):
        tel.interval(s, s)
    assert tel.observe(lambda: tel.interval(s, s))["kind"] == tel.UNAVAILABLE


@pytest.mark.skipif(not WINDOWS, reason="the Windows tick pair")
def test_the_real_windows_tick_pair_is_read_through_prototyped_calls():
    a = tel.Clocks().snapshot()
    b = tel.Clocks().snapshot()
    assert a["ticks"] and b["ticks"] and b["ticks"][0] >= a["ticks"][0] and b["ticks"][1] >= a["ticks"][1]
    r = tel.interval(a, b, cpu_threads=8)
    assert r["systemSuspendedSeconds"]["kind"] == tel.DERIVED and abs(r["systemSuspendedSeconds"]["value"]) < 1.0
    tel.validate(r)


def test_step_summary_quantiles_and_slowest_step_are_exact():
    d = [0.2, 0.1, 0.4, 0.4, 0.3] + [0.1] * 15  # 20 steps
    r = tel.step_summary(d)
    assert r["steps"] == 20
    assert math.isclose(r["totalSeconds"]["value"], sum(d)) and math.isclose(r["meanSeconds"]["value"], sum(d) / 20)
    assert r["minSeconds"]["value"] == 0.1 and r["maxSeconds"]["value"] == 0.4
    assert r["p50Seconds"]["value"] == 0.1  # nearest rank: the 10th of 20 sorted values
    assert r["p95Seconds"]["value"] == 0.4  # the 19th of 20
    assert r["slowestStepInEpoch"]["value"] == 3  # ties keep the earlier step
    tel.validate(r)


def test_step_summary_refuses_bad_durations_and_reports_none_timed():
    assert tel.step_summary([]) == {"steps": 0, "summary": tel.unavailable("no step was timed")}
    for bad in ([0.1, -0.1], [0.1, float("nan")], [0.1, True]):
        with pytest.raises(tel.TelemetryError):
            tel.step_summary(bad)


def test_epoch_ratios_against_the_median():
    r = tel.epoch_ratios([100.0, 200.0, 400.0])
    assert [x["value"] for x in r] == [0.5, 1.0, 2.0] and all(x["kind"] == tel.DERIVED for x in r)
    assert [x["value"] for x in tel.epoch_ratios([100.0, 300.0])] == [0.5, 1.5]  # even count: mean of the middle two
    assert tel.epoch_ratios([]) == [] and tel.epoch_ratios([0.0, 0.0])[0]["kind"] == tel.UNAVAILABLE


# ── memory ────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.skipif(not WINDOWS, reason="the Windows memory API")
def test_windows_memory_is_measured_through_prototyped_calls():
    m = tel.process_memory()
    assert m["workingSet"]["kind"] == m["peakWorkingSet"]["kind"] == m["privateBytes"]["kind"] == tel.MEASURED
    assert 0 < m["workingSet"]["value"] <= m["peakWorkingSet"]["value"] and m["privateBytes"]["value"] > 0
    assert "process lifetime" in m["peakScope"]
    tel.validate(m)


@pytest.mark.skipif(not WINDOWS, reason="the M22.13 defect is a Windows ctypes defect")
def test_the_m22_13_defect_is_real_an_unprototyped_call_overflows_the_pseudo_handle():
    """The original reader: GetCurrentProcess with restype HANDLE, GetProcessMemoryInfo with no argtypes."""
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32")
    psapi = ctypes.WinDLL("psapi")
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    buf = ctypes.create_string_buffer(80)
    with pytest.raises(ctypes.ArgumentError, match="int too long"):
        psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), buf, 80)


def test_a_failing_os_query_is_reported_with_its_reason_not_a_null(monkeypatch):
    def boom():
        raise OSError("GetProcessMemoryInfo failed, Win32 error 6")

    monkeypatch.setattr(tel, "_windows_counters", boom)
    m = tel.process_memory("win32")
    assert m["workingSet"]["kind"] == tel.UNAVAILABLE and "Win32 error 6" in m["workingSet"]["reason"]
    assert m["peakWorkingSet"] == m["workingSet"] and m["privateBytes"] == m["workingSet"]
    tel.validate(m)


def test_an_unsupported_platform_is_explicitly_unavailable():
    m = tel.process_memory("sunos5")
    assert all(m[k] == tel.unavailable("no supported memory API on platform 'sunos5'") for k in ("workingSet", "peakWorkingSet", "privateBytes"))
    tel.validate(m)


def test_linux_status_parsing_and_its_failures(tmp_path, monkeypatch):
    good = tmp_path / "status"
    good.write_text("Name:\tpython\nVmHWM:\t  2048 kB\nVmRSS:\t  1024 kB\n", encoding="ascii")
    assert tel._linux_status(str(good)) == {"VmRSS": 1024 * 1024, "VmHWM": 2048 * 1024}
    bad = tmp_path / "bad"
    bad.write_text("VmRSS:\t1024 kB\n", encoding="ascii")
    with pytest.raises(OSError, match="missing"):
        tel._linux_status(str(bad))
    monkeypatch.setattr(tel, "_linux_status", lambda: {"VmRSS": 1024, "VmHWM": 4096})
    m = tel.process_memory("linux")
    assert m["workingSet"]["value"] == 1024 and m["peakWorkingSet"]["value"] == 4096 and m["privateBytes"]["kind"] == tel.UNAVAILABLE
    monkeypatch.setattr(tel, "_linux_status", lambda: (_ for _ in ()).throw(OSError("no /proc")))
    assert "no /proc" in tel.process_memory("linux")["workingSet"]["reason"]


def test_macos_path_is_peak_only_or_explicitly_unavailable():
    m = tel.process_memory("darwin")
    assert m["workingSet"]["kind"] == tel.UNAVAILABLE
    try:
        import resource  # noqa: F401

        assert m["peakWorkingSet"]["kind"] == tel.MEASURED
    except ImportError:  # not importable here (e.g. Windows): said so, not hidden
        assert m["peakWorkingSet"]["kind"] == tel.UNAVAILABLE and "No module named 'resource'" in m["peakWorkingSet"]["reason"]
    tel.validate(m)


# ── validation and serialisation ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "bad, message",
    [
        (tel.measured(float("nan"), "s", "x"), "finite"),
        (tel.measured(float("inf"), "bytes", "x"), "finite"),
        (tel.measured(True, "s", "x"), "finite"),
        (tel.measured(-1.0, "s", "x"), "negative"),
        ({"kind": "measured", "value": 1, "unit": "s"}, "exactly"),
        ({"kind": "measured", "value": 1, "unit": "s", "source": "x", "extra": 1}, "exactly"),
        (tel.measured(1, "", "x"), "non-empty"),
        (tel.derived(1.0, "s", ""), "non-empty"),
        (tel.unavailable(""), "non-empty reason"),
        ({"kind": "unavailable"}, "non-empty reason"),
        ({"kind": "guessed", "value": 1}, "unknown kind"),
        ({"memory": None}, "bare null"),
        ({"epochs": [1.0, float("nan")]}, "non-finite"),
        ({"x": object()}, "strict JSON"),
    ],
)
def test_invalid_or_incomplete_telemetry_is_refused(bad, message):
    with pytest.raises(tel.TelemetryError, match=message):
        tel.validate(bad)


def test_a_derived_value_may_be_negative_timer_tick_noise_is_reported_as_is():
    assert tel.validate(tel.derived(-0.015, "s", "tick difference")) == tel.derived(-0.015, "s", "tick difference")


def test_checked_turns_an_invalid_observation_into_an_explicit_unavailable():
    assert tel.checked(tel.measured(1.0, "s", "x")) == tel.measured(1.0, "s", "x")
    r = tel.checked({"memory": None})
    assert r["kind"] == tel.UNAVAILABLE and r["reason"].startswith("telemetry rejected:")


def test_epoch_telemetry_serialises_to_strict_json_and_round_trips():
    a, b, c = snap(0.0, 0.0, (0, 0)), snap(100.0, 600.0, (100_000, 10**9)), snap(130.0, 700.0, (130_000, 13 * 10**8))
    t = {"epoch": tel.interval(a, c, 8), "train": tel.interval(a, b, 8), "dev": tel.interval(b, c, 8), "steps": tel.step_summary([0.5, 0.7, 0.6]),
         "memory": tel.process_memory("sunos5"), "hardware": tel.hardware(8, 10)}
    tel.validate(t)
    s = json.dumps(t, allow_nan=False, sort_keys=True)
    assert json.loads(s) == json.loads(json.dumps(t, sort_keys=True))


def test_hardware_metadata_states_threads_device_and_clocks():
    h = tel.hardware(8, 10, "cpu")
    assert h["device"] == "cpu" and h["torchThreads"] == 8 and h["torchInteropThreads"] == 10
    assert isinstance(h["logicalCpus"], int) and h["clocks"]["perf_counter"]["monotonic"] is True and h["clocks"]["time"]["adjustable"] is True
    assert tel.hardware()["torchThreads"] == tel.unavailable("not recorded")
    tel.validate(h)


# ── compatibility and preservation ────────────────────────────────────────────────────────────


def test_the_run_configurations_are_unchanged_and_still_valid():
    import train_v2
    from data_v2 import canonical_sha256

    pins = {"train-v2-first-run.APPROVED.json": "e2cd897ce8837a181a2f99ff12e4793433069fc7ea52931fcdb333732c2aa248",
            "train-v2-first-run.PROPOSED.json": "2cb331b505d958d74b55fe8df5b46c8f0c7b964f6dbf2c09366770e621ef3d8b"}
    for name, want in pins.items():
        with open(os.path.join(DETECTOR, "configs", name), "r", encoding="utf-8") as f:
            cfg = json.load(f)
        assert canonical_sha256(cfg) == want, name
        assert train_v2.validate_run_config(cfg) is cfg


def test_the_m22_13_run_record_is_unchanged():
    p = os.path.join(REPO, "artifacts", "experiments", "M22.13-first-training-run", "logs", "w1-run-record-first-run-01.json")
    with open(p, "rb") as f:
        body = f.read().replace(b"\r\n", b"\n")  # the committed bytes, whatever the checkout's line endings
    assert hashlib.sha256(body).hexdigest() == "035045c3687bef39c8d31239a1811677e71bb3c8c6a9fa262fca91dfcc28be14"


def _tree(name):
    with open(os.path.join(DETECTOR, name), "r", encoding="utf-8") as f:
        return ast.parse(f.read())


def test_the_trainer_times_with_a_monotonic_clock_and_reads_memory_only_through_telemetry():
    tree = _tree("train_v2.py")
    calls = [(getattr(c.func, "value", None), getattr(c.func, "attr", getattr(c.func, "id", ""))) for c in ast.walk(tree) if isinstance(c, ast.Call)]
    assert not any(attr == "time" and getattr(v, "id", "") == "time" for v, attr in calls), "time.time() is adjustable: not for durations"
    names = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
    assert "peak_memory" not in names  # the defective reader is gone
    refs = {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
    assert {"process_memory", "interval"} <= refs  # memory and timing come from telemetry_v2 ...
    assert not any(attr in ("checked",) for _, attr in calls)  # ... and every observation goes through observe (M22.16)
    assert sum(1 for _, attr in calls if attr == "observe") >= 9


def test_telemetry_never_swallows_errors_silently():
    for h in (n for n in ast.walk(_tree("telemetry_v2.py")) if isinstance(n, ast.ExceptHandler)):
        assert h.type is not None, "a bare except"
        caught = [h.type] if not isinstance(h.type, ast.Tuple) else list(h.type.elts)
        assert not any(getattr(t, "id", "") in ("Exception", "BaseException") for t in caught), "a catch-all"
        assert not (len(h.body) == 1 and isinstance(h.body[0], ast.Return) and getattr(h.body[0].value, "value", 0) is None), "returns null"
