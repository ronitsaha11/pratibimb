---
id: M22.8-verification-readiness
title: "M22.8 — the v2 adapter tests in canonical verification, and training readiness"
status: recorded — Python adapter tests run inside `npm run verify` and in CI; G10 and training NOT approved; candidate 2 a DRAFT
date: 2026-11-02
label: FACT (local verification on W1) / CI job UNKNOWN until its first run
classification: VERIFICATION AND READINESS — no training, no detector inference, no TEST, candidates unmodified
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.8 — unified verification and training readiness

> **No model was trained, no detector inference was run, and no TEST data was touched.** Candidates 1
> and 2, the T1 model and the legacy loader and trainer are unchanged. G10 thresholds are **not
> approved**; the provisional file and its `approved: false` block are untouched. Candidate 2 remains
> a **draft**.

## Hypothesis

The adapter's Python tests can become part of the canonical `npm run verify`, and of CI:
- **fail-closed:** a missing environment fails, never skips;
- **pinned:** to exact dependency versions;
- **unchanged adapter:** its behaviour stays as it is.

## Environment

W1, Windows 11, Python 3.13.14, Node v24.22.1. CI: ubuntu-latest, Python 3.13 (configured, not yet run).

## Expected result

**Wiring:**
- `npm run verify` runs the Python suite and fails when it fails.
- CI installs the pins and runs the same runner.

**Behaviour:**
- missing dependencies and version drift (in strict mode) fail clearly;
- the adapter's code is unchanged;
- regression gaps are closed with deterministic tests.

## Actual result

### Integration

| Piece | Change |
|---|---|
| `tools/detector/requirements-test.txt` (new) | Exact pins, those the suite ran with on W1: numpy 2.5.1, pillow 12.3.0, pytest 9.1.1, torch 2.14.0+cpu, from the CPU wheel index |
| `scripts/verify-python.py` (new) | Checks Python ≥ 3.12, then imports every pinned dependency. It **fails** (exit 2) with the install command if one is missing or broken. Drift from a pin is a warning, or a failure with `PRATIBIMB_STRICT_PY_PINS=1`. It runs `python -m pytest tools/detector/tests` and treats "no tests collected" as a failure |
| `package.json` | Adds `test:py`. `verify` is now `verify-repo → pin:check → typecheck → npm test → npm run test:py` |
| `.github/workflows/ci.yml` | A new `detector-adapter` job: Python 3.13, the pinned install (pip cache keyed on the requirements file), then the runner with strict pins |
| `scripts/verify-python.test.mjs` (new; vitest) | Fails if `verify` stops ending with `test:py`, if CI stops running the runner strictly, or if a requirement stops being an exact pin |
| `tools/detector/tests/test_verify_python.py` (new) | The runner fails on a missing dependency, on strict drift and on an old Python, and reads its pins from the file |
| `tools/detector/README.md` (new) | How to run the tests, the integration, G10's pending approval, candidate 2's draft status, and training not implemented |

`data_v2.py` and `dry_run_v2.py` are **unchanged**.

**Shown on W1:**
- **Inside verify:** `npm run verify` ran the Python suite, printing "48 passed" after the JavaScript tests.
- **Failure propagation:** with a decoy `pytest` module on `PYTHONPATH` and strict pins, `npm run test:py` exited **2**, naming the drift. `verify` chains with `&&`, so that fails verification.

### Adapter regression tests (13 added, deterministic, synthetic temp candidates)

| Area | Before M22.8 | Added |
|---|---|---|
| TRAIN-only / DEV-only loading | both loaded together | each split loads with the **other split's manifest and frames deleted** |
| TEST refusal before filesystem access | refusal with a missing root | refusal with `open`, `os.listdir` and `os.path.join` **trapped** (for `test` and `holdout`) |
| TRAIN/DEV separation | seed only | id, seed, spec hash and frame hash; argument order enforced |
| Class mapping | indirect | equals the eight classes in order, `targets.CLASS_INDEX` and `data_v2.CLASS_INDEX` |
| Size-bucket consistency | a mismatch refused | bucket **edges** (7.999 / 8 / 15.999 / 16 / 31.999 / 32), negative refused |
| G10 binding | TRAIN manifest hash, thresholds | DEV manifest hash; unknown category or id refused |
| Tensor conversion | one sample | **both splits** through `tensor_check`: shape, positives only, every box inside the letterbox, every target with a positive cell |

The following were already covered and are kept:
- exact frame accounting, frame SHA-256, wrong size, path outside the split folder;
- annotation association, unknown class, box leaving the viewport or degenerate;
- positive-only loading, occlusion exclusion, and an occlusion case flagged positive refused.

### Verification

See `decision.md` for the final numbers.

### G10 and training

- **G10 thresholds** (`g10-acceptance-review.md`): adequate on the evidence for the failure they were calibrated on, with a narrow coverage margin. **Not approved.**
- **Training architecture** (`training-architecture-review.md`): the M22.7 design meets every requirement. Four amendments are listed for a future implementation. Nothing was implemented.

## Conclusion

The adapter's tests are now part of the canonical verification, fail-closed and pinned. Training readiness still waits on three owner decisions:
- approving the G10 thresholds;
- accepting candidate 2;
- authorising `train_v2.py`.

## Reproducibility

```bash
npm run verify
npm run test:py
python -m pytest tools/detector/tests -q
```
