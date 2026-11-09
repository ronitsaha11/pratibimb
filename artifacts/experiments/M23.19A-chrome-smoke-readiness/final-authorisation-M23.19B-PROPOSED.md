# M23.19B — final Chrome smoke-test authorisation record — FOR THE OWNER

> **Status: PREPARED, NOT APPROVED (M23.19B, 2026-11-08). Every approval field below is PENDING.**
> - **Updated M23.19C (2026-11-08):** the owner's scenario decisions are recorded: **G1 and G3 EXCLUDED, outside the approved fixture; G4 NOT RUN.** No page or fixture is substituted for them. Everything else keeps its proposed scope and PENDING status. **Agreeing these exclusions authorises nothing:** F1 to F5 stay PENDING.
> - **Built on:** `README.md`, `smoke-test-procedure-PROPOSED.md` and `authorisation-checklist-PROPOSED.md` in this directory (M23.19A).
> - **This record is not permission to execute.** Nothing in it may be done until the owner has changed each field they approve from PENDING to APPROVED, and signed §8.
> - **During preparation,** Chrome was not launched, the extension was not loaded, the reasoner was not started, and no scenario was run.

## 1. Preparation choices the owner has made

These close M23.19A's checklist items 1, 2, 3, 6, 7 and 8 as **choices**. They become authority only through §2 and §8.

| Choice | Value | M23.19A item |
|---|---|---|
| Human operator | **the project owner (the user).** Recorded by role, owner, so the evidence is type C | 3 |
| Mode | **manual Chrome testing,** following `smoke-test-procedure-PROPOSED.md`. The M20 harness is not used | 8 |
| Product build | **built from `8d3ce5f`,** in `apps/extension/.output/chrome-mv3`. It must pass the 9-file hash check in `logs/expected-product-build.sha256` immediately before the test | 1 |
| Browser | **Chrome for Testing 153.0.8010.12** (`%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe`), in a new, empty, temporary profile | 2 |
| Fixture | **`http://127.0.0.1:8975/fixture/` only,** served by `node tests/browser/demo/server.mjs`. No other page or fixture is used | 4, in part: G1 and G3 excluded (§4) |
| Evidence directory | **`artifacts/experiments/M23.19-chrome-smoke-test/`** | 6 |
| Screenshots | **of the side panel only, showing synthetic data only** | 7 |

## 2. Final approvals required

| # | Approval | What it permits | Status |
|---|---|---|---|
| **F1** | **Starting the local reasoner** | `npm run reasoner`: a llama.cpp model server on `127.0.0.1:8977`, keyed per launch, and the front on `127.0.0.1:8995/v1/chat/completions` | **PENDING** |
| **F2** | **Reading and hashing the model weights** at startup | the launcher's own verification: the `Qwen2.5-0.5B-Instruct` Q4_K_M file's size and full SHA-256, then the runtime's. Nothing else reads the weights | **PENDING** |
| **F3** | **Local model inference** for the approved synthetic task | the model plans from the structure-only handoff of the synthetic page, on loopback | **PENDING** |
| **F4** | **Executing the browser scenarios** | the scenarios in §4 marked IN SCOPE, each subject to its own status | **PENDING** |
| **F5** | **Creating the evidence directory and writing results** | `artifacts/experiments/M23.19-chrome-smoke-test/`, with `README.md`, `decision.md`, `logs/w1-m23-19-smoke-record.json` and, if F4 runs, panel screenshots. **Committed only after the owner has read them** | **PENDING** |

**F1, F2 and F3 go together:** the reasoner cannot start without hashing the weights, and a task cannot run without inference. Approving F4 without them leaves only sections A and B runnable.

## 3. Authorisation boundaries

These hold for every scenario, whatever is approved.

- **The normal Phase 1 product build only.** No evidence build, no evidence flag, no evidence harness, no `npm run build`.
- **No browser-frame capture.** No T1 or TR-01 inference.
- **No real personal data:** only the fixture's synthetic values, and the goal sentences in the procedure.
- **No external network destinations.** Only the extension's own files, `127.0.0.1:8975`, `127.0.0.1:8995` and the CSP-blocked loopback probes in H3. Nothing is fetched beyond loopback, by anyone.
- **No detector evaluation, no training, no TEST data, no ONNX export.**
- **No change** to the product, its permissions, CSP or egress, the turn budget, the page's code or the extension's files.

## 4. Scenario-by-scenario authorisation

**Needs:**
- **F4:** the browser alone, without the reasoner.
- **F1–F3:** a running reasoner and inference.
- **EXCLUDED / NOT RUN:** decided by the owner in M23.19C. These are not executed, and are recorded with that state and reason.

| ID | Scenario | Needs | Expected outcome | Status |
|---|---|---|---|---|
| A1 | Extension card in `chrome://extensions` | F4 | loads with no error; named **PratiBimb — Page Assistant (Development build)** | **PENDING** |
| A2 | Its Details | F4 | no capture-implying permission; site access `http://127.0.0.1/*`; **no** "Read and change all your data on all websites". Record exactly what Chrome shows | **PENDING** |
| A3 | Toolbar tooltip | F4 | **PratiBimb — Page Assistant** | **PENDING** |
| A4 | Identity wording | F4 | no "minimal host", "minimal MV3", "experiment" or "not the product" anywhere visible | **PENDING** |
| A5 | Warnings | F4 | each recorded as seen. None expected; none inferred | **PENDING** |
| A6 | The offscreen justification | F4 | recorded as **seen, and where**, or **not seen**. Not seen does not prove it is never shown | **PENDING** |
| B1 | Inspect views, before the panel opens | F4 | `service worker` at most; **no `offscreen.html`** | **PENDING** |
| B2 | Toolbar click on `/fixture/` | F4 | side panel opens on that tab, with the approved heading, description and privacy sentence; **no capture prompt, no grant asked for** | **PENDING** |
| B3 | Inspect views, after | F4 | **`offscreen.html` now listed:** `HOST_STATUS` created it | **PENDING** |
| B4 | The panel | F4 | **no Status box;** no `NEEDS_USER`, `captureStatus`, `NO_GRANT` or worker identifiers | **PENDING** |
| B5 | `__host.captureState().grants` | F4 | `[]` | **PENDING** |
| B6 | `Alt+Shift+P`, then three toolbar clicks | F4 | panel opens; repeated clicks start nothing; grants still `[]` | **PENDING** |
| B7 | Throughout | F4 | works with neither `activeTab` nor `tabCapture`: no permission prompt, no card error | **PENDING** |
| C1 | Goal, then **Read this page** | F4 | controls listed; names `127.0.0.1:8975` | **PENDING** |
| C2 | Declare **Submit application** / **It becomes unavailable**; **Start task** | F4, F1–F3 | the expectation is listed; the run starts; consent appears | **PENDING** |
| C3 | **Allow once** | F4, F1–F3 | **completed:** *Application submitted*, Submit greyed out, the declared result reported. **Or a safe stop,** with its code recorded. A safe stop is not a FAIL | **PENDING** |
| C4 | Tab strip and window | F4, F1–F3 | **no tab-capture indicator,** no screen-sharing bar | **PENDING** |
| C5 | Offscreen resources | F4, F1–F3 | no `t1-ui-head.onnx`, no `tr01-ppocrv4-mobile-det.onnx`, no `.wasm` | **PENDING** |
| C6 | Offscreen threads | F4, F1–F3 | no `tr01-worker.js` | **PENDING** |
| C7 | `TASK_STATUS`: four named fields only | F4, F1–F3 | perception `[]`; perceptionBoot `null`; each capability `{ backend: "none", tiers_fired: ["T0","T2"] }`; every element's source `dom` | **PENDING** |
| C8 | Image data in `__host.seen` | F4, F1–F3 | `false` | **PENDING** |
| C9 | Hook names on `__host` | F4 | `[]` | **PENDING** |
| D1 | Page click count | F4, F1–F3 | `1` if clicked, `0` if stopped first; **never more than one per confirmed turn** | **PENDING** |
| D2 | Clicked control | F4, F1–F3 | the declared one | **PENDING** |
| D3 | Result line | F4, F1–F3 | the declared expectation verified (`CONFIRMED`), or the stop names why | **PENDING** |
| D4 | **Stale target:** read, reload, start | F4, F1–F3 | **refused; nothing clicked;** code recorded (for example `DOCUMENT_CHANGED` or `DECLARATION_STALE`); click count `0` | **PENDING** |
| E1 | Consent screen | F4, F1–F3 | site, field and kind of value; **masked preview only;** exactly **Allow once** and **Deny** | **PENDING** |
| E2 | During consent | F4, F1–F3 | nowhere says `NEEDS_USER` | **PENDING** |
| E3 | **Deny** | F4, F1–F3 | **nothing restored, nothing clicked;** `STOPPED_REFUSED` shown | **PENDING** |
| E4 | Throughout | F4 | synthetic values only; nothing typed but the procedure's goal sentences | **PENDING** |
| F1s | Turn setting | F4 | none offered; no number of turns claimed | **PENDING** |
| F2s | Turn count | F4, F1–F3 | **at most 3** per task. 5 is the enforced ceiling, unreachable from the panel | **PENDING** |
| F3s | Budget manipulation | — | **not done:** prohibited | **PENDING** (confirmation) |
| G1 | **Invalid target** on `about:blank` | — | not executed | **EXCLUDED — OUTSIDE THE APPROVED FIXTURE** (owner, M23.19C) |
| G2 | **Stale target** | F4, F1–F3 | as D4 | **PENDING** |
| G3 | **Failed postcondition** on `/declared/` | — | not executed | **EXCLUDED — OUTSIDE THE APPROVED FIXTURE** (owner, M23.19C) |
| G4 | **Unsupported operation** | — | not executed: it cannot be induced without manipulation, which is prohibited. If the model proposes one by itself during another scenario, the result must show it refused with nothing done, and that is recorded as an observation under that scenario | **NOT RUN — REQUIRES PROHIBITED MANIPULATION** (owner, M23.19C) |
| G5 | **Reasoner unavailable,** run last | F4, F1–F3 | after stopping the reasoner: **one turn labelled `DETERMINISTIC_FALLBACK`, ending `STOPPED_SINGLE_TURN_PLANNER`,** with consent still asked before any restoration; or a refusal with nothing done. **An unconsented action or an unlabelled completion is a FAIL.** The reasoner is not restarted | **PENDING** |
| H1 | Offscreen Network panel | F4, F1–F3 | requests only to the extension's files and `127.0.0.1:8995/v1/chat/completions` with its preflight | **PENDING** |
| H2 | A reasoner request's headers and size | F4, F1–F3 | `application/json`; no image or multipart. **Its body is never copied** | **PENDING** |
| H3 | Loopback probes to `:8977/health` and `:8995/health` | F4 | `TypeError` with a CSP violation, each. Loopback only | **PENDING** |
| H4 | Reasoner terminal | F1–F3 | requests only during tasks, only to `/v1/chat/completions`; no `422` tripwire lines | **PENDING** |
| H5 | The record, before saving | F5 | no value, preview, page text, prompt, model output, token or local path | **PENDING** |

**Because G1 and G3 are excluded,** this test does not observe invalid-target or failed-postcondition behaviour in a browser. That behaviour stays established only by tests under fakes. The record lists G1 and G3 as EXCLUDED and G4 as NOT RUN, each with its reason, and **no other page or fixture is substituted** for them.

## 5. Order of execution

1. Setup: procedure §1, steps 1 to 9.
2. A, B, C, D, E, F, G2.
3. H, observed during C.
4. G5, last.
5. Shutdown: procedure §5.

G1, G3 and G4 are not executed.

## 6. Stop conditions

**Stop immediately, record what was seen, and shut down (procedure §5) on any of:**

1. **An unexpected permission request** of any kind.
2. **External network activity:** any request to an origin other than the extension's own files, `127.0.0.1:8975` and `127.0.0.1:8995`.
3. **Unexpected capture behaviour:**
   - a tab-capture indicator, a screen-sharing bar or a capture prompt;
   - a model file or `.wasm` loaded by the offscreen document;
   - a `tr01-worker.js` thread.
4. **An action outside the approved scenarios:**
   - a click on anything but the declared control, or a second click in a turn;
   - any action without consent where consent is required;
   - anything the operator did not do or cannot explain.
5. **A stored value or real personal data** where it should not be.
6. **An identity failure:** the build's hash check, `chrome://version`, or the reasoner's `/health`.
7. **An extension error** on its card at load.

**After a stop:** nothing is retried within the session. A further session needs the owner's decision.

## 7. Evidence handling

| Rule | |
|---|---|
| **Location** | `artifacts/experiments/M23.19-chrome-smoke-test/` only, created under F5. Nothing is written to M4, M5, M5.1, M20 or any other historical directory |
| **No overwriting** | a failed or interrupted run is recorded as such. It never replaces an earlier record, and a later re-run gets its own record |
| **Recorded** | date and local time; operator role (owner); commit; build identity (hash check result); Chrome version; the manifest as Chrome shows it; each scenario's ID, state and observation, as codes or plain words; minimal console errors with paths and values removed; reasoner health, lock and shutdown; deviations |
| **Never recorded** | personal browser data; real private information; stored values, preview text, page text, prompts or model output; model weights; the reasoner's per-launch key or any secret; unredacted local paths |
| **Screenshots** | **side panel only, showing synthetic data only.** Not the fixture page, which shows synthetic identifiers. Not DevTools, Chrome's other pages, the desktop or any other application. Each is checked before it is kept |
| **States** | each scenario is PASS, FAIL, NOT RUN or BLOCKED. A FAIL is not re-run in order to pass. Both attempts are recorded, in order |
| **Review** | the owner reads the record before anything is committed. Commits are local, with explicit staging |
| **Not claimed** | a pass is evidence type C, on W1, once, on synthetic pages. It accepts no criterion, signs no gate, and says nothing about reliability, other machines, independent operators, real sites or performance |

## 8. Owner's final approval

| Field | Value |
|---|---|
| F1: Start the local reasoner | **PENDING** |
| F2: Read and hash the model weights at startup | **PENDING** |
| F3: Local model inference for the approved synthetic task | **PENDING** |
| F4: Execute the scenarios marked in §4 | **PENDING** |
| F5: Create the evidence directory and write results | **PENDING** |
| Scenario scope | **Decided (owner, M23.19C):** G1 and G3 EXCLUDED, G4 NOT RUN. **This is a scope decision, not an execution approval** |
| Boundaries (§3), stop conditions (§6) and evidence rules (§7) accepted | **PENDING** |
| Approved by | **PENDING** |
| Date and time | **PENDING** |
| Session window | **PENDING** |

**EXECUTION STATUS: NOT AUTHORISED — AWAITING FINAL OWNER APPROVAL.**

---

## 9. Addendum — owner approval given in chat (appended in M23.19, 2026-11-08)

> **Append-only.** §1 to §8 above, and the status line before this section, are unchanged from `3e0c40c`. They record the state before approval. This section records the approval that followed, and where it was given.

| Field | Value |
|---|---|
| F1: Start the local reasoner | **APPROVED** (in chat) |
| F2: Read and hash the model weights at startup | **APPROVED** (in chat) |
| F3: Local model inference for the approved synthetic task | **APPROVED** (in chat) |
| F4: Execute the scenarios marked in §4 | **APPROVED** (in chat), as "the approved manual Chrome scenarios" |
| F5: Create the evidence directory and write results | **APPROVED** (in chat) |
| Scenario scope | unchanged and restated in the approval: G1 and G3 EXCLUDED, G4 NOT RUN, no substitute page, no other fixture or external destination |
| Boundaries (§3), stop conditions (§6) and evidence rules (§7) | **not marked "accepted" in those words.** The approval gave its own stop conditions, consent and action discipline, and evidence rules, and directed that the scope not be expanded |
| Approved configuration | operator: the project owner; manual Chrome, not the M20 harness; build `apps/extension/.output/chrome-mv3` from `8d3ce5f`; Chrome for Testing 153.0.8010.12; `http://127.0.0.1:8975/fixture/` only; reasoner `http://127.0.0.1:8995/v1/chat/completions`; evidence `artifacts/experiments/M23.19-chrome-smoke-test/`; screenshots side panel only, synthetic data only |
| Approved by | the project owner |
| Date and time | 2026-11-08 02:13:56 IST (2026-11-07T20:43:56.859Z), the session transcript's timestamp for the approval message |
| Session window | not stated in the approval |
| Not authorised by it | QG-04, ADR-0015, GOV-01, FR-01; push, PR or merge |
| Execution record | `artifacts/experiments/M23.19-chrome-smoke-test/` |

**EXECUTION STATUS (from this addendum): AUTHORISED IN CHAT BY THE OWNER, 2026-11-08 02:13:56 IST, WITHIN THE SCOPE ABOVE.**
