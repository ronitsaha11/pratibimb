---
id: M23.14-capture-status-scope
title: "M23.14 — capture status UI scope alignment (OD-X)"
status: implemented in product builds — a product panel no longer shows captureStatus; real product build inspected; not seen in a browser; evidence-build runtime UNVERIFIED; ADR-0015 still PROPOSED; acceptance criteria unapproved
date: 2026-11-06
label: FACT (tests, mutations and a real product build, on W1); INFERENCE and UNKNOWN marked
classification: PRESENTATION ONLY — one line of the side panel's code; no worker, authority, status, permission, CSP, hook or packaging change; no model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.14 — capture status scope

> **What it is:** the owner's OD-X decision. A normal product's Status box does not show `captureStatus`. An evidence build's still does.
> **What it is not:** a change to the status itself, or a decision on OD-Y, OD-Z or the `activeTab` and `tabCapture` review.

## Hypothesis

The field can leave a product's panel by changing only what the panel prints, with the worker, the status model and an evidence panel left as they are.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `e98e491` before this milestone, 91 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4.
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- A product panel shows no `captureStatus`, no `NO_GRANT` and no placeholder, and keeps the rest of the Status box.
- An evidence panel prints exactly what it printed.
- The worker still reports the status.
- In a real build, only the side panel's files change.

## Actual result

### 1. Where the field came from

The panel had no `captureStatus` display as such. Its Status box printed the worker's whole `HOST_STATUS` reply as JSON, and the field was one key in it. The worker's reply is the only source. **No harness reads it from the panel:** the M13 CSP harness reads the box's styling and `hostStatus`, neither of which changed.

### 2. Product UI before and after

```text
Before                                After
{                                     {
  "bootId": "…",                        "bootId": "…",
  "bootedAt": 1234,                     "bootedAt": 1234,
  "offscreenContexts": 1,               "offscreenContexts": 1,
  "hellos": 2,                          "hellos": 2
  "captureStatus": {                  }
    "lifecycle": "NO_GRANT",
    "requiresReauth": true,
    …
  }
}
```

The same four fields, in the same order, with no placeholder or gap (tested). The rest of the panel, including the `NEEDS_USER` line, the approved OD-T wording and the "status unavailable" message, is unchanged.

**The change:** one line, plus a named list.

```ts
const PRODUCT_STATUS_FIELDS = ["bootId", "bootedAt", "offscreenContexts", "hellos"];
statusEl.textContent = JSON.stringify(s, __EVIDENCE_BUILD__ ? null : PRODUCT_STATUS_FIELDS, 2);
```

**A named list rather than removing one key,** so a field the worker adds later stays out of a product's panel until someone decides to show it (tested). This does mean a new field has to be added to that list to appear.

### 3. Evidence diagnostic preservation

**In an evidence build the expression is `JSON.stringify(s, null, 2)`, the original line.** Under test doubles, with the real worker's reply:

| | Result |
|---|---|
| Status box text | **exactly** `JSON.stringify(reply, null, 2)`, for all five lifecycle values |
| Status values | `NO_GRANT`, `GRANTED`, `STREAM_AVAILABLE`, `DOCUMENT_CHANGED`, `REVOKED`, unchanged |
| Updates | follows the worker: `NO_GRANT`, then `GRANTED` after a click, then `REVOKED` after navigation. **As before, the box refreshes when the panel loads;** it does not poll |
| The Capture field | same legend, messages and data attributes |
| Styling | the page's `<style>` is unchanged |

**Runtime is UNVERIFIED:** no evidence build was made.

### 4. The underlying status is unchanged

**The strongest evidence is the real build (`logs/w1-m23-14-product-build-comparison.json`):**

| File | Against the previous real build |
|---|---|
| `background.js` | **byte-identical** |
| the offscreen chunk, `offscreen.html` | **byte-identical** |
| `content-scripts/content.js` | **byte-identical** |
| `manifest.json` | **byte-identical** |
| `tr01-worker.js`, the WXT chunk | **byte-identical** |
| the side panel chunk | changed, as intended |
| `sidepanel.html` | changed only by the chunk's hashed file name |

So the worker that holds the status, the authority inside it, the toolbar, hooks, tasks, reasoner boundary and consent are the same bytes as before.

**In a product, under fakes:** the worker's `HOST_STATUS` still reports `NO_GRANT`, `GRANTED` and `REVOKED` as the authority's state changes. `__host.captureStatus` still answers. The panel still asks for the same reply, and filters only what it prints.

### 5. The real product build

Built from commit `09a8754`, with output newer than the commit (`logs/w1-m23-14-product-build-inspection.json`). **Inspection exit 0, `problems: []`.**

| Checked | Result |
|---|---|
| The panel chunk names `captureStatus`, `NO_GRANT`, `GRANTED`, `lifecycle`, `requiresReauth` | **none** |
| The panel chunk's list | `["bootId","bootedAt","offscreenContexts","hellos"]` |
| The worker still names `captureStatus` | **yes** |
| Permissions, including `tabCapture` and `activeTab` | unchanged: `manifest.json` is byte-identical |
| Host permissions, CSP, loopback endpoint | unchanged, likewise |
| T1 packaged | no |
| TR-01 packaged | yes. **The build's hook read and hashed it, as its integrity check does** |
| Hook markers; toolbar opens the panel, with no grant | none; yes |

### 6. Tests

| File | Tests | What |
|---|---|---|
| `apps/extension/test/captureStatusScope.test.ts` (new) | **28** | your ten requirements, numbered; the real panel code on a fake page, fed the real worker's reply |
| `apps/extension/test/buildSeparation.test.ts` | 57 (was 53) | a product bundle of the panel and of the worker; a negative control |
| `tests/browser/support/product-build-inspection.mjs` | not new tests | `captureStatus` and `NO_GRANT` join the wording refused in a product's UI, and its existing per-phrase test covers them |

**Mutation check (`logs/w1-m23-14-mutation-check.json`): 14 of 14 caught,** all files restored (checksums). These include a product printing a placeholder, the evidence panel being filtered, and the worker's reply being changed.

The panel test's fake page moved from `productUiCopy.test.ts` to `support/fakeSidePanel.ts`, so that two test files can share it. No assertion changed in the move.

## Known limitations

1. **Not seen in a browser.** The Status box's rendering, in either build, is not established.
2. **The evidence panel is preserved in source and under fakes.** Its runtime is UNVERIFIED.
3. **The worker still sends `captureStatus` to a product's panel.** It is not displayed, but a person with DevTools can see it in the reply. That is the presentation-only scope you set.
4. **The Status box remains a developer readout in a product,** with `bootId`, `offscreenContexts` and so on. OD-X asked only about this field. The box's place in a product overlaps OD-Y.

## Conclusion

A real product build's panel no longer shows or names `captureStatus`, and everything else in that build, including the worker that holds the status, is byte-identical to the build before it. An evidence panel prints what it printed, under test doubles.

## Reproducibility

```bash
npx vitest run apps/extension/test/captureStatusScope.test.ts apps/extension/test/productUiCopy.test.ts apps/extension/test/buildSeparation.test.ts
```

```bash
npm run typecheck
```

```bash
npx vitest run
```

```bash
npm run build -w @pratibimb/extension
```

```bash
node tests/browser/extension/inspect-product-build.mjs
```

```bash
python scripts/verify-repo.py
```

The build needs no evidence flag set. See `decision.md` for the results.
