---
id: W2-J7-STREAM-DETERMINISM
title: "J7 — real-stream determinism characterisation on W2"
status: evidence record
date: 2026-10-02
workstation: W2
evidence: logs/w2-cft-stream-re1.json
---

# J7 — real-stream determinism characterisation (W2)

> **J7 remains OPEN.** `G4 deterministicAcrossPasses` failed in **1 of 24** (DPR 1.0, H1).
> **G1, G2 and G3 passed in all 24.** Nothing was tuned, rounded, clamped or excluded to reach this.
>
> **The headline finding is not the G4 failure.** It is that **the product capture route never produced
> `scaleToCss ≠ 1`** at any of the four requested device scales. J7's own text names a frame with
> `scaleToCss ≠ 1` as the thing to re-screen, so the condition J7 exists to test **was not reachable by
> this route** — exactly as M12 recorded on W1. Four device scales were requested and honoured by the
> page; the stream was CSS-capped to 1280×720 in all four.

## Run identity

| | |
|---|---|
| Workstation | **W2** `LAPTOP-SRCINK2B`, source `registry` |
| OS / CPU | win32 10.0.26200 · AMD Ryzen AI 7 350 w/ Radeon 860M |
| Browser | Chrome for Testing **153.0.8010.12**, headful |
| Node / Playwright | v26.4.0 / 1.63.0 |
| Harness | `tests/browser/extension/run-stream-re1.mjs`, unmodified ("M12 Part Q") |
| Human in the loop | **true** — "a person clicked the extension's toolbar action once per window; nothing in this process produced, simulated or substituted for the click" |
| Gesture wait per window | 589,623 ms · 7,191 ms · 9,232 ms · 24,691 ms |
| TR-01 | `18aaccf9c9cd27656becda13bc0ef31eaa0ea3aef4d45166839f2093561575e8` |
| Baseline compared against | `M8.2/logs/w2-baseline-tr-01.json` (workstation-local) |
| Dataset | "RE-1 held-out visual-text set" v1 — 6 images, 63 strings, 20 sensitive, **306 sensitive glyphs** |
| Evidence build vs product | `routeIdenticalToProduct: true`; `connectSrc` differs only by the collector origin; `noCaptureVisibleTab: true` |
| Production frame egress | **disabled** (unchanged; 30/30 boundary tests pass) |
| Verdict in the record | `verdict: "FAIL"`, `j7: "OPEN"` |

Per-window preflight recorded `noGrantYet: true` and `captureRefusedBeforeGesture: true` — capture was
refused until the person clicked, in every window.

## The matrix — 4 DPRs × 6 images × 3 passes = 72 observations, all completed

`pDPR` is the browser-reported `devicePixelRatio`; `cap` and `s2c` are the browser-reported capture
dimensions and `scaleToCss`. No nominal value is substituted anywhere.

| DPR | img | pDPR | cap | s2c | boxes | G4 pass-det | maxPassDev px | vs baseline: equal | maxCoordΔ px | maxScoreΔ | RE-1 eq | G1 exp/sens | G2 over | G3 share | G1–G3 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.0 | H1 | 1 | 1280×720 | 1 | 11 | **false** | **1.2519** | false | 1.2519 | 0.007074 | true | 0/40 | 0.1792 | 0.02614 | pass |
| 1.0 | H2 | 1 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7137 | 0.105866 | true | 0/64 | 0.3542 | 0.02229 | pass |
| 1.0 | H3 | 1 | 1280×720 | 1 | 7 | true | 0.0000 | false | 1.2506 | 0.006933 | false | 0/47 | 0.1522 | 0.04569 | pass |
| 1.0 | H4 | 1 | 1280×720 | 1 | 8 | true | 0.0000 | false | 2.6461 | 0.140301 | false | 0/45 | 0.1291 | 0.01965 | pass |
| 1.0 | H5 | 1 | 1280×720 | 1 | 7 | true | 0.0000 | false | **0.0000** | 0.009258 | true | 0/51 | 0.2806 | 0.03057 | pass |
| 1.0 | H6 | 1 | 1280×720 | 1 | 13 | true | 0.0000 | false | 2.7141 | 0.100497 | true | 0/59 | 0.3755 | 0.01565 | pass |
| 1.25 | H1 | 1.25 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7346 | 0.065426 | false | 0/40 | 0.1734 | 0.02614 | pass |
| 1.25 | H2 | 1.25 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7137 | 0.107420 | false | 0/64 | 0.3529 | 0.02229 | pass |
| 1.25 | H3 | 1.25 | 1280×720 | 1 | 7 | true | 0.0000 | false | 2.5037 | 0.031436 | false | 0/47 | 0.1507 | 0.04569 | pass |
| 1.25 | H4 | 1.25 | 1280×720 | 1 | 8 | true | 0.0000 | false | 2.6589 | 0.133541 | false | 0/45 | 0.1506 | 0.01980 | pass |
| 1.25 | H5 | 1.25 | 1280×720 | 1 | 7 | true | 0.0000 | false | 1.2570 | 0.025608 | false | 0/51 | 0.2788 | 0.03057 | pass |
| 1.25 | H6 | 1.25 | 1280×720 | 1 | 13 | true | 0.0000 | false | 3.0171 | 0.122413 | false | 0/59 | 0.3726 | 0.01565 | pass |
| 1.5 | H1 | 1.5 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7346 | 0.114052 | false | 0/40 | 0.1732 | 0.02386 | pass |
| 1.5 | H2 | 1.5 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7137 | 0.115443 | true | 0/64 | 0.3542 | 0.02229 | pass |
| 1.5 | H3 | 1.5 | 1280×720 | 1 | 7 | true | 0.0000 | false | 2.7618 | 0.094843 | false | 0/47 | 0.1534 | 0.05042 | pass |
| 1.5 | H4 | 1.5 | 1280×720 | 1 | 8 | true | 0.0000 | false | 2.6589 | 0.135507 | false | 0/45 | 0.1549 | 0.01995 | pass |
| 1.5 | H5 | 1.5 | 1280×720 | 1 | 7 | true | 0.0000 | false | 2.7145 | 0.117118 | true | 0/51 | 0.2806 | 0.03057 | pass |
| 1.5 | H6 | 1.5 | 1280×720 | 1 | 13 | true | 0.0000 | false | 3.0171 | 0.124162 | false | 0/59 | 0.3600 | 0.01437 | pass |
| 2.0 | H1 | 2 | 1280×720 | 1 | 11 | true | 0.0000 | false | 3.0171 | 0.114467 | false | 0/40 | 0.1732 | 0.02386 | pass |
| 2.0 | H2 | 2 | 1280×720 | 1 | 11 | true | 0.0000 | false | 2.7137 | 0.115727 | true | 0/64 | 0.3542 | 0.02229 | pass |
| 2.0 | H3 | 2 | 1280×720 | 1 | 7 | true | 0.0000 | false | 2.7618 | 0.095101 | false | 0/47 | 0.1534 | 0.05042 | pass |
| 2.0 | H4 | 2 | 1280×720 | 1 | 8 | true | 0.0000 | false | 2.6589 | 0.135390 | false | 0/45 | 0.1531 | 0.01995 | pass |
| 2.0 | H5 | 2 | 1280×720 | 1 | 7 | true | 0.0000 | false | 2.7145 | 0.117317 | true | 0/51 | 0.2806 | 0.03057 | pass |
| 2.0 | H6 | 2 | 1280×720 | 1 | 13 | true | 0.0000 | false | 3.0171 | 0.123129 | false | 0/59 | 0.3600 | 0.01437 | pass |

Nothing was discarded, re-run or replaced. There is exactly one formal run; no rerun was needed.

## Gate totals, by the existing definitions

The harness implements the gates as `g1ZeroExposedSensitiveGlyphs`, `g2OverMaskWithinBudget`,
`g3NoBlanketBox`, `g4DeterministicAcrossPasses`. No threshold was invented or changed.

| gate | result |
|---|---|
| **G1** zero exposed sensitive glyphs | **24 / 24 PASS** — 0 exposed of 1,224 sensitive glyphs scored (306 × 4 scales) |
| **G2** over-mask within budget | **24 / 24 PASS** — max ratio 0.3755 |
| **G3** no blanket box | **24 / 24 PASS** — max largest-box share 0.0504 |
| **G4** deterministic across passes | **23 / 24 PASS, 1 FAIL** — DPR 1.0 / H1 |
| G5, G6 | carried over, not re-run: "a property of the runtime, not the capture route" / "structural, unchanged" |

Per window: DPR 1.0 **FAIL** (`g4DeterministicAcrossPasses`); DPR 1.25, 1.5, 2.0 **PASS** on all four gates.

## Determinism findings

### Frame determinism — NOT MEASURABLE from this record

**The harness records no per-pass frame hash.** A pass record carries only
`{route, capture:{w,h,format,bytes,dpr,scaleToCss}, detectorRan, detectorCode, failClosed, detections}`.
`capture.bytes` is the constant 3,686,400 (1280×720×4) in all 72 passes, which is a size, not a digest.

This matters, and it is the one requested measurement that cannot be supplied: **whether repeated
captures were pixel-identical is unknown**, so the G4 failure cannot be *proved* to be either an
inference/runtime determinism issue or a capture/rasterisation difference. Recorded as a gap, not
guessed at. See "What would close J7" below.

### Detector-box determinism

23 of 24 observations: `maxPassDeviationPx` **exactly 0.0000** — byte-identical boxes across all three
passes.

The single exception, **DPR 1.0 / H1**, has a precise and unusual shape:

- **pass 2 and pass 3 are identical to each other**;
- **pass 1 differs from both**, in one box only: `box0.w` is **1.2519 px narrower** in pass 1, with
  sub-thousandth jitter on `x`, `y`, `h` (≈0.0009 px);
- all 11 boxes show small score shifts between pass 1 and passes 2–3, largest **0.00624**;
- all three passes ran the detector, returned 11 detections, `failClosed: false`, `detectorCode: null`.

This is a **first-pass effect, not random per-pass noise**: the run settles after pass 1 and is then
stable.

### Detector-score determinism

Within an observation, score deltas across passes are ≤ **0.00624** and occur only in the DPR 1.0 / H1
cell; every other cell is 0.

### Attribution — INFERENCE, resting on named FACTs

**FACT 1.** Pass 2 ≡ pass 3 exactly; only pass 1 differs (above).
**FACT 2.** Score deltas in that cell reach 6.2 × 10⁻³.
**FACT 3.** ORT's own float non-determinism on this machine was measured at
2.19 × 10⁻⁶ … 1.59 × 10⁻⁵ (`M8.2/logs/w2-baseline-tr-01.json` → `wasmVsNative`, WASM vs native on a
byte-identical tensor).

**INFERENCE.** The observed deltas are **two to three orders of magnitude larger** than this machine's
measured inference noise, and they are structured (one box's width, once) rather than scattered. That
is far more consistent with **pass 1 having captured a different frame** — a compositing/paint settle
on the first `grabFrame` after the stream opens — than with non-deterministic inference on identical
pixels.

**This remains an INFERENCE and must not be promoted.** Confirming it requires per-pass frame digests,
which this record does not contain.

## DPR-specific differences

**Preserved, not excluded, in line with the instruction to keep DPR-specific non-determinism as
evidence.**

- **DPR 1.0 is the only scale where G4 failed**, and the only scale where a first-pass capture
  difference appeared. It is **retained in the matrix and in the verdict**.
- **DPR 1.25 and 1.5 specifically:** both **passed all four gates**, with per-pass deviation 0.0000.
  Their deviation from the *baseline* (max 2.7346 px at 1.25, 2.7618 px at 1.5) is a
  stream-versus-screenshot difference, not a determinism failure.
- **The deltas vs baseline grow with requested DPR and then saturate:** H3 is 1.2506 px at DPR 1.0 and
  2.7618 px at 1.5 and 2.0; H1 is 1.2519 → 2.7346 → 2.7346 → 3.0171. DPR 1.5 and 2.0 produce
  *identical* box sets for H2–H6, despite different `devicePixelRatio`.
- **`scaleToCss` was 1 and capture was 1280×720 at every scale.** Requested device scale changed the
  page's `devicePixelRatio` (1 / 1.25 / 1.5 / 2, all browser-reported) and `captureDpr`, but **not** the
  stream geometry. So the four windows are four *rendering* conditions, not four *capture-scale*
  conditions.

## Privacy / mask-safety

| measurement | value |
|---|---|
| Sensitive glyphs scored | **1,224** (306 per scale × 4 scales) |
| **Sensitive glyphs exposed** | **0** |
| Observations with any exposure | **0 of 24** |
| `noExposedSensitiveGlyph` | true in 24/24 |
| `overMaskWithinBudget` | true in 24/24 (max 0.3755) |
| `noBlanketBox` | true in 24/24 (max 0.0504) |
| `failClosed` | false in all 72 passes — no pass fell back to a whole-region mask |

**What this does and does not support.** It supports: on these six synthetic held-out images, at these
four device scales, through the real gesture-stream route, the redaction masked every sensitive glyph.
It does **not** support any claim of perfect recall or zero leakage in general — six images, one
workstation, one operator, and the harness's own `notAClaim` says so.

The RE-1 **score object** differed from the baseline in **16 of 24** observations (`re1ScoreEqual:
false`). That is a reported comparison, **not a gate**: it covers diagnostic fields such as
`inkAreaMasked` and `bestIouUndilated`, which move when a box edge moves by a pixel. The
safety-critical quantity — exposed sensitive glyphs — was 0 in all 24.

## Anomalies

| # | anomaly | original evidence | treatment |
|---|---|---|---|
| A1 | DPR 1.0 / H1: pass 1 differs from passes 2–3; `box0.w` −1.2519 px; scores ≤ 0.00624 | `cells[0].images[0]` — `deterministicAcrossPasses: false`, `maxPassDeviationPx`, `laterPassBoxes` | **Retained.** Causes G4 FAIL and J7 OPEN. Not re-run, not replaced |
| A2 | `scaleToCss = 1` at all four device scales; J7's named `scaleToCss ≠ 1` not produced | `scaleToCssObserved: [1]`; `notAClaim[1]` | **Retained** as the structural finding |
| A3 | Stream boxes never byte-equal the baseline: **0 of 24**, max 3.0171 px | `vsBaseline` per observation | **Retained.** Reported, not gated |
| A4 | No per-pass frame digest in the evidence schema | pass record keys | **Retained** as a schema gap; blocks attribution of A1 |
| A5 | Window 1 gesture wait 589,623 ms (≈9.8 min) | `cells[0].gesture.waitedMs` | Operator timing only; no effect on measurement |

No cell recorded a `failure`; `detectorCode` was `null` and `detectorRan` true in all 72 passes.

## Verdict

**J7: OPEN / BLOCKED. Not PASS.**

- **G1 PASS, G2 PASS, G3 PASS** — 24/24 each. No security gate failed, so no stop condition on those.
- **G4 FAIL** at DPR 1.0 (1 of 24).
- The harness's own verdict is `FAIL`, `j7: "OPEN"`.
- Nothing was altered to make any gate pass.

This result is **consistent with W1's**: M12's `w1-cft-stream-re1.json` failed G4 in two of four
windows (F-M12-2). W2 fails G4 in one of four. The failure is narrower here but the same class, and the
`scaleToCss = 1` limitation reproduces exactly.

## What would close J7

Neither item is a tuning change, and neither is attempted here.

1. **Per-pass frame digests in the evidence schema** — hash each `grabFrame` result. Without them, the
   repository cannot distinguish inference non-determinism from capture non-determinism, which is the
   distinction J7 turns on. This needs a harness change and a fresh formal run with four more human
   gestures.
2. **An owner ruling on the `scaleToCss ≠ 1` condition** — the product route caps the stream to CSS
   size, so the condition J7's text names cannot be produced by the route the product actually uses.
   M12's decision already asked for this ruling ("rule what evidence would close J7 given a CSS-capped
   route"); it is still outstanding, and W2 does not change it.

Until both are resolved, **B5 / J7 remains OPEN** and no stream-route re-screening claim should be
made.
