# M22.16 — decision record

**The M22.15 telemetry is verified end to end through a fake-only harness. A latent control-flow defect was found and fixed: a telemetry exception could escape `run_training`, or replace a real failure code. No model was built or loaded, no training or inference ran, no data was read, and TEST was untouched.**

| Item | Status | Evidence |
|---|---|---|
| Training algorithm before and after M22.15 | unchanged (loss, optimizer, scheduler, data order, checks, checkpoint payload); all edits instrumentation | `git diff 339a6c2 22cfe62 -- tools/detector/train_v2.py` |
| Latent defect | telemetry computations ran outside the `checked` guard; `interval` and `step_summary` raise, and malformed ticks raise `TypeError`; `close_session()` inside `fail()` could replace F1 | harness against `b91b3af`: 7 failed, 3 passed (6 integration defect, 1 test defect) — `logs/w1-harness-before-fix.txt` |
| Fix | `telemetry_v2.observe` (an explicit error list, not a catch-all); robust `Clocks.snapshot`; `interval` refuses incomplete snapshots; all 9 `train_v2` telemetry sites routed through `observe`, phase by phase; `seconds` from the validated timing. Training statements unchanged | the diff; `tests/test_telemetry_integration_v2.py` 10/10 |
| End-to-end verification | timestamps, monotonic elapsed time, phase consistency, CPU, configured-thread share, step summaries, suspend units, memory status, unsupported-platform reasons, malformed-to-unavailable, control-flow invariance, failure-code preservation, interruption, strict JSON, unchanged checkpoint payload | README §4 |
| Not verified end to end | resume telemetry; real-clock behaviour in a real run; real QPC behaviour under sleep (UNKNOWN) | README §5 |
| Python suite | 279 passed, pytest exit 0 (269 before plus 10 harness tests) | this milestone's run |
| `npm run verify` | **attempt 1: exit 0**. Repository check 0 failures, 1 warning (this file was not yet written); JavaScript 3,159 passed, 22 skipped; Python 279 passed. No retry was needed | this milestone's run |
| Preserved | the M22.13 configuration and run record, all 40 checkpoints (`checkpoint-e39.pt` `a485425d…`), T1 `ba6d9e93…`, candidates 1 and 2, G10, `train.py`, the ADRs | tests pin both configurations and the M22.13 record; this milestone's checks |
