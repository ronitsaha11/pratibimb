# OD-S — diagnostic capture hooks in product builds — OPTION B SELECTED BY THE OWNER

> **Status (M23.9, 2026-11-04): the owner selected Option B, and M23.9 implemented it in product builds** (`artifacts/experiments/M23.9-diagnostic-hook-isolation/`). Not browser-verified. The comparison below is as prepared in M23.8, with corrections marked.
> - **Correction:** M23.8 said Option B left evidence workflows "unchanged where they already use an evidence flag". **That was wrong, and this comparison is what the owner decided from.** Six of those harnesses refuse unless both builds' `background.js` are byte-identical, and Option B means they cannot be. See OD-V below.
> - **Nothing else here was decided by M23.9:** OD-T, OD-U and OD-V await the owner.
> - **Basis:** `diagnostic-hook-boundary-map.md`.

## The question

M23.7 removed frame capture, T1 and TR-01 from ordinary product tasks. Two test-labelled hooks can still capture in a product build, when driven and when a person's grant is live. Should a DOM-only product ship them?

## The options

| | **A. Retain in product builds** | **B. Evidence builds only** | **C. Remove entirely** |
|---|---|---|---|
| **What changes** | nothing | the handlers and their `__host` drivers move behind a build flag, as `#tr01-probe` and the others already are | the handlers, the drivers and the harness steps that use them are deleted |
| **Can a product build capture a frame?** | yes, if driven and a grant is live | **no code path to one**, subject to the implementation also gating what only the hooks reach | no |
| **Reach (F-2, F-3)** | any context of this extension can reach the handlers | absent from the product bundle | absent everywhere |
| **Masked frame retained in product memory (F-5)** | possible | not possible | not possible |
| **Misleading empty reply (F-6)** | stays, in product builds | gone from product builds; evidence builds run T1, so an empty list means what it says | gone |
| **Evidence workflows** | unchanged | **Corrected M23.9: not unchanged.** `run-text-region-eval` and `run-extension-loop` are unaffected, but `run-gesture-redaction`, `run-webp-loopback`, `run-artifact-verifier`, `run-capture-determinism`, `run-stream-j7` and `run-stream-re1` refuse on a worker that differs (OD-V). M23.8 said these were unchanged | **broken:** those harnesses call `perceiveOnce`. This conflicts with the M23.7 protection of evidence capture and diagnostic pathways |
| **Harnesses defined on the product build** | `run-gesture-capture`, `run-gesture-acts` and `run-detector-eval` stay as they are: **they already cannot show what they claim on a product build** (OD-U) | they must move to an evidence build. They needed that anyway (OD-U) | must be retired |
| **Consistency with OD-R** | hooks can do what OD-R took out of tasks, though tasks never use them | **consistent:** the product does not capture, and evidence builds still can | consistent |
| **Consistency with the repository's rule** ("absent from the bundle rather than present and refused") | **an exception** | **follows it**, as E6, structural, TR-01 and egress evidence do | follows it |
| **Future capability** (P2-08, or FR-01 if ever authorised) | kept | kept, in evidence builds | must be rebuilt |
| **Regression risk now** | none | moderate: build wiring. The M23.8 tests in `diagnosticHooks.test.ts` that pin today's state flip deliberately, and `buildSeparation.test.ts` and `product-build-inspection.mjs` make the result checkable | highest |
| **Effort** | none | small to moderate; the alias pattern exists | moderate, plus lost evidence tooling |
| **Reversible** | n/a | yes | by revert only, and evidence tooling would have to return with it |

**A variant of A,** should the owner want a smaller step: keep the hooks in product builds but refuse tab senders, as `RUN_TASK` does. That closes F-3 and leaves F-1, F-4, F-5 and F-6 open.

## Recommendation

**PROPOSED — AWAITING OWNER APPROVAL: Option B, evidence builds only.**

**Why, from the evidence:**
1. **Nothing in the product needs them.** No product code sends either kind, and an ordinary task reaches neither (tested).
2. **Their measured purpose has already left the product build.** On a product build `PERCEIVE_ONCE` cannot run T1 (F-6), and M23.7 means a product-build run can no longer show what M4 and M5 set out to show. Retaining them keeps the capture capability without keeping what it was for.
3. **It removes the one remaining way a product build can capture,** without depending on who can attach to a service worker or send a message.
4. **It matches how every other test control in this repository is handled,** and so needs no new mechanism.
5. ~~It costs the evidence workflows nothing that M23.7 has not already cost them.~~ **Corrected M23.9: it does cost something,** which M23.8 missed: six harnesses' byte-identity guard (OD-V). Option C would cost more.

**What this does not settle:**
- **`tabCapture` and `activeTab`:** under B, a product build would ask for permissions nothing in it uses. M23.7 protected the permission and M23.8 does not touch it. Removing it is a separate owner decision. Evidence builds, and M4-style gesture evidence, depend on it.
- **The worker's capture authority and `CAPTURE_FRAME`:** an implementation of B must say whether these leave the product bundle too. To make "no code path" literal, they must. **M23.9: `CAPTURE_FRAME` left. The authority stayed,** because the brief forbade changing it and the toolbar's grant and the panel's status use it. Its `ticketFor` has no caller.
- **ADR-0009** is unaffected: it governs capture wherever capture is authorised.

## Separate items this audit surfaced (decide independently)

| ID | Item | Why it is separate |
|---|---|---|
| **OD-T** | **The product's visible text still describes capture.** The side panel's Capture field says "Not authorised. Click the toolbar button to let PratiBimb look at this tab." The toolbar title says "PratiBimb: perceive this tab". A product task needs no such click and looks at no pixels (FACT: `host/sidepanel/main.ts`; build inspection). A person following the panel would be misled about what is happening | a product text change; applies under A, B and C |
| **OD-U** | **`run-gesture-capture.mjs` and `run-gesture-acts.mjs` are defined on the product build, and M23.7 made some of their checks unreachable there:** `theDetectorRanOnThePinnedArtifact`, `fusionJoinedDomAndVision`, `everyCaptureUsedTheStreamRoute`, `successPerceivedVisually`. M23.7 did not report this. Whether to re-scope them to an evidence build, or retire those checks | test scope; applies under A and B |

Neither is changed in M23.8 or M23.9. See `evidence-build-preservation-assessment.md` §3 and §5.

**OD-V was added by M23.9:**

| ID | Item | Why it is separate |
|---|---|---|
| **OD-V** | **Six evidence harnesses refuse unless the product and evidence `background.js` are byte-identical,** recording that "the evidence build's capture route" is "the product's". Since OD-S a product has no capture route, so that claim and that check no longer fit. **Options:** (A) keep comparing `content.js` and the manifest's route, and replace the worker comparison with two checks: the product bundle names no hook, and two evidence builds with different flags have the same worker; (B) compare workers with the gated code removed, which is fragile on minified output; (C) drop the worker comparison and state that the measured route is the evidence build's alone. **PROPOSED — AWAITING OWNER APPROVAL: A.** Under any of them, those harnesses' records can no longer say "the product's capture route" | test scope, and what those records may claim. Until it is decided, the six refuse, fail-closed |
