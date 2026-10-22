# M13 — decision record (unit 1: CSP)

**Verdicts:**

| Item | Result |
|---|---|
| CSP v2 (ADR-0013) for CSP-governed channels | **PASS** |
| Legitimate resources | **PASS** |
| Product/evidence distinction | **MACHINE-VERIFIED** |
| Network boundary against injected code | **NOT CLOSED: F-M13-1, top-level navigation, outside CSP** |
| M13 | **STOPPED** on the stop condition "injected code can still reach an unauthorized origin" |
| J7 (Parts E–N) | **NOT RUN**, pending the owner |

## What changed

- **The policy:** the extension_pages CSP is v1 → v2 (ADR-0013 amends ADR-0001 §7):
  - `default-src 'none'`;
  - `worker-src 'self'`;
  - `style-src` by hash;
  - `object-src`, `base-uri` and `form-action` set to `'none'`.
- **The product build** can reach exactly `http://127.0.0.1:8995/v1/chat/completions`. **Evidence
  builds** can reach the collector origin.
- **Gesture harnesses** compare manifests with that one source normalised, and refuse unless the
  difference is exactly that.

## Findings

- **F-M12-1: RESOLVED** for img and iframe, and for every other CSP-governed channel (0 arrivals,
  three realms, two builds).
- **F-M13-1: OPEN.** These channels still reached the foreign origin in both builds:
  - `window.open`, `<a target=_blank>` and `open()` from an about:blank iframe, in the offscreen
    document;
  - `chrome.tabs.create` and `chrome.windows.create`, in the service worker.

  No CSP directive governs top-level navigation.

## Blockers

| Blocker | Status |
|---|---|
| B7 | OPEN (F-M13-1) |
| B1, B2, B4, B5, B6 | Unchanged from M12 |

## Owner decision required

How to treat F-M13-1 (ADR-0013 §9):

- **(a)** accept top-level navigation as a documented residual, because it requires code already
  executing in an extension realm, and continue M13 to J7;
- **(b)** fund a measured spike of a non-CSP control, e.g. `declarativeNetRequest` scoped to the
  extension as initiator, which needs a new permission and its own ADR;
- **(c)** keep M13 stopped.

---

## Amendment 2026-10-02 — the owner decision, and J7's status

The owner chose **(a)**: accept extension-realm top-level navigation as a documented residual and
continue to J7. **F-M13-1 remains OPEN**; no CSP directive was changed and no permission was added.

**J7 (Parts E–N) has now been RUN, on W2**, and is **OPEN** — `G4 deterministicAcrossPasses` failed in
1 of 24 observations (DPR 1.0 / H1); G1, G2 and G3 passed 24/24. The record and analysis live with the
harness that produced them:
`../M12-qg04-enforcement/logs/w2-cft-stream-re1.json` and
`../M12-qg04-enforcement/logs/w2-j7-stream-determinism.md`.

The line above — "J7 (Parts E–N) · **NOT RUN**, pending the owner" — described unit 1 and is left as
written. This amendment supersedes it.

---

## Amendment 2026-10-22 — the W1 J7 run, recovered

J7 Parts E–N had **also** been run on **W1** on 2026-10-01, the day *before* the W2 run above, with the
harness `tests/browser/extension/run-stream-j7.mjs`. Its records were never pushed and were found
uncommitted during the W1 recovery of 2026-10-22. They are published unchanged:

- `logs/w1-cft-stream-j7.json`: formal, real gesture route, 72 observations;
- `logs/w1-cft-stream-j7-dryrun.json`: degraded route, not stream evidence.

**The formal record's own `"j7": "CLOSED"` label is the harness's rule, not J7 status.** What the run
supports and does not support, including that it is one complete run with `scaleToCss = 1` throughout,
is in `../M12-qg04-enforcement/logs/w1-j7-evidence-addendum-2026-10-22.md`.

**J7 remains OPEN.** The four owner decisions in `w2-j7-owner-decision-package.md` remain the owner's.
The amendment above is left as written.
