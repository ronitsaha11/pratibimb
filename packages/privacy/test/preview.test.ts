/**
 * M19 — the consent preview: what a person may see of a stored value before allowing it into a field.
 *
 * The rule is narrow on purpose: a validated Indian mobile number shows its last two digits; every
 * other class, and a phone that does not validate, shows a fixed generic indicator. These tests pin
 * that, refuse previews for uses the binder could not allow, and check the preview never carries
 * more of the value. Synthetic values only; assertions compare booleans so a failure prints none.
 */
import { describe, expect, it } from "vitest";
import { GENERIC_PREVIEW, consentPreview, createVault, type FieldClass, type PiiClass, type Vault } from "../src/index.js";

const ORIGIN = "http://127.0.0.1:8970";

const store = (vault: Vault, piiClass: PiiClass, value: string): string => {
  const issued = vault.store({ value, piiClass, target: `#${piiClass.toLowerCase()}` });
  if (!("issued" in issued) || !issued.issued) throw new Error("test setup: not issued");
  return issued.ref;
};

const fresh = () => createVault({ sessionId: "s-preview", origin: ORIGIN, now: () => 1 });

describe("what the preview shows", () => {
  it.each([
    ["a bare ten-digit mobile", "9000000042"],
    ["one with a +91 prefix and spaces", "+91 90000 00042"],
    ["one with a leading 0", "09000000042"],
  ])("%s: eight dots and the last two digits, nothing else", (_, value) => {
    const vault = fresh();
    const ref = store(vault, "PHONE", value);
    const result = consentPreview(vault, ref, "PHONE");
    expect(result.ok && result.preview.style).toBe("SUFFIX");
    expect(result.ok && result.preview.text === "••••••••42").toBe(true);
  });

  it.each([
    ["NAME", "Ramesh Kumar"],
    ["DOB", "1998-04-12"],
    ["AADHAAR", "2345 6789 0124"],
  ] as const)("%s: no approved masking, so the generic indicator — no character of the value", (piiClass, value) => {
    const vault = fresh();
    const ref = store(vault, piiClass, value);
    const result = consentPreview(vault, ref, piiClass);
    expect(result).toEqual({ ok: true, preview: { style: "GENERIC", text: GENERIC_PREVIEW } });
    for (const ch of value.replace(/\s/g, "")) expect(GENERIC_PREVIEW.includes(ch)).toBe(false);
  });

  it("a ten-digit mobile that begins 91 is a mobile: eight dots and its last two digits (normaliser fix, M19)", () => {
    const vault = fresh();
    const ref = store(vault, "PHONE", "9100000042");
    const result = consentPreview(vault, ref, "PHONE");
    expect(result.ok && result.preview.style).toBe("SUFFIX");
    expect(result.ok && result.preview.text === "••••••••42").toBe(true);
  });

  it("a PHONE value that is not a valid mobile number falls back to the generic indicator", () => {
    const vault = fresh();
    const ref = store(vault, "PHONE", "5000000042"); // starts with 5: not an Indian mobile number
    expect(consentPreview(vault, ref, "PHONE")).toEqual({ ok: true, preview: { style: "GENERIC", text: GENERIC_PREVIEW } });
  });

  it("never shows more than two digits of any ten-digit mobile", () => {
    for (let i = 0; i < 50; i++) {
      const vault = fresh();
      // Every valid leading digit, and numbers that begin 91 — which the normaliser once mangled.
      const lead = ["6", "7", "8", "9", "91"][i % 5]!;
      const value = `${lead}${String(i * 7919).padStart(10 - lead.length, "0")}`;
      const ref = store(vault, "PHONE", value);
      const result = consentPreview(vault, ref, "PHONE");
      const digits = result.ok ? result.preview.text.replace(/[^0-9]/g, "") : "";
      expect(digits.length).toBe(2);
      expect(value.endsWith(digits)).toBe(true);
    }
  });
});

describe("a preview only for a use the binder could allow", () => {
  it.each([
    ["a field of another class", "NAME"],
    ["a field of unknown type", "UNKNOWN"],
    ["a free-text field", "FREE_TEXT"],
    ["a one-time-code field", "OTP"],
  ] as const)("refused for %s", (_, accepts) => {
    const vault = fresh();
    const ref = store(vault, "PHONE", "9000000042");
    expect(consentPreview(vault, ref, accepts as FieldClass)).toEqual({ ok: false, cause: "FIELD_DOES_NOT_FIT" });
  });

  it("refused for a reference the vault never issued, one already spent, and a destroyed vault", () => {
    const vault = fresh();
    const ref = store(vault, "PHONE", "9000000042");
    expect(consentPreview(vault, "<PII:PHONE:9>", "PHONE")).toEqual({ ok: false, cause: "UNKNOWN_TOKEN" });
    vault.consume(ref);
    expect(consentPreview(vault, ref, "PHONE")).toEqual({ ok: false, cause: "CONSUMED" });
    const other = fresh();
    const ref2 = store(other, "PHONE", "9000000042");
    other.destroy();
    expect(consentPreview(other, ref2, "PHONE")).toEqual({ ok: false, cause: "VAULT_CLOSED" });
  });

  it("does not spend the reference: previewing is not restoring", () => {
    const vault = fresh();
    const ref = store(vault, "PHONE", "9000000042");
    consentPreview(vault, ref, "PHONE");
    expect(vault.describe(ref)?.consumed).toBe(false);
  });
});
