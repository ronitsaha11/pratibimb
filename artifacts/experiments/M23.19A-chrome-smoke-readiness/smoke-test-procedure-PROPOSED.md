# M23.19 — human-operated Chrome smoke test — procedure — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED (M23.19A, 2026-11-08). NOT AUTHORISED. NOT RUN.**
> - **It needs the owner's explicit authorisation,** recorded in `authorisation-checklist-PROPOSED.md`. Until then, none of it is to be done.
> - **What running it involves:** starting the local reasoner, which reads and hashes the model weights and then runs inference; launching Chrome for Testing; loading the extension; operating a synthetic page.
> - **What a pass means:** on W1, with this operator, on the synthetic fixture, once. Evidence type C. It is not a reliability, cross-machine, independent-operator, real-site or performance claim, and **it accepts no criterion**.
> - **Relation to `docs/acceptance/dom-only-browser-smoke-procedure-PROPOSED.md`:** that procedure drives the M20 harness. This one is manual, for the reasons in §0, and maps to its check IDs where they overlap. That document is not changed.

## Result states

Every check gets exactly one:

| State | Meaning |
|---|---|
| **PASS** | the expected result was observed |
| **FAIL** | something else was observed. Record what, as codes or plain words, never values |
| **NOT RUN** | not attempted, with the reason |
| **BLOCKED** | could not be attempted, because something before it failed or a stop condition fired |

## 0. Mode: manual, not the M20 harness (recommended)

`tests/browser/extension/run-product-smoke.mjs` is not used, for three reasons. Each is FACT, from its source:

| What the harness does | Why that matters here |
|---|---|
| Rebuilds the product before launching (`execSync("npm run build")`) | the build under test would be a new one, not the inspected one |
| Calls `__host.ensureOffscreen()` itself, before the person opens the panel | **check B3 could not be observed:** that `HOST_STATUS` creates the offscreen document |
| Writes its record into `artifacts/experiments/M20-runnable-measured-product/logs/` | the record would sit among the historical M20 evidence, not in M23.19's directory |

**The cost of manual mode:** there is no automatic, value-free event trail or judged record. The operator records codes by hand (§6), and section D reads a few named properties in DevTools.

**Harness mode needs its own decision** (`authorisation-checklist-PROPOSED.md`, item 8).

## 1. Before starting

Record the date and local time, the operator's role (as the owner states it), the machine (W1), the commit and the browser version.

1. **The checkout.** Branch `spike/m22-small-target-recall`, with a clean tree apart from the two untracked M20 records. **Do not run `npm run build`,** or anything that builds: it would replace the build under test.
2. **The build's identity.** In a terminal at the repository root, each line must print `OK`:

   ```bash
   (cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.19A-chrome-smoke-readiness/logs/expected-product-build.sha256)
   ```

   **Any `FAILED` line is a stop: the build is not the one inspected.** The 9 hashes are M23.18's record of the product build from `8d3ce5f`. The parentheses keep the terminal out of `.output`: a terminal left there can block a later build.
3. **The inspection,** read-only. It must exit 0 with `"problems": []`:

   ```bash
   node tests/browser/extension/inspect-product-build.mjs
   ```

4. **The ports.** 8975, 8977 and 8995 must be free (in PowerShell: `Get-NetTCPConnection -LocalPort 8975,8977,8995 -State Listen` prints nothing).
5. **The reasoner,** in its own terminal, left running. **This reads and hashes the model weights, then serves inference:**

   ```bash
   npm run reasoner
   ```

   It must print its model and runtime checks, and then the endpoint. Then, in another terminal:

   ```bash
   curl -s http://127.0.0.1:8995/health
   ```

   The reply must name `"service":"pratibimb-reasoner"`, the pinned model and the endpoint `http://127.0.0.1:8995/v1/chat/completions`. Then confirm the model server is locked:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8977/slots
   ```

   It must print `401`.
6. **The fixture server,** in its own terminal, left running:

   ```bash
   node tests/browser/demo/server.mjs
   ```

   It serves `http://127.0.0.1:8975/fixture/` and `http://127.0.0.1:8975/declared/`, both static synthetic pages.
7. **Chrome for Testing, with a new, empty profile,** so that no personal browser data is present. Use a directory that does not exist yet:

   ```bash
   "$LOCALAPPDATA/ms-playwright/chromium-1243/chrome-win64/chrome.exe" --user-data-dir="$TEMP/pratibimb-m23-19-profile-$(date +%Y%m%dT%H%M%S)" --no-first-run --no-default-browser-check
   ```

8. **The version.** Open `chrome://version`. It must say **153.0.8010.12**, as the binary's own metadata does. Record it.
9. **Load the extension.** Open `chrome://extensions` and turn on Developer mode. Choose **Load unpacked**, then select `apps/extension/.output/chrome-mv3`. **Do not open its service worker or offscreen DevTools yet** (check B3 depends on it).

**Stop conditions, at any point. Stop, record, and shut down (§5):**
- a tab-capture indicator, a screen-sharing bar, or any capture prompt;
- a request for a permission;
- `t1-ui-head.onnx`, `tr01-ppocrv4-mobile-det.onnx` or a `.wasm` loaded by the offscreen document, or a `tr01-worker.js` thread;
- a request to any origin other than the extension's own files and `127.0.0.1:8995`;
- a click on anything other than the declared control, or more than one click in a turn;
- a stored value or real personal data appearing anywhere it should not;
- the reasoner's `/health` changing, or the build's hashes failing;
- any action the operator did not expect and cannot explain.

## 2. Scenarios

### A. Installation and identity

| ID | Do | Expect | Maps to |
|---|---|---|---|
| A1 | Read the extension's card in `chrome://extensions` | loaded with no error; named **PratiBimb — Page Assistant (Development build)** | A1 |
| A2 | Open its **Details** | **Permissions:** nothing that implies capture. **Record exactly what Chrome shows.** Documented: neither `offscreen` nor `sidePanel` carries a warning. **Site access:** `http://127.0.0.1/*`. "Read and change all your data on all websites" must **not** appear | A2 |
| A3 | Hover over the toolbar button (pin it from the puzzle menu if needed) | the title is **PratiBimb — Page Assistant** | A4 |
| A4 | Read the card, the details page, the tooltip and, later, the panel | no "minimal host", "minimal MV3", "experiment" or "not the product" | — |
| A5 | Note any warning or notice Chrome shows at load or later | recorded as seen. **None is expected, and none may be inferred** | — |
| A6 | Look, without searching exhaustively, for *"Run PratiBimb's offscreen runtime for DOM-based browser assistance."* anywhere in Chrome's UI | recorded as **seen, and where**, or **not seen**. This is the only way to settle whether Chrome displays the offscreen justification. **Not seen does not prove it is never shown** | — |

### B. Toolbar, side panel and offscreen lifecycle

| ID | Do | Expect | Maps to |
|---|---|---|---|
| B1 | In `chrome://extensions`, read the extension's **Inspect views** | `service worker` at most. **No `offscreen.html`** | — |
| B2 | Open a new tab on `http://127.0.0.1:8975/fixture/`. Click the extension's toolbar button | the side panel opens, on this tab, headed **PratiBimb — Page Assistant (Development build)**, with the approved description and privacy sentence. **No capture prompt, and no grant asked for** | A3, A5 |
| B3 | Refresh `chrome://extensions` and read **Inspect views** again | **`offscreen.html` is now listed.** The panel's `HOST_STATUS` created it, because it is the only normal route that does (M23.16) | new |
| B4 | Read the panel | **no Status box,** and nowhere `NEEDS_USER`, `captureStatus`, `NO_GRANT` or worker identifiers | A7 |
| B5 | Open the service worker's DevTools from **Inspect views**. In its Console: `__host.captureState().grants` | `[]` | C1, D3 |
| B6 | Close the panel. Press `Alt+Shift+P`. Then click the toolbar button three times | the panel opens from the shortcut. Repeated clicks open it and start nothing. `__host.captureState().grants` is still `[]` | A6 |
| B7 | Throughout | everything works with neither `activeTab` nor `tabCapture`: no permission prompt, no error on the extension's card | new |

### C. A normal DOM-only task (fixture `/fixture/`, scenario "allow")

| ID | Do | Expect | Maps to |
|---|---|---|---|
| C1 | In the panel, type the goal **"Submit my application with my registered mobile number."** Press **Read this page** | the page's controls are listed: a non-empty structural observation. The line names `127.0.0.1:8975` | B1 |
| C2 | Choose **Submit application — button**, then **It becomes unavailable (greyed out)**. Press **Add expected result**, then **Start task** | the expectation is listed; the run starts; consent appears (section E) | B2, B3 |
| C3 | Press **Allow once** | **if the task completes:** the page says *Application submitted*, Submit is greyed out, and the panel reports the declared result. **If it stops instead:** the panel's stop code is recorded. A stop is not a failure of this check, unless it was unsafe | B4 |
| C4 | Watch the tab strip and the window throughout | **no tab-capture indicator,** no screen-sharing bar | B5, C2 |
| C5 | Open the offscreen document's DevTools from **Inspect views**. In its Console: `performance.getEntriesByType("resource").map((e) => e.name)` | the extension's own files, `ort.all.min.js` and the reasoner endpoint. **No `t1-ui-head.onnx`, no `tr01-ppocrv4-mobile-det.onnx`, no `.wasm`** | D1 |
| C6 | In the same DevTools: **Sources → Threads** | **no `tr01-worker.js`** | D2 |
| C7 | In the service worker's Console: `const t = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" })).task.result; [t.ports.perception, t.perceptionBoot, t.loop.turns.map((x) => x.handoff?.capability), t.loop.turns.map((x) => x.handoff?.elements.every((e) => e.source === "dom"))]` | `[]`, `null`, each capability `{ backend: "none", tiers_fired: ["T0","T2"] }`, each `true`. **Record only these four results** | D6 |
| C8 | In the service worker's Console: `/iVBORw0KGgo\|data:image/.test(JSON.stringify(__host.seen))` | `false` | D5 |
| C9 | In the service worker's Console: `["perceiveOnce", "consumeProbe", "ticketProbe", "mintStreamId"].filter((n) => n in __host)` | `[]` | D7 |

### D. Click safety and result verification

| ID | Do | Expect | Maps to |
|---|---|---|---|
| D1 | Open the fixture page's own DevTools. In its Console, after C3: `__submitEvents.filter((e) => e.type === "click").length` | `1` if the task clicked; `0` if it stopped first. **Never more than one per confirmed turn** | F4 |
| D2 | Compare the clicked control with the declared one | the same control | — |
| D3 | Read the panel's result line | the declared expectation is what was verified (the result reads `CONFIRMED`, or the stop names why not) | F3 |
| D4 | **Stale target.** Reload the fixture tab (F5). In the panel press **Read this page**, then reload the tab again, then repeat C2 | **refused: nothing is clicked.** Record the code shown (for example `DOCUMENT_CHANGED` or `DECLARATION_STALE`). `__submitEvents` click count `0` | F1 |

### E. Consent and private-data boundaries

| ID | Do | Expect | Maps to |
|---|---|---|---|
| E1 | Read the consent screen in C3, before answering | names the site, the field and the kind of value; **only a masked preview**; exactly **Allow once** and **Deny** | E1 |
| E2 | Throughout the consent screen | **nowhere says `NEEDS_USER`** | new |
| E3 | Reload the fixture tab. Run C1 and C2 again, and press **Deny** | **nothing restored** (*Confirm mobile number* stays empty), **nothing clicked**, and the panel says so (`STOPPED_REFUSED`) | E2 |
| E4 | Throughout | **only the fixture's synthetic values.** Type nothing but the goal sentences given here. Enter no real personal data anywhere | — |

### F. Turn budget

| ID | Do | Expect |
|---|---|---|
| F1 | Read the panel before and after a task | **it offers no turn setting, and claims no number of turns.** The result lists its turns |
| F2 | Count the turns in each result | **at most 3,** the panel's budget. 5 is the enforced ceiling, which a person cannot reach through the panel |
| F3 | — | **Do not try to change the budget** from DevTools or anywhere else |

### G. Fail-closed behaviour (synthetic pages only; nothing destructive)

| ID | Do | Expect |
|---|---|---|
| G1 | **Invalid target.** Open a new tab on `about:blank`, open the panel there, press **Read this page** | **"Could not read the page (…)"**, and nothing else happens |
| G2 | **Stale target** | as D4 |
| G3 | **Failed postcondition.** Open `http://127.0.0.1:8975/declared/`. Goal **"Request a callback."** Choose **Request a callback — button** and **It becomes unavailable (greyed out)**, then start | the page never changes when that button is clicked, so **the result is never `CONFIRMED`.** Expected: `STOPPED_UNVERIFIED` after at most one click, or a refusal before any. **A "completed" result is a FAIL.** Page Console: `__clicks.callback` is at most `1` |
| G4 | **Unsupported operation** | **NOT RUN, unless it happens by itself.** It cannot be induced without manipulation. If the model proposes anything but a click on the declared control, the result must say it was refused and nothing was done |
| G5 | **Reasoner unavailable,** run last. Stop the reasoner (`Ctrl+C` in its terminal, or `npm run reasoner:stop`). Confirm `curl -s http://127.0.0.1:8995/health` fails. Reload the fixture tab and run C1 and C2 | **Expected, from source:** the deterministic planner answers, labelled `DETERMINISTIC_FALLBACK`, and the run ends `STOPPED_SINGLE_TURN_PLANNER` after one turn. Consent is still asked before any value is restored. **An action without consent, or an unlabelled completion, is a FAIL.** A refusal, with nothing done, is also acceptable. **Do not restart the reasoner within this session** |

**A verification failure must never be followed by an action the operator did not approve.**

### H. Privacy and network observation (DevTools only; no packet capture, nothing installed)

| ID | Do | Expect |
|---|---|---|
| H1 | Offscreen DevTools → **Network**, kept open during C | requests only to the extension's own files and `http://127.0.0.1:8995/v1/chat/completions`, plus its preflight. **No other origin** |
| H2 | Select a reasoner request; read only its headers and size | `content-type: application/json`; no image type, no multipart. **Do not copy its body into any record** |
| H3 | In the offscreen Console: `await fetch("http://127.0.0.1:8977/health").catch((e) => e.name)`, then the same for `http://127.0.0.1:8995/health` | `TypeError` each time, with a CSP violation. Only the exact reasoner path is allowed. **Do not probe any non-loopback address** |
| H4 | Read the reasoner's terminal | requests only during tasks, only to `/v1/chat/completions`. **No `422 REFUSED` tripwire lines** |
| H5 | Before saving anything | the record holds no stored value, preview text, page text, prompt, model output, token or local path (§6) |

## 3. During the run

**Keep to the order above.** G5 comes last, because it stops the reasoner. Write each result as it happens. Do not re-run a check to turn a FAIL into a PASS: record both, in order.

## 4. Scenario boundaries

- **Permitted:** the steps above, on `127.0.0.1:8975/fixture/`, `127.0.0.1:8975/declared/` and `about:blank`; reading DevTools; the named Console expressions.
- **Prohibited:**
  - any other site or real account;
  - real personal data;
  - an evidence build;
  - `npm run build` or the harness;
  - changing the turn budget, the page's code or the extension's files;
  - any Console expression not listed here;
  - screen recording;
  - packet capture.

## 5. Shutting down

1. Close Chrome, every window of the temporary profile.
2. Stop the fixture server (`Ctrl+C`).
3. Stop the reasoner, if G5 has not: `Ctrl+C` in its terminal, or `npm run reasoner:stop`.
4. Confirm ports 8975, 8977 and 8995 are free, and that `models/.reasoner-state.json` is gone.
5. Delete the temporary profile directory.
6. Record that each step happened.

## 6. Evidence

**Location:** `artifacts/experiments/M23.19-chrome-smoke-test/`. It is a new directory, named here and **not created until the run is authorised.** Nothing is written to M4, M5, M5.1, M20 or any other historical log directory, and nothing is overwritten. A failed run is recorded as such, beside any earlier pass, never in place of it.

**Files:** `README.md` and `decision.md` (the record's usual sections), and `logs/w1-m23-19-smoke-record.json`:

```json
{
  "milestone": "M23.19",
  "authorisation": "<the checklist's approval reference>",
  "date": "<YYYY-MM-DD>", "localTimeStart": "<HH:MM>", "localTimeEnd": "<HH:MM>",
  "operator": "<role, as the owner states it>",
  "workstation": "W1",
  "commit": "<git rev-parse --short HEAD>",
  "productBuild": { "sourceCommit": "8d3ce5f", "hashCheck": "<9 of 9 OK | which failed>", "inspectionProblems": [] },
  "chrome": { "version": "<from chrome://version>", "channel": "Chrome for Testing" },
  "manifestAsChromeShowsIt": { "name": "", "permissionsShown": "", "siteAccess": "", "warnings": [] },
  "justificationSeen": "<seen, where | not seen>",
  "reasoner": { "health": "<ok | not ok>", "modelServerLocked": "<401 | other>", "stopped": "<how>" },
  "results": [ { "id": "A1", "state": "PASS | FAIL | NOT RUN | BLOCKED", "observed": "<codes or plain words, no values>" } ],
  "consoleErrors": [ "<the minimum needed, with any path, token or value removed>" ],
  "deviations": [ "<anything done differently, and why>" ],
  "shutdown": { "chromeClosed": true, "fixtureServerStopped": true, "reasonerStopped": true, "portsFree": true, "profileDeleted": true }
}
```

**Never recorded:**
- personal browser data;
- real private information;
- stored values, preview text, page text, prompts or model output;
- model weights;
- authentication secrets, including the reasoner's per-launch key;
- unredacted local paths (write `%LOCALAPPDATA%` or a repository-relative path);
- screenshots of anything but the panel, Chrome's UI and the synthetic page.

**Screenshots:** only if the owner permits them (checklist item 7), and only of the panel or Chrome's UI. Not of the fixture page, which shows synthetic identifiers. Not of DevTools showing a request body.

**Before committing:** read every file once, for the above. Nothing is committed until the owner has seen the record.
