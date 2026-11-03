# M22.17 — decision record

**Per-step timing is guarded, and multi-session resume telemetry is explicit and verified through the fake-only harness. No model, checkpoint, training run, dataset, inference or TEST data was accessed; the training CLI was not launched.**

| Item | Status | Evidence |
|---|---|---|
| Remaining direct clock reads | the step-start and step-end `time.perf_counter()` reads were the only unguarded telemetry reads; a raising read could abort a valid step | inspection of `1eb0a77` |
| Fix | `telemetry_v2.StepTimer`: failed or malformed readings make a step **untimed** with its reason; no substituted duration; a non-listed error still propagates | `tests/test_telemetry_resume_v2.py` |
| Session semantics | sessions are append-only with `index`, `epochsCompleted` and their own `hardware`; epochs carry `session`; `sessionElapsedSecondsSum` is derived only from measured session-local times; `betweenSessions` is stated as not measured | same; README §2 |
| Verified | step-start and step-end faults; F1 kept in an untimed step; fresh session; interrupt and resume on a restarted clock with history byte-identical; mid-epoch interruption with no duplicate epoch; a previous session's missing measurement kept unavailable; three sessions in strict JSON; a resume telemetry failure does not mask F7 | 11 tests, all passing |
| Not changed, owner decision needed | resume refusals raised inside the `try` are recorded as F6 (the code for a T1 change); pre-existing, in the approved failure-code specification | README §5 |
| Python suite | 290 passed, pytest exit 0 | this milestone's run |
| `npm run verify` | **attempt 1: exit 0**. Repository check 0 failures, 1 warning (this file not yet written); JavaScript 3,159 passed, 22 skipped; Python 290 passed. No first-attempt failure, no retry | this milestone's run |
| Preserved | the M22.13 run record and all 40 checkpoints (`checkpoint-e39.pt` `a485425d…`), T1 `ba6d9e93…`, candidates 1 and 2, G10, the configurations, `train.py`, the ADRs | this milestone's checks; pinning tests |
