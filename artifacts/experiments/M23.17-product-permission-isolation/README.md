---
id: M23.17-product-permission-isolation
title: "M23.17 — product-only permission isolation (RD-5, RD-6)"
status: implemented in product builds — neither tabCapture nor activeTab in a normal product manifest; evidence builds' declarations preserved in the real config; real product build inspected; no evidence build made; not run in a browser; not product acceptance
date: 2026-11-06
label: FACT (tests, mutations, the real config and a real product build, on W1); INFERENCE and UNKNOWN marked
classification: BUILD CONFIGURATION AND ASSURANCE ONLY — one manifest key in a product build; no product source, CSP, host permission, connect-src, hook, packaging or task change; no browser, evidence build, model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.17 — product-only permission isolation

> **What it is:** the owner's RD-5 and RD-6. A normal product declares neither `tabCapture` nor `activeTab`. Evidence builds keep both.
> **What it is not:** authority for a Chrome smoke test, or product acceptance. It does not change any other M23.16 recommendation, none of which is adopted by this.

## Hypothesis

No normal product path depends on either permission, so both can leave a product's manifest with no other file in the build changing, and with the evidence workflows' contract narrowed to exactly that difference.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `da877a9` before this milestone, 96 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4.
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- A product manifest differs in `permissions` alone. No other built file changes.
- Evidence manifests do not change.
- The contract passes on that difference and refuses any other.
- No normal product path breaks. If one needed either permission, the milestone stops.

## Actual result

### 1. Dependency audit, before any edit

**No normal product runtime path requires either permission. There was no reason to stop.**

| | `tabCapture` | `activeTab` |
|---|---|---|
| **Manifest source** | `wxt.config.ts:187`, a list shared by every build | same |
| **Product source consumers** | `background.ts:41` (wrapper given to the capture authority, called lazily); `:267-268` and `offscreen/main.ts:445` (`typeof` and `?.` only) | **none.** No code reads `tab.url`, `tab.title` or a favicon, and none uses `scripting` or `webRequest` |
| **Runtime path in a product** | **none:** `ticketFor`'s three callers (`background.ts:197,213,382`) are evidence-gated, so nothing reaches the wrapper | **none:** the product's toolbar opens the panel and issues no grant (`:59-65`) |
| **APIs a task does use** | `tabs.sendMessage`, `tabs.query`, `windows.getLastFocused`, `sidePanel.open`, `runtime.*`, `offscreen.*` | same |
| **Evidence use** | **required:** `mintStreamId`, `ticketProbe`, `CAPTURE_FRAME` | **required:** the toolbar's grant (`background.ts:60-62`) |
| **Harnesses at run time on a product** | none probes it | none probes it |

### 2. The product manifest

```
before: "permissions": ["offscreen", "sidePanel", "activeTab", "tabCapture"]
after:  "permissions": ["offscreen", "sidePanel"]
```

**Real build, compared by SHA-256 with M23.15's (`logs/w1-m23-17-product-build-comparison.json`):**

| File | Result |
|---|---|
| `manifest.json` | **changed, in `permissions` alone.** Host permissions, CSP, connect-src, name, toolbar, shortcut and side panel are the same |
| `background.js`, `content-scripts/content.js`, `tr01-worker.js` | **byte-identical** |
| `chunks/offscreen-*.js`, `chunks/sidepanel-*.js`, `chunks/_virtual_wxt-html-plugins-*.js` | **byte-identical** |
| `sidepanel.html`, `offscreen.html` | **byte-identical** |

**8 of 9 files are byte-identical, including all the JavaScript.** So tasks, DOM observation, grounding, consent, clicks, the five-turn ceiling, freshness, postconditions, fail-closed behaviour, egress, every hook, `HOST_STATUS` and the toolbar are the same bytes as before.

### 3. Evidence preservation

**No evidence build was made, as instructed. This is evidence about what a build would be given, not what one produced.** The real `wxt.config.ts` was evaluated for each flag before and after the edit, and its generated manifests compared:

| Flag | Generated manifest | Permissions |
|---|---|---|
| `TR01_PROBE` | **byte-identical** | `offscreen`, `sidePanel`, `activeTab`, `tabCapture` |
| `M3_WORKER_FRAME` | **byte-identical** | same; its `<all_urls>` host is as before |
| `STRUCTURAL_PROBE` | **byte-identical** | same |
| `E6_PROBE` | **byte-identical** | same |
| `EGRESS_EVIDENCE_PROBE` | **byte-identical** | same |

No permission mechanism was replaced or broadened. The gating flag is the existing `EVIDENCE_BUILD`.

### 4. The build-separation contract

| Rule | Check | Mode |
|---|---|---|
| Product has neither, and nothing else unapproved | `PERMISSIONS_CHANGED`, `EVIDENCE_ONLY_PERMISSION_IN_PRODUCT:<name>` (through `inspectProductBuild`) | every mode |
| Evidence has both, and nothing else | `EVIDENCE_LACKS_PERMISSION:<name>`, `EVIDENCE_UNAPPROVED_PERMISSION:<name>`, `EVIDENCE_PERMISSIONS_CHANGED` | **every mode, including a dry run** |
| The difference is exactly the pair, in that direction | `APPROVED_PERMISSION_DIFFERENCE_MISSING:<name>`, `UNAPPROVED_PERMISSION_DIFFERENCE:<name>` | as `acrossBuilds` |
| Everything else in the manifest is the same | `crossBuildManifestRouteSha`: connect-src's sources normalised as before, **and only those two names removed from `permissions`** | as `acrossBuilds` |
| Host permissions the same | `HOST_PERMISSIONS_DIFFER_FROM_PRODUCT`, unchanged | as before |
| connect-src is ADR-0013's difference | `CONNECT_SRC_NOT_THE_APPROVED_DIFFERENCE`, unchanged | as before |
| Two evidence builds agree | `manifestRouteSha`, **unchanged and strict:** nothing is set aside | as before |
| Worker and content differences | OD-V's rules, unchanged | as before |

`PERMISSIONS_DIFFER_FROM_PRODUCT` is replaced by the two named difference codes, which are stricter: equal lists now fail.

### 5. Harnesses

**Three things assumed equal permissions. M23.16's report named only the first, and said the gesture harnesses appeared unaffected. That was wrong, and is corrected here rather than in the report:**

1. **`judgeBuildSeparation`:** as the report said.
2. **`sharedRouteIdenticalToProduct`, in each of the six OD-V harnesses:** their own second guard hashed the whole manifest. The report missed it.
3. **`identifyBuild`, which both gesture harnesses call through `requireGestureEvidenceBuild`:** it held an evidence manifest to the product's permission list. **Without this fix, every real evidence build would have read as UNKNOWN, and been refused.**

| Harness | Change |
|---|---|
| `run-artifact-verifier`, `run-capture-determinism`, `run-stream-j7`, `run-stream-re1`, `run-webp-loopback` | the import, `manifest: crossBuildManifestRouteSha(EXT)`, and the comment above the guard |
| `run-gesture-redaction` | the same, and its header comment, which said the permissions are the product's |
| `run-gesture-capture`, `run-gesture-acts` | **none:** the change is in the gate they call |

**Their per-window, capture and stream assertions, evidence-only restrictions, product refusals and unknown-build refusals are unchanged. None was run.**

### 6. A reachable capture path

The inspection gains `CAPTURE_TICKET_CALL_IN_BUNDLE`, and reports `workerCallsForACaptureTicket`. Real build: `false`, `callsGetUserMedia: false`, `workerMintsCaptureHandles: true`. **The unreachable wrapper is still in the worker,** because this milestone changes no product source.

`permissionIsolation.test.ts` runs the real worker and offscreen document with `chrome.tabCapture` absent: the worker boots, a task completes with every capture counter at zero, the toolbar opens the panel, `HOST_STATUS` answers, and a capture request is not served.

### 7. The checks catch regressions

`logs/w1-m23-17-mutation-check.json`: **47 deliberate mutations, 47 caught, all restored** (checksums verified). They cover each of the two required permissions, unrelated permission differences, host permissions, each contract check, the route helper, `identifyBuild`, the inspection, a capture gate and all eight harnesses' wiring.

## Known limitations

- **No browser ran.** That Chrome opens the side panel from a toolbar click with no `activeTab`, and runs a task with neither permission, is **INFERENCE** from source and fakes. M20's person-run opened the panel from Chrome's own button and predates M23.7. Smoke checks A2, A5 and A6 would test this, and need a separate authorisation.
- **Evidence-build runtime stays UNVERIFIED.** Preservation is shown from the config and synthetic builds. No real evidence build was examined against the revised contract. A real harness run is the first time it will be.
- **Chrome's documented permission warning was not observed.**
- **`ADR-0015`'s permission list (its line 77) still names both.** It was not edited. It needs updating before approval.
- **Old records:** the `manifest` hash a harness records is now the cross-build one, so it does not compare with older logs' values.
- **Earlier wording:** `diagnostic-hook-boundary-map.md:120` and `dom-only-regression-matrix.md:126` describe the earlier state. "No capture call" (RD-7) is still pending and still overstated, since the wrapper remains.

## Conclusion

**Supported.** A normal product declares neither permission, one manifest key is the only change in its build, and the contract allows exactly that difference. **This is permission isolation only. It does not authorise a Chrome smoke test or declare product acceptance.**

## Reproducibility

```bash
npx vitest run tests/browser/support/csp-product-phase.test.mjs tests/browser/support/build-separation.test.mjs tests/browser/support/gesture-harness-gate.test.mjs apps/extension/test/permissionIsolation.test.ts
```

```bash
TR01_PROBE= M3_WORKER_FRAME= STRUCTURAL_PROBE= E6_PROBE= EGRESS_EVIDENCE_PROBE= npm run build -w @pratibimb/extension
```

```bash
node tests/browser/extension/inspect-product-build.mjs
```

The build's own hook reads and hashes TR-01, as its integrity check requires. It loads no model.
