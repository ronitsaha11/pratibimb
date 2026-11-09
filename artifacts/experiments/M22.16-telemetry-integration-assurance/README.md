---
id: M22.16-telemetry-integration-assurance
title: "M22.16 — integration assurance of the M22.15 training telemetry"
status: recorded — integration verified through a fake-only harness; one latent control-flow defect found and fixed; NO TRAINING, NO MODEL, NO INFERENCE, NO TEST
date: 2026-11-03
label: FACT (harness and suite runs on W1); UNKNOWN where marked
classification: TEST AND ASSURANCE — instrumentation only; the training algorithm, model, checkpoint payload and configuration are unchanged
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.16 — telemetry integration assurance

> **Nothing run for real:** no model was built or loaded, no checkpoint was read, no training or inference ran, no data was read, and no TEST was touched.
> **The test harness:** it runs the real `run_training` control flow with every training, model, data and checkpoint operation replaced by a test double.
> **What it found:** a latent defect in how M22.15 integrated telemetry. That defect is fixed here.

## Hypothesis

M22.15's telemetry, tested only in isolation, may not be integrated correctly into `run_training`. A fake-only harness should reveal:
- whether every field reaches the run record with the right values, labels and units;
- whether telemetry failures can change the training's control flow.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300.

**Software:** Python 3.13.14, torch 2.14.0+cpu.

**Starting point:** commit `b91b3af`.

## Expected result

Every telemetry field is verified end to end, with exact values from injected clocks, and training is unaffected by any telemetry failure.

## Actual result

### 1. Inspection (FACT)

**`train_v2.py` before and after M22.15** (`git diff 339a6c2 22cfe62`):
- **Unchanged:** loss, optimizer, scheduler, data order, every check, and the checkpoint payload.
- **What changed:** every edit is instrumentation.

**The latent defect, found by reading the integration:**
1. **Computed outside any guard:** M22.15 wrapped finished values in `tel.checked(...)`, but the computations themselves (`tel.interval`, `tel.step_summary`, `tel.process_memory`, `tel.hardware`) ran outside it. `interval` raises `TelemetryError` on a backwards or non-finite clock, and malformed tick data raises `TypeError`, so either would escape `run_training`.
2. **Failure paths:** `close_session()` runs inside `fail()` and every exception handler. A telemetry exception there would **replace the real failure** (for example F1) and stop the FAILED record from being written.
3. **The `seconds` field:** it came from raw clock differences without validation. A non-finite value would make the strict JSON write raise.

**Exposure:** a real `perf_counter` is monotonic, so this is latent, not observed.

### 2. The harness (`tests/test_telemetry_integration_v2.py`, 10 tests)

**Doubles:**
- `preflight`, `candidate_root`, `candidate_fingerprint`, `G10Policy`, `load_train`, `load_dev`, `prepare_split` (tiny zero tensors), `dev_loss`, `_write_checkpoint`, `verify_checkpoint`, `check_t1`;
- `head.UiHead` (a fake with no parameters and no convolution);
- `torch.optim.AdamW`, `CosineAnnealingLR`, `loss_v2.detector_loss_v2`, `clip_grad_norm_`, and `Tensor.backward`, all of which only count calls;
- `torch.set_num_threads` and `use_deterministic_algorithms` (no process-wide side effect).

**Traps:** these fail the test if reached: `data_v2.load_split`, `train_v2.load_accepted_split`, `data.sample_to_tensors`, `torch.load`, `torch.save`.

**Telemetry sources:**
- **The fake clock:** one deterministic clock drives every telemetry source: monotonic time, process CPU, UTC, and the Windows tick pair (GetTickCount64 in ms, QueryUnbiasedInterruptTime in 100 ns).
- **Memory:** the memory reader is scripted.

**Expected values are exact:**
- each step takes 0.5, 1.5 and 0.5 s;
- DEV takes 10 s and the checkpoint phase 2 s;
- CPU runs at 4 per second during training and 1 per second otherwise;
- 8 configured threads;
- 7 s of suspension during epoch 2's DEV phase.

**What it writes:** only `run-record.json`, `best-checkpoint.json` and the step logs, in pytest's temp directory. **A test asserts that no weight file exists.**

### 3. Before and after the fix

- **Before** (`logs/w1-harness-before-fix.txt`, run against `b91b3af`): **7 failed, 3 passed.**
  - **The integration defect, six tests:** the four malformed-clock cases, a failing memory reader, and a training failure while telemetry breaks.
  - **A test defect, one test:** the unsupported-platform test validated whole epoch records, which contain an unrelated `null`. Corrected.
- **The fix,** instrumentation only:
  - `telemetry_v2.observe(fn)`: it computes and validates one observation and turns an explicit list of error types into `unavailable`, naming the exception. It is not a catch-all, so MemoryError, KeyboardInterrupt and SystemExit still propagate.
  - `Clocks.snapshot`: it guards each clock read.
  - `interval`: it refuses an incomplete snapshot.
  - `train_v2`: every one of its 9 telemetry sites now goes through `observe`, each phase separately; `seconds` comes from the validated timing.
- **After:** **10 of 10 pass.**

### 4. What is verified end to end, and what is not

| Telemetry field | End to end through the harness | Only in isolation (M22.15 tests) |
|---|---|---|
| Epoch and phase UTC start and end; contiguous train → DEV → checkpoint boundaries | **yes** | — |
| Monotonic elapsed time (measured, `perf_counter` source, unit s); non-negative; phases sum exactly to the epoch; `seconds` compatibility field equal | **yes** | — |
| Process CPU seconds (measured, `process_time` source), arithmetic exact over what the fake clock supplies (including no CPU during the fake suspension) | **yes** | — |
| Thread share = CPU / (elapsed × **configured** 8 threads), derived, a fraction (0.5 in training) | **yes** | — |
| Per-step summary: count, total, mean, min, p50, p95, max, slowest step (exact) | **yes** | quantile edge cases and refusals |
| Windows suspend: ms and 100 ns reconciled (exactly 7.0 s in epoch 2's DEV phase and in the epoch; 0.0 elsewhere) | **yes** (fake tick pair) | the real API (a point reading) |
| Memory status kept: measured in epoch 1, unavailable with the OS error in epoch 2; process-lifetime peak scope | **yes** (the real `process_memory` mapping, fake counters) | the real `GetProcessMemoryInfo` values |
| Unsupported platform: explicit reasons for suspend and memory in every phase | **yes** | Linux `/proc` parsing; macOS |
| Malformed telemetry (backwards clock, NaN CPU, non-numeric ticks, NaN ticks, failing reader) is **unavailable, never numeric**; the record stays strict JSON | **yes** | 14 `validate` refusal cases |
| Telemetry failures leave training unchanged (identical model, backward, optimizer, scheduler, DEV, checkpoint calls; losses; payloads; status) | **yes** (5 tests compare the full trace with a clean run) | — |
| A training failure keeps its own code (F1) and is persisted when telemetry breaks; an interruption records session timing | **yes** | — |
| Session timing and per-epoch ratio to the median | **yes** | ratio edge cases |
| Hardware metadata present and valid | **yes** | real clock-info values |
| Strict-JSON round trip of the written record | **yes** | — |
| Checkpoint payload carries no telemetry; its keys are exactly M22.13's | **yes** | — |
| Resume (more than one session in a record) | **no** | the existing M22.13 fixture loop test resumes, but asserts no telemetry |

### 5. Remaining uncertainty

- **No real run has produced telemetry.** The harness proves the integration logic against fakes, not the behaviour of real clocks during a real run.
- **Real QPC behaviour under sleep is UNKNOWN.** The harness assumes `perf_counter` keeps advancing while the system is suspended. The derived suspend figure uses only the tick pair, so it doesn't depend on that assumption, but how `elapsedSeconds` reads across a sleep does.
- **Resume telemetry is not verified end to end.**
- **The per-step timer is a raw `time.perf_counter()` call inside the loop.** It is a standard-library call that can't fail in practice; its values are validated through `observe`.
- **The cause of M22.13's slow epochs stays UNKNOWN.**

### 6. Verification

See `decision.md`.

## Conclusion

The telemetry reaches the run record with the right values, labels and units, and it now cannot alter training. The latent defect is fixed by routing every observation through `observe`, with the training statements unchanged.

**Not authorised:** another training run, or any detector evaluation.

## Reproducibility

```bash
python -m pytest tools/detector/tests/test_telemetry_integration_v2.py -q
```
```bash
npm run verify
```
