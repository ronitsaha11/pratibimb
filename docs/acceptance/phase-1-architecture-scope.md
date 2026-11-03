# Phase 1 architecture scope

> **Status:** the **direction** is owner-selected (M23.2, 2026-11-03). The **acceptance criteria** are **PROPOSED — AWAITING OWNER APPROVAL**.
> - **Not an ADR:** this is not an ADR or a constitution amendment. The conflicts it creates are listed in `artifacts/experiments/M23.2-phased-architecture-decision/decision.md` §4 (RC-01 to RC-10).
> - **Not a claim of acceptance:** it does not say that any Phase 1 capability has passed acceptance.

## 1. Owner-selected direction

Phase 1 is **the current local, loopback-only, structure-based reasoning architecture** (owner, 2026-11-03).

Vision-language and frame-based reasoning are Phase 2 (`phase-2-future-capability-register.md`). Phase 2 is **not authorised**.

## 2. Current implementation facts

| Element | As implemented (FACT) | Source |
|---|---|---|
| Browser | Chrome MV3 extension (WXT); run in Chrome for Testing 153 on W1. A `build:firefox` script exists; **the product has never been run in Firefox** | `apps/extension/`; M19, M20 |
| Capture | gesture-authorised; structural change signal | ADR-0009, ADR-0010 |
| Local perception | in the offscreen document, `ensurePerception` loads the packaged original **T1 UI head (UNADOPTED)**, then **TR-01** text regions for redaction. Clicks come only from DOM elements. No face detector is in the product path (INFERENCE) | `apps/extension/host/offscreen/main.ts`; `apps/extension/host-lib/perception-realm.ts`; M21; M23.1 |
| Sanitisation | values become typed references; memory-only vault; ledger; verifier | `packages/privacy`; INV-04 to INV-10 |
| Consent | just-in-time, one-time panel consent with a masked local preview | ADR-0014 |
| Handoff | structure-only JSON (references, no frame, no value) | ADR-0012 §8 |
| Frame egress | **impossible in production** (three locks) | ADR-0012 §16 |
| Reasoner | launcher (`npm run reasoner`) with pin verification; a front on `127.0.0.1:8995` that refuses foreign origins, hosts, paths, methods, non-JSON and value-shaped text; a keyed llama.cpp `b10956` model server on `127.0.0.1:8977`; `Qwen2.5-0.5B-Instruct` Q4_K_M. Registry **`PINNED`, not `ADOPTED`**; correctness PROVISIONAL; deterministic planner fallback | `scripts/reasoner/`; `packages/reasoner`; M20; model registry |
| Network | CSP v2: one endpoint, `http://127.0.0.1:8995/v1/chat/completions` | ADR-0013 |
| Plan and action | allowlist VALIDATE, REFRESH, human grant, single-use permit, RE-HYDRATE, **click only**, VERIFY RESULT | `packages/plan`, `packages/agent`; ADR-0005 to ADR-0008 (PROPOSED) |
| Loop | at most 5 turns; clarification; declared outcome | `packages/orchestrator/src/loop.ts`; M14, M17, M18 |

**Unknowns carried forward:**
- whether vision-only fused elements appear in the reasoner handoff (M23.2);
- whether the reasoner request passes through the attested egress sender end to end (QG-04-S item S4).

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

**None of the 51 proposed-mandatory classifications is approved by the phased decision.**

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
