# J7 closure audit — what the specification DOES say

**Read-only.** No product file, gate, threshold, route or record was changed to produce this. This
document determines the authoritative closure condition for J7; it does not propose what the
specification should say, and it does not use the recent experiments to rewrite it.

**First, the distinction this audit must not blur:** *the capture-variation characterization experiment
is complete.* That is not the same statement as *J7 is closed*, and nothing below treats it as such.

## 0. Two different numbering systems, both called "G"

They are routinely conflated and must not be. Both are authoritative, for different things.

| | where | what it numbers |
|---|---|---|
| **RE-1 G1–G6** | `docs/perception/redaction-evaluation.md` §4 | the redaction evaluation's gates — exposure, over-mask, blanket box, determinism, WASM validity, plaintext |
| **M9 G-1–G-4** | `../../M9-adoption-review/provider-contract.md:80` | the four screened-vs-product mismatches, i.e. adoption blockers — post-processing location, **coordinates**, **pixel source**, visual-only region |

J7 is defined in terms of the second set: `../../M9-adoption-review/decision.md:26` reads

> | J7 | **product-path re-screening** (G-2, G-3) | RE-1 on frames from the real capture path (stream `grabFrame`, `scaleToCss ≠ 1`), not PNG screenshots | pixel and coordinate equivalence UNKNOWN |

So J7 = close **M9 G-2 and G-3** by re-measuring **RE-1** (whose own gates are G1–G6) on product-path
frames. J7 contains no determinism clause of its own; it inherits RE-1's G4.

## 1. The authoritative definition of G4

Two documents define it, and neither mentions capture.

**Origin — `docs/perception/text-region-acceptance.md:106`, Criterion 6:**

> "Two consecutive runs on the same **fixture**, same build, same machine must produce **identical**
> region counts and identical boxes. A detector whose output moves between runs cannot be the basis of
> a redaction decision."

**Pre-registration — `docs/perception/redaction-evaluation.md:185`, RE-1 G4:**

> | **G4 — deterministic** | boxes across two complete runs; outputs across ≥ 5 inferences per input |
> **byte-identical** | Carried over (criterion 6). A redaction decision that moves between runs cannot
> be verified. |

Three observations, textual only:

1. The input is named as **the fixture** — a fixed artifact. "per input" in the pre-registration
   inherits that, explicitly: "Carried over (criterion 6)".
2. The procedure is **two complete runs** and **≥ 5 inferences per input**. Neither document mentions a
   fresh capture, a stream, a re-derived frame, or a per-pass capture.
3. `docs/perception/redaction-evaluation.md` §4 adds the scope rule: "Every gate must hold on **every**
   image. An average would let one leaking image hide behind five clean ones."

**What the implementation does instead.** `tests/browser/extension/run-stream-re1.mjs` checks
`g4DeterministicAcrossPasses` over three `op: "pass"` calls, and each pass is a complete capture
lifecycle: `apps/extension/host-lib/perception-realm.ts:689` opens a fresh `getUserMedia` stream,
`grabFrame()` takes exactly one frame, `track.stop()` closes it, and
`apps/extension/host-lib/capture-authority.ts:256` mints a new handle per capture (the `issued` set
refuses a reuse). So the implemented check is **three different inputs**, not ≥5 inferences on one.

**No document authorises that reading.** No text in the repository states that G4 applies to a
re-captured frame, and no text states that it does not.

### The two candidate readings, classified

**A — deterministic detector/inference behaviour for identical pixel input.**

| statement | classification |
|---|---|
| The authoritative wording names the *fixture* as the input and inherits that into "per input" | **FACT** (quoted above) |
| Repeated inference over one retained **real captured** frame is byte-identical, 10 inferences | **FACT** — `w2-cft-capture-determinism-run2.json`, `-run3.json`, `retainedBufferIsTheCapturedFrame: true` |
| Repeated inference over the **frozen fixture** is byte-identical, 10 inferences, and equals the W2 TR-01 baseline exactly | **FACT** — same records, Phase C |
| Every pass sharing a frame digest produced byte-identical boxes; 100 passes, three distinct frames, no exception | **FACT** — `-run3.json`, `boxesIdenticalWhereverTheFrameWas: true` |
| Under reading A, G4 is satisfied | **FACT**, conditional on reading A governing |

**B — deterministic end-to-end product-path behaviour, each pass obtaining a fresh capture.**

| statement | classification |
|---|---|
| The product capture route is not bit-stable: 100 fresh captures of an unchanging page gave 3 distinct frames, 2/100 departures, with identical capture metadata on all 100 | **FACT** — `-run3.json` |
| Under reading B, G4 is not satisfied | **FACT**, conditional on reading B governing |
| Under reading B, G4 is not satisfiable on this route without changing the capture route | **INFERENCE** from the above plus `perception-realm.ts:689`–`695` |

**C — both.** Not stated anywhere. **UNTESTED as a specification claim**; it is not a reading the text
offers.

### Verdict

**G4 SEMANTICS = OWNER DECISION REQUIRED.**

The exact ambiguity: Criterion 6 and RE-1 G4 define determinism over a **fixture** — a fixed input.
J7 (`M9/decision.md:26`) then requires "**RE-1 on frames from the real capture path**", a path on which
the input is re-derived per pass and there is no fixture. Neither document says which quantity is "the
input" once the fixture is replaced by a live capture. The conflict is between the words "on the same
**fixture**" / "per input" (acceptance + pre-registration) and "on frames from the real capture path"
(J7), and the repository does not reconcile them.

**Not proposed, and explicitly out of scope:** changing the product to make reading B pass. The
inference path has already demonstrated determinism over identical bytes, and the 100-pass evidence
shows fresh capture is not bit-stable under the tested conditions. A product change to force G4 is not
recommended here and is not required by any text audited.

## 2. ADR-0012 §14.6 — the closure requirement

**The text** (`docs/adr/ADR-0012-production-frame-handoff.md`, §14 "Owner decisions required", item 6):

> 6. B5: the evidence required to close J7 for frame egress.

and §13:

> | **B5** | J7 open: stream-route detector coverage (M10.6) | measurement (J7) or B2's backstop |

and §9:

> "M9's J7 (re-screening on the real capture path) is therefore a prerequisite for frame egress… It
> stays BLOCKER B5 until J7 is closed on stream frames, or until an OCR/value-aware verifier provides
> the backstop."

**Is §14.6 normative?** Yes, as a requirement that an owner decision exist. The ADR's frontmatter
`status:` reads "PARTIALLY APPROVED (M12, §16) — §14 items 1, 3, 4/B6 (unconfigured) and 5 decided by
the owner; items 2 (B2) and 6 (B5) open", and §16 states plainly: "**§14.2 (B2) and §14.6 (B5) are not
decided.**" So §14.6 is in force and unresolved.

*One internal inconsistency, recorded not resolved:* the frontmatter says PARTIALLY APPROVED while the
body's status block (line 20) still says "**STATUS: PROPOSED**". The frontmatter carries the later
`modified: 2026-10-01 (M12 §16)`. Either way §14.6 is undecided, so the conclusion does not turn on it.

**Does it explicitly require an owner ruling?** Yes — it is an item in a section titled "Owner
decisions required", and §9 makes J7 closure a precondition for frame egress.

**Is an owner identified?** Yes.

- The role: "the human architect" — `AGENTS.md:58`, `docs/adr/README.md:72` ("The human architect
  approves or rejects. No agent approves its own ADR."), `agentos/agents/README.md:31` ("The human
  architect owns all final architectural decisions.").
- The person: `docs/adr/ADR-0002-t1-capture-format-policy.md:20` — "**APPROVED 2026-09-11** by the
  human architect, **ronitsaha11**".
- ADR-0012's own `owner:` field names the `pratibimb-architect` agent contract, which
  `agentos/agents/pratibimb-architect.md:57` routes onward: "Everything that changes a frozen decision
  goes to **the human architect**."

**What evidence does §14.6 require?** It does not say. That is precisely the undecided item: §14.6 asks
the owner to *define* the evidence. §13 offers the alternative route — "measurement (J7) **or** B2's
backstop" — and B2 (a verifier that can return VERIFIED) is also open.

**Does the 100-pass evidence satisfy the evidence portion?** **Unanswerable as posed**, because no
evidence requirement has been defined. What exists: J7 ran twice with 72 observations each, G1–G3 pass
24/24 with 0 of 1224 sensitive glyphs exposed in both, per-pass frame digests now exist, inference
determinism is established on fixed inputs, and the capture-variation rate is characterized for one
cell. The M12 decision (`../decision.md`, amendment 2026-10-02) named exactly two things J7 needed:

1. **"Per-pass frame digests"** — **now provided** (`w2-cft-stream-re1-run2.json`, 72/72 non-null).
2. **"An owner ruling on `scaleToCss ≠ 1`"** — **still outstanding**.

**What precisely remains undecided:** (a) the G4 semantics of §1; (b) the `scaleToCss ≠ 1` ruling of
§4; (c) §14.6 itself — the evidence set that closes J7; and (d) B2, the alternative backstop.

## 3. G4's historical failures — the defensible conclusion, stated exactly

The failures: W1 DPR 1.25/H4 and DPR 1.5/H3 (F-M12-2, `../decision.md:31`); W2 run 1 DPR 1.0/H1; W2
run 2 none (24/24 pass). The historical records carry **no frame digests**.

- The historical failures are **NOT proven to be capture failures.** No digest exists for those cells,
  and no measurement taken later can be applied to them as FACT. This remains an **INFERENCE**.
- **The capture mechanism capable of producing the observed failure signature has now been directly
  measured.** `-run3.json` pass 36 moved one box's geometry by **1.277972 px** with score shifts to
  0.013554; W2 run 1's failure moved one box by **1.2518673555 px** with score shifts to 0.00624, on
  the same cell — the same magnitude and the same character. **FACT** for the new observation;
  the correspondence to the historical cell is **INFERENCE**.
- **The detector is deterministic over identical bytes.** **FACT** — 40 inferences across the two clean runs
  (10 per fixed input per run: a retained real captured frame, and the frozen fixture), plus 100 passes in which the frame determined the output with no exception.
- **The clean-path capture variation rate observed in the tested cell is 2/100** (95% interval ≈
  0.24%–7.0%). **FACT**, for W2 / H1 / DPR 1.0 / this build and pin.
- That rate is **NOT generalized** to the whole capture route, to other images, to other device scales
  or to other machines. Any such extension is **UNTESTED**.

A consistency note, offered as arithmetic rather than as proof: a three-pass cell fails unless all
three frames agree, so at p = 2.0% that is 1 − (1 − p)³ ≈ 5.9% of cells, against 3 of 72 formal cells
≈ 4.2%. **INFERENCE.**

## 4. M9 G-2 — coordinates

**Exact wording** (`../../M9-adoption-review/provider-contract.md:80`):

> | **G-2** | coordinates | frames were 1280×720 at DPR 1, so capture px = CSS px and boxes were used
> as CSS directly | stream frames are `maxWidth/maxHeight`-constrained to the CSS viewport, then
> measured (`geometryFrom`); DPR ≠ 1 and a scaled capture are possible | the capture→CSS step (INV-24)
> is **unscreened** for this detector; **re-screen on frames where `scaleToCss ≠ 1`** |

**Is `scaleToCss ≠ 1` explicitly mandatory?** The clause is imperative — "re-screen on frames where
`scaleToCss ≠ 1`" — and J7's row repeats it as part of what J7 screens. So: **yes, as written.**

**Can the product GESTURE_STREAM route produce it?** `scaleToCss = viewportCssWidth / captureWidth`
(`packages/perception/src/coordinates.ts:28`, :80). The gesture route requests the CSS viewport's exact
dimensions as `maxWidth`/`maxHeight` (`perception-realm.ts:689`–`695`), for the documented reason that
an unconstrained tab stream returned 1920×1200 for a 1280×720 viewport and was refused as
`CAPTURE_DIMENSION_MISMATCH` because "a single `scale_to_css` cannot describe both axes". **Measured:
`scaleToCss` was 1 in every GESTURE_STREAM observation on record** — J7 run 1 and run 2 (72 each),
capture-determinism runs 1, 2 and 3 (10, 10, 100), at device scales 1, 1.25, 1.5 and 2.

**Does an existing supported configuration exercise it?** **Yes — but not the product route.** The
degraded `M3_WORKER_FRAME` route, which uses a `captureVisibleTab` PNG at device resolution, produced
`scaleToCss` of **1, 0.8, 0.6667 and 0.5** at DPR 1, 1.25, 1.5 and 2
(`w2-cft-stream-re1-dryrun.json`, and the same on W1), with **G1–G4 all passing 24/24** at those
values. That record labels itself "DRY RUN … on the DEGRADED route (**not stream evidence**)" and
`j7: "NOT ASSESSED (dry run)"`, so it is not J7 evidence by its own terms. Other records at
`scaleToCss` 0.8 exist from the M8/M9 era (`w1-text-region-screen.json`, `w1-cft153-detector-eval.json`,
`w2-cft-qg04-interception.json`).

**Would forcing it alter the product route or violate another requirement?** Forcing `scaleToCss ≠ 1`
on the gesture route means removing or loosening the CSS-viewport constraint, which is the control that
prevents the two-axis-scale frame `assertGeometryConsistent` refuses. That is a capture-route change
and is **not done here**.

**The contradiction, stated plainly:** J7's own text requires frames that are *both* "from the real
capture path (stream `grabFrame`)" *and* "`scaleToCss ≠ 1`". The product gesture route satisfies the
first and, by construction, never the second; the worker-frame route satisfies the second and not the
first. **No existing configuration satisfies the conjunction.**

**Status: NOT EXERCISED** on the product route. Closing it is **OWNER DECISION REQUIRED**.

## 5. M9 G-3 — pixel source

**Exact wording** (`../../M9-adoption-review/provider-contract.md:80`):

> | **G-3** | pixel source | PNG screenshots (Playwright), one decode path | `getUserMedia` tab stream
> → `ImageCapture.grabFrame` → `ImageBitmap` → canvas RGBA | **pixel equivalence between the two
> sources is UNKNOWN — NOT YET VERIFIED (no record measures it)**; RE-1 must be re-measured on
> product-path frames |

and the adjoining note: "Preprocessing is **not** a mismatch: M8.2's benchmark showed the in-browser JS
preprocessing equals the screened Python tensor byte for byte… **G-3 is about whether that RGBA is the
same.**"

So G-3 has two clauses:

| clause | status |
|---|---|
| "RE-1 must be re-measured on product-path frames" | **done** — J7 run 1 and run 2; G1–G3 pass 24/24, 0 of 1224 exposed |
| "pixel equivalence between the two sources is UNKNOWN — no record measures it" | **OPEN** — still no record compares the two sources' RGBA |

**Current evidence, and what it is not.** At H1 / DPR 1.0 the live captured frame and the frozen
fixture PNG produced **byte-identical box geometry (0.000000000 px)** and scores differing by
**0.009447221**; the fixture's boxes are fully identical to the W2 TR-01 baseline. Since inference is
deterministic over identical bytes (§1 reading A, FACT), differing scores imply the two inputs differ
— an **INFERENCE** that the sources are not byte-identical. This compares **detector output**, on one
image at one device scale, and is **not** the pixel comparison G-3 names. **G-3 is not closed.**

**Smallest experiment that would satisfy the wording literally** (specified, **not run**): one window,
one human click, one unchanging page at DPR 1.

1. Take a Playwright PNG screenshot of the page, decode it to RGBA in Node and digest it — this is
   G-3's first source verbatim ("PNG screenshots (Playwright), one decode path"), and no stream pixel
   crosses the boundary.
2. In the same window, take one `op: "pass"` and read the existing in-realm `rawRgbaSha256` — G-3's
   second source verbatim.
3. Compare the two digests, with dimensions and byte length recorded. At DPR 1 both are 1280×720 × 4 =
   3,686,400 B, so a byte comparison is meaningful.

Equal digests would close the clause as pixel equivalence; unequal digests would settle it as measured
non-equivalence, which the owner must then rule on. Both seams already exist; no product change is
needed. Given §1's FACT that the capture is not bit-stable (2/100), such a comparison should record
several stream frames so a single odd capture is not mistaken for a source difference.

## 6. The J7 closure matrix

Labels are restricted to **PASS / FAIL / OPEN / NOT EXERCISED / OWNER DECISION REQUIRED**.

### RE-1 gates, as applied to product-path frames by J7

| Gate | Exact authoritative requirement | Existing evidence | Status | Missing action | Owner decision? |
|---|---|---|---|---|---|
| **G1** no exposed sensitive glyph | 0 exposed, set-wide, on every image (`redaction-evaluation.md:182`) | J7 run 1 and run 2: 24/24, **0 of 1224** in each | **PASS** | none | no |
| **G2** over-mask within budget | ≤ 1.0 per image (`:183`) | run 1 max 0.3755; run 2 max 0.3755 | **PASS** | none | no |
| **G3** no blanket box | < 0.9 largest single dilated box (`:184`) | run 1 max 0.0504; run 2 max 0.0504 | **PASS** | none | no |
| **G4** deterministic | boxes across two complete runs; outputs across ≥ 5 inferences **per input**; byte-identical; carried over from criterion 6's "same **fixture**" (`:185`, `text-region-acceptance.md:106`) | Reading A: 40 inferences on two fixed inputs byte-identical (10 each per clean run); 100 passes, frame→output with no exception. Reading B: 2/100 capture departures; 3/72 formal cells failed | **OWNER DECISION REQUIRED** | rule which quantity is "the input" on a route where the frame is re-captured per pass | **yes** |
| G5 WASM-valid | frozen S-04a-1 rule on every realistic input (`:186`) | carried over in both J7 records, not re-run | **OPEN** | confirm carry-over is acceptable for J7 | no |
| G6 no plaintext output | no field capable of holding a character sequence (`:187`) | carried over, structural | **OPEN** | confirm carry-over is acceptable for J7 | no |

### M9 adoption gaps that J7 exists to close

| Gap | Exact authoritative requirement | Existing evidence | Status | Missing action | Owner decision? |
|---|---|---|---|---|---|
| G-1 post-processing parity | `dbPostprocess` verbatim in product source, pinned by source hash and M8.1's boxes | closed before J7 (J6) | **PASS** | none | no |
| **G-2** coordinates | "re-screen on frames where **`scaleToCss ≠ 1`**" (`provider-contract.md:80`) | `scaleToCss` = 1 in every GESTURE_STREAM observation on record — 267 in all (J7 run 1 72, J7 run 2 72, capture-determinism 11 + 11 + 101); ≠ 1 only on the degraded WORKER_FRAME route, in a record that declares itself not stream evidence | **NOT EXERCISED** | rule on an unsatisfiable conjunction: "real capture path" **and** "`scaleToCss ≠ 1`" cannot both hold on any existing configuration | **yes** |
| **G-3** pixel source | "pixel equivalence between the two sources is **UNKNOWN — NOT YET VERIFIED**"; and RE-1 re-measured on product-path frames | second clause done (J7 runs); first clause has no record. Detector-output comparison at H1/DPR 1.0: geometry identical, scores differ by 0.00945 | **OPEN** | the §5 experiment, or an owner ruling that output equivalence substitutes for pixel equivalence | ruling optional |
| G-4 visual-only region | a product mechanism naming visual regions in CSS px, with measured coverage | J5, outside J7 | **OPEN** | outside J7's scope | no |

### The closure instrument

| Item | Exact authoritative requirement | Existing evidence | Status | Missing action | Owner decision? |
|---|---|---|---|---|---|
| **ADR-0012 §14.6** | "B5: the evidence required to close J7 for frame egress." §16: "§14.2 (B2) and §14.6 (B5) are **not** decided." | J7 ran twice, 144 observations; digests now recorded; determinism separated; §13's alternative (B2 backstop) also open | **OWNER DECISION REQUIRED** | the owner defines the evidence set that closes J7 | **yes** |
| B5 / J7 overall | §9: "It stays BLOCKER B5 until J7 is closed on stream frames, or until an OCR/value-aware verifier provides the backstop." | J7 not closed by any authoritative statement | **OPEN** | §14.6 ruling, then whatever it requires | **yes** |

**J7 overall status: OPEN.** No authoritative text permits PASS, because the condition that would be
tested against has not been defined (§14.6). No authoritative text compels FAIL either: G1–G3 pass,
and G4's applicability is undetermined rather than failed. `M10/decision.md:81` also records
independently that "M9 J7 (stream-route re-screening) is **not closed** by six images at one scale".

## 7. Is any further experiment genuinely required?

**No — not before the owner rules.** No audited text requires a further capture run. The specification
does not define the evidence set (§14.6), so additional data cannot be shown to be required by it, and
collecting more would be answering a question the repository has not yet asked. The 2/100 observation
is sufficient to move the matter to specification.

Two experiments become required only if the owner rules in particular ways, and neither is run here:

- the **§5 G-3 pixel comparison**, if the owner requires G-3's first clause closed by measurement
  rather than by ruling;
- a **determinism re-measurement under reading A** across all 24 cells, if the owner adopts reading A
  and wants it evidenced beyond the single cell measured so far. Under reading A the existing evidence
  covers H1 at DPR 1.0 only.

A further capture-variation run — 500 passes, 1000 passes, another J7 matrix, another DPR sweep — is
**not** required by anything audited.

## 8. The decision questions, formulated to be answerable

**D-J7-1 — G4 semantics.** On the product capture path, where each pass obtains a fresh frame, which
quantity is "the input" in RE-1 G4's "outputs across ≥ 5 inferences per input"?

- **(a)** the captured frame — G4 asserts the detector is deterministic over identical pixels. On the
  evidence, G4 is then **PASS** for the measured cell, and the formal harness's
  `g4DeterministicAcrossPasses` is measuring something G4 does not assert.
- **(b)** the displayed page — G4 asserts the whole product path is reproducible, capture included. On
  the evidence, G4 is then **FAIL**, at a measured 2/100 per pass for the tested cell, and is not
  satisfiable without a capture-route change.
- **(c)** both, as a conjunction — G4 is then **FAIL** for the same reason as (b).

**D-J7-2 — G-2.** J7 requires frames that are both from the real capture path and have
`scaleToCss ≠ 1`, and no existing configuration provides both. Which holds?

- **(a)** G-2 is closed by the measured fact that the product route is CSS-capped, so the capture→CSS
  step is the identity and INV-24 has nothing to screen on this route;
- **(b)** G-2 requires `scaleToCss ≠ 1` evidence from a non-product route, and the existing
  WORKER_FRAME dry-run data at `scaleToCss` 0.5/0.6667/0.8 (G1–G4 passing 24/24) is accepted for it;
- **(c)** G-2 requires a product-route change so the condition can arise, which needs its own ADR;
- **(d)** G-2 stays open and J7 cannot close while it does.

**D-J7-3 — G-3.** Is G-3's "pixel equivalence between the two sources" clause closed by

- **(a)** the §5 digest comparison, to be run; or
- **(b)** a ruling that re-measuring RE-1 on product-path frames — already done, G1–G3 passing 24/24 —
  discharges G-3 without a pixel comparison?

**D-J7-4 — §14.6.** Given the answers to D-J7-1..3, what evidence set closes J7 for the purpose of
B5 and frame egress; or is B5 to be closed instead through B2's verifier backstop (§9, §13)?

These four are the whole of what is undecided. Each is answerable without further data.

## 9. Integrity

Read-only. No detector, model, threshold, preprocessing, crop geometry, capture route, viewport,
`scaleToCss` behaviour, permission, CSP, privacy boundary, networking or production behaviour was
touched, and no gate definition was changed. No existing record was modified: all prior evidence is
byte-identical and the earlier analyses are appended to, never rewritten. Every requirement quoted
above is cited to its file and line.
