# J7 / B5 — owner decision package

**For:** the human architect, identified in `docs/adr/ADR-0002-t1-capture-format-policy.md:20` as
**ronitsaha11**, per `docs/adr/README.md:72` ("The human architect approves or rejects. No agent
approves its own ADR.").

**Why this exists:** ADR-0012 §14.6 asks the owner to define "the evidence required to close J7 for
frame egress", and §16 records that it is **not decided**. Four questions are undecided; until they are
answered the next technical action is ambiguous. This document makes them precise. **It does not
recommend an answer to any of them.**

**Status of the evidence:** the capture-variation characterization experiment is complete. That is not
the statement "J7 is closed". No experiment was run to produce this document.

**Supporting records:** `w2-cft-stream-re1.json` (J7 run 1), `w2-cft-stream-re1-run2.json` (J7 run 2,
with per-pass frame digests), `w2-cft-capture-determinism.json` (contaminated, kept),
`-run2.json` (clean), `-run3.json` (clean, 100 passes), `w2-j7-closure-audit.md` (the specification
audit and its 2026-10-03 correction), `w2-cft-stream-re1-dryrun.json` (degraded route).

---

## DECISION 1 — G4 semantics

### The exact authoritative language

`docs/perception/text-region-acceptance.md:106`, Criterion 6 — determinism:

> "Two consecutive runs on the same **fixture**, same build, same machine must produce **identical**
> region counts and identical boxes. A detector whose output moves between runs cannot be the basis of
> a redaction decision."

`docs/perception/redaction-evaluation.md:185`, RE-1 G4:

> | **G4 — deterministic** | boxes across two complete runs; outputs across **≥ 5 inferences per
> input** | **byte-identical** | Carried over (criterion 6). A redaction decision that moves between
> runs cannot be verified. |

`docs/perception/redaction-evaluation.md` §4, the scope rule:

> "Every gate must hold on **every** image. An average would let one leaking image hide behind five
> clean ones."

`artifacts/experiments/M9-adoption-review/decision.md:26`, J7:

> | J7 | **product-path re-screening** (G-2, G-3) | RE-1 on frames from the real capture path (stream
> `grabFrame`, `scaleToCss ≠ 1`), not PNG screenshots | pixel and coordinate equivalence UNKNOWN |

### The ambiguity

- Criterion 6 names the input as **the same fixture** — a fixed artifact.
- RE-1 G4 says **"≥ 5 inferences per input"** and inherits the fixture semantics explicitly: "Carried
  over (criterion 6)".
- J7 requires **RE-1 to be re-measured on frames from the real capture path**, where there is no
  fixture.
- The existing J7 harness takes a **fresh capture on every pass**: `run-stream-re1.mjs:196` issues one
  `op: "pass"` per pass; `apps/extension/host-lib/perception-realm.ts:689` opens a new `getUserMedia`
  stream, `grabFrame()` takes exactly one frame and `track.stop()` closes it;
  `apps/extension/host-lib/capture-authority.ts:256` mints a new handle each time. So each pass may
  have a **different pixel input**, and measurement shows that 2 in 100 do.

No document states which quantity is "the input" once the fixture is replaced by a live capture.

### The three choices

#### A — G4 means deterministic perception for identical pixel input

| | |
|---|---|
| **Current evidence establishes** | Deterministic inference over identical real captured bytes (10/10, two runs) and over the frozen fixture (10/10, two runs); every identical-digest group produced identical detector output, with no exception in 100 passes; the retained buffer independently proven equal to the captured frame. Every clause of the formal wording — same fixture, same build, same machine, two complete runs, identical counts and boxes, ≥ 5 inferences per input, byte-identical — is satisfied **for H1 at DPR 1.0**. |
| **Remains untested** | The set-wide clause. H2–H6 have **not** been measured under this protocol, and RE-1 §4 requires every gate to hold on every image. Other device scales are untested under this protocol. |
| **Product-route change necessary?** | **No.** |
| **Formal G4 closure possible on the existing route?** | **Yes**, and it is **not yet demonstrated**. It would require H2–H6 under the reading-A protocol, or an owner ruling on what the set-wide clause requires here. |

#### B — G4 means deterministic end-to-end fresh-capture behaviour

| | |
|---|---|
| **Current evidence establishes** | The product capture route is **not** bit-stable: 100 fresh captures of an unchanging page produced 3 distinct frames, 2/100 departures, with identical capture metadata on all 100. Formal J7 observed 3 failing cells in 72. |
| **Remains untested** | The rate for images other than H1, for device scales other than 1.0, and on W1 or any other machine. Whether the departures have an identifiable cause. |
| **Product-route change necessary?** | **Yes**, if G4 must pass. The gesture route's single `grabFrame()` per pass is what produces the variation. |
| **Formal G4 closure possible on the existing route?** | **No**, on the measured evidence. |

#### C — G4 requires both

| | |
|---|---|
| **Current evidence establishes** | A's inference-determinism findings and B's capture findings, as above. |
| **Remains untested** | The union of A's and B's untested items. |
| **Product-route change necessary?** | **Yes**, for the same reason as B. |
| **Formal G4 closure possible on the existing route?** | **No**, for the same reason as B. |

### Corrected status, carried from the audit's 2026-10-03 correction

1. **INFERENCE DETERMINISM = ESTABLISHED** (FACT).
2. **FORMAL G4 CLOSURE = DEPENDS ON THE OWNER'S INTERPRETATION**, and is **not demonstrated even under
   reading A**, because 1 of 6 held-out images has been measured that way.

Reading A is **not** recorded as a G4 PASS anywhere in this package.

---

## DECISION 2 — G-2 (coordinates)

### The exact wording

`artifacts/experiments/M9-adoption-review/provider-contract.md:80`:

> | **G-2** | coordinates | frames were 1280×720 at DPR 1, so capture px = CSS px and boxes were used
> as CSS directly | stream frames are `maxWidth/maxHeight`-constrained to the CSS viewport, then
> measured (`geometryFrom`); DPR ≠ 1 and a scaled capture are possible | the capture→CSS step (INV-24)
> is **unscreened** for this detector; **re-screen on frames where `scaleToCss ≠ 1`** |

### The contradiction

`scaleToCss = viewportCssWidth / captureWidth` (`packages/perception/src/coordinates.ts:28`, :80).

| route | real product capture? | `scaleToCss` observed | status of the record |
|---|---|---|---|
| **GESTURE_STREAM** | **yes** | **1**, in all **267** recorded observations (J7 run 1 72, J7 run 2 72, capture-determinism 11 + 11 + 101), at device scales 1, 1.25, 1.5 and 2 | J7 evidence |
| **WORKER_FRAME** | **no** | **1, 0.8, 0.6667, 0.5** at DPR 1, 1.25, 1.5, 2, with G1–G4 passing 24/24 | `w2-cft-stream-re1-dryrun.json`, which states "DRY RUN … on the DEGRADED route (**not stream evidence**)" and `j7: "NOT ASSESSED (dry run)"` |

**Therefore no existing recorded configuration satisfies the conjunction "real product capture AND
`scaleToCss ≠ 1`".** The gesture route cannot produce it by construction: it requests the CSS
viewport's exact dimensions as `maxWidth`/`maxHeight` (`perception-realm.ts:689`–`695`), because an
unconstrained tab stream returned 1920×1200 for a 1280×720 viewport and was refused as
`CAPTURE_DIMENSION_MISMATCH` — "a single `scale_to_css` cannot describe both axes".

### The possible rulings

- **A.** Treat `scaleToCss = 1` as acceptable, because the product route is CSS-capped and the
  capture→CSS transformation is the identity, so INV-24 has nothing to screen on this route.
- **B.** Accept the existing WORKER_FRAME evidence for G-2's purpose, despite its dry-run /
  non-stream-evidence status and its `j7: NOT ASSESSED` label.
- **C.** Require a product-route change so `scaleToCss ≠ 1` can arise on the real capture path.
- **D.** Keep G-2 open, and therefore J7 open.

**Not chosen here.**

**Explicit statement about C.** Option C would require a **separate architectural and product
decision**, with its own ADR: it means removing or loosening the CSS-viewport constraint that exists
precisely to prevent the two-axis-scale frame `assertGeometryConsistent` refuses. **It must not be
implemented as an evidence workaround**, and nothing in this package should be read as authorising a
route change to manufacture evidence.

---

## DECISION 3 — G-3 (pixel source)

### The exact two clauses

`artifacts/experiments/M9-adoption-review/provider-contract.md:80`:

> | **G-3** | pixel source | PNG screenshots (Playwright), one decode path | `getUserMedia` tab stream
> → `ImageCapture.grabFrame` → `ImageBitmap` → canvas RGBA | **pixel equivalence between the two
> sources is UNKNOWN — NOT YET VERIFIED (no record measures it)**; **RE-1 must be re-measured on
> product-path frames** |

and the adjoining note: "Preprocessing is **not** a mismatch… **G-3 is about whether that RGBA is the
same.**"

| clause | status |
|---|---|
| RE-1 re-measured on product-path frames | **COMPLETED** — J7 run 1 and run 2, G1–G3 pass 24/24, 0 of 1224 sensitive glyphs exposed in each |
| pixel equivalence between the two sources | **NOT DIRECTLY MEASURED** |

### Current evidence

- Live captured frame vs frozen fixture at **H1 / DPR 1.0**: detector box **geometry byte-identical,
  0.000000000 px**; **scores differed by 0.009447221**.
- The frozen fixture's boxes are **fully identical** to the W2 TR-01 baseline.
- Fixed-input inference is deterministic (Decision 1, reading A evidence).
- Because fixed-input inference is deterministic, non-identical scores **support the inference that the
  two pixel sources differ**.
- **That is an INFERENCE, not a direct pixel comparison.** No record compares the two sources' RGBA.

### The choices

- **A.** Run the direct RGBA digest comparison between the two pixel sources.
- **B.** Rule that the completed product-path RE-1 re-measurement discharges G-3 without a direct
  pixel-equivalence measurement.

**Not chosen here. The experiment has not been run.**

---

## DECISION 4 — ADR-0012 §14.6 / B5

### The exact wording

`docs/adr/ADR-0012-production-frame-handoff.md` §14, "Owner decisions required", item 6:

> 6. B5: the evidence required to close J7 for frame egress.

§13:

> | **B5** | J7 open: stream-route detector coverage (M10.6) | measurement (J7) **or** B2's backstop |

§9:

> "M9's J7 (re-screening on the real capture path) is therefore a prerequisite for frame egress… It
> stays BLOCKER B5 until J7 is closed on stream frames, or until an OCR/value-aware verifier provides
> the backstop."

### Stated explicitly

- **§14.6 is normative** — it is an item in a section titled "Owner decisions required", and §9 makes
  J7 closure a precondition for frame egress.
- **§14.6 is undecided.**
- **§16 says B5 is not decided:** "§14.2 (B2) and §14.6 (B5) are **not** decided."
- **The human architect is identified** — `ADR-0002:20`, **ronitsaha11**.
- **The document itself does not define the final evidence set.** It asks the owner to define it.

### What the owner is asked to specify

1. **What evidence set closes B5 / J7?**
2. **Does G4 mean identical pixels (A), fresh-capture behaviour (B), or both (C)?**
3. **Does G-2's impossible conjunction require a specification ruling (A, B or D) or a product-route
   change (C, which needs its own ADR)?**
4. **Does G-3 require direct pixel-equivalence measurement (A), or does the completed product-path
   re-measurement discharge it (B)?**
5. **Is B2's backstop — an admissible `OCRProvider` verifier under QG-03 — an alternative route to
   closing B5, instead of closing J7 by measurement?**

---

## Current evidence summary

### Capture characterization — clean high-N run (`w2-cft-capture-determinism-run3.json`)

- **100** fresh captures of one unchanging page, one human toolbar click.
- **98** passes on the majority digest `58acf177fb82e3c5…`; **2** departures (passes 36 and 99);
  **3** distinct frame digests in total.
- **Identical capture metadata** on all 100: `1280×720`, 3,686,400 B, `live-bitmap`, dpr 1,
  `scaleToCss` 1, `GESTURE_STREAM`, detector ran, not fail-closed.
- **Observed variation: 2/100** (95% interval ≈ 0.24%–7.0%).
- **Scope: W2 / H1 / DPR 1.0 / current build and model pin.**
- **This is not to be generalized as a universal route failure rate.**

### Inference

- Fixed **real captured** frame: **10/10 identical**, in each of two runs, over the same retained
  digest, with byte-identical results between the runs.
- **Frozen fixture**: **10/10 identical**, in each of two runs, byte-identical between them and fully
  identical to the W2 TR-01 baseline.
- **Every identical-frame-digest group always produced identical detector output** — no exception in
  100 passes.
- The **retained buffer was independently proven to equal the captured frame**: digested in the realm
  that holds it (`op: "frame-sha"`) and compared with the pass's own `rawRgbaSha256`.

### Historical G4

- The historical cells — W1 DPR 1.25/H4, W1 DPR 1.5/H3, W2 run 1 DPR 1.0/H1 — **lack frame digests**.
- Therefore their precise pixel-level cause **remains an INFERENCE**.
- The current evidence **strongly supports capture variation as a mechanism**: run-3 pass 36 moved one
  box by **1.277972 px** with score shifts to 0.013554, where W2 run 1 moved one box by
  **1.2518673555 px** with score shifts to 0.00624 on the same cell.
- **That inference is not retroactively converted into FACT.**

### G-2

- **267** recorded GESTURE_STREAM observations; **`scaleToCss` = 1 in all of them.**
- Non-1 values exist **only** in WORKER_FRAME dry-run evidence.
- **The conjunction remains unexercised.**

### G-3

- **Direct pixel-source equivalence is not recorded. G-3 remains OPEN.**

---

## No further experiment until the decisions are made

Not to be launched before the owner rules: capture-variation runs, another J7 matrix, DPR sweeps,
500- or 1000-pass tests, route modifications, forced-`scaleToCss` experiments. The next technical
experiment is selected **only after** the owner specifies the required evidence.

### Which experiment each ruling would select

| ruling | the experiment that follows |
|---|---|
| **D1 = A** | Measure H2–H6 (and, if the owner requires, other device scales) under the reading-A protocol: retain one real captured frame per image, ≥ 5 inferences each, in two complete runs. One human click per window. Closes the set-wide clause. |
| **D1 = B** | None that can pass on this route. The follow-up is an architectural decision on the capture route, not a measurement. Optionally, characterize the variation rate across images and scales first, to size the problem. |
| **D1 = C** | As D1 = B, plus the D1 = A measurement. |
| **D2 = A, B or D** | No experiment — a specification ruling, recorded as an ADR amendment. |
| **D2 = C** | No experiment until a separate ADR authorises a capture-route change. The route change precedes any measurement. |
| **D3 = A** | The direct RGBA digest comparison: one window, one human click, one unchanging page at DPR 1 — a Playwright PNG decoded to RGBA in Node and digested (G-3's first source verbatim), against the in-realm `rawRgbaSha256` (G-3's second source verbatim), with several stream frames recorded so a single odd capture is not mistaken for a source difference. Both seams already exist; no product change needed. |
| **D3 = B** | No experiment — a ruling. |
| **D4 = close via B2's backstop** | No J7 measurement. The work becomes QG-03 adoption of an admissible `OCRProvider`, which is its own milestone with its own ADR. |

---

## Integrity

Read-only with respect to the product. No detector, model, threshold, preprocessing, crop geometry,
capture route, viewport, `scaleToCss` behaviour, permission, CSP, privacy boundary, networking or
production behaviour was touched, and no gate definition was changed. No experiment was run to produce
this package. No existing record was modified: prior evidence is byte-identical, and the audit was
appended to rather than rewritten. Every requirement quoted is cited to its file and line.

**This document makes no architectural or specification decision.** Its purpose is to make the four
decisions precise enough that the next technical action is unambiguous.
