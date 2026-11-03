# Phase 2 future capability register

> **Status: every entry is `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION`.**
> - **Direction:** the owner directed (M23.2, 2026-11-03) that vision-language and frame-based reasoning capabilities belong to Phase 2.
> - **Approvals needed:** each needs a separately approved Phase 2 architecture proposal, a security review, and the applicable legal and owner approvals before any implementation or execution.
> - **What this register is:** a record, not a plan. It authorises nothing, and it does not lift any blocker.

## Status vocabulary

| Status | Meaning |
|---|---|
| `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` | Recorded as Phase 2 scope; nothing may be built or run for it |
| `PROPOSED` | A Phase 2 architecture proposal exists and awaits the owner |
| `AUTHORISED` | The owner authorised specific work; the authorisation and its limits are cited |

## Entries

| ID | Capability | Origin (not rewritten) | Prerequisites (recorded; none met by this register) | Status |
|---|---|---|---|---|
| P2-01 | Vision-language reasoning | brief Deliverable 3 ("LLM/VLM"); constitution §1 stage 5 and §2 | a Phase 2 architecture proposal; model selection through `agentos/workflows/model-adoption.md` and QG-03. The model registry's VLM rows (Qwen3-VL-4B and 8B, SmolVLM) are `PINNED-UNVERIFIED` **candidates, not commitments** | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-02 | Browser-frame-based visual context (a sanitized frame reaching a reasoner) | brief ("if visual context must be sent to a server…"); constitution §2 wire | **QG-04-F** and ADR-0012 §13 B1, B2, B4, B5 and B6. Production frame egress stays **BLOCKED** (three locks) | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-03 | A model architecture for joint visual and structural reasoning | brief; dossier | P2-01; whether it runs locally or on a server is undecided. A local VLM in the normal path conflicts with constitution §10 *Not building* (RC-03) | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-04 | Server or remote inference infrastructure | constitution §2 and §10 (FastAPI, vLLM) | **The FastAPI + vLLM + WebP design is not presumed reusable unchanged**; its suitability is for the Phase 2 proposal. B-03 (no vLLM host) is relevant here | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-05 | Visual-context scoring as the rubric defines it (clean and redacted frames) | vision rubric (25%); benchmark contract Rule 2 | P2-02; a corpus (OD-D) | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-06 | Server-side PII tripwire | constitution §2; INV-21 | P2-04 | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-07 | Offline-mode local VLM sequence | constitution §10 v1.1; release sequence 4 | P2-01; constitution §10 conflict | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |
| P2-08 *(M23.6)* | Frame-based local perception in task runs: browser-frame capture, UI-element detection (T1), and TR-01 frame masking | brief Deliverables 1–2; constitution §10 | **excluded from normal Phase 1 tasks by OD-R (Option A).** T1 returns only under OD-O's prerequisites and a new decision. TR-01 is retained as a separate component, its use decided under OD-F. Any frame path that leaves the device needs QG-04-F | `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION` |

## Not in this register

| Item | Where it is held | Reason |
|---|---|---|
| **T1 / T1-v2 detector performance** | **FR-01** (`agentos/registry/future-research-register.md`), `DEFERRED — NOT AUTHORISED FOR EXECUTION`, blocked by **B-07** | Phase 2 does **not** reactivate detector research |
| **Visual-only PII protection** | Phase 1 owner decision OD-F | M9: NOT VERIFIED. It is a privacy gap in the shipped product, not only a Phase 2 feature; face detection is likewise unresolved |
| **Firefox** | Phase 1 owner decisions OD-A and OD-G | the brief names it for the client, whatever the reasoning architecture |
