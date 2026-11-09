# Phase 1 architecture scope

> **Status:** the **direction** is owner-selected (M23.2, 2026-11-03). The **acceptance criteria** are **PROPOSED — AWAITING OWNER APPROVAL**.
> - **Not an ADR:** this is not an ADR or a constitution amendment. The proposed architecture ADR is **ADR-0015 (PROPOSED — AWAITING OWNER APPROVAL, M23.3)**. The conflicts it creates are listed in `artifacts/experiments/M23.2-phased-architecture-decision/decision.md` §4 (RC-01 to RC-10).
> - **Not a claim of acceptance:** it does not say that any Phase 1 capability has passed acceptance.
> - **Updated in M23.18 (2026-11-08):** the loop's two limits are stated separately (RD-8). Since M23.17 a product declares neither `tabCapture` nor `activeTab`.
> - **Updated in M23.15 (2026-11-06):** §2 now describes the product as it is, with evidence-build diagnostics separate.

## 1. Owner-selected direction

Phase 1 is **the current local, loopback-only, structure-based reasoning architecture** (owner, 2026-11-03).

Vision-language and frame-based reasoning are Phase 2 (`phase-2-future-capability-register.md`). Phase 2 is **not authorised**.

## 1.1 Owner-selected perception scope (OD-P, OD-R)

**OD-R: APPROVED — OPTION A: DOM-ONLY PHASE 1** (owner, 2026-11-03), together with OD-P. **Status: implemented in product builds (M23.7); boundary tested under a simulated extension (M23.8); not browser-verified, not accepted.**

**Excluded from normal Phase 1 task execution:**
- browser-frame capture;
- T1 inference (and loading, as a product dependency);
- TR-01 invocation;
- visual-only PII masking based on a captured frame.

**What stays:** DOM-based observation and the structural handoff remain the intended Phase 1 perception.

**Outside the scope of normal task execution:**
- **Evidence builds** (separately authorised) are not part of normal task execution. Their diagnostics are described separately in §2, and must not be read as product behaviour.
- **TR-01** is retained as a separate component.
- **Model assets** are not changed.

**Implementation (M23.7):** **M23.7: IMPLEMENTED IN PRODUCT BUILDS** (owner-authorised): a product task takes no perception pass, so it captures no frame and runs neither T1 nor TR-01. T1 is not packaged in product builds. Evidence builds are unchanged. Verified by unit, static, mutation and build checks on W1; **not browser-verified, not accepted** (`artifacts/experiments/M23.7-dom-only-implementation/`).

## 2. Current implementation facts

| Element | As implemented (FACT) | Source |
|---|---|---|
| Browser | Chrome MV3 extension (WXT); run in Chrome for Testing 153 on W1. A `build:firefox` script exists; **the product has never been run in Firefox** | `apps/extension/`; M19, M20 |
| Capture | **In normal Phase 1 tasks: no browser-frame capture. No gesture grant is required for ordinary tasks; the toolbar button and `Alt+Shift+P` open the side panel and issue none. No T1 or TR-01 execution.** Structural change signal | OD-R, OD-W, OD-P; ADR-0010 |
| Perception in a normal task | **DOM-based observation only.** No model runs. T1 is not packaged in a product build, and a product bundle has no way to start TR-01, which stays packaged with its integrity check. No face detector is in the product path (INFERENCE) | `task-perception.ts`; M23.7, M23.9; `docs/acceptance/t1-tr01-status-reconciliation.md` |
| Sanitisation | values become typed references; memory-only vault; ledger; verifier | `packages/privacy`; INV-04 to INV-10 |
| Consent | just-in-time, one-time panel consent with a masked local preview | ADR-0014 |
| Handoff | structure-only JSON (references, no frame, no value) | ADR-0012 §8 |
| Frame egress | **impossible in production** (three locks) | ADR-0012 §16 |
| Reasoner | launcher (`npm run reasoner`) with pin verification; a front on `127.0.0.1:8995` that refuses foreign origins, hosts, paths, methods, non-JSON and value-shaped text; a keyed llama.cpp `b10956` model server on `127.0.0.1:8977`; `Qwen2.5-0.5B-Instruct` Q4_K_M. Registry **`PINNED`, not `ADOPTED`**; correctness PROVISIONAL; deterministic planner fallback | `scripts/reasoner/`; `packages/reasoner`; M20; model registry |
| Network | CSP v2: one endpoint, `http://127.0.0.1:8995/v1/chat/completions`, reached only through `sendVerified` | ADR-0013 |
| Plan and action | allowlist VALIDATE, REFRESH, human grant, single-use permit, RE-HYDRATE, **click only**, VERIFY RESULT | `packages/plan`, `packages/agent`; ADR-0005 to ADR-0008 (PROPOSED) |
| Loop | a panel-started task has a **3-turn budget** (the default: the panel asks for none); **5 is the enforced ceiling** (`MAX_TASK_TURNS`), refused above and never clamped; clarification; declared outcome | `packages/orchestrator/src/loop.ts`; `apps/extension/host/offscreen/main.ts`; M14, M17, M18 |
| Product identity | **PratiBimb — Page Assistant.** The build is named **PratiBimb — Page Assistant (Development build)**, and is not a release | OD-T, OD-Y |

**Evidence-build diagnostics, which are not normal product behaviour.** These exist only in evidence builds, need a separate authorisation, and are **UNVERIFIED** at run time since M23.7:

| Element | In an evidence build | Source |
|---|---|---|
| Capture | gesture-authorised (ADR-0009): a toolbar click records a grant, ended by navigation | ADR-0009; `apps/extension/host/background.ts` |
| Hooks | `PERCEIVE_ONCE`, `STREAM_CONSUME` and their drivers | OD-S; `diagnostic-hook-boundary-map.md` |
| T1 | UNADOPTED; bytes not integrity-checked. Loaded on the first perception call, and run on every pass that captures a frame. Its output is fused and can relabel the `source` of existing DOM elements, but adds no element to the handoff | `apps/extension/host/offscreen/main.ts` |
| TR-01 | hash-verified. Runs on a frame copy in a worker, and masks visual regions **in the local frame only**. No code reads the sanitized frame outside evidence probes | `apps/extension/host-lib/perception-realm.ts` |
| Harnesses | the two gesture harnesses and six evidence harnesses | OD-U, OD-V |

**Resolved by the M23.3 source trace** (`phase-1-data-flow-and-components.md`, `t1-tr01-status-reconciliation.md`):
- **Vision-only elements:** they **cannot** enter the DOM-based handoff.
- **The egress path:** the reasoner request goes through `sendVerified` (`packages/egress/src/guard.ts`), **not** the `qg04.ts` frame attestation, which has no product caller.

**Still UNKNOWN:**
- **U-1:** a complete proof that no extension message carries frame bytes. A normal task captures no frame to carry, but this is not proven over every message.
- **U-2 to U-4 concern evidence builds now:**
- **U-2:** wider indirect influence of T1.
- **U-3:** the effect of T1 latency or failure on outcomes.
- **U-4:** whether a machine's packaged T1 bytes equal `ba6d9e93…` (no integrity check exists).

## 3. Proposed Phase 1 acceptance requirements

**PROPOSED — AWAITING OWNER APPROVAL.** The criteria are those of `core-product-acceptance-PROPOSED.md` §5, which now **is** the Phase 1 acceptance scope.

| Area | Criteria |
|---|---|
| Chrome extension | BRW-01, BRW-04, BRW-05 |
| Local loopback reasoner | RSN-01 to RSN-03, RSN-06 |
| Structure-only communication | RSN-04, SEC-01, SEC-03 (QG-04-S), SEC-04 |
| Privacy and sanitisation | PRV-01, PRV-02, PRV-04, PRV-06, PRV-07; PRV-03 per OD-F |
| Consent | PRV-05 |
| Grounding | FUN-03, ACT-02, ACT-03 |
| Click execution and verification | ACT-01, ACT-04 to ACT-07 |
| Security and permissions | SEC-01 to SEC-08 |
| Reliability | REL-01 to REL-03, FUN-06 |
| Cross-machine reproducibility | XM-01, XM-02 (classification per OD-B) |
| Independent human validation | HUM-01 (classification per OD-C) |
| CI and release governance | CI-01 to CI-03, GOV-01 to GOV-07 |

**None of the 51 proposed-mandatory classifications is approved by the phased decision, or by M23.15's rewording.** `BRW-04` now means DOM-only browser tasks (`core-product-acceptance-PROPOSED.md` §5.14).

## 4. Future capabilities (out of Phase 1)

See `phase-2-future-capability-register.md`. They are not required for the proposed Phase 1 baseline, subject to the owner's phased direction.

## 5. Unresolved decisions

These decisions are not resolved by selecting the phased direction:
- OD-A: Chrome only, or Chrome and Firefox for Phase 1;
- OD-B: cross-machine;
- OD-C: independent human validation;
- OD-D: real-site scope;
- OD-E: QG-04-S, F-M13-1, B-02, the ADR-0006 tier, and the ADR-0005, 0007 and 0008 values;
- OD-F: visual-only PII;
- OD-H: performance;
- OD-J: hosted CI and branch publication;
- OD-K: the REASON-stage record;
- OD-L: register hygiene;
- OD-M: Phase 2 proposal and timing.

All are in `owner-decisions.md`.

## 6. Prohibited

Phase 1 adds nothing, and permits none of the following:
- a new endpoint, origin, permission, action type, or frame or data path;
- any change to CSP, redaction, sanitisation, the fail-closed behaviour, the five-turn cap, consent, grounding or postconditions;
- frame egress;
- detector evaluation (B-07 BLOCKED; FR-01 DEFERRED — NOT AUTHORISED FOR EXECUTION).
