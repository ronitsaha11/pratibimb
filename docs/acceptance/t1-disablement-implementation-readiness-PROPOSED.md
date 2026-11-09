# T1 disablement — implementation-readiness plan — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.4, 2026-11-03).**
> - **What this is:** a **design proposal** for a future milestone that the owner would have to authorise separately, implementing OD-P.
> - **What this is not:** a patch, branch or script. **No code change is authorised.** T1 is **not** disabled.
> - **References:** `t1-dependency-and-disablement-impact.md`.

## 1. Source changes (proposed)

| # | Change | Note |
|---|---|---|
| S-1 | In `apps/extension/host/offscreen/main.ts` `ensurePerception()`: stop fetching `t1-ui-head.onnx`, and stop creating its session, in the product build. Pass `session: null`, so the realm takes the **existing** `MODEL_ASSET_UNAVAILABLE` path | reuse the tested fallback; add **no** new inference route |
| S-2 | Keep `bootstrapOrtRealm("offscreen")` **only if** something else in the offscreen realm needs ORT. **UNKNOWN today:** TR-01 runs in its own worker with its own bootstrap | to be decided at implementation, from source |
| S-3 | `ortSmoke` (`ORT_SMOKE`): move behind an evidence alias, or remove its T1 load | it is diagnostic |
| S-4 | `MODEL_ID` / `MODEL_REVISION`: drop from the product path. Labels only | — |
| S-5 | Do **not** change `fuse`, `visual()`, `buildHandoffDraft`, manifest enums, the planner, the agent or the egress code | the fallback already yields the structural floor |

## 2. Build packaging

- **Remove the T1 copy:** stop copying the T1 file in `build:publicAssets` for product builds, and remove the requirement that it exist.
- **Keep TR-01's check:** the TR-01 hash check must stay **unchanged and unweakened**.
- **Evidence builds:** if any evidence build still needs T1, it must use I-1 to I-3 of the OD-O policy first.

## 3. Schema and run-report handling

- **No schema change** (the manifest `source`, `capability` and `scale_to_css` values come from the existing fallback).
- **Report values change:** `detector.ran = false`, `refusal = MODEL_ASSET_UNAVAILABLE`, fusion `NO_DETECTOR`, `uihead` timings absent or 0.
- **Restate the scope:** the run-report readers and harnesses (`run-product-benchmark.mjs` `detectorRan`) would need their scope restated.
- **Open point:** whether the `MODEL_ASSET_UNAVAILABLE` text, which says "the admissible configuration is option C, the DOM-only floor", should be reworded.

## 4. Fallback behaviour

**Required:**
- the pass continues after the detector refusal;
- a refusal is never an empty detection list;
- the handoff declares the structural floor;
- tasks run unchanged on DOM grounding.

**The `capability` coupling:** with T1 gone, TR-01-only passes are undeclared. That needs an owner decision, OD-R or OD-F. No code is to invent a T1 claim.

## 5. Regression tests (proposed)

- **Static scans** (like `visualBoundary.test.ts`):
  - no `t1-ui-head` fetch in the product offscreen path;
  - no T1 asset in the product build;
  - the TR-01 hash check still present.
- **The product path:**
  - a unit test that the perception pass with `session: null` refuses `MODEL_ASSET_UNAVAILABLE` and continues to TR-01;
  - and that fusion yields `NO_DETECTOR`.
- **The handoff:** it declares `backend: "none"`, `tiers_fired: ["T0","T2"]`, and `source: "dom"` for every element.
- **Unchanged:** the existing orchestrator, agent, plan and reasoner suites pass unchanged.

## 6. Privacy and security regression tests (proposed)

- **Re-run the controls** on the product build:
  - the M12 network gate (exact-count allowlist; one fewer packaged-asset `fetch`);
  - the CSP v2 checks (M13);
  - the `sendVerified` refusals;
  - the M20 front and keyed-server checks.
- **No new egress:** confirm no new network primitive, message route or permission.
- **TR-01 unchanged:** its build and runtime hash checks, the worker boundary, and the sanitised frame still having no product reader.
- **Execution safeguards:** the fail-closed suite, the five-turn cap, click-only execution, consent, grounding and postconditions — all unchanged.

## 7. Performance remeasurement

- **Re-run the product benchmark** after implementation.
- **Report it as a new measurement,** labelled with machine, build and commit.
- **No comparison claim against M20 without reasoning:** M20 ran no T1 inference (`detectorRan = 0`), so a difference cannot be attributed to T1 inference.
- **What it adds:** a gesture-granted run would be needed to measure frame passes, which M20 did not have.

## 8. Acceptance evidence for the implementation

- **The diff:** limited to S-1 to S-4 and §2.
- **The tests:** §5 and §6 green on the local suite.
- **Hosted CI:** green. Note that CI does not build the extension today, so packaging must be checked by a recorded local build.
- **Records:** a person-run smoke record on the product build; and a new benchmark (§7).
- **A record of what changed:** the run report fields.
- **The owner's sign-off.**

## 9. Rollback

- **Reverting the commit** restores the T1 load and packaging.
- **With a condition:** any re-enable is a **reactivation**, and under the proposed OD-O policy it would require I-1 to I-7 first. A rollback would therefore restore an unverified artifact, unless OD-O is implemented first.
