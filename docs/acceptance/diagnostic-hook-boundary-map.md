# Diagnostic-hook reachability and boundary map (M23.8)

> **Status:** audit of `PERCEIVE_ONCE` and `STREAM_CONSUME` at `740a245` (M23.8, 2026-11-04).
> - **Method:** source reading, an inspection of the existing M23.7 product build, and tests that run the real handlers through the real listeners under a fake `chrome` (`apps/extension/test/diagnosticHooks.test.ts`).
> - **Not a browser validation.** What Chrome itself would deliver or honour is not established here, and is marked UNKNOWN.
> - **No hook was changed, disabled, moved or restricted.** The decision is OD-S (`od-s-diagnostic-hooks-comparison-PROPOSED.md`).
> - **Labels:** FACT (source, or a test of this repository's code), INFERENCE, or UNKNOWN.

## 1. Summary

- **Ordinary task execution reaches neither hook** (FACT: a whole task sends neither kind, and `runTask` names neither).
- **Both hooks ship in the product bundle** (FACT: `logs/w1-m23-7-product-build-inspection.json`). Their source comments say "test only", but no build flag keeps them out.
- **"DevTools-only" is true of `__host`, not of the handlers.** Each handler accepts a message from any context of this extension, including this extension's own content script (FACT, tested). No source sends one that way, and no page has a channel to one. This corrects M23.7's wording.
- **No hook returns a pixel to any caller** (FACT, tested: an exact field list, no image shape).
- **A hook can still capture in a product build.** With a live gesture grant, `PERCEIVE_ONCE` captures and decodes a frame and starts TR-01. T1 stays out.

## 2. Route classification

| Route | Issued by (source) | Guard at the handler | Grant needed for a frame? | Captures or decodes? | T1 | TR-01 | Returns | Builds | Class |
|---|---|---|---|---|---|---|---|---|---|
| `RUN_TASK` | `__host.runTask` | this extension; **tab senders refused** | no frame is ever asked for | **no** (product) | **no** | **no** | run record | all | **Normal product task path** (evidence builds add perception) |
| `TASK_PREPARE`, `TASK_START`, `TASK_STATUS` | side panel | `isFromExtensionUi` | no frame is ever asked for | **no** (product) | **no** | **no** | form, status, run record | all | **Normal product task path** |
| `PERCEIVE_ONCE` | `__host.perceiveOnce`; `__host.toOffscreen` | this extension; **tab senders accepted** | **yes**, through the capture authority | with a grant: **yes** | product: **refused, never fetched**. Evidence: loaded and run | with a frame: **yes** | codes, counts, timings, geometry | **all** | **Diagnostic product path** |
| `STREAM_CONSUME` | `__host.consumeProbe`; `__host.toOffscreen` | this extension; **tab senders accepted** | **not checked by the handler.** It needs a stream id, which only the worker can mint under a grant | **yes**, one frame, then closed | no | no | width, height, settings, timings | **all** | **Diagnostic product path** |
| `__host` members (`perceiveOnce`, `consumeProbe`, `mintStreamId`, `noteGrant`, `toOffscreen`, …) | a person or tool attached to the service worker through DevTools | a global on the worker; no message reaches it | as above | as above | as above | as above | as above | **all** | **Diagnostic product path** |
| `ORT_SMOKE`, `REALM_PROBE` | `__host.toOffscreen` | this extension | n/a | no | product: not loaded | no | runtime status; API surface | all | **Diagnostic product path** (no capture) |
| `CAPTURE_FRAME` | the perception realm | **offscreen document only** (`isFromOffscreenDocument`) | **yes** | issues a handle or a refusal | no | no | ticket | all | Internal to a perception pass; in a product build reached only through `PERCEIVE_ONCE` |
| `WORKER_FRAME` route (`captureVisibleTab`) | capture authority | compiled in only with `M3_WORKER_FRAME=1` | no | yes, in the worker | evidence | evidence | ticket with a data URL | evidence only | **Evidence-build-only path** |
| `serveTr01Probe` (masked-frame reader, encoder, test-sink send) | `TR01_PROBE` messages | absent from a product build (`probe/tr01-absent.ts` answers `false`) | per probe | yes | evidence | evidence | per probe | evidence only | **Evidence-build-only path** |
| `#structural-probe`, `#egress-evidence-probe`, `#e6-probe` | their harnesses | stubs in a product build | n/a | no | no | no | per probe | evidence only | **Evidence-build-only path** |
| Harness drivers (`tests/browser/extension/*.mjs`) | a person or CI running them | outside the extension | as above | as above | as above | as above | evidence records | not shipped | **Test-only path** |

## 3. `PERCEIVE_ONCE`, from origin to end

1. **Origin.** `__host.perceiveOnce(tabId, frameId)` (`host/background.ts:203`), or any `chrome.runtime.sendMessage` of this kind from a context of this extension. `__host.toOffscreen` (`:108`) forwards any message.
2. **Handler.** `host/offscreen/main.ts:458`, after `msg.target === "offscreen"` and `isFromThisExtension(sender)` (`:382`). There is no tab refusal, no check of `tabId` or `frameId`, and no check for a task in progress.
3. **Observation.** `perceiveTab` (`:179`) reads the page through `observePage`. The transport requires a document the browser attested; content scripts run on `http://127.0.0.1/*` only.
4. **Realm.** `ensurePerception` (`:122`) brings ORT up even when no frame will follow (tested: `ortBootstraps: 1` with no grant). In a product build it refuses the T1 fetch (`:136`), so the detector has no session.
5. **Capture.** `CAPTURE_FRAME` goes to the worker, and `capture.ticketFor` applies the rules:
   - no live grant: `NO_ACTIVE_TAB_GRANT`, and the pass ends with **no frame, no T1 and no TR-01** (tested);
   - a live grant: a handle is minted, and `getUserMedia` and `grabFrame` run in the offscreen document (tested with fakes). The track is stopped and the bitmap closed (tested).
6. **Perception.** Product build: the detector refuses `MODEL_ASSET_UNAVAILABLE`, and the pass continues. Evidence build: T1 runs.
7. **Redaction.** TR-01's worker starts, weights load through `loadVerifiedModel`, and a frame copy is sent (tested with a fake worker). If TR-01 cannot start, the frame is masked fail-closed (tested).
8. **Retention.** The masked frame stays in the realm's `sanitized` variable until the next pass clears it (`host-lib/perception-realm.ts:654`, `:842`). No product code reads it.
9. **Reply.** `redaction, refused, route, capture, byClass, fusion, ms, viewport, anchors, afterFiltering, accounting, threshold, detections`: codes, counts, timings and geometry (tested: exact field list, no image shape).

## 4. `STREAM_CONSUME`, from origin to end

1. **Origin.** `__host.consumeProbe()` (`host/background.ts:186`), which asks the capture authority for a ticket first and answers `NO_GRANT` when no person has invoked the extension (tested). Or any message of this kind from a context of this extension.
2. **Handler.** `host/offscreen/main.ts:484`, with the same two guards. **It checks no grant and does not validate `streamId`:** whatever id it is given goes to `getUserMedia` (tested).
3. **The gate is the browser's.** A usable id comes only from `getMediaStreamId`, which only the worker calls; M3.1 measured Chrome refusing that call without an invocation (`host-lib/capture-authority.ts`). Whether Chrome would honour an id that was not minted for this extension is **UNKNOWN**.
4. **Effect.** One frame as an `ImageBitmap`, closed at once; the track is stopped (tested with fakes).
5. **Reply.** `ok, w, h, settings, ms`. No T1, no TR-01 (tested).

## 5. Who can issue them

| Sender | What the handlers do | Sent in source? | Evidence |
|---|---|---|---|
| Worker control plane (`__host`, through DevTools) | accepted | yes: this is the only sender in source | FACT (tested; static) |
| Side panel context | accepted | **no** | FACT (tested; static) |
| This extension's content script | **accepted. `RUN_TASK`, `E6_ARM`, `ARM_BOUNDARY_CAPABILITY`, `GRANT_DECIDE` and `TRANSPORT_OBSERVE` refuse tab senders; these two do not** | **no**: it sends only `BOUNDARY_COLLECT`, `RELAY_ECHO` and `HELLO` | FACT (tested; static) |
| Another extension | `isFromThisExtension` refuses: `SENDER_NOT_ACCEPTED`. No `onMessageExternal` listener exists | no | FACT for the code (tested). Chrome's delivery rule: UNKNOWN here |
| A hostile page | **no channel in source:** no `externally_connectable`, no web-accessible resource, no `postMessage` or window listener, and the content script takes commands only from this extension's non-tab contexts | no | FACT for the code and the manifest (tested; build inspection). Chrome's enforcement: UNKNOWN here |
| A compromised content script or renderer | INFERENCE: could reach both handlers, since the content-script route to the offscreen document is the one `BOUNDARY_COLLECT` already uses. A frame would still need a live grant on the named tab (5 minutes at most, ended by navigation). The reply is geometry and counts, and `STREAM_CONSUME` would still need a minted id it has no way to obtain | no | INFERENCE, from the rows above. Not demonstrated |
| Anyone attached to the service worker through DevTools | can call `__host` directly. That includes a person at the machine in developer mode, and a process using a remote-debugging port | n/a | FACT that `__host` is an unguarded worker global. Who can attach depends on how the browser was started: UNKNOWN for any given machine |

## 6. Findings

| # | Finding | Label |
|---|---|---|
| F-1 | Both hooks and the `__host` drivers are in the product bundle, behind no build flag. The repository's own rule for test control is "absent from the bundle rather than present and refused" (`wxt.config.ts`, `E6_PROBE`); these two predate it and are the exception | FACT |
| F-2 | "Reachable only through the DevTools-only control plane" (M23.7 record, M23.5 state row) is **too strong.** It describes the only sender in source, not what the handlers accept | FACT; corrects M23.7 |
| F-3 | Neither handler refuses tab senders, unlike `RUN_TASK` and the others in §5 | FACT |
| F-4 | `STREAM_CONSUME` has no grant check and no id validation of its own | FACT |
| F-5 | With a grant, `PERCEIVE_ONCE` in a product build captures a frame, starts TR-01 and leaves a masked frame in memory until the next pass, with nothing consuming it | FACT (source; fakes) |
| F-6 | **The reply hides T1's refusal.** It has no `detector` field, so on a product build it reads `detections: []`, `anchors: 0`, `refused: null`. `uiDetectorHead.ts` warns against exactly this: an empty list is "indistinguishable from a page with no controls". `run-detector-eval.mjs` would report every target missed rather than a refusal. That harness is detector evaluation and is not authorised to run | FACT (tested for the reply; source for the harness) |
| F-7 | `PERCEIVE_ONCE` brings ORT up (fetching and hashing the pinned WASM, in a real browser) even when it then refuses for want of a grant | FACT for the call; the cost is not measured |
| F-8 | No handler checks whether a task is running. `perceiveTab` sets and clears `captureTabId`, which only a perception pass reads, so this cannot disturb a product task. In an evidence build, whose tasks do use it, a concurrent call could | FACT (source); the evidence-build effect is INFERENCE |

**None of these gives a caller a pixel, and none is in the ordinary task path.** They are a question of what a DOM-only product should ship.

## 7. Still UNKNOWN

- Chrome's delivery of a cross-extension or page message, on this build: not measured here.
- Whether Chrome honours a `chromeMediaSourceId` it did not mint for this extension.
- Any real-browser behaviour of either hook after M23.7. Neither has been run since then.
- U-1 (M23.3): a complete proof that no message carries frame bytes. M23.8 adds evidence for the hooks' replies and for the task path. It is not a proof over every message.
