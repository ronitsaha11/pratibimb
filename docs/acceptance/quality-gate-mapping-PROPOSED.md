# Quality-gate mapping — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.1, 2026-11-03).**
> - **What it does:** maps each quality gate (`agentos/gates/README.md`) onto the architecture as shipped, and proposes how each gate's scope could be stated for core-product acceptance.
> - **What it does not do:**
>   - **edit `agentos/gates/README.md`**: the gate file is unchanged;
>   - **sign any gate**, or mark any checkbox;
>   - **change any ADR or security invariant**, or weaken any criterion.
> - **What happens on approval:** the gate texts would be amended in a separate, owner-authorised change, together with any ADR the owner requires.
> - **Updated in M23.2** for the owner's phased direction. The mappings below are for **Phase 1**, the current structure-only product. Phase 2 capabilities stay outside Phase 1 gates unless separately approved. **M23.2 signs no gate and alters no gate definition.**

## 1. Why a mapping is needed (FACT)

- **The gate file predates the architecture as built.** It was written for the dossier's architecture: frame and manifest to a server VLM, with a server tripwire.
- **The decisions that changed the product:**
  - ADR-0012 (structure-only handoff; frame egress blocked);
  - ADR-0013 (one loopback reasoner endpoint);
  - ADR-0014 (panel consent).
- **The gate file states:** "A gate is a binary checkpoint … There is no conditional pass on a security gate."
- **This proposal keeps that rule.** It proposes **what each gate is about** for the shipped product. It does not propose a partial pass.

## 2. Gate-by-gate

### QG-01 — Capability spike complete

| | |
|---|---|
| **Gate text (summary)** | Every spike records its question, environment and raw output, gives a FACT or "still UNKNOWN" verdict, and is quarantined; an ADR exists if the spike invalidated a dossier assumption |
| **Current status (FACT)** | no pass recorded in the gate file. Individual spikes carry these elements in their records (for example W1-S05-rate, W1-S02a) |
| **Applies to the shipped product?** | yes, as a **record-hygiene gate** over the spikes the product depends on |
| **Proposed scope** | **PROPOSED — AWAITING OWNER APPROVAL:** QG-01 is evaluated over an owner-approved list of the spikes the core product depends on (capture limits, Firefox and Linux runtime, Invariant-E observation, CSP tokens, WASM provenance), not over every spike ever run. The item "an ADR exists if the result invalidates a dossier assumption" applies to the local-reasoner substitution (G-1) |
| **Proposed evidence** | a checklist record under `artifacts/gates/QG-01/` listing each dependency spike and its seven items |
| **Owner decision** | the spike list; whether G-1 needs an ADR (OD-K) |

### QG-02 — Coordinate contract

| | |
|---|---|
| **Current status (FACT)** | criteria 1–6 PASS on Chromium and Firefox (6/6 each; the Firefox cell from hosted CI run `34485366327`). **Criterion 7 CONDITIONAL:** the executor half was to be "re-verified when it lands", and the executor has since landed (MVP-1) |
| **Applies?** | yes, unchanged |
| **Proposed scope** | **PROPOSED — AWAITING OWNER APPROVAL:** unchanged. Criterion 7 is discharged by an executor-half test: an off-screen target is never actioned without a preceding scroll (ACT-06). Re-run criteria 1–6 in hosted CI on the release-candidate commit |
| **Proposed evidence** | an ACT-06 test record; a hosted CI run on the candidate |
| **Owner decision** | none beyond approval |

### QG-03 — Model feasibility

| | |
|---|---|
| **Current status (FACT)** | **CONDITIONAL; QG-03a OPEN** (per `agentos/state.md` and the model registry). The text-region WASM correctness input was decided (Option A, approved 2026-09-25) |
| **Applies?** | yes, to **each model in the product path**:<br>• **TR-01**, in the extension (all four browser cells apply);<br>• **the local reasoner** (`Qwen2.5-0.5B-Instruct` Q4_K_M under llama.cpp, *outside* the extension) |
| **Gap (INFERENCE)** | QG-03's four cells (Chrome and Firefox, WebGPU and WASM) describe **in-browser** inference. The reasoner runs in a native process, so those cells do not describe it. QG-03 has no stated form for a native loopback model |
| **Phase 1 need (M23.2)** | The acceptance model must define how a **native loopback language reasoner** is assessed: its cells, correctness reference and benchmark. **No model certification or performance threshold is proposed here** (OD-H, RSN-06). Phase 2 VLM candidates are not assessed under Phase 1 |
| **Proposed scope** | **PROPOSED — AWAITING OWNER APPROVAL:**<br>(a) TR-01: QG-03 as written;<br>(b) the reasoner: pin, licence from the pinned revision, launcher hash verification, a benchmark artifact, and correctness against an owner-approved reference. **The thresholds for (b) are TBD** (OD-H, RSN-06);<br>(c) T1: out of scope (FR-01; unadopted) |
| **Proposed evidence** | the existing M8.2 TR-01 cells; a reasoner adoption record (registry `PINNED` → `ADOPTED` only after the owner's bar) |
| **Owner decision** | the reasoner adoption bar (RSN-06); the registry byte-count discrepancy (G-5) |

### QG-04 — Egress invariant (structure-only proposal)

**Current status (FACT):**
- **UNSIGNED.**
- **Gate text:** "No code may make a network call until this gate passes".
- **Practice:** the shipped product makes structure-only calls to the loopback reasoner (G-2).
- **The M12 matrix assessed the *frame* path:**
  - items 1, 3, 4, 5, 6, 7 and 10 MET;
  - item 2 BLOCKED (B1, F-M12-1);
  - items 8, 9 and 11 PARTIAL (B2, B4);
  - row S MET ("no UI wiring yet").
- **Since then:**
  - **ADR-0013 (CSP v2)** denies every fetch directive not named, by `default-src 'none'`, and pins `connect-src` to the reasoner's exact path.
  - **F-M13-1** (top-level navigation, which CSP cannot close) stays **OPEN**.
  - **B-02** stays **OPEN**: Playwright does not observe the offscreen document; raw CDP does.

**Proposed approach.** **PROPOSED — AWAITING OWNER APPROVAL.** QG-04 would be split into two sub-gates with separate signatures:
- **QG-04-S**, the **structure-only egress gate**, is the proposed **Phase 1** security gate for the shipped product.
- **QG-04-F**, the **frame egress gate**, keeps the current items unchanged. It belongs to any future frame pathway (Phase 2, P2-02) and stays **BLOCKED**.
- **Both need approval:** each requires its own approvals and evidence. **M23.2 signs neither.**
- **Frame egress stays blocked:** QG-04-F stays unsigned and production frame egress stays impossible (three locks, ADR-0012 §16) until its own items pass.

Nothing in QG-04-F is relaxed. Only the gate's scope is stated.

**Proposed QG-04-S items** (each binary; **none signed here**):

| # | Proposed item | Derived from | Current evidence (FACT) | Missing |
|---|---|---|---|---|
| S1 | The network gate fails the build on any network primitive outside the egress authority and the exact-count allowlist | QG-04 item 1 | M12: `networkBoundary.test.ts`, mutation-checked (MET for the frame path) | re-run on the candidate commit |
| S2 | The product CSP is v2: `connect-src` is exactly `http://127.0.0.1:8995/v1/chat/completions`, and every other fetch directive is denied | QG-04 item 2, as amended by ADR-0013 | M13 machine-verified CSP checks | re-check on the candidate commit |
| S3 | **F-M13-1 has an owner decision:** a mitigation (DNR, in-realm neutralisation), or an explicit acceptance of the residual | ADR-0013 §9 | finding only | **owner decision (OD-E)** |
| S4 | The structure-only body is built once, attested by hash, and sent only if the hash matches; nothing is mutated in between | QG-04 items 3–5 | M12 `qg04.test.ts` (structure-only body supported) | confirmation that the **reasoner** path uses the attested sender. UNKNOWN in this proposal; to be established |
| S5 | The structure-only body carries **no image byte and no value**: references only; value-shaped text is refused at the front (422) | ADR-0012 §8; INV-07; M20 front | M12 phase B (0 image bytes); M20 front refusals; LOOP-2 request-body inspection | a product-build body inspection on the candidate |
| S6 | Interception: **zero outbound requests** for every fail-closed row, and exactly one permitted request to the reasoner endpoint per turn | QG-04 item 6 | M12 suite (frame path) | a structure-only and reasoner-path run. **B-02:** the vehicle (raw CDP on the offscreen document and worker) needs the owner's ADR decision |
| S7 | Value-aware residual check over the structure-only body; it never logs the value | QG-04 item 9 | structure-only check exists (M12, PARTIAL for frames) | a statement that the structure-only scope is the scope to be checked |
| S8 | The vault is memory-only and destroyed on session end, tab change, and before an origin change commits | QG-04 item 10 | MET (M12) | a negative test on the product build (PRV-06) |
| S9 | No component logs secret plaintext: verifier, ledger, **front and launcher** (replacing the "server tripwire", which does not exist) | QG-04 item 11 | M20: the front logs no bodies | a product-wide log audit (PRV-07) |
| S10 | The user is told when an image is withheld (row S) | M12 row S | decision and body MET; **"no UI wiring yet" as of M12** | UI evidence on the product build |
| S11 | The local model server refuses requests without the per-launch key; `/slots` is off; the launcher fails closed | M20 (B1 review) | M20 keyed-server checks (W1) | re-run on each accepted machine |

**Items not carried into QG-04-S, with reasons:**

| Item | Reason |
|---|---|
| 7 (decoded WebP bytes) and 8 (second pass) | frame-specific; they stay in QG-04-F |
| The "server tripwire" part of item 11 | the server does not exist; S9 names the components that do |

**Owner decisions:**
- adopt the split, or keep QG-04 whole;
- S3 (F-M13-1);
- the B-02 vehicle (S6);
- whether the gate text "No code may make a network call until this gate passes" is amended to name QG-04-S. The gate text is unchanged by this proposal (G-2).

### QG-05 — Evaluation harness

| | |
|---|---|
| **Current status (FACT)** | **PARTIAL:** one of six metrics, the visual-context evaluator for T1, which is itself unadopted (FR-01). The M20 benchmark exists for W1 latency and working set |
| **Applies?** | yes. Note that the **visual-context** metric (element mAP) depends on a UI detector the product does not ship |
| **Proposed scope** | **PROPOSED — AWAITING OWNER APPROVAL:** for the Phase 1 core product, QG-05 covers:<br>• PII detection (Rule 2; recall ≥ 0.98 is the contract's target);<br>• redaction metrics, with an evidence source replacing the server tripwire (OD-F);<br>• client resources;<br>• latency (p50/p95, cold and warm, per stage);<br>• task success after privacy (the two-row ablation, FUN-05).<br>Visual context on the DOM-only product is measured as **grounding accuracy**, not detector mAP. The detector mAP slice moves to FR-01, which stays deferred and not authorised. The phased direction does **not** reactivate detector research. Frame-based visual-context scoring is Phase 2 (P2-05) |
| **Thresholds** | only PII recall ≥ 0.98 is authoritative (benchmark contract Rule 2). **All other thresholds TBD** (OD-H); Rule 5 budgets are projected, not targets |
| **Owner decision** | the metric set; the corpus (OD-D); the redaction evidence source (OD-F); thresholds (OD-H) |

### QG-06 — Release (proposed Phase 1 release checklist: `release-readiness-checklist-PROPOSED.md`)

| | |
|---|---|
| **Gate text** | QG-01–QG-05 pass on the candidate, plus:<br>• Chrome MV3 and Firefox MV3 from one codebase;<br>• a WASM-only build, benchmarked;<br>• Firefox tested on Linux with the backend indicator;<br>• four Invariant-E mechanisms active in CI;<br>• pins and a reproducibility manifest;<br>• no demonstration that depends on a value surviving an origin change;<br>• four demonstration sequences rehearsed ten times;<br>• the travel checklist |
| **Current status (FACT)** | not passed; nothing recorded |
| **Mismatches (FACT)** | **The demonstration sequences** (`agentos/workflows/release.md`):<br>• sequence 1 includes a scanned PAN card whose text exists in no DOM node (visual-only PII);<br>• sequence 3 ends in a fallback to structure-only mode, which is now the normal mode;<br>• sequence 4 is an offline mode with **SmolVLM**, a constitution §10 v1.1 item.<br>**Release step 4, Invariant-E mechanisms:** mechanism 3 restricts `connect-src` "to the configured server origin"; no server origin is configured (B1).<br>**Release step 1** pins Docker images, and the travel checklist names "the 4B model"; neither exists in the shipped product.<br>**Release step 8** benchmarks both backends in both browsers |
| **Proposed scope** | **PROPOSED — AWAITING OWNER APPROVAL:**<br>(a) the Firefox items follow OD-A and OD-G;<br>(b) the demonstration sequences are redefined for the shipped architecture (GOV-05). The PAN-card element is conditional on OD-F. Sequence 3's fallback becomes "frame withheld, user told" (S10). Sequence 4 is the owner's call: the shipped reasoner is already loopback-only, so whether a separate offline sequence is still meaningful is an owner judgement (INFERENCE);<br>(c) the four Invariant-E mechanisms map to S1 (lint), S6 (interception), S2 (CSP v2, the reasoner endpoint) and S4 (payload hash);<br>(d) "rehearsed ten times" is kept for demonstration sequences, while the bounded task-set repetition count (REL-01) is a separate owner decision |
| **Owner decision** | OD-A, OD-G, GOV-05, REL-01 N |

## 3. Proposed gate order for Phase 1 acceptance (INFERENCE)

```
GOV-01 (this definition approved)
  → GOV-03 (gate scopes approved) → G-1 ADR (REASON stage record)
  → QG-04-S  → QG-02 criterion 7 → QG-03 (TR-01 + reasoner)
  → QG-05 (core metric set) → QG-01 (dependency spikes) → QG-06
```

This order follows from the dependencies in `core-product-acceptance-PROPOSED.md` §5. It is a proposal, not a schedule.
