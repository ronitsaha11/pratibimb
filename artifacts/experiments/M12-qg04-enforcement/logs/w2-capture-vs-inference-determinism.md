# Capture determinism and inference determinism, measured apart (W2)

**Records:** `w2-cft-capture-determinism.json` (run 1, **contaminated — see §1**) and
`w2-cft-capture-determinism-run2.json` (run 2, clean). **Workstation:** W2 (`LAPTOP-SRCINK2B`) ·
**Browser:** Chrome for Testing 153.0.8010.12, headed · **DPR** 1.0 · **Image** H1 · N = 10 ·
one human toolbar click per run.

**Why.** The formal J7 harness compares three `op: "pass"` calls, and every pass is a complete
capture lifecycle — `perception-realm.ts:689` opens a fresh `getUserMedia` stream, `grabFrame()` takes
exactly one frame, `track.stop()` closes it, and `capture-authority.ts:256` mints a new handle each
time. So G4 measures capture determinism and inference determinism **multiplied together**, and when
it fails neither factor is identified. It failed on W1 at DPR 1.25/H4 and 1.5/H3 (F-M12-2) and on W2
run 1 at DPR 1.0/H1, and passed 24/24 on W2 run 2. This separates the factors.

The pre-registered G4 (`docs/perception/redaction-evaluation.md:185`) is "boxes across two complete
runs; outputs across ≥ 5 inferences per input — byte-identical", and criterion 6
(`docs/perception/text-region-acceptance.md:106`) fixes the input: "two consecutive runs on the same
**fixture**". Neither addresses a re-captured frame.

## 1. Run 1 was contaminated, and it is kept

Run 1 left the harness's instruction banner on the page during capture. The banner is ink, so TR-01
detected it: 13 boxes where the fixture yields 11, with exactly two boxes in the banner's band
(y 611.31 and y 632.92). Capture determinism survived it — the banner was static across all ten
passes — but every cross-record comparison was contaminated, and run 1's absolute box counts and its
live-vs-fixture comparison are not usable.

Run 1's record is **kept unchanged**. One observation in it is not contaminated and matters: **two
distinct frame digests in ten passes** (pass 8 differed; all capture metadata identical), which is the
only direct observation of capture variation anywhere in this repository.

Run 2 removes the banner **before** the first capture and proves it: the DOM is checked to hold
nothing but the held-out image at 1:1 at the origin (`pageClean`, all true), and the detector is used
as the witness — `bannerContaminationGone: true`, zero boxes in the band the banner occupied.

## 2. Capture determinism — observed once, NOT characterized

| | run 1 (contaminated) | run 2 (clean) |
|---|---|---|
| distinct frame digests in 10 passes | **2** | **1** |
| differing passes | 1 (pass 8) | **0** |
| capture metadata identical across passes | yes | yes — one tuple: `1280×720`, 3,686,400 B, `live-bitmap`, dpr 1, `scaleToCss` 1, `GESTURE_STREAM` |

**FACT.** In run 2, ten fresh streams over an unchanging page produced one byte-identical frame,
`58acf177fb82e3c5…`, and byte-identical boxes on all ten passes.

**FACT, and stronger than it looks.** That digest is **identical to J7 run 2's H1 at DPR 1.0**, and
the boxes are byte-identical to it too — a different browser launch, a different human gesture, a
different session. So 13 captures of this cell across two sessions agree bit-for-bit.

**FACT.** In run 1, pass 8 produced a different frame from the other nine, with identical capture
metadata.

**What is NOT established.** A rate. The only capture variation observed in this experiment occurred
in the run that had an extra painted element, and zero variation was seen in ten clean passes. Two
readings remain open and this evidence does not choose between them:

- the banner's presence contributed to the instability; or
- the variation is sporadic at a rate low enough that ten clean passes would usually miss it — which
  is consistent with the formal runs' 3 failures in 72 clean cells.

So: **capture non-determinism exists as a mechanism on this route and build — it was observed. Its
rate is UNKNOWN, and nothing here measures it.** The earlier figure of "1 in 10" is run 1's count in
run 1's configuration and must not be quoted as the route's rate.

## 3. Inference determinism — ESTABLISHED

**FACT.** Run 2, Phase B: ten inferences over **one retained real captured frame**, byte-identical.
`distinctDetectionSets: 1`, `everyOutcomeOk: true`, run ids 1–10, 11 detections each.

The retained buffer is proven to be the captured buffer rather than assumed to be: it is digested in
the realm that holds it (`op: "frame-sha"`) and compared with the pass's own `rawRgbaSha256` —
`retainedBufferIsTheCapturedFrame: true`, same 3,686,400 bytes and same 1280×720. A mismatch is a
stop condition in the harness, not something it works around.

**FACT.** Run 2, Phase C, the frozen H1 PNG — criterion 6's "same fixture", literally: ten
inferences, byte-identical, `distinctDetectionSets: 1`. Its boxes are **fully identical to the W2
TR-01 baseline**, which is the control working.

**FACT.** Run 2, Phase A: all ten passes shared one frame and produced byte-identical boxes
(`boxesIdenticalWhereverTheFrameWas: true`). In run 1 the same held within each digest group — the
nine passes sharing a frame agreed, and the one odd frame produced its own output. **No exception was
found in either run.**

Taken together: across both runs, 29 inferences in 4 groupings, the detector output is a function of
the frame. The pre-registered "≥ 5 inferences per input" is satisfied at N = 10 on a real captured
frame and at N = 10 on the frozen fixture.

## 4. Historical J7 interpretation — stated exactly

The experiment demonstrates that **capture non-determinism exists as a mechanism on this W2
route and build**, and that the inference path is bit-exact on a fixed frame.

**It does NOT retroactively prove the cause of any historical cell.** W1's DPR 1.25/H4 and 1.5/H3 and
W2 run 1's DPR 1.0/H1 were recorded **without frame digests**, so no measurement taken here can be
applied to them as FACT, and none is. Those failures are **not** stated to be definitively caused by
capture. What can be said: the mechanism that would explain them has now been observed to occur at
least once, and the competing explanation — a non-deterministic inference path — is contradicted by
29 inferences with no exception. That is an INFERENCE about the historical cells and stays one.

W1's record also predates `laterPassBoxes`, so whether its two failures shared run 1's pass structure
is **UNKNOWN** and is not recoverable from it.

## 5. G-3 — OPEN

**G-3 is not closed, and the banner's removal does not bear on it.** G-3
(`../../M9-adoption-review/provider-contract.md:80`) asks whether the product path's decoded RGBA is
pixel-equivalent to the PNG screenshot path's. This experiment compares **detector output**, on one
image at one device scale, which is a weaker quantity: equal outputs would not prove equal pixels.

One measurement is added, recorded as data:

| comparison (H1, DPR 1.0, 11 boxes each) | geometry | max score difference |
|---|---|---|
| live captured frame vs frozen fixture PNG | **byte-identical, 0.000000000 px** | 0.009447221 |
| frozen fixture PNG vs W2 TR-01 baseline | **fully identical** | 0.000000000 |

**INFERENCE from two FACTs** — that inference is deterministic on fixed bytes (§3), and that the live
frame and the fixture PNG produced different scores in the same host and session: **the two pixel
sources are not byte-identical.** Their box geometry nonetheless agreed exactly on this image at this
scale. This is one image at one device scale and is not a pixel comparison, so **G-3 remains OPEN**.

## 6. G-2 / scaleToCss — NOT EXERCISED

`scaleToCss` was **1** in all 20 capture passes across both runs, recorded exactly as observed. The
route was not changed and no attempt was made to force `scaleToCss ≠ 1`.

G-2's literal condition — "re-screen on frames where `scaleToCss ≠ 1`" — was therefore **not
exercised**, and **G-2 is not satisfied**. The route constrains the stream to the CSS viewport by
construction (`perception-realm.ts:689`–`695`, for the documented 1920×1200-for-1280×720 refusal), so
the condition does not arise on it. Whether that closes G-2 is ADR-0012 §14.6, which §16 of that ADR
records as **not decided**.

## 7. Integrity

No production code changed. `apps/extension/probe/tr01.ts` is compiled only when `TR01_PROBE=1`
(`wxt.config.ts:143`); product builds get `probe/tr01-absent.ts`. Both runs refused to start unless
the evidence build's capture route was byte-identical to the product's
(`routeIdenticalToProduct: true`), its `connect-src` differed only by the pinned collector, and
`noCaptureVisibleTab` held. The only live-pixel path used is the product's own
`getUserMedia`/`grabFrame`; no screenshot, `captureVisibleTab` or `toDataURL` is used for any measured
frame. Detector, model pin `18aaccf9…1575e8`, thresholds, preprocessing, crop geometry, privacy
logic, CSP, permissions, viewport and ORT version are the committed ones.

**Not a claim.** One image, one device scale, one window, one operator, two runs. This does not
measure the route's capture-variation rate, does not transfer to other images or scales, and does not
close J7.

## 8. What J7 still needs

1. A **characterized capture-variation rate** on the clean path — many passes, enough to bound it, or
   a determination that it is not reproducible under controlled conditions.
2. An **owner ruling on ADR-0012 §14.6**: what evidence closes J7 given a CSS-capped route. Until
   that exists, neither "J7 PASS" nor "J7 BLOCKED" follows from the specification, because the
   specification defers the question.
3. A decision on whether G4 is meant to assert a property of the **inference path** — which §3
   establishes — or of the **capture route including each pass's fresh frame**, which §2 shows it does
   not have.
4. **G-2** and **G-3** as above: both open, neither addressed by changing this harness.
