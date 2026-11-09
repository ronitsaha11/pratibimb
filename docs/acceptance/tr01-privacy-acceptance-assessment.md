# TR-01 product privacy and acceptance assessment (OD-F)

> **Status:** static source assessment (M23.4, 2026-11-03, at `8767428`).
> - **Separate from T1:** TR-01 is a separate capability. **Disabling T1 (OD-P) does not disable TR-01.**
> - **Nothing changed or loaded:** no TR-01 code or integration was changed, and no weights were loaded.
> - **Acceptance:** **visual-only PII protection is NOT VERIFIED (M9), and is not accepted.**

## 1. Trace (FACT, source)

| Aspect | Finding | Source |
|---|---|---|
| Build-time hash | SHA-256 and size against `TR01_PACKAGE.onnx`; refuses to package on mismatch | `apps/extension/wxt.config.ts` |
| Runtime hash | the worker runs `bootstrapOrtRealm("tr01-worker")`, then `loadVerifiedModel({ pin: TR01_PACKAGE.onnx })` before any session | `apps/extension/host/tr01-worker.ts` |
| Worker boundary | a dedicated worker spawned by `tr01-host.ts`; frames are passed by `postMessage`; the worker "scrubs it when the run ends" (source comment) | `apps/extension/host-lib/tr01-host.ts`; `perception-realm.ts` header |
| Visual input | a copy of the **full decoded frame**, after the UI head finishes; only on a pass that captured a frame (gesture grant) | `perception-realm.ts` |
| Region generation | text boxes → `reportFromFullFrame(textOutcome, geometry, visualRegions)` → one `UNREAD_REGION` per visual region (`<canvas>`/`<img>`, geometry only) → fail-closed plan | `perception-realm.ts`; `visual-redaction.ts`; `packages/privacy/src/textFinding.ts` |
| Mask application | `sanitizeFrame` applies an opaque fill **in place** to the in-realm RGBA; the raw `ImageBitmap` is closed after decode | `perception-realm.ts` |
| Sanitised frame storage | `sanitized` holds the result, read through `sanitizedFrame()`; `null` if the plan is refused | same |
| Consumers of the sanitised frame | **reconfirmed:** only `serveTr01Probe` (`sanitizedFrame`, `encodeSanitized`) reads it. In a product build `#tr01-probe` resolves to `probe/tr01-absent.ts`, whose `serveTr01Probe` returns `false`. **No product reader** | `apps/extension/host/offscreen/main.ts`; `apps/extension/probe/tr01-absent.ts` |
| Product build compared with evidence build | the evidence build (`TR01_PROBE=1`) can read, encode and send the sanitised frame to a test sink (M10.7, M12). The product build cannot | `wxt.config.ts` aliases; `frame.ts` |
| Effect on any boundary | TR-01 changes **no** DOM value, text, reference, handoff or reasoner request. Only a redaction **summary** (codes, counts, timings) enters the run report | `perception-realm.ts`; `extension-run.ts` |

## 2. Is visual-only PII protection demonstrated in the shipped product?

**No.**
- **Evidence-build masking:** masking was demonstrated on synthetic pages in evidence builds (M10; `run-gesture-redaction.mjs`, `run-visual-mask.mjs`).
- **The shipped product:** it has no reader of the masked frame, and no frame leaves (three locks; ADR-0012 §16).
- **INFERENCE:** in Phase 1, TR-01 protects a frame that nothing consumes. Visual-only PII is kept out of the reasoner by the **structure-only design, not by TR-01.**
- **The mask itself:** whether TR-01's mask is complete enough to protect a frame is not established for the product. That is M9's "NOT VERIFIED".

## 3. Owner decision needed (OD-F, TR-01 acceptance)

**Options** (none chosen):
1. **Accept "no pixel leaves" as Phase 1 visual-PII protection.** Record TR-01 masking as a dormant safeguard for a future frame path (Phase 2 / QG-04-F) that needs its own acceptance evidence.
2. **Require TR-01 product-acceptance evidence now** (corpus, method; OD-D). Note that there is no product consumer to protect.
3. **Treat visual-only PII as out of Phase 1 scope,** with the limitation declared.

**What is not decided:** any change to TR-01's integration.

## 4. Interaction with OD-P (INFERENCE)

**After T1 is disabled, on a pass with a frame:**
- capture still happens;
- TR-01 still runs and masks;
- **but** `visual()` declares the structural floor (`backend: "none"`, `tiers_fired: ["T0","T2"]`), because it gates on `detector.ran`;
- so the handoff would not record that TR-01 ran.

**What follows (INFERENCE):** none of this is a privacy regression, because no frame or mask leaves. But it raises **OD-R:** whether Phase 1 should keep capturing frames at all once T1 is gone. **This is a question only; no change is proposed.**
