# M22.15 — decision record

**The M22.13 memory defect is fixed, and training telemetry is implemented. Nothing was trained, loaded, inferred or exported.**

| Item | Status | Evidence |
|---|---|---|
| Root cause of `memory: null` | **Verified:** `psapi.GetProcessMemoryInfo` was called without `argtypes`; the 64-bit pseudo-handle overflowed a C int (`ctypes.ArgumentError`), and `except Exception: return None` hid it | reproduced on W1; regression test `test_the_m22_13_defect_is_real_…` |
| Durations | were adjustable `time.time()`; now monotonic `time.perf_counter`, per epoch and per phase (train, DEV, checkpoint), with UTC start and end | `telemetry_v2.interval`; tests |
| Memory | Windows working set, peak (process-lifetime) and private bytes, measured through prototyped calls; other platforms explicit; failures recorded with the reason | `telemetry_v2.process_memory`; tests |
| Suspend evidence | Windows `GetTickCount64` minus `QueryUnbiasedInterruptTime` per interval, derived; unavailable elsewhere, with the reason | tests (real API and simulated) |
| Value labelling | every value is measured, derived or unavailable (with a reason); invalid telemetry is refused, and in a run recorded as unavailable | `validate`, `checked`; 14 refusal cases |
| Training algorithm, model, checkpoint payload, configuration | **unchanged**; both configurations pinned by canonical hash | tests |
| M22.13 evidence | **unchanged**; the committed run record pinned by hash; no historical record edited | test |
| Verification | pytest: 269 passed (exit 0). `npm run verify`: **run 1 exit 1**: one JavaScript test (`apps/extension/test/visualRedaction.test.ts`, "the frozen synthetic fixture…") timed out at 5,000 ms, untouched by this change. **Run 2 exit 0**: repository check 0 failures; JavaScript 3,159 passed, 22 skipped; Python 269 passed | this milestone's runs |

## Unresolved

1. **No real run has used the telemetry yet.** The integration is exercised only by the existing fixture loop tests.
2. **The cause of M22.13's slow epochs stays UNKNOWN,** because there is no per-epoch evidence. The M22.13 README's INFERENCE about starvation and sleep is not established.
3. **Per-epoch peak memory is unavailable,** because the OS keeps only a process-lifetime peak.
4. **Linux and macOS paths** are tested by simulation only.
5. **The intermittent 5-second timeout** in `visualRedaction.test.ts` (`generateFrame`) is not investigated here. It is unrelated JavaScript code.
6. **Not updated:** `agentos/state.md`, `CHANGELOG.md` and `tools/detector/README.md` are left for a follow-up, because this milestone commits only its source, tests and record.
