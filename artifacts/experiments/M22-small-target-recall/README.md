---
id: M22-small-target-recall
title: "M22 — small-target recall of the T1 head"
status: IN PROGRESS — design and fixture audit only; NO DETECTOR HAS BEEN RUN
date: 2026-11-01
label: FACT (fixture audit) / no detector result exists
classification: ENGINEERING INVESTIGATION of the UNADOPTED T1 head — not J7, not adoption
workstation: 1 (LAPTOP-6E14K34L)
---

# M22 — small-target recall of the T1 head

> **Status: not complete.** The design is frozen and amended twice, the fixtures have been audited,
> and the evaluation helpers are tested. **The detector has not been run on any M22 cell. There is
> no recall, precision or attribution result.** The evaluation runner is not written: an attempt to
> create it was stopped by a safety classifier, and it awaits an authorised route.

## Hypothesis

Pre-registered in [`design.md`](design.md) §8 (H1–H5), before any run: recall lowest in the
very-small bucket, falling again in the large bucket, false negatives attributed mostly to
inference and score filtering, and stated expectations for tiling and the score floor.

## Environment

W1 (`LAPTOP-6E14K34L`, Intel Core 7 240H, Windows). For the fixture audit: Chromium 153.0.8010.12
(Chrome for Testing, headless), Node v24. The detector environment is fixed in `design.md` §2 and
has not yet been exercised.

## Expected result

As `design.md` §8 states. Nothing has been measured against it.

## Actual result

**Detector: none.** Fixture validity only (FACT, no detector), from
[`logs/w1-fixture-audit-20261101T163950Z.json`](logs/w1-fixture-audit-20261101T163950Z.json):

- 4,691 measured elements across 220 DEV screens in 11 cells.
- **3,196 HIT_TESTABLE** form the primary population. The rest are excluded and reported:
  PARTIALLY_OCCLUDED 49, FULLY_OCCLUDED 229 (including all 220 icons), SAMPLING_SENSITIVE 2,
  PARTIALLY_CLIPPED 216, OFFSCREEN 999.
- The generator's corner icon is never visible, and every `icon` training and dev label in
  `t1-ui-v1` is that element ([`design-amendment-1.md`](design-amendment-1.md)).

Rules: [`design-amendment-2.md`](design-amendment-2.md).

## Conclusion

None yet. The fixture findings stand on their own; nothing about the detector's recall is
established by this record.

## Reproducibility

```bash
npm run typecheck
```
```bash
CHROME_PATH="<Chrome for Testing chrome.exe>" node tests/browser/perception/audit-m22-fixtures.mjs
```

`M22_AUDIT_DRY_RUN=1` writes nothing; otherwise each run writes a new record named by its start
time. DEV specs only; the TEST split is never generated.
