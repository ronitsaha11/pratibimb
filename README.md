# PratiBimb

**प्रतिबिम्ब — a reflection that reveals the structure, never the identity.**

> *On-device Visual Perception for Light-weight Browser Agents*

---

## What it is

A browser agent that can see your screen and act on it, **without your screen ever reaching
the server**.

Local models read the page. Every sensitive span is replaced by a typed placeholder that
carries the *shape* of the data without its *content*. The server plans in placeholders.
The client substitutes the real value at the instant of execution.

```
On the device                      On the wire
Applicant  Rajesh Kumar     -->    Applicant  <PII:NAME:1>
Aadhaar    XXXX XXXX XXXX   -->    Aadhaar    <PII:AADHAAR:1>
Mobile     +91 XXXXXXXXXX   -->    Mobile     <PII:PHONE:1>
Photograph present          -->    Photograph FACE:1
```

Layout, field roles and data types survive. **Not one identifying character does.**
The server still knows there is a twelve-digit numeric field labelled Aadhaar at those
coordinates, and can plan around it.

**The product thesis: a privacy firewall that happens to power an agent.**

---

## Status

**A working, measured prototype on one machine. Not a product release.** (Updated in M20, 2026-10-23
UTC. The previous text here said "no product code has been written", which had been false since
2026-09-10.)

What runs today, on Windows x64 (W1), against **synthetic pages on `127.0.0.1` only**:

- **Browser extension.** A Chrome MV3 extension (`apps/extension`). It reads the page's structure
  locally, replaces every stored value with a typed reference, and sends only that sanitized,
  verified handoff to the reasoner.
- **Local reasoner.** Qwen2.5-0.5B-Instruct (Q4_K_M) under llama.cpp b10956, started by
  `npm run reasoner` and reachable only on the extension's one permitted endpoint.
- **Every model plan stays untrusted.** It is parsed, validated, re-checked by the privacy binder,
  and refreshed before anything happens. A stored value is restored only after the person allows
  that one restoration in the side panel. A click goes through the execution gate and is verified
  against the result the person declared.
- **Measured.** Every stage of every run is timed and shown in the side panel. W1 figures are in
  [`artifacts/benchmarks/M20-w1-product/`](artifacts/benchmarks/M20-w1-product/README.md).

What it is **not** (each is a recorded decision or an open item, not an oversight):

- **No frame leaves the device.** Production frame egress is blocked (ADR-0012), and the reasoner
  sees structure only.
- **J7/B5** (frame-handoff authentication) and the owner decisions **D1–D4** are open.
- **The visual UI detector is not adopted** (QG-03a open).
- **Synthetic loopback pages only.** Widening to ordinary websites needs an ADR.
- **Every step calls the model:** there is no cache and no local-decision step yet.
- **Top-level navigation is outside CSP** (F-M13-1): an open residual, documented.

See [`agentos/state.md`](agentos/state.md) for the current state with evidence, and
[`agentos/blockers.md`](agentos/blockers.md) for blockers.

---

## Run it (W1, from a clean checkout)

**Prerequisites:**

- Windows x64: the pinned runtime is llama.cpp's `win-cpu-x64` build.
- Node 20 or later (measured with v24.19.0), git, and Python 3 (for `npm run verify`).
- About 600 MB free for the model and runtime, and network access for the one-time downloads.

**1. Install dependencies, and Chrome for Testing** (Playwright 1.63.0 installs CfT 153, under
`%LOCALAPPDATA%\ms-playwright\chromium-1243\chrome-win64\chrome.exe`):

```bash
npm ci
```
```bash
npx playwright install chromium
```

**2. Fetch the pinned model and runtime** (once; about 491 MB plus 18 MB; never committed). This
records each file's SHA-256 and the licence at the pinned revision.

```bash
node artifacts/experiments/LOOP-2-local-reasoner-egress/harness/fetch-model.mjs
```

**3. Check the pins and the ports** (starts nothing):

```bash
npm run reasoner:check
```

**4. Start the reasoner**, in its own terminal, and leave it running:

```bash
npm run reasoner
```

It prints `ready: http://127.0.0.1:8995/v1/chat/completions`. If the model or runtime on disk is not
exactly what [`scripts/reasoner/pin.json`](scripts/reasoner/pin.json) pins, it refuses to start and
says why (exit 2). If port 8995 or 8977 is busy, it says so and stops nothing. Ctrl+C stops it;
from another terminal, `npm run reasoner:stop` stops an instance it started, after checking each
process is still its own.

**5. Build the extension** (the product build; no evidence flags):

```bash
npm run build -w apps/extension
```

**6. Use it in Chrome's side panel.** The harness below starts the demo page, launches Chrome for
Testing with the build loaded, and prints each step. It never clicks anything for you, and it
writes a value-free record of what happened.

```bash
CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium-1243/chrome-win64/chrome.exe" node tests/browser/extension/run-product-smoke.mjs
```

In the browser, open Chrome's side panel (the side-panel button at the right of the toolbar) and
choose **PratiBimb**. Type the goal, press **Read this page**, declare what the Submit button should
do, press **Start task**, and answer the consent request. **Allow once** restores the value once;
**Deny** restores nothing. The panel then shows each turn's outcome and its measured stage timings.
Records go to `artifacts/experiments/M20-runnable-measured-product/logs/`, one new file per run.

**Outputs:**

- **The side panel:** each turn's outcome, plus timings in ms. "Not measured" means the stage did
  not run, and "waiting for you" is your time.
- **The reasoner's terminal:** one line per request (status, sizes, latency), never a body.
- **The smoke record:** the run's event trail and timings, as codes and times only.

**Reproduce the measurements:**

- **Benchmark** (stop any running reasoner first; it starts its own, cold):
  `node tests/browser/extension/run-product-benchmark.mjs` with `CHROME_PATH` set as above.
- **Launcher lifecycle:**
  `node artifacts/experiments/M20-runnable-measured-product/harness/launcher-lifecycle.mjs`.
- **Full test suite:** `npm run verify`.

**Limitations of these instructions:**

- Measured on W1 only.
- Chrome for Testing is used because branded Chrome 152+ refuses `--load-extension`.
- Loading the build by hand (`chrome://extensions` → Developer mode → Load unpacked →
  `apps/extension/.output/chrome-mv3`) is not what the harness does, and was not exercised in M20.

---

## Start here

| If you are | Read |
|---|---|
| An AI assistant opening this repository | **`AGENTS.md`** — first, and completely |
| A new engineer | `AGENTS.md` → `docs/architecture/vision.md` → `docs/architecture/constitution.md` |
| Reviewing the architecture | `docs/architecture/constitution.md` — the constitution |
| Touching anything security-related | `docs/security/security-invariants.md` |
| Adding or changing a model | `agentos/workflows/model-adoption.md` |
| Wondering what is actually proven | `agentos/state.md` "Current state" (each claim names its evidence) and `agentos/registry/feasibility-matrix.md` |

---

## Repository map

```
AGENTS.md                      entrypoint for AI assistants - read first
ENGINEERING_PRINCIPLES.md      how we work
CONTRIBUTING.md                branch / commit / PR / checkpoint rules
SECURITY.md                    what must never enter this repository

docs/
  dossier/                     THE GOVERNING ARTIFACT (PDF + text + section map)
  architecture/
    constitution.md            frozen vs replaceable vs not-yet-known
    vision.md                  the problem, the thesis, the rubric
    coordinate-contract.md     CSS viewport pixels, canonical
    manifest-schema.md         redaction manifest v1.1
    action-schema.md           allowlist, dual-mode type, origin policy
    glossary.md                shared vocabulary; terms we refuse to use
  security/
    security-invariants.md     Invariant E + INV-01..INV-25
    threat-model.md            four adversaries, stated scope limit
  testing/
    benchmark-contract.md      what every implementation must measure
  operations/                  git workflow, repository structure
  adr/                         architecture decision records + index

agentos/                       the engineering OS - development only, NEVER the product
  state.md                     live project state
  agents/                      seven specialist reviewer contracts
  workflows/                   spike / implementation / model-adoption / release
  gates/                       QG-01 .. QG-06
  registry/                    model registry + 20-cell feasibility matrix
  templates/                   ADR, experiment log, risk register

artifacts/
  experiments/                 reproducible spike evidence
  reviews/                     audits

.github/                       PR template, issue forms, CI, CODEOWNERS
scripts/                       repository tooling
```

> `apps/extension` (the browser extension), `packages/*` (perception, privacy, plan, reasoner, agent,
> orchestrator, egress, security and the rest) and `scripts/reasoner/` (the product launcher) hold the
> product code. Until 2026-09-10 they did not exist, and this note said so. See
> `docs/operations/repository-structure.md`.

---

## The non-negotiables

1. No outbound request except through the **single egress module**, and only for a byte
   artifact whose **hash the verifier signed**.
2. The **vault is memory-only** and is destroyed on session end, tab change, and
   unconditionally before an origin change commits.
3. **Secrets cross as references.** Unknown tokens abort. A literal aimed at a redacted
   field aborts. **A literal matching a vault value is a leak, and halts the session.**
4. **Verification is fail-closed.** The verifier can block a send; it is not advisory.
5. **All coordinates are CSS viewport pixels.**
6. **No model is accepted because its documentation says it should work.**

Full list: `docs/security/security-invariants.md`.
