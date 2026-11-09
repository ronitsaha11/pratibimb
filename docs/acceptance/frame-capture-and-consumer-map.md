# Frame capture and frame-consumer map (M23.5)

> **Status:** static source map at `a165c7a` (M23.5, 2026-11-03).
> - **Nothing run or touched:** no frame was captured, no model was loaded, and no code was changed.
> - **Labels:** FACT (source, cited), INFERENCE, or UNKNOWN.
> - **Since then:** M23.7 took capture out of product tasks, so the chain below now describes evidence builds and the diagnostic path. M23.8 audited that path: `diagnostic-hook-boundary-map.md`. **M23.9 (OD-S) took that path out of product builds too,** so this chain now describes evidence builds alone. **M23.13 (OD-W):** step 1 too: a product's toolbar opens the side panel and issues no grant.

## 1. The capture chain

| # | Step | Where | What moves | Source |
|---|---|---|---|---|
| 1 | **Gesture grant** | service worker | `chrome.action.onClicked` (toolbar, or `Alt+Shift+P` via `_execute_action`) → `capture.grant(tabId)`. Valid for **5 minutes** (`grantTtlMs`). **Revoked on navigation** (`status === "loading"`) and on tab close. The action does not open the side panel (no `setPanelBehavior` in source) | `apps/extension/host/background.ts`; `host-lib/capture-authority.ts` |
| 2 | Pass starts | offscreen document | `runTask` → `perceive` → `ensurePerception()` (creates the **T1 session**) → `realm.perceive` | `host/offscreen/main.ts` |
| 3 | Capture request | offscreen → worker | `CAPTURE_FRAME` `{ tabId, documentId }`; accepted only from the offscreen document | `background.ts` |
| 4 | Ticket | worker → offscreen | **gesture route:** an opaque stream-id **string** (`getMediaStreamId`); the worker holds no frame. **No grant:** `NO_ACTIVE_TAB_GRANT`, and the pass is refused **before** any inference. `WORKER_FRAME` (`captureVisibleTab`, data URL in the worker) exists only in builds with `__M3_WORKER_FRAME__` | `capture-authority.ts`; `background.ts` |
| 5 | Frame | offscreen | `getUserMedia(chromeMediaSourceId)` → `ImageCapture.grabFrame()` → `ImageBitmap` → RGBA. The bitmap is closed after decode; the track is stopped after one frame | `host-lib/perception-realm.ts` |
| 6 | T1 inference | offscreen (ORT WASM) | preprocess → `detector.detect` → `toVisualDetections` | same |
| 7 | TR-01 | TR-01 dedicated worker | a **copy** of the RGBA, by `postMessage`; boxes come back. The worker scrubs its copy at run end (source comment) | `host-lib/tr01-host.ts`; `host/tr01-worker.ts` |
| 8 | Mask | offscreen | `reportFromFullFrame` → `sanitizeFrame`, an opaque fill **in place** → `sanitized` (or `null`) | `perception-realm.ts` |
| 9 | Fusion | offscreen | `fuse(graph, visual, detected.ok, geometry)`: `dom` / `dom+vision`, or `NO_DETECTOR` | `packages/perception/src/fusion.ts` |
| 10 | Capability declaration | offscreen (core realm) | `visual()`: `null` unless `ran && detector.ran && capture`. Otherwise `backend`, `tiersFired: ["T0","T1","T2"]`, `scaleToCss` and `sourceById` | `host-lib/extension-run.ts` |
| 11 | Run report | offscreen | `report.perception.push(summary)`: codes, counts, timings; no pixel | `host-lib/extension-ports.ts` |
| 12 | Reasoner handoff | offscreen → loopback | the JSON planning view only (no frame, no `source`, no capability) | `packages/reasoner/src/localModel.ts` |
| 13 | Egress boundary | `@pratibimb/egress` | `sendVerified` only, to the CSP v2 endpoint. `frame.ts` and `qg04.ts` have **no product caller** | `packages/egress/src/guard.ts` |

## 2. Frame-byte consumers

**Confirmed in the normal product path (FACT):**

| Consumer | Holds | Lifetime |
|---|---|---|
| `perception-realm.ts` decode (`rgbaFrom`) | the `ImageBitmap`, then RGBA | the bitmap is closed after decode; the RGBA is masked in place |
| T1 preprocess (offscreen ORT) | the tensor from the RGBA | the pass |
| TR-01 worker | a copy of the RGBA | scrubbed at run end |
| `sanitizeFrame` / `sanitized` | the masked RGBA | until the next pass or `null`; **no product reader** |

**Present in a product build at the time, but reachable only through test or evidence entries (FACT at `a165c7a`; since M23.9, in evidence builds only):**

| Entry | What it returns | Reachable from |
|---|---|---|
| `PERCEIVE_ONCE` (offscreen) | codes, counts, timings, geometry. **No pixels** | messages from this extension (`isFromThisExtension`); the worker's `__host.perceiveOnce` ("TEST AND EVALUATION ONLY") |
| `STREAM_CONSUME` (offscreen) | width, height, timings. The bitmap is closed. **No pixels** | the worker's `__host.consumeProbe` ("TEST-ONLY") |
| `sanitizedFrame()` / `encodeSanitized()` | the masked frame / a WebP | only `serveTr01Probe`, which is `probe/tr01-absent.ts` in a product build, returning `false` |
| `WORKER_FRAME` data URL | an encoded frame in the worker | only builds with `__M3_WORKER_FRAME__` |

**Static evidence on message channels (FACT; partial):**
- **Message field names:** `visualBoundary.test.ts` asserts that `host-lib/messages.ts` and `host-lib/boundary-protocol.ts` declare no `pixels`, `dataUrl`, `screenshot`, `image` or `bitmap` field.
- **One decoder:** only `perception-realm.ts` decodes images in `host/` and `host-lib/`.
- **No storage or logging:** no source there persists to storage, and the realm does not log.

**UNKNOWN (U-1, narrowed but open):** a complete proof that no message carries frame bytes. The test is a field-name pattern over two files. The TR-01 worker protocol carries RGBA by design.

## 3. What depends on a captured frame

Without a frame, every pass is refused at step 4, and steps 6–11 behave as follows (FACT):
- no T1 inference and no TR-01 run;
- `detector.ran = false`;
- `visual()` returns `null`, so the handoff declares the **structural floor:** `backend: "none"`, `tiers_fired: ["T0","T2"]`, `scale_to_css: 1`, every `source: "dom"`;
- the task continues on the DOM reading.

**This is exactly the M20 benchmark condition:** 33 passes, all `NO_ACTIVE_TAB_GRANT`, `detectorRan = 0`, and 6 bounded tasks completed (W1, synthetic loopback pages).

**INFERENCE:** in Phase 1, after T1 is disabled, no product component consumes a captured frame except TR-01. TR-01's output, the masked frame, has no product reader.
