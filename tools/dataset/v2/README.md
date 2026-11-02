# `tools/dataset/v2` — the version 2 synthetic T1 dataset generator

> **Status (2026-11-02): version `2.1.0-draft`.** Implemented, hardened after an architecture
> review, given full provenance, appearance variety and SHA-256 seeds (M22.3), and given a TRAIN/DEV
> renderer and candidate build (M22.4, owner-authorised). **No model has been trained on v2, and no
> detector has been run on it.** The v1 builder (`tools/dataset/build-dataset.mjs`), `t1-ui-v1` and
> the shipped T1 artifact are unchanged. The build writes one new numbered candidate directory under
> `artifacts/datasets` and names, lists and reads nothing else there. TEST is not planned anywhere in
> this code path, and its seal is known to be weak (§TEST below).

## Architecture

All modules are pure: no browser, no network and no file writes. `splits.mjs` reads one file, only
for audits.

| Module | Does |
|---|---|
| `config.mjs` | Version, classes, size buckets (the M22 buckets plus generation bounds), per-class aspect ranges, viewports, layout constants, appearance sets |
| `prng.mjs` | Seeds (SHA-256 of a canonical identity), the PRNG (xoshiro128\*\*, named streams), strict canonical JSON, SHA-256 |
| `appearance.mjs` | A page's palette, font, control style and density; an element's own details; the hit-safe radius |
| `splits.mjs` | Per-split manifest and frame names, fixed-width ids, seeds, the TEST seal, the audit reader, the leakage check |
| `schedule.mjs` | Validates the owner's positive and occlusion-case quotas; deals targets to samples by density |
| `layout.mjs` | One sample: viewport, masthead, usable area, stratified placement, occluders, decor, provenance |
| `plan.mjs` | One split, TRAIN or DEV only: deal, lay out, reschedule deferred targets, reconcile or refuse |
| `html.mjs` | A laid-out sample → a standalone HTML document, with `__measureV2()` |
| `annotate.mjs` | Render results → annotations with provenance and the `positive` flag; split manifests |
| `build-v2.mjs` | Command line: **plan only** |
| `render.mjs` | One spec → frame, measured geometry, hit-test validity, in headless Chromium; the fail-closed render checks |
| `build-candidate.mjs` | Command line: plan, render, annotate, write and gate a TRAIN/DEV candidate |
| `compare-builds.mjs` | Command line: compare two builds sample by sample (reproducibility) |
| `audit-candidate.mjs` | Command line: independent read-only audit of one candidate (integrity, recount, distributions, pixel contrast, contact sheets outside the repo) — M22.5 |
| `png.mjs` | Strict PNG decoder (every CRC, inflate, unfilter) and encoder, for the audit |
| `visibility.mjs` | G10 (development name): per-element pixel-visibility metrics on decoded frames, and a classification that needs stated thresholds — no default (M22.6) |
| `render-fixtures.mjs` | Command line: renders and measures a fixture matrix (every palette × style, glyph × plate, native control, decor and occluder style) in a real browser — not a dataset (M22.6) |
| `configs/g10-provisional-UNAPPROVED.json` | Provisional G10 thresholds, calibrated on candidate 1, for diagnostic use only (M22.6) |
| `configs/m22.4-train-dev.json` | The owner-approved TRAIN/DEV configuration of M22.4 |

## Rendering and candidate builds (M22.4)

```bash
node tools/dataset/v2/build-candidate.mjs --config=tools/dataset/v2/configs/m22.4-train-dev.json --candidate=<n>
node tools/dataset/v2/build-candidate.mjs --config=<same> --scratch-out=<absolute directory outside the repository>
node tools/dataset/v2/compare-builds.mjs --a=<build> --b=<build>
```

**Browser setup.** Each planned spec is rendered in Playwright's local headless Chromium:
- **Context:** `deviceScaleFactor: 1`, offline, every request aborted and counted.
- **Page:** the viewport is set to the spec's exactly, and the spec's standalone HTML is loaded with `setContent`. The document loads nothing.
- **Fonts:** the renderer waits for them before measuring.

**Measurement.** For each sample the renderer records:
- every labelled element's `getBoundingClientRect` and computed `position`;
- every occluder's rect;
- the viewport and DPR;
- the PNG frame, with its size checked against the viewport.

**Hit-test validity.** `document.elementFromPoint` is asked at the 5 × 5 and 9 × 9 points of `samplingPlan`. The answer is judged by the tested `hitMatches` and `classifyElement` (`tests/browser/support/fixture-validity.mjs`), injected from source. A hit is the browser's hit test, not a pixel.

**Fail closed.** These are render defects, and any one of them refuses the build:
- a wrong viewport, DPR or frame size;
- a labelled element or occluder missing or extra;
- an occluder away from its declared box;
- any network request;
- a browser error.

On a refused build, `BUILD-STATUS.json` says FAILED, names the defect, and the partial output is kept. A labelled element rendered away from its box is not a render defect: it is recorded as measured, and G4 and G8 fail it.

**Gate.** G1–G9 run three times: on TRAIN alone, on DEV alone, and on both together, which catches cross-split integrity failures. A candidate PASSES only if all three pass. G4 counts a positive only when it is:
- intended as a positive;
- HIT_TESTABLE on both grids;
- within `sourceTolerancePx` of its declared box;
- `absolute`.

**Outputs.**
- **Per split:** `manifest-<split>.json` and `frames-<split>/<id>.png`. Each sample carries `framePath`, its frame hash and size, its HTML hash, its spec hash, provenance and annotations, including per-grid hit-test detail.
- **Build:** `build-record.json`, holding counts, hashes, environment and gate results, and `BUILD-STATUS.json`.
- **Never overwritten:** a destination that exists is refused, so a new attempt takes a new number.

## Spatial placement

The architecture review measured the first version's top-left shelf packing:
- sparse pages: 95% of element centres in the left quarter of the viewport and 100% in the top
  quarter;
- dense pages: 99% in the top half and none in the bottom quarter.

Placement is now **stratified**:
1. The **usable area** is the viewport below the masthead, inside a 16 px margin.
2. It is split into a **3 × 3 grid of regions**. Each sample draws a seeded permutation of the nine,
   and its i-th target (largest boxes first) prefers region `perm[i mod 9]`.
3. A seeded search (up to 48 candidates per region) puts the element's **centre** in the region, its
   whole box in the usable area, and at least 8 px between it and every placed element. A full
   region hands over to the next in the permutation.
4. A target with no room anywhere is **deferred**, never dropped (see below).

**Acceptance criteria, fixed before measurement** and asserted by `test/v2.test.mjs`. For every one of
the six viewport shapes, pooled over the tested seeds, separately for sparse pages (1–2 targets) and
dense pages (12 targets):
- every 3 × 3 region holds 5%–25% of element centres (uniform would be 11.1%);
- the top third holds at most 45%;
- the bottom, left and right thirds each hold at least 20%.

These criteria hold on the tested seeds (1,600 sparse and 200 dense samples); they are not proven
for every seed. Measured on the review's own probe after the change:
- sparse: viewport x quarters 0.21 / 0.30 / 0.29 / 0.20 and y quarters 0.17 / 0.31 / 0.28 / 0.24;
- dense: x 0.21 / 0.29 / 0.28 / 0.23 and y 0.18 / 0.29 / 0.28 / 0.25;
- every 3 × 3 region holds 7.2–14.4% (sparse) and 9.4–12.5% (dense).

Very wide elements can only be centred in the middle column; that follows from geometry.

## Provenance (M22.3)

A spec records everything its pixels come from, and its annotations carry it:
- **Seed:** the seed, and how it was derived (`seedDerivation`: scheme, identity, PRNG).
- **Spec hash:** the sample's `specHash`.
- **Page geometry:** viewport, scale, masthead and usable area.
- **Page appearance:** palette, font stack, control style and density.
- **Per element:**
  - the declared box and declared positioning;
  - region;
  - the size draw: shorter side in CSS and model px, drawn and realised aspect;
  - its own appearance;
  - intent and occluder id.
- **Per occluder:** id, role, kind, target, declared box, the share of the target it covers, and the rendered box once a renderer measures it (`null` until then).
- **Decor:** the unlabelled blocks.

Every value is generated: no page text, no path, nothing personal (tested over a whole manifest).

## Appearance (M22.3)

Drawn from the seed, each through its own stream, so the same seed always looks the same.

**Per page:**
- one of 6 palettes (light, dark and high-contrast);
- one of 7 local font stacks, each ending in a generic family;
- one of 6 control styles;
- one of 3 density levels. Density sets the page's share of targets and its amount of unlabelled decor.

**Per element:**
- an icon gets one of 10 glyphs on one of 3 plates;
- links may be underlined; tabs may be selected; checkboxes and radios may be checked.

**No external asset:** no image, URL, `@import` or `@font-face`.

**Hit-safety.** The M22 validity grids sample points 1/(2n) of the way in from each edge. A corner
radius above about 0.19 of the shorter side puts a 9 × 9 corner point outside a rounded box, and
browsers hit-test rounded corners (INFERENCE; UNKNOWN on this stack until rendered). So:
- a labelled element's radius is at most `HIT_SAFE_RADIUS` = 0.15 of its shorter side;
- round icon shapes are drawn inside a rectangular box.

M22.2's `circle` and `rounded` icons broke this rule.

## Visual fixes and the G10 pixel diagnostic (M22.6)

**Why.** M22.5 found that candidate 1 passed G1–G9 while 374 positives were effectively invisible:
- *page-on-page textboxes* in the `filled` and `flat` styles;
- *icon plates erased* by the CSS `background:` shorthand.

Hit-testing cannot see drawing.

**What changed in render revision `r2-m22.6-visual-fixes`.** Seeds and boxes are unchanged.
- **Textbox:** each control style's `textbox` treatment is either a page field with a full edge, or a tinted `field` with a bottom rule, never page-on-page. Palettes gain `field` and `fieldEdge`. The high-contrast `surface` is no longer the page colour.
- **Icon:** the plate is `background-color`, and the glyph is `background-image` with `-position`, `-size` and `-repeat` longhands. The shorthand is never used on an icon.
- **Decor:** dividers are dashed, and panels are borderless with a header band, so neither reads as a field.
- **Labels:** the word and size are fitted to the box width. `__measureV2` reports each text element's overflow in px.
- **Native controls:** checkboxes and radios are drawn at 13 px and scaled to the box, so the rect is unchanged.
- **Occluders:** four looks (solid, banded, striped, card), with unchanged geometry.

**G10.** `visibility.mjs` measures each positive on the decoded PNG:
- salience (the k-th highest contrast to the surround);
- coverage at five contrast levels;
- fill, edge and ink;
- class-specific readings.

It classifies VISIBLE, BORDERLINE or INVISIBLE **only with stated thresholds**; there is no default. It is separate from G1–G9. Contrast is the WCAG 2.x ratio. It is not a conformance claim, and not a measure of recognisability.

**Running it:**
- `audit-candidate.mjs` reports G10 distributions always.
- With `--g10=<file>` it also reports classifications, usable positives per cell and every invisible element.
- Until the owner approves thresholds, G10 is diagnostic only. See `artifacts/experiments/M22.6-visual-remediation/decision.md`.

## Quotas: positives, plus occlusion cases on top

The schedule states **two separate quotas**, per split × class × size bucket, each an explicit
integer with no default:

```json
{
  "maxTargetsPerSample": 12,
  "maxOverflowSamples": 40,
  "positives":      { "train": { "button": { "very-small": 150, "small": 150, "medium": 150, "large": 150 }, "...": {} } },
  "occlusionCases": { "train": { "button": { "very-small": { "partial": 8, "full": 7 }, "...": {} } } }
}
```

- **Occlusion cases are additional.** A cell asking for 150 positives and 15 occlusion cases plans
  165 targets of that class and size. An occlusion case never reduces a positive quota.
- **Incomplete schedules are refused:** a missing class, bucket or kind, a non-integer, or an unknown
  key.
- **Planned is not observed.** The plan's counts are *planned* positives and occlusion cases.
  Whether a planned positive is a usable, hit-testable positive is established only by rendering, and
  then by the gate (G4 for coverage, G9 for labels). A rendered dataset that falls short fails the
  gate.

## Deferred targets

A target a page could not hold is **rescheduled** to an overflow sample appended after the requested
ones. Its id continues the split's sequence (`train-00600`, `train-00601`, …), so ids stay unique.
Overflow samples take up to `maxTargetsPerSample` targets each, in deferral order; anything still
unplaced moves on.
- **The bound:** at most `maxOverflowSamples` overflow samples are added.
- **If targets remain,** the plan is **refused** with the class, bucket and role of every unplaced
  target. A quota is never silently reduced.
- **Reconciliation:** placed counts must equal scheduled counts exactly, cell by cell and role by
  role, or the plan is refused.
- **Reporting:** deferrals at the first layout and the number rescheduled are reported separately
  for positives and occlusion cases.

## Quality gate (`tests/browser/support/dataset-quality-gate.mjs`)

| Option | Meaning | Default |
|---|---|---|
| `classes` | classes the dataset must cover | **none — required** |
| `expectedSplits` | splits the dataset must contain; an absent one fails G4 and G7, an unexpected one fails G7 | **none — required** |
| `requiredChecks` | checks that must be applicable; NOT_APPLICABLE on one fails the gate. Use `REQUIRED_CHECKS_V2` (all nine) for v2 | **none — required** |
| `minPerClassBucket` | G4: minimum positives per class × bucket × split; an integer **≥ 1**, or one per expected split (`{ train: n, dev: m }`, M22.3) | **none — required** |
| `nearDuplicateIou` | G5 | **none — required** |
| `repetitionShare` | G6 | **none — required** |
| `sourceTolerancePx` | G8: largest rendered-versus-declared edge difference, CSS px | **none — required** when any annotation has `source` |

Hardening against the review's six false passes:
- a required check that is NOT_APPLICABLE fails the gate, and each check's own status stays in the
  report;
- G3, G8 and G9 fail a **partially populated** annotation set rather than skipping the rest;
- `expectedSplits` makes an absent split a failure;
- `minPerClassBucket` must be at least 1;
- G9 checks every declared intent against the observed validity: `positive` → HIT_TESTABLE,
  `occlusion-partial` → PARTIALLY_OCCLUDED, `occlusion-full` → FULLY_OCCLUDED;
- G8 requires `computedPosition` to be exactly `absolute`.

**Backward compatibility:** M22.1's recipe audit states its own schema, `REQUIRED_CHECKS_V1_RECIPE_AUDIT`
(G1–G7), so G8 and G9 may be NOT_APPLICABLE there.

**No value here is an approved training threshold.**

## Split leakage (`splits.mjs` `assertNoLeakage`)

**What it checks:**
- ids unique across the dataset;
- no seed in two splits;
- no **exactly identical** layout in two splits;
- no **near-identical** layout in two splits.

Near-identical is measured by `layoutSimilarity`: elements matched one-to-one, same class, at
IoU ≥ `elementIou`, divided by the larger element count. A pair is a leak when that is
≥ `layoutShare`. **Both thresholds are required, owner-supplied, and have no default.**

A layout shifted by 1 px across splits is caught (tested). Same-split near-duplicates are
**reported, not thrown**: they are a coverage question, not leakage. Empty layouts are not compared,
and are counted. The check compares every pair of non-empty samples, so its cost grows with the
square of the sample count.

The gate's G7 still compares rendered layouts exactly. Near-identical detection runs at plan time.

## Reproducibility

- **Seeds:** `seedFor(split, index)` = SHA-256 of the canonical JSON identity
  `["t1-ui-synthetic", "<version>", "sample", "<split>", <index>]`, as 64 hex characters.
  - Until M22.3 a seed was a 32-bit FNV-1a value; on the actual identities no collision was measured, but the bound is gone.
  - Each sample draws from named streams (`layout`, `elements`, `decor`, `appearance`), each a xoshiro128\*\* generator with 128 bits of state.
  - A spec whose seed is not the seed of its (split, index) is refused.
- **Ids:** `<split>-<00000>`, fixed width, so string order is index order; at most 100,000 per split.
  Overflow ids continue the sequence.
- **Order:** elements top-to-bottom, then left-to-right, keyed after sorting; manifests sort samples
  by id.
- **Canonical JSON is strict:** `undefined`, non-finite numbers, functions, symbols, bigints, array
  holes and non-plain objects are refused, with their path, instead of being emitted or changed.
- **Hashes:**
  - per sample, `specHash`;
  - per planned split, `planSha256`;
  - per split manifest, `hash`, over canonical JSON.
- **Same inputs, same outputs:** byte-identical plans, HTML and hashes, tested in two ways:
  - golden values for `2.1.0-draft`;
  - a second Node process that reproduces a plan hash.

## Build procedure

M22.4 followed it for TRAIN and DEV (`artifacts/experiments/M22.4-train-dev-candidate/`).

1. The owner approves and records the following. M22.3 proposed them, and M22.4 approved them, with
   10% positive oversampling (`configs/m22.4-train-dev.json`).
   - the schedule (positives and occlusion cases);
   - `maxTargetsPerSample` and `maxOverflowSamples`;
   - split sizes;
   - leakage thresholds;
   - gate thresholds.
2. Plan: `node tools/dataset/v2/build-v2.mjs --schedule=<file> --counts=train:<n>,dev:<m> --leakage=<elementIou>:<layoutShare>`.
   It writes nothing.
3. Implement and review the render step (M22.4).
4. Build TRAIN and DEV into `manifest-<split>.json` and `frames-<split>/` (`build-candidate.mjs`).
5. Gate TRAIN and DEV with `requiredChecks: REQUIRED_CHECKS_V2` and
   `expectedSplits: ["train", "dev"]`. Fix the generator on any failure; never edit labels by hand.
6. TEST only after TEST authorisation is hardened (below).

## TEST — known limitation, not fixed here

`planSplitIds("test")` needs a seal token. But:
- the token is a public constant;
- lower-level helpers (`seedFor`, `sampleIdentity`, `sampleId`, `dealTargets`, `layoutSample`) do not check it;
- TEST seeds come from a public formula (SHA-256 of a public identity since M22.3), so TEST pages
  are predictable from source;
- "built once" is not enforced.

`plan.mjs` and `build-v2.mjs` refuse TEST outright. **A separate task must harden TEST
authorisation before any TEST build.**
