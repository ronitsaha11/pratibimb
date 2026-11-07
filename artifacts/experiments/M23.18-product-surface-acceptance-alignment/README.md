---
id: M23.18-product-surface-acceptance-alignment
title: "M23.18 — product surface and acceptance alignment (RD-1 to RD-4, RD-7, RD-8; ADR-0015 permissions)"
status: implemented — the worker's justification and a product's Status box changed; BRW-05 and REL-03 re-scoped with their originals kept; three corrections; turn wording; ADR-0015's permission description reconciled and still PROPOSED; real product build inspected; not run in a browser; not product acceptance
date: 2026-11-08
label: FACT (tests, mutations and a real product build, on W1); INFERENCE and UNKNOWN marked
classification: PRESENTATION, ONE STRING AND DOCUMENTATION — no task, orchestration, permission, CSP, host permission, egress, hook, packaging or offscreen-lifecycle change; no browser, evidence build, model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.18 — product surface and acceptance alignment

> **What it is:** the owner's RD-1, RD-2, RD-3, RD-4, RD-7 and RD-8 from the M23.16 report, and ADR-0015's permission description brought into line with M23.17.
> **What it is not:** a Chrome smoke test, approval of the acceptance framework, or a declaration that PratiBimb is release-ready. ADR-0015 stays PROPOSED — AWAITING OWNER APPROVAL.

## Hypothesis

Each approved decision can be made with no change to what a task does, with the offscreen lifecycle intact, and with every criterion's identifier, class, status and history kept.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `2ff8a89` before this milestone, 99 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4.
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- **The worker:** carries the new justification, and nothing else about the offscreen call changes.
- **The product panel:** shows no Status fields and no `NEEDS_USER` line, and one plain sentence on failure. It still sends `HOST_STATUS`.
- **The evidence panel:** prints what it printed.
- **In a real build:** the manifest and the offscreen runtime are byte-identical, and only the worker and the side panel change.
- **The criteria:** all 59 keep their identifier, class and status, and the originals of BRW-05 and REL-03 stay quoted.
- **ADR-0015:** stays PROPOSED.

## Actual result

### RD-1: the worker's justification

```
before: justification: "PratiBimb minimal host: ORT inference and the synthetic vault stub"
after:  justification: "Run PratiBimb's offscreen runtime for DOM-based browser assistance."
```

- **Only the value changed.** The call, `url: "offscreen.html"` and `reasons: [WORKERS]` are as before.
- **Under the simulated extension,** the real worker passes exactly that object to `chrome.offscreen.createDocument`.
- **The real build** carries the new string, and not the old one.
- **Whether Chrome shows it to a person is UNVERIFIED** until an authorised browser run.

### RD-2: a product's Status box (option S-C)

| | Before | After, product | After, evidence |
|---|---|---|---|
| While the panel works | four raw fields and `NEEDS_USER: none` | **nothing: the box is hidden** | the whole reply, and `NEEDS_USER: none`, as before |
| If the worker cannot be reached | `status unavailable: <raw error>` | **"PratiBimb could not start. Close this panel and open it again."** The raw error goes to the console | `status unavailable: <raw error>`, as before |
| `HOST_STATUS` request | sent on load | **sent on load, unchanged** | unchanged |
| The worker's reply | five fields | **unchanged** | unchanged |
| `data-host-status` | `ok` or `error` | **unchanged** | unchanged |

- **The `NEEDS_USER` line** is gone from the product's page entirely, not hidden. It was a fixed string that said "none" while a request for consent was on screen. **No dynamic consent status was invented:** nothing in the source supplies one truthfully. An evidence panel builds the same line in script, so its page is as it was.
- **The offscreen lifecycle is intact.** `HOST_STATUS` creates the offscreen document once, and only when there is none (FACT). With the document starting closed, a panel's `HOST_STATUS` and then a DOM-only task run, and nothing is captured.
- **Consent and approval are untouched:** the panel still asks `CLARIFY_PEEK`, `CONSENT_PEEK` and `HOST_STATUS` when it opens, and the consent markup is unchanged.
- **The `<style>` block is unchanged,** so its CSP hash still holds. `run-csp-negative`'s check reads the `<pre>`, which is still there.

### RD-3: BRW-05

| | Kept | Changed |
|---|---|---|
| Identifier, class `M (as written)`, status PARTIAL | **unchanged** | — |
| Original wording | in §5.14, quoted: "A WASM-only build, benchmarked, for the in-extension models (TR-01)" | — |
| Source | release workflow, "Release blockers" | and the dossier's "Prepared before travelling" |
| Evidence history | M8.2 TR-01 cells, labelled feasibility and before M23.7, for the original wording | A: the product build inspection and `domOnlyPhase1.test.ts` |
| Phase 1 reading | — | **a normal task performs no in-extension model inference.** No ORT session, no T1, no TR-01; ORT and TR-01 stay packaged |
| Outside Phase 1 | — | a benchmarked WASM path, **deferred** to whichever phase re-activates in-extension inference. **None has been run** |
| QG-06's "A separate WASM-only build, benchmarked" | — | **recorded as a separate, unresolved owner decision** in the row, the release checklist and the register. RD-3 did not decide it |

No browser coverage is claimed: the row asks for D1 and D2 on the current build, in a real browser.

### RD-4: REL-03

- **Phase 1 reading:** a handoff that fails verification is blocked on the **first** failure, with no outbound request, and the run stops and reports it. That is stricter than "repeated", so no counter is needed, and **none exists or was added**.
- **Other safeguards:** postconditions, grounding, freshness and the execution safeguards belong to ACT-02 to ACT-04, which the row now names.
- **The detector half is deferred:** "an injected detector timeout masked" is kept, outside normal Phase 1 operation, with P2-08. **No detector is adopted, benchmarked or evaluated.** FR-01 stays DEFERRED — NOT AUTHORISED, and B-07 stays BLOCKED.
- **Unchanged:** the class M, the status PARTIAL and the original wording (§5.14).

### RD-7: the three corrections

| | Where | Before | After |
|---|---|---|---|
| **(a)** | `core-product-acceptance-PROPOSED.md` §2, "Normal task perception" (written in M23.15) | "a real product build has no capture call" | "A real product build has **no reachable capture path**, and since M23.17 **no capture permission**; an unreachable minting wrapper remains in the worker *(corrected M23.18 …)*" |
| | `owner-decisions.md`, the M23.9 row for OD-S | "… and no capture call." | the same, followed by a dated correction |
| **(b)** | BRW-05's owner-decision cell | "owner may re-scope (§6 of the gate mapping)", a section that does not exist | "re-scoped by the owner: RD-3 (M23.18)", plus the QG-06 note, with a dated correction |
| **(c)** | REL-03's implementation cell | "implemented" | "**the first-failure block is implemented** … **No three-failure counter exists.** The detector half is deferred", with a dated correction |

**Historical records keep what they said, and a test checks they still do:**
- the M23.9 entry in `CHANGELOG.md` and its row in `state.md`'s log;
- the M23.12 record;
- the M23.16 report;
- the M23.17 record.

### RD-8: turn wording

| | Value | Source |
|---|---|---|
| **A panel-started task's budget** | **3 turns.** The default: the panel asks for none | `offscreen/main.ts`: `checkTurnBudget(msg.maxTurns ?? 3)` |
| **The enforced ceiling** | **5 turns,** refused above and never clamped | `loop.ts`: `MAX_TASK_TURNS = 5` |

- **Where the wording changed:** every as-built statement of the limit, in the core proposal (§2 Loop), the traceability matrix (five places) and the Phase 1 scope.
- **Unchanged on purpose:** FUN-02's criterion says "at most 5 turns", which is the ceiling.
- **Not changed:** no code, and no selector was added.

### ADR-0015

- **§3.1's Client row** separates the builds: a normal product declares `offscreen` and `sidePanel`. An evidence build declares those and `activeTab` and `tabCapture`, which ADR-0009's gesture route needs.
- **Dated notes:** §3.6 and §5, which said OD-P and OD-R left the permissions unchanged, now note that RD-5 and RD-6 later narrowed them.
- **The status line and the header block** say this is a factual correction, not an approval.
- **Status:** `PROPOSED — AWAITING OWNER APPROVAL`, unchanged.
- **Out of scope:** §3.1's other rows still describe the source before M23.7. They are not part of the approved permission correction.

### The real build, compared with the one before it

`logs/w1-m23-18-product-build-comparison.json`, against M23.17's product build:

| File | Result |
|---|---|
| `manifest.json` | **byte-identical:** permissions `offscreen`, `sidePanel`; hosts and CSP as before |
| `background.js` | **changed:** the justification string |
| `chunks/sidepanel-*.js`, `sidepanel.html` | **changed:** the Status box, and the chunk's hashed file name |
| `chunks/offscreen-*.js`, `content-scripts/content.js`, `tr01-worker.js`, `offscreen.html`, `chunks/_virtual_wxt-html-plugins-*.js` | **byte-identical** |

**So the offscreen runtime, the content script and every task, consent, grounding, click, freshness, postcondition and egress path are the same bytes as before.** In the real worker, `HOST_STATUS` still awaits `ensureOffscreen()`.

The inspection reports `problems: []`. It now also requires the approved failure sentence, refuses `NEEDS_USER` and `status unavailable` in a product panel, and reports the justification.

### The checks catch regressions

`logs/w1-m23-18-mutation-check.json`: **39 deliberate mutations, 39 caught, all restored.** The first run caught 38. `logs/w1-m23-18-mutation-check-first-run.json` keeps that run; see `decision.md`.

## Known limitations

- **No browser ran.** How the hidden box, the failure sentence and the justification appear in Chrome is **UNKNOWN**. Smoke check A7 now describes the new box. The smoke test is not authorised.
- **The failure advice is INFERENCE:** that closing and reopening the panel retries rests on the panel sending `HOST_STATUS` each time it loads.
- **An evidence build's panel is unchanged by source and fakes only.** No evidence build was made.
- **REL-03 still has no way to be demonstrated** on a product build: forcing a verification failure there is UNKNOWN.
- **QG-06's WASM-only item and SEC-05's detector half** remain open.

## Conclusion

**Supported.** A product now says what its offscreen document is for and shows a person nothing they cannot use. The acceptance documents say what Phase 1 does, keep what it was asked to do, and correct what they overstated. **This is alignment only. It does not authorise a Chrome smoke test, approve the acceptance framework, or declare PratiBimb release-ready.**

## Reproducibility

```bash
npx vitest run apps/extension/test/productSurface.test.ts apps/extension/test/acceptanceDocuments.test.ts
```

```bash
TR01_PROBE= M3_WORKER_FRAME= STRUCTURAL_PROBE= E6_PROBE= EGRESS_EVIDENCE_PROBE= npm run build -w @pratibimb/extension
```

```bash
node tests/browser/extension/inspect-product-build.mjs
```

The build's own hook reads and hashes TR-01, as its integrity check requires. It loads no model.
