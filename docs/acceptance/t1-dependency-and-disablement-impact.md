# T1 dependency and disablement impact

> **Status:** static source analysis, M23.4, 2026-11-03, at `8767428`.
> - **Owner policy:** **OD-P is SELECTED:** T1 is to be disabled from active Phase 1 execution. **Implementation is pending a separate authorisation. T1 is NOT disabled;** the source still loads and runs it.
> - **Method:** no model was loaded, read or hashed. No code was changed.
> - **Since then:** M23.7 implemented OD-P and OD-R in product builds, and M23.8 tested the boundary under a simulated extension. Not browser-verified, not accepted. This document's statements about what the runtime does describe the source when it was written, and still describe evidence builds.
> - **Labels:** FACT (source, cited), INFERENCE, or UNKNOWN.

## 1. Current runtime behaviour (FACT)

| Step | What happens | Source |
|---|---|---|
| Build | `build:publicAssets` copies `artifacts/models/t1-ui-head/t1-ui-head.onnx` into the package. The build **fails if the file is missing.** There is **no hash or size check** | `apps/extension/wxt.config.ts` (`MODEL`) |
| First perception call | `perceive` → `ensurePerception()` → `fetch(resolvePackagedAsset("t1-ui-head.onnx"))` → `createPinnedInferenceSession` (WASM). A failure is caught: `session = null`, `perceptionBoot.ok = false`, `acceptedBackends = []` | `apps/extension/host/offscreen/main.ts` |
| Each pass | capture first. **A refused capture returns before inference** (`CAPTURE_FAILED`, `NO_ACTIVE_TAB_GRANT`, `CAPTURE_THROTTLED`, `CAPTURE_DIMENSION_MISMATCH`). With a frame: preprocess → `detector.detect` → `toVisualDetections` → TR-01 → redaction → `fuse` | `apps/extension/host-lib/perception-realm.ts` |
| No session | `runtime = null` → `createUiElementDetector(null)` refuses with `MODEL_ASSET_UNAVAILABLE`. The pass **continues:** TR-01 runs, `fuse(graph, [], false, …)` marks DOM elements `visualAbsence: "NO_DETECTOR"`, and the summary has `detector.ran = false` | `packages/perception/src/uiDetectorHead.ts`; `fusion.ts` |
| Handoff declaration | `visual()` returns `null` unless `seen.ran && seen.detector.ran && seen.capture`. When it is `null`, the handoff declares the **structural floor:** `backend: "none"`, `tiers_fired: ["T0","T2"]`, `scale_to_css: 1`, no `sourceById` | `apps/extension/host-lib/extension-run.ts`; `packages/privacy/src/sanitize.ts` |

**Intended behaviour (OD-P):** T1 is neither loaded nor invoked; perception and tasks do not depend on it. This is **not implemented**.

## 2. Dependency matrix

**Columns:**
- **Req?** — does Phase 1 *require* T1 here?
- **Indep.?** — can T1 be removed here independently?
- **Schema** — does removal change a public or internal schema?
- **Fallback** — does a fallback already exist?
- **Failure safe?** — is the failure handling safe?
- **Regression risk** — what a future implementation could get wrong.

| Dependency | Req? | Indep.? | Schema | Fallback | Failure safe? | Regression risk |
|---|---|---|---|---|---|---|
| Packaging (`MODEL`, `build:publicAssets`) | **No** | yes | none. INFERENCE: the asset list shrinks | n/a | the build currently **fails** without the file | removing the copy while leaving the load would hit the existing `MODEL_ASSET_UNAVAILABLE` path at runtime (safe). Removing a missing-file check in a way that also skipped the TR-01 check would remove TR-01's integrity check |
| Loader (`ensurePerception` T1 fetch and session); `ortSmoke` (`ORT_SMOKE` message) | **No** | yes | `perceptionBoot` content | **yes:** `session = null` | yes (caught) | the offscreen `bootstrapOrtRealm("offscreen")` call sits inside the T1 load. **The TR-01 worker is independent:** it runs its own `bootstrapOrtRealm("tr01-worker")` and `loadVerifiedModel` (`apps/extension/host/tr01-worker.ts`). Removing the offscreen T1 session therefore does not remove TR-01's runtime or model pin. A future change must keep the worker's pin intact. `ortSmoke` is reached only by an `ORT_SMOKE` message |
| `MODEL_ID` / `MODEL_REVISION` | **No** | yes | `detector.modelId` / `revision` in the summary | `createUiElementDetector(null)` reports `"… (NO WEIGHTS)"` / `"unbuilt"` | yes | a label only. It carries no integrity, so nothing is lost |
| Inference invocation (`detector.detect`) | **No** | yes, through the null runtime | none | **yes:** `MODEL_ASSET_UNAVAILABLE`, and the pass continues | yes; tested (`visualBoundary.test.ts` "NO_DETECTOR rather than NOT_DETECTED") | a refusal must stay a refusal, never an empty list, which is "indistinguishable from a page with no controls" (source comment) |
| Fusion (`fuse`) | **No** | yes | provenance values (`dom+vision` no longer produced; `NO_DETECTOR`) | **yes:** `detectorRan = false` | yes | none found |
| `sourceBySelector` / handoff `source` | **No** | yes | values only: every element `"dom"`. The `manifestV12` enum (`dom`/`vision`/`dom+vision`) is unchanged | **yes:** `visual() = null` gives no `sourceById` | yes | none found. Not in the reasoner request |
| `capability` (`backend`, `tiers_fired`) | **No** | yes, **but coupled** | values: `none` and `["T0","T2"]` | **yes:** the structural-floor declaration | yes | **coupling:** `visual()` gates the whole declaration on `detector.ran`. With T1 removed, a pass in which **TR-01 ran** still declares `backend: "none"`. That is a semantic question (OD-R; TR-01 assessment §4), not a safety break. A future change must not invent a T1 claim |
| `capture.scale_to_css` | **No** | yes, but coupled to `visual()` | value `1` | yes | yes | INFERENCE: harmless while no frame or geometry from capture space leaves. **Not** read by agent, plan or orchestrator (M23.3 grep) |
| Run report (`report.perception`, `detector`, `fusion`, `overlaySuspected`) | **No** | yes | report **values** (`detector.ran=false`, fusion counts) | yes | yes | `overlaySuspected` is **counted only**; no safety consumer reads it (`git grep`). Removing T1 removes no overlay protection |
| Timing (`preprocessMs`, `inferMs`, `uihead:*` stages; `perceptionBoot.ms`) | **No** | yes | timing fields keep their meaning (≈ 0, or absent) | n/a | n/a | **UNKNOWN** performance effect. Not measured, and not claimed |
| Error and fallback behaviour | **No** | — | — | the existing null-runtime path | yes | the implementation should reuse it, not add a new path (proposal) |
| DOM graph creation (`page-surface-dom.ts`, `extension-ports.ts`) | **No** | n/a | none | n/a | n/a | none: DOM-only |
| Click eligibility (`actionable`, `clickable`) | **No** | n/a | none | n/a | n/a | none: DOM roles, `enabled`, `visible`, evidence |
| Planner inputs (`contextFor`, `planSchema`, deterministic) | **No** | n/a | none | n/a | n/a | none |
| Freshness, hit test (`actionFreshness`, `hitTest`) | **No** | n/a | none | n/a | n/a | none found: no reader of fusion fields |
| Postconditions (`verifyResult`, `postconditions.ts`) | **No** | n/a | none | n/a | n/a | none found |
| Unit tests (`visualBoundary.test.ts`, `perceptionPass.test.ts`, `uiDetectorHead.test.ts`, `g5Structural.test.ts`) | n/a | — | — | — | — | they use fakes that carry the label `pratibimb-t1-ui-head`, and static scans of `main.ts`, `wxt.config.ts` and `perception-realm.ts`. Disabling would need test updates, and tests asserting the T1 load would change |
| Browser harnesses (`run-extension-loop.mjs`, which references `t1-ui-head`; `run-t1.mjs`, which uses synthetic detections; `run-qg05.mjs`) | n/a | — | — | — | — | evidence harnesses. Their scope would need restating |
| Hosted CI | n/a | — | — | — | — | **CI never builds the extension** (no `wxt build` in `ci.yml`). The `t1-detector-fusion` job uses **synthetic** detections. CI exercises neither T1 packaging nor loading |

## 3. Direct and indirect effects of removal

**Direct effects** (INFERENCE from §2):
- no T1 session and no T1 inference;
- `detector.ran = false` and fusion `NO_DETECTOR`;
- the handoff declares the structural floor (`backend: "none"`, `tiers_fired: ["T0","T2"]`, `scale_to_css: 1`, every `source: "dom"`);
- the T1 asset is gone from the package.

**Indirect effects:**
- **Performance:** pass latency and memory **may** change. This is UNKNOWN and not claimed, and it needs remeasurement.
- **Run report:** its values change.
- **The `capability` coupling:** TR-01 passes become undeclared in the handoff (see `tr01-privacy-acceptance-assessment.md` §4).

**Not affected** (from the consumers traced):
- DOM discovery, grounding, click eligibility;
- planner input, validation, REFRESH, hit test, postconditions;
- consent, the five-turn cap and egress.

This holds for the consumers traced. **UNKNOWN:** U-1 to U-3 (M23.3).

**The visual perception is changed.** No UI-element detections would exist. This is **not** "unchanged perception".

## 4. Phase 1 without T1 (intended architecture; not implemented)

**These continue to operate independently of T1:**
- DOM observation and the coordinate contract;
- sanitisation and the vault;
- the structure-only handoff and `sendVerified`;
- the local reasoner;
- VALIDATE, REFRESH, the hit test, the human grant, RE-HYDRATE, the click and VERIFY RESULT;
- the five-turn cap and fail-closed behaviour.

**These currently assume T1 exists:**
- `wxt.config.ts` (it requires the file);
- `ensurePerception` and `ortSmoke`;
- `MODEL_ID` and `MODEL_REVISION`;
- the `visual()` gate on `detector.ran`;
- the hard-coded `tiersFired: ["T0","T1","T2"]`;
- report fields and the `uihead` timing stages;
- tests and harnesses that reference it.

**No replacement detector or alternate inference route is proposed.**
