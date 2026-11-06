---
id: M23.13-toolbar-interaction
title: "M23.13 — Phase 1 toolbar interaction alignment (OD-W)"
status: implemented in product builds — the toolbar opens the side panel and issues no capture grant; real product build inspected; not tried in a browser; evidence-build runtime UNVERIFIED; ADR-0015 still PROPOSED; acceptance criteria unapproved
date: 2026-11-06
label: FACT (tests, mutations and a real product build, on W1); INFERENCE and UNKNOWN marked
classification: NARROW UI INTERACTION CHANGE — one handler; no permission, CSP, egress, authority, TR-01, T1 or hook change; no model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.13 — toolbar interaction

> **What it is:** the owner's OD-W decision. In a normal product, clicking the toolbar button opens the side panel, and nothing else.
> **What it is not:** a browser check, or a decision on OD-X, OD-Y or OD-Z.

## Hypothesis

The product toolbar can open the side panel, with the existing flag and the existing `sidePanel` permission, and issue no capture grant, while an evidence build's click stays exactly what it was.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `d10f047` before this milestone, 88 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4.
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- A product click opens the panel for its tab. No grant, ticket, frame, T1, TR-01 or offscreen work follows, including after a failure.
- An evidence click records a grant, as before.
- Permissions, hosts and CSP do not change.

## Actual result

### 1. Before and after

| | Before | Product, after | Evidence, after |
|---|---|---|---|
| **Toolbar click** | records a capture grant; nothing visible | **opens the side panel for that tab** | records a capture grant, as before |
| **Capture grant** | yes | **no** | yes |
| **Ticket, frame, T1, TR-01** | not by the click | **no** | not by the click, as before |
| **Message sent** | none | **none** | none |
| **Opens the panel** | no | **yes** | no, as before |
| **No tab id** | nothing | opens for the window if it has one; otherwise reports `NO_TAB_TO_OPEN_THE_SIDE_PANEL_FOR` | nothing, as before |
| **Panel fails to open** | — | reports `SIDE_PANEL_DID_NOT_OPEN` to the worker's console. **No fallback** | — |

**The source change:** one listener in `host/background.ts`, behind the existing `__EVIDENCE_BUILD__`, and one small module, `host-lib/toolbar-action.ts`. `wxt.config.ts` has **no diff**. The existing manifest entries, the `sidePanel` permission and `side_panel.default_path` already supported this.

**Why `sidePanel.open` and not `setPanelBehavior`:** with `setPanelBehavior`, Chrome handles the click itself and `action.onClicked` does not fire, in both builds unless carefully gated, and a missing tab or a failed open could not be seen or reported. `sidePanel.open` keeps the evidence listener as it was. It needs a user gesture, so the handler is **synchronous**: `open` is called before the listener returns (tested).

### 2. The keyboard shortcut

**Finding: it is the same route, and cannot be separated from the click.** The source has no `chrome.commands` or `onCommand` listener anywhere (tested). The manifest's only command is `_execute_action`, Chrome's built-in meaning for "activate the action", which is documented to fire `action.onClicked`.

| | Shortcut in a product | Shortcut in an evidence build |
|---|---|---|
| **Issues an unused grant?** | **No.** There is no separate route that could | yes, as before |
| **Opens the panel?** | the same handler runs | no, as before |

**So no additional owner decision is needed for it.** One thing is **UNKNOWN** until a browser run: whether Chrome treats `Alt+Shift+P` as a user gesture for `sidePanel.open` (FACT for the source; Chrome's behaviour not measured here).

### 3. The real product build

Built from commit `59f4282`, with output newer than the commit (`logs/w1-m23-13-product-build-inspection.json`). **Inspection exit 0, `problems: []`.**

| Checked | Result |
|---|---|
| The minified listener | `chrome.action?.onClicked.addListener(n=>{oe(n,s=>chrome.sidePanel.open(s),s=>console.warn(…))})`, with **no grant in it** |
| `.grant(` in the whole worker | one occurrence: the test-only `noteGrant` control plane member |
| Toolbar opens the panel; issues no grant | `true`; `false` |
| Hook markers (M23.9) | none |
| A `getUserMedia` call; a way to start TR-01 | none; none |
| T1 packaged | **no** |
| TR-01 packaged | yes; the hook checked its hash and size and did not refuse. **The hook read and hashed TR-01, as the build's integrity check does** |
| The OD-T wording | **present. This is its first real build:** M23.12 could not check this |

### 4. Permissions and CSP

Compared against the previous real build (`logs/w1-m23-13-manifest-comparison.json`):

| Field | Result |
|---|---|
| `permissions`, including `sidePanel` and `tabCapture` | **identical** |
| `host_permissions` | **identical** |
| `content_security_policy` | **identical** |
| `side_panel` | **identical** |
| `action.default_title`, `commands` description | differ: M23.12's approved wording, built here for the first time. **M23.13 changed neither** |

### 5. Tests

| File | Tests | What |
|---|---|---|
| `apps/extension/test/toolbarInteraction.test.ts` (new) | **29** | your twelve requirements, numbered; the real worker and offscreen document under fakes, in both builds |
| `apps/extension/test/buildSeparation.test.ts` | 53 (was 50) | the listener in a product bundle, a negative control, and permissions per flag |
| `tests/browser/support/product-build-inspection.test.mjs` | 13 (was 12) | a toolbar with no panel, a grant or a popup fails |
| `apps/extension/test/gestureHarnessAuthority.test.ts` | 12 (was 11) | `waitForGesture` would never see a grant from a product click |

**Mutation check (`logs/w1-m23-13-mutation-check.json`): 24 of 24 caught,** all files restored (checksums). These include a failure falling back to a grant, a click starting offscreen work, the handler awaiting before `open`, and evidence opening the panel.

**Tests that assumed a product toolbar grant.** 11 product tests clicked the toolbar to get "a live grant". They would have kept passing while no longer testing that, so they now put a grant in the authority directly, through the test-only `noteGrant`. Their claim, that a task ignores a grant, is kept. Evidence tests still click.

**`captureAuthority.test.ts` has no diff,** and its expiry and revocation tests pass. The authority module reads no build flag.

## Known limitations

1. **Not tried in a browser.** Whether Chrome opens the panel from this click or the shortcut, and whether a repeat click is harmless, is UNKNOWN. The types describe a global panel opening in the given tab; that is documentation.
2. **A failure is visible only in the worker's console.** A person sees nothing happen. No UI for this was approved.
3. **Chrome's own `activeTab` still applies.** The manifest keeps `activeTab`, so Chrome itself gives this extension temporary access to the tab on the click. Nothing in a product build uses it, and no stream id is minted, but it is not PratiBimb's to prevent while the permission stays.
4. **In a product build the capture authority is now idle.** It is still built, and reports `NO_GRANT`. `tabCapture` and `activeTab` have no product user. Both were to stay unchanged. **Worth an owner decision at some point.**
5. **`noteGrant` remains in a product's DevTools-only control plane.** It records a grant nothing consumes. Tests use it.
6. **Evidence-build runtime stays UNVERIFIED.** Its click is preserved in source and under fakes.

## Conclusion

A real product build's toolbar now opens the side panel and issues no grant, and the shortcut takes the same path. Permissions, hosts and CSP are identical. An evidence build's click is what it was, under test doubles. A browser run is still needed to show that Chrome does what its API promises here.

## Reproducibility

```bash
npx vitest run apps/extension/test/toolbarInteraction.test.ts apps/extension/test/buildSeparation.test.ts tests/browser/support/product-build-inspection.test.mjs
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
