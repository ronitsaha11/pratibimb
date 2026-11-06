# Changelog

All notable changes to PratiBimb are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to the milestone tags in `docs/operations/git-workflow.md` §4.

## [Unreleased]

### Found
- **M22.1 — the T1 dataset recipe cannot teach the icon class.** Regenerating its TRAIN and DEV
  splits (the pinned manifest also holds TEST and was not opened): every icon label is fully
  occluded, because `specToHtml` gives `[role=img]` no `position` rule, so the icon renders at the
  origin under the masthead. No class has an element of 32 model px or more. Boxes are well formed
  and TRAIN/DEV share no seed or layout. `t1-ui-v1` is unchanged
  (`artifacts/experiments/M22.1-dataset-quality/`).

### Added
- **M22.2 — an isolated v2 generator for a future T1 dataset (`tools/dataset/v2/`). No dataset was
  generated, nothing was rendered, no model was trained.**
  - Every labelled element, icons included, absolutely positioned at its declared box.
  - An owner-stated class × size schedule covering all four M22 buckets.
  - Explicit, labelled occlusion cases, never positives.
  - One manifest per split; TEST planned only by a sealed build and refused by audits.
  - Leakage checks, deterministic seeds, ids, ordering and hashes; plan-only CLI.
  - Gate checks G8 (source-to-render consistency) and G9 (occlusion labels).
  - The v1 builder and `t1-ui-v1` are unchanged.
- **M22.2 hardening, after a read-only architecture review (still plan-only; no dataset generated).**
  - Stratified 3 × 3 placement instead of top-left shelf packing: on the tested seeds every region
    of every viewport shape holds 7.2–14.4% of element centres (sparse) and 9.4–12.5% (dense), where
    the review measured 100% in the top quarter on sparse pages.
  - Separate positive and occlusion-case quotas (occlusion added on top); deferred targets
    rescheduled to bounded overflow samples; exact reconciliation, or refusal.
  - The dataset gate now requires `requiredChecks` and `expectedSplits`, fails incomplete annotation
    sets, checks declared occlusion against observed validity, requires `absolute` in G8 and
    `minPerClassBucket ≥ 1`. The review's six false passes now fail.
  - Near-identical cross-split layouts detected at owner-supplied thresholds.
  - Known and not fixed: the TEST seal is weak; plan and build refuse TEST.
- **M23.14 — A product's panel does not show `captureStatus` (OD-X; presentation only).** Its Status box prints a named list of
  the worker's fields. An evidence panel prints the whole reply, as before. The worker still reports the status: in the real
  product build, the worker, offscreen chunk, content script and manifest are byte-identical to the build before. Not seen in a
  browser. OD-Y and OD-Z await the owner.
- **M23.13 — A product's toolbar button opens the side panel (OD-W).** It issues no capture grant, ticket or frame, and sends no
  message. A failure or a missing tab is reported, with no fallback to capture. An evidence build's click is unchanged, and
  `Alt+Shift+P` is the same event. Permissions, hosts and CSP are identical to the previous real build, which this build
  replaces. Not tried in a browser. OD-X, OD-Y and OD-Z await the owner.
- **M23.12 — The product's UI says what a product task does (OD-T; UI copy, tests and documentation only).** Toolbar title
  `PratiBimb — Page Assistant`, plus the approved side-panel description and privacy explanation. Those two sentences appear
  in product builds only, because the privacy one is false in an evidence build, and the Capture field is now
  evidence-build-only with its original words. No claim about visual PII, whose protection is not operational. No task,
  permission, CSP, packaging or hook change. Not rebuilt or seen in a browser.
- **M23.11 — Gesture harnesses are evidence-build-only (OD-U, Option B; harnesses, tests and documentation only).**
  `run-gesture-capture.mjs` and `run-gesture-acts.mjs` call one fail-closed gate first, which identifies a build from
  `connect-src`, the hooks' names and T1's presence by file name. A product, missing or unidentifiable build is refused before
  Chrome can start, and neither harness can build. All 41 checks are byte-identical to before. 47 of 47 deliberate
  regressions caught. Neither harness or any build ran; evidence-build runtime validation is outstanding; OD-T awaits the owner.
- **M23.10 — Evidence harnesses judge a build-separation contract (OD-V; harnesses, tests and documentation only).** Six
  harnesses no longer require product and evidence `background.js` to be byte-identical, which OD-S made impossible.
  `tests/browser/support/build-separation.mjs` requires product hooks absent, evidence hooks present, two evidence builds'
  workers the same, and product and evidence workers different. Their `content.js`, manifest, permission and CSP
  comparisons and their own checks are retained. A missing build can never read as checked. 58 of 58 deliberate regressions
  caught. No harness or build ran; evidence-build runtime stays unverified; OD-U and OD-T await the owner.
- **M23.9 — Diagnostic hooks removed from product builds (OD-S, Option B).** `PERCEIVE_ONCE`, `STREAM_CONSUME`, their
  four worker drivers, the worker's `CAPTURE_FRAME` handler and the references that kept the capture path alive now sit
  behind the existing evidence flag. A real product build names none of them and has no capture call; its manifest,
  content script and side panel are byte-identical to before. An evidence build keeps the same behaviour under test
  doubles; its runtime is unverified. Corrects M23.8: six evidence harnesses now refuse, because their byte-identity guard
  on `background.js` cannot hold (OD-V, not changed). No browser ran; no permission, CSP, egress, authority, TR-01 or ADR
  changed.
- **M23.8 — DOM-only boundary assurance and regression hardening (tests and documentation only).** A rig runs the real
  worker, offscreen document, task run, gates and egress guard under a fake `chrome`, counting every capture, model and
  worker request: an ordinary task leaves them all at zero, and a regression double fails the checks. Audits
  `PERCEIVE_ONCE` and `STREAM_CONSUME`: both ship in the product bundle and accept any context of this extension,
  correcting M23.7's "DevTools-only". Replaces the vacuous checks in two harnesses, extracts and tests M13's
  product-phase condition, and adds a read-only build inspection. Prepares OD-S, OD-T and OD-U and a person-run smoke
  procedure (not run). Finds that two M4 and M5 harnesses depend on the product build, which M23.7 did not report. No
  browser ran; no product source, model, CSP, permission or ADR changed.
- **M23.7 — DOM-only Phase 1 implemented in product builds (OD-P, OD-R).** `runTask` no longer wires a perception
  pass in a product build (`host-lib/task-perception.ts`, build-time `__EVIDENCE_BUILD__`), so a product task captures
  no frame and runs neither the UI head (T1) nor TR-01; the handoff always declares the structural floor. The UI head
  is packaged only in evidence builds; `ORT_SMOKE` reports it absent in a product build. Evidence builds, TR-01's
  packaging and hash checks, permissions (including `tabCapture`), CSP and egress are unchanged. Adds 18 regression
  tests; adjusts the M13 CSP harness's product-phase model-load check accordingly. Not browser-verified; not accepted.
- **M23.6 — OD-R recorded: APPROVED — OPTION A, DOM-only Phase 1 (implementation not authorised).** Normal Phase 1
  task execution is to capture no browser frames and run neither T1 nor TR-01; DOM observation and the structural
  handoff remain. Updates the proposed ADR-0015 (new §3.6; still PROPOSED), marks the exclusions in the acceptance
  documents, records that the brief's visual requirements are not fulfilled by Phase 1 (P2-08), and adds a
  dependency-ordered implementation outline (design only). The runtime is unchanged; no existing ADR, gate, CSP,
  permission or model asset changed.
- **M23.5 — Phase 1 perception boundary: OD-R prepared (documentation only).** Maps the capture chain and every
  known frame consumer from source, inventories the existing fallback test evidence (the M20 benchmark already
  completed 6 tasks with no frame), and compares a DOM-only Phase 1 (A), capture kept with T1 off (B) and capture
  for a named consumer (C). Recommends A for the owner's consideration; drafts ADR-0015 clauses for each outcome
  (not applied). No code, capture, model, test, schema, CSP, permission or ADR changed.
- **M23.4 — OD-P selected: T1 to be disabled from active Phase 1 execution (not implemented).** Records the
  owner's policy and its impact (`artifacts/experiments/M23.4-t1-disablement-impact/`). A tested no-T1 fallback
  already exists (`MODEL_ASSET_UNAVAILABLE` → `NO_DETECTOR` → structural-floor handoff). Adds the OD-O integrity
  policy proposal, the TR-01 acceptance assessment (OD-F), an M20 limitation note, ADR-0015 changes C-1 to
  C-10 (not applied) and a design-only readiness plan. Corrects M23.3: T1 inference runs only on frame-capturing
  passes, and the M20 benchmark ran none. No code, packaging, model, CSP, permission, egress or ADR changed.
- **M23.3 — Phase 1 architecture reconciliation; ADR-0015 proposed.** A static source trace
  (`docs/acceptance/phase-1-data-flow-and-components.md`) finds that the T1 UI head is loaded and run on every
  perception pass, unadopted and with no build-time or runtime integrity check. Its output can relabel DOM
  `source` and set handoff capability metadata, but adds no element and never reaches the reasoner request.
  TR-01 masks the local frame only, and the only product egress is `sendVerified`. Adds ADR-0015 (PROPOSED —
  AWAITING OWNER APPROVAL), the RC-01 to RC-12 matrix, draft amendment language A-1 to A-9 (not applied) and
  owner decisions OD-N to OD-Q. No code, existing ADR, frozen text, gate, invariant or blocker changed.
- **M23.2 — owner decision: phased architecture.** Recorded in
  `artifacts/experiments/M23.2-phased-architecture-decision/`. Phase 1 is the current local, loopback,
  structure-only product; Phase 2 (vision-language and frame-based reasoning) is not authorised. Adds
  `docs/acceptance/phase-1-architecture-scope.md` and `phase-2-future-capability-register.md`; the M23.1
  proposal becomes the Phase 1 scope (still PROPOSED); the owner-decision register separates resolved,
  awaiting and blocked items; ten reconciliation items are listed. Corrects M23.1's "DOM-only floor"
  wording: the unadopted T1 head runs in the perception pass, and clicks stay DOM-only. No ADR,
  constitution text, gate, invariant, blocker, CSP or permission changed. FR-01 deferred; B-07 blocked.
- **M23.1 — core-product acceptance definition (PROPOSED — AWAITING OWNER APPROVAL).** `docs/acceptance/`
  proposes what core-product acceptance means for the shipped architecture: 59 criteria in 12
  categories with eight separate evidence types, traceability of the brief's deliverables and the
  12-stage pipeline, a QG-01–QG-06 mapping with a structure-only QG-04-S proposal, owner decisions
  OD-A–OD-L and a release checklist. Approves nothing, signs no gate, changes no ADR, invariant,
  blocker or threshold. FR-01 stays deferred and B-07 blocked.
- **M22.19 — M22 scope amended (owner Option B) and engineering scope closed.** The objective is now
  M22's engineering foundation (the v2 dataset pipeline, candidate 2, approved G10, the adapter,
  occlusion-aware training, the v2 pipeline, one verified training run, telemetry and resume). The
  original detector-performance question, H1–H5 and any T1 vs T1-v2 comparison are deferred to
  **FR-01, not authorised for execution**. No detection result exists, nothing is adopted, and the
  evaluation restriction is registered unchanged as **B-07**. An outstanding register carries 17
  items. Not an evaluation approval.
- **M22.18 — M22 status and closure audit (read-only; recorded in M22.19).** Found the original
  question unanswered and the runner block unregistered. Corrected an earlier claim: no commit
  subject exceeds the limit counted after the `: `.
- **M22.17 — per-step timing and multi-session resume telemetry.** `StepTimer` records failed reads
  as untimed and never substitutes a duration; sessions are append-only and epochs name their
  session; run duration is only a sum of session-local times. Verified with fakes. No training.
- **M22.16 — telemetry integration assurance.** A fake-only harness found that telemetry exceptions
  could escape `run_training` or replace a failure code; fixed with `observe`. No training.
- **M22.15 — training telemetry.** Fixed the M22.13 null memory reading (a missing ctypes
  prototype hidden by a catch-all); monotonic, phase-resolved timing; every value tagged measured,
  derived or unavailable. No training.
- **M22.14 — DEV evaluation design (design only; recorded in M22.19).** Never executed or approved;
  deferred to FR-01.
- **M22.13 — the first v2 T1 retraining run (owner-authorised, one run; no detection evaluation, no
  export, no TEST).**
  - `tools/detector/loss_v2.py`: the legacy loss with ignored classification entries set to zero; bitwise
    equal in value and gradients to `detector_loss` under an empty mask. 24 tests.
  - `train_v2 --train`: the authorised loop. It needs an approved configuration, a clean tree and one
    run, and repeats the full pre-flight. Per epoch: all TRAIN, the full DEV loss (eval, no grad, same mask),
    an atomic verified checkpoint and a T1 re-check. Fail-closed conditions; resume only of an interrupted
    run. 10 loop tests, including bitwise interrupt-and-resume equivalence.
  - `train-v2-first-run.APPROVED.json`: the M22.12 proposal with the owner's approval only.
  - The run: COMPLETED, 40 epochs, 6,000 steps; DEV loss 3.983 → 2.893, best epoch 39; 185 of 6,000 steps
    clipped; no non-finite value. Weights stay in the git-ignored run directory. Candidate UNADOPTED.
- **M22.12 — partial-occlusion ignore mask and first-run configuration hardening (no training, no
  optimizer, no inference, no weights, no TEST).**
  - `tools/detector/occlusion_mask_v2.py`: a pure classification ignore mask. For each partial-occlusion
    case it ignores that class's channel at cells whose receptive field (31 px, jump 8, checked against
    `UiHead` on the meta device) sees the visible part. Positives always win; full occlusion ignores
    nothing; box targets are untouched. 35 tests. Candidate 2: 26,953 TRAIN / 6,999 DEV entries.
  - The adapter carries each occlusion case with its rendered occluder; a foreign occluder is refused.
  - Run configuration schema 2 (`train-v2-first-run.PROPOSED.json`, pending approval): exact steps,
    record-only early stopping, DEV frequency and aggregation, checkpoint retention and best rule,
    determinism, threads and non-finite-gradient policy. Pre-flight checks the counts against the data.
    41 + 7 tests. The M22.9 schema-1 file is kept and refused.
  - ADR proposal for the shared-cell assignment order; `targets.py` unchanged.
- **M22.11 — target-assignment and loss-semantics audit (read-only).** 0 collisions on candidate 2;
  larger-wins ordering contradicts the comment; 25.9 % of very-small objects are nearest-cell only;
  7,405 visible partial-occlusion cells were negatively supervised, with no ignore path.
- **M22.10 — first T1 retraining experiment: specification review (read-only planning; no training,
  no optimizer, no inference, no weights, no code change, no TEST).**
  - Checkpoint re-verified: candidates 1 and 2, the approved-G10 hashes and T1 (ADR-0003) unchanged;
    `npm run verify` PASS.
  - Hyper-parameter review: inherited vs new values separated. Weight decay is not an effective
    regulariser at these values; early stopping interacts with the cosine schedule; checkpoint every epoch.
  - Experiment specification (success definition, failure conditions F1–F15, recovery, T1 protection),
    evaluation plan (frozen F1 threshold rule; DEV figures selection-biased), risks and an analytic
    resource estimate (duration UNKNOWN).
  - Data-only measurement on candidate 2: positive cells skewed to large objects (very-small 1.8 %,
    large 67.5 %); no positives overlap, so a latent `assign_targets` ordering defect has no effect.
  - Final configuration proposed, every field marked, pending owner approval.
- **M22.9 — approved G10, conditional acceptance of candidate 2, and a pre-flight-only training
  pipeline (owner-authorised; no training, no optimizer step, no inference, no TEST).**
  - G10 thresholds approved by the project owner (2026-11-02) for candidate 2 only, in a separately
    versioned configuration bound to its manifest hashes; the provisional file is kept.
  - Audit evidence format 2: every positive's category and metrics, hash-bound to the configuration
    and thresholds. Candidate 2: 6,688 VISIBLE, 0 BORDERLINE, 0 INVISIBLE; 165 / 44 per cell.
  - Adapter: approved G10 enforced fail-closed (bindings, recomputed categories, missing, duplicate
    or unexpected ids refused); exclusions by category, class and size bucket.
  - `tools/detector/train_v2.py`: pre-flight only. It checks T1 against ADR-0003, validates the config
    and loads accepted TRAIN and DEV separately. Its output guard refuses T1, links and existing runs.
    It assembles the provenance plan and has no training step. 37 static and behavioural safety tests.
  - First-experiment hyper-parameters proposed, pending owner review.
- **M22.8 — the v2 adapter tests in canonical verification (no training, no inference, no TEST).**
  - `npm run verify` now ends with `npm run test:py` (`scripts/verify-python.py`): Python >= 3.12 and
    every pin in `tools/detector/requirements-test.txt` checked, then `pytest tools/detector/tests`.
    It fails, never skips, on a missing dependency or an empty collection; strict pins in CI.
  - CI: new `detector-adapter` job (Python 3.13, pinned CPU torch).
  - 13 adapter regression tests (split isolation, trapped-filesystem TEST refusal, separation on every
    identity, class order, bucket edges, DEV-side G10 binding, both-split tensor checks) and runner tests.
  - G10 acceptance review and train_v2 design review prepared for the owner; nothing approved.
- **M22.7 — an isolated v2 TRAIN/DEV training adapter and data dry run (no training, no inference,
  no TEST; candidates unmodified).**
  - `tools/detector/data_v2.py`: TRAIN and DEV only (others refused before file access); per-split
    manifests; frame SHA-256, size and set checks; captureSize from the frame; positives only, with
    occlusion cases excluded and counted; an explicit G10 policy that records approval and claims no
    acceptance while provisional. `data.py` and `train.py` unchanged.
  - `tools/detector/dry_run_v2.py`: counts, exclusions, separation and a tensor check through the
    unchanged v1 input path; no model. Candidate 2 passes; 31 Python adapter tests pass.
  - `audit-candidate.mjs --g10-out`: per-positive G10 classes for the adapter. `train_v2.py` is
    designed, not implemented.
- **M22.6 — visual defect remediation, the G10 pixel diagnostic, and TRAIN/DEV candidate 2
  (owner-authorised; no training, no detector, no TEST; candidate 1 preserved).**
  - Fixed: page-on-page textboxes (each style now draws a field or a full edge) and icon plates lost to
    the `background` shorthand (plate and glyph now separate longhand layers).
  - Improved: dashed dividers and banded panels (unlike fields), width-fitted labels with measured
    overflow, scaled native checkboxes and radios, varied occluder looks. No box moved.
  - Added: G10 pixel-visibility metrics (`visibility.mjs`) with no default thresholds, a browser
    fixture matrix (`render-fixtures.mjs`), and G10 in the candidate audit.
  - Candidate 2: G1–G9 PASS on TRAIN, DEV and both; 165 / 44 valid positives per cell; every
    positive measures visible (G10 diagnostic only, thresholds unapproved); reproduced byte for byte.
    A draft pending owner acceptance.
- **M22.5 — acceptance review of TRAIN/DEV candidate 1 (read-only; no training, no detector, no
  TEST; candidate unmodified).**
  - `tools/dataset/v2/audit-candidate.mjs` and `png.mjs`: independent integrity audit, recount,
    distributions, and per-element pixel contrast (WCAG 2.x ratio formula; no conformance claim).
  - Found: candidate 1 is structurally correct, but 282 textboxes and 92 icons are effectively
    invisible (borderless page-on-page textboxes; icon plate lost to the `background` shorthand), and
    hit-testing cannot see that. Not recommended for training as built; fixes and a pixel-salience
    check proposed. A v2 trainer adapter is designed, not implemented.
- **M22.4 — v2 TRAIN/DEV renderer and a validated candidate dataset (owner-authorised; TRAIN and
  DEV only; no training, no detector, no TEST).**
  - `tools/dataset/v2/render.mjs`, `build-candidate.mjs`, `compare-builds.mjs`: headless Chromium at
    DPR 1, offline; measured geometry and 5×5/9×9 hit-test validity; PNG frames; per-split
    manifests; fail-closed render checks; never overwrites a candidate.
  - Gate: G4 counts a positive only when its rendered box matches its declared source.
  - Candidate 1 (git-ignored): 600 TRAIN and 160 DEV frames; 165 / 44 valid positives in each of
    32 cells; every occlusion case observed as declared; G1–G9 PASS on TRAIN, DEV and both;
    reproduced byte for byte on W1.
- **M22.3 — TRAIN/DEV build specification and pre-build generator improvements (still plan-only;
  no dataset generated, nothing rendered, nothing trained).** Generator version `2.1.0-draft`.
  - Provenance per sample, element and occluder: seed derivation, spec hash, declared box and
    positioning, size draw, appearance, occluder identity and covered share, decor.
  - Appearance drawn from the seed: 6 palettes, 7 local font stacks, 6 control styles, 10 icon
    glyphs, 3 density levels, wider log-uniform aspects. No external asset.
  - Labelled boxes kept hit-safe (corner radius ≤ 0.15 of the shorter side); M22.2's circle and
    rounded icon radii would have put validity-grid corner points outside the shape.
  - SHA-256 seeds over an unambiguous identity, xoshiro128** streams, fixed-width ids, strict
    canonical JSON, golden hashes. The old 32-bit seeds showed no collision on the real identities
    (measured); the change removes the bound.
  - Gate: G4 may take one minimum per expected split.
  - A TRAIN 600 / DEV 160 configuration proposed for the owner, not approved.
  - TEST authorisation unchanged and still weak; TEST refused.
- **M22 (in progress) and M22.1 tooling, no detector run.**
  - `tests/browser/support/fixture-validity.mjs`: hit-test validity categories on 5×5 and 9×9 grids;
    `matchValidPopulation`: valid ground truth matched first.
  - `tests/browser/support/dataset-quality-gate.mjs`: a dataset gate (G1–G7) with required,
    stated thresholds.
  - `tests/browser/perception/audit-m22-fixtures.mjs` and `tools/dataset/audit-recipe-splits.mjs`
    (TRAIN/DEV only, never TEST).
  - `decodeHeadOutputAccounted` takes optional thresholds for evaluation; it defaults to the
    shipped values and no product code passes others.

### Fixed
- **M21 — the T1 letterbox inverse could end an edge box past the frame.** `clipToContent` then
  `modelToCapture` left 25% of edge-touching boxes outside the frame by a rounding error (≤ 6.8e-13
  capture px; e.g. 390×844, 820×1180), which `validateDetections` treats as malformed.
  `projectToCapture` now bounds every box to the frame (`boundToFrame`); a box already inside is
  returned unchanged. `computeLetterbox` and the continuous inverse are unchanged.
  - `assertRasterMatchesInverse`: the realm refuses to invert boxes through a transform for a
    different frame than it rasterised.
  - A stale comment in `apps/extension/host/offscreen/main.ts` still said T1's detections "move
    16-34%"; QG-03b fixed that. Corrected.

### Added
- **M21 — perception geometry regression and letterbox diagnostics.**
  - `packages/perception/test/geometryRegression.test.ts` (201 tests): landscape, portrait, square
    and extreme shapes; raster versus continuous rounding bounds; round trips; frame bounds;
    padding and clipping; decode accounting; malformed output; incompatible geometry.
  - `decodeHeadOutputAccounted` / `projectToCaptureAccounted`: value-free, per-stage counts. They
    reach only an evaluation (the realm's collect-only `detail`); the `Detector` interface is
    unchanged.
  - `tests/browser/perception/run-letterbox-diagnostic.mjs`: an engineering diagnostic, not J7.
    On W1, 120 DEV screens in six shapes at 2.0 CSS px per model px: no labelled element lost in the
    letterbox inverse and no box in the padding; every loss was an element the head never emitted
    (`artifacts/experiments/M21-perception-geometry/`).
- **M20 — a runnable product, measured.**
  - **`npm run reasoner`** (`scripts/reasoner/`): a product-owned launcher for the pinned local
    reasoner.
    - It verifies the model's size and full SHA-256, the llama.cpp b10956 archive's SHA-256, and
      every installed `.exe`/`.dll` against that archive.
    - It binds 127.0.0.1 only and serves exactly the CSP's endpoint,
      `http://127.0.0.1:8995/v1/chat/completions`.
    - It refuses web-page origins, a foreign Host, other paths and methods, non-JSON, oversized
      bodies, and value-shaped text (the shared server tripwire, now in
      `scripts/reasoner/tripwire.mjs`).
    - It logs a line per request and never a body.
    - On a busy port it says so and stops nothing.
    - `--check` verifies and exits; `--stop` stops only the processes it recorded, model first,
      after checking each is still its own.
  - **`RunRecord.events`**: every run's value-free event trail, in order, on the monotonic clock:
    - task start, observation, handoff verified, plan requested and received, plan validated;
    - clarification and consent requested and answered, binder revalidated, value restored, page
      refreshed;
    - click authorised, dispatched or failed; result observed and verified; run ended.

    `RUN_ENDED` carries the verifier's answer, so `DONE` is never read as success.
    `RunTimings` and `Transition.elapsedMs` now use the monotonic clock (`RunOptions.monotonic`,
    default `performance.now()`), kept to 0.01 ms.
  - **Side panel timings** (`timingRows`, `#task-timings`): each turn's measured stages in pipeline
    order, in ms.
    - "not measured" is distinct from 0.
    - A person's waiting time is labelled as theirs.
    - Each turn is headed by what it actually did.
    - Rendered with `textContent` only.
  - **W1 benchmark of the shipped path** (`tests/browser/extension/run-product-benchmark.mjs` →
    `artifacts/benchmarks/M20-w1-product/`).
    - Measured: per-stage p50/p95 (nearest rank, raw samples kept), cold vs warm, peak working set
      and private bytes and CPU per process group, JS heap, sizes on disk, tier firing, and
      network-free steps.
    - Workload: 6 bounded tasks, 15 steps. The 5-turn cap is not raised.
  - **Human-in-the-loop smoke test on the product launcher**
    (`tests/browser/extension/run-product-smoke.mjs`).
    - It requires the person's own `npm run reasoner` and records each run's event trail and timings.
    - It writes a new record per run and never overwrites one.
    - Ctrl+C shuts down safely.
  - **Docs:** `README.md` status and run instructions; `agentos/state.md` current state;
    B-05 resolved with evidence.
  - **The model server on 8977 is locked (B1, PR #91 review).** Loopback binding alone had left it
    open to any local process and, through its default all-origins CORS, to web pages.
    - It now requires a per-launch 256-bit key, given only through the child's environment and
      attached only by the front, which never forwards incoming headers.
    - It runs with `--no-slots`.
    - The launcher refuses to start unless the server refuses keyless and wrong-keyed requests and
      reports `/slots` off.
    - The person-run smoke test was repeated through the keyed server: PASS, 18 of 18 checks. The
      harness now refuses to run unless the model server is locked, counts the run's clicks across
      all turns, and records Submit's pointer events.
  - **Not changed:** CSP, manifest permissions, the model pin, the single endpoint, gates, ADRs,
    frozen schemas, the 5-turn cap, and consent or grant timing. J7/B5 and D1–D4 remain open.
    Production frame egress remains blocked.
- **M14 — stage 12, "repeat, or stop and ask"** (constitution §1). A task can now take more than one
  turn. `runTaskLoop` (`@pratibimb/orchestrator`, `src/loop.ts`) runs each turn as one complete
  `runTask`, through every gate:
  - each turn gets a fresh observation, sanitize, verified handoff, plan, VALIDATE / REFRESH, grant,
    REHYDRATE, ACT and VERIFY RESULT;
  - each turn has its own request id (`<id>.t<n>`), so a plan made for one turn is refused on another
    (`REQUEST_MISMATCH`);
  - no plan, reference, grant, permit or value is carried between turns.

  It continues only after a turn whose action VERIFY RESULT **confirmed**. It stops and asks on a
  refusal, an unconfirmed result, a deterministic-planner turn, a repeated plan, or a spent budget
  (`MAX_TASK_TURNS = 5`).
- **The `done` step** from the frozen action schema (`@pratibimb/plan`):
  - It must be the plan's only step and names no element.
  - It passes the same identity and stale-view checks as an action, and authorises nothing — no
    grant, rehydration or click.
  - The machine ends `VALIDATE_PLAN → DONE` with `declaredDone: true`. The loop reports it as
    `COMPLETED_AS_DECLARED`, **the model's claim**; `succeeded()` stays false for that turn.
  - The local model's constrained grammar offers it. `EXECUTABLE_ACTIONS` is still `["click"]`.
- **Extension.** `RUN_TASK` accepts an optional `maxTurns` (1–5). Without it the run is exactly the
  single turn it was before. With it, `result.loop` carries the outcome and every turn's projected
  record, and every capability is revoked between turns.
- **Not yet shown:** a multi-turn task in the browser against a real model. The loop is tested against
  the real gates in Node (`packages/orchestrator/test/loop.test.ts`) with a scripted test reasoner.
- **M15 — action-specific result verification.** Every click's expected effect is now declared by
  the client with the task: `postconditions`, target → an ADR-0007 postcondition, checked by
  `checkPostconditions`. Nothing assumes "submit disables itself" any more.
  - **Refused before any grant, value restoration or click:** a click with no declaration
    (`NO_DECLARED_POSTCONDITION`), and one whose postcondition already holds
    (`POSTCONDITION_ALREADY_HOLDS`).
  - **Model-supplied success conditions are dropped** by the parser.
  - **A post-action read-back that fails** is `UNKNOWN` (`OBSERVATION_FAILED`), not an escaped
    exception.
  - **One click per plan** (`MORE_THAN_ONE_CLICK`).
  - **The local model:**
    - is now asked on pages with no references;
    - sees each button's `enabled` state;
    - has its clicks grounded to enabled controls.
  - **Each turn acts through its own transport cycle**, fixing an M14 defect that refused every second
    turn in the real extension.
  - `RUN_TASK` requires `postconditions`.
  - Demonstrated on W1 with the real extension and Qwen2.5-0.5B on a synthetic two-step page:
    [M15-two-step-task](artifacts/experiments/M15-two-step-task/README.md).
- **M16 — which stored value goes into which field is the client's decision.** On the M2 page the
  local model put the NAME reference into the mobile field. The binder refused it, and the task
  stopped.
  - `@pratibimb/privacy` `groundFill` pairs each empty field with the one reference that fits it,
    using `fieldFit`, the class rule `bind` now shares. It withholds unknown, free-text, OTP,
    unmatched and conflicting fields, and says why.
  - The plan validator refuses any reference insert outside that pairing (`REFERENCE_NOT_GROUNDED`,
    `HOSTILE`: no fallback, no substitution).
  - The local model's grammar offers only the pairing.
  - Manifest, schema, ADRs, gates, CSP and pins unchanged.
  - W1, real Qwen, M2 page: the model completed the task in 11 of 11 recorded runs, with no
    fallback (M15 recorded 0 of 3). The two-step control was unchanged at 3 of 3. Not a
    reliability rate
    ([M16](artifacts/experiments/M16-field-grounding/README.md)).
- **M17 — the person decides when two stored values fit one field.** The run stops at
  `AWAIT_CLARIFICATION` before anything is sent or planned. The side panel asks which value, naming
  each candidate only by the label of the field it came from.
  - `checkClarificationAnswer` binds the answer to the question: id, session, origin, view, document,
    field and candidate set, plus expiry. Strict keys mean an answer cannot carry an action, a value
    or a reference.
  - `groundFill` re-checks the choice, and the validator, binder, grant, REFRESH, permit gate and
    VERIFY RESULT all still run.
  - Declining, or any invalid or stale answer, stops the run with nothing filled. Candidates the
    labels cannot tell apart are not offered ("enter the value yourself").
  - W1, product build, real Qwen: one run per scenario (choose first, choose second, decline), all
    as expected ([M17](artifacts/experiments/M17-clarification/README.md)).
  - The eight "failing" product-build perception checks from M16 are the product correctly refusing
    capture without a person's invocation (ADR-0009). `run-extension-loop.mjs` now judges each build
    by its own contract; the evidence build is unchanged at 72/72.
- **M18 — the person declares what each click must do.** The side panel reads the page and offers
  each visible control with only the ADR-0007 results not already true: becomes unavailable, its
  label changes to a typed label, or takes focus. The person picks, then presses Start.
  - `checkDeclaration` binds the answer to the form's session, origin, document, the goal and each
    control's identity.
  - The run re-checks that binding on every turn and immediately before the click, then verifies the
    declared result on a fresh reading. It continues only on CONFIRMED.
  - A click the person did not declare is refused. A control-plane run cannot carry a "person's"
    declaration.
  - No new action, timeout, manifest, CSP or permission change.
  - W1, product build, real Qwen: two declared results CONFIRMED by the page; one NOT_CONFIRMED,
    which stopped the task; two model proposals outside the declaration refused with nothing clicked
    ([M18](artifacts/experiments/M18-declared-outcomes/README.md)).
- **M19 — the person allows one stored-value restoration, in the side panel** (ADR-0014,
  owner-directed).
  - **When:** for a panel-started task, the run asks before each restoration, showing:
    - the site;
    - the field's label;
    - the kind of value;
    - a masked preview, computed in the page realm by `consentPreview`: the last two digits of a
      validated mobile number, otherwise a fixed generic indicator.
  - **Choices:** Allow once or Deny; no reveal and no "always".
  - **The check:** `checkConsentAnswer` binds the answer to the consent id, session, origin,
    document and field, with strict keys. An allow becomes the same one-shot grant; the binder,
    REFRESH, the permit gate and VERIFY RESULT still decide.
  - **Who can answer:** only the side-panel page. Deny, a closed panel, or a forged, replayed or
    stale answer restores nothing and submits nothing.
  - **Normaliser fix:** `normaliseIndianMobile` no longer strips a leading 91 from a bare ten-digit
    mobile, which had been rejecting valid numbers.
  - **Evidence:** W1, product build, real Qwen, harness-operated panel page: allow, deny, stale and
    clarify-then-allow all as expected
    ([M19](artifacts/experiments/M19-panel-consent/README.md)).
- Week-1 capability spikes (in progress).

**The first complete product loop** — `OBSERVE → SANITIZE → VERIFY PAYLOAD → SEND → VALIDATE PLAN →
REFRESH → HUMAN GRANT → REHYDRATE → ACT → VERIFY RESULT`, demonstrated on W2 against a synthetic
fixture in Chrome for Testing 153.0.8010.12
([LOOP-1](artifacts/experiments/LOOP-1-server-orchestrator-planning-view/README.md), 31/31 checks).

- `@pratibimb/reasoner` — the untrusted boundary. `propose` returns `unknown`; `sendToReasoner`
  refuses any handoff the privacy verifier did not produce. Behind it, a deterministic planner for
  the one demo goal. **No model, no network client, no egress**; transport is recorded as
  `IN_PROCESS`.
- `@pratibimb/plan` — the plan contract (`insert`, `click`), the parser that is the only way an
  untrusted response becomes a plan, and `validatePlan`. It owns plan **structure**; it calls
  `@pratibimb/privacy` for every value question and reports privacy's own cause. `redactPlan`
  projects a plan into something safe to keep and display.
- `@pratibimb/orchestrator` — a single-shot state machine. Sequences the existing authorities and
  decides nothing they decide. `REFUSED` is terminal.
- `apps/demo` — the Planning View: five panes rendered from the run's own objects, including the
  exact payload that crossed the boundary. Plus the loopback demo server and fixture.
- `@pratibimb/agent`: a **human-confirmation channel** for the action schema's confirmation tier.
  Unforgeable (module-private `WeakSet`, as `DispatchPermit` is), bound to one node, frame and
  origin, expiring, and spent as the permit is minted. Entirely additive — omitted, every
  pre-existing behaviour is unchanged, and all 173 previous agent tests pass untouched.

**A local model, a real network, and the first proof of what leaves** — W2, Chrome for Testing
153.0.8010.12, 17/17 checks
([LOOP-2](artifacts/experiments/LOOP-2-local-reasoner-egress/README.md)).

- `@pratibimb/egress` — **the single module through which bytes leave this machine**, which is what
  `SECURITY.md` §5's stop condition has always been about. `sendVerified` is the only network call in
  the repository: verified handoff → loopback destination → only declared tokens → value-aware
  residual scan → digest → record → send. The bytes are serialized **once**, and that same string is
  scanned, hashed, recorded and sent, closing "a payload can be mutated between verification and
  transmission" by construction.
- `localModelReasoner` — **Qwen2.5-0.5B-Instruct** (Q4_K_M, revision `9217f5db…`, Apache-2.0
  **verified at that revision**) behind llama.cpp `b10956` on `127.0.0.1`. Download approval was
  **explicit**: work stopped at the boundary E9 was blocked at, reported the requirement, and did not
  proceed without it. **No weights are committed.**
- **Deterministic fallback with a policy, not a catch block.** A model that *failed* may be replaced
  by the deterministic planner; a model that *misbehaved* may not — falling back from a refused plan
  would replace a caught leakage event with a success. `HOSTILE` outcomes stop the run.
- Evidence: the actual HTTP request body carried **four reference tokens and none of the five vault
  values**, and the client's digest matched the receiving service's independently computed one
  (`26d7c09f…`). Bodies are on disk under the experiment's `logs/captures/`.

**The demo, rehearsed until it is boring** — W2, Chrome for Testing 153.0.8010.12, 5 rounds, 15 acts,
no unexpected failures ([DEMO-1](artifacts/experiments/DEMO-1-sih-rehearsal/README.md)).

- **`npm run demo`** starts every service, rehearses all three acts and judges itself against
  declared expectations; **`npm run demo:present`** hands a headful browser to a presenter. The acts
  live in `apps/demo/src/demoScript.ts` as data, so the buttons, the runner and the tests read one
  definition — and an act chooses only **which reasoner answers and at what address**. No security
  layer beneath can tell which act is running.
- **The compromised and honest reasoners listen at the same time** on different ports, so a presenter
  can run success → reset → refusal → reset → outage without restarting anything. The outage act
  addresses a port with nothing behind it, so the connection is genuinely refused; the resulting
  `ERR_CONNECTION_REFUSED` is **asserted as evidence**, because a clean console there would mean the
  act had become a simulation.
- **The digest comparison is now visible during the demo.** The receiving service reports what it got
  in a response header and `sendVerified` records the claim beside its own digest. **This is not a
  security control**: it is read after the send, gates nothing, and a hostile peer could put any
  string in it. The guarantee is unchanged — the bytes that were scanned are the bytes that were sent.
- Presenter material: [`presenter-runbook.md`](docs/demo/presenter-runbook.md) and
  [`judge-cheat-sheet.md`](docs/demo/judge-cheat-sheet.md), whose answers use demonstrated facts only
  and say "NOT PROVEN" where that is the honest answer.

### Fixed in the demo surface
- **The LOOP-1 runner had been failing since the DEMO-1 view change**, on two copy assertions ("no egress
  client", "REFUSED") that the view had rightly stopped printing. They now assert the current, truthful
  wording; every security assertion in that runner is unchanged.
- **The LOOP-2 runner's refusal run had silently become an outage.** The reasoner service started defaulting
  hostile mode to a second port, so LOOP-2 — which addresses the first — hit a dead address, fell back and
  "succeeded". Every mode defaults to the original port again; the SIH runner passes its second port
  explicitly.
- **Entrance animations started from opacity 0**, so a browser that paused them — an occluded window, some
  screen-capture paths — left the boundary rows and the outcome invisible. They now move but never fade.
- **The `local model` checkbox was dead UI** — nothing read it, so ticking it silently ran the
  deterministic planner. A control that implied a path which was not exercised.
- **The footer and pane 5 still claimed "no model, no network client" and "no egress client exists in
  this phase"**, both untrue since LOOP-2.
- **`sweep` threw on a cyclic object**, which mid-demo would have taken out the evidence pane — and a
  caller catching that throw would have been one line from reporting a leak check as clean because it
  could not run. It now prunes cycles and reports that it did.

**The demo, redesigned for the room** — the same three acts and the same pipeline, presented as a story a
judge can follow from across a room.

- The Planning View now leads with the privacy boundary — *On your device* (trusted, the real values) against
  *What the reasoner sees* (untrusted, references only) — then *Model proposes → Client decides → Human
  approval → Restore & act* and one outcome banner. The detailed panes remain underneath as technical evidence.
- Every status on screen comes from `apps/demo/src/story.ts`: pure functions over the run record, tested
  against real runs, including that nothing but the device side ever carries a value.
- Read-only taps let the screen fill in *during* the run; the approval moment used to show empty panes. They
  pass every call through unchanged and catch their own errors, because a throw inside `propose` would be
  read as `REASONER_THREW` and trigger a fallback.

### Notes on the model
- **`MODEL_PATH = EXPERIMENTAL`, `FALLBACK_PATH = VERIFIED`.** A 0.5B model given the bare schema
  produced schema-valid nonsense; it needed enum-constrained decoding and a worked example before it
  planned correctly. Nothing in the security pipeline was weakened to accommodate it.
- Registry status is **`PINNED`**, not `ADOPTED` — adoption still needs QG-03 and a benchmark.
- Latency (6 warm runs, one machine, **not a benchmark**): p50 609 ms, p95 623 ms end to end; the
  reasoner is 2 020 ms cold and every enforcement stage together is under 20 ms.

### Fixed
A hardening review against the frozen contracts, run before any reasoner work, corrected two places
where a layer had become more opinionated than the contract allows (both in `216ed7c`, which also
carries the documentation below):

- **`validatePlan` refused every literal.** `action-schema.md` calls a schema that cannot express a
  non-sensitive literal *"a functional defect"* and answers it with three checks, not a prohibition.
  A literal passing all three is now accepted as a `source: "literal"` step needing no vault
  reference, no rehydration and no human grant. The three refusals — vault echo, PII-shaped literal,
  literal at a redacted field — are unchanged.
- **The orchestrator had a second field classifier**, whose answer fed `bind()`'s class check. It now
  calls `classifyField`, privacy's own D1 channel. `packages/orchestrator/test/boundaries.test.ts`
  scans the source so neither defect can return.

### Documentation
- `docs/architecture/human-confirmation.md` — a PROVISIONAL implementation note for the confirmation
  channel: what it is, where each property is tested, the `HumanConfirmation → DispatchPermit →
  guardedAct` chain and the four structural facts that leave no way round it, and what it cannot
  establish.
- `docs/architecture/prototype-lifetimes.md` — every lifetime and deadline in one table, headed
  **"Prototype TTL; not performance/security-policy proof."**

### Notes
- `EXECUTABLE_ACTIONS` remains `["click"]`; there is no TYPE action. `insert` is a request to the
  **trusted client**, not an agent action: the value never enters a plan, a permit, or the reasoner.
- `packages/privacy` is unchanged and remains the sole privacy authority.
- Three lifetimes (permit, confirmation, grant) are stated by callers with **no measurement behind
  any of them**; ADR-0008 §5 remains open.
- **Extension end-to-end integration of the loop is still NOT PROVEN**, unchanged by LOOP-2. `apps/demo` drives a same-origin
  frame directly; no content script, service worker, offscreen document or side panel took part, and
  the browser evidence ran headless with no extension loaded. A separate headed CfT 153 smoke
  confirms only that the built MV3 host still loads and its service worker boots.

---

## [v0.1.0-foundation] — 2026-09-07

Repository foundation. **No product code.** Governance, frozen contracts and CI
established before the first experiment, so that every subsequent change is reviewable
against a fixed baseline.

### Added

**Governance**
- `AGENTS.md` — assistant entrypoint; FACT / INFERENCE / UNKNOWN policy.
- `CONTRIBUTING.md` — branch, commit, PR, checkpoint and rollback rules.
- `SECURITY.md` — what must never enter the repository; stop conditions.
- `ENGINEERING_PRINCIPLES.md` — 14 principles enforced by the gates.
- `LICENSE` (MIT), `.gitignore`, `.env.example`, `.editorconfig`.

**Governing artifact**
- PratiBimb Engineering Dossier v4.0 (PDF + verified text extraction), SHA-256 pinned
  and checked in CI.

**Frozen contracts**
- Architecture constitution: frozen / replaceable / not-yet-known.
- Security invariants INV-01..INV-25 and Invariant E.
- Threat model — four adversaries and the stated scope limit.
- Coordinate contract, redaction manifest v1.1, action schema and origin policy.
- Benchmark and measurement contract.

**AgentOS engineering layer**
- Seven specialist reviewer contracts; four workflows; quality gates QG-01..QG-06;
  model registry and the 20-cell feasibility matrix (all cells `UNKNOWN`).

**GitHub configuration**
- Pull request template with mandatory security, privacy, evidence and rollback sections.
- Four issue forms (spike, bug, feature, security) and a 28-label taxonomy.
- `CODEOWNERS` with verified ownership only; role mapping deferred, not invented.
- CI: governance verification, secret and PII shape scanning, dossier integrity,
  link and YAML validation, conventional-commit and branch-name enforcement,
  oversized-binary rejection, and a spike-phase guard on `apps/`/`packages/`.

**Tooling**
- `scripts/verify-repo.py` — repository verifier that resolves its own root.
- `scripts/check-secrets.sh` — advisory staged-diff scanner.
- `scripts/sync-labels.sh` — idempotent label sync.

### Notes
- No product implementation started. No model downloaded. No measurement taken.
- Every model in the registry is `PINNED-UNVERIFIED`; every feasibility cell is `UNKNOWN`.
