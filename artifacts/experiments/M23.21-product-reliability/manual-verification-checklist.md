# M23.21 — manual Chrome for Testing verification: the shortcut, the toolbar and the offscreen lifecycle

> **RUN BY THE OPERATOR ON 2026-11-08, on W1, in Chrome for Testing 153.0.8010.12.** The operator reported every step V1–V14 completed, and `Ctrl+Shift+Y` and the toolbar button both opening the panel. Per-row values were not reported. The results, and what was and was not reported, are in `logs/w1-m23-21-manual-verification-record.json`. The procedure below is unchanged.
>
> *(As prepared:)* **PREPARED, NOT RUN. Not authorised until the owner says so.**
> - **The operator** (the project owner) does every step in Chrome. Claude does not launch, control or type into Chrome, and records only what the operator reports. Nothing is marked PASS or FAIL before the operator reports it.
> - **Not used:** the reasoner, the fixture server, any model, inference or task.
> - **Pages:** Chrome's own pages and one new, empty tab.

## Before Chrome opens

The build must be M23.21's. At the repository root, every line must print `OK`:

```bash
(cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.21-product-reliability/logs/expected-product-build.sha256)
```

**A `FAILED` line is a stop.** M23.19A's list now fails on `manifest.json` alone, because that file is the change.

## Rules for the whole session

**Do not:**
- open a web page, a `127.0.0.1` address or the fixture;
- start a task, or type a goal;
- press **Read this page** or **Start task**;
- run any Console expression other than the ones below.

**STOP and report at once** if any of these appears:
- a permission prompt;
- a capture indicator or screen-sharing bar;
- a security warning;
- an error on the extension's card;
- anything the operator did not cause.

## Steps

| Step | Do | Record | Expected |
|---|---|---|---|
| S1 | Launch Chrome for Testing with a new profile (command below) | the local time | a blank profile |
| S2 | Open `chrome://version` | the version | **153.0.8010.12** |
| S3 | Open `chrome://extensions`, turn on **Developer mode**, **Load unpacked** `apps/extension/.output/chrome-mv3` | loads, and any error | loads, no error |
| V1 | On the card, read **Inspect views** without clicking in it | every entry | `service worker` at most; **no `offscreen.html`** |
| V2 | Open `chrome://extensions/shortcuts` and find **PratiBimb — Page Assistant (Development build)** | its shortcut row, exactly | **`Ctrl+Shift+Y`** on its one command (Chrome labels `_execute_action` as activating the extension) |
| V3 | Back on `chrome://extensions`, click **service worker** under Inspect views. In its Console run `await chrome.commands.getAll()` | the result | one entry: `name` `"_execute_action"`, `shortcut` **`"Ctrl+Shift+Y"`**, not `""` |
| V4 | Same Console: `__host.captureState().grants` | the result | `[]` |
| V5 | Same Console: `(await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length` | the number | **`0`**: no offscreen document yet |
| V6 | Open a new tab (`Ctrl+T`) and leave it on the New Tab page. Press **`Ctrl+Shift+Y`** once. If nothing opens there, type `about:blank` in that tab's address bar, press Enter, and press `Ctrl+Shift+Y` once more | what opens, on which page | **the PratiBimb side panel**; no prompt; no task starts. Report both attempts if there were two |
| V7 | In the service worker Console, repeat V5 | the number | **`1`**: the panel's `HOST_STATUS` created it |
| V8 | Same Console: `(await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }))` | the result | `{ ok: true, task: null }`: no task |
| V9 | Close the side panel. Click PratiBimb's **toolbar button** once | what opens | the **same** side panel |
| V10 | Close it. Press `Ctrl+Shift+Y`, then click the toolbar button, twice each | what happens | the panel opens each time; nothing else |
| V11 | Repeat V4, V7 and V8 | the three results | `[]`, `1`, `{ ok: true, task: null }` |
| V12 | Refresh `chrome://extensions` and read **Inspect views** | every entry | `service worker`, `offscreen.html` (one) and `sidepanel.html` while the panel is open |
| V13 (optional, root cause) | With the panel closed, press `Alt+Shift+P` once, then press `Esc` | what opens | **Chrome's own tab-group editor**, not PratiBimb: the old key is Chrome's, as its source says |
| V14 | Throughout | anything unexpected | none |

**Then stop and report every row.** Leave Chrome open. Neither the M23.19 nor the M23.20 profile is to be deleted.

## S1 command (PowerShell)

```powershell
& "$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe" --user-data-dir="$env:TEMP\pratibimb-m23-21-profile-$(Get-Date -Format yyyyMMddTHHmmss)" --no-first-run --no-default-browser-check
```

**A new profile matters here.** Chrome assigns a suggested key at installation. A profile in which the extension was installed with `Alt+Shift+P` may keep that state.

## Screenshots

**None is authorised.** If the owner wants them, of Chrome's own pages only, that is a separate approval. Anything shared in chat stays in chat.

## What a pass shows

A pass shows that, on W1, in Chrome for Testing 153.0.8010.12:
- Chrome assigned `Ctrl+Shift+Y` to the extension;
- the key opens the same panel as the toolbar button;
- neither route starts a task or a grant;
- the offscreen document appears only once the panel asks for it.

**It shows nothing about** other platforms, other Chrome versions, profiles with other extensions, or other operators. It is not product acceptance.
