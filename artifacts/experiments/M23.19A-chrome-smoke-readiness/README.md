---
id: M23.19A-chrome-smoke-readiness
title: "M23.19A — Chrome smoke-test readiness and authorisation gate"
status: readiness prepared — the product build, Chrome binary, fixture and reasoner inspected without launching or starting anything; a manual procedure and an authorisation checklist proposed; SMOKE TEST NOT AUTHORISED
date: 2026-11-08
label: FACT (files read, metadata read, the read-only inspection), INFERENCE and UNKNOWN marked
classification: READ-ONLY READINESS — no browser, extension, reasoner, harness, build, evidence build, model session, model hash, frame, inference, training, detector evaluation or dataset; no product, permission, CSP or egress change
workstation: 1
---

# M23.19A — Chrome smoke-test readiness

> **What it is:** whether PratiBimb's DOM-only Phase 1 product is ready for its first human-operated Chrome test, and exactly how that test would run.
> **What it is not:** the test. Chrome was not launched, the extension was not loaded, the reasoner was not started, and no browser task ran. **Nothing here is authorised.**

**Documents:**
- `smoke-test-procedure-PROPOSED.md`: the procedure.
- `authorisation-checklist-PROPOSED.md`: the owner's ten decisions.
- `decision.md`: the readiness decision.
- `logs/w1-m23-19a-readiness-facts.json`: every fact below, recomputed by script.
- `logs/expected-product-build.sha256`: the build's identity, for the operator.

## Hypothesis

Every prerequisite for a human-operated smoke test can be established, or shown to need a decision, by reading files alone.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `db60807`, 102 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Read, not run:** the existing product build in `apps/extension/.output/chrome-mv3`; the Chrome binary's version resource; Playwright's browser registry; the fixture pages and server; the reasoner's launcher, front and pin.

## Expected result

- The build can be tied to one source commit.
- Its manifest and bundle hold the Phase 1 boundary.
- The Chrome binary, fixture and reasoner files are present, and every remaining step is either ready or named as a decision.

## Actual result

### 1. The product build proposed for testing

| Property | Finding | Label |
|---|---|---|
| Source commit | **`8d3ce5f`** | FACT |
| Built | `manifest.json` written 10 s after `8d3ce5f` was committed, and before `81a60dd` | FACT (file times) |
| Identity | **9 of 9** files match the SHA-256 values M23.18 recorded for that build | FACT |
| Changed since `8d3ce5f`, other than documentation | `apps/extension/test/acceptanceDocuments.test.ts` alone: a test, not in the build | FACT |
| Read-only inspection, at `db60807` | exit 0, **`problems: []`** | FACT |

### 2. Manifest and bundle

| Property | Finding | Label |
|---|---|---|
| Permissions | **`offscreen`, `sidePanel`**. Neither `activeTab` nor `tabCapture`. Nothing else | FACT |
| Host permissions, content-script matches | `http://127.0.0.1/*` | FACT |
| connect-src | **`'self' http://127.0.0.1:8995/v1/chat/completions`** | FACT |
| CSP | ADR-0013's product policy; the side panel's style hash unchanged | FACT |
| Name, toolbar title, shortcut | PratiBimb — Page Assistant (Development build); PratiBimb — Page Assistant; `Alt+Shift+P` | FACT |
| Diagnostic hooks | absent | FACT (inspection) |
| Capture | no `getUserMedia` call, no `captureVisibleTab`, no call for a capture ticket. The unreachable minting wrapper is still there | FACT |
| T1, TR-01 | T1 not packaged. The offscreen document refuses the UI head and cannot start TR-01 | FACT |
| `HOST_STATUS` | the panel sends it, and the worker awaits `ensureOffscreen()` in answering it | FACT |
| Turn budget | the panel's `TASK_START` asks for no budget; the offscreen document defaults it to 3, and carries the 1-to-5 refusal | FACT |
| Click only, consent, grounding, freshness, postconditions, fail-closed | the refusal codes are in the bundle. Behaviour is established by tests under fakes (M23.8 onwards), **not in a browser** | FACT (tests); runtime UNKNOWN |
| Network origins in the extension's code | none but loopback | FACT |

### 3. Chrome

| Property | Finding | Label |
|---|---|---|
| Binary | present at `%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe` | FACT |
| Version | **153.0.8010.12, "Google Chrome for Testing"**, from the binary's version resource, matching Playwright 1.63.0's registry for revision 1243 and M20's recorded runs | FACT, without launching |
| `CHROME_PATH` | documented in `README.md` as that path. Not set in this shell. Manual mode does not need it | FACT |
| Loading an unpacked build | M20 loaded one into this binary through Playwright's `--load-extension` (FACT). Chrome's own **Load unpacked**, by hand: **INFERENCE** that it works, and the first step of the test | — |

### 4. Fixture

| Property | Finding | Label |
|---|---|---|
| Server | `node tests/browser/demo/server.mjs`: a static file server bound to `127.0.0.1`, port 8975, with no routes that write, no upload and no proxy | FACT |
| `/fixture/` | a synthetic certificate application: read-only name, mobile, Aadhaar-format number, date of birth and code, and an empty *Confirm mobile number* field with *Submit application*. Submit disables itself only when the confirmation matches | FACT |
| `/declared/` | three buttons, one of which (*Request a callback*) changes nothing when clicked: a ready-made failed postcondition | FACT |
| External requests | **none:** no external `src` or `href` (only a `data:` favicon), and no `fetch`, XHR, beacon or socket in either page's script | FACT |
| Safe for a local test | yes, on these facts. Its values are synthetic, and appear in the harness's own list of values a record must never contain | INFERENCE |

### 5. Reasoner

| Property | Finding | Label |
|---|---|---|
| Start | `npm run reasoner`, in its own terminal | FACT |
| What starting does | **verifies the model's size and full SHA-256, then the runtime's,** checks the ports, starts `llama-server` on `127.0.0.1:8977` with a per-launch key, confirms it refuses keyless requests, then serves `127.0.0.1:8995` | FACT (source) |
| `npm run reasoner:check` | **also hashes the model.** So it was not run here | FACT (source) |
| Environment variables | none required | FACT (source) |
| Model | `Qwen/Qwen2.5-0.5B-Instruct-GGUF`, `qwen2.5-0.5b-instruct-q4_k_m.gguf`: present, and its size equals the pin's, **by file metadata only. Not opened, not hashed** | FACT |
| Runtime | llama.cpp `b10956`: binary present | FACT |
| Ports 8975, 8977, 8995 | free at inspection time; no leftover state file | FACT |
| Readiness | `GET http://127.0.0.1:8995/health` names the service, the pinned model and the endpoint. `GET :8977/slots` without the key returns 401 | FACT (source and the M20 harness) |
| Authentication | 8995 admits only extension origins or no browser origin (any `chrome-extension://` ID, so an unpacked build from any path works), its own `Host` and the one path. 8977 admits only the front's key | FACT (source) |
| Shutdown | `Ctrl+C`, or `npm run reasoner:stop` (which checks each process is its own) | FACT (source) |
| If it is down during a task | the default policy lets the deterministic planner answer: one turn, labelled `DETERMINISTIC_FALLBACK`, ending `STOPPED_SINGLE_TURN_PLANNER`, still behind consent and grounding. **Not a hard stop** | FACT (source and `domOnlyTaskPath.test.ts`) |

### 6. Why manual mode, not the M20 harness

The harness:
- rebuilds the product;
- creates the offscreen document itself before the person opens the panel;
- writes into the M20 logs directory.

So it would test a new build, could not show `HOST_STATUS` creating the document, and would put the record among historical evidence. The procedure is manual for these reasons, and harness mode is item 8 of the checklist.

### 7. Readiness

| Prerequisite | State |
|---|---|
| Product build `8d3ce5f`: identity, manifest, bundle | **READY.** Re-verify the 9 hashes immediately before the test |
| Runtime behaviour in Chrome | **UNKNOWN:** that is what the test establishes |
| Chrome for Testing 153.0.8010.12 | **READY.** Confirm in `chrome://version` at the start |
| Load unpacked by hand | **UNKNOWN** (INFERENCE that it works); the procedure's first step |
| Fixture and its server | **READY** |
| Reasoner files, ports, state | **READY** |
| Starting the reasoner (model hashing and inference) | **REQUIRES OWNER AUTHORISATION** |
| Human operator | **REQUIRES OWNER AUTHORISATION:** not named |
| Mode (manual, or the harness) | **REQUIRES OWNER AUTHORISATION:** manual proposed |
| Evidence directory `artifacts/experiments/M23.19-chrome-smoke-test/` | **REQUIRES OWNER AUTHORISATION:** named, not created |
| Screenshots | **REQUIRES OWNER AUTHORISATION** |
| B3 (`HOST_STATUS` creates the offscreen document) | **READY** in manual mode; **BLOCKED** in harness mode |
| G4 (unsupported operation) | **UNKNOWN:** it cannot be induced without manipulation, so it is expected to be NOT RUN |
| Whether Chrome shows the offscreen justification | **UNKNOWN:** observed in A6, never inferred |

## Known limitations

- **Every runtime property** is established from source, tests under fakes and the built files. **None has been seen in a browser** since M23.7.
- **The build in `.output` is not under version control.** Any build, including the harness's, replaces it, which is why the hashes are checked again before the test.
- **The model is non-deterministic.** A task may stop rather than complete. The procedure treats a safe stop as a recorded outcome, not a failure.
- **One operator, one machine, one run:** evidence type C at most.
- **Evidence-build runtime** is outside this test, and stays unverified.

## Conclusion

**Ready for a decision, not for execution.** The build, the browser, the fixture and the reasoner's files are in place and identified. What remains is the owner's to decide: the operator, starting the reasoner, the mode, the evidence location and screenshots. **M23.19A prepares the smoke test only.**

## Reproducibility

```bash
node tests/browser/extension/inspect-product-build.mjs
```

```bash
(cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.19A-chrome-smoke-readiness/logs/expected-product-build.sha256)
```

Neither launches, builds or starts anything. Chrome's version comes from the binary's version resource, read with PowerShell's `(Get-Item <path>).VersionInfo`.

**SMOKE TEST STATUS: NOT AUTHORISED — AWAITING EXPLICIT OWNER APPROVAL.**
