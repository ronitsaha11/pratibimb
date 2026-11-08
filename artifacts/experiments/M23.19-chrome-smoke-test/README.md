---
id: M23.19-chrome-smoke-test
title: "M23.19 — authorised manual Chrome smoke test (interim record: sections A and B)"
status: PAUSED after section B at the owner's instruction; section C not started; B6 FAIL (keyboard shortcut, DEF-M23.19-01); A1–A6 not yet reported; B1 not recorded; reasoner and fixture server stopped at the owner's instruction (14:01–14:02 IST); not committed, awaiting the owner's review (M23.19B §7)
date: 2026-11-08
label: FACT (operator-reported observations; service logs, build hashes and the built manifest, read on W1); INFERENCE and UNKNOWN marked
classification: HUMAN-OPERATED SMOKE TEST, evidence type C at most — manual Chrome, synthetic `/fixture/` only; no harness, build, evidence build, frame capture, T1 or TR-01, training, detector evaluation or dataset; no product, permission, shortcut, CSP or egress change
workstation: 1
---

# M23.19 — authorised manual Chrome smoke test

> **INTERIM RECORD. The test is not finished.** It covers the setup, the reasoner's startup and the operator's reports for section B. **Nothing in sections A or C to H has been observed.** The owner paused the test after section B and asked that section C not be started.
>
> **What this is not:** product acceptance. A pass here signs no gate, approves neither ADR-0015 nor GOV-01, and does not authorise FR-01.

**Files:**
- `decision.md`: the interim verdict and defect.
- `logs/w1-m23-19-smoke-record.json`: the same results, in the procedure's §6 shape.

## Hypothesis

The DOM-only Phase 1 product build from `8d3ce5f` behaves in a real Chrome for Testing as the source and the tests under fakes say it does. This test checks the scenarios authorised in `artifacts/experiments/M23.19A-chrome-smoke-readiness/final-authorisation-M23.19B-PROPOSED.md` §4, on `http://127.0.0.1:8975/fixture/` only.

## Environment

| Item | Value | Label |
|---|---|---|
| Authorisation | the owner approved F1 to F5 **in chat**, in a message timestamped 2026-11-07T20:43:56.859Z (2026-11-08 02:13:56 IST) in the session transcript, against the M23.19B record as finalised in M23.19C (`3e0c40c`). **The formal record does not yet show this:** M23.19B §8 still reads PENDING and was not edited. An append-only approval addendum to M23.19B is **PROPOSED, not applied** | FACT (transcript); addendum PROPOSED |
| Operator | the project owner. Chrome was operated by hand. **Claude did not control Chrome**, and records only what the operator reported | FACT |
| Mode | manual. The M20 harness was not used | FACT |
| Machine | W1 | FACT |
| Checkout | branch `spike/m22-small-target-recall` at `3e0c40c`. Clean apart from the two untracked M20 records, which were not touched | FACT |
| Product build | `apps/extension/.output/chrome-mv3`, source `8d3ce5f`. **9 of 9 hashes OK** before the test, and again at 04:48 IST while recording. Read-only inspection: exit 0, `problems: []` | FACT |
| Manifest, as built | permissions `offscreen` and `sidePanel` only; host access and content-script matches `http://127.0.0.1/*`; connect-src `'self' http://127.0.0.1:8995/v1/chat/completions`; `commands._execute_action.suggested_key.default` is `Alt+Shift+P` | FACT (file read) |
| Chrome | Chrome for Testing, binary version resource 153.0.8010.12 (M23.19A). **`chrome://version` not yet reported by the operator** | FACT (binary); runtime version PENDING |
| Profile | a temporary profile directory named as the procedure specifies, `pratibimb-m23-19-profile-20261108T043254`, exists under `%TEMP%`. It was created at 04:32:55 IST, and its `Last Version` stamp reads **153.0.8010.12**. Only that one stamp file was read; nothing else in the profile was opened. **Corrected:** the first version of this record called this "FACT (operator)", but the operator had not reported the profile | FACT (file system); that the test ran in this profile is INFERENCE |
| Chrome, later | at 14:02:16 IST, **no Chrome for Testing process was running.** It was not closed by Claude. When it closed is **UNKNOWN**; the profile was last written at 13:56:18 IST. The Chrome processes that were running belong to a separately installed Google Chrome, which is not part of this test, and none of them used the test profile | FACT (process list, booleans and versions only); closure time UNKNOWN |
| Fixture | `node tests/browser/demo/server.mjs`, static, bound to `127.0.0.1:8975` | FACT |
| Reasoner | `npm run reasoner`: front `127.0.0.1:8995`, keyed model server `127.0.0.1:8977` | FACT |
| Times | see **Timeline** below. All times are reconciled to UTC and to the workstation's zone, India Standard Time (UTC+05:30) | FACT |

### Reasoner startup and lock (F1 to F2)

| Check | Result | Label |
|---|---|---|
| Model | `qwen2.5-0.5b-instruct-q4_k_m.gguf` at revision `9217f5db79a2`, 491 400 032 bytes. SHA-256 prefix `74a4da8c9fdb` matches the pin | FACT (launcher log) |
| Runtime | llama.cpp `b10956`: 50 executables and libraries match the pinned release | FACT (launcher log) |
| Cold start | verify 919 ms, model load 1942 ms, total 2883 ms. One run, W1 | measured |
| `/health` on 8995 | 200: service `pratibimb-reasoner`, the pinned model and revision, the endpoint `http://127.0.0.1:8995/v1/chat/completions`, model server "per-launch key", slots disabled | FACT |
| Lock | 8977 `/slots` without the key: 401. 8977 POST without the key: 401. 8995 with `Origin: https://example.com`: 403 | FACT |
| Requests logged by the front, from start to shutdown | exactly two, both from the setup checks above: `200 GET /health` and `403 GET /health`. **No request from the extension.** So no inference ran during the session | FACT (front log) |

### Timeline

| Event | UTC | IST (UTC+05:30) | Source |
|---|---|---|---|
| Owner's approval message | 2026-11-07 20:43:56.859 | 2026-11-08 02:13:56 | the session transcript's message timestamp |
| Fixture server process started | 2026-11-07 20:44:30.295 | 2026-11-08 02:14:30 | OS process start time |
| Reasoner launcher process started | 2026-11-07 20:45:33.840 | 2026-11-08 02:15:33 | OS process start time |
| `llama-server` process started | 2026-11-07 20:45:34.889 | 2026-11-08 02:15:34 | OS process start time |
| `PRATIBIMB_REASONER_READY` `startedAt` | **2026-11-07 20:45:36.777** | 2026-11-08 02:15:36 | launcher log |
| Temporary profile directory created | 2026-11-07 23:02:55 | 2026-11-08 04:32:55 | file system |
| Operator's section B observations received | 2026-11-07 23:17:32 | 2026-11-08 04:47:32 | the session transcript's message timestamp |
| Build hashes re-checked (9 of 9 OK) | 2026-11-07 23:18 | 2026-11-08 04:48 | the shell's clock, printed with the check |
| This record first written | 2026-11-07 23:20:29 to 23:20:57 | 2026-11-08 04:50:29 to 04:50:57 | file system |
| Test profile last written | 2026-11-08 08:26:18 | 2026-11-08 13:56:18 | file system |
| Reasoner stopped (`npm run reasoner:stop`) | 2026-11-08 08:31:55 to 08:31:57 | 2026-11-08 14:01:55 to 14:01:57 | the shell's clock |
| Ports verified free | 2026-11-08 08:32:16 | 2026-11-08 14:02:16 | PowerShell's clock |
| Section B observation times | **UNKNOWN** | **UNKNOWN** | not reported. They fall between 04:32:55 and 04:47:32 IST, by the two rows above |

**Is the `Z` in `startedAt` really UTC? Yes.** Each of the following is FACT:
1. The launcher sets `startedAt` with `new Date().toISOString()` (`scripts/reasoner/reasoner.mjs:139`). That method always gives UTC.
2. Windows reports the zone as India Standard Time, UTC+05:30, with no daylight saving, and `TZ` is unset. Node resolves `Asia/Calcutta` (offset −330 minutes). Bash's `date` agrees.
3. The launcher process started at 20:45:33.840 UTC, by the OS. `startedAt` is 2.937 s later, which matches the logged cold start of 2883 ms.

So 02:15 IST is the reasoner's genuine ready time. It was not mislabelled.

**The runtime in the operator's process screenshot** was about 11 h 43 min, at about 08:28 (operator's report). Claude has not seen that screenshot (see Screenshots, below).
- Taking 08:28 as **UTC**, the launcher had run 11 h 42 min 34 s by the owner's next message (08:28:08 UTC). That is consistent with this timeline.
- Taking 08:28 as **IST**, the launcher would have run about 6 h 13 min. That contradicts the OS start time.
- So the screenshot's clock basis is **UNKNOWN** to this record. The arithmetic fits a UTC reading, but that is INFERENCE only.

## Expected result

Each scenario's expected outcome is the one in M23.19B §4. Two are relevant to what follows:
- **B1:** before the panel opens, Inspect views shows `service worker` at most, and no `offscreen.html`.
- **B6:** after the panel is closed, `Alt+Shift+P` opens it; three toolbar clicks start nothing; grants are still `[]`.

## Actual result

Every result below is the operator's report, in their words where quoted. **None was inferred.**

| ID | State | Observed (operator) |
|---|---|---|
| A1 | **PENDING** | not reported |
| A2 | **PENDING** | not reported |
| A3 | **PENDING** | not reported |
| A4 | **PENDING** | not reported |
| A5 | **PENDING** | not reported |
| A6 | **PENDING** | not reported |
| B1 | **NOT RUN — NOT RECORDED** | the Inspect views state before the side panel was first opened was not recorded. **Unverified.** INFERENCE: now that the panel has opened, the pre-open state cannot be observed again in this Chrome session |
| B2 | **PASS** | "`/fixture/` opened and the PratiBimb side panel opened successfully." The heading, description and privacy sentence were not separately reported. The absence of any prompt is reported under B7 |
| B3 | **PASS** | after the panel opened and `chrome://extensions` was refreshed, Inspect views showed `service worker`, `offscreen.html` and `sidepanel.html`. **Limit:** without B1, this shows that `offscreen.html` exists once the panel is open, not that it was absent before. That `HOST_STATUS` created it still rests on the source (M23.16), not on a before-and-after observation in this run |
| B4 | **PASS** | no Status box; none of `NEEDS_USER`, `captureStatus` or `NO_GRANT` |
| B5 | **PASS** | `__host.captureState().grants` returned `[]` |
| B6 | **FAIL** | **Toolbar part: as expected.** "PratiBimb toolbar icon opened/kept the side panel accessible across three interactions. No task started." **Shortcut part: FAIL.** "`Alt+Shift+P` did not open PratiBimb. It opened Chrome's tab-group menu instead." After B6, grants were reported unchanged at `[]`. **Defect DEF-M23.19-01** |
| B7 | **PASS (interim: B2 to B6 only)** | no permission prompt, capture indicator, screen-sharing bar or extension error during these interactions. Not yet observed for the rest of the test, nor for the card at load (A1) |
| C1–C9 | **PENDING** | section C not started, at the owner's instruction |
| D1–D4 | **PENDING** | not started |
| E1–E4 | **PENDING** | not started |
| F1s–F3s | **PENDING** | not started |
| G1 | **EXCLUDED — OUTSIDE THE APPROVED FIXTURE** | not executed (owner, M23.19C) |
| G2 | **PENDING** | not started |
| G3 | **EXCLUDED — OUTSIDE THE APPROVED FIXTURE** | not executed (owner, M23.19C) |
| G4 | **NOT RUN — REQUIRES PROHIBITED MANIPULATION** | not executed (owner, M23.19C) |
| G5 | **PENDING** | runs last; the reasoner is still running |
| H1–H5 | **PENDING** | not started |

### DEF-M23.19-01 — `Alt+Shift+P` does not open the side panel

| | |
|---|---|
| **Observed** | on W1, in Chrome for Testing (runtime version not yet reported), `Alt+Shift+P` opened Chrome's tab-group menu, not PratiBimb's side panel. FACT (operator) |
| **Declared** | the built manifest suggests `Alt+Shift+P` for `_execute_action`. FACT (file read, build hashes 9 of 9 OK) |
| **Cause** | **UNKNOWN. Not investigated,** per the owner's instruction. Neither `chrome://extensions/shortcuts` nor Chrome's own shortcut list was examined |
| **Safety effect** | none observed: no task started, no prompt appeared, and grants stayed `[]` |
| **Stop condition?** | **No.** It is none of M23.19B §6's seven |
| **Claims it contradicts** | the shortcut half of "The toolbar button and `Alt+Shift+P` open the side panel and issue no grant (OD-W)" in `docs/acceptance/core-product-acceptance-PROPOSED.md`, for this browser. The UNKNOWN in M23.13 and `owner-decisions.md` (whether Chrome treats the shortcut as a user gesture) stays unresolved: the shortcut did not reach the panel. Neither document was changed |
| **Not done** | no change to the shortcut configuration, the manifest or product code |

### Deviations

1. **B1 was not recorded** before the side panel was first opened. It stays NOT RUN unless the owner decides how to observe it again.
2. **The test is paused after section B** at the owner's instruction. Section C has not started.
3. **Setup, port check:** PowerShell's `Get-NetTCPConnection` exited 1 on the first attempt. The ports were confirmed instead by `netstat`, by the owning processes, and by an HTTP request to the fixture (200).
4. **Setup, fixture method:** a POST to `/fixture/` also returned 200. The server ignores the method and has no write route (source). Recorded as an observation.
5. **Paused shutdown:** at the owner's instruction, the reasoner and fixture server were stopped with the test paused, before G5. G5 therefore cannot run in this session without restarting the reasoner, which needs the owner's decision.
6. **Fixture shutdown method:** the fixture server ran as a background task, which could not receive `Ctrl+C`. It was ended through the session's task control instead, which terminates the process. It is a static server with no state.
7. **Chrome for Testing was no longer running** when the shutdown was verified. The owner had asked for it to be left open; Claude did not close it.

### Stop conditions

**None has fired.** No unexpected permission, external request, capture indicator, unapproved action, stored or real personal value, identity failure or card error has been reported.

### Console errors and screenshots

- **Console errors:** none reported.
- **Screenshots:**
  - The operator reports supplying screenshots in chat, among them one of the running processes.
  - **None is archived in this evidence directory.** None was copied or committed, and any copy needs separate approval.
  - FACT: no image attachment appears in this session's transcript for the M23.19 messages. So Claude has not seen them, and this record does not describe their content.

### Shutdown (paused test, owner's instruction)

| Step | Result | Label |
|---|---|---|
| Reasoner | `npm run reasoner:stop` at 14:01:55 IST, exit 0. It printed "stopped llama-server (pid 11824)". The launcher saw the model server exit, printed "llama-server exited (code 1); stopping the front." and exited 1, so its own check then found it already gone. Exit 1 is the launcher's response to the model server stopping. It is not an error in the stop | FACT (logs) |
| Fixture server | ended through the session's task control at about 14:02 IST (deviation 6) | FACT |
| Processes | the launcher, `llama-server` and the fixture process are gone | FACT |
| Ports 8975, 8977, 8995 | at 14:02:16 IST, `netstat` lists nothing on any of them, and HTTP connections to each are refused | FACT |
| `models/.reasoner-state.json` | absent | FACT |
| Chrome | **not closed by Claude.** No Chrome for Testing process was running at 14:02:16 IST (see Environment) | FACT |
| Temporary profile | **not deleted,** at the owner's instruction | FACT |
| Extension task | none was started, and the reasoner received no request from the extension | FACT (operator; front log) |

## Known limitations

- **One operator, one machine, one run so far:** evidence type C at most.
- **Interim:** sections A and C to H, G5 and the shutdown are outstanding.
- **Observations are the operator's reports.** Claude saw none of the browser.
- **B3 without B1** is weaker than designed (see the table).
- **The runtime Chrome version is not yet confirmed** in `chrome://version`. The profile's version stamp, 153.0.8010.12, is indirect evidence only.
- **The section B observation times, and when Chrome for Testing closed, are UNKNOWN.**
- **The screenshots the operator supplied in chat were not seen by Claude** and are not archived.
- **The approval is recorded in chat only.** The M23.19B addendum is proposed, not applied.

## Conclusion

**Interim.** Of section B:
- B2 to B5 passed, as reported.
- B7 passed for the interval observed.
- **B6 failed:** the toolbar button works, but the keyboard shortcut does not open the panel (DEF-M23.19-01).
- B1 was not recorded.

No safety boundary was seen to fail, and no stop condition fired. **Nothing here is product acceptance.**

## Reproducibility

The setup and scenarios follow `artifacts/experiments/M23.19A-chrome-smoke-readiness/smoke-test-procedure-PROPOSED.md` §1 and §2, within the scope of the M23.19B record as finalised in M23.19C. The build's identity:

```bash
(cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.19A-chrome-smoke-readiness/logs/expected-product-build.sha256)
```

**SMOKE TEST STATUS: PAUSED AFTER SECTION B; REASONER AND FIXTURE STOPPED. NOT PRODUCT ACCEPTANCE.**
