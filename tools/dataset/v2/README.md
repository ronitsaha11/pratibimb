# `tools/dataset/v2` — the version 2 synthetic T1 dataset generator

> **Status (2026-11-01): implemented and unit-tested; NO v2 DATASET HAS BEEN GENERATED, nothing has
> been rendered, and no model has been trained on v2.** The v1 builder
> (`tools/dataset/build-dataset.mjs`), `t1-ui-v1` and the shipped T1 artifact are unchanged.
> Nothing here reads `artifacts/datasets`.

## Architecture

All modules are pure: no browser, no network and no file writes. `splits.mjs` reads one file, only
for audits.

| Module | Does |
|---|---|
| `config.mjs` | Version, classes, size buckets (the M22 buckets plus generation bounds), per-class aspect ranges, icon shapes, viewports, layout constants |
| `prng.mjs` | Seed derivation (FNV-1a), the PRNG (mulberry32), canonical JSON, SHA-256 |
| `splits.mjs` | Per-split manifest and frame names, ids, seeds, the TEST seal, the audit reader, the leakage check |
| `schedule.mjs` | Validates an owner-stated coverage schedule and deals its targets to samples |
| `layout.mjs` | One sample: viewport, masthead, sized targets, shelf placement, explicit occlusion cases |
| `html.mjs` | A laid-out sample → a standalone HTML document, with `__measureV2()` |
| `annotate.mjs` | Render results → annotations with provenance and the `positive` flag; split manifests |
| `build-v2.mjs` | Command line: **plan only** in M22.2 |

Rendering (Playwright, `__measureV2`, the M22 hit-test validity from
`tests/browser/support/fixture-validity.mjs`) is the build step that M22.2 deliberately does not
implement. `annotate.mjs` defines exactly what that step must hand over.

## What changed from v1 (each a fix for an M22.1 finding)

| v1 finding | v2 |
|---|---|
| The icon's `left`/`top` were ignored (`[role=img]` had no `position` rule); every icon rendered at the origin under the masthead | **One rule for every labelled element:** `[data-v2]{position:absolute}`, with the declared box inline. G8 fails any element whose declared position is ignored, or which renders off its declared box |
| One fixed 22×22 icon | Icons drawn per target: 4 shapes (circle, square, rounded, glyph), aspect 0.8–1.25, any size bucket, any position, and a count set by the schedule |
| No element of 32 model px or more; very-small only for checkbox and radio | **A coverage schedule:** every class × every bucket has a stated quota. Each target's shorter side is an integer CSS size chosen to land inside its bucket at its sample's scale |
| Overlaps from layout | Positives never overlap each other or the masthead. Occlusion appears only as **explicit, labelled occlusion cases** (`intent: occlusion-partial` / `occlusion-full`), each with its own occluder, and these are never positives |
| One manifest holding all three splits | **One manifest and one frame folder per split.** Audits open TRAIN or DEV by exact file name, never TEST |

## Labels and provenance

Each annotation records:
- `box`: the rendered `getBoundingClientRect`;
- `visibility`: by geometry;
- `validity`: the M22 hit-test category;
- `intent`: `positive`, `occlusion-partial` or `occlusion-full`;
- `source.declared`: the box the generator declared;
- `source.computedPosition` and `source.bucket`.

**`positive` is true only when the intent is `positive` and the validity is `HIT_TESTABLE`.** A fully
occluded element, or an occlusion case, is never a positive training target. The hit test is the
browser's, not pixel visibility.

## Reproducibility

- **Seeds:** `seedFor(split, index) = FNV-1a("t1-ui-synthetic|<version>|<split>|<index>")`.
  Changing the version changes every seed.
- **Ids:** `<split>-<00000>`.
- **Order:** elements are sorted top-to-bottom, then left-to-right, and keyed `<id>-e<000>` after
  sorting; manifests sort samples by id.
- **Hashes:** each sample carries `specHash = sha256(canonical JSON of its spec)`; each split manifest
  carries `hash = sha256(canonical JSON of everything else)`.
- **Same inputs, same outputs:** the same version, schedule and occlusion setting give byte-identical
  specs, HTML and manifest hashes (tested).

## Quality gate configuration (`tests/browser/support/dataset-quality-gate.mjs`)

| Option | Meaning | Default |
|---|---|---|
| `classes` | classes the dataset must cover | **none — required** |
| `minPerClassBucket` | G4: minimum positive examples per class per bucket per split | **none — required** |
| `nearDuplicateIou` | G5: same-class pairs in a sample at or above this IoU are near-duplicates | **none — required** |
| `repetitionShare` | G6: a (class, box) in at least this share of a split's samples (and ≥ 2) is suspicious | **none — required** |
| `sourceTolerancePx` | G8: largest allowed rendered-versus-declared edge difference, CSS px | **none — required** when any annotation has `source` |

- **What the checks cover:**
  - G1 box validity;
  - G2 visibility against geometry;
  - G3 unlabelled occlusion;
  - G4 class × size coverage;
  - G5 duplicates;
  - G6 repetitive geometry;
  - G7 split independence;
  - G8 source-to-render consistency;
  - G9 occlusion labels.
- **No threshold here is an approved training threshold.** The values used in tests and in M22.1's
  report were chosen for those purposes only.

## Build procedure for a future dataset (not performed)

1. The owner approves: the schedule (quotas per split, class and bucket, allowing for the
   occlusion share, which takes cases out of the quotas), the occlusion setting, the gate
   thresholds, and the split sizes. All are recorded before any build.
2. Plan: `node tools/dataset/v2/build-v2.mjs --schedule=<file> --counts=train:<n>,dev:<m> --occlusion=<share>:<kinds>`.
   This checks leakage and reports coverage and deferred targets, and writes nothing.
3. Implement and review the render step: Playwright, `__measureV2`, hit-test validity, and
   `annotateSample`.
4. Build TRAIN and DEV into `manifest-train.json` / `frames-train/` and `manifest-dev.json` /
   `frames-dev/`.
5. Run the gate on TRAIN and DEV with the approved thresholds. Fix the generator on any FAIL; never
   edit labels by hand.
6. Build TEST once, as below.

## TEST sealing and access policy

- **Planned only by the sealed build.** `planSplitIds("test", …)` refuses unless it is given
  `testSealToken()`. That token is a recorded intent, not a secret.
- **Built once,** into `manifest-test.json` / `frames-test/`. Its manifest hash is recorded when it
  is built, before any model is evaluated.
- **Never opened by routine work.** `openAuditManifest` refuses `test` before any filesystem call,
  opens only `manifest-<split>.json` by exact name, and never lists a directory. No audit, tuning
  or development step opens TEST.
- **Opened once,** for the frozen evaluation the owner approves; that read is recorded.
