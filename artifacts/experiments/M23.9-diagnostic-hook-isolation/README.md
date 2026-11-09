---
id: M23.9-diagnostic-hook-isolation
title: "M23.9 — diagnostic hook isolation and evidence-build separation (OD-S, Option B)"
status: implemented in product builds — PERCEIVE_ONCE and STREAM_CONSUME are absent from a real product build; evidence-build behaviour preserved in source and under test doubles, runtime UNVERIFIED; not browser-verified; six evidence harnesses now refuse to run (OD-V); ADR-0015 still PROPOSED
date: 2026-11-04
label: FACT (test results, a real product build and its output, on W1); INFERENCE and UNKNOWN marked
classification: IMPLEMENTATION (owner-approved, narrowly scoped) — two product source files; no permission, CSP, egress, authority or TR-01 change; no model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.9 — diagnostic hook isolation

> **What it is:** the owner's OD-S decision, Option B, implemented. A product build does not contain the diagnostic hooks.
> **What it is not:** a browser validation, an acceptance, or a decision on OD-T, OD-U or OD-V.

## Hypothesis

`PERCEIVE_ONCE` and `STREAM_CONSUME`, with their senders and what only they reach, can be made absent from a product bundle using the existing evidence-build flag, leaving the product's task path, permissions and CSP unchanged, and an evidence build's code, authority checks and replies as they were.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `3ad7e77` before this milestone, 79 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4; WXT 0.21.4 on Vite 7.3.6; esbuild from the workspace install (a transitive dependency, no `package.json` change).
- **Builds made:** the product build only, with every evidence flag cleared. **No evidence build was made.**

## Expected result

- The product bundle names neither hook, no driver and no capture ticket, and has no capture call.
- The manifest, the content script and the side panel do not change.
- With the evidence flag, under fakes, both hooks work as they did, with the same grant checks and replies.

## Actual result

### 1. What changed in the product source

Two files. `wxt.config.ts` is not touched: no new flag, permission, CSP or alias.

| File | Behind `__EVIDENCE_BUILD__` now |
|---|---|
| `host/offscreen/main.ts` | the `PERCEIVE_ONCE` handler; the `STREAM_CONSUME` handler; the call handing the TR-01 probe its context (it names `perceiveTab`); a task's perception port |
| `host/background.ts` | `perceiveOnce`, `consumeProbe`, `ticketProbe`, `mintStreamId`, in one object a bundler drops whole; the `CAPTURE_FRAME` handler |

**The drivers moved and did not change:** a whitespace-insensitive diff shows no changed line in three of them, and `mintStreamId` relocated verbatim.

**The one edit on the task path:** a task's perception port now also sits behind the flag in place, as `...(__EVIDENCE_BUILD__ ? taskPerception(...) : {})`. A product task already got `{}` from `taskPerception(false, ...)`, so its behaviour is identical. The edit is there because a reference is enough to keep code in a bundle, and this was the last reference to the capture path. The 65 task-path tests pass unchanged.

### 2. The real product build (`logs/w1-m23-9-product-build-inspection.json`)

Built from commit `712465e` at 12:28:38Z, after that commit (12:27:58Z). Inspection exit 0, **`problems: []`**.

| Checked in the built output | Result |
|---|---|
| `PERCEIVE_ONCE`, `STREAM_CONSUME` | **absent** from every extension file |
| `perceiveOnce`, `consumeProbe`, `mintStreamId`, `ticketProbe` | **absent** |
| `CAPTURE_FRAME`, `CAPTURE_TICKET`, `chromeMediaSourceId`, `grabFrame` | **absent** |
| A `getUserMedia` call | **none.** `REALM_PROBE` still asks whether it exists (`typeof`) and does not call it |
| A way to start TR-01 from the offscreen document | **none** (no `tr01-worker` reference) |
| Side panel, content script | name neither hook; the panel has no diagnostic control |
| Permissions | `offscreen`, `sidePanel`, `activeTab`, `tabCapture`: **unchanged** |
| Host permissions | `http://127.0.0.1/*`: **unchanged** |
| `connect-src` | `'self' http://127.0.0.1:8995/v1/chat/completions`: **unchanged** |
| T1 | **not packaged** |
| TR-01 | packaged. The build's own hook checked its hash and size against the pin and did not refuse |

**Against the build from before this milestone (`logs/w1-m23-9-product-build-comparison.json`):**

| File | Result |
|---|---|
| `manifest.json`, `content-scripts/content.js`, `sidepanel.html`, the side panel chunk, the WXT chunk | **byte-identical** |
| `background.js` | changed, 17,665 → 16,235 bytes |
| the offscreen chunk | changed, 164,029 → 120,141 bytes |
| `offscreen.html` | changed: it names the offscreen chunk, whose name carries a content hash |

### 3. What a product build still contains, and why

"No sender capable" has one limit that should be stated plainly.

| Still in a product bundle | Why | What it can do |
|---|---|---|
| **`__host.toOffscreen`**, a generic forwarder | it names no kind. M13's product phase (`ORT_SMOKE`) and the observation harnesses (`TRANSPORT_OBSERVE`) drive through it | it can send any message, as any context of this extension can with `chrome.runtime.sendMessage`. A forwarded hook kind gets `UNKNOWN_KIND`, and nothing starts (tested) |
| **The capture authority**, including its `getMediaStreamId` wiring and `ticketFor` | changing it was forbidden. The toolbar's grant and the panel's status use it | `ticketFor` has no caller: `background.js` contains the name once, its definition |
| `tabCapture`, `activeTab` | forbidden to change | nothing in a product build now uses `tabCapture`. Whether to keep it is a separate owner decision (`od-s-diagnostic-hooks-comparison-PROPOSED.md`) |
| TR-01's model and worker, ORT | forbidden to change | packaged, with nothing in the product bundle to start TR-01. OD-F |
| The name `t1-ui-head.onnx` in the offscreen chunk | `ortSmoke`'s evidence branch, behind the function `loadsUiHead(false)`, which a bundler cannot decide | never fetched in a product build (tested). Unchanged since M23.7 |

### 4. Tests

| File | Now | What it adds |
|---|---|---|
| `apps/extension/test/diagnosticHooks.test.ts` | 49 (was 23) | **Rewritten.** Product: 21 tests of absence. Evidence, under fakes: 22 tests. Also `ORT_SMOKE` (3) and the harness dependencies (3) |
| `apps/extension/test/buildSeparation.test.ts` | 40 (was 30) | **The product bundle, in memory, from source,** using the real config's product flags and aliases. **Six negative controls:** remove any one gate and the same search finds what it was keeping out |
| `tests/browser/support/product-build-inspection.test.mjs` | 9 (was 6) | a hook in a product bundle is now a problem, not a fact |
| `apps/extension/test/domOnlyPhase1.test.ts` | 18 | two source pins updated for the gate in place |

**Net: 39 more tests.** All are evidence type A.

**The regression double changed:** the task-path negative controls used to mock `task-perception.ts`. Since the gate now sits in `main.ts`, the double flips the flag. Those 2 tests assert the same results and pass.

### 5. An evidence build: preserved in source and under doubles

Both hooks and all four drivers are registered. Sender checks, the gesture-grant requirement, the capture authority and the reply shapes are as they were (exact field lists; `PERCEIVE_ONCE_THREW`; `{ ok: false, error }`). The TR-01 probe gets the same context, and its `perceiveTab` drives a pass.

**Stated plainly, because the brief asked for more than exists:**
- **"Invalid stream IDs are refused" is the browser's refusal, not the extension's.** The `STREAM_CONSUME` handler has no id check of its own (M23.8, F-4), and it passes whatever it is given to `getUserMedia`. The test shows a typed failure and no frame when a **fake** browser refuses an unminted id. That models Chrome and does not establish what Chrome does. Adding a check would have changed evidence-build behaviour, so it was not added.
- **A content script of this extension is still accepted by both hooks in an evidence build** (M23.8, F-3). Preserved, not fixed, and pinned.

**Runtime preservation is UNVERIFIED.** No evidence build was made, as instructed.

### 6. What OD-S costs the harnesses

**This corrects M23.8.** The OD-S comparison said evidence workflows were "unchanged where they already use an evidence flag". **That was wrong, and the owner's decision was made with it in front of them.**

| Harness | Effect | Status |
|---|---|---|
| `run-gesture-redaction`, `run-webp-loopback`, `run-artifact-verifier`, `run-capture-determinism`, `run-stream-j7`, `run-stream-re1` | **Each hashes `background.js` in the product and evidence builds, and refuses unless they match** (`routeIdenticalToProduct`). OD-S puts senders in one worker and not the other, so they cannot match. These formal runs **will refuse, fail-closed, with "the evidence build's capture route differs from the product's"**. Dry runs skip the check, where a harness has one | **Not changed. OD-V.** INFERENCE: the source reads the flag; no evidence build was compared |
| `run-gesture-capture` | declared on the product build, calls `consumeProbe` and `perceiveOnce`. It will now throw on a product build | **Not changed. OD-U** |
| `run-gesture-acts` | no new effect: uses `captureState`, which stays | OD-U, as before |
| `run-detector-eval` | a product build now throws, rather than reporting every target missed (F-6). An improvement | not authorised to run |
| `run-text-region-eval`, `run-extension-loop`, `run-tr01-worker`, `run-visual-mask`, `run-re1-product` | evidence flags, no byte-identity guard, drivers present | UNVERIFIED |
| `run-csp-negative`, `run-consent-task`, `run-declared-task`, product smoke and benchmark harnesses | use no gated member | not run |

**Why no other design avoids this.** The brief requires no sender in a product build and the existing senders in an evidence build. Both live in the worker, so the files must differ. Keeping senders in the product would keep the guard working and defeat OD-S.

**Why the guards were left alone.** Loosening a check so that it passes is not this milestone's to do, and refusal is the safe failure: no wrong record can come from it.

## Known limitations

1. **No browser ran.** Whether Chrome behaves as these fakes assume, and the product's real behaviour, are still unverified (`docs/acceptance/dom-only-browser-smoke-procedure-PROPOSED.md`).
2. **No evidence build was made.** Evidence-build preservation rests on source and test doubles. Whether one compiles and runs is UNVERIFIED.
3. **Six evidence harnesses now refuse** until the owner decides OD-V, and one more cannot run on a product build (OD-U).
4. **The in-memory bundle test uses esbuild, not WXT's Rollup.** The real build is inspected separately. That inspection needs a git-ignored model file to build, so it does not run in Vitest or CI.
5. **The test imports esbuild as a transitive dependency.** It would fail loudly if the install layout changed.
6. **The panel still says "Click the toolbar button to let PratiBimb look at this tab"** (OD-T). Not changed.

## Conclusion

A real product build no longer contains either hook, any of their drivers, or anything that can start a capture or TR-01, and its manifest, content script and panel are byte-identical to before. Under test doubles an evidence build behaves as it did. The cost, which my M23.8 comparison missed, is that six evidence harnesses now refuse to run until the owner decides how their guard should change. OD-T, OD-U and OD-V remain the owner's.

## Reproducibility

```bash
npx vitest run apps/extension/test/diagnosticHooks.test.ts apps/extension/test/buildSeparation.test.ts apps/extension/test/domOnlyPhase1.test.ts apps/extension/test/domOnlyTaskPath.test.ts tests/browser/support/product-build-inspection.test.mjs
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
