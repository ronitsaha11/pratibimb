# M23.18 — decision record

**Verdict: RD-1, RD-2, RD-3, RD-4, RD-7 AND RD-8 IMPLEMENTED, after verification. ADR-0015's permission description reconciled; ADR-0015 stays PROPOSED.** Not run in a browser. No evidence build made. Not product acceptance.

| Item | Status | Evidence |
|---|---|---|
| RD-1: justification | **DONE:** only the value changed | `productSurface.test.ts`; the real worker |
| RD-2: product Status box | **DONE:** hidden while working; one sentence on failure; no `NEEDS_USER` | `productSurface.test.ts`, `captureStatusScope.test.ts`; the real panel chunk |
| `HOST_STATUS`, the worker's reply, offscreen creation | **UNCHANGED** | `productSurface.test.ts`; the real worker |
| Evidence panel, Capture field, hooks | **UNCHANGED** in source and under fakes. Runtime **UNVERIFIED** | same |
| RD-3, RD-4: BRW-05, REL-03 | **DONE:** re-scoped; originals, IDs, classes, statuses and evidence kept | `acceptanceDocuments.test.ts` |
| RD-7: three corrections | **DONE,** dated; records kept | same |
| RD-8: turn wording | **DONE:** 3 and 5 stated separately; no code change | same |
| ADR-0015 | **CORRECTED** (permission description), **still PROPOSED** | same |
| 59 criteria: 51 M, 7 OD, 1 O | **unchanged** | same, against the M23.15 baseline |
| Permissions, CSP, hosts, connect-src, egress, tasks, consent, grounding, clicks, the five-turn ceiling, freshness, postconditions, fail-closed behaviour | **UNCHANGED:** the manifest and the offscreen runtime are byte-identical | `logs/w1-m23-18-product-build-comparison.json` |
| QG-04, gates, other ADRs, FR-01, B-07, the M23.16 report, the M23.17 record | **unchanged** | `git diff` |

## Final verification (W1, 2026-11-08)

Each command's execution path was read first. No evidence flag was set.

| Command | What it executes | Exit | Result |
|---|---|---|---|
| Product surface, status, identity, build and inspection tests: `productSurface`, `captureStatusScope`, `productUiCopy`, `productIdentity`, `buildSeparation`, `permissionIsolation`, `product-build-inspection`, `build-separation`, `gesture-harness-gate`, `diagnosticHooks`, `toolbarInteraction`, `domOnlyTaskPath` | the real panel code on a fake page; the real worker and offscreen document under fakes; an in-memory bundle with the **product's** flags; synthetic builds | **0** | **476 passed** |
| Acceptance-document tests: `acceptanceDocuments` | the living documents, the ADR and the records, read as text | **0** | **41 passed** |
| `npm run typecheck` | `tsc` only | **0** | — |
| `npx vitest run` | every collected test. No browser, no model | **0** | 160 files passed, 2 skipped; **3756 passed, 22 skipped** of 3778 |
| `npm run pin:check` | hashes the ORT runtime in `node_modules`, **not a model** | **0** | ORT pin OK |
| Mutation check | one file changed, its tests run, the file restored | **0** | **39 of 39 caught,** all restored (checksums) |
| `npm run build -w @pratibimb/extension` | `wxt build`, product flags. **Its hook reads and hashes TR-01, as the integrity check requires** | **0** | no T1 |
| `inspect-product-build.mjs --record <dir> --label m23-18` | reads the manifest, file names and JavaScript text; opens no model | **0** | **`problems: []`**, at `8d3ce5f` |
| `python scripts/verify-repo.py` | governance checks | **0** | **0 failures, 0 warnings** |

**The count adds up:** M23.17 ended at 3717 passed. Per file: `acceptanceDocuments` +19, `productSurface` +16, `buildSeparation` +2, `product-build-inspection` +2. 3717 + 39 = 3756. The rewritten `captureStatusScope` and `productUiCopy` tests replaced old ones one for one.

**Not run, deliberately:** `npm run verify` (its `test:py` step runs the training loop), any evidence build, any harness, and any browser.

## First-attempt failures and retries

| Step | First attempt | Cause | Resolution |
|---|---|---|---|
| Focused tests | exit 1: 469 of 476 | (a) my HTML comment named `NEEDS_USER`, so the page still contained the word; (b) I had restructured the evidence branch of `refresh()`, and three older negative-control tests anchor on its original `if (__EVIDENCE_BUILD__ && captureEl) {` line; (c) a test used an unimported name; (d) a stale-wording test built its "approved" panel text without the new sentence | (a) comment reworded; (b) the evidence branch was put back in its original shape, which also keeps it closer to unchanged; (c), (d) fixed. Second attempt exit 0 |
| Typecheck | exit 2 | (c) above | second attempt exit 0 |
| A document script | stopped before writing | `\| BRW-05 \|` begins two rows | matched each row by its own text |
| The register script | stopped before writing | the OD-S row's wording differed from the changelog's | matched the row's real wording |
| **Mutation check, first run** | **38 of 39** | writing "EVIDENCED." into BRW-05's decision cell passed: only the status column was pinned | **a test was added:** neither re-scoped row may claim a result outside its status cell |
| **Mutation check, second run** | **38 of 39, the same miss** | **the new test was broken:** a shell heredoc turned its `\b` into backspace characters, so its pattern could never match. A repeat of an earlier pitfall | fixed with a direct edit, after a scan found no other control character in any changed file. The mutation was then shown caught by hand. The second run's log was not kept |
| **Mutation check, third run** | **39 of 39** | — | the run recorded in `logs/w1-m23-18-mutation-check.json` |
| Full suite, product build, inspection, pin check, `verify-repo.py` | **passed first time** | — | — |

**No check was weakened.** The tests that pinned four Status fields and the old string now pin the approved behaviour. Every other change only adds assertions.

## What did not happen

- **No model was loaded into a session.** The product build's own hook read TR-01's bytes, hashed them and copied the file into the output. That is the existing integrity check. Nothing else read or hashed a model. T1 was not read.
- **No browser frame was captured. Chrome was not launched,** and no extension was loaded.
- **No training, inference, detector evaluation, ONNX export or dataset access. No TEST.**
- **No browser, evidence build or harness ran.**
- **No change to:** task orchestration, DOM observation, T1 and TR-01 exclusion, hook isolation, `sendVerified()`, the loopback endpoint, structure-only input, consent, grounding, click eligibility, the five-turn ceiling, freshness, postconditions, fail-closed behaviour, permissions, CSP or host permissions.
- **Not signed or approved:** no gate was signed. QG-04 was not modified. ADR-0015 was not approved. GOV-01 and the 51 classifications were not approved.
- **FR-01 stays deferred and NOT AUTHORISED. B-07 stays blocked.** Nothing was pushed, and no PR was opened.

## Labels

- **FACT:** the test, mutation and build results; the real build's files, as read and compared; the documents, as read.
- **INFERENCE:** that reopening the panel retries (facts: the panel sends `HOST_STATUS` on every load, and that request creates the document).
- **UNKNOWN:** how Chrome renders the panel or shows the justification; evidence-build runtime; how to force a verification failure in a product build.

## Still pending, not resolved here

| ID | Item |
|---|---|
| **RD-9, RD-10** | the order of work, and the Chrome smoke test. **No smoke test is authorised** |
| **QG-06** | "A separate WASM-only build, benchmarked": unresolved |
| **SEC-05** | its detector half |
| **OD-N** | ADR-0015, still PROPOSED |
| **GOV-01, OD-E1 and the rest** | as in the register. F-M13-1, J7/B5 and B-02 stay open |

## Next

The owner's remaining decisions. A smoke test needs its own authorisation.
