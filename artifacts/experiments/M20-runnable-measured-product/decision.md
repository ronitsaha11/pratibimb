# M20 — decision record

| Part | Verdict | Evidence |
|---|---|---|
| Product reasoner launcher (`npm run reasoner`) | **PASS** on W1 | `logs/w1-launcher-lifecycle-20261023T203334Z.json` |
| W1 product benchmark | **COMPLETE** on W1 (measured; one machine) | `../../benchmarks/M20-w1-product/w1-cft-product-benchmark-20261023T203520Z.json` |
| Person-operated run in Chrome's real side panel (Allow once, Deny) | **PASS** on W1, 17 of 17 checks; one run per scenario | `logs/w1-cft-product-sidepanel-smoke-20261023T213953Z.json` |
| Earlier person-run session (harness timed out and closed the browser) | **FAIL — not counted**; kept as written | `logs/w1-cft-product-sidepanel-smoke-20261023T205646Z.json` |

Nothing in this record changes a gate status, an ADR, the CSP, the manifest permissions, the model
pin or the endpoint. J7/B5 and D1–D4 are untouched. Production frame egress remains blocked.
