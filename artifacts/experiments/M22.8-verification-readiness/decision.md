# M22.8 — decision record

**The Python adapter tests are part of `npm run verify`, and of CI. Training is not ready: three
owner decisions are outstanding. No model was trained, no inference was run, and no TEST data was
touched.**

| Part | Status | Evidence |
|---|---|---|
| Python tests inside `npm run verify` | **DONE**: the last step, `npm run test:py`. 48 passed on W1, including inside the full `verify` run | `package.json`, `scripts/verify-python.py` |
| Fail-closed environment checks | **DONE**: missing dependency, old Python and strict drift fail (tested). A decoy `pytest` on W1 made `npm run test:py` exit 2 | `tools/detector/tests/test_verify_python.py` |
| Pinned dependencies | **DONE**: exact pins, CPU torch | `tools/detector/requirements-test.txt` |
| CI | **CONFIGURED**: `detector-adapter` job (Python 3.13, strict pins). **Not run yet**, so whether the pins install on ubuntu-latest is UNKNOWN until the first run | `.github/workflows/ci.yml` |
| Adapter regression tests | **DONE**: 13 added; adapter code unchanged | `tools/detector/tests/test_data_v2.py` |
| `npm run verify` | **PASS**: repository check 0 failures, ORT pin and typecheck pass; JavaScript 3,159 passed, 22 skipped; Python 48 passed | this milestone's run |
| G10 thresholds | **NOT APPROVED**: review prepared; provisional file and `approved: false` untouched | `g10-acceptance-review.md` |
| Candidate 2 | **DRAFT**: unchanged | — |
| `train_v2.py` | **DESIGN ONLY**: reviewed, 4 amendments listed | `training-architecture-review.md` |
| Candidates 1 and 2, T1 model, legacy loader and trainer | **UNCHANGED** | hashes, `git diff` |

**Owner decisions:**
1. **G10 thresholds.** Approve as provisional; approve with `coverageVisibleAtLeast` lowered to 0.005 (no coverage borderline band); or keep G10 diagnostic only. `g10-acceptance-review.md` §5.
2. **Candidate 2.** Accept it as the training dataset, or ask for changes. M22.6's open visual limitations:
   - faint unchecked native controls;
   - the `card` occluder looking like a field;
   - the "Go"/"OK" word share;
   - illegible very-small text.
3. **Training.** Authorise implementing `train_v2.py` with the review's amendments, then a separately authorised training run.
4. **CI.** Confirm the new CI job passes on its first run. That needs a push, which is not part of this task.
