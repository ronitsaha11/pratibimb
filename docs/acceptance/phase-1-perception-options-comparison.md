# Phase 1 perception — three-option comparison (M23.5)

> **Status:** decision preparation for **OD-R** (frame capture after T1 removal). M23.5, 2026-11-03.
> - **Nothing chosen or authorised:** no option is chosen, and none is authorised for implementation.
> - **Context:** OD-P (T1 disabled from active Phase 1 execution) is selected but **not implemented.** T1 still loads and runs on passes that capture a frame.
> - **Basis:** `frame-capture-and-consumer-map.md` and `fallback-test-evidence-matrix.md`.

## The options

| | **A — DOM-only Phase 1** | **B — T1 off, capture kept** | **C — T1 off, capture only for a named consumer** |
|---|---|---|---|
| T1 | not loaded, not invoked (future change) | same | same |
| Frame capture | **not initiated** in ordinary task execution | initiated whenever a gesture grant exists | initiated **only** for a specifically identified, approved Phase 1 consumer; **none exists today** |
| TR-01 | not invoked in the normal path | runs on every frame and masks the local copy | runs only for that consumer |
| Structural path | unchanged | unchanged | unchanged |
| Consent, grounding, click, REFRESH, postconditions, five-turn cap, egress | unchanged | unchanged | unchanged |

## What each option changes, keeps and loses

| | A | B | C |
|---|---|---|---|
| **Changes** | no `getUserMedia`, no frame, no TR-01, no T1 in task runs. Handoff: always the structural floor (`backend: "none"`, `tiers_fired: ["T0","T2"]`, `source: "dom"`) | no T1. Frames, TR-01 and masks remain. The handoff still declares the floor, because `visual()` gates on `detector.ran` (FACT) | as A, until a consumer is approved |
| **Remains** | DOM observation, the coordinate contract, sanitisation, the vault, consent, the structure-only handoff, `sendVerified`, the reasoner, VALIDATE, REFRESH, the hit test, the human grant, RE-HYDRATE, the click, VERIFY RESULT | the same, plus a masked frame in memory that **no product code reads** | as A |
| **Becomes unavailable** | T1 detections (already removed by OD-P); TR-01 masking in task runs; the per-pass redaction summary in the run report; any frame-derived `scale_to_css` | T1 detections only | as A |
| **Product benefit** | — | **none identified:** the masked frame has no product reader (FACT), and the handoff does not record that TR-01 ran (FACT). INFERENCE: the work done has no product effect in Phase 1 | only if a consumer is approved with a stated purpose |
| **Privacy** | **fewest pixels:** no frame of the page is ever decoded in task runs. Visual-only PII stays out of the reasoner by the structure-only design, as today | full-page frames are decoded and held in memory (offscreen, plus a worker copy) for **no consumer**. Not a leak (no egress), but retained exposure without a purpose (INFERENCE) | pixels only with a documented purpose, a boundary and consent |
| **Resources** | **UNKNOWN; not measured.** INFERENCE: it avoids per-pass capture, decode, the TR-01 worker and its ORT session. No improvement is claimed | **UNKNOWN.** INFERENCE: it keeps the capture, decode and TR-01 costs | as A, unless the consumer is used |
| **Gesture dependence** | none: tasks never needed a frame (M20) | capture still depends on a toolbar grant (5-minute TTL, revoked on navigation), so behaviour varies by whether the person clicked | per consumer |
| **Visual capability** | **reduced:** no visual tier at all in task runs. **Not** "unchanged perception" | reduced (no UI detections); masking without a consumer | reduced, unless approved |
| **Evidence it works today** | **M20 benchmark:** 6 bounded tasks, `detectorRan = 0`, every pass refused before capture (W1, synthetic). This is the same functional path A would make permanent | no product-level evidence of T1-off with capture on | — |
| **Implementation (future, separately authorised)** | stop calling `perceive` in task runs: the existing optional wiring (`extension-ports.ts` `if (options.perceive)`; `extension-run.ts` `deps.perceive ? … : {}`), or an equivalent. Plus the OD-P T1 changes | the OD-P T1 changes only | as A, plus an ADR for any consumer |
| **Regression evidence needed** | a no-`perceive` run test; a floor-declaration test; `sourceById`-absent; the security re-runs (network gate, CSP, `sendVerified`, front); a new labelled benchmark; a person-run smoke | the floor-declaration test with TR-01 ran; the security re-runs; a benchmark; plus a statement of why the capture is retained | per consumer |
| **Brief deliverables** | Deliverable 1's "vision model executing locally" is **not met in task runs** by any model. TR-01 remains in the codebase and the evidence builds. Deliverable 2's visual masking is not exercised in the product (it is not demonstrated today either, M9). This is a stronger form of the M23.2 Phase 2 deferral (OD-K2) | Deliverable 1 is met only nominally (TR-01 runs, but nothing uses it) | as A |

## What would justify Option C

Every one of these must hold. Any such consumer is new work, and needs its own ADR and authorisation:
- **A named consumer:** a specific Phase 1 consumer of the frame, or of its mask, that exists in source.
- **A stated purpose,** and a boundary showing that no frame byte or mask leaves (QG-04-F stays blocked).
- **Consent:** a human-consent requirement for the capture.
- **Evidence of benefit:** acceptance evidence that the consumer improves a Phase 1 criterion, measured and not projected.

**No such consumer exists or is proposed here.**
