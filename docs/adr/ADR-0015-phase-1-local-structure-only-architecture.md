---
id: ADR-0015
title: "Phase 1 architecture: local perception, structure-only handoff, local loopback reasoner; vision-language reasoning deferred to Phase 2"
version: 1.0
status: PROPOSED — AWAITING OWNER APPROVAL (M23.3, 2026-11-03). Not approved, not adopted. Records the owner's phased direction (M23.2) and the source-traced Phase 1 architecture; it authorises no implementation, no Phase 2 work and no frame egress
owner: pratibimb-architect
proposed_by: pratibimb-architect (M23.3 documentation milestone)
created: 2026-11-03
modified: 2026-11-03
amends: none. ADR-0001 to ADR-0014 are unchanged and keep their own status. The constitution, the dossier and the frozen specifications are not edited; proposed wording is in docs/acceptance/proposed-amendment-language-PROPOSED.md
related_adr: ["ADR-0003", "ADR-0006", "ADR-0009", "ADR-0010", "ADR-0012", "ADR-0013", "ADR-0014"]
related_invariants: ["INV-01..INV-25 (unchanged)", "INV-11", "INV-12", "INV-21", "INV-22", "INV-23"]
related_gates: ["QG-03", "QG-04 (QG-04-S / QG-04-F proposal)", "QG-05", "QG-06"]
related_blockers: ["B-02", "B-03", "B-07", "ADR-0012 §13 B1, B2, B4, B5, B6"]
evidence: artifacts/experiments/M23.3-phase-1-architecture-reconciliation/; docs/acceptance/phase-1-data-flow-and-components.md; docs/acceptance/t1-tr01-status-reconciliation.md
---

# ADR-0015 — Phase 1 architecture: local, loopback, structure-only

> **STATUS: PROPOSED — AWAITING OWNER APPROVAL.**
> - **What it records:**
>   - the owner's phased direction (M23.2, 2026-11-03);
>   - the Phase 1 architecture, as the source implements it at `3e6a2e6`.
> - **What it does not do:**
>   - it is not approved, and it adopts no model;
>   - it supersedes no ADR, and amends no constitution text;
>   - it signs no gate and lifts no blocker;
>   - it authorises no Phase 2 work, no frame egress, and no new endpoint, permission, action type or data path.

## 1. Context

**The frozen constitution and the governing dossier describe a different architecture:**
- a sanitized WebP frame and a manifest sent to a server VLM (constitution §1 stage 5; §2);
- with a server tripwire;
- with a UI detector and YuNet in v1 scope (§10).

**The product evolved, through owner-approved ADRs, into a different shape:**
- gesture capture (ADR-0009);
- a structural change signal (ADR-0010);
- production frame egress blocked, with a structure-only handoff (ADR-0012, partially approved);
- one loopback reasoner endpoint (ADR-0013);
- panel consent (ADR-0014);
- a local text reasoner (LOOP-2, M20).

**No ADR records the resulting architecture as a whole.** `AGENTS.md` §4.1 requires one.

**The owner's direction (M23.2).** On 2026-11-03 the owner selected a **phased architecture**:
- **Phase 1:** the current local, loopback-only, structure-based reasoning architecture.
- **Phase 2:** future vision-language and frame-based reasoning, subject to separate architecture, security, legal and owner approvals.

**A correction from M23.2 and M23.3.** M23.2 and the M23.3 source trace also corrected an earlier record: the original T1 UI head is **loaded and run** by the product perception pass.

## 2. Problem statement

The repository needs one authoritative statement of three things:
- what Phase 1 is;
- where it departs from the frozen documents;
- what stays deferred or blocked.

It must do this without silently rewriting frozen text, and without upgrading any component's governance status.

## 3. Proposed decision

### 3.1 Phase 1 components (as implemented)

**Labels:** "Implemented" means the code exists and is wired, per source. "Status" is the governance status. Neither is an acceptance.

| Component | Implementation | Status |
|---|---|---|
| Client | Chrome MV3 extension (WXT). Permissions: `offscreen`, `sidePanel`, `activeTab`, `tabCapture`. Host permission `http://127.0.0.1/*` | **Firefox is not run** (OD-A, OD-G) |
| Capture | gesture-authorised tab capture into the offscreen document (ADR-0009) | approved ADR |
| T1 UI head | loaded (ORT WASM) and run on **every** perception pass; its output fused with the DOM graph | **UNADOPTED. Bytes not integrity-checked** (§3.4). Performance is FR-01, deferred and not authorised |
| TR-01 | text-region detector on a copy of the full frame in a dedicated worker. `UNREAD_REGION` masks filled in place into the **local** frame | hash-verified at build and run time; **visual-only PII protection NOT VERIFIED** (M9) |
| Sanitisation | values classified in the page realm, then replaced by typed references; a memory-only vault | existing invariants |
| Handoff | the verified handoff (DOM elements and references). The reasoner receives a **planning view**: goal, textbox `{id,name,empty}`, button `{id,name,enabled}`, references `{token,class,hint}` | ADR-0012 §8 (structure-only) |
| Egress | `sendVerified` (`packages/egress/src/guard.ts`): verified handoff, loopback destination, declared tokens only, value-aware residual scan, digest, record, then send. One serialised string | ADR-0013 §3 |
| Reasoner | launcher, then a front on `127.0.0.1:8995` (CSP-pinned path), then a keyed llama.cpp `b10956` model server on `127.0.0.1:8977`, running `Qwen2.5-0.5B-Instruct` Q4_K_M. Deterministic planner fallback | `PINNED`, **not `ADOPTED`**; correctness PROVISIONAL |
| Execution | the plan is validated (`click` the only executable action; a declared postcondition); REFRESH and a hit test; a human grant or panel consent for every value restoration; a single-use permit; one DOM click; VERIFY RESULT; at most 5 turns | ADR-0005 to 0008 PROPOSED (their values are still pending) |

### 3.2 The boundary between local visual processing and the reasoner

- **Frames are captured and processed locally in Phase 1.** Production frame **egress** is impossible. The three locks of ADR-0012 §16 still hold.
- **Pixels exist only in two places:** the offscreen document, and a copy in the TR-01 worker.
- **No product code reads the sanitized frame or its WebP encoding.** Their only readers sit behind an evidence-build alias.
- **The only data sent off the extension** is the JSON planning view, through `sendVerified`, to the CSP v2 endpoint.
- **The frame-path modules have no product caller.** `qg04.ts` (attestation; a production sender with no transport) and `frame.ts` (a test-only loopback sender) are called only from evidence builds.

### 3.3 T1's role, stated exactly

**T1 output can reach these places:**
- the `source` field of DOM elements already in the handoff (`dom` → `dom+vision`);
- `capability.tiers_fired` and `capability.backend`;
- `capture.scale_to_css`;
- the run report;
- pass timing.

**T1 output cannot reach these places:**
- **it cannot add an element to the handoff;**
- the inspected reasoner request contains none of the metadata above;
- no traced consumer lets it change click eligibility, plan validation, REFRESH or result verification.

**Unknowns:** wider indirect influence is **UNKNOWN** (U-2, U-3).

### 3.4 Integrity gap (recorded, not fixed)

T1's bytes are checked neither at build time nor at runtime. TR-01's are checked at both. ADR-0003 (packaging and runtime identity) is PROPOSED, not implemented.

- **This ADR does not decide the remedy.** Owner decisions OD-O and OD-P cover it.
- **Any remedy is source work.** It needs its own authorisation.

### 3.5 Phase 2 (direction only)

**What is listed for Phase 2,** all `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` (`docs/acceptance/phase-2-future-capability-register.md`, P2-01 to P2-07):
- vision-language reasoning;
- frame-based visual context;
- a joint visual and structural model;
- server or remote inference;
- visual-context scoring;
- the server tripwire;
- an offline local VLM.

**What Phase 2 does not presume or permit:**
- **The old design is not presumed:** the dossier's FastAPI + vLLM + WebP design is not presumed reusable.
- **Frame egress needs QG-04-F:** any frame pathway needs QG-04-F, a separate security review, and the legal and owner approvals.
- **Detector research stays separate:** it stays under FR-01, blocked by B-07.

## 4. Compatibility with existing ADRs

| ADR | Relationship |
|---|---|
| ADR-0001 / ADR-0013 (approved, accepted) | consistent. ADR-0013 §3 already names `localModelReasoner` → `sendVerified` and the exact endpoint. **Unchanged** |
| ADR-0009, ADR-0010, ADR-0014 (approved, accepted) | consistent; Phase 1 relies on them. **Unchanged** |
| ADR-0012 (partially approved) | consistent with §16 (frame egress impossible). §7–§8 describe the **production** handoff to a configured origin and its structure-only fallback, not the Phase 1 loopback planning-view request. §7's "no fetch in … the offscreen document" does not address the packaged T1 asset read, which the M12 network gate allowlists. **ADR-0012 is not edited**; these are recorded here (RC-11) |
| ADR-0003 (proposed) | the T1 integrity gap falls in its subject. It stays PROPOSED |
| ADR-0005 to ADR-0008, ADR-0011 (proposed) | Phase 1 uses their implementations. Their pending values and tiers remain **owner decisions**, not settled here |
| ADR-0002, ADR-0004 | unaffected |

## 5. Security and privacy invariants

**INV-01 to INV-25 are unchanged.** Phase 1 applicability:
- **INV-11** (server-side Pydantic) applies to any server. Phase 1 has none, and the client validates under INV-12.
- **INV-21** applies to every Phase 1 component that exists: the verifier, the ledger, the front and the launcher.

This is a statement of applicability, **not a weakening**.

**Fail-closed behaviour holds** (INV-22, INV-23).

**Unchanged:** the five-turn cap, click-only execution, consent, grounding, the postcondition checks, CSP and permissions.

## 6. Alternatives considered

1. **Amend the constitution directly.** Rejected: frozen text may not be changed without an owner-approved ADR. Proposed wording is kept separate (A-1 to A-9).
2. **Treat M23.2's direction as sufficient.** Rejected: M23.2 is a direction record, not an ADR (`AGENTS.md` §4.1).
3. **Describe T1 as absent ("DOM-only floor").** Rejected: the source shows it loaded, run and fused.
4. **Adopt T1 because it runs.** Rejected: running is not adoption, and its performance is unvalidated (FR-01).

## 7. Consequences

- **Frozen and governing documents need owner-approved amendments**, using the proposed language A-1 to A-9:
  - constitution §1, §2 and §10;
  - `AGENTS.md` §2;
  - the gates and release workflow;
  - the benchmark contract annex;
  - the invariant applicability note;
  - the registry note.
- **The brief is not edited.** A submission-facing mapping (A-5) is needed instead.
- **The M23.1 acceptance proposal** describes Phase 1 accordingly, and remains PROPOSED.
- **Every product measurement depends on an unverified T1 file** until OD-O is decided (U-4).

## 8. Open decisions (required approvals)

These are listed in `docs/acceptance/owner-decisions.md`:
- approval of this ADR (OD-N);
- the T1 integrity and reproducibility policy (OD-O);
- whether T1 stays active before formal adoption (OD-P);
- T1's exact downstream influence (OD-Q);
- TR-01 redaction acceptance (OD-F);
- the Phase 1 acceptance definition (GOV-01);
- the QG-04-S and QG-04-F boundaries (OD-E1);
- the constitution, brief and `AGENTS.md` amendments (OD-K);
- the Phase 2 proposal and timing (OD-M);
- the existing security decisions: F-M13-1, B-02, and the ADR-0005 to 0008 values (OD-E).

## 9. Rollback

This ADR changes no code or configuration. Rejecting it leaves the repository exactly as it is now, with RC-01 to RC-12 unresolved.
