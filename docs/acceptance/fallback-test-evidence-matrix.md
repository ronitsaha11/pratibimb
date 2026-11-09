# Fallback test-evidence matrix (M23.5)

> **Status:** an inventory of **existing** tests and records, by file and test name (read as text, M23.5, 2026-11-03).
> - **Nothing run or changed:** no test was run or modified for this inventory.
> - **"Existing" means present, not passing now.** Whether these tests pass at `a165c7a` was not established in this milestone.
> - **Since then (M23.8):** the gaps in the last column now have tests: `apps/extension/test/domOnlyTaskPath.test.ts` covers the `visual()` floor wiring, a run with no `perceive` dependency, and vision-only exclusion; `sourceById` is covered there and in `domOnlyPhase1.test.ts`. See `dom-only-regression-matrix.md`.

| Behaviour | Existing evidence (FACT: present) | Type | Gap: a future regression test is needed |
|---|---|---|---|
| `MODEL_ASSET_UNAVAILABLE` (detector with no runtime refuses) | `packages/perception/test/uiDetectorHead.test.ts`; `g5Structural.test.ts`; `tests/browser/t1/run-t1.mjs`; `tests/browser/qg05/run-qg05.mjs` | A (unit); B (browser, synthetic detections) | a **product perception pass** with `session: null` that continues to TR-01, or skips capture under Option A |
| `NO_DETECTOR` (fusion when the detector never ran) | `apps/extension/test/visualBoundary.test.ts` ("says NO_DETECTOR rather than NOT_DETECTED when the detector never ran"); `packages/perception/test/fusion.test.ts`; `fusionFreshness.test.ts` | A | — |
| A refused pass is typed, with no quiet zero (`detector.ran = false`, `capture`/`fusion` null, no pixels) | `visualBoundary.test.ts` ("a refused pass is a typed refusal with counts, never a quiet zero"); `perceptionPass.test.ts` | A | — |
| `NO_ACTIVE_TAB_GRANT` (no gesture, so no frame) | `apps/extension/test/captureAuthority.test.ts`; `perceptionPass.test.ts`; `taskTimings.test.ts`; browser harnesses (`run-extension-loop.mjs`, `run-consent-task.mjs`, `run-declared-task.mjs`, `run-capture-determinism.mjs`, `run-artifact-verifier.mjs`) | A; B | — |
| Structural-floor declaration (`backend: "none"`, `tiers_fired: ["T0","T2"]`) | `packages/privacy/test/handoff.test.ts` (a fixture with this capability); `buildHandoffDraft` defaults (source) | A (fixture) | **a test that `visual()` returns `null` when `detector.ran` is false, and that the built draft then carries the floor.** `extension-run.ts` is "exercised only in a browser" (`taskLoopWiring.test.ts` header) |
| `sourceById` relabelling (`dom` → `dom+vision`) and its absence | **none found** (`git grep sourceById` over the tests: no match) | — | **needed:** with T1 off, every element is `source: "dom"`; with T1 on, only existing ids are relabelled |
| Handoff elements are DOM-derived only | `packages/privacy/test/handoff.test.ts`; `noLeak.test.ts`; M2 (42 of 42) | A; B | a test that a vision-only fused element never appears in the handoff (currently established by source reading, M23.3) |
| Handoff schema (`manifestV12` enums for `source` and `capability`) | `packages/egress/test/handoffContract.test.ts`; `qg04.test.ts`; `qg04Fallback.test.ts` | A | — |
| Click eligibility (DOM `actionable`; `clickable` by role, visible, enabled) | `packages/plan` and `packages/agent` suites; `oneClickAuthority.test.ts`; MVP-1 | A; B | — (no T1 input) |
| Freshness (REFRESH) and hit test | `packages/agent` suites; `fusionFreshness.test.ts`; M2-EXEC (50 of 50); MVP-2 | A; B | — |
| Postcondition verification | `packages/agent` (`verifyResult`); `declaredTask.test.ts`; M18; E8 (W2) | A; B | — |
| **Whole tasks on the structural path (no frame)** | **M20 benchmark:** 33 visual passes, all `NO_ACTIVE_TAB_GRANT`; `detectorRan = 0`; 6 bounded tasks, 15 steps; W1, CfT 153, synthetic pages | B / measured (W1) | D, E, F (cross-machine, independent, real-site), per OD-B, OD-C and OD-D |
| Run with **no `perceive` dependency at all** (Option A's likely wiring: `extension-ports.ts` `if (options.perceive)`; `extension-run.ts` `deps.perceive ? … : {}`) | **none found:** the only `runExtensionTask` caller passes `perceive` | — | **needed** if Option A is implemented this way |
| Static boundaries (no message field carries an image; one decoder; no persistence) | `visualBoundary.test.ts` | A (static) | extend to cover any new wiring |
| Network gate, CSP, egress refusals | `networkBoundary.test.ts`; `extensionCsp.test.ts`; `productionFrameEgress.test.ts`; `webpEgressBoundary.test.ts`; `packages/egress` suites | A; G | re-run after any implementation |

**Summary:**
- **What already exists:** the fallback *behaviours* are individually tested at unit level, and the M20 benchmark shows whole bounded tasks completing with no frame (W1, synthetic).
- **What does not exist yet:**
  - a test of the `visual()` → floor wiring;
  - a test of `sourceById` (both present and absent);
  - a test of a run with no `perceive` dependency;
  - a vision-only-element exclusion test.

  These are future regression tests. None is written here.
