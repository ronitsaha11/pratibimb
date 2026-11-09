# M23.20 — operator checklist: A1–A6 and B1 (fresh profile, side panel never opened)

> **Who does what:** the operator, the project owner, does every step in Chrome. Claude records only what the operator reports, and never marks a check PASS or FAIL before then.
> **Scope:** read-only checks of Chrome's own pages. No reasoner, no fixture server, no page on `127.0.0.1`, no task.

## Rules for the whole session

**Do not:**
- click PratiBimb's toolbar button;
- press `Alt+Shift+P` (DEF-M23.19-01 is not to be investigated);
- open any web page, including `127.0.0.1`;
- click **service worker** under Inspect views, or open any DevTools.

Any one of these can open the side panel or create the offscreen document before B1 is recorded. **Opening the panel ends the session** for B1.

**STOP and report at once** if any of these appears:
- a permission prompt;
- a capture indicator or screen-sharing bar;
- a security warning;
- an error on the extension's card;
- anything the operator did not cause.

## Steps

| Step | Do | Record | Expected |
|---|---|---|---|
| S1 | In PowerShell, launch Chrome for Testing with a **new** profile (command below) | the local time | Chrome opens on a blank profile |
| S2 | Open `chrome://version` | the first line's version | **153.0.8010.12** (Chrome for Testing) |
| S3 | Open `chrome://extensions`. Turn on **Developer mode**. Choose **Load unpacked** and select `apps/extension/.output/chrome-mv3` in the repository | whether it loads | loads |
| A1 | Read the extension's card | the name, and any error | **PratiBimb — Page Assistant (Development build)**; no error |
| A5 | Note any warning or notice shown at load or since | each one, word for word, or "none" | none expected; none inferred |
| **B1** | **Immediately,** on the card, read **Inspect views** without clicking anything in it | every entry listed, exactly | **`service worker` at most** (possibly marked inactive); **no `offscreen.html`** |
| A2 | Click **Details**. Read **Permissions** and **Site access** | exactly what Chrome lists | nothing capture-related; site access `http://127.0.0.1/*`; **not** "Read and change all your data on all websites" |
| A4 | Read the card and Details | any of "minimal host", "minimal MV3", "experiment", "not the product" | none |
| A6 | On the card, in Details and in the tooltip, look (not exhaustively) for *"Run PratiBimb's offscreen runtime for DOM-based browser assistance."* | seen, and where, or not seen | either; **not seen does not prove it is never shown** |
| A3 | Pin PratiBimb from the puzzle-piece menu. **Hover** over its toolbar button. **Do not click it** | the tooltip text | **PratiBimb — Page Assistant** |
| B1-recheck | Back on `chrome://extensions`, refresh, and read **Inspect views** again | every entry listed | still no `offscreen.html` (hovering opens nothing) |

**Then stop.** Report every row to Claude. **Leave Chrome open,** and do not open the side panel unless the owner instructs it in a later step.

## S1 command (PowerShell)

```powershell
& "$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe" --user-data-dir="$env:TEMP\pratibimb-m23-20-profile-$(Get-Date -Format yyyyMMddTHHmmss)" --no-first-run --no-default-browser-check
```

The `m23-20` name keeps this profile separate from M23.19's, which is **not to be deleted**.

## Screenshots

**None is authorised for M23.20.** M23.19's screenshot approval covered the side panel only, and the side panel is not opened here.
- If the owner wants screenshots of `chrome://version` or `chrome://extensions`, that needs a separate approval.
- Anything shared in chat stays in chat. Nothing is archived without approval.
