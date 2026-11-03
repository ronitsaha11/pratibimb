# M20 benchmark — limitation note (M23.4)

> **Status:** an interpretive note. **The M20 evidence is not edited, invalidated or replaced.** No new benchmark is claimed.
> - **Sources:** `artifacts/benchmarks/M20-w1-product/` (README and the five tracked run records), read as text. No model or frame was accessed.

## 1. What the records say (FACT)

- **No frame:** every tracked M20 benchmark record states `environment.perception`: "DOM/text structure only in this workload: the product build captures no frame without the person's toolbar gesture".
- **No T1 inference:** `tierFiring.visualPerceptionPasses = 33`, `visualPerceptionRan = 0` and `detectorRan = 0`. Per the README, all 33 passes were refused with `NO_ACTIVE_TAB_GRANT`.
- **The headline figures:** warm step p50 448.7 / p95 1438.8 ms (n = 14). These are **measured, W1 only**.
- **Person-run smoke records** (M20 §3): the tracked records contain no perception-tier fields that were inspected here. Whether a gesture-granted frame, and so T1 inference, occurred in them is **UNKNOWN**.

## 2. What can safely be said

| Statement | Basis |
|---|---|
| The M20 benchmark is historical evidence and stays valid as recorded | its own records |
| **The M20 benchmark contains no T1 inference** (`detectorRan = 0`) | FACT, the records |
| It did package *a* T1 file (the build fails without one). INFERENCE: on the first perception call, `ensurePerception()` would have attempted to create a T1 session. Whether that succeeded, and how much it added to cold-start time, is **UNKNOWN** (no `perceptionBoot` in the records inspected) | source and records |
| The identity of that T1 file is **not verified** (no digest exists) | `t1-artifact-integrity-policy-PROPOSED.md` |
| Reproducibility on another machine is **not established** | M20 is labelled "one machine" |
| The timings **cannot** be attributed to a future T1-disabled architecture: the code path differs (no T1 session at all), and nothing has been measured | not measured |
| This milestone produces **no new benchmark** | — |

## 3. Correction to M23.3

- **What M23.3 said:** "every product measurement, including the M20 benchmark, depends on a file that is not identity-checked". That overstates it.
- **The correct statement:** product measurements **in which T1 inference ran** depend on an unverified file. The M20 benchmark ran no T1 inference, and its only T1 exposure is a probable session creation (UNKNOWN).
- **Where it is corrected:** the living acceptance documents. ADR-0015 (proposed) is corrected through `adr-0015-change-proposal-PROPOSED.md`. The committed M23.3 records are left as written.
