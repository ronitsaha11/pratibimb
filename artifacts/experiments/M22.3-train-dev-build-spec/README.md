---
id: M22.3-train-dev-build-spec
title: "M22.3 — TRAIN/DEV dataset build specification, and the pre-build generator improvements"
status: recorded — generator improved and unit-tested; configuration PROPOSED, NOT APPROVED; NO DATASET GENERATED
date: 2026-11-02
label: FACT (code, tests, plan-only runs) / no dataset result exists
classification: ENGINEERING — no rendering, no detector, no training, no TEST data
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.3 — TRAIN/DEV build specification

> **No dataset was generated, nothing was rendered, and no model was trained.** No file was written
> outside the source tree, and nothing under `artifacts/datasets` was accessed. TEST was not planned,
> seeded or built, and no TEST seed was computed. Every count below is a **planned** count from an
> in-memory plan, not an observed one.

## Hypothesis

With full provenance, varied appearance, wider seeds and strict serialisation, the v2 generator can
plan the review's candidate TRAIN/DEV configuration with exact quota reconciliation, no deferred
target left, no TRAIN/DEV leakage, deterministic hashes and spread placement. Only a render and a
gate run can show that the rendered dataset passes; M22.3 does neither.

## Environment

W1, Node v24.22.1, Vitest. No browser was used.

## Expected result

**Unit tests, on in-memory fixtures:**
- full provenance on every sample, element and occluder, with no private value;
- every appearance option drawn, deterministic from the seed, with no external asset;
- hit-safe labelled boxes;
- 256-bit seeds over unambiguous identities, fixed-width ids, strict canonical JSON, stable hashes.

**A plan-only run of the candidate configuration showing:**
- exact quota reconciliation;
- no unresolved deferred target;
- no TRAIN/DEV leakage;
- deterministic hashes;
- spread placement.

## Actual result

Generator `2.1.0-draft`; code in `tools/dataset/v2/`.

### Provenance

A spec, and the annotation built from it, now records:

| Item | Where |
|---|---|
| Seed, and how it was derived (scheme, identity, PRNG) | `seed`, `seedDerivation` |
| Sample spec hash | `specHash` (annotation), over canonical JSON |
| Viewport, scale, masthead, usable area | spec; `provenance` in the annotation |
| Page appearance: palette, font stack, control style, density | `appearance` |
| Per element: declared box | `box`; the annotation's `source.declared` |
| Per element: declared positioning (`absolute`) | `declaredPosition`, beside the rendered `computedPosition` |
| Per element: region | `region`, `preferredRegion` |
| Per element: size draw | `size`: shorter side in CSS and model px, drawn and realised aspect, `clampedToArea` |
| Per element: own appearance | `appearance`: an icon's glyph and plate, the hit-safe corner radius, checked, underline or selected states, a neutral label word |
| Per element: intent, and its occluder | `intent`, `occluderId` |
| Per occluder | `id`, `role: "occluder"`, `kind`, `for`, declared `box`, `coversTargetShare`; the rendered box when a renderer measures it (`__measureV2Occluders`), `null` otherwise, never invented |
| Unlabelled decor | `id`, `kind`, `box` |

A test walks a whole manifest and finds every string value to be an id, a hash, or a value from
the generator's own fixed lists. No path, URL, page text or personal value appears.

### Appearance

All appearance is deterministic from the seed, through its own named stream, and uses no external asset (no image, URL, `@import` or `@font-face`).

**Per page:**
- one of **6 palettes**: three light, two dark and one high-contrast;
- one of **7 local font stacks**, each ending in a generic family; which face the browser picks is UNKNOWN until a render;
- one of **6 control styles**.

**Per element:**
- icons draw one of **10 glyphs**, painted with CSS gradients, on one of 3 plates;
- links may be underlined; tabs may be selected; checkboxes and radios may be checked.

**Layout:**
- **3 density levels**, which change how many targets a page is dealt and how many unlabelled decor blocks it gets;
- aspect ranges are **wider** and drawn **log-uniformly**.

Tests show every option is drawn, none below half its uniform share. Both ends of every aspect range are drawn, and denser levels get more targets and decor. The same seed gives byte-identical HTML.

**A defect found and removed.** M22.2 icons were drawn as `circle` (radius 50%) and `rounded` (22%) on
the labelled element itself.
- **Grid geometry (FACT, tested):** the M22 validity grids sample 1/(2n) of the way in from each edge. A 50% radius puts the 5 × 5 corner points outside the shape, and a radius above about 19% of the shorter side does the same to the 9 × 9 corner points.
- **Browser behaviour (INFERENCE, UNKNOWN on this stack until rendered):** browsers hit-test rounded corners. If so, those icons would have rendered PARTIALLY_OCCLUDED or SAMPLING_SENSITIVE instead of HIT_TESTABLE.
- **Fix:** labelled boxes keep a corner radius of at most `HIT_SAFE_RADIUS` = 0.15 of the shorter side, and round shapes are drawn inside a rectangular box.

### Seeds and serialisation

| Item | Before (M22.2) | Now |
|---|---|---|
| Seed | 32-bit FNV-1a of `"name\|version\|split\|index"` | SHA-256 of the canonical JSON identity `[name, version, "sample", split, index]`, 64 hex |
| PRNG | mulberry32, 32-bit state, one stream | xoshiro128\*\*, 128-bit state per named stream (`layout`, `elements`, `decor`, `appearance`) |
| Identity encoding | `"\|"`-joined, ambiguous in principle | a JSON array, unambiguous (tested: `["a\|b","c"]` ≠ `["a","b\|c"]`) |
| Ids | `padStart(5)`, which would sort `train-100000` before `train-99999` | fixed width enforced; index ≥ 100,000 refused; manifests sort by id |
| Canonical JSON | `undefined` emitted invalid JSON; `NaN` became `null` | refuses `undefined`, non-finite numbers, functions, symbols, bigints, array holes and non-plain objects, naming the path |
| Spec seed | unchecked | a spec whose seed is not the seed of its (split, index) is refused |
| Dealing | round-robin, every page alike | density-weighted, at least 1 target per page, at most `maxTargetsPerSample`; an empty page is refused |

**Honest note on collisions.** For random 32-bit values one collision is a coin toss by about
77,000 seeds. On M22.2's actual identity strings, measured: **0 collisions** for 600 TRAIN + 160
DEV, for 100,000 TRAIN + 40,000 DEV, and for 1,000,000 TRAIN (a random 32-bit function would expect
0.0, 2.3 and 116.4). The change removes a bound and an ambiguity; it does not fix an observed
collision. The new scheme gives 140,000 distinct TRAIN and DEV seeds (tested).

**Stability.** Golden values pin `seedFor("train", 0)`, `seedFor("dev", 0)` and one small DEV plan hash.
A separate Node process reproduces the plan hash, and two command-line runs of the illustrative plan
are byte-identical.

### Gate

`minPerClassBucket` may now be one integer per expected split (`{ train: 150, dev: 40 }`), so each
split can be held to its own quota. It must name exactly the expected splits, each at least 1. The
single-integer form is unchanged.

**Known gate property, not changed:** G7 compares layouts exactly, so two **empty** pages in two splits
read as one shared layout. The generator now never plans an empty page.

### Plan-only results

The schedule used was the review's candidate values (`owner-config-proposal.md`). It was written only to
the session scratchpad, outside the repository, and labelled `ILLUSTRATIVE, UNAPPROVED`. It was run
twice through the existing plan-only command:

```bash
node tools/dataset/v2/build-v2.mjs --schedule=<illustrative-schedule-UNAPPROVED.json> --counts=train:600,dev:160 --leakage=0.5:0.5
```

| | TRAIN | DEV |
|---|---|---|
| Samples (requested + overflow) | 600 + 0 | 160 + 0 |
| Positives, requested → planned | 4,800 → 4,800 | 1,280 → 1,280 |
| Partial occlusion, requested → planned | 480 → 480 | 128 → 128 |
| Full occlusion, requested → planned | 480 → 480 | 128 → 128 |
| Reconciled per class × bucket × role | yes, exactly | yes, exactly |
| Deferred at first layout / unresolved | 0 / 0 | 0 / 0 |
| Targets per page, min / mean / max | 6 / 9.6 / 12 | 6 / 9.6 / 12 |
| Plan SHA-256 | `a899724a…7b91a915` | `f3c827d8…929973bd` |
| 3 × 3 region share, pooled | 0.106–0.118 | 0.103–0.120 |
| 3 × 3 region share, range over viewport shapes | 0.097–0.130 | 0.078–0.142 |
| Top third / bottom third | 0.338 / 0.335 | 0.335 / 0.337 |
| Palettes, fonts, control styles, densities, glyphs | all drawn | all drawn |

- **Leakage:** 0 cross-split leaks over 288,420 compared pairs at `elementIou` 0.5 and `layoutShare` 0.5. There were no same-split duplicates and no empty layouts.
- **Leakage margin, measured in memory:** the most similar TRAIN/DEV pair scored 0.182 at element IoU 0.3, 0.5 or 0.7, and no pair reached 0.25.
- **Reproducibility:** both runs' outputs are byte-identical; schedule SHA-256 `62c78b65…2b41c8c`.

**Declared-geometry preview: in memory, not a gate result.** The gate was run on annotations built as if every element rendered exactly at its declared box with the validity its intent declares. The proposed thresholds were used: G4 `{train: 150, dev: 40}`, G5 0.9, G6 0.02, G8 0.5, G1–G9 required, splits TRAIN and DEV.
- **What passed:** all nine checks. No (class, box) recurs in more than one TRAIN sample, against G6's threshold of 12.
- **What it shows:** the proposed thresholds are *satisfiable* by the planned geometry.
- **What it does not show:** anything about a browser. G3, G4 and G9 depend on real validities only a render produces.

## Verification

- **Generator and gate suites:**
  - command: `npx vitest run tools/dataset tests/browser/support/dataset-quality-gate.test.mjs`;
  - result: 99 passed (64 v2, 35 gate).
- **Full suite:**
  - command: `npm run verify`;
  - result: **PASS**, 3,080 passed and 22 skipped;
  - repository check: 0 failures, 0 warnings.
- **Unchanged against `077f139`:**
  - the v1 builder and `tools/detector`;
  - the pinned model, the detector, letterbox and preprocessing code;
  - apps, docs, gates, the registry, CI, scripts and the security packages.
- **Unchanged evidence:** M19, M20, M21, the M20 benchmark and the committed M22.1 and M22.2 records. No existing artifact was modified.
- **No browser, network or file write** in any generator module.

## TEST: the limitation is unchanged

TEST authorisation was not modified, and the public seal token was not used. These limits remain:
- **Public token:** `planSplitIds("test")` needs a seal token, but the token is a public constant.
- **Unchecked helpers:** lower-level helpers (`seedFor`, `sampleIdentity`, `sampleId`, `dealTargets`, `layoutSample`) do not check it.
- **Predictable seeds:** the TEST seed formula is public, now SHA-256 of a public identity, so TEST pages remain predictable from the source. M22.3 changed how such a seed would be computed, and computed none.
- **One-time build:** "built once" is not enforced.

`plan.mjs` and `build-v2.mjs` refuse TEST outright, and the refusal tests still throw before anything is computed. **A separate task must harden TEST authorisation before any TEST build.**

## Conclusion

The generator now records where every label came from, varies how pages look, and derives
seeds and hashes robustly. The candidate configuration plans exactly, with headroom and without
leakage. Whether a rendered dataset passes the gate is **not known**. That needs the owner's
approvals (`owner-config-proposal.md`), the render step, a build and a gate run.

## Reproducibility

```bash
npx vitest run tools/dataset tests/browser/support/dataset-quality-gate.test.mjs
```
```bash
node tools/dataset/v2/build-v2.mjs --schedule=<schedule.json> --counts=train:600,dev:160 --leakage=<elementIou>:<layoutShare>
```
