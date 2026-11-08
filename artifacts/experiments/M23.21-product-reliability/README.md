---
id: M23.21-product-reliability
title: "M23.21 — product reliability fix: the keyboard shortcut (DEF-M23.19-01) and the offscreen justification (A6)"
status: IMPLEMENTED, VERIFIED AUTOMATICALLY AND VERIFIED IN CHROME FOR TESTING 153.0.8010.12 ON W1 BY THE OPERATOR — root cause established from Chromium 153.0.8010.12's source; shortcut changed to Ctrl+Shift+Y; regression tests, mutations and a real product build inspected; the operator saw Ctrl+Shift+Y and the toolbar button open the panel; A6 found no product defect, with one finding for the owner; lifecycle row values not reported; not committed
date: 2026-11-08
label: FACT (Chromium source at the tag, tests, mutations, the real product build, on W1); INFERENCE and UNKNOWN marked
classification: PRODUCT FIX — one manifest value; no permission, host, CSP, egress, listener, message, lifecycle or capture change; no reasoner, model, inference, task, browser, frame, T1 or TR-01 use
workstation: 1
---

# M23.21 — product reliability fix

> **What it is:**
> - the cause of DEF-M23.19-01, from Chrome's own source;
> - a fix that changes one manifest value, with regression tests and a real product build;
> - a check of the offscreen document's creation (A6).
>
> **The browser result** is in §8: the operator ran `manual-verification-checklist.md` on 2026-11-08 and saw `Ctrl+Shift+Y` open the panel. Sections 1–7 were written before that run and are kept as written. M23.19 and M23.20 are not changed.

**Files:**
- `manual-verification-checklist.md`: the operator's steps.
- `logs/w1-m23-21-manual-verification-record.json`: what the operator reported, and what Claude read afterwards.
- `decision.md`: the verdict and the decisions left to the owner.
- `logs/expected-product-build.sha256`: the new build's identity.
- `logs/w1-m23-21-build-inspection.json`: the read-only inspection of that build.
- `logs/w1-m23-21-mutations.json`: thirteen mutations and their results.
- `extract-chrome-accelerators.py`: how the test fixture was made from Chromium's source.

## Hypothesis

1. **DEF-M23.19-01:** `Alt+Shift+P` failed because Chrome never gave the key to the extension, not because the extension mishandled it.
2. **A6:** the offscreen justification is supplied, accurate and created on the approved route. Not finding it in Chrome's pages is a limit of Chrome's UI, not a product defect.

## Environment

| Item | Value | Label |
|---|---|---|
| Branch | `fix/m23.21-product-reliability`, created from `cbced35` (equal to `origin/spike/m22-small-target-recall`). The two untracked M20 records are untouched | FACT |
| Chrome's source | `chrome/browser/ui/accelerator_table.cc`, `chrome/browser/extensions/commands/command_service.cc` and `chrome/browser/ui/views/accelerator_utils_aura.cc`, read at Chromium tag **153.0.8010.12** (tag object `971a7443b0c9…`), the version M23.20's operator saw, through GitHub's `chromium/chromium` mirror. `accelerator_table.cc` at that tag has SHA-256 `10c14abb7e18…` | FACT |
| Chrome docs | `developer.chrome.com/docs/extensions/reference/api/commands`, read on 2026-11-08 | FACT |
| Build | `npm run build` in `apps/extension`, 16:11 IST. The build hook verifies the pinned TR-01 artifact's hash before packaging it, as every product build does. **No model was run** | FACT |
| Browser | none. Chrome was not launched | FACT |

## Expected result

- **DEF-M23.19-01:** Chrome's rule for assigning a suggested key refuses `Alt+Shift+P` on Windows, and a chosen replacement passes the same rule.
- **A6:** exactly one creation site, a non-empty and accurate justification, creation only on the panel's request, and nothing else added.

## Actual result

### 1. DEF-M23.19-01: root cause

| Step | Finding | Label |
|---|---|---|
| The extension's route | `_execute_action` has no listener of its own. Chrome turns it into `action.onClicked`, the toolbar's event. The product's listener calls `chrome.sidePanel.open` before returning (`host/background.ts:59`, `host-lib/toolbar-action.ts`). That route works: M23.19's B6 toolbar part passed | FACT (source; M23.19) |
| Chrome's rule | `CommandService::CanAutoAssign`, for a command that is not global, ends `return !IsChromeAccelerator(command.accelerator());`. **A suggested key that is one of Chrome's accelerators is not assigned** | FACT (Chromium 153.0.8010.12) |
| What `IsChromeAccelerator` checks | on Windows it walks `GetAcceleratorList()` (`accelerator_utils_aura.cc`) | FACT (same) |
| Whether `Alt+Shift+P` is in that list | **yes:** `kTabGroupAcceleratorMap` maps `{VKEY_P, EF_SHIFT_DOWN \| EF_ALT_DOWN}` to `IDC_CREATE_NEW_TAB_GROUP`. `GetAcceleratorList()` appends the map under `#if !BUILDFLAG(IS_MAC) && !BUILDFLAG(IS_CHROMEOS)`, with no feature flag. So it is present on Windows and Linux | FACT (same) |
| What Chrome's documentation adds | "Certain operating system and Chrome shortcuts ... always take priority over Extension command shortcuts and cannot be overridden." `commands.getAll()` reports `shortcut` "blank if not active" | FACT (docs) |
| **The cause** | **Chrome never assigned `Alt+Shift+P` to PratiBimb.** The key stayed Chrome's own, and pressing it ran "create new tab group". That command's editor is what the M23.19 operator saw as a tab-group menu. **The extension never received the press** | INFERENCE from the FACTs above. It matches M23.19's B6 exactly |
| What a browser has not yet confirmed | that `chrome.commands.getAll()` reports `shortcut: ""` for the old key on W1. M23.19 did not run it, and this milestone used no browser | UNKNOWN until checklist V3 (new key) and V13 (old key's behaviour) |

### 2. The fix

**The shortcut decision: `Ctrl+Shift+Y`.**

| Check | Result | Label |
|---|---|---|
| In Chrome 153's `GetAcceleratorList()` on Windows? | **no:** no entry on the Y key at all, in any array or platform branch | FACT (fixture, 147 entries) |
| Allowed by Chrome's manifest rules? | yes: it includes Ctrl, and it is not Ctrl+Alt | FACT (docs) |
| Chrome's own example | Chrome's commands documentation uses `Ctrl+Shift+Y` for `_execute_action` | FACT (docs) |
| Other candidates checked | `Alt+Shift+Y`, `Ctrl+Shift+E` and `Alt+Shift+K` are also free in Chrome 153. `Ctrl+Shift+P` is not: `IDC_BASIC_PRINT`, conditional on printing | FACT |
| Conflicts outside Chrome's table | another extension holding the key, an OS or IME binding: not checked. A fresh profile has no other extension | UNKNOWN |
| Mac and ChromeOS | not checked. On Mac `Ctrl` in a suggested key means `Command` | UNKNOWN |

**Files changed:**

| File | Change |
|---|---|
| `apps/extension/wxt.config.ts` | **the fix:** `suggested_key.default` changed from `"Alt+Shift+P"` to `"Ctrl+Shift+Y"`, with a comment giving the cause |
| `apps/extension/host/background.ts`, `apps/extension/host-lib/toolbar-action.ts` | **comments only.** The built JavaScript is byte-identical |
| `tests/browser/support/chrome-153-accelerators.json` | **new:** Chrome 153's accelerator table, 147 entries, each with its platform guards evaluated for Windows |
| `tests/browser/support/chrome-commands.mjs`, `.d.mts` | **new:** a model of `CanAutoAssign` and of key routing, for tests |
| `tests/browser/support/chrome-commands.test.mjs` | **new:** tests of the fixture and the model |
| `tests/browser/support/product-build-inspection.mjs`, `.d.mts` | `APPROVED_TOOLBAR_SHORTCUT`; three new problems (`COMMANDS_NOT_ONLY_EXECUTE_ACTION`, `TOOLBAR_SHORTCUT_NOT_THE_APPROVED_KEY`, `TOOLBAR_SHORTCUT_NOT_ASSIGNABLE:*`); new facts (`toolbarShortcut`, `commandNames`, `offscreenCreateCalls`, `offscreenUrl`, `offscreenReasons`, `offscreenConstructsAWorker`) |
| `tests/browser/support/product-build-inspection.test.mjs` | four new tests. The synthetic manifest gains the product's command, and one existing test's override keeps the approved key |
| `tests/browser/support/build-separation.test.mjs`, `gesture-harness-gate.test.mjs` | their synthetic product manifests gain the product's command, as a real build has |
| `apps/extension/test/support/simulatedExtension.ts` | `pressKeys`, which routes a key press through the model; a comment |
| `apps/extension/test/toolbarInteraction.test.ts` | the old literal check now expects the new key; nine new tests |
| `apps/extension/test/buildSeparation.test.ts` | the manifest expectation is the new key; one new test of the real manifest against the model |
| `apps/extension/test/offscreenLifecycle.test.ts` | **new:** seven A6 tests |
| `README.md`, `CHANGELOG.md` | the shortcut sentence corrected; a Fixed entry |

**What did not change:**
- permissions (`offscreen`, `sidePanel`), host permissions (`http://127.0.0.1/*`), CSP and connect-src;
- the content scripts, the side panel's registration and every message kind;
- the offscreen document's creation and its arguments;
- capture code, T1 and TR-01.

No listener was added: no `chrome.commands`, no `onCommand`, no key handler in any shipped file. No second command or action exists.

### 3. A6: the offscreen justification

| Check | Finding | Label |
|---|---|---|
| Creation sites | **one:** `host/background.ts:103`, inside `ensureOffscreen()` | FACT (source scan; bundle: `offscreenCreateCalls: 1`) |
| Justification | `"Run PratiBimb's offscreen runtime for DOM-based browser assistance."`: non-empty. It names the product's actual use, and no capture, screenshot, frame, media or clipboard use | FACT |
| URL | `offscreen.html`, built from `host/offscreen/index.html`, which is in the build | FACT |
| When it is created | not at worker start, and not by the toolbar or the shortcut. It is created by the panel's `HOST_STATUS`, once. `HOST_STATUS` from a content script or another extension is refused, and creates nothing. Every other `ensureOffscreen` call is a message handler or a console-only `__host` function | FACT (tests; source) |
| New permission, origin or data path | none: the built JavaScript is byte-identical to `8d3ce5f`'s | FACT |
| Declared reason | **`WORKERS`.** **Finding:** the product's offscreen bundle constructs no `Worker` (`offscreenConstructsAWorker: false`), and ORT runs with one thread and no proxy. The reason fits the TR-01 worker, which only an evidence build can start; a product document does not use it. **Not changed.** The reason governs the document's lifecycle, so changing it is the owner's decision, not part of this fix | FACT (bundle); decision for the owner |
| Whether Chrome displays the justification | **UNKNOWN.** Chrome's documentation describes it as the extension's explanation of the request, and promises no display. M23.20 did not find it | FACT (M23.20); UNKNOWN (Chrome) |
| **A6's classification** | **a Chrome UI visibility limitation, not a product defect.** No UI text was added to satisfy a search | INFERENCE from the rows above |

### 4. Tests

| Run | Result |
|---|---|
| `npx vitest run apps/extension/test tests/browser/support` | **60 files, 1470 tests, all passed.** On the first run, 28 tests in `build-separation.test.mjs` and `gesture-harness-gate.test.mjs` failed: their synthetic product manifests had no `commands`, and the inspection now requires the approved one. Fixed by giving those fixtures the real product command |
| `npm run typecheck` | exit 0 |
| New tests, first attempt | one A6 test expected the wrong refusal code for a content script. The worker answers `UNKNOWN_KIND`, not `SENDER_NOT_ACCEPTED`, and creates nothing. Corrected to the real answer, and the other-extension case added |
| Not run | `scripts/**` tests (`upstream.live.test.mjs` starts the model server); `tools/**`; `npm run verify` (it runs Python training tests); the packages' suites (no package changed) |

**New regression tests:**
- the root cause, from the fixture;
- the old key routed to Chrome, with no panel;
- the new key declared and assignable;
- still exactly one command, and no listener;
- the key opening the same panel as a click;
- no task, message or grant from the key, alone or mixed with clicks;
- an evidence build's behaviour unchanged;
- an unheld key doing nothing;
- the real manifest checked against the model;
- the inspection refusing the old key, an extra command or a missing command;
- the seven A6 tests.

### 5. Mutations

Each of the 13 mutations changed one file, ran its targeted tests and restored the file, whose hash was checked. **13 of 13 were caught.** The working tree was identical afterwards.

The mutations:
- the old key;
- a key Chrome claims;
- a second command;
- a command listener;
- a content-script key handler;
- a grant on the toolbar route;
- an empty justification;
- a justification claiming capture;
- creation at worker start;
- creation by the toolbar;
- the model assigning every key;
- the fixture losing the tab-group entry;
- the inspection not checking the key.

Details: `logs/w1-m23-21-mutations.json`.

### 6. The production build, inspected

| Check | Result | Label |
|---|---|---|
| `inspect-product-build.mjs` | exit 0, **`problems: []`** | FACT |
| Manifest | permissions `offscreen`, `sidePanel`; hosts `http://127.0.0.1/*`; connect-src `'self' http://127.0.0.1:8995/v1/chat/completions`; commands `_execute_action` only, `suggested_key` `{ "default": "Ctrl+Shift+Y" }`; title and name the approved wording | FACT |
| Compared with the `8d3ce5f` build tested in M23.19 and M23.20 | **only `manifest.json` differs, by that one value.** `background.js`, the offscreen, side panel and WXT chunks, the content script, both HTML files and `tr01-worker.js` are **byte-identical**. No file was added or removed | FACT |
| Network origins named in the extension's code | `http://127.0.0.1`, `:8995` and `:8977` only. The same as before, since the JavaScript is identical | FACT |
| Capture | no `getUserMedia` call, no capture ticket call, no grant on the toolbar route, no hook marker | FACT |
| Identity | `logs/expected-product-build.sha256`: 9 files. **M23.19A's list now fails on `manifest.json` alone, as it should** | FACT |

### 7. Security invariants

**None was weakened.** The change is one manifest value, and its effect is on Chrome's assignment of a key to an event that already existed. Each item below is unchanged:
- the model proposes and the client decides;
- structure-only JSON goes to the loopback reasoner;
- no frame egress and no capture path;
- no new endpoint, origin, host or permission;
- T1 and TR-01 are not used;
- QG-04's interception;
- the CSP;
- grounding, freshness, hit-testing and postconditions;
- the five-turn cap;
- click as the only executable action;
- consent and the private-data safeguards.

The evidence: the byte-identical JavaScript, `problems: []`, the passing suites and the mutations above. FR-01 stays DEFERRED — NOT AUTHORISED, and B-07 stays BLOCKED; neither was touched.

### 8. The browser verification (after §1–7)

The operator ran `manual-verification-checklist.md` on 2026-11-08, on W1, in Chrome for Testing 153.0.8010.12. Claude did not launch, control or type into Chrome. Record: `logs/w1-m23-21-manual-verification-record.json`.

| Item | Result | Label |
|---|---|---|
| Operator's report | V1–V14 completed. **`Ctrl+Shift+Y` opens the PratiBimb side panel; the toolbar button opens it; both behave as expected.** The offscreen lifecycle checks were completed | FACT (operator report) |
| V6, V9, V10 | **PASS** | FACT (operator report) |
| V1–V5, V7, V8, V11, V12 | **completed; values not reported.** Not recorded as matching the expected values | FACT (operator report); values UNKNOWN |
| V13 (optional) | not reported | UNKNOWN |
| V14, stop conditions | none reported | FACT (operator report) |
| Chrome's own record of the key | the profile's `Preferences` holds one command entry: `windows:Ctrl+Shift+Y` → `_execute_action`, not global, for the one unpacked `chrome-mv3` extension, first installed at 22:08:48 IST | FACT (read by Claude after the session) |
| The build | not rebuilt since 16:11 IST. 9 of 9 files match `logs/expected-product-build.sha256`, and M23.19A's list fails on `manifest.json` alone. The operator's pre-session check was not reported | FACT |
| Profile | `pratibimb-m23-21-profile`, new, created 22:07:20 IST, stamped 153.0.8010.12. Its name lacks the S1 command's timestamp suffix | FACT |
| Root cause, confirmed | Chrome assigned the new key on a fresh profile, and the key reached the toolbar's route, as §1 predicted. The old key's behaviour (V13) was not reported | INFERENCE from the rows above |

**DEF-M23.19-01: FIXED, verified in a browser** on W1 in Chrome for Testing 153.0.8010.12.

## Known limitations

- **Browser verification is W1 and Chrome for Testing 153.0.8010.12 only,** with one operator and one fresh profile. The lifecycle rows' values were not reported.
- **The key-assignment model** encodes Chromium 153's rule and table. Another Chrome version may differ; the fixture is pinned to 153.0.8010.12.
- **Not checked:** Mac and ChromeOS, conflicts with other extensions, OS or IME bindings.
- **Profiles that already had the extension installed** may keep the old state. The checklist uses a new profile.
- **Documents not changed, which still name `Alt+Shift+P`:**
  - six acceptance documents: `core-product-acceptance-PROPOSED.md`, `phase-1-architecture-scope.md`, `phase-1-data-flow-and-components.md`, `frame-capture-and-consumer-map.md`, `dom-only-browser-smoke-procedure-PROPOSED.md`, `residual-product-surface-decision-report-PROPOSED.md`;
  - `owner-decisions.md` and `agentos/state.md`, both historical decision records;
  - a past CHANGELOG entry.

  They are left for the owner's review, with M23.19 and M23.20, which are not changed.
- **The offscreen reason finding is open** (see A6 above).

## Conclusion

**DEF-M23.19-01's cause is established from Chrome's source:** `Alt+Shift+P` is Chrome's "create new tab group" on Windows, so Chrome never assigned it to PratiBimb. **The fix is `Ctrl+Shift+Y`,** which Chrome 153 does not claim, on the same `_execute_action` route as the toolbar.

**A6 is not a product defect.** The justification is supplied, accurate and created only on the panel's request. One finding, the `WORKERS` reason, is for the owner.

Automated checks pass, and the real build differs from the tested one by the key alone. **In the browser, the operator saw `Ctrl+Shift+Y` and the toolbar button open the panel,** and Chrome's profile records the key as assigned.

## Reproducibility

```bash
npx vitest run apps/extension/test tests/browser/support
```

```bash
(cd apps/extension && npm run build) && node tests/browser/extension/inspect-product-build.mjs
```

```bash
(cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.21-product-reliability/logs/expected-product-build.sha256)
```

The fixture is regenerated by `python -I extract-chrome-accelerators.py <accelerator_table.cc at 153.0.8010.12> <out.json> 153.0.8010.12 971a7443b0c9b0a9b2860529b33331b76077ec62`. It reproduced the committed fixture's content exactly (the JSON parses identically; the committed file's formatting differs).

**M23.21 STATUS: IMPLEMENTED; AUTOMATED VERIFICATION PASSED; VERIFIED IN CHROME FOR TESTING 153.0.8010.12 ON W1 BY THE OPERATOR (lifecycle values not reported). NOT COMMITTED. NOT PRODUCT ACCEPTANCE.**
