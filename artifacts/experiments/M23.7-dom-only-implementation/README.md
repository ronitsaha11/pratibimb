---
id: M23.7-dom-only-implementation
title: "M23.7 — DOM-only Phase 1 implemented in product builds (OD-P, OD-R)"
status: implemented in source and verified at unit/static/build level on W1; NOT accepted (criteria stay PROPOSED); ADR-0015 stays PROPOSED — AWAITING OWNER APPROVAL; no browser run, no new benchmark
date: 2026-11-03
label: FACT (source diff, unit tests, product build output); no performance measurement
classification: IMPLEMENTATION (owner-authorised, M23.7) — no model loaded or hashed by hand, no frame captured, no inference, no training, no dataset
workstation: 1
---

# M23.7 — DOM-only Phase 1 implementation

> **What changed:**
> - **Tasks:** in a **product build**, a task takes no perception pass. So it captures no frame, loads and runs no UI head (T1), and starts no TR-01.
> - **Packaging:** the UI head is no longer packaged in a product build.
>
> **What did not change:**
> - **Evidence builds** (any of `TR01_PROBE`, `M3_WORKER_FRAME`, `STRUCTURAL_PROBE`, `E6_PROBE`, `EGRESS_EVIDENCE_PROBE`): they keep the perception pass and the T1 packaging as before.
> - **TR-01:** its asset, packaging, hash checks and worker are unchanged.
> - **Permissions and CSP** are unchanged.

## Hypothesis

OD-P and OD-R can be implemented by gating two things on the build's existing `EVIDENCE_BUILD` flag:
- the task run's perception dependency;
- the UI head's packaging and loading.

The aim is to do this without changing the structural pipeline, any safeguard, permissions, CSP, egress or evidence-build behaviour.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `9c4a357` before this milestone, 76 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's `npm ci` install; WXT 0.21.4; Vite 7.3.6.

## Expected result

- **The product build:** no `t1-ui-head.onnx`; no perception port in task runs; the handoff declares the structural floor.
- **Evidence builds:** unchanged.
- **Tests and build:** the unit suites, the typecheck, the pin check and the product build all pass.

## Actual result

### Source changes

| File | Change |
|---|---|
| `apps/extension/host-lib/task-perception.ts` (**new**) | `taskPerception(evidenceBuild, perceive)` returns `{}` in a product build and `{ perceive }` in an evidence build. `loadsUiHead(evidenceBuild)`. It declares the build-time global `__EVIDENCE_BUILD__` |
| `apps/extension/host/offscreen/main.ts` | `runTask` passes `perceive` only through `...taskPerception(__EVIDENCE_BUILD__, …)`. `ensurePerception` throws before the T1 fetch in a product build, so `session = null` and the existing `MODEL_ASSET_UNAVAILABLE` refusal path applies. `ortSmoke` stops after the ORT bootstrap in a product build, with `stage: "UI_HEAD_NOT_IN_PRODUCT_BUILD"`. **Both `fetch(resolvePackagedAsset(` lines are kept,** so the network gate's exact count is unchanged |

### Packaging changes

| File | Change |
|---|---|
| `apps/extension/wxt.config.ts` | defines `__EVIDENCE_BUILD__: JSON.stringify(EVIDENCE_BUILD)`. The `t1-ui-head.onnx` copy (and its missing-file check) is now inside `if (EVIDENCE_BUILD) { … }`. **Unchanged:** the TR-01 copy and its SHA-256 and size refusal, the ORT files, the aliases, the permissions and the CSP |

### Test and harness changes

| File | Change |
|---|---|
| `apps/extension/test/domOnlyPhase1.test.ts` (**new**, 18 tests) | the policy as behaviour; the wiring in `main.ts`, `extension-run.ts`, `extension-ports.ts` and `wxt.config.ts` read as source; evidence-build and permission preservation; the DOM-only handoff exercised through `buildHandoffDraft` (structural floor; DOM elements kept; a provenance map cannot add an element) |
| `apps/extension/test/coverageBoundary.test.ts` | classifies the new module as unit-tested (the test requires every new file to be classified) |
| `tests/browser/extension/run-csp-negative.mjs` | **product phase only.** The check `ortAndModelLoad` becomes `ortRuntimeWithoutUiHead`: the pinned ORT runtime bootstraps, and the UI head is reported not packaged. This follows from the owner's packaging decision; it is not there to make a test pass. **The evidence phase is unchanged.** **Not run in M23.7:** its evidence phase captures a frame and runs T1 and TR-01 |

### Behaviour before and after (normal product task)

| | Before (at `9c4a357`) | After |
|---|---|---|
| Perception port in a task | always wired; capture attempted on every turn and refused without a gesture grant | **not wired** (`taskPerception(false, …)` → `{}`) |
| Frame capture | on gesture-granted passes | **never initiated by a task** |
| T1 | session on the first pass; inference on frame passes; packaged | **not loaded, not run, not packaged** |
| TR-01 | on frame passes | **not started by a task**; still packaged and hash-checked |
| Handoff declaration | the floor unless a frame pass ran T1 | **always the floor:** `backend: "none"`, `tiers_fired: ["T0","T2"]`, `scale_to_css: 1`, `source: "dom"` |
| Run report `perception` | one refused summary per reading | **empty** |
| Structural pipeline, grounding, click eligibility, freshness, hit test, consent and grant, five-turn cap, postconditions, `sendVerified`, reasoner request | — | **unchanged** (no change to those files; the suites pass) |

**Evidence builds:**
- the perception port is still wired;
- T1 is still packaged and loaded;
- TR-01, the masked-frame readers, `WORKER_FRAME`, `PERCEIVE_ONCE` and `STREAM_CONSUME` are all unchanged.

## Verification (commands, exit codes, counts)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | **0** | — |
| `npx vitest run` (13 focused extension files), first attempt | **1** | 223 passed, **1 failed**: my new permissions test, whose comment stripper treated `/*` in `"http://127.0.0.1/*"` as a comment. **A test bug, fixed in the test** (line-anchored stripper, as in `taskLoopWiring.test.ts`); no product change |
| `npx vitest run apps/extension/test/domOnlyPhase1.test.ts`, retry | **0** | 18 passed |
| **Mutation check:** the same file against the pre-M23.7 `main.ts` and `wxt.config.ts` (temporarily restored from `HEAD`, then put back byte-identical, checked with `cmp`) | **1** (expected) | 6 failed, 12 passed. The new tests detect the old behaviour |
| `npx vitest run` (full suite) | **0** | **144 files passed, 2 skipped; 3177 tests passed, 22 skipped**, on the first attempt |
| `npm run pin:check` | **0** | ORT PIN OK (`onnxruntime-web@1.29.0`) |
| `npm run build` in `apps/extension`, with every evidence flag empty | **0** | output contains **no `t1-ui-head.onnx`**; `tr01-ppocrv4-mobile-det.onnx` is packaged (the hook's existing TR-01 hash check passed) |
| Built-manifest and bundle assertions | — | `permissions: ["offscreen","sidePanel","activeTab","tabCapture"]` (unchanged); `host_permissions: ["http://127.0.0.1/*"]`; CSP v2 with `connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`; no `__EVIDENCE_BUILD__` identifier left in the offscreen chunk (substituted) |
| `python scripts/verify-repo.py` | **0** | 0 failures, 0 warnings (run at the end) |

**Not run, deliberately:**
- **`npm run verify`:** its `test:py` step runs the training loop on synthetic fixture frames.
- **Browser harnesses:** they need Chrome and the local reasoner (model inference). Several also capture frames in evidence builds.
- **An evidence build:** it would copy the T1 file. Evidence-build preservation is established from configuration and source tests.

## Known limitations

1. **Not browser-verified:** there is no browser run of the product build in M23.7. The person-run smoke and the product benchmark are **pending**.
2. **Test-only entries still exist in product builds:** `PERCEIVE_ONCE` and `STREAM_CONSUME`, reachable only through the DevTools-only `__host` control plane, are preserved as instructed. If explicitly driven with a gesture grant, `PERCEIVE_ONCE` can still capture and run TR-01. They are not part of normal task execution. A toolbar click still records a capture grant (unchanged `capture-authority` behaviour); tasks do not request or use it.
3. **Vacuous harness checks:** `run-consent-task.mjs` and `run-declared-task.mjs` check `perception.every(p => !p.ran && p.refusal === "NO_ACTIVE_TAB_GRANT")`, which now holds vacuously (an empty array). Not changed here.
4. **Benchmark label:** `run-product-benchmark.mjs` will now report `visualPerceptionPasses: 0`. Its environment text still describes the old no-gesture floor.
5. **ADR-0015 and some acceptance text** say "implementation not authorised / runtime unchanged". **ADR-0015 is not edited** (it stays PROPOSED); its status note needs updating when the owner considers OD-N.
6. **No performance claim:** no performance claim is made. New product performance evidence is **pending**, and any comparison must be separately authorised and must not use the blocked M22 evaluation operation.
7. **Visual-only PII:** visual-only PII protection is **not** implemented in Phase 1. Normal Phase 1 privacy relies on the structural and textual controls (DOM classification, references, the vault, the verifier, `sendVerified`).

## Rollback

`git revert <M23.7 commit>` restores `9c4a357` behaviour: the task perception pass, T1 packaging and loading. Re-enabling T1 that way is a **reactivation**, which the proposed OD-O policy would gate on integrity prerequisites I-1 to I-7.

## Conclusion

The owner-selected DOM-only Phase 1 is implemented for product builds, with evidence builds preserved. It is verified by unit, static, mutation and build checks on W1. It is **not accepted:** browser-level, cross-machine, independent and real-site evidence remain outstanding, and every criterion stays PROPOSED.

## Reproducibility

```bash
npm run typecheck
```

```bash
npx vitest run
```

```bash
npm run pin:check
```

```bash
npm run build -w @pratibimb/extension
```

```bash
python scripts/verify-repo.py
```
