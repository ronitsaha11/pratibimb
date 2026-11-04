# Owner-decision register — core-product acceptance

> **Status (updated M23.8, 2026-11-04):**
> - **Resolved:** the owner resolved the **phased architecture direction** (P-1 to P-3 below).
> - **Selected in M23.4:** **OD-P** (disable T1 from active Phase 1 execution), with implementation pending a separate authorisation.
> - **Selected in M23.6:** **OD-R: APPROVED — OPTION A: DOM-ONLY PHASE 1** (2026-11-03).
> - **Implemented in M23.7 (owner-authorised), product builds only:** OD-P and OD-R. M23.8 tested the boundary under a simulated extension. **Neither is browser-verified or accepted.**
> - **Prepared in M23.8:** OD-S, OD-T and OD-U. None is decided.
> - **Not resolved by it:** every other OD-A to OD-Q decision (OD-N to OD-Q added in M23.3) stays **AWAITING OWNER APPROVAL**, unless it is marked BLOCKED or NOT AUTHORISED. Selecting the direction does not complete any of them.
> - **Not decided here:** this register frames choices; it decides none of them.
> - **Recommendations:** where a recommendation is given, it is labelled **PROPOSED — AWAITING OWNER APPROVAL**.
> - **Unaffected:** no ADR, gate, invariant, blocker or threshold is changed by this register.
> - **Recording a decision:** a decision is recorded only when the owner states it. It is then written into the governing record (an ADR, the gate file, the blocker register or this file) in a separate change.
> - **References:** criterion IDs refer to `core-product-acceptance-PROPOSED.md` §5.

## Resolved by M23.2 (owner, 2026-11-03)

| ID | Decision | Record | Limits |
|---|---|---|---|
| P-1 | **Phased architecture direction:** Phase 1, then Phase 2 | `artifacts/experiments/M23.2-phased-architecture-decision/` | a roadmap direction; **not** an ADR or constitution amendment |
| P-2 | **Phase 1 target architecture:** the current local, loopback, structure-only product | `phase-1-architecture-scope.md` | the *intended* architecture; **not** a claim of acceptance |
| P-3 | **Original VLM and frame-based functionality deferred to Phase 2** | `phase-2-future-capability-register.md` | Phase 2 is **NOT AUTHORISED** for implementation or execution |

## Selected by the owner; implemented in product builds (M23.4, M23.6, M23.7)

The table's Status and Limits columns are as recorded at selection. **Current status of both: implemented in product builds (M23.7); boundary tested under a simulated extension (M23.8); not browser-verified, not accepted.** See the M23.7 and M23.8 sections below.

| ID | Decision | Status | Limits |
|---|---|---|---|
| OD-P | **T1 must not remain an active inference dependency in the Phase 1 product.** Required future outcome:<br>• T1 is neither loaded nor invoked in normal Phase 1 operation;<br>• it is not a required dependency for perception or task execution;<br>• Phase 1 keeps its DOM-based observation, grounding and click safety without it;<br>• T1 remains UNADOPTED;<br>• FR-01 remains deferred and not authorised | **OWNER DECISION SELECTED (2026-11-03): IMPLEMENTATION PENDING SEPARATE AUTHORISATION** | **T1 is NOT disabled.** The source still loads and runs it. No code, package, model or runtime change is authorised by the selection (`artifacts/experiments/M23.4-t1-disablement-impact/`) |
| OD-R | **APPROVED — OPTION A: DOM-ONLY PHASE 1** (owner, 2026-11-03). In normal Phase 1 task execution:<br>• no browser-frame capture;<br>• no T1 loading or inference as a product dependency;<br>• no TR-01 invocation.<br>DOM-based discovery and the structural handoff stay, as do grounding, click eligibility, consent and human approval, the five-turn cap, freshness and postconditions | **SELECTED BY OWNER — IMPLEMENTATION NOT AUTHORISED** | **Not implemented:** frames are still captured on gesture-granted passes, and T1 and TR-01 still run on them. Evidence builds are out of scope. Model assets are not deleted or modified (`artifacts/experiments/M23.6-dom-only-phase-1-decision/`) |

## Awaiting owner approval

| ID | Decision | Blocks | Status |
|---|---|---|---|
| GOV-01 | M23.1 acceptance-definition approval (the Phase 1 scope) | every criterion | AWAITING OWNER APPROVAL |
| — | Phase 1 mandatory and optional classification (51 M, 1 O, 7 OD as proposed) | the matrix | AWAITING OWNER APPROVAL |
| OD-A | Browser scope: Chrome only, or Chrome and Firefox, for Phase 1 | BRW-02, BRW-03, BRW-04, QG-03 cells, QG-06 | AWAITING OWNER APPROVAL |
| OD-B | Cross-machine requirement | XM-01, FUN-01, RSN-01, PRF-01, REL-02 | AWAITING OWNER APPROVAL |
| OD-C | Independent human validation | HUM-01, FUN-01 | AWAITING OWNER APPROVAL |
| OD-D | Real-site scope | FUN-01, FUN-05, PRV-02, SEC-07 | AWAITING OWNER APPROVAL |
| OD-E | Security acceptance: QG-04-S scope and sign-off (E1), F-M13-1 (E2), B-02 (E3), the ADR-0006 tier (E4), the ADR-0005/0007/0008 values (E5 to E7), other proposed ADRs (E8) | SEC-02, SEC-03, SEC-06, ACT-02 to ACT-05 | AWAITING OWNER APPROVAL |
| OD-F | Visual-only PII, including **TR-01 redaction acceptance** (a Phase 1 gap, not moved to Phase 2; TR-01 masks only the local frame, M23.3) | PRV-03, PRV-04, release sequence 1 | AWAITING OWNER APPROVAL |
| OD-G | Firefox evidence | BRW-02, BRW-03 | AWAITING OWNER APPROVAL |
| OD-H | Performance targets | PRF-03, QG-05 thresholds, RSN-06 | AWAITING OWNER APPROVAL |
| OD-I | FR-01 stays excluded | GOV-07 | AWAITING OWNER APPROVAL (current record: excluded) |
| OD-J | Branch publication and hosted CI | CI-01, GOV-06 | AWAITING OWNER APPROVAL |
| OD-K | Formal record of the Phase 1 REASON stage (K1); deliverable judgement (K2) | RSN-07, QG-01, deliverables 1 and 3 | AWAITING OWNER APPROVAL (direction recorded by P-1; formal record missing) |
| OD-L | Register hygiene (B-03, registry byte count, the M23.0 audit) | GOV-04 | AWAITING OWNER APPROVAL |
| OD-M | Phase 2 architecture proposal: whether, when, and its scope | P2-01 to P2-07 | AWAITING OWNER APPROVAL |
| OD-N | **ADR-0015 approval** (Phase 1 architecture record) | RSN-07, RC-01 to RC-12, QG-01 ADR item | AWAITING OWNER APPROVAL |
| OD-O | **T1 artifact integrity policy for any future reactivation or adoption:** T1 bytes have no build-time or runtime check (M23.3). Proposal: `t1-artifact-integrity-policy-PROPOSED.md` (M23.4) | any measurement with T1 inference (U-4); ADR-0003 | AWAITING OWNER APPROVAL |
| OD-P | **Whether T1 stays active before formal adoption** | RC-12; PRF-01 timings | **SELECTED (owner, 2026-11-03, M23.4): disable T1 from active Phase 1 execution.** IMPLEMENTATION PENDING SEPARATE AUTHORISATION. See the M23.4 sections below |
| OD-Q | **T1's exact downstream influence:** whether the source trace is sufficient, or a further trace is required (U-2, U-3) | RC-12 | AWAITING OWNER APPROVAL |

## Not authorised (M23.4)

Each of these is a separate item. **None is authorised.**
- **T1 disablement implementation:** source, packaging or runtime changes. The readiness plan is design only (`t1-disablement-implementation-readiness-PROPOSED.md`).
- **T1 integrity code changes.**
- **TR-01 product integration changes.**
- **Detector evaluation.**
- **FR-01 execution.**
- **Phase 2 implementation.**

## Blocked or not authorised

| Item | Status | Basis |
|---|---|---|
| QG-04-F and production frame egress | **BLOCKED** | ADR-0012 §13 (B1, B2, B4, B5, B6 open); three locks (§16) |
| B-07 and FR-01 detector evaluation | **BLOCKED** (B-07); FR-01 **DEFERRED — NOT AUTHORISED FOR EXECUTION** | `agentos/blockers.md`; `agentos/registry/future-research-register.md` |
| Any new visual-frame data-transfer pathway | **NOT AUTHORISED** | M23.2 decision §3, §6 |
| Phase 2 implementation or execution | **NOT AUTHORISED** | M23.2 decision |

---

## OD-A — Browser scope

**Question.** Which browsers must the core product be accepted in?

**Context (FACT):**
- **The brief:** Deliverable 1 names "Chrome and Firefox", and QG-06 requires both MV3 builds from one codebase.
- **The product:** it has run only in Chrome for Testing 153 (W1). A `build:firefox` script exists; the product has **never been run in Firefox**.
- **Firefox evidence elsewhere:**
  - the coordinate-contract fixture (QG-02, hosted CI);
  - the TR-01 model runtime (M8.2, M8.2a);
  - spikes (W1-S02, W1-S02a, W1-S05-rate).

**Options:**
1. Chrome only, with Firefox recorded as a known gap.
2. Chrome and Firefox, Firefox on Windows.
3. Chrome and Firefox, Firefox on Linux, as QG-06 and the release workflow require.

**Consequences.** Options 2 and 3 make BRW-02 mandatory. Option 3 also makes BRW-03 mandatory. Option 1 requires an amendment of QG-06 and conflicts with the brief's wording.

**PROPOSED — AWAITING OWNER APPROVAL:** option 3, because it is what the brief and QG-06 state. Feasibility is the owner's call, given the effort in OD-G.

## OD-B — Cross-machine requirement

**Question.** Must the product be reproduced on a second machine before acceptance? If so, which machine, and which of the product, the launcher and the benchmark?

**Context (FACT):**
- **Evidence is per machine:** `AGENTS.md` §5 and `state.md` treat W1 and W2 as separate experimental cells; "no result transfers between them".
- **The product has W1 evidence only:** M20 is labelled "one machine".
- **Instructions exist:** a W1-to-W2 reproduction guide is in `docs/handoff/w1-to-w2/`. Whether it has been executed for the product is UNKNOWN.

**Options:**
1. W1 only, with the limitation declared.
2. W1 and W2: the bounded task set and the launcher.
3. W1 and W2: the bounded task set, the launcher and the benchmark.

**PROPOSED — AWAITING OWNER APPROVAL:** option 3. A W2 benchmark gives a second labelled cell, but neither machine's figures transfer to the other.

## OD-C — Independent human validation

**Question.** Is independent human validation required? If so, who counts as an independent operator?

**Context (FACT):**
- **Who operated the runs:** every person-run product test (M4, M5, M19, M20) was operated by the developer or the owner.
- **Developer-run W1 tests do not count as independent validation.**

**Proposed definition of an independent operator** — **PROPOSED — AWAITING OWNER APPROVAL.** A person who meets all of these:
- is neither the developer nor the owner;
- did not write or review the product code or its test harnesses;
- works only from the repository's documented commands and the side panel's own text, with no coaching during the run;
- has their role recorded in the run record, without personal data.

**Open sub-decisions:**
- how many operators;
- how many runs each;
- on which machine (OD-B);
- the pass criterion. **TBD:** no authoritative source gives one.

## OD-D — Real-site scope

**Question.** Is any real website in scope for acceptance? If so, which sites, under what legal and terms-of-service review, and with what data?

**Context (FACT):**
- **The validated scope** is synthetic loopback pages.
- **AUDIT-0004 D5** (legal and ToS) is BLOCKED.
- **Widening the scope needs an owner ADR.**
- **The metrics need a corpus:** the PII detection metric (Rule 2) and task success after privacy both need a corpus, and none is approved.

**Options:**
1. Synthetic pages only, with a corpus the owner approves.
2. Synthetic pages, plus a named set of public test or demonstration sites, after legal review.
3. Synthetic pages plus real-layout replicas served locally. Licensing and data provenance still need review.

**PROPOSED — AWAITING OWNER APPROVAL:** option 1 for core acceptance; options 2 and 3 as owner-approved optional criteria. No real site is visited without the ADR and D5.

## OD-E — Security acceptance

Each sub-decision is separate.

| Sub | Question | Context (FACT) | Options |
|---|---|---|---|
| E1 | QG-04 scope | QG-04 is UNSIGNED and its text forbids network calls; the product calls the loopback reasoner | split into QG-04-S and QG-04-F (`quality-gate-mapping-PROPOSED.md`); or keep it whole; or another structure |
| E2 | **F-M13-1** (top-level navigation via `window.open`, `<a target=_blank>`, `chrome.tabs.create`, `chrome.windows.create`) | ADR-0013 §9, OPEN; CSP cannot close it | declarativeNetRequest; in-realm neutralisation; accept the residual explicitly, with its rationale recorded |
| E3 | **B-02** (Invariant-E mechanism 2: Playwright does not observe the offscreen document) | OPEN; raw CDP on the offscreen document and worker observes it (M12); the real CI cell is UNKNOWN | an ADR choosing the vehicle (raw CDP `Fetch` or `Network`; independent arrival assertion); the invariant is **not** weakened either way |
| E4 | ADR-0006 confirmation tier | PROPOSED; the tier screen is pending | approve the tier as proposed, or amend it |
| E5 | ADR-0005 freshness tolerances | PROPOSED; numeric tolerances pending | approve values. **No value is proposed here** |
| E6 | ADR-0007 hit-test IoU tolerance | PROPOSED | approve a value. **No value is proposed here** |
| E7 | ADR-0008 permit lifetime | PROPOSED; unresolved | approve a lifetime. **No value is proposed here** |
| E8 | ADR-0003, ADR-0004 (D2/D5), ADR-0011, ADR-0012's open items (B2, B5) | PROPOSED or partially approved | per ADR; B2 and B5 affect QG-04-F only |

**PROPOSED — AWAITING OWNER APPROVAL:** decide E1 first, because the rest of QG-04-S depends on it. No security invariant may be weakened to reach a pass, under any option.

## OD-F — Visual-only PII

**Question.** Is protection of PII present **only in pixels** (scanned documents, images of text, faces) a mandatory core criterion? If so, what evidence counts?

**Context (FACT):**
- **M9:** "Product visual-only PII protection NOT VERIFIED".
- **TR-01** masks unread text regions on synthetic pages (M10).
- **Faces:** face detection is not in the product path (INFERENCE, from `git grep`).
- **J7 / B5:** stream-frame coverage is open.
- **The brief** names "blurring faces"; release sequence 1 uses a scanned PAN card.
- **In the structure-only product, no frame leaves the device.** INFERENCE: visual-only PII therefore cannot reach the reasoner through the frame path. Whether it can reach it through other channels is UNKNOWN.

**Options:**
1. Mandatory, with an owner-approved verification method and corpus.
2. Mandatory only for frame egress (QG-04-F); for the structure-only product, the criterion becomes "no pixel leaves the device" (SEC-04), plus the masked local preview.
3. Out of core scope, declared as a limitation.

**PROPOSED — AWAITING OWNER APPROVAL:** option 2, provided the owner accepts that the brief's "blurring faces" is then met only by the absence of egress, and records that decision. **This is a scope judgement, not a technical one.**

## OD-G — Firefox evidence

**Question.** If OD-A includes Firefox, what is the minimum evidence?

**Context (FACT):**
- **No product Firefox run exists.**
- **Firefox could not be run on W1 under Playwright:** its browser download returned HTTP 400 (QG-02 note).
- **W2 has WSL2 Ubuntu.**

**Proposed evidence tiers** (**PROPOSED — AWAITING OWNER APPROVAL**; the owner picks one):
1. A build plus an automated synthetic run (type B) in hosted CI.
2. Tier 1 plus a human-operated run (type C) on Windows.
3. Tier 2 plus a run on Linux with the backend indicator visible (QG-06).

**Open questions.** The loopback reasoner endpoint and MV3 side-panel behaviour in Firefox are **UNKNOWN**. Firefox's sidebar differs from Chrome's side panel, so the product's UI path may need work. This is INFERENCE, to be established.

## OD-H — Performance

**Question.** Is there a performance **target**, or only performance **reporting**?

**Context (FACT):**
- **What exists:** the M20 W1 benchmark — warm step p50 448.7 / p95 1438.8 ms (n = 14); peak working sets Chrome 888.8 MB and llama-server 610.1 MB — is a **measurement on one machine**, not a guarantee.
- **What is not a target:** benchmark contract Rule 5 budgets are projected, not acceptance targets.
- **No authoritative target exists.**

**Decisions:**
- **H1.** Reporting only (PRF-01, PRF-02), or reporting plus targets (PRF-03).
- **H2.** If targets: the values and their measurement conditions. **TBD; none proposed here.**
- **H3.** The reasoner adoption bar (RSN-06). **TBD.**

**PROPOSED — AWAITING OWNER APPROVAL:** keep the W1 benchmark labelled as a single-machine measurement in every document and on every slide, whatever H1 decides.

## OD-I — FR-01

**Question.** Does FR-01 (detector performance and generalisation research) stay outside core acceptance?

**Context (FACT):**
- **FR-01** is `DEFERRED — NOT AUTHORISED FOR EXECUTION` (`agentos/registry/future-research-register.md`).
- **B-07** (the M22 evaluation restriction) is `BLOCKED`.
- **T1 is not adopted.** The original T1 head runs in the product perception pass, but its detections never become click targets (M21; corrected in M23.2). T1 and the epoch-39 checkpoint are UNADOPTED.

**PROPOSED — AWAITING OWNER APPROVAL:** FR-01 stays excluded, and no core criterion depends on a UI detector. Changing this needs a separate owner authorisation, and it does not lift B-07.

## OD-J — Branch publication and hosted CI

**Question.** Is the local branch `spike/m22-small-target-recall` published and merged into `main` before acceptance, or excluded?

**Context (FACT):**
- **The branch:** it holds 70+ commits on `origin/main` `077f139`, and has never been pushed.
- **Hosted CI** has never run on it, including the `detector-adapter` job.
- **The M22.19 register** carries this as R-10, awaiting the owner.

**Options:**
1. Publish and merge through a PR; CI-01 is then met on `main`.
2. Exclude the branch from the release candidate; the release is built from `main` as it is.

**Consequence.** The M22 branch changes tooling and documentation, not the product path (INFERENCE, from M22.19). Either option is compatible with core acceptance, but the candidate commit must be named.

## OD-K — Architecture record for the shipped REASON stage

**Question.** How is the departure from frozen constitution §1–§2 recorded?

**Context (FACT):**
- **What shipped:** the product's REASON stage is a local loopback **text** LLM.
- **What the constitution says:** a remote server VLM. Constitution §10 also lists "a local VLM in the normal path" under *Not building*.
- **What is recorded:** ADR-0013 pins the endpoint, and ADR-0012 §8 defines the structure-only handoff. **No ADR or amendment records the substitution itself.**
- **The brief's Deliverable 3** asks for "a server hosting an open-weight LLM/VLM".

**Decisions:**
- **K1.** An ADR (or a constitution amendment) recording the shipped REASON stage, its trust boundary and its scope.
- **K2.** Whether the loopback-hosted open-weight LLM satisfies Deliverable 3, and whether the TR-01-for-redaction design satisfies Deliverable 1's "a vision model executing locally".

**PROPOSED — AWAITING OWNER APPROVAL:** K1 is a precondition of QG-01's ADR item and of any release claim about the architecture.

**After M23.2.** The owner's phased direction (P-1, P-2) states the intent that Phase 1 is local, loopback and structure-only. **K1 is still open:** the direction is not an ADR, and the conflicts it must reconcile are M23.2 RC-01 to RC-10. **K2 is narrowed, not closed:** the owner has placed the VLM and frame-based parts of Deliverables 1 and 3 in Phase 2. Whether Phase 1 alone is presented as meeting those deliverables remains the owner's judgement.

## OD-L — Register hygiene

| Sub | Item | Context (FACT) |
|---|---|---|
| L1 | **B-03** ("No vLLM host") is still `BLOCKED` | the shipped product uses no server; whether B-03 is superseded is an owner call |
| L2 | **Registry byte count:** 491 358 496 B in the model registry; 491 400 032 B in the M20 pin | reported in M20; unreconciled |
| L3 | **The M23.0 audit** was delivered in conversation, not as a repository record | record it, or leave this proposal as its only trace |

## OD-M — Phase 2 architecture proposal

**Question.** Whether and when a Phase 2 architecture proposal is prepared, and what it covers.

**Context (FACT).**
- **Scope:** Phase 2 holds P2-01 to P2-07 (`phase-2-future-capability-register.md`).
- **The old design is not presumed:** the dossier's FastAPI + vLLM + WebP design is not presumed reusable unchanged.
- **Frame egress stays blocked:** any frame pathway needs QG-04-F, a separate security review, and the legal and owner approvals.
- **Detector research is separate:** it stays FR-01 and is blocked by B-07. Phase 2 does not reactivate it.

**PROPOSED — AWAITING OWNER APPROVAL:** schedule the Phase 2 proposal only after Phase 1 acceptance is decided (GOV-01). That way Phase 2 does not reopen the Phase 1 scope.

## OD-N to OD-Q — added by M23.3

**Context (FACT, source trace; `docs/acceptance/t1-tr01-status-reconciliation.md`):**
- **T1 runs:** the T1 UI head is loaded on the first perception call and runs on every pass that captures a frame, and its output is fused (corrected M23.4).
- **What T1 output reaches:** handoff metadata (`source` relabelling, `capability`, `scale_to_css`), the run report, and pass timing.
- **What it does not reach:** it adds no element to the handoff, and it is not in the reasoner request.
- **Integrity:** its bytes are verified neither at build time nor at runtime. TR-01's are verified at both.
- **ADR-0003** (packaging and runtime identity) is PROPOSED, not implemented.

| ID | Question | Options (none chosen) |
|---|---|---|
| OD-N | Approve ADR-0015? | approve; amend; reject (the repository stays as it is) |
| OD-O | T1 integrity policy | require a build-time and runtime hash pin, as for TR-01 (source work, needing its own authorisation); accept the gap, with every measurement labelled; package T1 only in evidence builds |
| OD-P | T1 before adoption | keep it running unadopted, as recorded; disable it in the product (source work); keep it but exclude its metadata from the handoff (source work) |
| OD-Q | Downstream influence | accept the M23.3 trace as sufficient; require a further trace of U-1 to U-3 (documentation or measurement, separately authorised) |

**PROPOSED — AWAITING OWNER APPROVAL:**
- decide OD-O before quoting any product measurement in which T1 inference ran, because such measurements depend on an unverified file. The M20 benchmark ran no T1 inference (corrected M23.4);
- whatever is decided, nothing here is a T1 adoption, and FR-01 stays deferred and not authorised.

## M23.4 — decision status after OD-P

**Selected:** OD-P only.

**Awaiting owner approval** (unchanged in kind, kept separate):

| ID | Decision | M23.4 input |
|---|---|---|
| OD-O | T1 artifact integrity policy for any future reactivation | `t1-artifact-integrity-policy-PROPOSED.md` |
| OD-Q | whether the source trace establishes T1's indirect influence | `t1-dependency-and-disablement-impact.md` (direct and indirect effects separated) |
| OD-F | TR-01 visual-redaction product acceptance | `tr01-privacy-acceptance-assessment.md` |
| OD-N | ADR-0015 approval | `adr-0015-change-proposal-PROPOSED.md` (annotated changes, not applied) |
| GOV-01 | Phase 1 acceptance framework | — |
| OD-E1 | QG-04-S scope | — |
| OD-K / OD-L | formal document reconciliation | RC-01 to RC-12 |
| **OD-R** | **whether Phase 1 keeps capturing frames after T1 is disabled** | **SELECTED (M23.6): Option A, DOM-only Phase 1.** *(M23.4 status, superseded:)* implementation not authorised. **M23.7: implemented in product builds** (see the sections below) |

## M23.5 — OD-R prepared

| ID | Status |
|---|---|
| OD-P | **SELECTED:** disable T1; implementation pending separate authorisation; **T1 not disabled** |
| OD-R | *(M23.5 status, superseded by M23.6:)* awaiting the owner; recommendation Option A. **M23.6: SELECTED, Option A** |
| OD-O, OD-Q, OD-F, OD-N, GOV-01, OD-E1 | **AWAITING OWNER APPROVAL** (unchanged) |

**If OD-R = A:**
- OD-F narrows to TR-01 as a dormant, evidence-build capability.
- OD-K2 must record that no local vision model executes in task runs.

## M23.6 — status after OD-R

*(M23.6 status, superseded by M23.7 below.)*

**Selected by the owner** (each one: **implementation not authorised**; runtime not implemented):
- **OD-P:** T1 out of active Phase 1 execution.
- **OD-R:** Option A, DOM-only Phase 1.

**Still awaiting owner approval:**

| ID | Decision |
|---|---|
| OD-O | T1 integrity policy, for any possible future reactivation |
| OD-Q | completeness of the T1 influence analysis |
| OD-F | TR-01 acceptance, for any future use. TR-01 is retained as a separate component, and is not invoked in normal Phase 1 tasks |
| OD-N | ADR-0015 approval. ADR-0015 is updated with §3.6 and stays PROPOSED |
| GOV-01 | Phase 1 acceptance approval |
| OD-E1 | QG-04-S scope and sign-off |
| OD-K, OD-L | formal document reconciliation, including OD-K2's record that Phase 1 does not fulfil the brief's visual requirements |
| OD-M | Phase 2 architecture and timing |
| OD-A, OD-B, OD-C, OD-D, OD-G | browser, cross-machine, independent-human, real-site and Firefox acceptance |
| OD-H, OD-E2 to OD-E8 | performance targets and the remaining security decisions |

**Not authorised:**
- T1 disablement implementation;
- frame-capture removal implementation;
- TR-01 changes;
- detector evaluation;
- FR-01;
- Phase 2.

## M23.7 — implementation status of OD-P and OD-R

| ID | Decision | Implementation |
|---|---|---|
| OD-P | T1 out of active Phase 1 execution | **M23.7: IMPLEMENTED IN PRODUCT BUILDS** (owner-authorised): a product task takes no perception pass, so it captures no frame and runs neither T1 nor TR-01. T1 is not packaged in product builds. Evidence builds are unchanged. Verified by unit, static, mutation and build checks on W1; **not browser-verified, not accepted** (`artifacts/experiments/M23.7-dom-only-implementation/`) |
| OD-R | Option A, DOM-only Phase 1 | same |

**Not changed by the implementation:** OD-O, OD-Q, OD-F, OD-N (ADR-0015 stays PROPOSED), GOV-01, OD-E1, OD-K, OD-L, OD-M, and the browser, cross-machine, independent-human, real-site, performance and security decisions all remain **AWAITING OWNER APPROVAL**.

## M23.8 — status after the assurance milestone

**Selected by the owner, and implemented in product builds:** OD-P and OD-R. Tested under a simulated extension (`dom-only-regression-matrix.md`). **Not browser-verified, not accepted.**

**New; awaiting the owner:**

| ID | Decision | M23.8 input | Status |
|---|---|---|---|
| OD-S | **Diagnostic capture hooks** (`PERCEIVE_ONCE`, `STREAM_CONSUME`, the `__host` drivers): (A) retain in product builds, (B) move to evidence builds only, (C) remove | `od-s-diagnostic-hooks-comparison-PROPOSED.md`; `diagnostic-hook-boundary-map.md`. **PROPOSED — AWAITING OWNER APPROVAL: option B** | **AWAITING OWNER APPROVAL.** Any change needs its own authorisation |
| OD-T | **The product's visible capture wording:** the side panel's "Click the toolbar button to let PratiBimb look at this tab" and the toolbar title "perceive this tab", neither true of a product task | same comparison document | **AWAITING OWNER APPROVAL.** A product text change |
| OD-U | **`run-gesture-capture.mjs` and `run-gesture-acts.mjs`:** re-scope to an evidence build, or retire the four checks a product build can no longer pass | `evidence-build-preservation-assessment.md` §3 | **AWAITING OWNER APPROVAL** |

**Still awaiting the owner, unchanged:**
- OD-O, OD-Q, OD-F, OD-N (ADR-0015, still PROPOSED);
- GOV-01, OD-E1, OD-K, OD-L, OD-M;
- OD-A to OD-D, OD-G;
- OD-H, OD-E2 to OD-E8.

**Needs a separate authorisation, not a decision between options:** the human browser smoke run (`dom-only-browser-smoke-procedure-PROPOSED.md`), and any evidence-build run.

**Not authorised:** detector evaluation, FR-01, Phase 2, frame egress.
