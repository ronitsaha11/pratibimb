---
id: M23.12-product-ui-language
title: "M23.12 — product UI language reconciliation (OD-T)"
status: implemented in source — the approved wording is in the manifest and a product panel; not rebuilt and not seen in a browser; ADR-0015 still PROPOSED; all Phase 1 acceptance criteria awaiting approval
date: 2026-11-04
label: FACT (tests, mutations and a read-only check of the previous product build, on W1); INFERENCE and UNKNOWN marked
classification: UI COPY, TESTS AND DOCUMENTATION ONLY — no task, perception, reasoning, permission, CSP, packaging or diagnostic-hook change; no build, browser, model, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.12 — product UI language

> **What it is:** the owner's OD-T wording, in the normal product's toolbar title and side panel.
> **What it is not:** a claim about visual PII, a browser check, or a change to what any task does.

## Hypothesis

The product's UI can say what the DOM-only Phase 1 does, with the approved wording, without changing behaviour, and without an evidence build making a statement that is false in it.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `41806a1` before this milestone, 86 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4. No DOM library is installed, so the panel test uses a small fake built from the real page's ids.
- **Builds made:** none. A product build's hook reads and hashes TR-01, and none was asked for here.

## Expected result

- The three approved strings appear exactly, in a product build's source and bundle.
- No normal product UI implies a capture.
- The privacy sentence is true of a product task, by test.
- The manifest changes in wording alone, and task behaviour does not change.

## Actual result

### 1. The wording

| Where | Before | After |
|---|---|---|
| **Toolbar title** (`action.default_title`) | `PratiBimb: perceive this tab` | **`PratiBimb — Page Assistant`** |
| **Side-panel description** (new line, under the heading) | — | **`PratiBimb uses page structure to identify elements and assist with browser tasks.`** |
| **Privacy explanation** (new line, under that) | — | **`Normal tasks do not capture browser screenshots or send page images to the reasoning model.`** |

All three are exact. They live in one file, `host-lib/product-copy.ts`.

### 2. Three decisions the wording required

These go slightly beyond swapping strings, so they are recorded plainly.

**a. The two panel sentences appear in a product build only.** An evidence build's tasks do capture under a grant (tested), so the privacy sentence would be false there. The panel fills them in only when `__EVIDENCE_BUILD__` is false.

**b. The "Capture" field moved to evidence builds alone.** OD-T named one sentence, but the whole field describes a capture a product task never makes: its legend and all five status messages. Rewording it would have needed copy nobody approved, so a product panel has no such field. An evidence build builds the same field in the same place, with its original words, which are accurate there.

**c. A presentation adjustment:** the manifest's shortcut text was "Perceive this tab", which is stale wording with no approved replacement. It now reuses the approved toolbar title. Whether Chrome displays that text for `_execute_action` is UNKNOWN.

**Consequence of a shared manifest:** the toolbar title is the same in evidence builds, because M23.10's contract requires the two builds' manifests to match. So three evidence harnesses that tell an operator what to click now name the new title. Those are prompt strings only; no check changed.

### 3. Stale-wording search

Phrases searched: "perceive this tab", "look at this tab", "capture this page", "see this tab", plus "No frame taken" and "Click the toolbar button".

| Class | Where | Action |
|---|---|---|
| **Normal product UI** | manifest title and shortcut text; panel's Capture field | **Changed or moved.** None remains |
| **Evidence-build diagnostic UI** | `sidepanel/main.ts`, inside the `__EVIDENCE_BUILD__` branch | **Kept,** accurate there. Absent from a product bundle (test) |
| **Evidence harness prompts** | `run-gesture-capture`, `run-gesture-acts`, `run-gesture-redaction` | **Title updated,** as above |
| **Historical documentation** | M23.8, M23.9 and M23.11 records; `run-gesture-redaction` attempt log (M10); two build-inspection logs | **Unchanged:** true when written |
| **Technical documentation** | `od-s-diagnostic-hooks-comparison-PROPOSED.md`; `owner-decisions.md` (the OD-T row) | **Unchanged:** they describe the decision |
| **Test code and fixtures** | `product-build-inspection.mjs` (the list of stale phrases); `buildSeparation.test.ts`; `productUiCopy.test.ts` | **Deliberate:** the search itself and its negative controls |

**Also visible in a product panel, not capture claims, and not in OD-T, so left alone:**
- **The Status box prints the worker's raw reply,** which has a `captureStatus` key. A technical readout rather than a claim, but a person can see the word.
- **"PratiBimb minimal host", "Development build. Use synthetic pages only."** and the manifest's name, "(experiment — not the product)".

### 4. Is the privacy sentence true?

Checked on the simulated extension (`productUiCopy.test.ts`), with a toolbar grant live:

| Claim it depends on | Result | Evidence |
|---|---|---|
| No browser-frame capture in a normal task | all 14 counters at zero | behavioural (simulated) |
| No T1 inference | same; handoff declares `backend: "none"` | behavioural (simulated) |
| No TR-01 | same | behavioural (simulated) |
| Structure-only reasoning input | `structuralRequestProblems` empty; every message is text | behavioural (simulated) |
| No image payload | no `image_url`, `data:image`, PNG or WebP marker in what crossed | behavioural (simulated) |

Earlier real evidence stands: M23.9's real product build has no capture call.

**What it does not claim, and a test keeps it that way:** nothing about visual PII, redaction, masking or complete privacy. **Visual-only PII protection is not operational.** Page text in the structural reading does reach the local reasoner, in sanitised form, and this sentence does not say otherwise. It says "normal tasks", which is the distinction from evidence builds.

### 5. Tests

| File | Now | What |
|---|---|---|
| `apps/extension/test/productUiCopy.test.ts` (new) | **23** | exact wording; the real panel code on a fake page, in both builds; evidence wording kept; privacy sentence against task behaviour |
| `apps/extension/test/buildSeparation.test.ts` | 50 (was 43) | the real manifest for every flag; a product bundle of the panel; 3 negative controls |
| `tests/browser/support/product-build-inspection.test.mjs` | 12 (was 9) | a product build with the wrong title, a missing sentence or stale wording now fails |

**Mutation check (`logs/w1-m23-12-mutation-check.json`): 23 of 23 caught,** all files restored (checksums), including rewording each string, showing the privacy sentence in evidence builds, and making the toolbar open the panel.

**On a real build (`logs/w1-m23-12-old-build-product-build-inspection.json`):** the updated inspection, run read-only on the product build from before this milestone, **fails it on all seven wording points.** Its permissions, hosts and CSP are as before. This is a real-world negative control.

### 6. What did not change

- **In `wxt.config.ts`:** one import and two strings. Permissions, `tabCapture`, hosts, CSP and packaging are untouched, tested per flag.
- **In the panel's page:** `<style>` is unchanged, so its CSP hash is too (tested against the hash in the last built manifest). Every control stays.
- **In the panel's code:** it asks the extension for the same things in both builds. Its consent, clarification and task code is not edited.
- **No diff:** the worker, the offscreen document, the content script, the capture authority, the CSP module, `packages/`, ADRs, security docs, frozen architecture, gates and blockers.

## Known limitations

1. **No build was made and no browser opened.** Nobody has seen this wording rendered. The layout effect of the two new lines is unmeasured.
2. **The product build on disk is now out of date.** It carries the old wording, so `inspect-product-build.mjs` fails it, as intended, until it is rebuilt. Until then the gesture gate calls it `UNKNOWN` rather than `PRODUCT`, and still refuses it.
3. **The toolbar button now has no visible effect in a product.** It records a grant, as before, which nothing in a product build uses, and the Capture field that used to show that is gone. The action itself was not to change. **Worth the owner's attention** with the unused `tabCapture` question.
4. **The panel test uses a fake DOM.** The real code runs, but real rendering, focus and screen-reader behaviour are not established. The two lines are plain paragraphs in reading order. The extension has no localisation to preserve.
5. **The evidence panel's words are unchanged and unrun.** Evidence-build runtime stays UNVERIFIED.

## Conclusion

The product's toolbar and side panel now say what a product task does, in the owner's exact words, and an evidence build does not repeat a statement that would be false in it. Nothing about tasks, security or permissions changed. A rebuild and a look in a browser remain to be done.

## Reproducibility

```bash
npx vitest run apps/extension/test/productUiCopy.test.ts apps/extension/test/buildSeparation.test.ts tests/browser/support/product-build-inspection.test.mjs
```

```bash
npm run typecheck
```

```bash
npx vitest run
```

```bash
python scripts/verify-repo.py
```

See `decision.md` for the results.
