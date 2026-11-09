# Residual product surface and acceptance gaps — owner decision report

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.16, 2026-11-06, at `0fd9f49`).**
> - **What it is:** a read-only review, with recommendations. Every decision below is the owner's.
> - **What it is not:** product acceptance or browser validation. Nothing here approves, closes, signs or changes anything. No criterion, classification, permission, UI string or register entry was changed.
> - **Method:** source, the existing product build's text, and the governing documents, read as files. Chrome's public documentation was read for API behaviour. **No browser ran. No build ran. No model was opened. No evidence build or harness ran.**
> - **Labels:** FACT, INFERENCE and UNKNOWN as `AGENTS.md` §5 defines them. A statement that rests only on Chrome's documentation is labelled **documented**, and stays UNKNOWN as observed behaviour.
> - **Decision IDs:** RD-1 to RD-10 are labels for this report only. They are not entries in `owner-decisions.md`.

## 1. Executive summary

**The review found four things the owner has not yet been told:**

1. **`NEEDS_USER: none` is a fixed string.** Nothing in the source updates it, so a product panel says "none" while it is asking a person for consent (§3).
2. **The Status box's request is functional, even though its display is not.** Its `HOST_STATUS` message is the only normal route that creates the offscreen document, and every task needs that document. Hiding the box is presentation only. Removing the request would likely break "Read this page" (§3).
3. **"Three consecutive verification failures" does not exist in the code.** The first failure blocks. REL-03's "implemented" overstates it (§5).
4. **The panel's task budget is 3 turns, not 5.** Five is the ceiling, and it is enforced. A person cannot reach it through the panel, so a human smoke test cannot show the cap being reached (§8).

**Recommendations in one line each:**

| ID | Decision | Recommendation | Confidence |
|---|---|---|---|
| RD-1 | Worker `justification` | **C:** another truthful technical description | CONFIRMED that it is inaccurate; **UNKNOWN** whether users see it |
| RD-2 | Status box | **S-C:** no running fields in a product panel; failure sentence only; `HOST_STATUS` stays | CONFIRMED |
| RD-3 | BRW-05 | **Re-scope for Phase 1,** preserving the original | CONFIRMED |
| RD-4 | REL-03 | **Re-scope for Phase 1,** preserving the original; detector half deferred | CONFIRMED |
| RD-5 | `tabCapture` | **REMOVE from product builds only** | PARTIAL |
| RD-6 | `activeTab` | **REMOVE from product builds only** | PARTIAL |
| RD-7 | Three wording corrections in earlier documents | **Authorise them** | CONFIRMED |
| RD-8 | Panel turn budget | **Retain 3,** and state it plainly | CONFIRMED |
| RD-9 | Order of work | **Decide RD-1, 2, 5, 6, then implement, then smoke** | INFERENCE |
| RD-10 | Chrome smoke test | **Ready to authorise after RD-9.** Not authorised by this report | PARTIAL |

**Status of the product (unchanged):** the current build has not run in a browser since M23.7. Nothing is accepted. GOV-01 and the 51 proposed-mandatory classifications stay unapproved. FR-01 stays deferred and NOT AUTHORISED. B-07 stays blocked.

## 2. Worker `justification` string

### Findings

| Question | Finding | Label | Source |
|---|---|---|---|
| Exact location | `apps/extension/host/background.ts:106`, in `ensureOffscreen()` | FACT | source |
| Exact value | `"PratiBimb minimal host: ORT inference and the synthetic vault stub"` | FACT | source |
| Which API | `chrome.offscreen.createDocument({ url, reasons: [WORKERS], justification })` | FACT | `background.ts:103-107` |
| In a normal product build | **Yes,** once, in `background.js` | FACT | the existing build's text |
| In any other shipped file | No: not the manifest, the pages or the other chunks | FACT | same |
| Does Chrome display it | **UNKNOWN.** Documented: "The user agent _may_ use this in display to the user." No observation exists | UNKNOWN | `node_modules/@wxt-dev/browser/src/gen/index.d.ts:7858`; Chrome's `offscreen` reference |
| Is it accurate in a product build | **Half.** No ORT session is created in a normal task: `loadsUiHead(false)` refuses first, and `ORT_SMOKE` answers `UI_HEAD_NOT_IN_PRODUCT_BUILD`. "Minimal host" is the retired name. The memory-only vault stub is real | FACT | `offscreen/main.ts:45,136`; M23.15 inspection log |
| Changing it: worker bytes | **Yes.** `background.js`'s SHA-256 changes, in every build | INFERENCE, from the source being one literal | — |
| Changing it: build identity | No. `version` and the extension's name are elsewhere. Nothing pins a worker hash across commits; `judgeBuildSeparation` compares two builds made together | INFERENCE | `build-separation.mjs:126` |
| Changing it: permissions | **No.** The manifest does not contain it | FACT | `wxt.config.ts:183-197` |
| Tests depending on it | **One:** `productIdentity.test.ts:111`, added in M23.15 to keep it unchanged. The test rig's `createDocument` ignores its arguments | FACT | `simulatedExtension.ts:481` |

**Related, not part of this decision:** `reasons: [WORKERS]` is documented as "needs to spawn workers". A product's offscreen document starts no worker (`offscreenCanStartTr01: false`). Documentation states no enforcement, and no lifetime limit for this reason. Whether a future store review cares is UNKNOWN.

### RD-1

| | |
|---|---|
| **Current state** | Old wording, retained deliberately in M23.15 and raised |
| **Recommended** | **C. Another truthful technical description.** It should be true in both builds, for example *"PratiBimb: runs the task and its memory-only vault outside the page"*. The exact words are the owner's |
| **Alternatives** | **A. Retain:** no bytes change, but it keeps a retired name and an untrue claim in a string Chrome is allowed to show. **B. The approved identity alone:** consistent, but it stops saying why the document exists, which is the parameter's purpose |
| **Consequences of C** | One literal and one test change. The worker's hash changes, so this should land **before** the smoke test, not after it |
| **Confidence** | **CONFIRMED** that it is inaccurate in a product build. **UNKNOWN** whether users see it |

## 3. Product status box

### What it holds

`apps/extension/host/sidepanel/index.html:63`, filled once per panel load by `refresh()` (`sidepanel/main.ts:85-104`). **It does not update while the panel stays open.**

| Field | Source and purpose | Normal user needs it? | Internal detail? | Product vs evidence | Debug value | If hidden |
|---|---|---|---|---|---|---|
| `bootId` | `crypto.randomUUID()` at worker start. Lets an evidence run see a worker restart (`background.ts:5,16`) | No | Yes: a random id, not a page value | same | Worker restart. Also at `__host.bootId` | presentation only |
| `bootedAt` | `Date.now()` at worker start, printed as raw epoch milliseconds | No | Yes | same | Low. Also at `__host.bootedAt` | presentation only |
| `offscreenContexts` | Count, taken just after `ensureOffscreen()` | No | Yes | same | Low: read after the document is ensured. Also at `__host.offscreenContexts()` | presentation only |
| `hellos` | Count of content-script `HELLO`s since the worker booted | No | Yes: an activity count | same | Some. **Stale** after the panel opens. Also at `__host.hellos` | presentation only |
| `captureStatus` | Grant lifecycle (`capture.status`) | No: none exists in a task | Yes | **evidence panel only** (OD-X) | Evidence builds | already absent from a product |
| `status unavailable: …` | The failure message (`main.ts:99`) | **Yes** | Yes: a raw error | same | High | **should stay in some form** |
| `NEEDS_USER: none` | **A fixed string in the HTML.** No source file writes `#needs-user` | **No, and it is misleading** | No | same | None | removes a false statement |
| `data-host-status` | An attribute, not visible. Read by `run-csp-negative.mjs:208,298` | No | — | same | Evidence harness | **must stay** |

**All of the above is FACT from source.** Tests pin the current box: `captureStatusScope.test.ts` (four fields; line 93 the markup; line 174 the request), `productUiCopy.test.ts:110`. Smoke check A7 expects the four fields.

### The request is not presentation

- **FACT:** the panel sends `TASK_PREPARE`, `TASK_START` and `TASK_STATUS` straight to the offscreen document (`main.ts:275,318,333`).
- **FACT:** `ensureOffscreen()` is the only creator (`background.ts:103`). Its callers are `HOST_STATUS` (`:421`), `RELAY_ECHO` (`:438`, sent only on a test instruction, `content.ts:131`), and the DevTools-only `__host` control plane.
- **INFERENCE, from those two facts:** removing the `HOST_STATUS` call would leave no normal creator, and "Read this page" would likely report "no reply".
- **Why nothing has shown this:** `run-product-smoke.mjs:226` creates the document itself through `__host`, and the simulated rig's `createDocument` does nothing. The only guard is that a test expects the panel to send `HOST_STATUS`.
- **UNKNOWN:** if `createDocument` ever throws, the handler at `background.ts:420` has no `catch`. What the panel then shows has not been observed.

### Options

| | **S-A. Keep as it is** | **S-B. Collapse into "Diagnostics"** | **S-C. No running fields in a product (recommended)** |
|---|---|---|---|
| A product panel shows | four raw fields and `NEEDS_USER: none` | a closed section with the four fields; `NEEDS_USER` removed | nothing while healthy; one plain sentence on failure |
| Evidence panel | unchanged | unchanged | unchanged |
| `HOST_STATUS`, `data-host-status` | kept | kept | **kept** |
| Functional change | none | none, presentation only | none, presentation only |
| Debugging | as now | one click away | the same values through `__host`, which the smoke procedure already uses |
| Cost | keeps a false line and raw internals in what a person reads | new markup; tests and A7 change | tests and A7 change; **new wording needs the owner's approval**, as OD-T did |

### RD-2

| | |
|---|---|
| **Current state** | Four fields shown (OD-X). Its place in a product was left open by OD-Y |
| **Recommended** | **S-C.** A person gains nothing from these values, and every one remains available to a developer. **Whichever option is chosen, `NEEDS_USER: none` should not stay in a product panel, and the `HOST_STATUS` call must stay** |
| **Alternatives** | S-A, S-B, above. S-B is reasonable if the owner wants the readout visible during the smoke test |
| **Consequences** | Panel chunk changes. Worker, offscreen chunk and manifest need not. Land it **before** the smoke test, so A7 checks the final panel |
| **Confidence** | **CONFIRMED** from source. The result of a removed request is INFERENCE, and is a reason to keep the request |

## 4. BRW-05

| | |
|---|---|
| **1. Original requirement** | **Not one of the brief's four deliverables** (`docs/architecture/vision.md:22-27`). It comes from the dossier's "Prepared before travelling" (`PratiBimb-Engineering-Dossier-v4.0.txt:1559`), `agentos/workflows/release.md` (step 3; blocker at line 36) and QG-06. Current text: "A WASM-only build, benchmarked, for the in-extension models (TR-01)" |
| **2. Phase 1 implementation** | ORT is pinned and packaged, and the offscreen page loads it. **No ORT session is created in a normal task.** TR-01 is packaged and hash-checked at build time, and a product bundle has no way to start it (`offscreenCanStartTr01: false`). The reasoner is a native process, outside the extension |
| **3. Missing** | A separate WASM-only build; any benchmark of it. In a normal task there is **no in-extension inference to measure** |
| **4. Available evidence** | M8.2 and M8.2a: QG-03 feasibility measurements for TR-01, including its WASM cells. **Not a product benchmark, and not on a task path.** M20's benchmark measures W1 latency and working set, not in-extension WASM |
| **5. Cannot be claimed** | a benchmarked product WASM path; TR-01 in a task; any performance figure for in-extension inference; that visual-only PII is protected; that any detector is adopted. T1 is UNADOPTED. FR-01 and B-07 are untouched |
| **6. Phase** | **The capability it measures is deferred** (P2-08, P2-03). The criterion sits in Phase 1 only because it was written when TR-01 ran in the task path |

### RD-3

| | |
|---|---|
| **Current state** | `M (as written)`, PARTIAL. §5.14 records it as unresolved |
| **Recommended** | **Re-scope for Phase 1, preserving the original.** Phase 1 reading: *a normal task performs no in-extension model inference*, shown by the existing tests and by smoke checks D1 and D2. The original stays recorded, and binds whichever phase re-activates in-extension inference |
| **Alternatives** | **Retain:** needs an evidence-build TR-01 benchmark, with its own authorisation to load and run the model, and it measures a path normal tasks never use. **Defer outright:** simpler, but drops the useful check that no model runs. **Leave unresolved:** QG-06's literal item can then never pass |
| **Consequences** | **QG-06's text is unchanged by this report.** "A separate WASM-only build, benchmarked" needs a recorded owner decision before a Phase 1 release can treat it as met or out of scope. The identifier and wording stay until the owner acts |
| **Confidence** | **CONFIRMED** |

## 5. REL-03

| | |
|---|---|
| **1. Original requirement** | **Not a brief deliverable.** The nearest brief-level text is the thesis's "Fail closed" principle (`vision.md:79`). Source: the dossier's Sequence 3 (`…v4.0.txt:1543`), `release.md:48`, INV-22, INV-23, and the fail-closed matrix (`security-invariants.md:153,162`). Current text: "Failure path: injected detector timeout masked; repeated verification failures block and are shown" |
| **2. Phase 1 implementation** | **Verification:** `verifyHandoff` runs seven fail-closed checks (`packages/privacy/src/handoff.ts:20-27`). **One failure refuses at once** with `VERIFY_<cause>` (`remote-privacy-boundary.ts:262-264`), and the run stops. **Detector:** `DETECTOR_TIMEOUT` and the fail-closed mask exist on the evidence route. **`DETECTOR_TIMEOUT` is absent from the product bundle** (FACT) |
| **3. Missing** | (a) **A three-failure counter does not exist.** A search of the packages' and host's source for one found none, and `verifyResult.ts:27` says "Nothing here retries anything". (b) A way to force a verification failure in a product build: the seams are test-build only, and whether a page can trigger one is UNKNOWN. (c) "Says so plainly": the panel prints codes, such as `STOPPED_REFUSED — turn 1: stopped (…)` (`task-panel.ts:114-135`). (d) The sequence's "falls back to structure-only": a product is always structure-only |
| **4. Available evidence** | **Type A:** `handoff.test.ts`, `handoffContract.test.ts`, `qg04Fallback.test.ts`, the orchestrator's tests; for the detector, `textRegion.test.ts`, `perceptionPass.test.ts`, `tr01Worker.test.ts`, `visualRedaction.test.ts`. **Type G:** M12's interception suite, **before M23.7.** Evidence-route harnesses exist. **No product-build demonstration exists** |
| **5. Cannot be claimed** | that three consecutive failures are counted; that a product handles a detector timeout (it has no detector); that the failure path was shown on the current build; that the panel explains a block in plain language. **Nothing here implies a detector was adopted or evaluated** |
| **6. Phase** | **Split.** The verification half is Phase 1. The detector half belongs to frame-based perception (P2-08), and stays on evidence builds |

**Whether the first-failure behaviour meets the requirement:** blocking on the first failure is stricter than blocking on the third, so it does not weaken INV-22 (INFERENCE). It is still not what the sequence describes, and that is the owner's to accept.

**The gate mapping is also stale here:** its proposed fallback, "frame withheld, user told" (`quality-gate-mapping-PROPOSED.md:127`), assumes a frame that a normal task no longer has.

### RD-4

| | |
|---|---|
| **Current state** | M, PARTIAL, cell "implemented". §5.14 records it as unresolved |
| **Recommended** | **Re-scope for Phase 1, preserving the original.** Phase 1 reading: *one verification failure blocks the send, with zero outbound requests, and the panel says so.* The detector half is preserved and **deferred** with P2-08. The Sequence 3 wording stays on record |
| **Alternatives** | **Retain as written:** needs a retry counter, which adds behaviour to a path that today simply stops, and a detector a product does not have. **Defer wholly:** loses the Phase 1 check on INV-22. **Leave unresolved:** blocks GOV-05 and QG-06 |
| **Consequences** | Needs a decision on how to demonstrate it. A new product-build seam would cut against OD-S. An A-type test on the real code is available, but is not "a product-build demonstration". **Plain wording for a block would be new UI text** |
| **Confidence** | **CONFIRMED** from source. Whether a fixture can force the failure is UNKNOWN |

## 6. Permissions

### Evidence

| | `tabCapture` | `activeTab` |
|---|---|---|
| **Manifest** | `wxt.config.ts:187`; **one list shared by every build** | same line |
| **What it is for** | `getMediaStreamId` (ADR-0009) | a person's gesture authorising capture (ADR-0009) |
| **Install warning** | **Documented: "Read and change all your data on all websites."** Not observed | Documented: none |
| **Consumers in product source** | `background.ts:41`, a wrapper passed to the capture authority. `:267-268` and `offscreen/main.ts:445`, `typeof` checks only | **None that use it.** No code reads `tab.url`, `tab.title` or a favicon; `sender.url` in `messages.ts` is the sender's own. The name appears in comments and in `activeTabGrants` |
| **Runtime path in a product** | **None reaches it.** `ticketFor` has no caller in the product bundle: its three source callers are evidence-gated (`background.ts:197,213,382`). So the wrapper is present and unreachable | **None.** Chrome still issues the grant on each toolbar click (documented), and nothing uses it |
| **Calls to `getUserMedia` in a product** | **None:** `typeof` only. The inspection reports `callsGetUserMedia: false` | — |
| **In a product build** | Declared; wrapper in `background.js` (`workerMintsCaptureHandles: true`) | Declared |
| **Evidence-build use** | **Required:** the gesture route, `mintStreamId`, `ticketProbe` | **Required:** the toolbar's grant (`background.ts:60-62`) |
| **Harnesses naming it** | `run-gesture-redaction`, `run-stream-j7`, `run-stream-re1`, `run-webp-loopback` | those, plus `run-artifact-verifier`, `run-extension-loop`, `run-gesture-acts`, `run-gesture-capture`, `run-text-region-eval` |
| **Governing text** | ADR-0009; constitution §5 "Capture" row; ADR-0015:77 (PROPOSED) | same |
| **Does a task need it** | No, by source | No, by source. The M20 person-run passed by opening the panel from Chrome's own button (INFERENCE: no toolbar gesture on that route) |

**What removal could break:**

- **From the shared list, in every build:** the gesture route. **It would break every gesture and stream evidence workflow.** Not recommended.
- **From product builds only:** evidence manifests are unchanged, but `judgeBuildSeparation` reports `PERMISSIONS_DIFFER_FROM_PRODUCT` and `MANIFEST_ROUTE_DIFFERS_FROM_PRODUCT` (`build-separation.mjs:130-131`), so the **six OD-V harnesses refuse until that contract is amended**. A search finds neither check in the two gesture harnesses, so they appear unaffected; confirm that in the implementation.
- **Tests that pin the four permissions and would change:** `csp-product-phase.mjs:23` and its test (`:14,61-63`), `buildSeparation.test.ts:159-162,429`, `domOnlyPhase1.test.ts:160-161`, `product-build-inspection.test.mjs:39,63`, and the fixtures that copy them.
- **In the product itself:** no breakage is expected, because `chrome.tabCapture` is read lazily or with `?.` (INFERENCE from source). **Not browser-verified.**
- **Later:** Phase 2 would re-add them. Under the documented warning, `tabCapture` would then prompt existing users on update. No users exist today.

### RD-5 and RD-6

| | **RD-5 `tabCapture`** | **RD-6 `activeTab`** |
|---|---|---|
| **Current state** | Declared in every build; no product path; review raised in M23.13 | same |
| **Recommended** | **REMOVE from product builds only,** in a separately authorised change; retain in evidence builds | **REMOVE from product builds only,** in the same change |
| **Why** | A product that says it captures nothing should not declare capture, and it carries the broadest documented warning. Removal also turns "nothing calls it" into "Chrome would refuse it" | Each toolbar click issues a grant nothing uses. Less urgent alone (no warning), but it has no reason to stay once `tabCapture` goes |
| **Alternative: RETAIN** | no work, and the evidence contract stays simple. The product keeps authority it cannot use, and the mismatch with the privacy text stays | same, with lower cost |
| **Alternative: DEFER** to OD-M or OD-N | avoids churn if Phase 2 is near. But any smoke test before it validates a manifest that later changes | same |
| **Consequences** | Amends the M23.10 contract: an evidence build then legitimately holds **more** authority than a product. That is already true of its code. ADR-0015's permission list (its line 77) would need updating before approval. **Evidence-build runtime stays UNVERIFIED either way** | same |
| **Confidence** | **PARTIAL:** no product path is CONFIRMED by source and bundle. Harmless removal is INFERENCE until a browser run | **PARTIAL,** same |

## 7. Other outstanding decisions

**Relevant to the next Phase 1 acceptance steps. None is closed or approved here.**

| Item | Status (FACT) | Why it matters next | Blocks the smoke test? |
|---|---|---|---|
| **GOV-01** | AWAITING OWNER APPROVAL | Until it is approved, no smoke result counts toward an accepted criterion | No: the run is labelled evidence, not acceptance |
| **OD-N, ADR-0015** | PROPOSED | **The DOM-only product departs from the constitution's capture row, and no approved ADR records that** (`AGENTS.md` §4.1). OD-R is approved; the ADR is not. RD-5 and RD-6 would change its text | No, but it should precede any acceptance |
| **OD-A** (with OD-G) | AWAITING | `BRW-04` says "each browser accepted". This defines that list | No: the smoke test is Chrome only |
| **OD-B, OD-C, OD-D** | AWAITING | Cross-machine, independent human and real-site evidence for FUN-01 | No: they follow it |
| **OD-E1, QG-04-S** | AWAITING; unsigned | The proposed Phase 1 security gate | No |
| **QG-04-F** | BLOCKED; unsigned | Keeps frame egress impossible. Nothing in Phase 1 needs it signed | No |
| **OD-E2, F-M13-1** | Open residual | Top-level navigation is outside CSP (ADR-0013 §9). Bears on any scope beyond loopback | No, on loopback |
| **OD-E3, B-02** | OPEN; its ADR is unwritten | How Invariant-E mechanism 2 is enforced, which S6 of QG-04-S depends on | No |
| **OD-E4 to OD-E7** | AWAITING | ADR-0006's tier and the ADR-0005, 0007, 0008 values. **ACT-02 to ACT-05 cannot close without them.** The smoke test exercises the current values, which are not approved | No, but label it |
| **OD-F** | AWAITING | PRV-03. Decides what Phase 1 says about visual-only PII | No |
| **OD-H** | AWAITING | PRF-03 thresholds | No |
| **OD-K** | AWAITING | K2: is a Phase 1 without a local vision model acceptable against the brief? `traceability-matrix.md` §1.6 sets out the gap | No |

**Not relevant to the next Phase 1 steps, and unchanged:** OD-O and OD-Q (T1 is not in a product build); OD-L (register hygiene); OD-M (Phase 2 timing, unless RD-5 is deferred to it); OD-E8; **J7/B5,** which concern frame handoff (ADR-0012), and are OPEN. **FR-01 stays DEFERRED — NOT AUTHORISED. B-07 stays BLOCKED,** and the blocked evaluation was not attempted.

## 8. Chrome smoke-test readiness

**No smoke test is authorised by this report. None of the following was run.**

| Item | State | Label |
|---|---|---|
| Product build | **Available:** `apps/extension/.output/chrome-mv3`, built from `13d0447`, inspected with `problems: []`. All 9 compared files still match M23.15's record, and only a test and documents have changed since. The harness rebuilds anyway | FACT |
| Chrome | **Chrome for Testing 153.0.8010.12** is what M20 recorded. A binary exists at the README's path; **its version was not read, because that would run it.** `CHROME_PATH` is not set in this shell. `minimum_chrome_version` is 116; only 153 has been used | FACT; version INFERENCE |
| Reasoner | Model file and runtime binary **exist** (not opened, not hashed). `npm run reasoner:check` was not run. Ports 8995 and 8977 | FACT |
| Test page | `tests/browser/demo/fixture/application.html`, on `http://127.0.0.1:8975/fixture/`, served by the harness. Synthetic values only | FACT |
| Scenarios | `allow`, `deny` | FACT |
| Harness verdict | **Does not establish DOM-only behaviour.** It judges consent, event order, one click and page state. Section D is manual | FACT |
| Harness records | Hard-coded into the M20 logs directory. A `failure` string can carry a local path, as the untracked `…005918Z` record shows | FACT |
| Harness and offscreen | Creates the document itself (`:226`), so the panel's own creation is not exercised unless a separate check does so | FACT |
| Failure-path runs | The harness would judge a deliberate failure as `FAIL`, so they need their own session | INFERENCE |
| Prior person-run evidence | M20 `PASS` records, **all before M23.7.** The two untracked `FAIL` records are sessions ended by a closed browser, not task failures | FACT |

**Verdict: procedurally ready. It should wait for RD-9,** because RD-1, RD-2, RD-5 and RD-6 would each change what is under test.

### Proposed procedure

**Authorisation must state:** the commit; that it may build (the build's own hook reads and hashes TR-01), run the local language model (inference) and open a browser; who operates it; and where the record goes.

**Setup, in order:**

1. Clean tree apart from unrelated records, at the commit under test, with no evidence flag set.
2. In its own terminal, `npm run reasoner`. Leave it running.
3. Set `CHROME_PATH` to Chrome for Testing, then start `node tests/browser/extension/run-product-smoke.mjs --scenarios allow,deny`.
4. Once it has built, in another terminal, `node tests/browser/extension/inspect-product-build.mjs`. It must exit 0 with `"problems": []`.
5. Record the operator's role, machine, OS, browser version, commit and date.

**A stop rule applies throughout: any frame capture, tab-capture indicator, model-file load or TR-01 worker fails the whole run, however well the task went.**

### Expected-results checklist

**IDs A1 to G4 are those in `dom-only-browser-smoke-procedure-PROPOSED.md`, which this report does not edit. NEW marks an addition, adopted only if the owner approves. Expectations assume the current build, and A2, A7 and C change if RD-2, RD-5 or RD-6 are adopted.**

**Installation and identity**
- [ ] A1 Loads with no error, named **PratiBimb — Page Assistant (Development build)**.
- [ ] A2 Permissions match `manifest.json`; host access `http://127.0.0.1/*` only.
- [ ] A3 The panel renders, styled, with the approved description and privacy text and **no Capture field**.
- [ ] A4 The toolbar title is **PratiBimb — Page Assistant**.
- [ ] A5, A6 The toolbar button and `Alt+Shift+P` open the panel. Repeated clicks start nothing.
- [ ] A7 Status box as approved. No `captureStatus`, no `NO_GRANT`.
- [ ] **NEW A8** Record what the `NEEDS_USER` line says **while consent is pending.** Expected today: `none`, which is wrong (§3).
- [ ] **NEW A9** Record whether Chrome shows the `justification` anywhere the operator can see. This is the only way to reduce RD-1's UNKNOWN.

**DOM-only behaviour**
- [ ] B1 to B4 With no toolbar click: controls listed, expectation added, consent appears, value restored once, one click, result confirmed.
- [ ] B5 **No tab-capture indicator,** throughout.
- [ ] C1 to C4 After a toolbar click: `__host.captureState().grants` is `[]` before and after; no capture wording.
- [ ] D1, D2 No `t1-ui-head.onnx`, `tr01-ppocrv4-mobile-det.onnx` or `.wasm` loaded; no `tr01-worker.js` thread.
- [ ] D3 to D5 No grants; no `CAPTURE_FRAME` or `CAPTURE_TICKET` traffic; no image data in `__host.seen`.
- [ ] D6 `ports.perception` is `[]`, `perceptionBoot` is `null`, `capability` is `{ backend: "none", tiers_fired: ["T0","T2"] }`, all elements' `source` is `"dom"`, and `elements` is non-empty.
- [ ] D7 None of the four hook names is on `__host`.

**Grounding, click and postconditions**
- [ ] F1 Reload between "Read this page" and "Start task": refused, nothing clicked. *Own session.*
- [ ] F2 Change the declared control's label: `DECLARATION_STALE`, nothing clicked. *Own session.*
- [ ] F3 Trail: refresh before the click, one click, fresh observation before verification.
- [ ] F4 Never more than one click per confirmed turn. The page's own count agrees.
- [ ] **NEW F5** The harness's checks hold: `consentBeforeRestoreBeforeClickBeforeVerify`, `agentAuthorisedAndDispatchedExactlyOneClick`, `clickVerifiedByThePage`.

**Turn limit**
- [ ] **NEW T1** In every run, `task.result.loop.turns.length` is at most **3,** the panel's budget.
- [ ] **NEW T2** With no run in progress, from the service worker's console: `await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_START", answer: {}, maxTurns: 6 })`. Expected: `{ ok: false, refused: "INVALID_TURN_BUDGET" }`, and no task starts.
- **Not established by this smoke test:** a run actually stopping at five. A person cannot request it through the panel. The evidence stays type A: `domOnlyTaskPath.test.ts:678,691`, `packages/orchestrator/test/loop.test.ts:171`.

**Consent**
- [ ] E1 Names the site, field and kind of value; masked preview only; exactly "Allow once" and "Deny".
- [ ] E2 "Deny": nothing restored, nothing clicked, the panel says so. Expected outcome `STOPPED_REFUSED`.

**Failure and fail-closed. NEW. A separate session, whose harness verdict does not apply**
- [ ] **I1** Press "Read this page" on `about:blank`: "Could not read the page", nothing clicked.
- [ ] **I2** Stop the reasoner, then start a task. Expected: **either** a stop, **or** a run labelled `DETERMINISTIC_FALLBACK` ending `STOPPED_SINGLE_TURN_PLANNER` (FUN-06; `machine.ts:701-708`). Consent and the declared result still apply. **An unlabelled completion is a FAIL.** The exact path has not been observed.
- [ ] **I3** Press "Start task" twice quickly: one run only.
- **Not covered:** a verification failure on the product build (§5, RD-4); a worker restart mid-task.

**CSP and loopback**
- [ ] G1 to G3 `https://example.com/`, `:8977/health` and `:8995/health` are each blocked by CSP, in the offscreen console.
- [ ] G4 The reasoner's terminal shows requests only during tasks, only on `/v1/chat/completions`.

**Evidence and privacy boundaries**
- [ ] **No stored value, preview text, page text, prompt or model output** in any record. The harness refuses to write fixture values (`leaksIn`).
- [ ] Screenshots only where they show no value. **No screen or tab recording.**
- [ ] **Read the record before committing it.** Remove nothing silently: a local path in `failure` needs a decision, not an edit.
- [ ] Do not overwrite anything. Decide where the record belongs: it lands in the M20 logs unless the harness is changed.
- [ ] Synthetic pages only. No real site, account or personal data.

**A pass means:** on this machine, with this operator, on this fixture, once. **It is evidence type C.** It is not a reliability, cross-machine, independent-operator, real-site or performance claim, and **it accepts nothing.**

## 9. Risks and dependencies

| Risk | Consequence | Mitigation |
|---|---|---|
| Removing `HOST_STATUS` while tidying the panel | Tasks likely stop working, and the harness would not show it, because it creates the document itself | Keep the call. Add a guard when RD-2 is implemented |
| Smoke test before RD-1, 2, 5, 6 | A valid run on a build that then changes | RD-9's order |
| Permission removal and evidence builds | The six harnesses refuse until their contract changes. **Their runtime is already UNVERIFIED,** so a break could go unnoticed | Keep evidence manifests byte-identical, test the amended contract, and say evidence runtime stays unverified |
| Reading the harness's `PASS` as DOM-only proof | A false claim | Section D is mandatory, and is recorded separately |
| Documents overstating behaviour | "No capture call", REL-03's "implemented" | RD-7 |
| Documentation-only facts (Chrome's warning, `justification` display) | They may not match this Chrome | A9; read the warning at a real install. Stays labelled until observed |
| ADR-0015 remains PROPOSED | The DOM-only product has no approved ADR behind its departure from the constitution | OD-N, before any acceptance |
| One operator, one machine, one run | Tells nothing about reliability | OD-B, OD-C, REL-01, after the smoke test |

**Dependency order (INFERENCE; a proposal, not a schedule):** RD-1, 2, 5, 6, 7, 8 → one narrow implementation milestone → RD-10 smoke test → GOV-01 and OD-N → OD-A, OD-E1 → RD-3 and RD-4 applied to the criteria → wider evidence.

## 10. Owner decisions required

**RD-1 to RD-6 are set out in full above.**

### RD-7: Three corrections to earlier documents

| | |
|---|---|
| **Current state** | (a) "**A real product build has no capture call**" (`core-product-acceptance-PROPOSED.md:50`, written in M23.15; the same phrase is in `owner-decisions.md:408`, the M23.9 row of `state.md`'s log, `CHANGELOG.md:71`, and the M23.12 record). **FACT:** the worker holds a `getMediaStreamId` wrapper, and the inspection reports it. Nothing can reach it. (b) BRW-05 cites "§6 of the gate mapping", which has only three sections. (c) REL-03's cell says "implemented", and the three-failure part is not |
| **Recommended** | **Authorise corrections.** (a) becomes *"no reachable capture path; an unreachable minting wrapper remains in the worker"*, in living documents only, with records left as they are. (b) points to where the option is recorded. (c) states what exists |
| **Alternatives** | Leave them: the documents keep overstating. Correct (a) only: leaves two known errors |
| **Consequences** | Documents only. (b) and (c) touch criterion rows, which is why they are not made here. RD-5 would change (a)'s wording again |
| **Confidence** | **CONFIRMED** |

### RD-8: The panel's turn budget

| | |
|---|---|
| **Current state** | **FACT:** `checkTurnBudget(msg.maxTurns ?? 3)` (`offscreen/main.ts:684`). The panel sends no `maxTurns`. The ceiling is `MAX_TASK_TURNS = 5` (`loop.ts:43`), refused above, never clamped. Documents say "at most 5" |
| **Recommended** | **Retain 3,** and record both numbers wherever the limit is described: 3 from the panel, 5 as the enforced ceiling |
| **Alternatives** | Raise the panel to 5: more model calls per task, and a changed behaviour that needs its own authorisation. Let a person choose: new UI, with no stated need |
| **Consequences** | Wording only, if retained. The five-turn cap is unchanged |
| **Confidence** | **CONFIRMED** |

### RD-9: Order of work

| | |
|---|---|
| **Current state** | Nothing scheduled |
| **Recommended** | **Decide RD-1, RD-2, RD-5 and RD-6 → implement them in one narrow, separately authorised milestone → then the smoke test** |
| **Alternatives** | Smoke test now, on the current build: earlier real evidence, and it could find larger problems first, but sections A, C and D would need repeating after any change. Reasonable if the owner most wants first contact with a real browser |
| **Consequences** | One milestone before first browser contact since M23.7. **That delay is the real cost of this recommendation** |
| **Confidence** | **INFERENCE** |

### RD-10: Authorising the smoke test

| | |
|---|---|
| **Current state** | Not authorised |
| **Recommended** | **Authorise it after RD-9,** using §8's additions, stating the commit, the operator and the record's location |
| **Alternatives** | Authorise the existing procedure unchanged: no turn-limit or failure checks. Decline for now: no real evidence for M23.7 to M23.15 |
| **Consequences** | Runs the local language model, a build and a real browser. Produces type C evidence only |
| **Confidence** | **PARTIAL:** prerequisites exist by file. None was started |

## Sources

- **Source, at `0fd9f49`:** `apps/extension/host/background.ts`, `host/sidepanel/{main.ts,index.html}`, `host/offscreen/{main.ts,index.html}`, `host-lib/{capture-authority,toolbar-action,remote-privacy-boundary,task-panel,messages}.ts`, `wxt.config.ts`; `packages/orchestrator/src/{loop,machine}.ts`, `packages/privacy/src/handoff.ts`, `packages/agent/src/verifyResult.ts`.
- **The existing product build's text:** `apps/extension/.output/chrome-mv3/` (JavaScript, pages and manifest; no model opened).
- **Harness and contract, read only:** `tests/browser/extension/run-product-smoke.mjs`, `tests/browser/support/{build-separation,csp-product-phase,product-build-inspection}.mjs`.
- **Governing text:** dossier v4.0, `agentos/workflows/release.md`, `agentos/gates/README.md`, `docs/architecture/{vision,constitution}.md`, `docs/security/security-invariants.md`, ADR-0009, ADR-0012, ADR-0013, ADR-0015.
- **Acceptance documents:** the core proposal, traceability matrix, gate mapping, smoke procedure and owner-decision register.
- **Records:** `artifacts/experiments/M20-runnable-measured-product/logs/` (fields read, no values), the M23.15 logs.
- **Chrome documentation, read 2026-11-06 (documented, not observed):** `developer.chrome.com/docs/extensions/reference/api/offscreen`, `…/reference/permissions-list`, `…/develop/concepts/activeTab`, `…/reference/api/tabCapture`. They were read through a summarising fetch. The `justification` sentence was also read directly in the local WXT types.
