# Phase 1 — actual data flow and components

> **Status:** source-traced description of the product **as implemented**. M23.3, 2026-11-03, at `3e6a2e6`.
> - **What it is not:** an acceptance statement. "Implemented" here means the code exists and is wired; it does **not** mean the behaviour is verified or accepted. Acceptance criteria remain **PROPOSED — AWAITING OWNER APPROVAL** (`core-product-acceptance-PROPOSED.md`).
> - **The architecture decision:** recorded as proposed in `docs/adr/ADR-0015-phase-1-local-structure-only-architecture.md` (**PROPOSED — AWAITING OWNER APPROVAL**).
> - **Method:** static source reading only. No model was loaded, no inference was run, and no frame or dataset was read.
> - **Labels:** every claim is FACT (source read, with file references) unless marked INFERENCE or UNKNOWN.

## 1. The realms, in one picture

```
 Page (content script)         Service worker            Offscreen document (core realm)              Loopback, this machine
 ─────────────────────         ──────────────            ───────────────────────────────              ──────────────────────
 DOM reading (element graph,   routes messages;          runExtensionTask → runTaskLoop (≤ 5 turns)
 visual-region geometry)  ───► mints the gesture   ───►  ├─ perceive: frame via getUserMedia,         front 127.0.0.1:8995
 page privacy boundary:        stream id; never          │   T1 UI head (ORT WASM) → fuse,              (refuses foreign origin,
 classifies values, holds      holds a frame on          │   TR-01 worker → mask frame IN PLACE        host, path, method,
 the vault, restores values,   the product route         ├─ handoff = DOM elements + references        non-JSON, value-shaped)
 dispatches the click                                    ├─ sendVerified (egress guard) ──────────►    keyed llama.cpp on
                                                         │      JSON chat-completions body only         127.0.0.1:8977
 Side panel: task form, consent (Allow once / Deny), clarification, status                             Qwen2.5-0.5B Q4_K_M
```

**Pixels exist only in the offscreen document and in the TR-01 dedicated worker,** which receives a copy for inference.

**The only bytes that leave the extension in a product build** are the JSON reasoner request, sent by `sendVerified` to the CSP-pinned loopback endpoint. Packaged-asset reads (`resolvePackagedAsset`) stay inside the extension package.

## 2. Stage by stage

| # | Stage | Module and entry point | Receives | Produces | Where | Boundary | Evidence (implementation and tests) | Limits |
|---|---|---|---|---|---|---|---|---|
| 1 | OBSERVE | content script; `apps/extension/host-lib/page-surface-dom.ts`; `packages/extension-transport` (`visualRegionsFrom`); `extension-ports.ts` | the live DOM | element graph (roles, names, geometry, enabled, visibility); visual-region **geometry** for `<canvas>`/`<img>`. "A sample has no field for a URL, alt text, a pixel or a bitmap" | page realm → core realm | the transport carries no values ("`fields: []` … the literal truth about what crossed the worker") | unit tests; M2 and M4/M5 browser runs (W1) | DOM-dependent |
| 1b | CAPTURE (in OBSERVE) | `background.ts` (`chrome.tabCapture.getMediaStreamId`), offscreen `getUserMedia`; ADR-0009 | a person's gesture (toolbar or `Alt+Shift+P`) | a frame (`ImageBitmap`) in the **offscreen document** | local | **frames are captured in Phase 1.** On the gesture route the service worker never holds one. `WORKER_FRAME` (`captureVisibleTab` in the worker) exists only in evidence builds | ADR-0009; M4 (human-in-the-loop) | — |
| 2 | PERCEIVE | `perception-realm.ts` (`perceive`), created by `ensurePerception()` in `host/offscreen/main.ts` | frame plus element graph | **T1 UI head** detections (eight interactable classes, boxes and scores; no text) → `fuse()` → `elements`, `sourceBySelector`, counts. Then **TR-01** on the full frame (dedicated worker) | local (offscreen document and worker) | detections cannot carry text by construction (`UI_CLASSES`); a **vision-only element has no selector** and is absent from `sourceBySelector` | M3.1, M10.6, M21; unit tests | **T1 UNADOPTED, unverified bytes (§4).** No face detector |
| 3 | SANITIZE | page realm: `page-privacy-boundary.ts` → `classifyObservation` (`packages/privacy`); vault; core realm: `buildHandoffDraft` (`packages/privacy/src/sanitize.ts`). Frame: `sanitizeFrame` in `perception-realm.ts` | DOM values (page realm only); perception's `visual()` declaration; TR-01 findings | **handoff draft:** DOM elements (id = selector, role, name, `source`, visibility, enabled), typed references `<PII:CLASS:n>`, `capture`, `capability`. **Frame:** opaque fill applied in place to the in-realm frame | values: page realm only; draft: core realm | values never leave the page realm; the frame never leaves the core realm | M2 (42 of 42), M10, M16; unit and integration tests | the Rule 2 metrics are not produced. **Visual-only PII is not verified** |
| 4 | VERIFY | `packages/privacy` verifier (`verifyHandoff`, residual scan), `remote-privacy-boundary.ts` | handoff draft | a `VerifiedHandoff`, or a refusal | core realm | **egress gate:** nothing is sent without a verified handoff | M12; unit tests | QG-04 unsigned |
| 5 | REASON | `packages/reasoner/src/localModel.ts` (`localModelReasoner().propose`) → `packages/egress/src/guard.ts` (`sendVerified`); launcher `scripts/reasoner/` | the verified handoff | a JSON chat-completions body: goal, text fields `{id,name,empty}`, buttons `{id,name,enabled}`, references `{token,class,hint}`; a JSON schema enumerating the clickable ids and the privacy-paired inserts. **No pixels, values, `source`, boxes or capability** | **loopback:** `http://127.0.0.1:8995/v1/chat/completions` (`__REASONER_ENDPOINT__`, `wxt.config.ts`) | CSP v2 `connect-src` exact path (ADR-0013); front refusals; per-launch key on 8977 | LOOP-2; M20 (W1) | reasoner `PINNED`, not `ADOPTED`; correctness PROVISIONAL |
| 6 | PLAN | `localModel.ts` response handling; `packages/plan/src/schema.ts` | untrusted response text | a candidate plan (`insert`/`click`/`done`), provenance set by the client | core realm | everything returned is untrusted; a non-JSON reply goes to the parser to be refused | unit tests | — |
| 7 | VALIDATE | `packages/plan/src/validate.ts` (`validatePlan`); `machine.ts` | the candidate plan; handoff; declared postconditions | validated steps, or STOP. `EXECUTABLE_ACTIONS = ["click"]`. A click needs a **declared postcondition** that does not already hold. Inserts are split into reference and literal | core realm | **execution gate (1 of 2)** | unit tests; MVP-1 | ADR-0005 tolerances PENDING |
| 8 | REFRESH | `packages/agent/src/actionFreshness.ts` (`validateActionFreshness`), `hitTest.ts` (`establishHitAgreement`); a fresh observation | a new DOM reading | proceed, or discard and re-observe. The M18 declaration is re-checked on the new reading | page realm and core realm | **execution gate (2 of 2)** | M2-EXEC (50 of 50); MVP-2 | ADR-0005 and ADR-0007 tolerances PENDING |
| — | HUMAN GRANT | `machine.ts` `AWAIT_GRANT`; `consent-desk.ts` (panel, ADR-0014) or `askHuman` (`GRANT_PEEK`/`GRANT_DECIDE`); `packages/agent/src/permit.ts` | the reference inserts plus the click | one-shot use-grant and dispatch permit, or STOP. **Every reference-backed restoration needs a human decision;** a panel-started task asks in the panel | side panel or operator → core realm | consent mandatory for value restoration | M19, M20 (W1) | ADR-0006 tier PENDING; ADR-0008 lifetime UNRESOLVED |
| 9 | RE-HYDRATE | page realm: vault; `packages/privacy` (`fill.ts`, `bind.ts`, `vaultView.ts`) | the grant plus the reference | the value inserted into the privacy-grounded field, in the page realm | page realm | the trusted client is the only holder of values | M16 | — |
| 10 | ACT | `packages/agent/src/guardedAct.ts` and `act.ts`; page realm dispatch, one per cycle | the permit, the target selector | **one click** on a DOM element | page realm | click only; a DOM target only; one dispatch per permit | MVP-1; unit tests | QG-02 criterion 7 (off-screen scroll) not evidenced |
| 11 | VERIFY RESULT | `packages/agent/src/verifyResult.ts` (`verifyActionResult`), `packages/orchestrator/src/postconditions.ts` | a fresh reading | CONFIRMED / NOT_CONFIRMED / UNKNOWN | page realm → core realm | the result is read from the control's own state, never from page text | M18; E8 (W2) | ADR-0007 tolerance PENDING |
| 12 | Repeat or stop | `packages/orchestrator/src/loop.ts` (`runTaskLoop`, `checkTurnBudget`, `MAX_TASK_TURNS = 5`); clarification; declaration | the turn result | the next turn, a clarification, or STOP | core realm | at most 5 turns | M14, M15, M17 | — |

## 3. The visual path, precisely (§2.A of the M23.3 brief)

1. **What is captured.** A full-tab frame on the gesture route (`getUserMedia` in the offscreen document). Visual-region **geometry** for `<canvas>` and `<img>` comes from the page.
2. **Where frames are processed.** In the offscreen document:
   - decode, letterbox and T1 inference (ORT WASM);
   - a **copy** for the TR-01 dedicated worker (`tr01-host.ts` `postMessage`), which "scrubs it when the run ends".
3. **Does image data stay local?** Yes, in a product build (source).
   - **The raw bitmap** is closed after decode; the decoded buffer is masked in place.
   - **The sanitized frame** (`sanitizedFrame()`) and the WebP encoder (`encodeSanitized()`) have **no product caller.** Their only consumers sit behind `#tr01-probe`, which resolves to `probe/tr01-absent.ts` in a product build ("there is no probe").
4. **Which models receive image data.** T1 (the offscreen ORT session) and TR-01 (worker). Nothing else.
5. **What crosses the reasoner boundary.** The JSON body in §2 stage 5 only.
   - **The frame senders are not wired into the product:** `frame.ts` (`sendMaskVerifiedFrame`, test-only loopback) and `qg04.ts` (`attestHandoffBody`, `planHandoff`, `sendProductionHandoff`) have **no product caller.** Their callers are in `apps/extension/probe/tr01.ts`, an evidence build only.
   - **`sendProductionHandoff` has no transport** (`qg04.ts` header).
6. **Other routes for frame bytes.**
   - **Network primitives:** within the product sources inspected, they are the `fetch` in `guard.ts` and `frame.ts`, and the packaged-asset `fetch` of `t1-ui-head.onnx` in `main.ts`. The probe files are absent from a product build. The M12 repository network gate (`networkBoundary.test.ts`) keeps an exact-count allowlist. No `WebSocket`, `sendBeacon` or `XMLHttpRequest` was found in product source.
   - **Encoding to Blob or WebP:** occurs only inside `perception-realm.ts` (decode, and the uncalled encoder).
   - **UNKNOWN:** a complete proof that **no extension message** ever carries frame bytes. Messages were inspected only at the call sites listed here. The established pixel-carrying message is the copy to the TR-01 worker.

## 4. T1 and TR-01

See `t1-tr01-status-reconciliation.md` for the full tables. In brief:

**T1:**
- **Packaging:** git-ignored, and packaged **without** a build-time or runtime hash check.
- **Execution:** loaded and run on every perception pass; its output is fused.
- **Effect on the handoff:**
  - it can relabel an existing DOM element's `source` (`dom` → `dom+vision`) in the handoff;
  - it sets `capability.tiers_fired` (`["T0","T1","T2"]`), `capability.backend` and `capture.scale_to_css` when the pass ran;
  - it **cannot** add an element to the handoff.
- **None of that metadata is in the reasoner request.**
- **Status:** **UNADOPTED.**

**TR-01:**
- **Integrity:** hash-verified at build time and at runtime.
- **What it does:** it finds text regions on the full frame; each visual region becomes an `UNREAD_REGION` mask; the mask is filled into the in-realm frame.
- **What it does not touch:** it changes **pixels of the local frame only**. It does not change DOM values, text, references or the handoff.
- **INFERENCE:** in Phase 1, where no frame leaves, it is a pre-egress safeguard for a path that is disabled. Visual-only PII protection stays **NOT VERIFIED** (M9).

## 5. The two egress mechanisms, and why Phase 1 uses one of them

| | `sendVerified` (`packages/egress/src/guard.ts`) | `qg04.ts` / `frame.ts` (frame path) |
|---|---|---|
| Carries | one JSON string, serialized once | an attested multipart body (manifest v1.2 + WebP), or a mask-verified WebP to a test sink |
| Checks | verified handoff → loopback destination → only tokens this handoff declared → value-aware residual scan → digest → record → send; the same string is scanned, hashed and sent | whole-body attestation (single use, hash of body, manifest and frame), re-hash and re-parse before the last gate; WebP container inspection; admissible state |
| Product caller | **yes:** `localModelReasoner` (ADR-0013 §3: "`localModelReasoner` → `sendVerified`") | **none:** `probe/tr01.ts` (evidence build) only |
| Can send in production | to the CSP-pinned loopback endpoint | **no:** no `VERIFIED` constructor, no configured origin (B1), no auth (B6), no transport |

**Why Phase 1 uses `sendVerified`** (INFERENCE, from these FACTs):
- the Phase 1 request is JSON with no frame;
- the frame path's extra controls (a frame-and-manifest attestation, container inspection) apply to frame bodies to a production origin, which Phase 1 does not have.

**What the ADRs say:**
- ADR-0013 records the `sendVerified` path.
- ADR-0012 §7–§8 describe the production frame handoff and its structure-only fallback to a configured production origin. They do not describe the Phase 1 loopback chat-completions request.
- ADR-0012 §7 also says "no fetch in perception, the offscreen document …", while the offscreen document reads the packaged T1 asset with `fetch`. The M12 network gate classes packaged-resource reads as allowlisted.

These are wording gaps for ADR-0015 to record (RC-02, RC-11). They are **not** classified as security defects here.

## 6. Known unknowns

- **U-1:** a complete proof that no extension message carries frame bytes (§3.6).
- **U-2:** any effect of T1 on local behaviour beyond those in §4 and `t1-tr01-status-reconciliation.md` §3. None was found among the consumers inspected.
- **U-3:** the effect of T1 latency, or of T1 failure, on task outcomes. Its timings are in the M20 benchmark, but its influence was not isolated.
- **U-4:** whether the T1 bytes packaged on any machine equal `ba6d9e93…` (no check exists).
