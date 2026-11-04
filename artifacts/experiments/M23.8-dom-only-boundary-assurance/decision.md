# M23.8 — decision record

**Verdict:** ASSURANCE RECORDED. Within a simulated browser, M23.7's boundary holds and is guarded by tests that fail if perception returns. **This is not a browser validation and approves nothing.**

**Nothing was decided here.** OD-S, OD-T and OD-U await the owner. ADR-0015 and every acceptance criterion stay PROPOSED.

## Final verification (W1, 2026-11-04)

Each command's execution path was read first.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| focused: `npx vitest run` on the six new test files | new tests; the rig's fakes; synthetic bytes in place of any model | **0** | 6 files, **166 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npm run pin:check` | hashes the ORT runtime files in `node_modules`, **not a model** | **0** | ORT pin OK |
| `npx vitest run` | every collected test, including the static boundary suites | **0** | 150 files passed, 2 skipped; **3343 passed, 22 skipped** of 3365 |
| `python scripts/verify-repo.py` | governance checks; hashes the dossier; names and text scans over git-listed files | **0** | 0 failures. The one warning on the run before this file existed was the missing `decision.md` |

**Not run, deliberately:**
- `npm run verify`: its `test:py` step runs the training loop on synthetic fixture frames.
- A product or evidence build: the build hook reads and hashes TR-01.
- Any browser harness, including the seven edited here.
- The evidence phase of `run-csp-negative.mjs`.

**The count adds up:** M23.7 recorded 3177 passed and 22 skipped, and 3177 + 166 new tests = 3343, so no existing test was dropped.

**Run once:** `node tests/browser/extension/inspect-product-build.mjs --record <dir>`, read-only over the existing M23.7 output, exit 0, `problems: []`. It lists model files by name and opens none (`logs/w1-m23-7-product-build-inspection.json`).

## First-attempt failures, in order

A later pass does not cancel these.

| # | Run | First result | Cause | Whose fault | Resolution |
|---|---|---|---|---|---|
| 1 | first spike on the rig | task ended `OBSERVATION_STALE` | the simulated page had no structural observer, so the real freshness gate failed closed | rig | added `watchStructure`. The product behaved correctly |
| 2 | spike | `HANDLE_ALREADY_ISSUED` | the rig reused a fake stream handle, and the real capture authority refused it | rig | unique handles |
| 3 | `domOnlyTaskPath`, first full run | exit 1; **7 failed**, 42 passed of 49 | see below | mine: 4 assertions, 2 rig flaws, 1 assertion | rewritten; see below |
| 4 | `diagnosticHooks` + `buildSeparation`, first run | exit 1; **1 failed**, 48 passed of 49 | a regular expression matched a type annotation | test | narrowed to `sendMessage({... kind` |
| 5 | focused run after fixes | exit 1; **1 failed**, 91 passed of 92 | I guessed the overlay refusal's cause as `HIT_TEST_MISMATCH`; the actual cause is `DIFFERENT_ELEMENT` | test | pinned, after confirming in `hitTest.ts` |

**Row 3 in detail:**
- **Four grounding tests** (unknown target, disabled control, non-click operation, second click) assumed a task ends REJECTED. The recorded fallback policy (`packages/reasoner/src/fallback.ts`) lets the deterministic planner answer after a merely *unusable* plan, through every gate. **My assertion was wrong, and the product follows its policy.** They were rewritten as a table asserting what the policy actually guarantees: the plan is never executed, `DETERMINISTIC_FALLBACK` is recorded where a plan exists, and hostile plans have no fallback.
- **The no-observer test:** a rig flaw (`watchStructure` was always defined).
- **The grant regression:** a rig flaw (`Frame is not fully opaque`). The synthetic frame is now fully opaque.
- **The goal canary:** the only occurrence was the person's own goal echoed in `record.goal`. Such a task is refused at SANITIZE with zero model requests (`VERIFY_VAULT_VALUE_IN_HANDOFF`). The test was rewritten and the observation recorded.

No assertion was weakened to reach a pass: rows 1 and 2 were corrected in the rig, and rows 3 to 5 now state what the source does.

## What did not happen

- **No frame** was captured, inspected or decoded. `getUserMedia`, `ImageCapture` and `createImageBitmap` were counted fakes.
- **No model** was loaded, read or hashed: T1, TR-01 or any other. The build-configuration test uses a fake disk that throws if a T1 path is read, and returns synthetic bytes for TR-01.
- **No inference, training, detector evaluation, prediction, ONNX export or dataset access.**
- **No TEST** was planned, seeded, generated or built.
- **No browser** ran. Evidence type A only.
- **No product source, CSP, permission, egress code, `tabCapture` use, hook, build separation, ADR, gate, security invariant, FR-01 or B-07 changed.** The diff's scope was checked before commit.
- **No owner decision was resolved, no gate signed, no acceptance criterion approved.**

## Labels

- **FACT:** the test and command results above, on W1; the source as read; the existing build output as read.
- **INFERENCE:** that the rig's fakes describe what Chrome would deliver. Unknowns are listed in `diagnostic-hook-boundary-map.md`.
- **UNKNOWN:** real-browser behaviour after M23.7; evidence-build behaviour at run time; performance.

## Next

Owner decisions: OD-S, OD-T, OD-U, then the ADR-0015 decisions. A person-run smoke needs its own authorisation (`docs/acceptance/dom-only-browser-smoke-procedure-PROPOSED.md`).
