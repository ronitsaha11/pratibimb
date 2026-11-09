---
id: M22.19-scope-amendment-closure
title: "M22.19 — formal scope amendment (owner Option B) and closure of the M22 engineering scope"
status: recorded — M22 ENGINEERING SCOPE CLOSED; detector-performance research DEFERRED to FR-01 (not authorised); no detection result exists
date: 2026-11-03
label: FACT (the owner's decision as given; records and git metadata read); no new measurement
classification: SCOPE GOVERNANCE (documentation only) — no code, no execution, no model, no checkpoint contents, no data, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.19 — scope amendment and engineering-scope closure

> **What it is:** documentation and scope governance only.
> **What it is not:** it authorises no detector evaluation and no further training, it does not resolve the safety-classifier block, and it provides no route around it (`agentos/blockers.md` **B-07**).
> **Not claimed:** no detection improvement, no research validation, no model adoption.

## Owner decision

**Option B:** explicitly approved by the project owner in the conversation dated **2026-11-03**, in response to the M22.18 audit.

It is an **owner-approved change of research scope**. It is **not**:
- an evaluation approval;
- a resolution of the safety-classifier block;
- permission to perform the previously blocked operation, or any equivalent of it.

## The amended M22 objective

> "M22 delivers the engineering foundation for small-target detector research: a reproducible synthetic dataset-generation pipeline, quality-controlled Candidate 2, approved G10 visibility evidence, a versioned data adapter, partial-occlusion-aware training, a separate v2 training pipeline, one completed and verified training run, and operational telemetry and resume assurance."

**M22 no longer claims to answer** whether T1 or T1-v2 improves small-target detection.

**The original question is deferred, not answered.** Its parts:
- T1's small-target recall, the attribution of its misses, and the effect of the score floor, NMS and tiling (`M22-small-target-recall/design.md` §1);
- hypotheses H1–H5;
- any T1 versus T1-v2 comparison.

**Where it goes:** **FR-01** (`agentos/registry/future-research-register.md`), status **DEFERRED — NOT AUTHORISED FOR EXECUTION**.

## Hypothesis

The completed M22 work satisfies the amended objective on its recorded evidence, with every limitation stated and nothing upgraded beyond what that evidence shows.

## Environment

**Machine:** W1 (`LAPTOP-6E14K34L`).

**Git:** branch `spike/m22-small-target-recall`, at `a58ec93` before this milestone, 67 commits on `077f139`, no upstream, no PR.

**Inputs:** git metadata and documentation only.

## Expected result

**Evidence:** every engineering area is classified against its own record.

**Registers:**
- unresolved items are listed with an explicit status;
- the deferred research is registered, not authorised;
- the evaluation restriction is registered unchanged.

## Actual result

### 1. Engineering deliverables, against the evidence

| Area | Milestone (commits) | Implementation completed | Local tests completed | Experiment actually executed | Planning or design only | Not yet verified |
|---|---|---|---|---|---|---|
| **Dataset engineering** | M22.1 (`65de59e`, `0d2832f`) | label-recipe audit tooling | yes (gate tests) | **yes**: TRAIN/DEV labels of `t1-ui-v1` regenerated and audited; every icon fully occluded | the future-dataset spec | — |
| | M22.2–M22.3 (`d23bc69` … `a7e905c`) | isolated v2 generator with provenance and SHA-256 seeds; dataset gate G1–G9 | yes (generator and gate unit tests) | plan-only runs | the M22.3 build configuration (later approved) | — |
| | M22.4 (`68ace3c`, `b997da6`) | renderer and candidate build | yes | **yes**: candidate 1 rendered (600 TRAIN + 160 DEV); G1–G9 pass; rebuild reproduced | — | reproducibility shown **on W1 only** |
| | M22.5 (`790e5b0`, `12ac35f`) | read-only candidate audit (PNG decoding, contrast) | yes | **yes**: candidate 1 **rejected**, with 374 positives effectively invisible | — | — |
| | M22.6 (`4906332` … `f7dbc7b`) | visual fixes; the G10 pixel diagnostic | yes | **yes**: candidate 2 rendered; G1–G9 pass; G10 measured | — | — |
| | M22.7 (`3079a26`, `39b7b21`) | v2 data adapter; dry run | yes | **yes**: dry run on candidate 2 (165 / 44 per cell) | the `train_v2` design | — |
| | M22.8 (`d77e33e`, `84b1388`) | Python tests in `npm run verify`; CI job configured | yes, locally | — | — | **the hosted CI job has never run on GitHub** |
| | M22.9 (`1073d56` … `579bea6`) | approved G10 configuration bound to the manifests; fail-closed adapter; pre-flight-only `train_v2` | yes | **yes**: approved-G10 evidence (6,688 VISIBLE); pre-flight pass | — | — |
| **Approved G10 evidence** | M22.9 | `g10-approved-1`, configuration `5cbb059f…`, evidence `404e0b28…` | yes | yes | — | **scope limited** to candidate 2 in its rendering environment (W1 Chromium 153.0.8010.12, DPR 1); **not generalised** |
| **Training engineering** | M22.10 (`00e4c30`) | — | — | data-only measurements | **yes: a planning milestone** | — |
| | M22.11 (`388cb95`, `f28c18e`) | read-only audit harness | — | **yes**: target-assignment and loss audit (0 collisions; ordering defect; partial-occlusion defect) | — | — |
| | M22.12 (`fd38063`, `31239ea`, `67b3436`) | partial-occlusion ignore mask; schema-2 configuration | yes (35 + 41 + 7 tests) | pre-flight and mask counts on candidate 2 | the assignment-order ADR **proposal** | — |
| | M22.13 (`0b8f210` … `339a6c2`) | masked loss (bitwise legacy-equivalent); authorised training loop with resume | yes (24 loss, 10 loop tests) | **yes: one training run**, 40 epochs, exactly 6,000 steps, 40 verified checkpoints, DEV loss 3.983 → 2.893 | — | **not a detector evaluation**: detection performance UNKNOWN |
| **Epoch-39 checkpoint** | M22.13 | `checkpoint-e39.pt`, SHA-256 `a485425dfb4ea7f73d91707d4e9a8eb6a10a7a0be36f8dbe6d95f71e26025c0d` (provenance: `M22.13-first-training-run/logs/w1-run-record-first-run-01.json`) | — | produced by the run | — | **UNADOPTED**; not loaded or modified here |
| **Reliability engineering** | M22.15 (`22cfe62`, `b91b3af`) | telemetry; null-memory root cause fixed | yes (39 tests; real Windows memory and tick reads) | — | — | no real run has used it |
| | M22.16 (`5e29afe`, `1eb0a77`) | `observe` guard; latent control-flow defect fixed | yes (10 harness tests, **fakes**) | — | — | verified through **fakes**, not a real run |
| | M22.17 (`982b898`, `a58ec93`) | guarded step timer; explicit multi-session records | yes (11 harness tests, **fakes**) | — | — | verified through **fakes**; resume telemetry never seen in a real run |
| **Evaluation design** | M22.14 (recorded in `7558bc6`) | — | — | — | **yes: design only**, delivered in conversation; never committed at the time | never approved, never executed |

### 2. Closure decision: engineering scope closed; detector-performance research deferred

1. **Engineering delivered:** the dataset-generation, training and telemetry engineering scope of the amended objective has been delivered (§1), with the limitations shown there.
2. **One training experiment completed:** the first authorised training experiment completed (M22.13).
3. **Detector performance remains unknown.** Training and DEV **loss** is not detection performance.
4. **H1–H5 remain untested.**
5. **The original question is deferred:** the original T1 small-target research question is deferred to **FR-01**.
6. **No adoption decision:** no T1-v2 adoption decision has been made; the epoch-39 checkpoint is UNADOPTED, and T1 (`ba6d9e93…`) stays UNADOPTED.
7. **No unbiased claim:** no unbiased performance claim is supported; no v2 TEST split exists. Candidate 2's conditional acceptance does not prove detector quality.
8. **The evaluation restriction remains in force:** **B-07**.
9. **Open items are registered:** outstanding technical and governance issues are carried into `outstanding-register.md` and FR-01, not silently resolved.

**Not complete:** the research programme. M22 did **not** prove a small-target recall improvement, or any detection result.

### 3. Records made in M22.19

- **The scope amendment and the closure:** this record and `decision.md`.
- **The register of open items:** `outstanding-register.md`.
- **Registers:**
  - **FR-01:** `agentos/registry/future-research-register.md`;
  - **B-07:** `agentos/blockers.md`;
  - **M22 itself:** an appended scope section in `artifacts/experiments/M22-small-target-recall/README.md` and `decision.md`, with the original text kept unchanged.
- **The two unrecorded milestones:** M22.14 and M22.18, recorded in `7558bc6`.
- **Status updates:** `agentos/state.md`, `CHANGELOG.md` and `tools/detector/README.md`.

**No experiment index exists:** the repository has no separate experiment index. The `agentos/state.md` "Current state" table serves as the index, and it is updated.

## Conclusion

M22's amended engineering scope is closed on recorded evidence. Its original detector-performance question is open, unanswered and deferred to FR-01, which is not authorised for execution. The evaluation restriction is unchanged.

## Reproducibility

Documentation only. The evidence is the records and commits cited in §1. The repository check is the only check run:

```bash
python scripts/verify-repo.py
```

See `decision.md` for its result.
