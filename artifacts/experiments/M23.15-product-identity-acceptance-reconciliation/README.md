---
id: M23.15-product-identity-acceptance-reconciliation
title: "M23.15 — product identity and acceptance traceability reconciliation (OD-Y, OD-Z)"
status: implemented as far as existing owner approvals permit — identity wording in product UI, BRW-04 and the capture wording reconciled; real product build compared; not seen in a browser; GOV-01 and the 51 proposed-mandatory classifications stay unapproved; ADR-0015 still PROPOSED
date: 2026-11-06
label: FACT (tests, mutations and a real product build, on W1); INFERENCE and UNKNOWN marked
classification: WORDING ONLY — product UI strings, acceptance documents, tests; no JavaScript in the build changed; no worker, permission, CSP, endpoint, hook or packaging change; no model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.15 — product identity and acceptance reconciliation

> **What it is:** the product's approved name in what a person reads (OD-Y), and acceptance wording that matches the DOM-only Phase 1 as implemented (OD-Z).
> **What it is not:** approval of the acceptance framework, or any statement that PratiBimb is release-ready. GOV-01 and the 51 proposed-mandatory classifications stay **PROPOSED — AWAITING OWNER APPROVAL**. QG-04-S and QG-04-F are not signed.

## Hypothesis

The identity and the acceptance wording can both be reconciled with the owner's decisions with no behaviour changing, and with no criterion, classification or historical record lost.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `b8c59a3` before this milestone, 93 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4.
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- A person reads **PratiBimb — Page Assistant**, qualified as a development build, and nothing that calls it released.
- In a real build, no JavaScript changes, and the manifest changes in `name` alone.
- `BRW-04` is a DOM-only requirement, and all 59 criteria keep their class and status.
- Internal names, evidence-build wording and historical records stay.

## Actual result

### 1. Product identity (OD-Y)

| Surface | Before | After |
|---|---|---|
| Extension name (`manifest.json`) | `PratiBimb minimal MV3 host (experiment — not the product)` | `PratiBimb — Page Assistant (Development build)` |
| Toolbar title | `PratiBimb — Page Assistant` | **unchanged** (the OD-T wording, exactly) |
| Side panel `<title>` | `PratiBimb — minimal host` | `PratiBimb — Page Assistant (Development build)` |
| Side panel `<h1>` | `PratiBimb minimal host` | `PratiBimb — Page Assistant (Development build)` |
| Offscreen page `<title>` | `PratiBimb minimal host — offscreen` | `PratiBimb — Page Assistant (Development build): offscreen` |
| Description and privacy explanation | the OD-T wording | **unchanged** |

The combined form is the brief's own example. No new brand or tagline was invented. The name is one constant, `DEVELOPMENT_BUILD_NAME`, derived from `TOOLBAR_TITLE`. Manifests are compared across builds (M23.10), so an evidence build has the same name, and that is also true of it.

### 2. Terminology audit

Every occurrence found in the extension's source and the living documents, classified:

| Wording | Where | Class | Action |
|---|---|---|---|
| `PratiBimb minimal MV3 host (experiment — not the product)` | manifest `name` | Normal product UI | **replaced** |
| `PratiBimb — minimal host`, `PratiBimb minimal host` | side panel title, heading | Normal product UI | **replaced** |
| `PratiBimb minimal host — offscreen` | offscreen page title | Normal product UI (a page's own title) | **replaced** |
| `Development build. Use synthetic pages only. …` | side panel `.warn` | Development-only UI | **kept:** true |
| `Synthetic goal text` | goal placeholder | Development-only UI | **kept:** true |
| `Capture` legend; `Not authorised. Click the toolbar button to let PratiBimb look at this tab.` and the other lifecycle lines | evidence panel alone | Evidence-build UI | **kept:** accurate there. Absent from a product bundle |
| `justification: "PratiBimb minimal host: ORT inference and the synthetic vault stub"` | `background.ts:106`, an argument to `chrome.offscreen.createDocument` | Build metadata | **kept,** and raised below. Editing it would change the worker's bytes |
| `@pratibimb/extension`, `chrome-mv3`, `TOOLBAR_TITLE` and other identifiers | packages, paths, code | Build metadata | **kept:** the brief forbids renaming for consistency |
| `Minimal host — …` | header comments in `background.ts`, `content.ts`, `offscreen/main.ts`, `sidepanel/main.ts`, `messages.ts` | Technical documentation | **kept:** stripped from the bundle |
| `MINIMAL MV3 HOST … NOT the product extension` | header comment in `wxt.config.ts` | Technical documentation | **kept** |
| `experiment E4-offscreen` | comment in `messages.ts` | Technical documentation | **kept:** names a real experiment |
| `the minimal MV3 host — experimental, not the product` | `docs/handoff/w1-to-w2/repository-inventory.md` | Historical record | **kept** |
| old names and capture wording in M4 to M23.14 records, earlier sections of `state.md` and the register, `od-r-frame-capture-recommendation-PROPOSED.md` | records | Historical record | **kept** |
| gesture-route wording in `phase-1-data-flow-and-components.md`, `t1-tr01-status-reconciliation.md` | dated source traces (M23.3, at `3e6a2e6`). The first carries an M23.7 update note | Technical documentation | **kept:** accurate about what they traced, and not in this milestone's update list |

`productIdentity.test.ts` holds these lines: it fails if a kept item is renamed, or if a replaced one returns. Historical records are not scanned, and one test checks they still say what they said.

### 3. BRW-04 and capture wording (OD-Z)

**`BRW-04` now reads:** "The extension opens and operates in each browser accepted for Phase 1. A person completes supported browser tasks through DOM-based observation, with structural grounding and click safety working correctly. Browser-frame capture is not required for normal Phase 1 task execution."

- **Its class and status are unchanged:** M (proposed), PARTIAL.
- **Its evidence changed:** M4 and M5 are gesture-capture evidence, and no longer count for it. M19 and M20 (Chrome, W1, DOM structure, no frame) are recorded as predating M23.7.
- **No cross-browser claim is made.** Each other browser depends on OD-A.
- **Its original wording is kept** in `core-product-acceptance-PROPOSED.md` §5.14. Gesture capture stays an evidence-build requirement, through the two OD-U harnesses, and **UNVERIFIED** since M23.7.

**"Capture: gesture-authorised" is corrected** in `phase-1-architecture-scope.md` §2. Normal tasks: no browser-frame capture, no gesture grant required, no T1 or TR-01 execution. Evidence-build diagnostics now have their own table, labelled as not product behaviour.

The same correction is applied to:

- the core proposal's §2 (client, TR-01, handoff and validation rows);
- the traceability matrix (TR-01, T1, visual-only PII, stage 1 OBSERVE, evidence by type, and the statement that TR-01 met "a vision model executing locally");
- the release checklist (`BRW-01`, `BRW-04` and `BRW-05` are now separate unticked lines; P2-08 added).

### 4. Acceptance integrity

| Check | Result |
|---|---|
| 59 criteria, every ID, class and status as at `b8c59a3` | **unchanged,** pinned in `acceptanceDocuments.test.ts` |
| 51 proposed mandatory, 7 owner decisions, 1 optional | **unchanged** |
| P2-01 to P2-08 | **retained,** `FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION`, and outside the Phase 1 matrix |
| Affected criteria (`BRW-04`, `BRW-05`, `PRV-03`, `PRV-04`, `SEC-04`, `SEC-05`, `REL-03`, `PRF-02`, `GOV-05`) | §5.14 records each one's original source, Phase 1 interpretation, proposed classification and evidence required |
| Every release-checklist box | **unticked** |

### 5. The brief's deliverables

`traceability-matrix.md` §1.6 maps all four, in the columns the owner asked for: implemented, not fulfilled, deferred to Phase 2, unverified, owner decision. The deliverables' wording is quoted unchanged. In short:

| Deliverable | Phase 1 does | Phase 1 does not fulfil |
|---|---|---|
| 1. Extension with a local vision model | a Chrome MV3 extension observing the DOM | no vision model runs in a normal task; Firefox is not built or run for the product |
| 2. Privacy filter | textual and DOM PII to references; memory-only vault; consent. Normal tasks do not capture browser screenshots or send page images to the reasoning model | visual-only PII protection is not operational |
| 3. Server with an open-weight LLM or VLM | a loopback text LLM, structure-only | it is not a VLM, and not a remote server |
| 4. One end-to-end task | bounded synthetic tasks with consent, grounding and postconditions | real sites and an independent operator. The current build has not run in a browser |

### 6. The real build, compared with the one before it

`logs/w1-m23-15-product-build-comparison.json`, by SHA-256, against M23.14's product build:

| File | Result |
|---|---|
| `background.js`, `content-scripts/content.js`, `tr01-worker.js` | **byte-identical** |
| `chunks/offscreen-*.js`, `chunks/sidepanel-*.js`, `chunks/_virtual_wxt-html-plugins-*.js` | **byte-identical** |
| `manifest.json` | **changed in `name` alone.** Permissions, host permissions, CSP, toolbar title and the shortcut are the same |
| `sidepanel.html` | title and heading text. The `<style>` block is the same, so its CSP hash still holds |
| `offscreen.html` | title text |

**6 of 9 files are byte-identical, including all the JavaScript.** So tasks, DOM observation, consent, grounding, clicks, the five-turn cap, freshness, postconditions, fail-closed behaviour, egress and every hook are the same bytes as before.

The inspection (`logs/w1-m23-15-product-build-inspection.json`) reports `problems: []`, with its two new checks: the approved name, and no old identity in the manifest or panel.

### 7. The checks catch regressions

`logs/w1-m23-15-mutation-check.json`: **40 deliberate mutations, 40 caught, all restored** (checksums verified). They cover identity strings, the inspection, kept wording, each criterion-integrity property, capture wording, each false claim the brief forbids, the checklist and the register.

## Known limitations

- **Not seen in a browser.** How the longer heading wraps in the side panel, and how Chrome displays the name, are **UNKNOWN**.
- **Evidence-build runtime is UNVERIFIED.** It was not built or run. Its shared name and heading are tested through the config and source only.
- **The document tests check wording, not truth.** A pinned phrase being present does not show a criterion is met. The false-claim scan covers specific phrasings in the four living documents, and cannot exclude every rewording.
- **The worker's `justification` keeps the old text.** It is a technical argument to a Chrome API, and is not in the panel. Whether Chrome shows it to a person anywhere is **UNKNOWN**. Changing it is a one-line decision for the owner, and would change the worker's bytes.
- **`wxt.config.ts`'s header comment** still says "NOT the product extension". It is not in any build. It is left as the brief directs, and may read oddly to a new contributor.
- **The Status box stays in a product panel** as a developer readout. OD-Y did not decide its place.

## Conclusion

**Hypothesis supported, within these limits.** A person now reads the approved name, qualified as a development build. The acceptance documents say what a normal task does, and evidence builds are described separately. No criterion, classification or historical record was lost, and no JavaScript in the product build changed. This is wording. **It does not approve the acceptance framework or declare PratiBimb release-ready.**

## Reproducibility

```bash
npx vitest run apps/extension/test/productIdentity.test.ts apps/extension/test/acceptanceDocuments.test.ts
```

```bash
TR01_PROBE= M3_WORKER_FRAME= STRUCTURAL_PROBE= E6_PROBE= EGRESS_EVIDENCE_PROBE= npm run build -w @pratibimb/extension
```

```bash
node tests/browser/extension/inspect-product-build.mjs
```

The build's own hook reads and hashes TR-01, as its integrity check requires. It loads no model.
