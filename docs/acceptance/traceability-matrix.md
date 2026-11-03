# Requirement-to-architecture traceability matrix — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.1, 2026-11-03).**
> - **What it does:** traces the brief's deliverables and the constitution's pipeline to what was built and to the recorded evidence.
> - **What it does not do:** approve anything, or reclassify any historical record.
> - **Criterion IDs** (FUN-, BRW-, PRV-, SEC-, RSN-, ACT-, REL-, PRF-, XM-, HUM-, CI-, GOV-) refer to `core-product-acceptance-PROPOSED.md` §5.
> - **Evidence types** A–H are defined there, in §4.
> - **Updated in M23.3** with the source trace: stage rows 1–5 follow `phase-1-data-flow-and-components.md`. The proposed architecture decision is ADR-0015 (PROPOSED — AWAITING OWNER APPROVAL).
> - **Updated in M23.2** for the owner's **phased architecture** direction (2026-11-03). Each deliverable now states what is **Phase 1** (the current structure-only product) and what is **Phase 2** (future, not authorised). §1.5 summarises. The original requirements are quoted unchanged.

## 1. The brief's deliverables

The four deliverables are quoted from `docs/architecture/vision.md` ("Deliverables named in the statement").

> **Note on naming:** "D1–D4" here means these four brief deliverables. They are **not** the `AUDIT-0004` decisions D1–D4, which are a separate set of owner decisions.

### Deliverable 1: client extension in Chrome and Firefox, with a vision model executing locally

| Aspect | As built (FACT) | Evidence | Gap | Criteria | Owner decision |
|---|---|---|---|---|---|
| **Chrome** | MV3 extension, built and run in Chrome for Testing 153 on W1 | C: M19 and M20, person-run in the real side panel | D, E, H for the product | BRW-01 | OD-B, OD-C |
| **Firefox** | a `build:firefox` script exists, but **the product has never been run in Firefox** | **none for the product**. Firefox evidence exists only for the coordinate-contract fixture (QG-02, hosted CI run `34485366327`), the model runtime (M8.2) and spikes (S-02, S-05) | build, run and test the product | BRW-02, BRW-03 | **OD-A**, **OD-G** |
| **Local vision model: TR-01** | `PP-OCRv4_mobile_det` text-region detector, in the product perception pass on the gesture route. **It feeds redaction, not decisions** | B: M10 (synthetic) | product evidence of visual-only protection | PRV-03 | OD-F |
| **Local vision model: T1** (UI-element detector) | **UNADOPTED.** *Corrected in M23.2:* the original T1 head is loaded and run in the product perception pass (`apps/extension/host/offscreen/main.ts`, `ensurePerception`). Clicks come only from DOM elements (M21). Whether vision-only elements reach the reasoner handoff is UNKNOWN. Detector research is FR-01 (deferred, not authorised) | source read (M23.2); M21 | the handoff question (UNKNOWN) | out of scope (FR-01) | OD-I |
| **Local vision model: a VLM** | **none.** A VLM is not part of the structure-only design. The constitution lists "a local VLM in the normal path" under *Not building* (§10) | — | — | — | — |
| **Local vision model: faces** (YuNet) | referenced only in `packages/perception/src/detector.ts` and its test. INFERENCE: not in the product path | — | product integration, or an exclusion | PRV-03 | OD-F |

**Reconciliation (INFERENCE).** In the product, "a vision model executing locally" is met by TR-01, which serves redaction only. The brief says the local model "reads the screen and decides on that basis". In the shipped product, decisions come from the DOM structure and a text LLM. Whether that satisfies the brief is **an owner judgement** (OD-K).

### Deliverable 2: a privacy filter, demonstrated clearly

| Aspect | As built (FACT) | Evidence | Gap | Criteria | Owner decision |
|---|---|---|---|---|---|
| **Textual and DOM PII** | detected and turned into typed references (`<PII:CLASS:n>`) before the handoff; values stay in the memory-only vault | A; B (M2 page-value boundary, 42 of 42 checks); G (M12) | C/D/E product runs per class; the Rule 2 metric | PRV-01, PRV-02 | OD-D (corpus) |
| **Visual-only PII** | TR-01 `UNREAD_REGION` masking, on synthetic pages (M10). **M9: "Product visual-only PII protection NOT VERIFIED".** Faces are not in the product path | B (synthetic) | verification evidence; J7 (stream frames) | PRV-03, PRV-04 | **OD-F** |
| **Consent** | just-in-time, one-time panel consent with a masked local preview; Deny honoured | A; C (M19, M20) | D, E | PRV-05 | OD-C |
| **"Demonstrated clearly"** | the masked preview and the panel's event trail (M20) | C | an approved demonstration script for the shipped architecture | GOV-05 | owner |

### Deliverable 3: a server hosting an open-weight LLM or VLM, returning a UI action

| Aspect | As built (FACT) | Evidence | Gap | Criteria | Owner decision |
|---|---|---|---|---|---|
| **The reasoner** | a **local loopback** llama.cpp `b10956` server running the open-weight text LLM `Qwen2.5-0.5B-Instruct` Q4_K_M. It is **not a VLM**: it receives structure-only JSON (references, no pixels, no values) and returns a placeholder plan | LOOP-2; M20 (launcher, keyed model server, benchmark; W1) | adoption bar; D | RSN-01 to RSN-06 | RSN-06 (adoption) |
| **The dossier's server VLM** | FastAPI + vLLM + Qwen3-VL (constitution §2) **was not built**. B-03 (no vLLM host) is still `BLOCKED` | — | an architecture record of the substitution | RSN-07, GOV-04 | **G-1**, OD-K |
| **"Server aware of the redaction scheme"** | the reasoner prompt and contract carry reference types (`packages/reasoner/src/contract.ts`) | A | — | RSN-04 | — |
| **Server PII tripwire** | none: there is no server | — | a redaction-metric evidence source (benchmark contract Rule 2) | PRV-04 | OD-F |

**Reconciliation (INFERENCE).** "A server hosting an open-weight LLM" is literally met by a loopback-hosted open-weight LLM. But it departs from the frozen constitution in two ways: the server is a local loopback text LLM rather than a remote VLM, and no ADR records the change. Acceptance against Deliverable 3 therefore needs both an owner judgement (OD-K) and an architecture record (RSN-07).

### Deliverable 4: one end-to-end task that visibly assists a user

| Aspect | As built (FACT) | Evidence | Gap | Criteria | Owner decision |
|---|---|---|---|---|---|
| **Synthetic runs** | bounded tasks on synthetic loopback pages, at most 5 turns | B: M15 (two-step task). C: M20, a person-run smoke test (17 of 17; then 18 of 18 after the keyed-server fix) and a benchmark (6 tasks, 15 steps). All W1, Chrome | repeated runs; D; E | FUN-01, FUN-02, REL-01 | OD-B, OD-C |
| **Real-site runs** | **none.** The validated scope is synthetic loopback pages | — | an approved real-site scope; legal and ToS review (AUDIT-0004 D5) | FUN-01, PRV-02 | **OD-D** |
| **"Visibly"** | real side panel, masked preview, per-stage timings (M19, M20) | C | an independent observer | HUM-01 | OD-C |

## 1.5 Phase mapping (M23.2)

**Direction:** owner-selected. **Acceptance consequences:** PROPOSED — AWAITING OWNER APPROVAL.

| Deliverable | Phase 1 (current structure-only product) | Phase 2 (future; NOT AUTHORISED) | Still open in Phase 1 |
|---|---|---|---|
| 1. Extension, Chrome and Firefox, local vision model | Chrome MV3; TR-01 local visual redaction | a VLM or frame-based local visual reasoning (P2-01, P2-03) | Firefox (OD-A, OD-G); whether TR-01-for-redaction meets "a vision model executing locally" (OD-K2) |
| 2. Privacy filter, demonstrated | textual and DOM PII to references; consent; masked preview; no frame leaves | the server tripwire (P2-06) | visual-only PII and faces (OD-F); the Rule 2 metrics (PRV-02, PRV-04) |
| 3. Server with an open-weight LLM or VLM | a loopback-hosted open-weight **text** LLM, structure-only | a VLM; frame-based context; server infrastructure (P2-01, P2-02, P2-04) | the ADR record (RC-01, RC-02); reasoner adoption (RSN-06); whether Phase 1 meets Deliverable 3 (OD-K2) |
| 4. End-to-end task, visibly assisting | bounded synthetic tasks, at most 5 turns, click only | visual-context scoring (P2-05) | repeated runs, cross-machine, independent operator, real sites (OD-B, OD-C, OD-D) |

## 2. The 12-stage pipeline

**Stage names** are from constitution §1, which is frozen.

**The implemented loop**, as recorded in CHANGELOG M14:

`OBSERVE → SANITIZE → VERIFY PAYLOAD → SEND → VALIDATE PLAN → REFRESH → HUMAN GRANT → REHYDRATE → ACT → VERIFY RESULT`

It runs at most **5 turns** (`MAX_TASK_TURNS`, `packages/orchestrator/src/loop.ts`).

| # | Stage | Implementation (FACT: module exists) | As-built note | Evidence | Gap | Criteria |
|---|---|---|---|---|---|---|
| 1 | OBSERVE | `packages/perception/src/capture.ts`, `elementGraph.ts`, `changeDetection.ts`; `packages/extension-transport/src/observation.ts` | gesture-authorised capture (ADR-0009); structural change signal (ADR-0010) | A; B; C (M4, M5) | other browsers | BRW-04 |
| 2 | PERCEIVE | `apps/extension/host/offscreen/main.ts` (`ensurePerception`); `apps/extension/host-lib/perception-realm.ts`; `packages/perception/src/fusion.ts`, `textRegion.ts` | **frames are captured and processed locally.**<br>• **T1** (UNADOPTED, bytes unverified) runs on every pass, and its output is fused; it can relabel DOM `source`, but adds no element to the handoff.<br>• **TR-01** (hash-verified) masks visual regions in the local frame.<br>• No faces in the product | A; B (QG-02 criteria 1–6; M10, M21) | criterion 7 executor half; U-1 to U-4 | ACT-06, PRV-03 |
| 3 | SANITIZE | `packages/privacy/src/sanitize.ts`, `classify.ts`, `pixelRedaction.ts`, `vault.ts`, `tokens.ts` | values become references; the vault is memory-only | A; B; G | the Rule 2 metrics | PRV-01 to PRV-04, PRV-06 |
| 4 | VERIFY (egress gate) | `packages/egress/src/guard.ts`, `qg04.ts`, `handoffContract.ts`; `packages/privacy/src/literalCheck.ts` | **structure-only handoff.** Production frame egress is impossible (three locks, ADR-0012 §16) | A; G (M12) | the QG-04 structure-only definition and signature | SEC-03, SEC-04, SEC-05 |
| 5 | REASON | `packages/reasoner/src/localModel.ts` (`contextFor`, `planSchema`) → `packages/egress/src/guard.ts` (`sendVerified`); `scripts/reasoner/` | **a local loopback text LLM, not the constitution's "server VLM"** (RC-01). It receives the planning view only (goal, textbox `{id,name,empty}`, button `{id,name,enabled}`, references `{token,class,hint}`) | LOOP-2; M20 (W1) | ADR-0015 approval; adoption | RSN-01 to RSN-07 |
| 6 | PLAN | `packages/plan/src/schema.ts`, `index.ts` | placeholder plan; `EXECUTABLE_ACTIONS = ["click"]` | A | — | RSN-05, ACT-01 |
| 7 | VALIDATE (execution gate) | `packages/plan/src/validate.ts` | allowlist; no best-effort parse | A | — | RSN-05, ACT-02 |
| 8 | REFRESH (execution gate) | `packages/agent/src/actionFreshness.ts`, `hitTest.ts` | a failed check re-observes. **ADR-0005 tolerances and ADR-0007 IoU are PENDING** | A; B (M2-EXEC, 50 of 50) | approved tolerances | ACT-02, ACT-03 |
| — | HUMAN GRANT (implemented between 8 and 9) | `packages/agent/src/humanConfirmation.ts`, `permit.ts`; `packages/orchestrator/src/consent.ts` | **ADR-0006 tier PENDING; ADR-0008 permit lifetime UNRESOLVED** | A; C | decisions | ACT-04, ACT-05, PRV-05 |
| 9 | RE-HYDRATE | `packages/privacy/src/vault.ts`, `vaultView.ts`, `fill.ts`, `bind.ts` | trusted-client `insert` into a target approved by privacy and a human | A; B (M16) | C/D/E | FUN-03 |
| 10 | ACT | `packages/agent/src/act.ts`, `guardedAct.ts` | click only | A; B | off-screen scroll (QG-02 criterion 7) | ACT-01, ACT-06 |
| 11 | VERIFY RESULT | `packages/agent/src/verifyResult.ts`; `packages/orchestrator/src/postconditions.ts` | postconditions (M18; E8 on W2) | A; B | ADR-0007 tolerance | ACT-03 |
| 12 | Repeat, or stop and ask | `packages/orchestrator/src/loop.ts`, `clarification.ts`, `declaration.ts` | at most 5 turns; clarification (M17); declared outcome (M18) | A; B (M15) | C/D coverage of the stop paths | FUN-02, FUN-04 |

**Observation (INFERENCE, from the rows above).** The implemented loop covers every frozen stage, and none is removed or reordered. Two stages are realised differently from the constitution's wording. Under the owner's phased direction, both differences are the **intended Phase 1** design; the formal reconciliation is M23.2 RC-01 and RC-02:
- **stage 4** carries structure instead of a frame;
- **stage 5** is a local text LLM instead of a server VLM.

Stage 2 runs an unadopted UI head whose detections never become targets, and no face detector. Whether those differences are acceptable is recorded as G-1, OD-F and OD-K, and is not decided here.

## 3. Evidence by type

| Type | What exists (FACT) | What does not exist |
|---|---|---|
| **A** unit and integration | the product package suites; the reasoner launcher tests | — |
| **B** synthetic browser | M2, M2-EXEC, MVP-1/2, M10, M15; QG-02 criteria 1–6 (Chromium) | real-site |
| **C** human-operated, W1 | M4 (human in the loop), M19, M20 (developer or owner operator) | — |
| **D** cross-machine | **none for the product.** E7 and E8 ran on W2 as experiments, not on the product build | product on W2 |
| **E** independent human | **none** | all |
| **F** real-site | **none** | all |
| **G** security negative | M12 interception and fail-closed suite; M13 CSP checks; M20 front and keyed-server refusals | F-M13-1 measurement |
| **H** hosted CI | merged `main` commits; QG-02 Firefox cell (run `34485366327`). **None for the M22 branch; `detector-adapter` has never run** | the release-candidate run |
