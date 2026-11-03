# M22 outstanding register (M22.19)

**What this is:** every unresolved item carried out of M22, each with an explicit status.

**Statuses:** Completed · Documentation only · Deferred to FR-01 · Transferred to general project engineering · Awaiting owner decision · Not authorised.

**Nothing here is resolved by inference.** An owner decision stays open until the owner takes it.

| # | Item | Source | Status | Note |
|---|---|---|---|---|
| R-01 | Hosted Python CI job (`detector-adapter`) never executed on GitHub | M22.8 | **Awaiting owner decision** | needs the branch to be pushed (R-10). Local `npm run verify` runs are not hosted CI |
| R-02 | Assignment-order ADR proposal: smaller vs larger object owns a shared cell | M22.11, M22.12 (`adr-proposal-target-assignment-order.md`) | **Awaiting owner decision** | no effect on candidate 2 (0 collisions); `targets.py` unchanged |
| R-03 | Pixel/label offset defect (`preprocessing-contract.md` §6); M22.10 D13 | M22.10 | **Awaiting owner decision** | inactive on candidate 2 (0 of 760 samples); an ADR candidate before any adoption |
| R-04 | F6 failure-code semantics: resume refusals raised inside the `try` are recorded as F6 ("T1 changed") | M22.17 | **Awaiting owner decision** | failure codes are part of the approved specification; then implementation |
| R-05 | Resume overwrites the M22.13 `torch` settings block | M22.17 | **Transferred to general project engineering** | small additive fix (a per-session copy); per-session `hardware` already preserves each session's thread readings |
| R-06 | Whether the main clock (`perf_counter` / QPC) advances across system suspension | M22.15–M22.17 | **Documentation only** | UNKNOWN; the derived suspend figure does not depend on it. An optional owner-run, non-training observation could settle it |
| R-07 | Real-run telemetry validation (all fields, multi-session) | M22.15–M22.17 | **Not authorised** | needs a real training run, which is not authorised. Verified only with fakes and synthetic fixtures |
| R-08 | Sealed TEST: hardening its authorisation; building and sealing a v2 TEST once | M22.1 §4 item 5; M22.4 limitation | **Deferred to FR-01** | a prerequisite for any unbiased claim |
| R-09 | Seed repeats and a wall-clock budget for any further run | M22.10 D6, D7 | **Awaiting owner decision** | no further run is authorised |
| R-10 | Branch publication, PR and merge of `spike/m22-small-target-recall` | — | **Awaiting owner decision** | local only; no upstream, no PR |
| R-11 | M22.14 design was not recorded in the repository | M22.18 | **Completed** | recorded as a status record in `7558bc6` (`M22.14-dev-evaluation-design/`) |
| R-12 | M22.18 audit was not recorded in the repository | M22.18 | **Completed** | recorded in `7558bc6` (`M22.18-closure-audit/`) |
| R-13 | M22 runner block missing from `agentos/blockers.md` | M22.18 | **Completed** | added as B-07 in M22.19; the block itself is **not** resolved |
| R-14 | All M22.14 owner decisions (inference, blocker ruling, `test`-split requirement, full-occlusion rule, headline view; export and the `onnxruntime` version) | M22.14 | **Deferred to FR-01** | never decided; not approvals |
| R-15 | Cause of M22.13's slow epochs (13–16, 28–36; epoch 39 at 31,445 s) | M22.13, M22.15 | **Documentation only** | UNKNOWN; no per-epoch evidence was recorded |
| R-16 | Earlier claim of over-length commit subjects (`a7e905c`, `12ac35f`, `579bea6`) | M22.9, M22.10, M22.18 | **Completed** | corrected: within the limit counted after the `: ` (`CONTRIBUTING.md` §3) |
| R-17 | Intermittent 5,000 ms vitest timeout in `apps/extension/test/visualRedaction.test.ts` | M22.15 | **Transferred to general project engineering** | seen once; unrelated to M22 code |
