# M22.19 — decision record

**M22: ENGINEERING SCOPE CLOSED; DETECTOR-PERFORMANCE RESEARCH DEFERRED.** This is the owner's Option B (2026-11-03): an owner-approved change of research scope. It authorises no evaluation and no training, and it leaves the safety-classifier block in place.

| Item | Status | Evidence |
|---|---|---|
| Amended M22 objective | **RECORDED** | README, "The amended M22 objective" |
| Engineering deliverables (dataset, G10, adapter, occlusion-aware training, v2 pipeline, one run, telemetry and resume) | **DELIVERED, with limitations**: reproducibility on W1 only; hosted CI never run; telemetry verified with fakes | README §1 |
| First authorised training experiment | **COMPLETED** (M22.13) | `M22.13-first-training-run/` |
| Detector performance (T1, T1-v2); H1–H5; T1 vs T1-v2 | **UNKNOWN / UNTESTED** → FR-01, **DEFERRED — NOT AUTHORISED FOR EXECUTION** | `agentos/registry/future-research-register.md` |
| Adoption | **none**; the epoch-39 checkpoint and T1 are UNADOPTED | — |
| Unbiased performance claim | **not supported**; no v2 TEST | — |
| Evaluation restriction | **IN FORCE, unchanged**: B-07 | `agentos/blockers.md` |
| Outstanding items | **17 registered**: 4 completed, 2 documentation only, 2 deferred to FR-01, 2 transferred, 6 awaiting the owner, 1 not authorised | `outstanding-register.md` |
| Verification | `python scripts/verify-repo.py` only: documentation and governance checks over tracked and committable text files; no dataset, model or TEST is read. **Exit 0; 0 failures, 0 warnings.** `npm run verify` was **not** run, because its Python step (`test_training_v2.py`) runs the training loop on synthetic fixture frames, and M22.19 authorises no training. These are documentation checks, **not detector validation** | this milestone's runs |
