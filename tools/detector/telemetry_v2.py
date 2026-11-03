"""
Training telemetry for the v2 pipeline (M22.15). Observation only: nothing here changes what is
trained, how, or what a checkpoint holds. Standard library and the OS's own APIs only.

WHY (M22.13). The first run's in-process memory reader returned null in every epoch. Root cause,
reproduced on W1: `GetCurrentProcess()` with `restype = HANDLE` returns the pseudo-handle as the
unsigned 64-bit integer 2**64 - 1, and `psapi.GetProcessMemoryInfo` was called WITHOUT `argtypes`, so
ctypes tried to pass that integer as a 32-bit C int and raised `ctypes.ArgumentError (OverflowError)`.
A catch-all `except Exception: return None` then hid it. Epoch durations came from `time.time()`,
an adjustable wall clock. Neither can recur here: every OS call has a full prototype, and nothing
returns a bare null.

EVERY VALUE SAYS WHAT IT IS:
  {"kind": "measured",    "value": v, "unit": u, "source": "<the API that produced it>"}
  {"kind": "derived",     "value": v, "unit": u, "basis":  "<how it was computed from measurements>"}
  {"kind": "unavailable", "reason": "<why it could not be measured here>"}
`validate` refuses anything else (a missing reason, a non-finite or boolean value, a negative duration).

WHAT IS MEASURED, AND WITH WHAT (Windows first; other platforms explicit and tested):
  elapsed time      time.perf_counter (QueryPerformanceCounter on Windows): monotonic, not adjustable
  process CPU time  time.process_time (GetProcessTimes): all threads of this process, user + kernel
  UTC timestamps    datetime.now(timezone.utc): labels only, never used for a duration
  memory            Windows: GetProcessMemoryInfo working set, peak working set and private bytes.
                    The peak is the PROCESS-LIFETIME peak: Windows cannot reset it, so a per-epoch
                    peak is unavailable and says so. Linux: /proc/self/status VmRSS and VmHWM.
                    macOS: getrusage ru_maxrss (peak only). Anything else: unavailable, with why.
  suspend evidence  Windows only: GetTickCount64 (documented to include time the system was
                    suspended) minus QueryUnbiasedInterruptTime (documented to exclude it) over an
                    interval. That difference is DERIVED, has the resolution of a timer tick, and
                    is evidence about the interval only - it does not name a cause by itself.
"""

import datetime
import json
import math
import os
import platform
import sys
import time

MEASURED, DERIVED, UNAVAILABLE = "measured", "derived", "unavailable"


class TelemetryError(ValueError):
    """A telemetry value that is malformed: it is refused, never written."""


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def measured(value, unit, source):
    return {"kind": MEASURED, "value": value, "unit": unit, "source": source}


def derived(value, unit, basis):
    return {"kind": DERIVED, "value": value, "unit": unit, "basis": basis}


def unavailable(reason):
    return {"kind": UNAVAILABLE, "reason": reason}


DURATION_UNITS = ("s",)


def validate(obj):
    """Every tagged value in `obj` (recursively) is well formed, and the whole is strict-JSON
    serialisable (no NaN or infinity). Returns `obj`; raises TelemetryError."""
    _check(obj, "telemetry")
    try:
        json.dumps(obj, allow_nan=False)
    except (TypeError, ValueError) as e:
        raise TelemetryError(f"telemetry is not strict JSON: {e}") from e
    return obj


def _check(obj, path):
    if isinstance(obj, dict):
        if "kind" in obj:
            k = obj["kind"]
            if k in (MEASURED, DERIVED):
                need = "source" if k == MEASURED else "basis"
                if set(obj) != {"kind", "value", "unit", need}:
                    raise TelemetryError(f"{path}: a {k} value needs exactly kind, value, unit and {need}")
                if not _num(obj["value"]):
                    raise TelemetryError(f"{path}: {k} value {obj['value']!r} is not a finite number")
                if not isinstance(obj["unit"], str) or not obj["unit"] or not isinstance(obj[need], str) or not obj[need]:
                    raise TelemetryError(f"{path}: unit and {need} must be non-empty strings")
                if k == MEASURED and obj["unit"] in DURATION_UNITS and obj["value"] < 0:
                    raise TelemetryError(f"{path}: a measured duration cannot be negative ({obj['value']})")
            elif k == UNAVAILABLE:
                if set(obj) != {"kind", "reason"} or not isinstance(obj["reason"], str) or not obj["reason"]:
                    raise TelemetryError(f"{path}: an unavailable value needs exactly kind and a non-empty reason")
            else:
                raise TelemetryError(f"{path}: unknown kind {k!r}")
            return
        for key, v in obj.items():
            _check(v, f"{path}.{key}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _check(v, f"{path}[{i}]")
    elif obj is None:
        raise TelemetryError(f"{path}: a bare null is not allowed; say why it is unavailable")
    elif isinstance(obj, float) and not math.isfinite(obj):
        raise TelemetryError(f"{path}: non-finite number")


# The failures an observation can raise. Deliberately a list, not a catch-all: a MemoryError, a
# KeyboardInterrupt or a SystemExit is not an observation failure and must reach the caller.
OBSERVATION_ERRORS = (TelemetryError, TypeError, ValueError, ArithmeticError, OSError, AttributeError, KeyError, IndexError)


def observe(fn):
    """Compute one observation (`fn()`) and validate it. If computing or validating it fails, the
    result is an explicit unavailable entry naming the failure, and the caller - the training loop -
    carries on exactly as if telemetry did not exist (M22.16)."""
    try:
        return checked(fn())
    except OBSERVATION_ERRORS as e:
        return unavailable(f"telemetry failed: {type(e).__name__}: {e}")


def checked(value):
    """`value` if it validates; otherwise an explicit unavailable entry naming the defect. Telemetry
    never stops a training run, and an invalid observation is recorded as invalid, not dropped."""
    try:
        return validate(value)
    except TelemetryError as e:
        return unavailable(f"telemetry rejected: {e}")


# ── memory ────────────────────────────────────────────────────────────────────────────────────


def _windows_counters():
    """PROCESS_MEMORY_COUNTERS_EX for this process, through fully prototyped calls. Raises OSError."""
    import ctypes
    from ctypes import wintypes

    class CountersEx(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t), ("PrivateUsage", ctypes.c_size_t)]

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    k32.GetCurrentProcess.argtypes = []
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(CountersEx), wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    c = CountersEx()
    c.cb = ctypes.sizeof(CountersEx)
    if not psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(c), c.cb):
        raise OSError(f"GetProcessMemoryInfo failed, Win32 error {ctypes.get_last_error()}")
    return {"workingSet": int(c.WorkingSetSize), "peakWorkingSet": int(c.PeakWorkingSetSize), "private": int(c.PrivateUsage)}


def _linux_status(path="/proc/self/status"):
    out = {}
    with open(path, "r", encoding="ascii") as f:
        for line in f:
            key, _, rest = line.partition(":")
            if key in ("VmRSS", "VmHWM"):
                n, unit = rest.split()
                if unit != "kB":
                    raise OSError(f"{key} in unexpected unit {unit!r}")
                out[key] = int(n) * 1024
    if set(out) != {"VmRSS", "VmHWM"}:
        raise OSError("VmRSS or VmHWM missing from /proc/self/status")
    return out


PEAK_SCOPE = "process lifetime: the OS keeps one peak per process and cannot reset it, so a per-epoch peak is unavailable"


def process_memory(platform_name=None):
    """This process's memory, every field tagged. Never raises for an OS failure; never returns null."""
    name = platform_name or sys.platform
    try:
        if name == "win32":
            c = _windows_counters()
            src = "GetProcessMemoryInfo (PROCESS_MEMORY_COUNTERS_EX)"
            return {"workingSet": measured(c["workingSet"], "bytes", src), "peakWorkingSet": measured(c["peakWorkingSet"], "bytes", src),
                    "privateBytes": measured(c["private"], "bytes", src), "peakScope": PEAK_SCOPE}
        if name.startswith("linux"):
            s = _linux_status()
            src = "/proc/self/status"
            return {"workingSet": measured(s["VmRSS"], "bytes", src + " VmRSS"), "peakWorkingSet": measured(s["VmHWM"], "bytes", src + " VmHWM"),
                    "privateBytes": unavailable("not read on Linux"), "peakScope": PEAK_SCOPE}
        if name == "darwin":
            import resource

            peak = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)  # bytes on macOS
            return {"workingSet": unavailable("getrusage reports no current resident size"), "peakWorkingSet": measured(peak, "bytes", "getrusage ru_maxrss"),
                    "privateBytes": unavailable("not read on macOS"), "peakScope": PEAK_SCOPE}
        reason = f"no supported memory API on platform {name!r}"
    except (OSError, ValueError, AttributeError, ImportError) as e:  # stated, never hidden
        reason = f"memory query failed on {name}: {type(e).__name__}: {e}"
    return {"workingSet": unavailable(reason), "peakWorkingSet": unavailable(reason), "privateBytes": unavailable(reason), "peakScope": PEAK_SCOPE}


# ── clocks ────────────────────────────────────────────────────────────────────────────────────


def _windows_tick_pair():
    """(GetTickCount64 ms, QueryUnbiasedInterruptTime in 100 ns units), prototyped. Raises OSError."""
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.GetTickCount64.argtypes = []
    k32.GetTickCount64.restype = ctypes.c_ulonglong
    k32.QueryUnbiasedInterruptTime.argtypes = [ctypes.POINTER(ctypes.c_ulonglong)]
    k32.QueryUnbiasedInterruptTime.restype = wintypes.BOOL
    unbiased = ctypes.c_ulonglong()
    biased = k32.GetTickCount64()
    if not k32.QueryUnbiasedInterruptTime(ctypes.byref(unbiased)):
        raise OSError(f"QueryUnbiasedInterruptTime failed, Win32 error {ctypes.get_last_error()}")
    return int(biased), int(unbiased.value)


def _utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class Clocks:
    """Snapshots of every clock at one instant. The clock functions are injectable for tests."""

    def __init__(self, perf=time.perf_counter, cpu=time.process_time, utc=_utc, ticks=None, platform_name=None):
        self.perf, self.cpu, self.utc = perf, cpu, utc
        name = platform_name or sys.platform
        self.ticks = ticks if ticks is not None else (_windows_tick_pair if name == "win32" else None)
        self.platform_name = name

    def snapshot(self):
        """Never raises for a clock failure: a clock that fails leaves its field None and says why,
        and `interval` then reports that interval as unavailable."""
        snap = {"utc": None, "perf": None, "cpu": None, "ticks": None, "ticksError": None, "errors": []}
        for key, fn in (("utc", self.utc), ("perf", self.perf), ("cpu", self.cpu)):
            try:
                snap[key] = fn()
            except OBSERVATION_ERRORS as e:
                snap["errors"].append(f"{key}: {type(e).__name__}: {e}")
        if self.ticks is None:
            snap["ticksError"] = f"no suspend-aware tick pair on platform {self.platform_name!r}"
        else:
            try:
                snap["ticks"] = self.ticks()
            except (OSError, ValueError, AttributeError) as e:
                snap["ticksError"] = f"{type(e).__name__}: {e}"
        return snap


SUSPEND_BASIS = ("(GetTickCount64 elapsed, which includes time the system was suspended) minus (QueryUnbiasedInterruptTime "
                 "elapsed, which excludes it), over this interval; resolution about one timer tick")


def interval(start, end, cpu_threads=None):
    """Telemetry for the time between two snapshots. Raises TelemetryError for an unusable pair;
    callers use `observe`, which turns that into an explicit unavailable entry."""
    missing = [f"{which} {e}" for which, s in (("start", start), ("end", end)) for e in s.get("errors", [])]
    missing += [f"{which} {k}" for which, s in (("start", start), ("end", end)) for k in ("utc", "perf", "cpu") if s.get(k) is None]
    if missing:
        raise TelemetryError(f"clock snapshot incomplete: {'; '.join(missing)}")
    elapsed = end["perf"] - start["perf"]
    cpu = end["cpu"] - start["cpu"]
    if not (_num(elapsed) and _num(cpu)) or elapsed < 0 or cpu < 0:
        raise TelemetryError(f"clock went backwards or is not finite (elapsed {elapsed!r}, cpu {cpu!r})")
    out = {
        "startedAt": start["utc"],
        "endedAt": end["utc"],
        "elapsedSeconds": measured(elapsed, "s", "time.perf_counter (monotonic; QueryPerformanceCounter on Windows)"),
        "processCpuSeconds": measured(cpu, "s", "time.process_time (all threads of this process, user + kernel)"),
    }
    if cpu_threads:
        out["cpuShareOfConfiguredThreads"] = (
            derived(cpu / (elapsed * cpu_threads), "fraction", f"processCpuSeconds / (elapsedSeconds x {cpu_threads} configured threads)")
            if elapsed > 0 else unavailable("zero elapsed time"))
    if start["ticks"] is None or end["ticks"] is None:
        out["systemSuspendedSeconds"] = unavailable(start["ticksError"] or end["ticksError"] or "tick pair missing")
    else:
        biased_s = (end["ticks"][0] - start["ticks"][0]) / 1e3
        unbiased_s = (end["ticks"][1] - start["ticks"][1]) / 1e7
        out["systemSuspendedSeconds"] = derived(biased_s - unbiased_s, "s", SUSPEND_BASIS)
    return out


def step_summary(durations):
    """Per-step elapsed seconds -> count, total, mean, min, p50, p95, max and the slowest step's
    1-based position (nearest-rank quantiles; all derived from measured durations)."""
    if not durations:
        return {"steps": 0, "summary": unavailable("no step was timed")}
    if not all(_num(d) and d >= 0 for d in durations):
        raise TelemetryError("step durations must be finite and non-negative")
    s = sorted(durations)
    n = len(s)

    def rank(q):
        return s[max(0, math.ceil(q * n) - 1)]

    basis = f"nearest-rank over {n} per-step time.perf_counter durations"
    slowest = max(range(n), key=lambda i: (durations[i], -i))
    return {
        "steps": n,
        "totalSeconds": derived(sum(durations), "s", basis),
        "meanSeconds": derived(sum(durations) / n, "s", basis),
        "minSeconds": derived(s[0], "s", basis),
        "p50Seconds": derived(rank(0.5), "s", basis),
        "p95Seconds": derived(rank(0.95), "s", basis),
        "maxSeconds": derived(s[-1], "s", basis),
        "slowestStepInEpoch": derived(slowest + 1, "step", basis),
    }


def epoch_ratios(epoch_seconds):
    """Each epoch's elapsed time over the run's median epoch time (derived; no threshold applied)."""
    if not epoch_seconds:
        return []
    s = sorted(epoch_seconds)
    n = len(s)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    if median <= 0:
        return [unavailable("median epoch time is zero") for _ in epoch_seconds]
    return [derived(v / median, "ratio", f"epoch elapsedSeconds / median over {n} epochs ({median:.3f} s)") for v in epoch_seconds]


def hardware(torch_threads=None, interop_threads=None, device="cpu"):
    """Static run metadata: what the run was configured to use, and what the machine reports."""
    clocks = {}
    for n in ("perf_counter", "process_time", "time"):
        i = time.get_clock_info(n)
        clocks[n] = {"implementation": i.implementation, "monotonic": i.monotonic, "adjustable": i.adjustable, "resolution": i.resolution}
    return {
        "device": device,
        "logicalCpus": os.cpu_count() if os.cpu_count() else unavailable("os.cpu_count() returned nothing"),
        "processor": platform.processor() or unavailable("platform.processor() returned nothing"),
        "machine": platform.machine() or unavailable("platform.machine() returned nothing"),
        "torchThreads": torch_threads if torch_threads is not None else unavailable("not recorded"),
        "torchInteropThreads": interop_threads if interop_threads is not None else unavailable("not recorded"),
        "clocks": clocks,
        "platform": sys.platform,
    }
