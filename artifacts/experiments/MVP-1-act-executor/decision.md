# MVP-1 — verdict

**Date:** 2026-09-12 · **Workstation:** W2 · **Decided by:** implementation engineer ·
**Owner decisions required:** yes, two (below)

## Verdict

**The VALIDATE → ACT boundary is PROVEN on a controlled local page. The MVP task is NOT
complete, and this experiment does not claim it is.**

| claim | status | evidence |
|---|---|---|
| a validated action reaches a real browser and changes page state | **PROVEN** | demo A: `EXECUTED`, one click at (550, 276), page recorded `{phone: 1}`, focus moved to `#phone` |
| a refused action produces no browser operation | **PROVEN** | demos B–I: 10 refusals, 0 bridge calls, 0 click events recorded by the page |
| the confirmation tier refuses a fresh submit button | **PROVEN** | demo F: `ALLOW` from VALIDATE, then `REJECTED HUMAN_CONFIRMATION_REQUIRED` |
| no fallback target is ever selected | **PROVEN** | demos C–E2 and the unit sweep: no neighbour was clicked in any refusal |
| the controlled form task completes | **FALSE** | `type` refused (`CLEARANCE_PIPELINE_ABSENT`); `submit` refused (confirmation tier) |
| a vision-only target can be acted on | **FALSE** | demo J: the canvas page has 0 actionable nodes, and a detector candidate is not an `ElementNode` |
| the clicked element is the topmost element at that point | **NOT ESTABLISHED** | no hit-test exists; an overlay added after observation would receive the click |

## Decisions taken here

1. **ACT executes `click` only.** Every other allowlisted action is refused with a specific,
   recorded cause. ADR-0006 §3.
2. **`type` is refused rather than approximated.** Both modes depend on unbuilt stages, and the
   MVP's own field is `autocomplete="tel"` — which the action schema's target check forbids a
   literal for even once D1–D3 exist.
3. **No confirmation grant path is exposed.** A confirmation-tier action is always refused while
   no confirmation UI exists. The harness asserts that the package exports no such path.
4. **The Playwright adapter stays in this harness**, not in the product. The product's transport
   (an extension content script) does not exist — there is no `manifest.json`.

## Decisions required from the owner (`ronitsaha11`)

| # | decision | why it cannot be taken here |
|---|---|---|
| D-ACT-1 | Approve, narrow or widen the **confirmation-tier screen** — the name-pattern list and the blanket `role === "link"` rule (ADR-0006 §6) | it is a safety policy with false positives in both directions, and policy is the owner's to set |
| D-ACT-2 | Rule on whether `DomMeasurement` should carry a **`submitControl`** flag, so the tier stops depending on an accessible name | it is a change to a perception contract, outside this ADR's scope |

Still outstanding from ADR-0005 and unaffected by this run: the two freshness tolerances
(`maxCentreShiftCssPx` 2.0, `minBoxIou` 0.8).

## What this run did not touch

Detector **UNADOPTED** and not loaded · V1 **experimental only** · threshold **0.55** ·
`PROVISIONAL_THRESHOLDS` **0.25 / 0.5** · NMS, decode, weights **unchanged** · **no retraining** ·
no capture-size policy · W-A gate **CLOSED**, D5 and D2 **unchanged** · no real data, no real PII,
no external site, no credential, no security control bypassed · no privacy or egress behaviour
changed (there is none yet to change).
