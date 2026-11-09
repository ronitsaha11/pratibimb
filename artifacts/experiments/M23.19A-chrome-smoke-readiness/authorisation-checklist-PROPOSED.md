# M23.19 — smoke-test authorisation checklist — PROPOSED — FOR THE OWNER

> **Status: UNSIGNED. Nothing here is authorised until the owner completes it.**
> - **Proposed values** are prepared in M23.19A. The owner confirms, changes or refuses each one.
> - **Explicit, item by item:** an item left blank is not authorised, and the test does not start until every item is answered.

| # | Item | Proposed (M23.19A) | Owner's answer |
|---|---|---|---|
| **1** | **Exact product commit and build** | the product build from **`8d3ce5f`**, as it stands in `apps/extension/.output/chrome-mv3`. It must match the 9 SHA-256 values in `logs/expected-product-build.sha256` immediately before the test. The checkout may be at `db60807` or later, provided nothing outside documentation has changed since `8d3ce5f` | ☐ approved ☐ changed to: ______ |
| **2** | **Chrome binary and version** | Chrome for Testing **153.0.8010.12**, at `%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe`, in a **new, empty, temporary profile**. Version confirmed in `chrome://version` at the start | ☐ approved ☐ changed to: ______ |
| **3** | **Human operator** | **not proposed:** for the owner to name. The record states the operator's role only (developer or owner), which makes this evidence type C | operator: ______ role: ______ |
| **4** | **Synthetic fixture and scenarios** | `http://127.0.0.1:8975/fixture/` and `/declared/`, served by `node tests/browser/demo/server.mjs`, plus `about:blank`. Scenarios A to H of `smoke-test-procedure-PROPOSED.md` | ☐ all approved ☐ only: ______ |
| **5** | **Local reasoner startup** | `npm run reasoner`: **reads and hashes the pinned model weights and runtime,** then serves `http://127.0.0.1:8995/v1/chat/completions` and runs **inference** on the structure-only handoff. Stopped with `Ctrl+C` or `npm run reasoner:stop` | ☐ approved, including model hashing and inference ☐ refused |
| **6** | **Evidence output location** | `artifacts/experiments/M23.19-chrome-smoke-test/`, a new directory. Nothing is written to any historical log directory | ☐ approved ☐ changed to: ______ |
| **7** | **Data and privacy boundaries** | synthetic fixture values only, and no real personal data. The record holds codes, never values, prompts, outputs, keys or local paths. **Screenshots:** ☐ none ☐ of the panel and Chrome's UI only | ☐ approved, screenshots: ______ |
| **8** | **Permitted actions** | the procedure's steps, in its order. **Manual mode:** the M20 harness is not used. Reading DevTools, and only the Console expressions it names | ☐ approved ☐ harness mode instead (it rebuilds the product, pre-creates the offscreen document so B3 cannot be observed, and writes into the M20 logs) |
| **9** | **Prohibited actions** | any other site or account; real personal data; any evidence build; `npm run build`; changing the turn budget, page code or extension files; Console expressions not listed; screen recording; packet capture; T1, TR-01, detector evaluation, training, TEST data | ☐ confirmed |
| **10** | **Stop conditions** | as listed in procedure §1: any capture indicator or prompt; any permission request; a model file, `.wasm` or TR-01 worker loaded; any non-loopback request; an undeclared or second click; a stored value where it should not be; a reasoner health change or failed hash; anything unexplained | ☐ confirmed |

**Also for the owner, outside this checklist:**
- **When the test may run,** and whether it must finish in one session.
- **Whether a FAIL should stop all further work,** or be recorded and assessed.

**Approval**

| | |
|---|---|
| Approved by | ______ |
| Date | ______ |
| Reference recorded in the M23.19 record | ______ |

**SMOKE TEST STATUS: NOT AUTHORISED — AWAITING EXPLICIT OWNER APPROVAL.**
