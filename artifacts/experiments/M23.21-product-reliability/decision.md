# M23.21 — decision record

**Verdict: FIX IMPLEMENTED, AUTOMATICALLY VERIFIED AND VERIFIED IN CHROME FOR TESTING 153.0.8010.12 ON W1 BY THE OPERATOR. NOT PRODUCT ACCEPTANCE.**

| Item | Outcome |
|---|---|
| DEF-M23.19-01 cause | **established from Chromium 153.0.8010.12's source:** `Alt+Shift+P` is Chrome's `IDC_CREATE_NEW_TAB_GROUP` on Windows and Linux, so `CanAutoAssign` refused it, and the key was never the extension's |
| Fix | `suggested_key` set to **`Ctrl+Shift+Y`**, which Chrome 153 does not claim. Still `_execute_action`, the toolbar's own event. No listener, permission, host, CSP or lifecycle change |
| Build | only `manifest.json` differs from the `8d3ce5f` build. The JavaScript is byte-identical. `problems: []` |
| Tests | 1470 of 1470 pass in `apps/extension/test` and `tests/browser/support`; typecheck passes; 13 of 13 mutations caught. Re-run after the browser session: the full suite, 3788 passed and 22 skipped |
| Browser | the operator reported V1–V14 completed. **`Ctrl+Shift+Y` opens the PratiBimb side panel, and so does the toolbar button** (V6, V9, V10 PASS). Chrome's own profile record assigns `windows:Ctrl+Shift+Y` to the extension's `_execute_action`. Record: `logs/w1-m23-21-manual-verification-record.json` |
| A6 | **not a product defect:** a Chrome UI visibility limitation. One creation site, an accurate non-empty justification, created only on the panel's `HOST_STATUS`. The operator completed the lifecycle rows (V1, V4, V5, V7, V8, V11, V12); **their values were not reported**, so they are recorded as completed, not as observed matches |
| DEF-M23.19-01 status | **FIXED — VERIFIED IN A BROWSER on W1, Chrome for Testing 153.0.8010.12.** Not shown for other platforms, Chrome versions or profiles |

## For the owner

1. **The lifecycle values.** If you want V1, V4, V5, V7, V8, V11 and V12 recorded as observed, report what each showed. Until then they stay COMPLETED — VALUE NOT REPORTED. V13 (optional) was not reported.
2. **The offscreen reason.** The product declares `WORKERS` but starts no worker. Options:
   - keep it;
   - choose another reason;
   - review whether a product needs the offscreen document's current role.

   Each changes the lifecycle, so it was not changed here.
3. **The documents that still name `Alt+Shift+P`** (listed in `README.md`): whether to correct them, and how.
4. **Commit and push:** only on your approval. The branch name `fix/m23.21-product-reliability` fails CI's branch-name rule (the dot); a CI-valid name is needed before a PR.

## Not done

- Claude did not launch or control a browser. No reasoner or fixture server was started. No model was opened for inference, and no task ran.
- No frame was captured. T1 and TR-01 were not used. No screenshot was taken.
- M23.19, M23.20, the ADRs, gates, invariants and frozen specifications are unchanged.
- FR-01 stays DEFERRED — NOT AUTHORISED, and B-07 stays BLOCKED.
- No commit or push.
