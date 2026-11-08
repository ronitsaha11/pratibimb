---
id: M23.20-chrome-followup-a-b1
title: "M23.20 — Chrome follow-up: A1–A6 and the B1 initial state, fresh profile"
status: COMPLETE — runtime version, A1–A4, B1 and the B1 recheck PASS; A6 NOT FOUND; A5 recorded with no state assigned, by the owner's decision (operator's reports); side panel never opened; not committed
date: 2026-11-08
label: FACT (files, hashes, binary metadata, process flags and port state, read on W1; operator-reported observations); INFERENCE and UNKNOWN marked
classification: HUMAN-OPERATED READ-ONLY FOLLOW-UP, evidence type C at most — Chrome's own pages only; no reasoner, fixture server, model, inference, task, frame capture, T1 or TR-01; no product, permission, shortcut, CSP or egress change
workstation: 1
---

# M23.20 — Chrome follow-up: A1–A6 and B1

> **A separate follow-up record.** M23.19 (`38b24bf`) is the immutable interim checkpoint, and nothing here changes it. M23.19's B1 stays **NOT RUN — NOT RECORDED**, and its B6 stays **FAIL** with DEF-M23.19-01 unresolved. This record observes A1–A6 and B1 in a **new** session, as a separate attempt.

**Files:**
- `operator-checklist.md`: the steps.
- `decision.md`: the verdict.
- `logs/w1-m23-20-followup-record.json`: the results.

## Hypothesis

In a fresh Chrome for Testing profile with the product build loaded:
- Chrome presents the extension as the M23.19B record expects (A1 to A6).
- Before the side panel has ever opened, no offscreen document exists (B1).

## Environment

| Item | Value | Label |
|---|---|---|
| Authorisation | the owner's M23.20 instruction in chat, at 2026-11-08T09:47:11.618Z (15:17:11 IST) by the session transcript. It covers a fresh profile and read-only checks A1 to A6 and B1, and requires that the side panel not open before B1 is recorded | FACT (transcript) |
| Operator | the project owner. Claude does not control Chrome | FACT |
| Checkout | `spike/m22-small-target-recall` at `38b24bf`, equal to `origin/spike/m22-small-target-recall`. Untracked: only the two M20 records, untouched | FACT |
| M23.19 record | no difference from `38b24bf` in either the M23.19 or the M23.19A directory, and its three blob hashes match | FACT |
| Product build | `apps/extension/.output/chrome-mv3`, source `8d3ce5f`: **9 of 9 hashes OK**, and read-only inspection exit 0 with `problems: []`, at 15:17 IST | FACT |
| Chrome for Testing binary | present under `%LOCALAPPDATA%/ms-playwright/chromium-1243/`. Its version resource reads "Google Chrome for Testing" **153.0.8010.12**. **Not launched by Claude.** No Chrome for Testing process was running | FACT (metadata) |
| Profile | new: `pratibimb-m23-20-profile-20261108T152035`, created at 15:20:35 IST. Its `Last Version` stamp reads 153.0.8010.12 (only that file was read). The M23.19 profile, `pratibimb-m23-19-profile-20261108T043254`, is still in place and was not deleted | FACT (file system) |
| Running browser, 15:33 IST | 9 Chrome for Testing processes, all on the M23.20 profile and none on M23.19's. None was started with `--incognito`, `--load-extension` or `--remote-debugging`. So the extension was loaded by hand, and nothing is driving the browser remotely | FACT (process list, booleans only) |
| Services | ports 8975, 8977 and 8995 free; no reasoner state file. **Neither the reasoner nor the fixture server is started** in M23.20 | FACT |

## Expected result

The expected outcomes are those of M23.19B §4 for A1 to A6 and B1, restated in `operator-checklist.md`. The key one, B1: **`service worker` at most, and no `offscreen.html`.**

**Why that is the expected state:** the worker creates the offscreen document only on these routes:
- the panel's `HOST_STATUS`;
- a `__host` hook called from the worker's console;
- a content script's `RELAY_ECHO`, which it sends only for a diagnostic round trip, and only on a `127.0.0.1` page.

The checklist forbids all three before B1 (`apps/extension/host/background.ts:412`, `:438`; `apps/extension/host/content.ts:131`). FACT (source).

## Actual result

Every state below is the operator's: the B1 recheck from their final update, the rest from their report received at 15:33 IST. **None was inferred.** The time of each observation, and the order in which they were made, were not reported. **The side panel has not been opened.**

| ID | State | Observed (operator) |
|---|---|---|
| S2 runtime version | **PASS** | Chrome for Testing **153.0.8010.12**, "operator confirmation and visible browser banner" |
| A1 | **PASS** | the extension name's tooltip shows "PratiBimb — Page Assistant (Development build)". No extension error (see A5) |
| A2 | **PASS** | "No permission entries visibly listed; site access shows `http://127.0.0.1/*`; no all-sites access." That matches the documented expectation: neither `offscreen` nor `sidePanel` carries a permission warning |
| A3 | **PASS** | the toolbar tooltip displays "PratiBimb — Page Assistant" |
| A4 | **PASS** | each of the four prohibited identity phrases returned 0/0 on the extension card and the Details page |
| A5 | **RECORDED — NO STATE ASSIGNED** (owner's decision: kept as an observational record, neither PASS nor FAIL) | "No extension-specific warning or error observed." Browser notices seen: the Chrome for Testing automated-testing banner; a "standard Chromium Incognito warning" (its exact wording and location were not recorded); an orange badge whose tooltip says "Unpacked extension". **None is attributed to the extension's behaviour.** None was launched with `--incognito` (see Environment) |
| A6 | **NOT FOUND** | the exact sentence "Run PratiBimb's offscreen runtime for DOM-based browser assistance." returned 0/0. **Recorded as NOT FOUND, not as a failure:** not seen does not prove that Chrome never shows it |
| B1 | **PASS** | before the panel had opened, Inspect views showed only `service worker`; `offscreen.html` was absent |
| B1-recheck | **PASS** | after `chrome://extensions` was refreshed, Inspect views displayed only `service worker`. No `offscreen.html` appeared |

**What B1 adds:** with M23.19's B3 (`offscreen.html` listed once the panel was open), it gives the before-and-after pair that M23.19 lacked, **across two sessions and two profiles,** not within one. M23.19's own B1 stays NOT RUN — NOT RECORDED.

## Known limitations

- **One operator, one machine, one session:** evidence type C at most.
- **Chrome's own background network traffic is not observed:** no DevTools, packet capture or proxy is used. The extension runs nothing that makes a request here: no page is opened and no task runs.
- **B1 in M23.20 does not retroactively fill M23.19's B1.** They are separate attempts in separate profiles, and M23.19's stays NOT RUN.
- **DEF-M23.19-01 is out of scope** and is not exercised.

## Conclusion

**Complete.** Every planned check was reported by the operator:
- **Runtime:** 153.0.8010.12.
- **A1 to A4: PASS.**
- **A5:** no extension-specific warning or error. It is kept as an observational record with no state, by the owner's decision.
- **A6: NOT FOUND.** The offscreen justification sentence was not seen in Chrome's UI. That is not a failure.
- **B1 and its recheck: PASS.** No offscreen document existed before the side panel was ever opened, including after the A3 hover.

**No stop condition fired.** The side panel was never opened. No reasoner, fixture server, page, task or DevTools was used.

**Session end:** the operator stated that they would close the Chrome for Testing window by hand. Both temporary profiles are kept.

**Nothing here is product acceptance.** It signs no gate, approves neither ADR-0015 nor GOV-01, and does not authorise FR-01. **It does not change M23.19,** whose B1 stays NOT RUN — NOT RECORDED and whose B6 stays FAIL (DEF-M23.19-01, unresolved).

## Reproducibility

```bash
(cd apps/extension/.output/chrome-mv3 && sha256sum -c ../../../../artifacts/experiments/M23.19A-chrome-smoke-readiness/logs/expected-product-build.sha256)
```

The Chrome launch command is in `operator-checklist.md`, step S1.

**M23.20 STATUS: COMPLETE — A1–A6 AND B1 OBSERVED; SIDE PANEL NOT OPENED. NOT PRODUCT ACCEPTANCE.**
