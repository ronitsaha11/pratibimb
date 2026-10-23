# M19 — decision record

The privacy-UX decision is recorded as **ADR-0014** (owner-directed, M19 brief):
[`docs/adr/ADR-0014-panel-consent-with-masked-preview.md`](../../../docs/adr/ADR-0014-panel-consent-with-masked-preview.md).

## Changes a reviewer should see explicitly

1. **A second reader of the vault's reveal path.** `packages/privacy/src/preview.ts` reads a value
   in order to mask it. `packages/privacy/test/boundaries.test.ts` now names it beside `bind.ts`, and
   `preview.test.ts` pins what it may return.
2. **The mobile normaliser fix** (`packages/privacy/src/validators.ts`). This changes classification
   for ten-digit mobiles beginning 91, which were previously not classified as PHONE.
3. **Panel consent applies only to panel-started tasks.** Control-plane runs keep `requestGrant`;
   that path is unchanged.

## Still for the owner

- Masks for classes other than a validated mobile number (for example the UIDAI masked-Aadhaar
  convention).
- A time limit on consent requests (ADR-0008 §5). None is added.
- Whether panel consent should also govern control-plane runs.
- M16 Q1–Q3, J7 / B5 / D1–D4, F-M13-1 and production frame egress: unchanged and open.
