---
id: M23.11-gesture-harness-isolation
title: "M23.11 — gesture harness evidence-build isolation (OD-U, Option B)"
status: implemented in the harnesses — run-gesture-capture and run-gesture-acts are evidence-build-only behind one fail-closed gate; neither was run; evidence-build runtime validation outstanding; OD-T still awaiting the owner; ADR-0015 still PROPOSED
date: 2026-11-04
label: FACT (tests, mutations and a read-only check of an existing product build, on W1); INFERENCE and UNKNOWN marked
classification: HARNESS, TEST AND DOCUMENTATION ONLY — no product source, build, browser, harness run, frame, model load, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.11 — gesture harness isolation

> **What it is:** the owner's OD-U decision implemented. Both harnesses now belong to the evidence-build workflow alone, and refuse anything else before Chrome can start.
> **What it is not:** a run of either harness, an evidence build, or a claim that either workflow passes.

## Hypothesis

Existing build metadata can tell a product build from an evidence build reliably enough to gate both harnesses, with no new marker, no second definition of the builds, and every original assertion unchanged.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `20914f1` before this milestone, 83 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4.
- **Builds made:** none. A read-only check used the product build already on disk, from `712465e`. No product source differs from that commit.

## Expected result

- A product, missing or unidentifiable build is refused before Playwright, the fixture server, Chrome or any prompt.
- An evidence build passes the selection logic. Nothing more is claimed.
- All 41 checks and every record field stay as they were.

## Actual result

### 1. The decision, and the scope change

**OD-U, Option B (owner, 2026-11-04):** `run-gesture-capture.mjs` and `run-gesture-acts.mjs` belong exclusively to the evidence-build workflow.

| | Before | After |
|---|---|---|
| **Declared scope** | "the product build" | **an evidence build, and nothing else** |
| **A product build** | accepted. M4 then threw on a missing driver, and M5 ran with checks that could not pass | **refused,** exit 2, before anything starts |
| **No build at all** | refused, and told the reader to make a product build | **refused,** with no fallback and no instruction to make one |
| **An unidentifiable build** | accepted | **refused,** with its reasons |
| **Degraded worker-frame build** | refused | refused, by the gate and by the original guards, which stay |
| **E6 build** | accepted | **refused** (see §2) |
| **Making a build** | never | never |

### 2. How a build is identified

`identifyBuild`, in `tests/browser/support/build-separation.mjs`, the module that already defines the two builds. **No marker was invented.** It reads differences the build configuration already makes, and judges by what the build contains, since every variant is written to the same `.output/chrome-mv3`:

| Signal | Product | Evidence | Established by |
|---|---|---|---|
| `connect-src` | exactly the reasoner endpoint | exactly the collector origin | ADR-0013; `wxt.config.ts` |
| The hooks' names | none (M23.9's inspection) | all of `EVIDENCE_REQUIRED_NAMES` | M23.9, M23.10 |
| `t1-ui-head.onnx`, by file name; never opened | absent | present | M23.7 |
| The rest of the manifest | ADR-0013's policy | the same | `productManifestProblems` |

**Every signal must agree, or the identity is UNKNOWN.** Mixed builds, such as the product's policy with an evidence build's hooks, are treated as neither.

**Two refusals within the evidence family keep what these harnesses always needed:** the degraded `M3_WORKER_FRAME` route would look identical in their logs, and `E6_PROBE` adds content-script mechanisms that consult no permit, so a click count taken beside them would not be a count of what the gates allowed. Originally there were no such mechanisms on the page side.

**On the real product build (`logs/w1-m23-11-real-product-build-refused.json`):** identity `PRODUCT`, `accepted: false`, with this refusal: "this is a product build. OD-U: this harness is evidence-build-only…". The gate was called directly. Neither harness was executed.

**What this gate is for:** accidents, not an adversary. It reads build contents at start-up. A hand-crafted directory could imitate an evidence build.

### 3. Before and after: assertion inventory

**Both `checks` blocks are byte-identical to `20914f1`** (12 and 29 checks, pinned by SHA-256). The category table is what those checks cover, and it says plainly where a category was never asserted.

| Category | `run-gesture-capture` (unchanged) | `run-gesture-acts` (unchanged) |
|---|---|---|
| **Human gesture authority** | `refusedBeforeTheGesture`, `noGrantsBeforeTheGesture`, `aRealInvocationWasRecorded`. No `noteGrant` call | `everyActWasAuthorisedByAPerson`; `waitForGesture` |
| **Grant issuance** | `theGrantMintedAnOpaqueHandle` | new grant required per act, in `waitForGesture` |
| **Grant expiry and revocation** | **never asserted here;** `captureAuthority.test.ts` covers it | revocation exercised by `freshDocument`'s reload; expiry never asserted here |
| **Tab and navigation binding** | `grants.find((g) => g.tabId === identity.tabId)` | same, plus one click per fresh document |
| **Perception output** | `perceptionRanOnTheStreamRoute`, `theDetectorRanOnThePinnedArtifact`, `fusionJoinedDomAndVision`, `theBuildHasNoWorkerCapturePath` | `everyCaptureUsedTheStreamRoute`, `successPerceivedVisually`, `noFrameWasEverEncoded`, `theTextTierReportedItsAbsence` |
| **TR-01 diagnostic processing** | **never asserted.** These predate TR-01's integration. The reply's `redaction` is recorded in `steps` | **never asserted** |
| **Stream ownership and validation** | `theOffscreenRealmConsumedTheHandle`, `aRealFrameArrivedInThePerceptionRealm`, `theWorkerCarriedTheHandle` | `everyCaptureUsedTheStreamRoute` |
| **Redaction** | **never asserted;** `run-gesture-redaction` covers it | **never asserted as masking.** Values: `noValueInAnyWorkerMessage`, `noValueInTheHandoffThatWasSent`, `nothingLeakedToTheReasoner` |
| **Click and action safety** | not applicable: it clicks nothing | `successClickedOnce`, `refusalClickedNothing`, `outageClickedOnce`, `successReleasedOnce`, `refusalReleasedNothing`, `outageReleasedOnce`, `refusalNeverAskedAHuman`, `everyObservedEventIsOurs` |
| **Result verification** | not applicable | `successWasConfirmed`, `outageWasConfirmed`, `successRestoredTheRightValue`, `successReachedTheEnd`, `outageReachedTheEnd` |
| **Negative controls** | the refused pre-gesture ticket | the `REFUSAL` and `OUTAGE` acts: `refusalWasRefused`, `refusalBlockedAtTheLiteral`, `refusalDidNotFallBack`, `successDidNotFallBack`, `outageFellBack` |
| **Evidence integrity and recording** | `noPixelsAnywhereInTheWorkersRecording`; record fields, file name and `assertOwnEvidencePath` unchanged | `noPixelsInAnyWorkerMessage`, `noPixelsInTheHandoffThatWasSent`, `noPixelsInTheRunRecords`; record fields, file name and `assertOwnEvidencePath` unchanged |

**The four checks that cannot pass on a product build** (`theDetectorRanOnThePinnedArtifact`, `fusionJoinedDomAndVision`, `everyCaptureUsedTheStreamRoute`, `successPerceivedVisually`) **are kept unchanged as evidence-build requirements.**

**What did change in the two files:**

| Change | Where |
|---|---|
| The gate, called first | both |
| `(run: npm run build …)` refusal removed; the gate covers a missing build, and that advice would now produce a refused build | both |
| Header descriptions | both |
| Refusal wording: "not the product one" → "not a gesture-route evidence build" | M4 |
| `claim`: "the complete product loop" → "the complete loop in an evidence build" | M5 |
| One added `notAClaim` entry: measured on an evidence build | both |

**Record schema:** every field name is unchanged. The last two rows change string values only.

### 4. Tests

| File | Tests | What |
|---|---|---|
| `tests/browser/support/gesture-harness-gate.test.mjs` (new) | **59** | identity and selection on synthetic builds (model names are directories, so opening one throws); a fake browser that must not start on refusal; both harnesses read as text. **Your twelve requirements are numbered in the test names** |
| `apps/extension/test/gestureHarnessAuthority.test.ts` (new) | **11** | each harness's call sequence against a controlled gesture authority (real worker and offscreen document under fakes), with its grant and stream checks evaluated expression for expression. On a product build, the same sequence shows why it is refused |
| `build-separation.test.mjs`, `diagnosticHooks.test.ts` | 73, 49 | the pins saying OD-U was open now say it is implemented. No count changed |

**Mutation check (`logs/w1-m23-11-mutation-check.json`): 47 of 47 caught,** every file confirmed restored by checksum. 22 on identity, selection and the gate; 24 on the two harnesses, including removing or moving the gate, adding a build step, making a check vacuous and dropping a record field; 1 giving the gate to a seventh harness. The first run caught 46, and the miss led to a stronger test.

**What the authority test leaves out:** the checks that need a real detector or page. It says those checks' grant and stream logic holds under fakes, and nothing about a real run.

### 5. M23.10 is unaffected

The six OD-V harnesses have **no diff.** `judgeBuildSeparation` is unchanged, all 73 of its tests pass, and no byte-identical worker comparison returned. The gesture harnesses take the new gate and not that comparison, because they make no builds to compare.

## Known limitations

1. **Neither harness was run, and no evidence build exists.** **Evidence-build runtime validation is outstanding.**
2. **The gate has only been shown to accept synthetic evidence builds.** On a real one it rests on the configuration and on names partly inferred (M23.10's limitation 3). A wrong inference refuses, safely.
3. **Whether their checks pass today is UNKNOWN.** Every recorded real run in this repository passed on 2026-09-24 (`run-gesture-capture` in M4; `run-gesture-acts` in M5 and M5.1), and much has changed since. Some may now fail on an evidence build for reasons nobody has looked at.
4. **`theDetectorRanOnThePinnedArtifact` overstates:** T1's bytes are not integrity-checked in a build (OD-O). The name is kept, because assertions were not to change. It should not be read as a pin.
5. **Unlike the six, these two cannot compare `content.js` or the manifest across builds:** they make no builds. Their manifest is held to the product policy by constant, and E6's markers are looked for. Any other change to `content.js` would not be caught here.
6. **A real run would overwrite a historic record.** Both write to `w1-cft153-gesture-capture.json` and `w1-cft153-gesture-acts.json` in the M4 and M5 logs, the tracked September records, and have no check against that, unlike the six. Recoverable from Git, but **worth resolving before authorising a run.** Not changed here.
7. **F-3 and F-4 remain in evidence builds.**

## Conclusion

Neither harness can now run on a normal DOM-only product build by accident: the real product build is refused before anything starts, and a build that cannot be identified is refused too. All 41 checks are unchanged. This establishes the gate and the wiring, and nothing about whether the evidence workflows pass. That needs a separately authorised run.

## Reproducibility

```bash
npx vitest run tests/browser/support/gesture-harness-gate.test.mjs apps/extension/test/gestureHarnessAuthority.test.ts
```

```bash
npm run typecheck
```

```bash
npx vitest run
```

```bash
python scripts/verify-repo.py
```

See `decision.md` for the results. Do not run either harness without the owner's authorisation.
