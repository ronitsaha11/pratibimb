---
id: M23.16-residual-surface-review
title: "M23.16 — residual product surface and acceptance gap review"
status: completed as a read-only review — owner decision report written; no recommendation adopted; not product acceptance or browser validation
date: 2026-11-06
label: FACT (source, the existing build's text and documents, as read); INFERENCE and UNKNOWN marked in the report
classification: READ-ONLY REVIEW — no product code, UI string, criterion, classification, permission, CSP, egress, hook or packaging change; no build, browser, model session, frame, inference, training, detector evaluation or dataset
workstation: 1
---

# M23.16 — residual surface review

> **What it is:** an evidence-backed report on the decisions left open after M23.15.
> **What it is not:** product acceptance or browser validation. It decides nothing.

**The report:** `docs/acceptance/residual-product-surface-decision-report-PROPOSED.md`.

## Hypothesis

The open product-surface and acceptance items can be settled to the point of a recommendation by reading alone, with anything reading cannot establish marked UNKNOWN.

## Environment

- **Machine:** W1.
- **Git:** branch `spike/m22-small-target-recall`, at `0fd9f49`, 95 commits on `origin/main` `077f139`, no upstream, no PR. The two M20 records are untracked and untouched.
- **Read, not run:** the existing product build's text, from `13d0447`. No build was made.
- **External reads:** four pages of Chrome's public extension documentation. Nothing was sent other than the page requests.

## Expected result

A recommendation, with alternatives, consequences and a confidence level, for each open item, and a proposed smoke procedure. No product change.

## Actual result

**Ten decisions are framed, RD-1 to RD-10.** New findings, each established from source:

| Finding | Label |
|---|---|
| `NEEDS_USER: none` is a fixed string that nothing updates, so it stays "none" during consent | FACT |
| `HOST_STATUS` is the only normal creator of the offscreen document. Hiding the Status box is presentation; removing the request would likely break tasks | FACT; the consequence is INFERENCE |
| No "three consecutive verification failures" counter exists. The first failure blocks | FACT |
| The panel's task budget is 3 turns. 5 is the enforced ceiling, which a person cannot reach through the panel | FACT |
| The product worker keeps an unreachable `getMediaStreamId` wrapper, so "no capture call" overstates it, including in M23.15's own wording | FACT |
| BRW-05 cites a gate-mapping §6 that does not exist | FACT |

**Recommendations:** `justification`, C (a truthful technical description). Status box, S-C. BRW-05 and REL-03, re-scope for Phase 1, preserving the originals. `tabCapture` and `activeTab`, REMOVE from product builds only, in a separately authorised change. **None is adopted.**

## Known limitations

- **Whether Chrome displays `justification` is UNKNOWN.** Documentation says it "may".
- Chrome's documented permission warnings were not observed.
- Effects of removing a permission are inferred from source. A browser run would be needed to establish them.
- The report's harness analysis comes from reading, not running.

## Conclusion

**Supported.** Each item now has a recommendation, and what reading could not establish is marked. **This is neither product acceptance nor browser validation.**

## Reproducibility

Read the sources the report lists, at `0fd9f49`. Nothing needs to be run to repeat the review beyond:

```bash
npx vitest run apps/extension/test/acceptanceDocuments.test.ts apps/extension/test/productIdentity.test.ts
```
