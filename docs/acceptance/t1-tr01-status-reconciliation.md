# T1 and TR-01 — status reconciliation

> **Status:** source-traced findings (M23.3, 2026-11-03, at `3e6a2e6`).
> - **Method:** static source reading only. **Neither model was loaded or inspected.**
> - **What it settles:** it corrects every earlier statement that T1 is absent from the product path.
> - **What it does not settle:** it **adopts nothing**. Detector performance stays under **FR-01** (`DEFERRED — NOT AUTHORISED FOR EXECUTION`), and **B-07** stays `BLOCKED`.

## 1. T1 (`pratibimb-t1-ui-head`, label revision `ba6d9e93695b`)

**Five different states, kept separate:**

| Question | Finding | Source |
|---|---|---|
| **Present?** | **Not in git:** `artifacts/models/` is git-ignored. **Packaged:** the `build:publicAssets` hook copies `artifacts/models/t1-ui-head/t1-ui-head.onnx` into every build as `t1-ui-head.onnx`. The build fails only if the file is **missing**. **No hash or size check** | `.gitignore`; `apps/extension/wxt.config.ts` (`MODEL`, `build:publicAssets`) |
| **Loaded?** | **Yes**, in the offscreen document: `ensurePerception()` fetches the packaged file and calls `createPinnedInferenceSession(..., { executionProviders: ["wasm"] })`. That helper asserts the **ORT runtime** pin, not the model bytes. `MODEL_REVISION` is a label constant. **The bytes are not verified at runtime** | `apps/extension/host/offscreen/main.ts`; `packages/security/src/ortRuntimePin.ts` |
| **Inference invoked?** | **Yes, on every perception pass of every task turn:** `runTask` wires `perceive` unconditionally. The order is capture → UI head (`detector.detect`) → TR-01, sequentially | `main.ts` (`runTask`); `apps/extension/host-lib/perception-realm.ts` |
| **Outputs consumed?** | **Yes.** `toVisualDetections` → `fuse(graph, visual, …)` → `elements` (`dom` / `vision` / `dom+vision`), counts, and `sourceBySelector` (DOM-keyed only; vision-only elements have no selector) | `perception-realm.ts`; `packages/perception/src/fusion.ts` |
| **Reach the handoff?** | **Partly; established.** `extension-run.ts` `visual()` passes `backend`, `tiersFired: ["T0","T1","T2"]`, `scaleToCss` and `sourceById` into `buildHandoffDraft`. The handoff's elements come from the page realm's DOM classification (`classifyObservation`). `sourceById` only **replaces the `source` field of an element that already exists**. **A vision-only element cannot enter the handoff** | `extension-run.ts`; `packages/privacy/src/sanitize.ts` (`buildHandoffDraft`); `page-privacy-boundary.ts` |
| **Reach the reasoner model?** | **Not in the request body, as inspected.** `contextFor` sends goal, textbox `{id,name,empty}`, button `{id,name,enabled}` and references `{token,class,hint}`. The schema enumerates ids filtered by role, `visible` and `enabled`. None of `source`, `bbox`, `capability` or `capture` is sent | `packages/reasoner/src/localModel.ts` (`contextFor`, `groundingOf`, `planSchema`) |
| **Adopted?** | **No: UNADOPTED.** No owner adoption; QG-03a OPEN; registry not `ADOPTED` | `agentos/state.md` (M21); model registry |
| **Detector performance validated?** | **No.** Performance research belongs to FR-01, deferred and not authorised. The M21 diagnostic covers geometry, not quality | `agentos/registry/future-research-register.md` |

## 2. TR-01 (`PP-OCRv4_mobile_det`, text-region detector)

| Question | Finding | Source |
|---|---|---|
| Integrity | build-time SHA-256 and size check (refuses to package on mismatch); **runtime** `loadVerifiedModel` in the worker | `wxt.config.ts`; `apps/extension/host/tr01-worker.ts` |
| Visual input | a **copy of the full decoded frame**, sent to a dedicated worker after the UI head finishes | `perception-realm.ts`; `tr01-host.ts` |
| Output | text-region boxes → `reportFromFullFrame(…, visualRegions)` → an `UNREAD_REGION` finding per visual region (no class, no characters; `packages/privacy/src/textFinding.ts`) → fail-closed plan | `perception-realm.ts`; `visual-redaction.ts` |
| Where applied | `sanitizeFrame` fills the planned rectangles **opaquely, in place, in the in-realm frame**. The result is `sanitizedFrame()`, or `null` if the plan is refused | `perception-realm.ts` |
| What it changes | **only pixels of the local frame.** It does not change DOM values, DOM text, references, the handoff, or the reasoner request. A redaction **summary** (codes, counts, timings) goes into the perception report | same |
| Enforced before a privacy boundary? | the only boundary a frame could cross would be frame egress. Its senders have **no product caller**, and production egress is impossible (three locks). INFERENCE: TR-01's effect in Phase 1 is a pre-egress safeguard on a disabled path | `frame.ts`, `qg04.ts`; ADR-0012 §16 |
| Visual-only PII protection | **NOT VERIFIED** (M9). It is not accepted, and not complete | M9; M10 |

## 3. T1's downstream influence (consumers traced)

| Consumer | Influenced by T1? | Basis |
|---|---|---|
| Element selection, and the elements in the handoff | **No:** the elements come from the DOM classification | `buildHandoffDraft` keeps `parts.elements`; only `source` is replaced |
| Handoff metadata (`source`, `capability`, `scale_to_css`) | **Yes** | `buildHandoffDraft`; `extension-run.ts` `visual()`. It is checked by `isVerifiedHandoff` and `manifestV12` validation (shape only) |
| Reasoner input | **No** (body inspected) | `localModel.ts` |
| Click-target eligibility | **No:** `actionable` is DOM-derived (`enabled` and evidence `OBSERVED`/`CLIPPED`); `clickable` is role, `visible` and `enabled` | `extension-ports.ts`; `localModel.ts` |
| Plan validation, REFRESH, hit test, result verification | **None found:** no reader of `source`, `capability` or `scale_to_css` in `packages/agent`, `plan` or `orchestrator` | `git grep` over those packages |
| Deterministic planner fallback | **None found:** it reads `handoff.elements` (ids, roles); not `source` | `packages/reasoner/src/deterministic.ts` |
| User-facing output | **The side panel does not display it:** no reference to perception or detector fields in `host/sidepanel` or the panel modules. **The run result does:** perception summaries are in the run report (`report.perception`) and `perceptionBoot` | `extension-ports.ts`; `extension-run.ts` |
| Timing and failure | **Yes:** T1 inference is part of every pass's time. A failed pass "is recorded and the reading continues", and the handoff then declares the structural floor | `extension-ports.ts` comment and code |

**Conclusion (INFERENCE, from the rows above):**
- **What T1 influences, in Phase 1:** handoff metadata that the reasoner request omits, the run report, and pass latency.
- **What it does not influence:** no traced consumer lets T1 output change which elements exist, what the reasoner is told, what may be clicked, or how a result is verified.
- **What stays UNKNOWN:** wider indirect influence (U-2), and the effect of its latency or failure on outcomes (U-3).

## 4. The integrity and reproducibility gap (FACT)

- **No check:** T1 bytes are verified **neither at build time nor at runtime**. Any file at the git-ignored path is packaged and run.
- **TR-01 has both checks.**
- **What this means for reproducibility:** whether a given machine's T1 equals `ba6d9e93…` is UNKNOWN (U-4). Any measurement of the product, including the M20 benchmark, depends on a file that is not identity-checked.
- **Related records:** ADR-0003 ("detector artifact packaging and runtime identity") is **PROPOSED, not implemented**.
- **This is recorded, not fixed.** A fix is source work and needs a separate authorisation (OD-O).

## 5. Corrections to earlier statements

| Where | Earlier wording | Correct wording |
|---|---|---|
| M23.1 core proposal §2 (before M23.2) | "the product ships the DOM-only floor" | T1 is loaded and run; its output is fused; clicks and handoff elements are DOM-only |
| M23.1 traceability §2 (before M23.2) | "No UI detector (T1 unadopted; DOM-only floor)" | as above |
| `agentos/state.md` historical rows ("DOM-only floor", option C) | describe the 2026-09 option set | historical; left as written. This document is the correction |
| `extension-run.ts` comment "Null when this build ran the DOM-only floor" | source comment | not edited (no source changes) |
