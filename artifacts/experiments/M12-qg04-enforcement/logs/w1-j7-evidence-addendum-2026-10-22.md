# J7 / B5 — evidence addendum: the recovered W1 run of 2026-10-01

**Date of this addendum:** 2026-10-22. **Additive only.** No existing record, gate, threshold,
specification or decision was changed to produce it, and **no experiment was run**: every figure below
was re-derived from records already on disk.

**Why it exists:** [`w2-j7-owner-decision-package.md`](w2-j7-owner-decision-package.md) (2026-10-03) and
[`w2-j7-closure-audit.md`](w2-j7-closure-audit.md) were written on W2 **without** one W1 run. That run
was recorded on W1 on 2026-10-01 and never pushed: it was found uncommitted during the W1 recovery of
2026-10-22. The package's evidence inventory is therefore incomplete. This addendum adds the missing
run, states exactly what it supports and what it does not, and **decides nothing**.

---

## 1. The run and its files

| item | path |
|---|---|
| formal record (real gesture route) | `../../M13-csp-and-stream-determinism/logs/w1-cft-stream-j7.json` |
| dry-run record (degraded route, **not** stream evidence) | `../../M13-csp-and-stream-determinism/logs/w1-cft-stream-j7-dryrun.json` |
| harness that produced both | `tests/browser/extension/run-stream-j7.mjs` |
| test-build probe ops it used | `apps/extension/probe/tr01.ts` (`j7-reset`, `j7-end`, `j7-redetect`, and the pixel-diff hook in `onMaskPlanned`) |

**Provenance (FACT).**

- The formal record's `recordedAt` is `2026-10-01T18:06:18.205Z`; the first of four human toolbar
  clicks was observed at `18:04:03.809Z`.
- The dry run was recorded at `18:00:40.320Z`.
- The harness file is dated `17:57:12Z` and the probe file `17:51:55Z`. Both predate both records.
- The probe that produced the records was `8d6b3c1`'s `apps/extension/probe/tr01.ts` plus the W1
  patch. This was verified byte for byte (line endings normalised) against the recovery backup,
  SHA-256 `27bbab04…`.
- The published probe is the same W1 patch applied on top of W2's later `retain-raw` / `frame-sha`
  addition (`8bf3585`). Its 87 changed lines are identical to the backup patch. **The published probe
  file is therefore not byte-identical to the one that produced the record.** The W1 operations it
  carries are.
- The four record files, the harness and the patch were recovered unmodified. Their checksums match the
  recovery backup.

---

## 2. Scope the records support

| dimension | value |
|---|---|
| machine | **W1**, `LAPTOP-6E14K34L`, Intel Core 7 240H / RTX 5050 Laptop, Windows 11 |
| browser | Chrome for Testing 153.0.8010.12, headed |
| route | `GESTURE_STREAM` on all 72 observations, one real toolbar click per window (`realGesture: RECORDED` ×4) |
| build | the evidence build (`TR01_PROBE=1`). The record asserts its capture route is the product's, `connect-src` aside (ADR-0013), and that the product bundle carries no frame sender. |
| detector | TR-01, ONNX SHA-256 `18aaccf9…` (the frozen pin); thresholds, post-processing and canonical geometry unchanged |
| fixtures | the frozen held-out set H1–H6, shown 1:1 at (0,0); the W1 renders, whose PNG digests equal those in W1's M12 record |
| device scales | 1, 1.25, 1.5, 2 (page `devicePixelRatio` recorded as each) |
| matrix | 4 scales × 6 images × 3 passes = **72 observations**, all recorded; plus 5 inference re-runs per series (24 series) |
| runs | **one complete run** |

Nothing here extends to W2, other builds, other pins, other pages or other machines.

---

## 3. What the records contain — re-derived from the per-pass data

All of the following are **FACT**, computed from the `cells[].images[].passes[]` and
`cells[].images[].redetect` entries rather than read from the harness's own summary.

**Capture.**

- **Digests:** 72 of 72 observations carry a 64-hex `rawRgbaSha256` of the raw frame, taken before
  masking.
- **Within each series:** all three digests are equal in **24 of 24** series, i.e. 48 of 48 later passes
  are digest-identical to pass 1. The in-realm pixel difference is **0 changed pixels** against pass 1
  and against the previous pass on all 48.
- **Across device scales:** the same image gives a **different** frame at every scale: 24 distinct pass-1
  digests across 24 series.
- **Dimensions:** every capture is 1280×720 at **`scaleToCss = 1`**.

**Inference.**

- For every series, TR-01 ran **5 more times on pass 1's exact raw bytes**: `referenceIsPass1RawFrame`
  in 24 of 24.
- The 5 outputs are mutually identical in **24 of 24** series.
- They are identical to the product pass-1 detections in **24 of 24**.
- These re-runs used the probe's own TR-01 host: the same worker script, model pin and runtime as the
  product host, but a separate instance. That is the same pattern W2's `retain-raw` + `detect` uses.

**Detections across repeated captures:** identical to pass 1 in **48 of 48** later passes.

**RE-1 on each pass** (the frozen scorer, unchanged):

| gate | result |
|---|---|
| G1 — no exposed sensitive glyph | 72 of 72; **0 exposures** over 3,672 sensitive-glyph instances (306 per pass over H1–H6 × 3 passes × 4 scales) |
| G2 — over-mask ratio within budget | 72 of 72 |
| G3 — no blanket box | 72 of 72 |

The detector ran on every pass, and none was fail-closed.

**Safety during the run:** 0 foreign fetches in every window. Every offscreen fetch (2 per window) went
to the extension's own origin. The service worker saw no pixels.

**Against W1's M8.1 screenshot-derived boxes:** the record carries pass-1 box deltas against
`M8.1-visual-text-screening/results/tr-01-run1.json`, itself a W1 record.

- At DPR 1, H1's geometry is **identical (0 px)** and its scores differ by at most **0.008938599**.
- H2–H6 at DPR 1, and every image at the other scales, differ by up to **3.0171 px**.

---

## 4. What the records' own labels say, and why they are not gate status

- **The formal record carries `"j7": "CLOSED"`.** This label is **not** a statement that J7's closure
  requirements are met:
  - it applies the harness's own rule (G1–G3 pass, and three fresh captures per image give identical
    boxes everywhere);
  - [`w2-j7-closure-audit.md` §1](w2-j7-closure-audit.md) establishes that **no repository text
    authorises that reading of G4**;
  - and §2 and §4 there show that J7's closure also depends on the G-2 and G-3 rulings, which this run
    cannot supply.
- **The label is preserved** because the record is original evidence. It is not edited, and it must
  not be quoted as J7 status. The authoritative status is in §6 below.
- **The dry-run record says `"j7": "NOT ASSESSED (dry run)"`.** Its non-1 `scaleToCss` values (0.8,
  0.667, 0.5) come from the degraded `WORKER_FRAME` route and are **not** product-path stream evidence.
  This is the same status W2's dry run has (closure audit §4).

---

## 5. What the run adds to each open question

**G1 (RE-1), product-path stream frames on W1.**

- 0 of 3,672 exposed across 72 observations at four scales.
- This is a finite-sample result for this set, machine and build, and **not** a claim of perfect recall
  or of zero leakage in general.

**G-2 (coordinates, `scaleToCss ≠ 1`). Not exercised.**

- `scaleToCss = 1` on all 72 observations.
- The decision package counts 267 GESTURE_STREAM observations, all at `scaleToCss = 1`. This run adds
  72 more, and still none on the product route is at a value other than 1.
- **The condition remains unexercised. Decision 2 is unchanged.**

**G-3 (pixel source). Re-measurement clause: more evidence. Equivalence clause: still OPEN.**

- *Re-measured on product-path frames* (G-3's second clause): this run is a further re-measurement, on a
  second machine and four scales (§3).
- *Pixel equivalence between the two sources* (G-3's first clause): **still not measured.**
  - This run compares detector **output**, not RGBA.
  - At H1/DPR 1, W1 reproduces W2's observation on a second machine: identical geometry, scores
    differing by 0.0089 on W1 (W2: 0.0094).
  - Because fixed-input inference is deterministic (§3), non-identical scores and the 2.5–3.0 px box
    differences on H2–H6 **support the INFERENCE that the stream frame and the screenshot are not
    byte-identical.**
  - That is an inference, not the direct comparison G-3 names.
- **Decision 3 is unchanged.**

**G4 / Criterion 6. Readings A and B are both informed; neither is chosen here.**

*Reading A* (deterministic output for identical pixel input):

- This run supplies, for **H1–H6 at four device scales on W1**, a retained real captured frame with
  5 identical inferences each, equal to the product pass.
- The package's line "1 of 6 held-out images has been measured that way" (§Decision 1, *Corrected
  status*) was written without this run; on W1 all six now have been.
- **It is one complete run.** RE-1 G4 as pre-registered (`docs/perception/redaction-evaluation.md:185`)
  reads "boxes across **two complete runs**; outputs across ≥ 5 inferences per input". **This run does
  not supply a second complete run**, so it does not by itself satisfy that wording, even under
  reading A.

*Reading B* (fresh-capture reproducibility):

- In this run, all 48 repeated captures were digest-identical and gave identical boxes.
- **The same machine's earlier run that day** (W1, M12, `w1-cft-stream-re1.json`, recorded
  `2026-10-01T16:08:03Z`, a different build) recorded box movement across fresh captures in **2 of 24**
  series (DPR 1.25 / H4, DPR 1.5 / H3), **without frame digests**.
- So on W1, across two complete stream runs, fresh-capture output was not reproducible in every series.
- The cause of the earlier movement remains an **INFERENCE** (closure audit §3).
- W2's 2/100 capture-variation rate at H1/DPR 1 (`w2-cft-capture-determinism-run3.json`) is a W2 FACT
  and is not transferred here.

*Combined:* this run neither establishes nor rules out reading B. It strengthens the evidence that the
detector is deterministic over identical bytes, now on a second machine.

**Decision 1 is unchanged.**

**B5 / ADR-0012 §14.6.** Nothing here selects the closure route (measurement, or B2's OCR-verifier
backstop). **Decision 4 is unchanged.**

---

## 6. Authoritative status after this addendum (unchanged)

| item | status |
|---|---|
| G1 on product-path frames | passing on every recorded W1 and W2 product-path observation; finite-sample |
| G-2 (`scaleToCss ≠ 1` on the product route) | **NOT EXERCISED** — owner ruling required (D2) |
| G-3 pixel equivalence | **OPEN** — direct RGBA comparison not run (D3) |
| G4 semantics | **OWNER DECISION REQUIRED** (D1); under reading A, a second complete run is still missing |
| B5 / J7 | **OPEN** (D4) |

**Owner decisions, unresolved:** D1 (G4 semantics), D2 (G-2 and the CSS-capped route), D3 (G-3: direct
pixel measurement or not), D4 (close B5 by measurement or by B2's backstop). The package's statement
that no further experiment is launched before the owner rules **still applies**.

---

## 7. Other W1 evidence published alongside

`../../M8.2-qg03-visual-text-feasibility/logs/w1-fixture-integrity.json` (2026-10-22, recovery) records
W1's M8.2 fixtures being regenerated into the per-workstation layout `models/fixtures/W1/` and verified
against M8.1's immutable W1 record (`mode: VERIFY`, `allMatchBaseline: true`).

**What it covers:**

- TR-01 and TR-02, each on 8 inputs (`synthetic`, `dev`, H1–H6);
- input tensor and native-output hashes, both `equalsBaseline` and `nativeEqualsBaseline` true on 16 of
  16, and `nativeDeterministic` on 16 of 16;
- re-measured held-out geometry on H1–H6;
- the 7 screenshot digests.

**Independent re-check (2026-10-22): 71 of 71.**

- 16 + 16 hashes against M8.1's W1 records;
- 32 git-ignored fixture files on disk against the recorded digests;
- 7 PNGs.

The fixture files themselves stay git-ignored (`models/`).
