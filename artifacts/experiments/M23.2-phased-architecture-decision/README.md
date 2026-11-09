---
id: M23.2-phased-architecture-decision
title: "M23.2 — owner decision: phased architecture (Phase 1 local structure-only; Phase 2 future vision-language)"
status: recorded — owner direction PHASED ARCHITECTURE; Phase 2 NOT AUTHORISED for implementation or execution; no ADR, constitution text, gate, invariant or blocker changed
date: 2026-11-03
label: FACT (the owner's decision as given; records, source and git metadata read); no new measurement
classification: ARCHITECTURE GOVERNANCE (documentation only) — no code, no execution, no model, no checkpoint, no data, no browser frame
workstation: 1
---

# M23.2 — the phased architecture decision

> **What it is:** a record of the owner's selected roadmap direction, and the reconciliation work it creates.
> **What it is not:**
> - an ADR, or an amendment of any ADR;
> - a constitution amendment;
> - an approval of the M23.1 acceptance proposal;
> - a gate signature;
> - a lifting of any blocker;
> - an authorisation of frame egress or of any Phase 2 work.

## Owner decision

**PHASED ARCHITECTURE**, selected by the project owner in the conversation dated **2026-11-03**, in response to the M23.1 proposal:
- **Phase 1:** the current local, loopback-only, structure-based reasoning architecture.
- **Phase 2:** future vision-language and browser-frame-based reasoning capabilities, subject to separate architecture, security, legal and owner approvals.

The decision gives the intended product roadmap direction. The full record, with what it does and does not change, is in `decision.md`. The scope documents are:
- `docs/acceptance/phase-1-architecture-scope.md`;
- `docs/acceptance/phase-2-future-capability-register.md`.

## Hypothesis

The owner's direction can be recorded without changing any ADR, frozen specification, gate, invariant or blocker. Every conflict between the direction and the frozen documents can be listed explicitly, for later formal reconciliation.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `ad50f67` before this milestone, 71 commits on `origin/main` `077f139`, no upstream, no PR. Untracked: the two M20 smoke records only (left untouched).
- **Inputs:** documentation, git metadata, and a read of product source (no execution).

## Expected result

- **The record:** the decision recorded, with its limits stated.
- **Conflicts:** each conflict with a frozen or governing document is named, with the document and the action it needs.
- **The M23.1 proposal:** split into Phase 1 acceptance scope and Phase 2 future scope, and still PROPOSED.
- **Decision statuses:** decisions separated into resolved, awaiting the owner, and blocked or not authorised.

## Actual result

1. The decision is recorded in `decision.md`. The M23.1 documents in `docs/acceptance/` are updated and keep their PROPOSED status.
2. **Ten reconciliation items (RC-01 to RC-10)** are listed in `decision.md` §4. None is resolved by this record.
3. **A correction to M23.1 (FACT, source read):**
   - **What M23.1 said:** "the product ships the DOM-only floor".
   - **What the product actually does:** the perception pass in the offscreen document (`apps/extension/host/offscreen/main.ts`, `ensurePerception`) loads the packaged original T1 UI head, `t1-ui-head.onnx`, and runs it before TR-01. This was established from source only; the model file was not read.
   - **What still holds:** T1 is **UNADOPTED**, and clicks come only from DOM elements. A vision-only detection never becomes a target (M21, `apps/extension/host-lib/perception-realm.ts`, `sourceBySelector`).
   - **UNKNOWN:** whether vision-only fused elements appear in the structure-only handoff to the reasoner. M23.2 does not establish it.
   - **Where it is corrected:** the M23.1 documents, now updated.

## Conclusion

- **Phase 1** is the owner-selected target architecture: the shipped local, loopback, structure-only product. Its acceptance criteria remain **PROPOSED — AWAITING OWNER APPROVAL**.
- **Phase 2** holds the original vision-language and frame-based capabilities, and is **not authorised**.
- **The conflicts with the constitution, the brief, `AGENTS.md`, the gates and the release workflow** are recorded for formal reconciliation, and are not resolved here.

## Reproducibility

Documentation only. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
