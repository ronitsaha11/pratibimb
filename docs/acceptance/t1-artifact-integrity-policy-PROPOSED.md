# T1 artifact-integrity policy (OD-O) — PROPOSED — AWAITING OWNER APPROVAL

> **Status: PROPOSED — AWAITING OWNER APPROVAL (M23.4, 2026-11-03).**
> - **What it is:** a **prerequisite** that any future T1 reactivation or adoption would have to meet.
> - **Kept separate from OD-P:** OD-P (disable T1 from active Phase 1 execution) is already selected; OD-O is not.
> - **Nothing is implemented,** and **the T1 file was not read or hashed:** no digest is computed or proposed here.

## 1. The gap (FACT)

| | T1 (`t1-ui-head.onnx`) | TR-01 (comparison) |
|---|---|---|
| In git | no (`artifacts/models/` is git-ignored) | no (git-ignored) |
| Build-time check | **none:** the file must only *exist* | SHA-256 and size against `TR01_PACKAGE.onnx`; refuses to package on mismatch |
| Runtime check | **none:** raw `fetch`, then `createPinnedInferenceSession`. That pins the **ORT runtime**, not the model | `loadVerifiedModel` (`packages/security/src/modelPin.ts`): hash before any session; throws on mismatch; no fallback model |
| Revision identity | `MODEL_REVISION = "ba6d9e93695b"`, a **label** | the digest is the identity |
| Related ADR | ADR-0003 (packaging and runtime identity), **PROPOSED, not implemented** | ADR-0011 |

**Implications (INFERENCE):**
- **No identity:** any file at the git-ignored path is packaged and, when a frame is captured, run.
- **No comparison:** results from two machines cannot be shown to use the same T1.
- **Running is not identity:** a run record that says T1 ran says nothing about *which* bytes ran (U-4).

## 2. Proposed prerequisites for any future T1 reactivation

**Each item is PROPOSED — AWAITING OWNER APPROVAL.**

| # | Requirement | Modelled on |
|---|---|---|
| I-1 | **A pinned artifact digest:** SHA-256 and byte length, fixed in source and recorded in the model registry | `TR01_PACKAGE.onnx`; `ModelPin` |
| I-2 | **Build-time verification:** refuse to package unless the bytes match I-1 | the TR-01 branch of `build:publicAssets` |
| I-3 | **Runtime verification before loading:** hash the packaged bytes before any session; mismatch → refuse; no fallback model | `loadVerifiedModel` |
| I-4 | **A revision-to-digest mapping:** `MODEL_REVISION` resolves to exactly one digest, with the source commit and training record | registry row format |
| I-5 | **Provenance record:** where the bytes came from (training run, commit, licence), consistent with QG-03's pinned-revision rule | QG-03; ADR-0003 |
| I-6 | **Fail closed:** a mismatch makes the detector **refuse** (the existing `MODEL_ASSET_UNAVAILABLE`-style refusal), never run on unverified bytes | the existing null-runtime path |
| I-7 | **Record the identity:** every measurement or run record that involves T1 inference records the verified digest | M20 record conventions |

## 3. What this proposal does not do

- It computes **no** digest; the T1 file was not opened.
- It changes no code or packaging, and adopts no model.
- It does not reactivate T1, which OD-P sends the other way.
- It does not authorise any detector evaluation: FR-01 stays deferred and B-07 blocked.
