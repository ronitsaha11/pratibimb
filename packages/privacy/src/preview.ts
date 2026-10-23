/**
 * M19 — WHAT A PERSON IS SHOWN OF A STORED VALUE BEFORE ALLOWING IT INTO A FIELD.
 *
 * The owner's M19 decision: just-in-time, one-time consent in the extension's own side panel, with a
 * masked preview "when it can be produced safely". This file is that preview, and it is deliberately
 * narrow, because `hints.ts` states the rule it must not break casually: a masked rendering is a
 * substring of the value. So a substring is produced in exactly one case and nowhere else:
 *
 * - **PHONE, when the value IS an Indian mobile number by the classifier's own validator**
 *   (`normaliseIndianMobile`): ten digits of known structure. The preview is the last two digits
 *   behind eight dots — the owner's own example. Two digits of a ten-digit number, shown to the
 *   person whose number it is.
 * - **Everything else** — NAME, DOB, AADHAAR, a phone that does not validate, any class added later —
 *   gets the generic indicator. No rule is invented for a structure this repository has not approved
 *   a masking policy for (an Aadhaar or date mask may be a later owner decision; it is not made here).
 *
 * WHERE IT MAY GO. Into the extension's own consent UI, and nowhere else: not a handoff, not a
 * prompt, not a record, not a log. It is computed in the realm that holds the vault, only for a
 * reference that is live and fits the field it is about to go into, and the page realm passes the
 * reply through the same held-value scan as every other reply before it leaves.
 */
import { type FieldClass } from "./classes.js";
import { fieldFit } from "./fill.js";
import { REVEAL } from "./internal.js";
import { normaliseIndianMobile } from "./validators.js";
import { type Vault } from "./vault.js";

export type ConsentPreview =
  /** A structure-validated value, masked to a short suffix. */
  | { readonly style: "SUFFIX"; readonly text: string }
  /** No approved masking for this value: the type is shown, the value is not. */
  | { readonly style: "GENERIC"; readonly text: string };

/** The generic indicator: fixed width, so it does not even say how long the value is. */
export const GENERIC_PREVIEW = "••••••";

/** How many trailing digits of a validated mobile number the preview shows (the owner's example). */
export const PHONE_PREVIEW_SUFFIX = 2;

export type PreviewRefusal = "VAULT_CLOSED" | "UNKNOWN_TOKEN" | "CONSUMED" | "FIELD_DOES_NOT_FIT";

/**
 * The preview for one pending use: this reference, into a field that accepts `accepts`.
 *
 * Refused for a reference the vault does not hold or has spent, and for a field the reference does
 * not fit — a preview is only ever shown for a use the binder could allow.
 */
export function consentPreview(
  vault: Vault,
  ref: string,
  accepts: FieldClass
): { readonly ok: true; readonly preview: ConsentPreview } | { readonly ok: false; readonly cause: PreviewRefusal } {
  if (vault.isDestroyed) return { ok: false, cause: "VAULT_CLOSED" };
  const descriptor = vault.describe(ref);
  if (!descriptor) return { ok: false, cause: "UNKNOWN_TOKEN" };
  if (descriptor.consumed) return { ok: false, cause: "CONSUMED" };
  if (fieldFit(accepts, descriptor.piiClass) !== "FITS") return { ok: false, cause: "FIELD_DOES_NOT_FIT" };

  if (descriptor.piiClass === "PHONE") {
    const value = vault[REVEAL](ref);
    const mobile = value === null ? null : normaliseIndianMobile(value);
    if (mobile !== null) {
      return { ok: true, preview: Object.freeze({ style: "SUFFIX", text: `${"•".repeat(mobile.length - PHONE_PREVIEW_SUFFIX)}${mobile.slice(-PHONE_PREVIEW_SUFFIX)}` }) };
    }
  }
  return { ok: true, preview: Object.freeze({ style: "GENERIC", text: GENERIC_PREVIEW }) };
}
