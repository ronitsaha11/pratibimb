---
id: M22.17-resume-timing-assurance
title: "M22.17 — per-step timing failures and multi-session resume assurance"
status: recorded — step timer guarded; sessions made explicit; verified through the fake-only harness; NO TRAINING, NO MODEL, NO INFERENCE, NO TEST
date: 2026-11-03
label: FACT (harness and suite runs on W1); UNKNOWN where marked
classification: TEST AND RELIABILITY — instrumentation and additive record fields only; the training algorithm, model, checkpoint payload and configuration are unchanged
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.17 — resume and timing failure assurance

> **Nothing real was touched:**
> - no model was built or loaded, and no checkpoint was read, written or modified;
> - no training, forward or backward pass, or optimizer update ran;
> - no data was read and no TEST was accessed;
> - the training CLI was never launched.
>
> **How it was tested:** the existing M22.16 harness runs the real `run_training` control flow with every such operation replaced by a test double.

## Hypothesis

Two telemetry paths M22.16 left unverified can be made safe and verifiable without touching training:
- **per-step timing**, which still read the clock directly;
- **multi-session resume**.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`), Windows 11 10.0.26300.

**Software:** Python 3.13.14, torch 2.14.0+cpu.

**Starting point:** commit `1eb0a77`.

## Expected result

**Per-step timing:**
- a failed or malformed step timing is recorded as untimed, never fabricated, and never interrupts the step;
- a real training error is never masked.

**Sessions:**
- history is preserved and epochs are attributed to the session that ran them;
- nothing is measured across a restart;
- the accumulated duration comes from valid measurements only.

## Actual result

### 1. Inspection (FACT, at `1eb0a77`)

**Direct clock reads in `train_v2.py`:**
- `time.perf_counter()` at the start and at the end of every step. These were the **only telemetry reads outside the guard**;
- `_now()` UTC labels;
- guarded `clocks.snapshot()` calls.

**The remaining timing failure path:**
- **A raising read** would abort an otherwise valid training step: it would be recorded as F13 and the run would stop because of telemetry.
- **A NaN or backwards read** would make `step_summary` refuse, discarding every valid step's timing in that epoch.

**Session representation:**
- **Sessions are appended, never replaced.** But they had no index, and epochs did not say which session ran them.
- **`record["hardware"]` was overwritten** by each resumed session, losing session 1's.
- **No accumulated run duration** existed.

**Resume and interruption:**
- epochs and the checkpoint ledger are truncated to the last verified checkpoint;
- an interrupted partial epoch is never recorded, and is re-run;
- every interval uses snapshots taken within one process, so nothing crosses a restart.

### 2. Changes (instrumentation and additive fields only)

- **`telemetry_v2.StepTimer`:**
  - **No raising:** `start()` and `stop()` never raise for a listed clock error.
  - **Untimed steps:** a step whose start or stop read fails or is non-numeric, or whose duration is negative or non-finite, is **untimed**, with its step number and the reason. No duration is substituted.
  - **The summary:**
    - statistics cover timed steps only;
    - it gives `untimedSteps` and the untimed list;
    - it names the slowest step by its real position in the epoch.
  - **What still propagates:** errors not on the observation list (for example `StopIteration`, `MemoryError` or `KeyboardInterrupt`).
- **`telemetry_v2.run_timing`:**
  - **`sessionElapsedSecondsSum`:** the sum of the session-local elapsed times, derived only when every session has a measured value, otherwise unavailable naming the sessions that lack one.
  - **`betweenSessions`:** always unavailable, with the reason. No process ran between sessions, and monotonic clocks don't survive a restart.
  - **Epoch ratios:** each epoch's ratio to the median epoch time, kept.
- **`train_v2.py`:**
  - each session gets `index`, `epochsCompleted` and its own `hardware`;
  - `record["hardware"]` is set only once, to the first session's;
  - each epoch gets `session`;
  - the step timer is `StepTimer(time.perf_counter)`;
  - run timing comes from `run_timing`.
  - **Unchanged:** the training statements, the checks and the checkpoint payload.

### 3. Harness architecture

**Reused:** the M22.16 harness (`tests/test_telemetry_integration_v2.py`), extended with test-only changes:
- **State restoration:** `load_state_dict` on the fake model, optimizer and scheduler, and an in-memory checkpoint store that the fake verifier reads back from.
- **No global side effects:** a no-op `torch.set_rng_state`.
- **Fault injection:** a `StepTimer` subclass that only reports which step and read is happening, so faults can be injected exactly at the start or end of a given step.
- **Process restarts:** `restart()`, a fresh fake clock whose monotonic values are **smaller** than the last session's, as after a real restart.

**Traps,** unchanged from M22.16: the adapter, `sample_to_tensors`, `torch.load` and `torch.save` fail the test if reached.

### 4. Verified (`tests/test_telemetry_resume_v2.py`, 11 tests; all through the real `run_training` except 3 unit tests)

**Per-step timing:**
- **Step-start and step-end faults:** these were a raising read, NaN, a backwards clock and a non-numeric value, across six steps. Each affected step is untimed, with its reason.
  - Valid steps keep their exact durations, and none is substituted.
  - The slowest step is named by its real position.
  - Phase timing is unaffected.
  - The training trace is identical to a clean run.
  - The record is strict JSON with no negative duration.
- **A real F1 failure** in a step whose timer start failed keeps its code F1, and the FAILED record is persisted.
- **`StepTimer` units:** non-listed errors propagate, and listed ones become untimed.

**Multi-session resume:**
- **A fresh session** records index 1, `epochsCompleted` `[1, 2]`, its own hardware and measured timing; every epoch is tagged session 1; the run sum equals the session's time; `betweenSessions` is unavailable.
- **Interrupt after epoch 1, then resume on a restarted clock:**
  - session 1 and epoch 1 are **byte-for-byte unchanged**, and the run-level hardware stays session 1's;
  - session 2 has index 2, `resume: true`, `epochsCompleted` `[2]`;
  - epochs are `(1, session 1)` and `(2, session 2)`, with no duplicate;
  - every measured interval is session-local and non-negative, despite the restarted clock reading lower;
  - the run sum is exactly the two session times added together.
- **Interrupt in the middle of epoch 2:**
  - the completed epoch is kept, and the partial epoch leaves no record;
  - epoch 2 is recorded once, by session 2;
  - session 1's elapsed time includes the partial epoch's training steps.
- **A previous session's unusable measurement** stays unavailable and is never back-filled, and the run sum is unavailable, naming session 1.
- **Three sessions:**
  - **Sessions:** indexes 1, 2, 3, with `epochsCompleted` `[1]`, `[]`, `[2]`.
  - **Run sum:** exactly the sum of the three session times.
  - **JSON:** strict JSON round trip.
- **A telemetry failure during resume** (non-finite CPU clock) together with a corrupt checkpoint: the failure is **F7**, as it should be; session 1 is intact; session 2's timing is unavailable.
- **`run_timing` units:** the sum, and missing sessions named.

**Results:**
- **Python suite:** 290 passed, pytest exit 0. That is 279 before, plus 11. The existing real-fixture interrupt-and-resume test (M22.13) still gives bitwise-equal weights under the new session fields.

### 5. Unverified, and schema limitations

- **No real run has produced multi-session telemetry.** Everything is verified against fakes.
- **QPC behaviour across a real sleep is UNKNOWN** (as M22.16).
- **The M22.13 `torch` block is still overwritten** by a resumed session. It is a training field from M22.13, outside telemetry, and its values are the same configuration each session. The per-session `hardware` now preserves each session's thread readings.
- **`record["hardware"]` keeps the first session's values.** For a resumed run whose first session predates M22.17 (none exists), it would be the first M22.17 session's.
- **A pre-existing labelling issue, not changed:** a resume refusal raised inside the `try` (no verified checkpoint, stray checkpoint files, step mismatch) is caught by `except SafetyError` and recorded as **F6**, which the M22.10 specification defines as a T1 change. Failure codes are part of the approved specification, so this needs an owner decision rather than a silent fix.
- **The run-level UTC span** (first start to last end) is deliberately not computed. It would come from adjustable wall-clock labels and would include the unmeasured gaps between sessions.

### 6. Verification

See `decision.md`.

## Conclusion

Per-step timing can no longer interrupt training or fabricate a duration. Sessions are explicit and append-only, and epochs know their session. Elapsed time is never derived across a restart, and the run-level duration is a sum of valid session-local measurements, with the gaps between sessions stated as unmeasured.

**Not authorised:** another training run, or any detector evaluation.

## Reproducibility

```bash
python -m pytest tools/detector/tests/test_telemetry_resume_v2.py tools/detector/tests/test_telemetry_integration_v2.py -q
```
```bash
npm run verify
```
