# DOM-only Phase 1 — implications and implementation outline — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.6, 2026-11-03).**
> - **The owner selected:** **OD-R: APPROVED — OPTION A: DOM-ONLY PHASE 1**, together with OD-P. Both are **SELECTED BY OWNER — IMPLEMENTATION NOT AUTHORISED.**
> - **Since then:** M23.7 implemented OD-P and OD-R in product builds, and M23.8 tested the boundary under a simulated extension. Not browser-verified, not accepted. This document's statements about what the runtime does describe the source when it was written, and still describe evidence builds.
> - **What this is:** an **outline** for future, separately authorised milestones. It is not a patch, branch or script. **Nothing here is implemented;** the runtime still captures frames on gesture-granted passes and runs T1 and TR-01 on them.

## 1. Implications (recorded)

1. **T1 disablement** needs a separate implementation milestone (OD-P; `t1-disablement-implementation-readiness-PROPOSED.md`).
2. **Removing frame capture from normal task execution** needs a separate implementation milestone (OD-R).
3. **TR-01 stays** available as a separately retained, integrity-verified component, unless the owner separately decides otherwise (OD-F).
4. **The fallback stays:** the existing structural fallback (the structural-floor handoff; `NO_DETECTOR`; `MODEL_ASSET_UNAVAILABLE`) must be preserved.
5. **DOM grounding and click safety** must stay unchanged.
6. **Historical M20 evidence is not recalculated.** It already ran with no frame (`detectorRan = 0`).
7. **No performance improvement is claimed.** Any change must be measured and labelled.
8. **Still outstanding:** real-site, cross-machine and independent-human validation (OD-D, OD-B, OD-C).
9. **The brief's visual requirements:** Deliverables 1 and 2 (a local vision model; visual masking) are **not fulfilled** by Phase 1. They are deferred to separate decisions (P2-08, OD-K2, A-5), and the brief itself is unchanged.
10. **Evidence builds** are distinct from normal task execution. This decision neither removes them nor authorises any future diagnostic workflow.

## 2. Dependency-ordered outline (future, separately authorised)

| Step | Work | Depends on | Notes |
|---|---|---|---|
| 0 | Owner authorisation for the implementation milestone(s) | — | **Not given.** Required before any step below |
| 1 | **Regression tests first:**<br>• `visual()` → floor wiring;<br>• `sourceById` absent → every element `"dom"`;<br>• a task run with **no `perceive` dependency**;<br>• vision-only exclusion from the handoff;<br>• a static scan showing no capture request in normal task runs | 0 | the four gaps in `fallback-test-evidence-matrix.md`, plus a capture assertion |
| 2 | **No capture in normal task execution:** stop wiring `perceive` into `runExtensionTask` for normal tasks. This uses the existing optional path (`extension-ports.ts` `if (options.perceive)`; `extension-run.ts` `deps.perceive ? … : {}`), or an equivalent | 1 | no new route. ADR-0009 is unchanged for separately authorised capture |
| 3 | **T1 out of the product path:**<br>• no T1 fetch or session in normal operation;<br>• no T1 packaging in product builds;<br>• keep TR-01's build and runtime checks intact | 1 | per the OD-P readiness plan, S-1 to S-4. **Evidence builds:** per OD-O if T1 is ever loaded |
| 4 | **TR-01 not invoked** in normal tasks. This follows from step 2, because no perception pass runs. The TR-01 code, worker, pin and assets are retained | 2 | no TR-01 change |
| 5 | **Run report and labels:** report the DOM-only floor honestly (no perception entries; or an explicit "not run"). No invented T1 or TR-01 claim | 2, 3 | schema values only. Manifest enums unchanged |
| 6 | **Security re-runs:**<br>• the network gate (exact-count allowlist);<br>• CSP v2;<br>• the `sendVerified` refusals;<br>• the front and keyed-server checks;<br>• the fail-closed suite;<br>• a static check that no message carries image fields;<br>• no new permission | 2–5 | also a decision on whether the `tabCapture` permission stays. **Permissions are not changed here:** it is an owner decision, because capture remains in evidence builds |
| 7 | **Functional re-runs:**<br>• the orchestrator, agent and plan suites;<br>• consent, the declared task and clarification;<br>• the five-turn cap;<br>• freshness and postconditions;<br>• a person-run side-panel smoke | 2–5 | — |
| 8 | **Measurement:** a new labelled benchmark (machine, build, commit). No comparison claim beyond what is measured | 7 | the M20 records stay as they are |
| 9 | **Records:** update ADR-0015 (still subject to OD-N), the data-flow document and the acceptance criteria (still PROPOSED) | 8 | — |
| 10 | **Rollback plan:** revert restores today's behaviour. Re-enabling T1 counts as reactivation, under OD-O | — | — |

**No step introduces a new detector, model, frame-transfer route, endpoint or permission.**
