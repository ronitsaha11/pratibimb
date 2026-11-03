# Core-product acceptance definition — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.1, 2026-11-03).**
> - **What it is:** this document proposes what "the PratiBimb core product is accepted" should mean.
> - **What it does not do:** it approves nothing, signs no quality gate, changes no ADR, frozen specification or security invariant, lifts no blocker, and authorises no implementation or execution.
> - **Every classification below is a proposal.** That covers every mandatory, optional or out-of-scope label and every proposed test.
> - **Updated in M23.2 (2026-11-03)** for the owner's **phased architecture** direction:
>   - the matrix in §5 is now the proposed **Phase 1** acceptance scope;
>   - the original vision-language and frame-based capabilities are listed in §5.13 as **Phase 2 future scope**.
>   - **The proposal itself remains PROPOSED — AWAITING OWNER APPROVAL.** The phased direction approves none of its criteria or classifications.
> - **It stands alone.** Its companions only add detail:
>   - `traceability-matrix.md`;
>   - `quality-gate-mapping-PROPOSED.md`;
>   - `owner-decisions.md`;
>   - `release-readiness-checklist-PROPOSED.md`;
>   - `phase-1-architecture-scope.md` and `phase-2-future-capability-register.md` (M23.2).

## 1. Why this is needed (FACT)

- **No roadmap or acceptance document exists in the repository** (`agentos/state.md`, M21 section).
- **The quality gates predate the shipped architecture.** QG-01–QG-06 (`agentos/gates/README.md`) and the release workflow (`agentos/workflows/release.md`) were written for the dossier's architecture, in which a sanitized WebP frame and a redaction manifest go to a server VLM (`docs/architecture/constitution.md` §1–§2).
- **Owner-approved decisions changed that architecture:**
  - production frame egress is blocked, with a structure-only handoff (ADR-0012, partially approved);
  - the product is pinned to one loopback reasoner endpoint (ADR-0013, accepted);
  - capture is gesture-authorised (ADR-0009) and the change signal is structural (ADR-0010, both approved);
  - consent is given in the panel (ADR-0014, accepted).
- **The consequence:** some gate items no longer apply as written, and a gate cannot be signed against an undefined target.

### 1.1 Owner direction (M23.2)

**PHASED ARCHITECTURE**, selected by the owner on 2026-11-03 (`artifacts/experiments/M23.2-phased-architecture-decision/`):
- **Phase 1:** the current local, loopback-only, structure-based reasoning architecture.
- **Phase 2:** future vision-language and browser-frame-based reasoning, subject to separate architecture, security, legal and owner approvals. **Not authorised.**

**Perception scope (M23.6):** OD-P and **OD-R (APPROVED — OPTION A: DOM-ONLY PHASE 1)** are owner-selected. Both are **SELECTED BY OWNER — IMPLEMENTATION NOT AUTHORISED**.
- **Excluded from normal Phase 1 task execution:** browser-frame capture, T1 inference, TR-01 invocation, and visual-only PII masking based on a captured frame.
- **The brief is not fulfilled on these points:** the brief's visual requirements are **not** fulfilled by Phase 1; they are deferred to separate decisions (P2-08, OD-K2).
- **The criteria are unchanged:** every criterion and classification below stays PROPOSED.

**What the direction does not do:** it amends no ADR or constitution text, approves no part of this proposal, signs no gate, authorises no frame egress, and lifts no blocker. Its conflicts with frozen documents are listed in that record's §4 (RC-01 to RC-10).

## 2. The product as built (FACT, with sources)

| Element | As built | Source |
|---|---|---|
| Client | Chrome MV3 extension (WXT). A Firefox build script exists (`apps/extension/package.json` `build:firefox`); the product has not been run in Firefox | `apps/extension/`; M20 |
| Local vision: TR-01 | **TR-01** (`PP-OCRv4_mobile_det`), hash-verified at build and run time, runs on a **copy of the full captured frame** in a dedicated worker. Its boxes become an `UNREAD_REGION` mask per visual region (`<canvas>`/`<img>`), **filled in place into the local frame only.** It does not change DOM values, text, references or the handoff. No product code reads the sanitized frame (M23.3). Visual-only PII protection **NOT VERIFIED** (M9) | `apps/extension/host-lib/perception-realm.ts`; `docs/acceptance/t1-tr01-status-reconciliation.md` §2 |
| UI detector: T1 | **UNADOPTED, but loaded (on the first perception call) and run on every pass that captures a frame** (M23.2, M23.3, corrected M23.4; source). **OD-P (M23.4): the owner selected disabling T1 from active Phase 1 execution. Implementation is pending a separate authorisation, and T1 is NOT yet disabled.**<br>• **Fused:** its output is fused with the DOM graph, and can relabel an existing DOM element's `source` (`dom` → `dom+vision`).<br>• **Manifest metadata:** it sets `capability` and `scale_to_css` in the handoff.<br>• **Cannot add elements:** it **cannot add a vision-only element** to the DOM-based handoff.<br>• **Not sent:** the reasoner request omits `source`, boxes and capability.<br>• **Not checked:** **its bytes are verified neither at build nor at run time.**<br>• **UNKNOWN:** further indirect influence.<br>Performance is FR-01 (deferred, not authorised) | `apps/extension/host/offscreen/main.ts`; `apps/extension/wxt.config.ts`; `t1-tr01-status-reconciliation.md` §1, §3, §4 |
| Faces | a YuNet `FaceDetector` role is recorded as ACCEPT (wasm, webgpu) in `packages/perception/src/detector.ts`. FACT: it is referenced only there and in that file's test; no file under `apps/` references it. INFERENCE (from that FACT): **face detection is not in the product path** | `git grep` over `apps/` and `packages/` (M23.1) |
| Reasoner | **local** llama.cpp `b10956` serving `Qwen2.5-0.5B-Instruct` Q4_K_M on `127.0.0.1`. A **text** LLM, not a VLM: it never sees a pixel or a value. Registry status **`PINNED`, not `ADOPTED`**; correctness **PROVISIONAL**; `MODEL_PATH = EXPERIMENTAL`, `FALLBACK_PATH = VERIFIED` (deterministic planner) | `agentos/registry/model-registry.md`; `artifacts/experiments/LOOP-2-local-reasoner-egress/`; M20 |
| Handoff | the verified handoff holds DOM elements and typed references; **no frame**. The reasoner receives a **planning view** derived from it: goal, textbox `{id,name,empty}`, button `{id,name,enabled}`, references `{token,class,hint}`. Frames **are captured and processed locally**; only frame **egress** is impossible (three locks). The frame senders (`qg04.ts`, `frame.ts`) have no product caller | ADR-0012 §8, §16; `packages/reasoner/src/localModel.ts`; `phase-1-data-flow-and-components.md` §3 |
| Network | sent by `sendVerified` (`packages/egress/src/guard.ts`): verified handoff, loopback destination, declared tokens, value-aware residual scan, digest, record, then send. The target is the one endpoint `http://127.0.0.1:8995/v1/chat/completions` (CSP v2). The front refuses foreign origins and hosts, other paths and methods, non-JSON and value-shaped text. The model server needs a per-launch key, and `/slots` is off | ADR-0013 §3; `artifacts/experiments/M20-runnable-measured-product/` |
| Loop | the constitution's 12 stages as implemented (see `traceability-matrix.md` §2), at most **5 turns** (`MAX_TASK_TURNS`) | CHANGELOG M14; `packages/orchestrator/src/loop.ts` |
| Actions | **`click` is the only executable action** (`EXECUTABLE_ACTIONS = ["click"]`). `insert` is a trusted-client restoration of a vault value, after privacy and a human agree, not an agent action. `done` authorises nothing | `packages/plan/src/schema.ts`; ADR-0006 |
| Consent | just-in-time, one-time panel consent with a masked local preview | ADR-0014; M19 |
| Validated where | W1, Chrome for Testing, **synthetic loopback pages**, operated by the developer or owner | M15–M20 |

**Full source trace (M23.3):** `phase-1-data-flow-and-components.md`. The proposed architecture decision is **ADR-0015 (PROPOSED — AWAITING OWNER APPROVAL)**, and the reconciliation is in `reconciliation-matrix-RC-01-to-RC-12.md`.

### 2.1 Governance gaps this proposal surfaces (FACT; not resolved here)

- **G-1. The constitution was not amended for the local reasoner.** Constitution §1 (REASON = "server VLM") and §2 (wire = WebP frame and manifest; server = FastAPI, vLLM, Qwen3-VL) are frozen. **No ADR or constitution amendment records the local loopback text LLM as the product's REASON stage.** ADR-0013 pins its endpoint, and ADR-0012 defines structure-only as the frame path's fallback. Constitution §10 also lists "a local VLM in the normal path" under *Not building*; the shipped reasoner is a local **text** LLM in the normal path. Whether that falls inside the exclusion is an owner question (INFERENCE).
- **G-1, after M23.2:** the owner's phased direction now records the *intent*: Phase 1 is local, loopback and structure-only. It is **not** an ADR or a constitution amendment, so the formal record is still missing (RC-01, RC-02, RC-06).
- **G-2. QG-04 is out of step with practice.** QG-04 states "No code may make a network call until this gate passes", while the shipped product calls the loopback reasoner. QG-04 is **UNSIGNED**, and its M12 matrix assessed the frame path.
- **G-3. The reasoner is not adopted.** It is `PINNED`, not `ADOPTED`; adoption "needs QG-03 and a benchmark artifact" (registry).
- **G-4. B-03 is stale.** B-03 ("no vLLM host") is still `BLOCKED` although the product no longer uses a server.
- **G-5. A registry discrepancy:** the reasoner byte count in the registry (491 358 496 B) differs from the pin (491 400 032 B), as reported in M20.
- **G-7. T1 runs unadopted and unverified (M23.3):** see RC-12 and owner decisions OD-O and OD-P.
- **G-8. ADR-0012 and the Phase 1 egress path (M23.3):** the Phase 1 request uses `sendVerified`, not the `qg04.ts` frame-path attestation. ADR-0013 §3 records this; ADR-0012 §7–§8 describe the production handoff. See RC-11.
- **G-6. M23.0 is unrecorded:** the M23.0 audit was delivered in conversation and is not a repository record.

## 3. Frozen constraints this proposal does not touch

These hold whatever is approved:
- **Frame egress:** production frame egress stays **disabled**.
- **Handoff and network:** structure-only JSON goes to the local loopback reasoner only. CSP and permission restrictions are unchanged, and **no new origin, endpoint, frame-egress route or action type** is introduced.
- **Safeguards:** QG-04 interception and redaction safeguards stay in place, and fail-closed behaviour is mandatory (INV-22, INV-23).
- **The loop:** the five-turn cap stays, and click remains the only executable action under ADR-0006 as implemented.
- **Checks and consent:** grounding and postcondition validation are mandatory, and explicit private-data consent is mandatory (ADR-0014).
- **FR-01 and B-07 are unchanged.** Nothing here permits detector evaluation.

## 4. Evidence standard

**Distinct evidence types:** each criterion names the types it requires.

| Type | What it is | What it is **not** |
|---|---|---|
| **A** | unit and integration tests | a product test |
| **B** | synthetic browser and fixture tests | a real-site test |
| **C** | human-operated product tests on W1 (developer or owner) | independent, or cross-machine |
| **D** | cross-machine product tests (W1 and W2, or another recorded machine) | independent, unless E also holds |
| **E** | independent human tests (an operator who is neither developer nor owner; see OD-C) | — |
| **F** | real-site validation (only within an owner-approved scope; OD-D) | — |
| **G** | security negative tests | a functional pass |
| **H** | hosted CI results (GitHub Actions on the commit) | a green local suite |

**Rules for evidence:**
- **Labelled:** every record states machine, OS, browser and version, build, commit, date and operator role.
- **Plans don't count:** a design or a pre-registration is **not** executed evidence.
- **Thresholds are owner-set:** a numeric threshold that no authoritative source gives is **TBD**, and needs an owner decision.

## 5. Acceptance matrix — Phase 1 scope (PROPOSED — AWAITING OWNER APPROVAL)

Following the owner's phased direction (M23.2), §5.1 to §5.12 are the proposed **Phase 1** acceptance scope, for the current structure-only product. Phase 2 capabilities are **not** Phase 1 criteria (§5.13).

**How to read it:**
- **Class:** M = mandatory, O = optional, X = out of scope, OD = owner decision required before classification.
- **Status:** EVIDENCED · PARTIAL · NOT EVIDENCED · BLOCKED · UNKNOWN.
- **Approval:** every row needs **owner approval of this proposal**. The column names any further approval.

### 5.1 Functional product capability

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FUN-01 | A bounded end-to-end task completes through every stage, with consent, on the product build | brief deliverable 4; constitution §1 | M | orchestrator `runTask` / `runTaskLoop` | B: M15 (W1); C: M20 person-run smoke, 17 of 17 and, after the keyed-server fix, 18 of 18 (W1) | D, E; repeated runs | a fixed bounded task set (owner-approved corpus), run per REL-01 on each accepted machine and by an independent operator | corpus and pass criterion (TBD) | OD-B, OD-C, OD-D | PARTIAL |
| FUN-02 | Multi-turn: continue only after a confirmed result; stop and ask otherwise; at most 5 turns | constitution §1 stage 12; M14 | M | `MAX_TASK_TURNS = 5` | A; B (M15) | C/D coverage of the stop paths | scripted stop-and-ask cases in the bounded set | — | FUN-01 | PARTIAL |
| FUN-03 | Field grounding: a private value only into a privacy-grounded field, via reference | M16; INV-07–INV-09 | M | `groundFill`, `validatePlan` | A; B | C/D/E | bounded-set fill cases, including refusals | — | PRV-05 | PARTIAL |
| FUN-04 | Clarification and declared outcomes (M17, M18) | M17, M18 | O | implemented | A; B | — | covered by the bounded set if kept | owner (keep in scope?) | — | PARTIAL |
| FUN-05 | **Task success after privacy**: completion rate with redaction on, on the same runs as the privacy metrics; the two-row ablation (redaction off and on) | benchmark contract Rule 2; vision | M | — (not produced) | none | the metric itself | ablation on the accepted corpus | **threshold TBD**; corpus | OD-D, PRV-02 | NOT EVIDENCED |
| FUN-06 | Model failure: the deterministic planner, or a stop. A misbehaving model stops the run | ADR-0012 §8; registry `FALLBACK_PATH` | M | implemented | A; LOOP-1/2 | C/D | fault-injection cases in the bounded set | — | — | PARTIAL |

### 5.2 Browser compatibility

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| BRW-01 | Chrome MV3 product build runs the bounded task set | brief deliverable 1 | M | built | C: W1, CfT 153 | D, E, H for the product build | FUN-01 on each accepted machine | — | OD-B | PARTIAL |
| BRW-02 | Firefox MV3 product build runs the bounded task set | brief deliverable 1; QG-06; release blockers | **OD** (OD-A) | build script only | none for the product. Firefox exists only for the coordinate-contract fixture (QG-02, hosted CI run `34485366327`), model runtime (QG-03a-B2, M8.2) and spikes (S-02, S-05) | build, run, human test | see OD-G | OD-A | OD-A, OD-G | NOT EVIDENCED |
| BRW-03 | Firefox on Linux, with the backend indicator visible | release workflow, "Release blockers" | **OD** (OD-A) | — | spike-level only (S-02a, M8.2 WSL2) | product | see OD-G | OD-A | BRW-02 | NOT EVIDENCED |
| BRW-04 | Gesture-authorised capture works in each accepted browser | ADR-0009 | M | implemented | B; C (M4 human-in-the-loop, M5) | other browsers per OD-A | part of FUN-01 | — | OD-A | PARTIAL |
| BRW-05 | A WASM-only build, benchmarked, for the in-extension models (TR-01) | release workflow, "Release blockers" | M (as written) | ORT Web WASM in use | M8.2 TR-01 cells (feasibility) | a product WASM-only benchmark | product benchmark, WASM backend labelled | owner may re-scope (§6 of the gate mapping) | QG-03 | PARTIAL |

### 5.3 Privacy and sanitisation

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PRV-01 | Textual and DOM PII (channels D1 DOM semantics, D2 pattern and checksum) becomes references **before** the handoff | security invariants (channels); constitution §2 | M | `packages/privacy` | A; B (M2 page-value boundary, 42 of 42 checks); G | C/D/E | per-class cases in the bounded set | — | — | PARTIAL |
| PRV-02 | PII detection per-class precision, recall and F1; **target recall ≥ 0.98**; precision on a decoy set | benchmark contract Rule 2 | M | — (metric not produced) | none | corpus and run | Rule 2 measurement on the accepted corpus | corpus (OD-D); real-layout data needs legal review (AUDIT-0004 D5) | OD-D | NOT EVIDENCED |
| PRV-03 | **Visual-only PII protection** (text present only in pixels; faces) | brief ("blurring faces, blacking out passwords, masking PII"); M9 | **OD** (OD-F) | TR-01 `UNREAD_REGION` redaction exists, but **OD-R (M23.6) excludes frame capture and TR-01 from normal Phase 1 tasks**; faces are not in the product path | B (M10, synthetic); **"Product visual-only PII protection NOT VERIFIED"** (M9) | verification evidence, if the owner keeps the criterion | see OD-F | OD-F | OD-F, OD-R | NOT EVIDENCED |
| PRV-04 | Redaction metrics: residual leakage, over-redaction area ratio, block rate | benchmark contract Rule 2 | M | verifier, ledger | A (unit) | the metrics. The server tripwire source does not exist (no server) | Rule 2 redaction metrics with an owner-approved evidence source | evidence source (OD-F) | PRV-03 | NOT EVIDENCED |
| PRV-05 | Explicit private-data consent: just in time, once, masked preview; Deny honoured | ADR-0014 | M | implemented | A; C (M19, M20: Allow once, Deny) | D, E | consent cases in the bounded set | — | — | PARTIAL |
| PRV-06 | Vault memory-only; destroyed at session end, tab change and origin change (unconditionally on origin change) | INV-04–INV-06 | M | implemented | A (M12 QG-04 item 10 MET) | G for the origin-change destruction in the product | negative test of each destruction trigger | — | — | PARTIAL |
| PRV-07 | No component logs secret plaintext | INV-21 | M | front logs no bodies (M20); ledger and verifier | A; M20 | a product-wide log audit | log inspection after the bounded set | — | — | PARTIAL |

### 5.4 Security and permissions

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-01 | The product build reaches exactly one network address (the reasoner endpoint) | ADR-0013; INV-01 | M | CSP v2 | B (machine-verified, M13); H (CI) | D | re-run of the M13 CSP checks on the release commit | — | — | EVIDENCED (W1, CI) |
| SEC-02 | Top-level navigation residual **F-M13-1** decided | ADR-0013 §9 | M (decision) | — | the finding (M13) | owner decision ± measurement | depends on the option chosen | **owner (OD-E)** | — | BLOCKED (owner) |
| SEC-03 | **QG-04 signed for the structure-only product**, per a revised definition | QG-04; ADR-0012 | M | M12 enforcement infrastructure | A, G (M12) | an approved structure-only definition; evidence against it | `quality-gate-mapping-PROPOSED.md` §QG-04 | **owner (OD-E)** | GOV-03 | NOT EVIDENCED |
| SEC-04 | Production frame egress disabled (three locks) | ADR-0012 §16 | M (frozen) | implemented | A, G (M12) | — | re-check on the release commit | — | — | EVIDENCED |
| SEC-05 | Fail-closed: a detector error or timeout counts as positive; the verifier blocks | INV-22, INV-23 | M | implemented | A; G (M12 interception suite) | demonstration on the product build | failure-path sequence (REL-03) | — | — | PARTIAL |
| SEC-06 | B-02 (Invariant-E mechanism 2 coverage gap) decided | `agentos/blockers.md` B-02 | M (decision) | — | — | decision | per decision | **owner (OD-E)** | — | BLOCKED (owner) |
| SEC-07 | Adversarial page: injected instructions are observed and not obeyed | release workflow, sequence 2; E7 | M | plan validation, allowlist | E7 (W2), M2 | product build, C/D | an adversarial page in the bounded set | — | OD-D | PARTIAL |
| SEC-08 | No new permission, origin or action type | ADR-0013; constitution | M (frozen) | — | manifest review | release-commit diff check | manifest and CSP diff against the accepted baseline | — | — | EVIDENCED (as of `077f139`) |

### 5.5 Local reasoning and communication

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| RSN-01 | The launcher verifies the model's full SHA-256 and the runtime archive and binaries; refuses to start otherwise | M20 | M | `npm run reasoner` | C/A (M20 launcher records) | D | launcher run on each accepted machine | — | OD-B | PARTIAL |
| RSN-02 | Loopback only; the front's refusals (403/421/404/405/400/422) | M20 | M | implemented | A; G (M20) | D | front negative tests on each machine | — | — | PARTIAL |
| RSN-03 | Model server: per-launch key (401 otherwise), `/slots` off, fail-closed start | M20 (B1) | M | implemented | G (M20 keyed-server checks: 401 without the key; `/slots` 501; W1) | D | same checks on each machine | — | — | PARTIAL |
| RSN-04 | The reasoner never receives pixels or values: structure-only handoff with references | ADR-0012 §8; INV-07; LOOP-2 | M | implemented | A; LOOP-2 (request body carried only tokens) | product-build re-check | request-body inspection in the bounded set | — | — | PARTIAL |
| RSN-05 | Reasoner output parsed and validated client-side; no best-effort parse | INV-12; `packages/plan` | M | `parsePlan` / `validatePlan` | A | — | fuzzed or invalid plan cases | — | — | EVIDENCED (A) |
| RSN-06 | Reasoner **adoption** (registry: `PINNED`, not `ADOPTED`; correctness PROVISIONAL) | model registry | **OD** | — | LOOP-2; M20 benchmark (one machine) | an adoption bar | per the bar the owner sets | **owner** | G-3 | NOT EVIDENCED |
| RSN-07 | An architecture record for the local text LLM as the Phase 1 REASON stage | constitution §1–§2 (frozen); M23.2 RC-01, RC-02 | M (governance) | — | M23.2 records the owner's **direction**, not an ADR | ADR or constitution amendment | — | **owner + ADR** (G-1, OD-K1) | — | NOT EVIDENCED |

### 5.6 Action safety and verification

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| ACT-01 | `click` is the only executable action; no TYPE; `insert` only via the trusted client | ADR-0006; `packages/plan` | M (frozen) | `EXECUTABLE_ACTIONS = ["click"]` | A | — | static check on the release commit | — | — | EVIDENCED (A) |
| ACT-02 | VALIDATE (allowlist) and REFRESH (freshness) both pass before any act; a failed freshness check re-observes | constitution §1 stages 7–8; ADR-0005; INV-13, INV-14 | M | implemented | A; B (MVP-1, M2-EXEC 50/50) | **ADR-0005's numeric tolerances PENDING** | swap and move cases at the approved tolerances | **owner (OD-E)** | — | PARTIAL |
| ACT-03 | Hit-test agreement and VERIFY RESULT (postconditions) | ADR-0007; M18; E8 | M | implemented | A; B (MVP-2, E8) | **ADR-0007's IoU tolerance PENDING** | postcondition cases at the approved tolerance | **owner (OD-E)** | — | PARTIAL |
| ACT-04 | Single-use dispatch permits | ADR-0008 | M | implemented | A | **permit lifetime UNRESOLVED** | permit reuse and expiry cases | **owner (OD-E)** | — | PARTIAL |
| ACT-05 | Human confirmation tier for actions | ADR-0006 (tier PENDING); `docs/architecture/human-confirmation.md` | M | grant step implemented | A; C | **the tier screen PENDING the owner** | per the approved tier | **owner (OD-E)** | — | PARTIAL |
| ACT-06 | An off-screen element is never actioned without a preceding scroll | QG-02 criterion 7 (CONDITIONAL) | M | — | the perception half only | executor-half verification | an off-screen target case | — | — | NOT EVIDENCED |
| ACT-07 | New-origin navigation follows the confirmation policy; the vault is destroyed first | INV-20 | M | — | UNKNOWN for click-induced navigation | evidence | a navigation case in the bounded set | — | SEC-02 | UNKNOWN |

### 5.7 Reliability and repeated execution

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| REL-01 | The bounded task set passes on repeated runs | release workflow step 9 ("rehearsed ten times") | M | — | M20: **one run per scenario** | the repeated runs | N repetitions, each recorded | **N and the pass criterion TBD** (owner); release.md says ten rehearsals for demonstration sequences | FUN-01 | NOT EVIDENCED |
| REL-02 | Reasoner lifecycle: busy port reported, clean stop, no leftover process | M20 | M | implemented | C (W1) | D | lifecycle check on each machine | — | OD-B | PARTIAL |
| REL-03 | Failure path: injected detector timeout masked; repeated verification failures block and are shown | release workflow, sequence 3 | M | implemented | A; G | a product-build demonstration | scripted failure-path run | — | — | PARTIAL |

### 5.8 Performance and resources

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| PRF-01 | Report stage-wise p50 and p95, cold and warm, network-free step count, labelled with backend and hardware | benchmark contract Rule 2 (latency); QG-05 | M (reporting) | timings in the run record and panel | **W1 only**: `artifacts/benchmarks/M20-w1-product/` (warm p50 448.7 / p95 1438.8 ms, n = 14) | D; per backend | the benchmark on each accepted machine | — | OD-B | PARTIAL |
| PRF-02 | Report client resources: peak heap, GPU, CPU share, weights on disk, tier firing distribution | benchmark contract Rule 2 | M (reporting) | partial | peak working set only (M20) | the other figures | an extended benchmark | — | — | PARTIAL |
| PRF-03 | A product-wide latency or memory **target** | — (Rule 5 budgets are projected, not targets) | **OD** (OD-H) | — | — | a target | — | **owner** | — | NOT EVIDENCED |

### 5.9 Cross-machine reproducibility

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| XM-01 | Product build, launcher, bounded task set and benchmark on a second recorded machine | AGENTS.md §5 (separate cells); M20 ("no cross-machine claim") | **OD** (OD-B) | handoff docs exist (`docs/handoff/w1-to-w2/`) | none for the product | D | FUN-01, RSN-01, PRF-01 on W2 | OD-B | OD-B | NOT EVIDENCED |
| XM-02 | Clean-checkout reproduction following the documented commands | `docs/handoff/w1-to-w2/reproduction-guide.md` | M | documented | UNKNOWN whether executed for the product | a record | follow the guide on the second machine, recorded | — | XM-01 | UNKNOWN |

### 5.10 Independent human validation

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| HUM-01 | An independent operator (OD-C) completes the bounded task set from the documented commands only | brief deliverable 4 ("visibly assists a user") | **OD** (OD-C) | — | **none.** M4, M19 and M20 runs were by the developer or owner and do **not** count | E | per OD-C | OD-C | FUN-01 | NOT EVIDENCED |

### 5.11 CI and dependency reproducibility

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| CI-01 | Hosted CI green on the release-candidate commit (all jobs, including `detector-adapter`) | `.github/workflows/ci.yml`; CONTRIBUTING | M | jobs configured | H for merged `main` commits (branch protection); **none for the M22 branch** | H on the candidate | the hosted run | branch publication (OD-J) | OD-J | PARTIAL |
| CI-02 | Every dependency, model revision and runtime asset pinned; a reproducibility manifest recorded | release workflow step 1; QG-03 | M | ORT pin check, reasoner `pin.json`, Python pins | A; H (pin drift) | the release reproducibility manifest | manifest recorded at freeze | — | — | PARTIAL |
| CI-03 | Line endings managed | `agentos/blockers.md` B-06 | M | — | — | decision and fix | — | owner | — | NOT EVIDENCED |

### 5.12 Governance and release readiness

| ID | Requirement | Source | Class | Implementation | Evidence | Missing | Proposed test | Further approval | Depends on | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| GOV-01 | This acceptance definition approved | this document | M | — | — | the approval | — | **owner** | — | PROPOSED |
| GOV-02 | Proposed ADRs used by the product resolved: ADR-0005, 0006, 0007, 0008 (tolerances and tiers); ADR-0003; ADR-0011; ADR-0012's open items | `docs/adr/README.md` | M | implemented where noted | — | decisions | — | **owner** | — | NOT EVIDENCED |
| GOV-03 | Revised gate scopes approved (QG-01–QG-06) | `quality-gate-mapping-PROPOSED.md` | M | — | — | approval | — | **owner** | GOV-01 | PROPOSED |
| GOV-04 | Registers consistent: B-03 status; the registry byte-count discrepancy; `state.md` current | §2.1 G-4, G-5 | M | — | — | updates | — | owner (B-03) | — | NOT EVIDENCED |
| GOV-05 | Demonstration sequences redefined for the shipped architecture (release.md assumes a server VLM, frame egress and SmolVLM offline) | release workflow | M | — | — | redefinition | — | **owner** | GOV-01 | NOT EVIDENCED |
| GOV-06 | Release from `main` via PR; the M22 branch published and merged, or explicitly excluded | CONTRIBUTING; M22.19 register R-10 | M | — | — | decision | — | **owner (OD-J)** | — | NOT EVIDENCED |
| GOV-07 | FR-01 excluded from core acceptance | FR-01; M22.19 | M (statement) | — | the FR-01 register | — | — | owner may change scope (OD-I) | — | EVIDENCED (as recorded) |

### 5.13 Phase 2 future scope (not Phase 1 criteria)

These capabilities come from the brief and the constitution, and **their history is not rewritten**. Under the owner's phased direction they are **not required** for the proposed Phase 1 baseline. Each is `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` (`phase-2-future-capability-register.md`).

| ID | Capability | Original source | Phase 1 consequence | Reconciliation |
|---|---|---|---|---|
| P2-01 | Vision-language reasoning | brief Deliverable 3; constitution §1 stage 5 | none; RSN-* covers the text reasoner | RC-01, RC-05 |
| P2-02 | Browser-frame visual context to a reasoner | brief; constitution §2 | SEC-04 requires that it stays **impossible** | QG-04-F; RC-02 |
| P2-03 | Joint visual and structural model architecture | brief; dossier | none | RC-03 |
| P2-04 | Server or remote inference infrastructure | constitution §2, §10 | none | RC-02, RC-03; B-03 |
| P2-05 | Visual-context scoring on clean and redacted frames | rubric; benchmark contract Rule 2 | QG-05 Phase 1 metric set excludes it (proposed) | RC-08 |
| P2-06 | Server PII tripwire | constitution §2; INV-21 | PRV-04 needs another evidence source (OD-F) | RC-09 |
| P2-07 | Offline-mode local VLM | constitution §10 v1.1; release sequence 4 | GOV-05 | RC-03, RC-07 |
| P2-08 | Frame-based local perception in task runs: frame capture, UI detection (T1), TR-01 masking | brief Deliverables 1–2; constitution §10 (UI detector, YuNet) | **excluded from normal Phase 1 tasks** (OD-R, M23.6); PRV-03 is then a non-egress statement (OD-F) | OD-O (T1), OD-F (TR-01), P2-08 |

**Still Phase 1 decisions, not moved to Phase 2:**
- **Visual-only PII protection (PRV-03, OD-F):** a gap in the shipped product.
- **Firefox (BRW-02, BRW-03, OD-A):** the brief names it for the client.
- **Face-detection validation.**

## 6. The gates

`quality-gate-mapping-PROPOSED.md` maps QG-01–QG-06 onto the shipped architecture and proposes revised scopes. QG-04 gets a structure-only definition for owner review.

**No gate is amended or signed by this proposal.**

## 7. Owner decisions

`owner-decisions.md` frames OD-A to OD-M: browser scope, cross-machine, human validation, real-site scope, security acceptance, privacy, Firefox, performance, deferred research, branch publication, the REASON-stage record, register hygiene, and the Phase 2 proposal. **None is decided here.** M23.2 resolved only the phased direction (P-1 to P-3).

## 8. Release readiness

`release-readiness-checklist-PROPOSED.md` lists what must be true before a core-product release can be declared, separating:
- mandatory requirements;
- owner-approved optional requirements;
- future enhancements;
- FR-01.

## 9. What this proposal is not

- **Not an acceptance:** it neither declares the product accepted nor sets any numeric threshold that an authoritative source does not already give.
- **Not an approval:** it authorises no implementation, test run, training, inference, detector evaluation or TEST access.
- **Not a rewrite of history:** it does not reclassify historical evidence.
