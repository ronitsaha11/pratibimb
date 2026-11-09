---
id: M22.15-training-observability
title: "M22.15 — training pipeline observability and operational hardening"
status: recorded — telemetry implemented and tested; NO TRAINING, NO INFERENCE, NO EXPORT, NO TEST
date: 2026-11-03
label: FACT (root cause reproduced and tests run on W1); UNKNOWN where marked
classification: OBSERVABILITY ONLY — the training algorithm, model, checkpoint format and run configuration are unchanged
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.15 — training observability

> **Nothing run:** no training run was launched, no checkpoint loaded, no inference performed, no prediction or metric produced, nothing exported, and no TEST data touched.
> **Unchanged:** the training algorithm, the model, the checkpoint payload and the approved run configuration.
> **Pinned by tests:** the canonical hashes of both configuration files, and the M22.13 run record.

## Hypothesis

The first run's missing memory figures have a specific, reproducible cause in `train_v2.peak_memory`. The pipeline's timing can be made monotonic and phase-resolved. Every unavailable measurement can be reported as such, using only the standard library and documented Windows APIs, and tested without training.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300, Intel64 Family 6 Model 186 (16 logical CPUs).

**Software:** Python 3.13.14 (64-bit), torch 2.14.0+cpu.

**Clocks (FACT, `time.get_clock_info`):**
- `perf_counter` and `monotonic`: QueryPerformanceCounter, monotonic, not adjustable, 1e-7 s;
- `process_time`: GetProcessTimes;
- `time`: GetSystemTimePreciseAsFileTime, **adjustable**.

## Expected result

- The defect is established from source and reproduced.
- Telemetry is implemented in a separate module, integrated by observation-only calls, and tested; unsupported cases are tested explicitly.
- The training math is unchanged.

## Actual result

### 1. The original defect and its verified root cause (FACT)

**What M22.13 recorded:**
- `memory: null` in all 40 epochs;
- per-epoch `seconds.train` and `seconds.total` from `time.time()`;
- run and session UTC timestamps;
- torch thread and device fields.

**What it did not record:** per-epoch start and end timestamps, DEV and checkpoint time separately, per-step timing, process CPU time, and any evidence about system suspension.

**Root cause, reproduced on W1** by running the old function's body without its catch-all:
1. `GetCurrentProcess()`, with `restype = HANDLE`, returns the pseudo-handle as **18446744073709551615** (2⁶⁴ − 1).
2. `psapi.GetProcessMemoryInfo` was called **without `argtypes`**, so ctypes converted that integer to a 32-bit C `int` and raised **`ctypes.ArgumentError: argument 1: OverflowError: int too long to convert`**.
3. `except Exception: return None` **silently hid it.**

**The same call with full prototypes succeeds** (working set 17,469,440 bytes in the probe process).

**A second weakness:** `time.time()` is an adjustable wall clock, unsuitable for durations.

### 2. Implementation

**`tools/detector/telemetry_v2.py` (new):** standard library plus `ctypes` with full prototypes, and no new dependency. Every value is one of three kinds:
- `measured`: value, unit and the API that produced it;
- `derived`: value, unit and how it was computed;
- `unavailable`: the reason.

`validate` refuses:
- bare nulls, non-finite or boolean values, and negative measured durations;
- missing or extra fields, unknown kinds, and anything that is not strict JSON.

`checked` turns an invalid observation into an explicit `unavailable` entry, so telemetry never stops a run and never disappears.

| Measurement | Source | Kind |
|---|---|---|
| Elapsed time per interval | `time.perf_counter` (QueryPerformanceCounter) | measured |
| Process CPU time per interval | `time.process_time` (GetProcessTimes: all threads, user + kernel) | measured |
| Share of configured threads used | CPU seconds / (elapsed × configured threads) | derived |
| UTC start and end per interval | `datetime.now(timezone.utc)`; a label, never a duration | — |
| Working set, peak working set, private bytes | Windows `GetProcessMemoryInfo` (PROCESS_MEMORY_COUNTERS_EX), prototyped | measured |
| System-suspended time per interval | Windows `GetTickCount64` elapsed minus `QueryUnbiasedInterruptTime` elapsed (documented to include and to exclude suspension respectively), prototyped; resolution about one timer tick | derived |
| Per-step timing | count, total, mean, min, p50, p95 (nearest rank), max, slowest step | derived from measured durations |
| Epoch time relative to the run | each epoch's elapsed time / the run's median epoch time (no threshold applied) | derived |
| Run metadata | device, logical CPUs, processor, machine, torch and interop threads, clock implementations | stated |

**`tools/detector/train_v2.py`:** observation-only edits.
- **Removed:** the defective `peak_memory`.
- **Each epoch now records:**
  - `timing`: the epoch, plus its train, DEV and checkpoint phases, each with UTC start and end, monotonic elapsed time, process CPU time, thread share and suspend evidence;
  - per-step summaries;
  - `memory`.
- **Kept, for compatibility:** `seconds.train` and `seconds.total`, now monotonic.
- **Each session and the run now record:**
  - every session's own `timing`, on completion, failure and interruption;
  - `hardware` metadata;
  - each epoch's ratio to the median.
- **Unchanged:** the loss, optimizer, scheduler, data order, checks and checkpoint payload.

### 3. Platform behaviour

| Platform | Memory | Suspend evidence |
|---|---|---|
| Windows (W1) | **measured** (tested against the real API) | **derived** (tested against the real API) |
| Linux | `/proc/self/status` VmRSS and VmHWM, measured; private bytes unavailable (parsing and failures tested with a temp file) | unavailable, with the reason |
| macOS | peak from `getrusage` only; current unavailable. On W1 `resource` does not exist, so the test checks the explicit unavailable reason | unavailable |
| Any other | unavailable: "no supported memory API on platform …" | unavailable |
| Any OS failure | unavailable, with the exception and the OS error | unavailable, with the reason |

**Peak working set:** it is the **process-lifetime** peak, because the OS cannot reset it. Every record says so, and a per-epoch peak is not claimed.

### 4. Tests (`tests/test_telemetry_v2.py`, 39; plus 3 static checks)

- **Timing:**
  - interval arithmetic, thread share and suspend difference;
  - unavailable suspend evidence, and backwards or non-finite clocks refused;
  - injected clocks, a failing tick source, and the real Windows tick pair;
  - step-summary quantiles exact on known input, bad durations refused, and epoch ratios for odd, even and zero medians.
- **Memory:**
  - real Windows measurement;
  - **a regression test reproducing the M22.13 defect** (the unprototyped call raises `ArgumentError`);
  - an OS failure, an unsupported platform, Linux parsing and failure, and the macOS path.
- **Validation and serialisation:** 14 malformed cases refused; negative derived values allowed; `checked`; a strict-JSON round trip; hardware metadata.
- **Compatibility and preservation:**
  - both run configurations hash to their pinned canonical values (`e2cd897c…`, `2cb331b5…`) and still validate;
  - the committed M22.13 run record hashes to `035045c3…`;
  - the trainer makes no `time.time()` call and has no `peak_memory`;
  - telemetry has no bare `except`, no catch-all, and no `return None` handler.
- **Static safety:** `telemetry_v2.py` is added to the existing guarantees: no legacy-trainer import, no subprocess other than git, no TEST strings.

**No new test launches training, performs inference or touches data.**

**The integration path:** it is exercised by the existing M22.13 fixture loop tests (synthetic data, temporary directory), which pass unchanged.

**Python suite:** 269 passed (pytest exit 0). `npm run verify` is reported in `decision.md`.

### 5. Unavailable or unverified

- **No real run has used this telemetry.** The first run that does is the first evidence. Integration is covered only by the existing fixture loop tests, and no test asserts the telemetry fields of a run record, since that would need a new training-loop test.
- **Interpreting the suspend counters:** suspension evidence rests on the documented semantics of `GetTickCount64` (includes suspension) and `QueryUnbiasedInterruptTime` (excludes it).
  - **Point reading on W1 at this milestone:** since boot, 41.4 h by the first against 16.3 h by the second. That shows the machine does suspend, but **nothing about any particular M22.13 epoch**.
- **M22.13's slow epochs stay unexplained** (13–16, 28–36, and epoch 39 at 31,445 s). That record had no per-epoch CPU or suspend evidence, so their cause is **UNKNOWN**.
  - **Correction:** the M22.13 README names likely causes (CPU starvation, system sleep) as INFERENCE. This record does not establish them. That historical record is left unchanged.
- **Per-epoch peak memory:** unavailable on every supported platform, because the peak is process-lifetime.
- **Untested platforms:** the Linux and macOS paths are tested by simulation and parsing only, not on those operating systems.
- **Not updated:** `agentos/state.md`, `CHANGELOG.md` and `tools/detector/README.md`. This milestone commits only its source, tests and record.

## Conclusion

The memory defect was a missing ctypes prototype, hidden by a catch-all, and is fixed.

**A future, separately authorised run will record:**
- monotonic, phase-resolved timing with UTC boundaries;
- per-step timing summaries;
- process CPU share;
- measured Windows memory;
- per-interval suspend evidence.

Every missing value will be labelled unavailable, with a reason. No training or evaluation was performed or is authorised by this milestone.

## Reproducibility

```bash
python -m pytest tools/detector/tests/test_telemetry_v2.py -q
```
```bash
npm run verify
```
