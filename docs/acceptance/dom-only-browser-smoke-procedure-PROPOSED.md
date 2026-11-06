# DOM-only product — human browser smoke procedure — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.8, 2026-11-04). NOT RUN.**
> - **It needs a separate authorisation.** It builds the product (the build's own hook reads and hashes TR-01), runs the real local language model (inference), and opens a real browser. M23.8 does none of these.
> - **It claims nothing until it is run.** No product runtime validation exists for M23.7 yet.
> - **Scope:** one operator, one machine, Chrome for Testing, the synthetic loopback fixture. It is evidence type C, unless the operator meets OD-C's definition. It says nothing about Firefox, a second machine, real sites or performance.
> - **A product build has no diagnostic hook to call (M23.9, OD-S).** Check D7 confirms that.
> - **Updated M23.17 (RD-5, RD-6):** a product declares neither `tabCapture` nor `activeTab`. A2 checks that.
> - **Updated M23.15 (OD-Y):** the extension and the panel's heading read **PratiBimb — Page Assistant (Development build)**. A1 and A3 check that.
> - **Updated M23.14 (OD-X):** a product's Status box shows `bootId`, `bootedAt`, `offscreenContexts` and `hellos`, and no `captureStatus`. A7 checks that.
> - **Updated M23.13 (OD-W):** the toolbar button opens the side panel and issues no grant. A5, A6 and section C check that, and are the first real evidence of it.
> - **Updated M23.12 (OD-T):** a product panel has no Capture field, so A3, C1, C3 and C4 now use the approved wording and the worker's console.

## 1. Before starting

Record: operator role, machine, OS, browser and version, commit, date.

1. **Check out the commit under test,** with a clean working tree apart from unrelated records.
2. **Build the product,** with no evidence flag set:

   ```bash
   npm run build -w @pratibimb/extension
   ```

3. **Inspect the build.** It must exit 0, with `"problems": []`:

   ```bash
   node tests/browser/extension/inspect-product-build.mjs
   ```

4. **Start the reasoner,** in its own terminal, and leave it running:

   ```bash
   npm run reasoner
   ```

5. **Start the harness.** It loads the build, serves the synthetic fixture and waits; it presses nothing and answers nothing:

   ```bash
   node tests/browser/extension/run-product-smoke.mjs --scenarios allow,deny
   ```

   It needs `CHROME_PATH` set to Chrome for Testing. **It writes its record into the M20 logs directory,** and it rebuilds the product itself, so step 3 should be repeated once it has built. Decide where this run's record belongs when authorising it.

## 2. Checks

Each check is PASS or FAIL. **Any frame capture, model-file load or TR-01 worker is a FAIL of the whole run, however well the task went.**

### A. Installation

| # | Do | Expect |
|---|---|---|
| A1 | Open `chrome://extensions` | the extension loads with no error, named **PratiBimb — Page Assistant (Development build)** |
| A2 | Read its details | permissions and host access match `manifest.json`: `offscreen`, `sidePanel`; `http://127.0.0.1/*` only. **Neither `tabCapture` nor `activeTab`** |
| A3 | Open Chrome's side panel and choose PratiBimb | the panel renders, styled, headed **PratiBimb — Page Assistant (Development build)**. It shows the approved description and privacy explanation, and **no Capture field** |
| A4 | Hover over the extension's toolbar button | the title is **PratiBimb — Page Assistant** |
| A5 | Close the panel, then click the toolbar button | **the side panel opens, on this tab** |
| A6 | Close the panel, then press `Alt+Shift+P`. Then click the toolbar button several times | the panel opens from the shortcut, and repeated clicks start nothing and lose nothing |
| A7 | Read the panel's Status box | it shows those four fields. **No `captureStatus`, no `NO_GRANT`** |

### B. A DOM-only task, with no toolbar click

Do **not** click the extension's toolbar button.

| # | Do | Expect |
|---|---|---|
| B1 | Type the goal the harness prints; press "Read this page" | the page's controls are listed: **non-empty** structural observation |
| B2 | Choose the control and "It becomes unavailable (greyed out)"; add it | the expectation is listed |
| B3 | Press "Start task" | the consent screen appears (section E) |
| B4 | Press "Allow once" | the value is restored, the control is clicked once, and the panel reports the result confirmed |
| B5 | Watch the tab strip throughout | **no tab-capture indicator appears** |

### C. The same task with a toolbar click first

This is the one that matters most: the click must issue no grant, and must start no capture.

| # | Do | Expect |
|---|---|---|
| C1 | Start the harness again with `--scenarios allow`, for a fresh page and its own record. On the fixture page, click the extension's toolbar button | the panel opens. In the service worker's Console, `__host.captureState().grants` is **`[]`** |
| C2 | Run the task as in B | it completes as in B, with no tab-capture indicator |
| C3 | In the service worker's Console, read `__host.captureState().grants` after the task | **still `[]`.** Any grant means the toolbar or a task asked for one: **FAIL** |
| C4 | Read the panel's wording before and after | the approved sentences, unchanged. Nothing in the panel asks for a toolbar click. **Any capture wording anywhere in the panel is a FAIL** |

### D. Looking for what must be absent

Use `chrome://extensions` → Inspect views. **Read only.**

| # | Where | Do | Expect |
|---|---|---|---|
| D1 | offscreen document, Console | `performance.getEntriesByType("resource").map((e) => e.name)` | `ort.all.min.js` and the extension's own chunks. **No `t1-ui-head.onnx`, no `tr01-ppocrv4-mobile-det.onnx`, no `.wasm`** |
| D2 | offscreen document, Sources → Threads | look at the list | **no `tr01-worker.js`** |
| D3 | service worker, Console | `__host.captureState().grants` | **`[]`**, however many times the toolbar was clicked |
| D4 | service worker, Console | `__host.seen.filter((e) => e.message?.kind === "CAPTURE_FRAME" \|\| e.message?.kind === "CAPTURE_TICKET").length` | **0** |
| D5 | service worker, Console | `/iVBORw0KGgo\|data:image/.test(JSON.stringify(__host.seen))` | **false** |
| D6 | service worker, Console | `(await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" })).task.result` and read it | `ports.perception` is `[]`; `perceptionBoot` is `null`; in each turn's `handoff`, `capability` is `{ backend: "none", tiers_fired: ["T0","T2"] }`, every element's `source` is `"dom"`, and `elements` is non-empty |
| D7 | service worker, Console | `["perceiveOnce", "consumeProbe", "ticketProbe", "mintStreamId"].filter((name) => name in __host)` | **`[]`** |

### E. Consent

| # | Do | Expect |
|---|---|---|
| E1 | Read the consent screen | it names the site, the field and the kind of value; it shows only a masked preview, never the whole value; it offers exactly "Allow once" and "Deny" |
| E2 | In the `deny` scenario, press "Deny" | nothing is restored and nothing is clicked; the panel says so |

### F. Click safety, freshness and result verification

| # | Do | Expect |
|---|---|---|
| F1 | Press "Read this page", then reload the page, then press "Start task" | refused: the page changed. Nothing is clicked |
| F2 | After "Read this page", in the page's own DevTools console, change the declared control's label; then start the task | refused (`DECLARATION_STALE`). Nothing is clicked |
| F3 | Read the run's event trail in the record or the panel's timings | a refresh before the click, one click, and a fresh observation before the result is verified |
| F4 | Count clicks on the page | never more than one per confirmed turn |

### G. CSP and loopback

In the offscreen document's Console. These only try to reach things, and each attempt should be blocked.

| # | Do | Expect |
|---|---|---|
| G1 | `await fetch("https://example.com/").catch((e) => e.name)` | `TypeError`, with a CSP violation in the console |
| G2 | `await fetch("http://127.0.0.1:8977/health").catch((e) => e.name)` | `TypeError`, with a CSP violation: the model server is not reachable from the extension |
| G3 | `await fetch("http://127.0.0.1:8995/health").catch((e) => e.name)` | `TypeError`, with a CSP violation: only the exact reasoner path is allowed |
| G4 | Read the reasoner terminal | requests arrived only during tasks, on `/v1/chat/completions` |

## 3. Record

For each check: PASS or FAIL, what was seen, and a screenshot only where it shows no value. **No stored value, preview text or model output goes in the record.**

**A pass means:** on this machine, with this operator, on the synthetic fixture, the product behaved this way, once. It is not a reliability, cross-machine, independent-operator, real-site or performance claim, and it approves no acceptance criterion.
