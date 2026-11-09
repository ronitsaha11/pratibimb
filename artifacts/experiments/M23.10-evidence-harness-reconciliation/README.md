---
id: M23.10-evidence-harness-reconciliation
title: "M23.10 — evidence harness and diagnostic boundary reconciliation (OD-V)"
status: implemented in the harness contracts — six harnesses no longer require byte-identical workers and judge a tested build-separation contract instead; no harness was run; evidence-build runtime UNVERIFIED; OD-U and OD-T still awaiting the owner; ADR-0015 still PROPOSED
date: 2026-11-04
label: FACT (tests, mutations and a read-only check of an existing product build, on W1); INFERENCE and UNKNOWN marked
classification: HARNESS, TEST AND DOCUMENTATION ONLY — no product source, build, browser, model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.10 — evidence harness reconciliation

> **What it is:** the owner's OD-V decision implemented. Six harnesses now expect the product and evidence workers to differ, and check what that difference must be.
> **What it is not:** a run of any of them, a build of the evidence variant, or a decision on OD-U or OD-T.

## Hypothesis

The one invalid comparison, product `background.js` equal to evidence `background.js`, can be replaced with a contract that catches what it caught and more, with every other comparison kept as it was, and with no change to product source or to what the harnesses measure.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `a2faefd` before this milestone, 81 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Tooling:** Node with the workspace's install; Vitest 3.2.4.
- **Builds made:** none. A read-only check used the product build already on disk, from `712465e`. No product source differs from that commit.

## Expected result

- None of the six requires equal workers, and each still compares `content.js`, the manifest's route and `connect-src`.
- A hook in the product, a hook missing from the evidence build, drift between evidence workers, or identical product and evidence workers each makes a harness refuse.
- A build nobody examined can never read as checked.

## Actual result

### 1. The guard, and why only part of it was wrong

Each of the six hashed four things: `background.js`, `content.js`, the manifest with `connect-src` normalised, and `connect-src` itself. It then refused unless all but `connect-src` matched across the builds, on the reasoning that the evidence build's capture route was then the product's. Since OD-S a product build has no capture route, and the worker carries senders in one build only. **So the worker comparison could only fail. The other comparisons were still right, and stay.**

### 2. The replacement contract

`tests/browser/support/build-separation.mjs`, one module for all six, tested in `build-separation.test.mjs`.

| Part | Requires | Refuses with |
|---|---|---|
| **A. Product build** | passes M23.9's `inspectProductBuild`: no hook, driver, ticket or capture call, and the exact product manifest and package | `PRODUCT:…` |
| **B. Evidence build** | names every required hook, sender and handler, in the worker and in the offscreen document | `EVIDENCE_WORKER_LACKS:…`, `EVIDENCE_OFFSCREEN_LACKS:…` |
| **C. Two evidence builds agree** | `TR01_PROBE=1` and `STRUCTURAL_PROBE=1` have the same worker, content script and manifest route | `EVIDENCE_WORKERS_DISAGREE`, … |
| **D. Workers differ** | the product's and the evidence build's are not identical | `WORKER_IDENTICAL_TO_PRODUCT` |
| **Retained across the two builds** | `content.js`; manifest route; permissions; host permissions; `connect-src` exactly ADR-0013's difference | `CONTENT_DIFFERS_FROM_PRODUCT`, … |
| **Never a skip** | a build nobody examined is a problem | `…_NOT_EXAMINED`, status `NOT_EXAMINED` |

**Part C is what still catches an unintended worker change,** now that the product's worker cannot be the reference.

**Each harness now makes one more build,** the reference, when it is actually run. It builds in this order: product, reference, build under test, so the build under test stays in `.output` as before.

**Why `STRUCTURAL_PROBE`:** it is an existing flag. Part of the choice was checked against the real configuration (`buildSeparation.test.ts`): with `TR01_PROBE` or `STRUCTURAL_PROBE`, the substituted values and the manifest are the same, and they differ only in three aliases the worker's module graph does not import. `E6_PROBE` changes the content script and `M3_WORKER_FRAME` changes the worker, so neither would do.

### 3. The six harnesses, before and after

**All six are unrun. Their measurements are not edited.** "Measurement checks" means each harness's own per-window checks, which this milestone does not touch.

| Harness | Original purpose | Retained checks | Replaced check | Unverified behaviour |
|---|---|---|---|---|
| `run-gesture-redaction` (M10.6) | the real perception pass on the real gesture route: TR-01, fail-closed plan, mask, RE-1 on stream frames | `connect-src`; `content.js`; manifest route; no `<all_urls>`; no `captureVisibleTab`; probe present; all measurement checks | worker equality → contract | the whole run; whether the evidence build satisfies B and C |
| `run-webp-loopback` (M10.7) | a masked WebP through the egress choke point to the loopback sink, decoded independently | as above, less `<all_urls>`; **the product carries no frame egress or sink path; the evidence build carries the probe**; all measurement checks | worker equality → contract | as above |
| `run-artifact-verifier` (M10.8) | the frozen verifier on what the sink received, with mutated, stale and unmasked negative controls | same build checks as `run-webp-loopback`; all measurement checks and controls | worker equality → contract | as above |
| `run-capture-determinism` (J7 closure) | capture determinism and inference determinism, measured apart | `connect-src`; `content.js`; manifest route; no `captureVisibleTab`; all measurement checks. **No dry run: everything always enforced** | worker equality → contract | as above |
| `run-stream-j7` (M13) | whether the real stream is deterministic enough for privacy verification | `connect-src`; `content.js`; manifest route; no `captureVisibleTab`; **the product carries no frame sender**; all measurement checks | worker equality → contract | as above |
| `run-stream-re1` (M12) | RE-1 on real stream frames, with RE-1's own verdict | `connect-src`; `content.js`; manifest route; no `captureVisibleTab`; all measurement checks | worker equality → contract | as above |

**Each harness's own security, redaction, artifact, capture and stream checks are retained. What narrows is one claim:** these records could say they measured "the product's capture route". No product has one any more, so their descriptions and record text now say the route is the evidence build's. The OD-V proposal said this would be necessary. **Earlier records are not edited:** their `routeIdenticalToProduct` described the commit they ran on.

**Dry runs behave as they did:** cross-build comparisons are reported, not enforced, because that build carries `M3_WORKER_FRAME`. New: A, B and C are enforced in a dry run too, and a dry run's status is `DRY_RUN_NOT_EVIDENCE`.

### 4. Tests and mutations

| What | Result |
|---|---|
| `tests/browser/support/build-separation.test.mjs` (new) | **73 passed:** the contract on synthetic builds (model names are directories, so opening one throws), and each of the six read as text |
| `apps/extension/test/buildSeparation.test.ts` | 43 passed, **3 new:** the reference flag against the real configuration and the worker's module graph |
| `apps/extension/test/diagnosticHooks.test.ts` | 49 passed. M23.9's pin of the old guard is flipped |
| **Mutation check** (`logs/w1-m23-10-mutation-check.json`) | **58 of 58 caught,** every file then confirmed restored by checksum: 22 on the contract and the inspection, including putting the old equality back, and 6 on each harness, including restoring the old guard |

**The brief's twelve regression requirements** are numbered in the test names, as `(1)` to `(12)`.

**Limit:** the mutations on the harnesses are caught by reading their text. It shows the wiring is there, not that a harness works end to end.

### 5. The real product build, against the contract

Read-only, nothing built (`logs/w1-m23-10-contract-product-half.json`): `boundaryProblems: []`, none of the evidence-only names present. With no evidence build to compare, the verdict is **`NOT_EXAMINED`, with `EVIDENCE_BUILD_NOT_EXAMINED` and `REFERENCE_EVIDENCE_BUILD_NOT_EXAMINED`.** That is the intended behaviour, shown on a real build.

## Known limitations

1. **No harness was run, and no evidence build was made.** Evidence-build runtime stays UNVERIFIED.
2. **Part C is an expectation.** Nothing here compared two real evidence workers. It rests on the configuration and the module graph (INFERENCE). If it is wrong, the first real run refuses, safely, and that would need looking at before any record is written.
3. **Part B's names on a real evidence bundle are partly inferred.** The M23.7 build's inspection found `perceiveOnce`, `consumeProbe`, `mintStreamId`, `PERCEIVE_ONCE` and `STREAM_CONSUME` in a real minified bundle. `ticketProbe`, `CAPTURE_FRAME`, `chromeMediaSourceId` and `grabFrame` were not measured there, though they are a property name, a string and two property names, which a minifier keeps by default (INFERENCE). A wrong name would refuse, safely.
4. **Whether the six pass from start to finish is unknown.** Each needs a person's click, a real browser, T1 and TR-01.
5. **A real run now takes one more build.** Its time is not measured.
6. **Other run-time unknowns from M23.9 stand,** including F-3 and F-4, which remain in evidence builds.

## Conclusion

The six harnesses now state what is true of the two builds, and refuse on anything else. Every other comparison is kept, and 58 of 58 deliberate regressions were caught. This corrects how the builds are compared, and establishes nothing about whether an evidence build runs. OD-U and OD-T remain the owner's.

## Reproducibility

```bash
npx vitest run tests/browser/support/build-separation.test.mjs apps/extension/test/diagnosticHooks.test.ts apps/extension/test/buildSeparation.test.ts
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

See `decision.md` for the results. The harnesses themselves need a separate authorisation.
