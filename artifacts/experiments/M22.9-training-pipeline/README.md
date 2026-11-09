---
id: M22.9-training-pipeline
title: "M22.9 — approved G10, conditional acceptance of candidate 2, and an isolated pre-flight-only training pipeline"
status: recorded — G10 approved and verified on candidate 2; train_v2.py implemented PRE-FLIGHT ONLY; NO TRAINING, NO INFERENCE
date: 2026-11-02
label: FACT (approved-G10 evidence, pre-flight and tests on W1)
classification: TRAINING PIPELINE (no execution) — owner-authorised; no training, no optimizer step, no inference, no TEST
workstation: 1 (LAPTOP-6E14K34L)
---

# M22.9 — isolated training pipeline (pre-flight only)

> **No model was trained, no optimizer was created or stepped, no forward or backward pass ran, no
> weights or checkpoints were written, and no detector inference was run.** `train_v2.py` contains no
> training step. Candidates 1 and 2, the T1 model, the legacy loader and trainer, and the production
> detector are unchanged. No TEST data was touched.

## Owner authorisation (M22.9)

1. **G10 thresholds:** approved. INVISIBLE below salience 1.25 or coverage@1.25 0.005; VISIBLE only at salience ≥ 1.5 and coverage ≥ 0.005; BORDERLINE otherwise. Recorded as project-owner approval dated **2026-11-02**, for candidate 2 in its documented rendering environment only.
2. **Candidate 2:** conditionally accepted for a first controlled training experiment, subject to approved-G10 verification. **Verified below.**
3. **`train_v2.py`:** implementation authorised, and integration and testing **without executing training**.

## Hypothesis

Candidate 2 keeps every class × size cell at or above its minimum under the approved G10 rule. A separate pipeline can then be prepared and proven safe, so that a later authorised run cannot touch T1, TEST or the legacy trainer, without any training being executed.

## Environment

W1, Windows 11, Python 3.13.14, torch 2.14.0+cpu, Node v24.22.1. Candidate 2 was rendered by Chromium 153.0.8010.12 (M22.6).

## Expected result

**Approved-G10 evidence:**
- complete and bound;
- every cell at or above 150 (TRAIN) and 40 (DEV) visible positives.

**Adapter:** it refuses anything unapproved, stale, incomplete or unbound.

**Pre-flight passes, and it:**
- builds no model or optimizer;
- writes nothing;
- leaves T1 unchanged.

**Static tests:** they prove the pipeline's safety properties.

## Actual result

### 1. Approved G10 and candidate 2 acceptance checks

**Configuration:** `tools/dataset/v2/configs/g10-approved-candidate-2.json`, version `g10-approved-1`.
- **Approval:** approved by the project owner on 2026-11-02.
- **Scope:** candidate 2, render revision r2, W1 Chromium 153.0.8010.12 at DPR 1. It is not to be generalised.
- **Binding:** TRAIN `f283720f…2427f8` and DEV `f072507a…4ede1`.
- **Provisional file:** `g10-provisional-UNAPPROVED.json` is **kept unchanged** as history.

| Hash (SHA-256 over canonical JSON; identical in JS and Python) | Value |
|---|---|
| thresholds | `fcce918a5341dc97350bbe3b85c9c21de95a04e32d85f23cf1a3f64b7dce78b1` |
| configuration | `5cbb059fff57304c36a4ae47d54012ebda2defc9db7154786e2944f7fedbbddf` |
| evidence (`logs/w1-candidate-2-g10-evidence-approved.json`) | `404e0b286a8efdd4a76c389e7e0b2babd07e39303417f62002d55a8b5c29b533` |

**Evidence** (`audit-candidate.mjs --g10-out`, format 2: every positive's id, category, salience and coverage):

| | TRAIN | DEV |
|---|---|---|
| Positives classified, ids unique | 5,280 | 1,408 |
| VISIBLE / BORDERLINE / INVISIBLE | **5,280 / 0 / 0** | **1,408 / 0 / 0** |
| Minimum salience / coverage@1.25 | 1.622 / 0.012 | 1.622 / 0.011 |
| Approved visible positives per class × size cell | **165 in all 32** (minimum 150) | **44 in all 32** (minimum 40) |

**Candidate 2 passes the condition.** The binding also fails closed: the approved configuration run against candidate 1 is refused ("bound to another train manifest").

### 2. Adapter changes (`data_v2.py`)

**Under an approved configuration, the adapter requires:**
- format-2 evidence;
- `configSha256` equal to the configuration's canonical hash, so stale or foreign evidence is refused;
- `thresholdsSha256` equal to the thresholds' hash;
- the configuration's own binding to the candidate's manifest hashes.

**It then, and otherwise refuses:**
- recomputes every category from its metrics under the approved rule;
- rejects missing or non-finite metrics and unknown categories;
- rejects **missing, duplicate and unexpected ids**;
- checks the recorded counts.

**Further changes:**
- `load_accepted_split` refuses anything not approved.
- A missing G10 file is a refusal.
- Exclusions are reported by **category × class × size bucket**, with the G10 counts and hashes.
- The M22.7 compact format remains readable for provisional use only.

### 3. `train_v2.py` architecture (pre-flight only)

| Part | Implementation |
|---|---|
| A. Training input | `load_train(root, g10)`: `load_accepted_split(root, "train", g10)`. Candidate 2, approved-G10 VISIBLE positives, the trainer's eight classes |
| B. Validation input | `load_dev(root, g10)`: separate manifest, same filtering. No predictions |
| C. Output | `artifacts/models/t1-ui-head-v2-<run id>` (run id `^[a-z0-9][a-z0-9-]{2,47}$`). Refused if it resolves into or over `t1-ui-head`, if it leaves `artifacts/models`, if it passes through a link or junction, or if it exists. Paths are compared resolved and case-folded (`normcase`, as on Windows). **Never created by pre-flight** |
| D. Model safety | The T1 artifact's SHA-256 must equal ADR-0003's recorded `ba6d9e93…5179d0` before **and** after pre-flight; any change stops it. Nothing writes into the T1 directory |
| E. Configuration | `validate_run_config`: every field required, no defaults; architecture must be `head.UiHead` at the head's input size, stride and class order; TEST references refused. Proposed values in `configs/train-v2-first-experiment.PROPOSED.json`, **pending owner review** (`training-config-proposal.md`) |
| F. Provenance | The future `run-record.json` is assembled: git commit and tracked-change flag, dataset version, TRAIN and DEV manifest hashes, G10 configuration, threshold and evidence hashes and approval, architecture, hyper-parameters, seed, run-config hash and approval, environment and package versions, output directory, T1 hash, and the label UNADOPTED. The output model hashes are left for a future run |
| Execution | **None.** There is no training function. Without `--preflight` the command refuses (exit 3) |

`train_v2.py` imports nothing from `train.py`, and does not call, run or subclass it.

### 4. Static safety tests (`tests/test_train_v2.py`, 37 tests)

| # | Guarantee | How it is tested |
|---|---|---|
| 1 | No import of `train.py` | AST of `train_v2.py`, `data_v2.py` and `dry_run_v2.py`: no `import train`, `from train`, `import_module("train")` or `__import__("train")` |
| 2 | v1 trainer never invoked | no `train.py` in code strings; no `runpy`, `system`, `exec`, `eval` or spawn; the only subprocess is `["git", …]` |
| 3 | No TEST split or path | no `"test"`, `manifest-test` or `frames-test` in code strings; the proposed run config mentions no TEST, and a config that does is refused |
| 4 | Separate TRAIN and DEV interfaces | `load_train` and `load_dev` each call `load_accepted_split` with a literal `"train"` / `"dev"`; no function takes a `split` parameter |
| 5 | Dataset approval required | an unapproved G10 configuration is refused |
| 6 | G10 evidence required | a missing evidence file, or none given, is refused |
| 7 | Manifest hashes checked | a rebuilt DEV manifest is refused |
| 8 | Output cannot overwrite T1 | `t1-ui-head`, its subfolders, `..` routes, `artifacts/models` itself, paths outside it, `T1-UI-HEAD` (Windows case folding), a **junction** into T1, and escaping run ids — all refused |
| 9 | Existing run destination refused | yes |
| 10 | No training in tests | AST: no `train`, `fit`, `execute` or `step` function and no `backward`, `step`, `zero_grad`, `save` or `export` call. Pre-flight runs with `UiHead.__init__`, `Optimizer.__init__`, `Module.__call__`, `Tensor.backward` and `torch.save` **trapped**, and writes no file. Running without `--preflight` returns 3 |
| — | T1 hash provenance | the constant appears in ADR-0003, and its prefix in the registry's feasibility matrix |
| — | Configuration validation | missing fields, TEST, class order, optimizer, learning rate, batch size, early stopping, loss, approval |

### 5. Pre-flight on candidate 2 (`logs/w1-preflight-candidate-2.json`)

- **Mode and data:** PRE-FLIGHT ONLY. G10 APPROVED. Acceptance claimed: every cell meets its minimum.
- **TRAIN:** 600 samples and frames verified; 5,280 positives kept, 165 per cell. Excluded: 480 partial and 480 full occlusion cases, 0 G10 borderline, 0 G10 invisible.
- **DEV:** 160 samples and frames; 1,408 positives, 44 per cell. Excluded: 128 + 128 occlusion cases, 0 for G10.
- **Tensor path:** every sample passes the v1 tensor path, with every target inside the letterbox and assigned a positive cell.
- **Plan:** 150 steps per epoch × at most 40 epochs = at most 6,000 steps (proposed values).
- **Output:** `artifacts/models/t1-ui-head-v2-first-experiment-01` passes the safety checks and was **not created**.
- **T1:** `ba6d9e93…5179d0` before and after, unchanged.

### 6. A correction

The M22.7 and M22.8 reports said the T1 hash "matches the registry". More precisely:
- **Full SHA-256:** recorded in the frozen **ADR-0003**.
- **Prefix:** the agentos registry (`feasibility-matrix.md`) holds `ba6d9e93695b22d1…`.

The T1 artifact matches both. `train_v2.py` takes its value from ADR-0003, and a test asserts both records agree.

### 7. Verification

See `decision.md`.

## Conclusion

Candidate 2 satisfies the owner's condition under the approved G10 rule, and the separate pipeline is in place up to, and not including, training. Before a run:
- approve the hyper-parameters;
- authorise the training execution;
- confirm the new CI job.

## Reproducibility

```bash
node tools/dataset/v2/audit-candidate.mjs --candidate=2 --g10=tools/dataset/v2/configs/g10-approved-candidate-2.json --g10-out=<file outside the repository>
python tools/detector/train_v2.py --preflight --candidate=2 --g10-config=tools/dataset/v2/configs/g10-approved-candidate-2.json --g10-evidence=<that file> --build-config=tools/dataset/v2/configs/m22.4-train-dev.json --run-config=tools/detector/configs/train-v2-first-experiment.PROPOSED.json --run-id=<id>
npm run verify
```
