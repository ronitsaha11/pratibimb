# Proposed amendment language — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.3, 2026-11-03).**
> - **Draft wording only.** None of it is applied, and no frozen or governing document has been edited.
> - **Additive, not destructive:** each amendment is drafted as an addition, an annotation or a scoped clarification. **No original requirement is deleted;** the original text stays visible, and its history is preserved.
> - **What applying one needs:** an owner approval, ADR-0015 or its own ADR, and a separate change.

## A-1 — Constitution §1 (RC-01)

Add beneath the stage diagram:

> **Phase 1 realisation (ADR-0015).** In Phase 1, stage 5 (REASON) is realised by a local loopback **text** language model that receives only a structure-only planning view derived from the verified handoff. No frame or value crosses. Stage 4 (VERIFY) gates that request through the egress guard. The stage order, and the rule that no stage may be removed, reordered or made conditional, are unchanged. The server VLM described for stage 5 is Phase 2 scope and is not authorised.

## A-2 — Constitution §2 (RC-02, RC-11)

Add a row group, keeping the existing table:

> **Phase 1 (ADR-0015).**
> - **User machine (trusted):** additionally a loopback reasoning service — launcher, a front on `127.0.0.1:8995`, a keyed model server — whose **output is untrusted** and validated by the client (INV-12).
> - **Wire (down):** a JSON planning view (goal, field and button structure, typed references). No frame and no value.
> - **Wire (up):** a placeholder plan.
> - **Server:** none in Phase 1. The server row above describes Phase 2 scope.

Clarify the last paragraph:

> The egress guard is the only module that sends data off the extension. Reading the extension's own packaged assets (`resolvePackagedAsset`) is not egress.

## A-3 — Constitution §10 (RC-03)

Add a column note, not a rewrite:

> **Phase 1 (ADR-0015).**
> - **What ships:** the Phase 1 product ships the local, loopback, structure-only architecture.
> - **The UI detector:** T1 runs in the perception pass, **unadopted**, and its outputs do not create click targets.
> - **Faces:** YuNet is not in the product path.
> - **The server:** the server column is Phase 2 scope.
> - **The local reasoner:** "A local VLM in the normal path" remains under *Not building*. The Phase 1 local reasoner is a text model; any Phase 2 local VLM needs its own amendment.

## A-4 — `AGENTS.md` §2 (RC-04)

Replace the runtime sentence with:

> The runtime is:
> - the browser extension;
> - local perception (an unadopted T1 UI head and the TR-01 text-region detector);
> - the privacy firewall;
> - a local loopback structure-only reasoner (Phase 1);
> - the local validator, re-hydration, and click execution.
>
> A server VLM is Phase 2 scope and not authorised (ADR-0015).

## A-5 — Submission-facing deliverable mapping (RC-05; the brief is not edited)

A separate statement, built from `traceability-matrix.md` §1.5:
- **Phase 1 meets** Deliverables 1 (Chrome; local vision models) and 2 (privacy filter) in part, 3 through a loopback-hosted open-weight LLM, and 4 on synthetic pages.
- **Phase 2 holds** the VLM and frame-based parts.
- **Still open:** Firefox and visual-only PII are Phase 1 decisions.

## A-6 — Gates and release workflow (RC-07)

- **QG-04:** replace "No code may make a network call until this gate passes" with:
  > "No code may send data off the extension until the applicable QG-04 sub-gate passes. QG-04-S governs the Phase 1 structure-only loopback request; QG-04-F governs any frame path and remains blocked."
  - This applies only if the owner approves the split.
- **Release step 4:** "manifest CSP `connect-src` restricted to the configured endpoint (Phase 1: the reasoner path, ADR-0013)".
- **Phase 1 demonstration sequences:** replace the server, scanned-card and SmolVLM elements per GOV-05. Keep the originals as Phase 2 sequences.

## A-7 — Benchmark contract annex (RC-08)

> **Phase 1 annex.**
> - **Visual context:** frame-based visual-context scoring is Phase 2 (P2-05).
> - **Redaction metrics:** evidence comes from the client verifier and the value-aware scan. There is no server tripwire in Phase 1.
> - **Rule 5:** the budget's server row does not apply to Phase 1, and Rule 5 remains projected.
> - **Rule 2:** PII recall ≥ 0.98 is unchanged.

## A-8 — Invariant applicability note (RC-09; no invariant changed)

> **Phase 1 applicability (ADR-0015).**
> - **INV-11:** it applies to any server. In Phase 1 there is no server, and reasoner output is validated by the client under INV-12, with no best-effort parse.
> - **INV-21:** it applies to every Phase 1 component that exists — the verifier, the ledger, the front and the launcher. The tripwire clause applies when a tripwire exists.
>
> **No invariant is weakened by this note.**

## A-9 — Registry note (RC-10, RC-12)

> **Phase 1 registry note (ADR-0015).**
> - **The T1 UI head** (`ba6d9e93…`) is loaded and run by the product perception pass. It is **not adopted**, and its bytes are **not** integrity-checked at build or run time.
> - **The Server VLM and Local VLM rows** are Phase 2 candidates.
> - **The Phase 1 reasoner** is `PINNED`, not `ADOPTED`.
