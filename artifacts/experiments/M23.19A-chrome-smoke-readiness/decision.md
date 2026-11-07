# M23.19A — decision record

**Verdict: READY FOR THE OWNER'S AUTHORISATION. NOT READY TO RUN WITHOUT IT.**

## What is proposed for testing

| | Proposed | Confirmed by |
|---|---|---|
| **Product build** | `apps/extension/.output/chrome-mv3`, built from **`8d3ce5f`**; 9 files, SHA-256 in `logs/expected-product-build.sha256` | the M23.18 record and a re-check now: 9 of 9 |
| **Chrome** | Chrome for Testing **153.0.8010.12**, `%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe`, a new temporary profile | the binary's version resource; Playwright's registry |
| **Fixture** | `http://127.0.0.1:8975/fixture/` and `/declared/`, from `node tests/browser/demo/server.mjs` | the pages and server, read |
| **Reasoner** | `npm run reasoner`: `Qwen2.5-0.5B-Instruct` Q4_K_M on llama.cpp `b10956`, front on `127.0.0.1:8995/v1/chat/completions`, keyed model server on `127.0.0.1:8977` | `scripts/reasoner/`, read; files present by metadata |
| **Operator** | **to be named by the owner** | — |
| **Mode** | manual, following `smoke-test-procedure-PROPOSED.md` | — |
| **Evidence** | `artifacts/experiments/M23.19-chrome-smoke-test/`, created only once authorised | — |

## Unresolved prerequisites

Each is an item in `authorisation-checklist-PROPOSED.md`:

1. **The operator** (item 3).
2. **Starting the reasoner,** which hashes the model weights and runs inference (item 5).
3. **The mode:** manual, or the harness and what it changes (item 8).
4. **The evidence location** (item 6).
5. **Screenshots,** none or panel-only (item 7).

## Risks that would invalidate or limit the test

| Risk | Effect | Mitigation in the procedure |
|---|---|---|
| A build replaces `.output` before the test | the wrong build is tested | the hash check, step 1.2; no `npm run build`, no harness |
| A personal Chrome profile is used | personal data in the browser, and possibly in evidence | a new temporary profile, deleted afterwards |
| The model stops rather than completes | C3 shows a stop | a safe stop is recorded, not failed. Safety checks are judged separately |
| The reasoner falls back when down | G5 looks like a completion | the expected labels are stated. An unlabelled completion is a FAIL |
| DevTools opened too early | B3 cannot be observed | step 1.9 says not to |
| A screenshot catches a request body or page values | values in evidence | screenshots off unless permitted, and then panel or Chrome UI only |
| One operator, one machine | type C evidence only | stated in the record |

## Verification (W1, 2026-11-08)

| Command | What it executes | Exit | Result |
|---|---|---|---|
| `node tests/browser/extension/inspect-product-build.mjs` (no `--record`) | reads the manifest, file names and JavaScript text; opens no model | **0** | `problems: []` |
| `sha256sum -c logs/expected-product-build.sha256` (in the build directory) | hashes the 9 built files: JavaScript, HTML, manifest | **0** | 9 of 9 OK |
| A script writing `logs/w1-m23-19a-readiness-facts.json` | reads files and metadata; launches nothing | **0** | — |
| PowerShell `(Get-Item <chrome.exe>).VersionInfo` | reads the version resource; does not run Chrome | **0** | 153.0.8010.12 |
| PowerShell `Get-NetTCPConnection` on 8975, 8977, 8995 | lists listening sockets | **0** | all free |
| `npx vitest run apps/extension/test/acceptanceDocuments.test.ts apps/extension/test/productIdentity.test.ts` | the documents and records, read as text | **0** | 56 passed |
| `python scripts/verify-repo.py` | governance checks | **0** | 0 failures, 0 warnings |

**First-attempt failures:** none in these commands. Two of my first bundle checks were too weak to count: the word "click" appearing proves nothing about click-only, and a loose pattern stood in for the turn ceiling. They were replaced by the ceiling's own refusal text, and click-only is cited from tests instead.

**Not run, deliberately:** `npm run reasoner`, `npm run reasoner:check` (it hashes the model), `npm run build`, `npm run verify`, any harness, any browser.

## What did not happen

- **Chrome was not launched. The extension was not loaded. The reasoner was not started. No browser task ran.**
- **No model was opened, hashed or loaded.** The model file was checked for presence and size by metadata only. T1 and TR-01 were not read.
- **No build or evidence build. No frame captured. No inference, training, detector evaluation, ONNX export or dataset access. No TEST.**
- **No change to product source, permissions, CSP, egress or orchestration.** No gate was signed. ADR-0015 was not approved. FR-01 stays DEFERRED — NOT AUTHORISED, and B-07 stays BLOCKED. Nothing was pushed.

## Labels

- **FACT:** file contents, file metadata, the inspection, the hashes and the port state, as recorded.
- **INFERENCE:** that Load unpacked works by hand in this binary; that the fixture is safe for a local test.
- **UNKNOWN:** all runtime behaviour in Chrome; whether Chrome shows the offscreen justification; whether G4 can occur.

**SMOKE TEST STATUS: NOT AUTHORISED — AWAITING EXPLICIT OWNER APPROVAL.**
