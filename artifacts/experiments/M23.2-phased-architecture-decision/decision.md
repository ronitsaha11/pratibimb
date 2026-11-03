# M23.2 — decision record

**OWNER DIRECTION RECORDED: PHASED ARCHITECTURE.**

The project owner selected this direction in the conversation dated 2026-11-03. It is a **roadmap direction**:
- it is **not** an ADR;
- it is **not** a constitution amendment;
- it does **not** approve the M23.1 acceptance proposal;
- it does **not** authorise any Phase 2 work, frame egress or new data path.

## 1. The decision

| Item | Status | Detail |
|---|---|---|
| Phased architecture direction | **RESOLVED (owner, 2026-11-03)** | Phase 1 then Phase 2, as below |
| Phase 1 target architecture | **RESOLVED (owner, 2026-11-03)**: the *intended* initial architecture. **Not** a claim that it has passed acceptance | `docs/acceptance/phase-1-architecture-scope.md` |
| Original VLM and frame-based functionality | **RESOLVED (owner, 2026-11-03): deferred to Phase 2.** Phase 2 is **NOT AUTHORISED** for implementation or execution | `docs/acceptance/phase-2-future-capability-register.md` |

### Phase 1 — the current local structure-only product (intended architecture)

Every element below is in the shipped product today:
- a Chrome MV3 browser extension;
- a local loopback reasoning service: launcher, front on `127.0.0.1:8995`, keyed model server;
- an open-weight local language model: `Qwen2.5-0.5B-Instruct` Q4_K_M under llama.cpp `b10956`. Its registry status is **`PINNED`, not `ADOPTED`**;
- a structure-only JSON handoff (ADR-0012 §8);
- **no production browser-frame egress** (three locks, ADR-0012 §16);
- the existing sanitisation, privacy and consent controls (ADR-0014);
- grounding and postcondition verification;
- **click** as the only executable browser action;
- the five-turn execution cap (`MAX_TASK_TURNS = 5`);
- the existing CSP v2, its single endpoint, and the current permission restrictions (ADR-0013).

**Evidence limits that still apply (from M23.0 and M23.1):**
- one machine (W1), Chrome only;
- synthetic loopback pages only;
- developer- or owner-operated runs only;
- no Firefox run, no cross-machine run, no independent operator, no real site;
- the benchmark contract's privacy metrics have not been produced;
- visual-only PII protection is NOT VERIFIED (M9);
- face detection is not in the product path (INFERENCE, M23.1);
- QG-04 is UNSIGNED.

### Phase 2 — future vision-language capabilities (not authorised)

Possible future capabilities:
- vision-language reasoning;
- browser-frame-based visual context;
- a model architecture suited to visual and structural reasoning;
- the brief's original vision-related requirements;
- whatever server or local inference architecture those need.

**What Phase 2 does not presume:** the dossier's FastAPI + vLLM + WebP design is **not** presumed to be reused unchanged. Its suitability belongs to a separately approved Phase 2 architecture proposal.

## 2. Four vision-related components, kept distinct

| Component | What it is | Status | It is not |
|---|---|---|---|
| **TR-01** (`PP-OCRv4_mobile_det`) | a local **text-region detector**, used for **visual redaction** (`UNREAD_REGION` masking) in the product perception pass | in the product path; product visual-only protection **NOT VERIFIED** (M9) | **not a VLM**; it reasons about nothing |
| **T1 / T1-v2** | UI-element detector research. **FACT (source read, M23.2):** the original T1 head (`t1-ui-head.onnx`) is loaded and run in the product perception pass before TR-01 | **UNADOPTED.** Clicks come only from DOM elements; a vision-only detection never becomes a target (M21). Detector performance is **deferred under FR-01**, not authorised. T1-v2 (the M22 epoch-39 checkpoint) is not in the product | **not an adopted product detector** |
| **Future VLM** | a vision-language reasoning capability | **Phase 2, NOT AUTHORISED**; nothing exists | **not in the normal product path** |
| **Phase 1 local LLM** | the structure-only **text** reasoner | in the product; `PINNED`; correctness PROVISIONAL | **not a VLM**; it never receives pixels or values |

**UNKNOWN:** whether vision-only fused elements from T1 appear in the structure-only handoff to the reasoner. M23.2 does not establish it.

**Gaps that stay open:** the visual-only PII gap (OD-F) and face-detection validation are unresolved.

## 3. Authority boundaries

- **ADRs:**
  - **Accepted and approved ADRs stay authoritative:** 0001, 0002, 0009, 0010, 0013 and 0014; ADR-0012 stays partially approved.
  - **Proposed ADRs stay proposed:** 0003, 0004, 0005, 0006, 0007, 0008 and 0011.
  - **None is edited.**
- **Frozen texts:** the constitution, the dossier and the frozen specifications are **not edited**. Every conflict is listed in §4.
- **Security:** the security invariants INV-01 to INV-25 are **unchanged**.
- **Blockers:** B-02, B-03, B-06 and B-07 are **unchanged**.
- **Gates:** no gate definition is altered, and no gate is signed.
- **Nothing new is authorised:** no endpoint, permission, action type or data-transfer path.

## 4. Conflicts requiring formal reconciliation

Each item is a **future owner-approved governance action**; none is performed here.

| ID | Document | Conflict (FACT) | Reconciliation needed |
|---|---|---|---|
| RC-01 | `docs/architecture/constitution.md` §1 (frozen) | stage 5 is "REASON — server VLM"; in Phase 1 it is a local loopback text LLM | an ADR recording the Phase 1 REASON stage, or an owner-approved constitution amendment (OD-K1) |
| RC-02 | constitution §2 (frozen) | the wire carries "WebP frame + redaction manifest + user goal"; the server is FastAPI + Pydantic v2, vLLM + Qwen3-VL, with a PII tripwire. Phase 1 carries no frame, has no remote server and no tripwire. §2 also states "the egress guard is the only network caller in the extension". `packages/egress/src/guard.ts` says `packages/reasoner` contains no `fetch(`; INFERENCE: the reasoner call passes through the guard. Not established end to end here | the same ADR or amendment, stating the Phase 1 trust boundary |
| RC-03 | constitution §10 (frozen scope table) | v1 "ships" FastAPI, vLLM, Qwen3-VL-4B and the tripwire, plus a UI detector and YuNet. *Not building* lists "a local VLM in the normal path" | a Phase 1 scope statement now. When Phase 2 is proposed, a Phase 2 option with a local VLM would conflict with *Not building* and need an amendment |
| RC-04 | `AGENTS.md` §2 | describes the runtime as "… + server VLM + …" | an owner-approved wording update; not edited here |
| RC-05 | `docs/architecture/vision.md` (the brief) | Deliverable 1: "Chrome and Firefox", with a local vision model that "decides". Deliverable 3: "a server hosting an open-weight LLM/VLM". The rubric's visual context is measured on redacted frames | the brief is the problem statement and is **not rewritten**. A submission-facing statement of which deliverables Phase 1 meets, and which are Phase 2 (OD-K2) |
| RC-06 | `docs/dossier/` (governing) | the phased direction departs from the dossier's architecture; `AGENTS.md` §4.1 requires an ADR for any deviation | the ADR(s) under RC-01 to RC-03 |
| RC-07 | `agentos/gates/README.md`; `agentos/workflows/release.md` | QG-04 says "No code may make a network call until this gate passes". In the release workflow:<br>• step 4's CSP mechanism names "the configured server origin";<br>• step 1 pins Docker images;<br>• the four demonstration sequences assume a server, a scanned-image case and a SmolVLM offline mode;<br>• the travel checklist names "the 4B model" | owner-approved gate and workflow amendments (the QG-04-S / QG-04-F proposal; a Phase 1 release checklist) |
| RC-08 | `docs/testing/benchmark-contract.md` | Rule 2 measures visual context on clean and redacted frames, and redaction with the server tripwire. Rule 5's budget includes "Server reasoning (Qwen3-VL-4B)" | an owner-approved statement of the Phase 1 metric set and evidence sources (OD-F, OD-H) |
| RC-09 | `docs/security/security-invariants.md`; `docs/security/threat-model.md` | INV-11 validates server output with Pydantic v2 "before leaving the server", and INV-21 names "the tripwire". The threat model's adversaries A1 and A4 are a server and a VLM | **no invariant is changed.** A statement of how INV-11 and INV-21 apply in Phase 1 (loopback reasoner, client-side INV-12) is needed, with the owner's approval. Applicability must not become a weakening |
| RC-10 | `agentos/registry/model-registry.md`; `agentos/blockers.md`; ADR-0012 | the Server VLM (Qwen3-VL-4B and 8B) and Local VLM (SmolVLM) rows are `PINNED-UNVERIFIED`. B-03 (no vLLM host) is `BLOCKED`. ADR-0012 names structure-only the *fallback*; in Phase 1 it is the only mode | registry rows are Phase 2 **candidates, not commitments**. B-03's status is an owner decision (OD-L1). Whether ADR-0012's framing needs a note is an owner decision |

## 5. Decision statuses (not collapsed)

**Resolved by M23.2**

| ID | Item |
|---|---|
| P-1 | Phased architecture direction |
| P-2 | Phase 1 target architecture |
| P-3 | Original VLM and frame-based functionality deferred to Phase 2 |

**Still awaiting owner approval**

| Item | Register reference |
|---|---|
| M23.1 acceptance-definition approval | GOV-01 |
| Phase 1 mandatory and optional classification | GOV-01, the matrix |
| QG-04-S scope and sign-off | OD-E1, SEC-03 |
| Browser acceptance scope | OD-A, OD-G |
| Cross-machine requirements | OD-B |
| Independent human validation | OD-C |
| Real-site scope | OD-D |
| Remaining security decisions: F-M13-1, B-02, ADR-0006 tier, ADR-0005/0007/0008 values, other proposed ADRs | OD-E2 to OD-E8 |
| Visual-only PII | OD-F |
| Performance targets | OD-H |
| Hosted CI and branch publication | OD-J |
| Formal reconciliation RC-01 to RC-10 | OD-K, OD-L |
| Phase 2 architecture proposal and timing | OD-M |

**Blocked or not authorised**

| Item | Status |
|---|---|
| QG-04-F and production frame egress | **BLOCKED**: ADR-0012 §13 (B1, B2, B4, B5, B6 open); three locks |
| B-07 and FR-01 detector evaluation | **BLOCKED** (B-07); FR-01 **DEFERRED — NOT AUTHORISED FOR EXECUTION** |
| Any new visual-frame data-transfer pathway | **NOT AUTHORISED** |
| Phase 2 implementation or execution | **NOT AUTHORISED** |

## 6. Prohibited by this record (unchanged restrictions)

- **Frames:** enabling frame or network egress, or any new frame-processing pathway, without separate architecture and security review and the owner, legal and governance approvals.
- **Configuration:** changing CSP, permissions, endpoints or action types.
- **Safeguards:** changing redaction or sanitisation, or weakening fail-closed behaviour, the five-turn cap, click-only execution, consent, grounding or postcondition checks.
- **Detector work:** recreating, renaming, splitting or rerouting the M22 evaluation operation (B-07), or reading Phase 2 as permission for detector research.

## 7. Verification

`python scripts/verify-repo.py` is a documentation and governance check over the tracked and committable text files. It reads no dataset, model or TEST.
- **Result: exit 0; 0 failures, 0 warnings.**
- **`npm run verify` was not run:** its Python step (`test_training_v2.py`) runs the training loop on synthetic fixture frames, and M23.2 authorises no training.
