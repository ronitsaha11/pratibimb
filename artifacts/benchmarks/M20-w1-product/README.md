# M20 — W1 product benchmark

> **Measured on W1 only, 2026-10-23 (UTC).** One machine, one browser, one backend, synthetic pages,
> six tasks per run. **No reliability rate, no cross-machine claim, not a privacy-metric run, not J7.**
> Reference record: [`w1-cft-product-benchmark-20261023T203520Z.json`](w1-cft-product-benchmark-20261023T203520Z.json)
> (raw OS samples in the matching `.resources.json`).

## What was measured

The product as it ships today. The product launcher (`scripts/reasoner/reasoner.mjs`, the code `npm
run reasoner` runs) was started cold by the harness. The **product build** of the extension (no
evidence flags) ran in Chrome for Testing. The workload was six bounded multi-turn tasks through the
control plane, each on a fresh document, alternating:

| Task | Page | maxTurns | Steps per completed run |
|---|---|---|---|
| `application` | `tests/browser/demo/fixture/application.html` (M2) | 2 | 2 (insert + click, then `done`) |
| `two-step` | `tests/browser/extension/fixture/two-step.html` (M15) | 3 | 3 (click, click, `done`) |

**The ten-step task.** The benchmark contract measures client resources "over a ten-step task". A step
is one pipeline pass (one turn), and one task may take at most `MAX_TASK_TURNS = 5` turns. That cap
was **not** raised. Instead, 6 bounded tasks ran back to back in one browser and one model process:
**15 steps** in all. The record states this in `workload.tenStepNote`.

**Approvals.** The application task restores a stored value, which needs an approval. The harness
answered it through the control plane's existing grant path, as the M15 harness does; **no person was
involved**. Its wait is `grantMs` (polled every 20 ms). It is excluded from `machineMs`
(derived: `totalMs − grantMs − clarifyMs`).

## Environment

| Item | Value |
|---|---|
| Machine | W1 `LAPTOP-6E14K34L`: Intel Core 7 240H, 16 logical cores, 25.4 GB RAM, Windows 10.0.26300 |
| Browser | Chrome for Testing **153.0.8010.12**, headed |
| Extension | Product build. CSP `connect-src 'self' http://127.0.0.1:8995/v1/chat/completions`. Permissions unchanged. |
| Reasoner backend | llama.cpp **b10956 CPU x64**, `-c 4096 -t 8 --no-webui`. The tables below were recorded before the B1 fix (PR #91 review), when the model server had no key and its slots endpoint was on. It now requires a per-launch key and runs with `--no-slots`. The post-fix runs are listed under "Runs in this directory". Qwen2.5-0.5B-Instruct Q4_K_M @ `9217f5db79a2`, SHA-256 `74a4da8c…d7a9db`, verified in full by the launcher. |
| Perception in this workload | DOM/text structure only. Without the person's toolbar gesture the product build captures no frame (ADR-0009), and this harness makes none: all 33 visual passes were refused `NO_ACTIVE_TAB_GRANT`. |
| Node | v24.19.0 |

## Results — all `measured` unless marked `derived`

**Outcomes:** 6 of 6 tasks `COMPLETED_AS_DECLARED`, 15 of 15 steps reached their end. All tasks are
in the tables whatever their outcome; none failed in this run.

**Percentile method:** nearest rank. The value at 1-based rank ⌈p/100 · n⌉ of the n sorted samples
is always an observed sample. With n = 14, p95 is the 14th, i.e. the maximum. A stage with no samples
is `null`, never 0.

### Per stage, ms (offscreen document, monotonic clock)

| Stage | Warm n | Warm p50 | Warm p95 | Cold first step |
|---|---|---|---|---|
| Read the page (`observeMs`) | 14 | 1.6 | 3.4 | 483.4 |
| Sanitize | 14 | 2.9 | 7.0 | 11.1 |
| Verify the handoff | 14 | 0 | 0 | 0 |
| Reasoner round trip (`sendMs`) | 14 | **438.0** | **1391.4** | **2171.2** |
| Validate the plan | 14 | 0 | 0.1 | 0.3 |
| Approval wait (`grantMs`, harness-answered) | 8 | 0 | 28.7 | 2.5 |
| Restore the value | 8 | 0 | 2.0 | 2.1 |
| Re-read the page | 8 | 1.7 | 2.0 | 1.9 |
| Structure check | 8 | 0.7 | 0.9 | 1.0 |
| Click + read result (`actMs`) | 8 | 3.5 | 4.4 | 5.9 |
| of which: read result | 8 | 1.5 | 2.3 | 1.9 |
| **Step total** | 14 | **448.7** | **1438.8** | **2680.6** |
| Step, machine only (`machineMs`, derived) | 14 | 448.7 | 1410.1 | 2678.1 |

A `0` is a measurement below the offscreen document's clock resolution (about 0.1 ms here), not a
missing value. Steps without a click (`done` turns) report no restore/refresh/act stages, so those
stages have n = 8.

By task, warm step total: `application` p50 950.5 / p95 1438.8 ms (n = 5). `two-step` p50 378.6 /
p95 477.7 ms (n = 9). The application step asks the model for a two-step plan with an insert, which
takes longer.

**Task wall time** (harness, around each control-plane task, including messaging and polling): warm
p50 1192.6 / p95 2446.9 ms (n = 5); cold 3674.0 ms (n = 1).

**Network-free steps** (derived: steps minus POSTs to the reasoner endpoint seen over CDP): **0 of 15**.
Every step asks the model; this build has no local-decision path. **Cache hit rate:** not applicable,
because no screen-state cache exists. The offscreen document's only other requests went to the
extension's own resources (cold task only).

### Cold start

| | ms |
|---|---|
| Launcher: full SHA-256 of weights + runtime (`verifyMs`) | 641 |
| Launcher: llama-server spawn → healthy (`modelLoadMs`) | 1867 |
| Launcher: until ready (`totalMs`) | 2526 |
| Browser launch → offscreen document ready | 970.4 |
| First step (first inference, first extension run) | 2680.6 |

This is a cold **process** start, not a cold disk: the OS file cache may already have held the
weights. Across the four recorded launcher starts (the three benchmark runs here and the M20 launcher
lifecycle check), `modelLoadMs` measured 1072–3169 ms.

### Peak resources (OS counters every ~500 ms, 26 samples; JS heap via CDP every ~500 ms)

| Process group | Peak sampled working set | Peak sampled private bytes | Σ per-process OS peak WS (upper bound) | Peak CPU (cores busy) |
|---|---|---|---|---|
| Chrome for Testing (10 processes) | 888.8 MB | 537.2 MB | 974.5 MB | 1.86 |
| llama-server | 610.1 MB | 261.3 MB | 626.2 MB | 8.54 (of 16 logical; `-t 8`) |
| launcher (node) | 65.8 MB | 69.4 MB | 167.3 MB | 0.06 |

The launcher's OS-recorded peak is above its sampled peak because hashing the 491 MB weights happens
before the sampler starts. JS heap peak used: offscreen document 7.26 MB, service worker 3.01 MB.
**GPU memory: not measured.** No GPU backend is in this path: the model runs on llama.cpp's CPU
build, and no ONNX/WebGPU session is created in this workload.

### On disk

| | bytes |
|---|---|
| Model weights | 491,400,032 |
| llama.cpp runtime, installed | 65,156,411 |
| llama.cpp runtime archive | 18,426,398 |
| Extension product build (`.output/chrome-mv3`) | 33,975,912 |

### Tier firing (counts from the extension's port report)

DOM/text structure observations: 33. Structure reads: 9. Visual perception passes: 33, of which ran: 0
(all `NO_ACTIVE_TAB_GRANT`). Detector ran: 0.

## Runs in this directory

| Run | Status |
|---|---|
| `20261023T203123Z` | Complete, **but the browser group was not measured**: the harness passed the browser path with forward slashes, and Windows reports image paths with backslashes, so no Chrome process matched. Fixed in the harness (`resolve`). Kept as written. |
| `20261023T203221Z` | Complete and valid. Its record does not say where the cold task's 3 non-endpoint requests went. |
| **`20261023T203520Z`** | **Reference for the tables above.** Adds the origins of non-endpoint requests (origin only). Model server **without** a key (before B1). |
| `20261024T004816Z` | After the B1 fix (keyed model server, `--no-slots`): complete, 6/6. **Its backend label is wrong**: it was built from `pin.json` and omits `--no-slots` and the key. Fixed in the harness. Kept as written. |
| **`20261024T004941Z`** | **After the B1 fix, correctly labelled:** `-c 4096 -t 8 --no-webui --no-slots`, per-launch key (never recorded). Complete, 6/6, 15 steps. |

The three pre-fix runs agree within run-to-run noise on every stage figure (warm `sendMs` p50
442.8 / 440.8 / 438.0 ms).

The two post-fix runs measured warm `sendMs` p50 507.8 and 476.4 ms. Warm step totals were p50
520.5 and 488.2 ms, and p95 1606.2 and 1503.4 ms. All of these are higher than before.

**This difference is not attributed.** The key adds one header comparison per request to the model
server. The post-fix runs came hours later, on a machine that had been under load. Two runs on each
side cannot separate the two causes. The tables above stay the pre-fix reference; a like-for-like
comparison would need interleaved runs on a rested machine.

## Not comparable with the projected budgets

`docs/testing/benchmark-contract.md` Rule 5 budgets a different pipeline, `projected`: a server VLM
(Qwen3-VL-4B) over redacted frames, with capture, detection, OCR and frame verification on every
pre-egress step. This build sends a structure-only handoff to a local 0.5B text model and captures no
frame. No figure here is compared with those budgets, and none of them is promoted to measured.

## Reproduce

```bash
npm run reasoner:stop
```
```bash
CHROME_PATH="<Chrome for Testing 153 chrome.exe>" node tests/browser/extension/run-product-benchmark.mjs
```

`BENCH_RUNS_PER_TASK` (default 3) sets runs per task. Each run writes a new record named by its start
time; an existing record is never replaced. The harness refuses to start if port 8995 or 8977 is busy,
so stop any running reasoner first.
