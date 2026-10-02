# J7 run 2 — the real-frame digest, and what it says about the run-1 G4 failure

**Record:** `w2-cft-stream-re1-run2.json` · **Workstation:** W2 (`LAPTOP-SRCINK2B`, AMD Ryzen AI 7 350) ·
**Browser:** Chrome for Testing 153.0.8010.12, headed · **Recorded:** 2026-10-02T11:50:08Z ·
**Observations:** 4 DPRs × 6 images × 3 passes = **72**, human toolbar click once per window, four clicks.

Run 1 (`w2-cft-stream-re1.json`, unchanged by this run and byte-identical) recorded boxes but not the
frame, so its single G4 failure — H1 at DPR 1.0 — could not be attributed: a differing box set is
equally consistent with a non-deterministic runtime over one frame and with two different frames.
The evidence now carries `capture.frameSha256` per pass, taken over the RGBA buffer TR-01 actually
inferred on. This is what it showed.

## 1. The instrument

**FACT.** 72 of 72 passes carry a 64-hex `capture.frameSha256`. None is null.

The digest is taken inside the realm that holds the pixels — `apps/extension/probe/tr01.ts`, in the
`onMaskPlanned` hook `sanitizeFrame` fires after both detectors have read the buffer and before the
mask overwrites a byte — and only the hex string crosses to Node. It is not recomputed from a
screenshot, an encoded WebP, the dimensions or the byte count, and it *cannot* be computed in Node:
the service worker never receives frame pixels, which is itself an enforced gate. The probe already
computed this digest on every pass, including in run 1; the harness discarded it. Nothing in the
extension changed to obtain it.

**FACT that the digest is over pixels, not metadata.** At each device scale the six held-out frames
share width, height, byte count (3,686,400), dpr and scaleToCss exactly; only their pixels differ.
Their digests are 6 distinct of 6 at every one of the four scales — 24 of 24, zero collisions. A
digest over any recorded field other than the pixels would have collided six ways.

## 2. Run 2, every cell

**FACT.** 24 of 24 cells: the three passes' frame digests are identical **and** the three passes'
boxes are byte-identical. Case **C** in all 24. `maxPassDeviationPx` is 0 everywhere.

| DPR | G1 exposed | G2 max over-mask | G3 max box share | G4 | frame identical across passes |
|---|---|---|---|---|---|
| 1.0 | 0 / 306 | 0.3755 | 0.0457 | 6/6 | 6/6 |
| 1.25 | 0 / 306 | 0.3726 | 0.0457 | 6/6 | 6/6 |
| 1.5 | 0 / 306 | 0.3600 | 0.0504 | 6/6 | 6/6 |
| 2.0 | 0 / 306 | 0.3600 | 0.0504 | 6/6 | 6/6 |
| **total** | **0 / 1224** | **0.3755** | **0.0504** | **24/24** | **24/24** |

Capture was `1280x720`, 3,686,400 B, `scaleToCss` 1 in all 72 passes; route `GESTURE_STREAM` in all 72.

**INFERENCE, resting on §2.** Given a bit-identical input frame, the UI head → TR-01 → fail-closed
plan → canonical geometry path produces bit-identical boxes and scores on this machine. 24 frames,
72 passes, zero divergence. This is the proposition run 1 could not test.

## 3. H1 at DPR 1.0 — the cell that failed G4 in run 1

**FACT, run 2.** Three identical digests, three identical box sets:

```
pass 1  58acf177fb82e3c5ec6152311b68aea13c9887be468b9055a5be188d6d5220e8
pass 2  58acf177fb82e3c5ec6152311b68aea13c9887be468b9055a5be188d6d5220e8
pass 3  58acf177fb82e3c5ec6152311b68aea13c9887be468b9055a5be188d6d5220e8
```

11 detections in each pass, `deterministicAcrossPasses: true`, `maxPassDeviationPx: 0`, G1 0/40
exposed, gates PASS. **The run-1 failure did not recur.**

**FACT, run 1, re-read.** Its failure was not random jitter. Pass 2 and pass 3 were identical to each
other and both differed from pass 1: all 11 boxes' scores shifted (1e-5 to 6e-3) and box[0]'s geometry
moved 1.2519 px. A tie-break in post-processing would not move every score.

**FACT, the decisive one.** Run 1's pass 2/3 box set is **byte-identical to all three of run 2's
passes**, scores included:

```
baseline  box[0]  x 37.73622047244094  w 322.02755905511805  score 0.7450281191859546
run1 p1   box[0]  x 37.73715415019762  w 320.77569169960470  score 0.7379544405000550   <- the outlier
run1 p2/3 box[0]  x 37.73622047244094  w 322.02755905511805  score 0.7355808982307591
run2 p1-3 box[0]  x 37.73622047244094  w 322.02755905511805  score 0.7355808982307591
```

That steady state is now **five independent observations** — run 1 passes 2 and 3, run 2 passes 1, 2
and 3 — across two browser launches, two separate human gestures and two processes, bit-identical.
Run 1's pass 1 is the single outlier in eight observations of this cell.

**Classification: capture variation (Case B), by inference — not inference/runtime non-determinism.**
The reasoning: §2 establishes directly that a fixed frame yields a fixed box set, which excludes
Case A as an explanation; and the surviving explanation for a shifted box set is a shifted input
frame. The anomaly sits on the **first pass after stream start**, which is where a frame from a
different moment of page paint would land.

**This is INFERENCE and must not be recorded as FACT.** Run 1 carries no digest, so its pass-1 frame
cannot be compared with its pass-2 frame. The digest closed the measurement gap, but the anomaly did
not recur while the instrument was in place, so the attribution rests on the structure of the run-1
numbers plus run 2's determinism evidence, not on a direct frame comparison. Direct confirmation
requires a run in which a first-pass divergence recurs *with* digests recorded.

## 4. A run-1 anomaly that the digest does close

Run 1 reported `identicalAcrossWindows: false` for all six images and could not say why. Run 2
reproduces it (`false` for all six) and now attributes it:

**FACT.** For every one of the six images, the four device scales produce **4 distinct frame digests
of 4**, at identical capture dimensions, identical byte count and `scaleToCss` 1 throughout.

**INFERENCE.** The page is rasterised at the device scale and the stream is capped back to CSS size,
so the pixels delivered at DPR 1.0, 1.25, 1.5 and 2.0 genuinely differ. Boxes differing across
windows is therefore capture variation across device scales, not non-determinism. The box deviation
from this workstation's baseline grows accordingly: 0.000–2.714 px at DPR 1.0 against 2.659–3.017 px
at DPR 2.0.

## 5. Privacy

**FACT.** 0 exposed sensitive glyphs of 1224 (4 windows × 306), in all 72 passes. Every pass ran the
detector and none failed closed. G2 over-mask stayed in budget with a maximum of 0.3755; G3's largest
single box covered at most 0.0504 of its region, so no blanket box.

**Not a claim.** Six images, one workstation, one operator. RE-1 bounds exposure on this set; it is
not a recall claim beyond it.

## 6. scaleToCss

**FACT.** `scaleToCssObserved: [1]`, in all 72 passes, at all four device scales. The product route
caps the stream to CSS size, so this was observed and not chosen; nothing here attempted to force a
frame with `scaleToCss != 1`. That remains a separate owner/specification question and was not
touched by this run.

## 7. Disposition

**Strictly by the existing G1–G4 definitions, unchanged:** every image in every window passes G1, G2
and G3, and its three passes are identical (G4). The record's own verdict is `PASS` with
`j7: "RE-1 CRITERIA MET ON STREAM FRAMES"`. G5 and G6 are carried over, not re-run.

**The cross-run fact that the definitions do not capture, stated plainly:** run 1 and run 2 disagree.
Run 1 observed a genuine G4 failure in 1 of its 24 cells on this same machine, build and model pin.
G4 as defined ("three passes identical") has therefore been observed false once in 48 cells across
two formal runs. Run 2 does not retract run 1. What run 2 establishes is *where* the non-determinism
is not: it is not in the inference path, which is bit-exact on a fixed frame in 24 of 24 cells.

Whether J7 closes on run 2 is an owner decision, because it turns on whether G4 is meant to assert a
property of the inference path — which run 2 supports directly — or of the capture route including
its first frame after stream start, which run 1's outlier indicates it does not have. This document
does not resolve that and does not alter the gate definitions to resolve it.

## 8. Provenance

Node v26.4.0, Playwright 1.63.0, headed Chrome for Testing 153.0.8010.12 at
`C:\Users\OMEN\pratibimb-browsers\cft-153.0.8010.12\chrome.exe`. TR-01 pin
`18aaccf9c9cd27656becda13bc0ef31eaa0ea3aef4d45166839f2093561575e8`. Evidence route identical to the
product route (`routeIdenticalToProduct: true`), differing only by the pinned collector in
`connect-src`; `noCaptureVisibleTab: true`. Gesture waits 137.3 s, 4.5 s, 9.1 s, 9.1 s.

Nothing was tuned. No detector threshold, preprocessing step, crop geometry, model weight, privacy
rule, CSP or permission changed for this run; the only change was that the harness stopped discarding
a digest the probe already produced. Run 1's record is byte-identical to its pre-change state.

---

## Correction 2026-10-02 — the mechanism, not the classification

§3 above describes the run-1 anomaly as "capture variation on the **first frame after stream
start**", and says it "sits on the **first pass after stream start**, which is where a frame from a
different moment of page paint would land". **That mechanism statement is wrong and is corrected
here.** The text above is left exactly as written; this section supersedes it.

**What the implementation does.** Every formal pass is a complete, independent capture lifecycle:

- `tests/browser/extension/run-stream-re1.mjs:196` issues one `op: "pass"` per pass;
- that reaches `perceive()` (`apps/extension/probe/tr01.ts:518` → `apps/extension/host-lib/perception-realm.ts`);
- inside it (`perception-realm.ts:689`–`708`) a **fresh `getUserMedia` stream is opened**,
  `ImageCapture.grabFrame()` takes **exactly one frame**, and `track.stop()` closes the track —
  *"One frame, then the tab stops being captured."*
- a **new handle is minted per capture** (`apps/extension/host-lib/capture-authority.ts:256`, where
  the `issued` set refuses a reused handle).

So **there is no privileged pass-1 stream frame.** All three passes are the first — and only — frame
of their own fresh stream. Pass 2 and pass 3 are not "later frames of a settled stream"; they are
separate streams, each grabbed at its own moment.

**What follows.** The run-1 anomaly landing on pass 1 is a position in the record, not a property of
the mechanism: any pass could exhibit it, because every pass is structurally identical. The
"first-frame settle" reading also implies a remedy that would not work — warming up before pass 1
cannot stabilise passes 2 and 3, which re-open the stream regardless.

**The classification is unchanged and remains an INFERENCE.** Capture variation rather than
inference non-determinism is still what the evidence favours, for the reason given in §2: a
bit-identical frame produced a bit-identical box set in 24 of 24 cells. What changes is only the
mechanism attached to it — "a freshly opened tab stream's single grabbed frame need not be the same
compositor output every time", not "the first frame of a run is unsettled". No new evidence has been
taken, so nothing here is promoted to FACT.

**Also recorded for completeness.** W1's formal run failed G4 at DPR 1.25 (H4) and DPR 1.5 (H3)
(F-M12-2, `../decision.md:31`), not at DPR 1.0/H1. Across the three formal runs the failing cell
differs every time and 3 of 72 cells failed, so run 2's 24/24 is consistent with a sporadic
low-rate event and is **not** evidence that the phenomenon has gone. W1's record predates
`laterPassBoxes`, so whether its two failures shared run 1's pass-structure is **UNKNOWN** and
cannot be recovered from it.
