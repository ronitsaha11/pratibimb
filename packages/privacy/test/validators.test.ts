/**
 * The deterministic validators — pattern plus checksum, and nothing softened to suit a fixture.
 *
 * The Aadhaar pair is the one to read: `…0124` must pass and `…0123` must fail. The checksum decides
 * that, not the fixture, and the fixture was chosen to satisfy the checksum rather than the reverse.
 */
import { describe, expect, it } from "vitest";
import {
  classifyValue,
  isAadhaarNumber,
  isDateOfBirth,
  isDemoSafeName,
  isIndianMobile,
  isOtpShaped,
  normaliseAadhaar,
  normaliseIndianMobile,
  verhoeffValid,
} from "../src/index.js";
import { DEMO, TODAY } from "./support/demoFixture.js";

describe("Verhoeff", () => {
  it("accepts the demo Aadhaar number and rejects the one that fails the checksum", () => {
    expect(verhoeffValid("234567890124")).toBe(true);
    expect(verhoeffValid("234567890123")).toBe(false);
  });

  it("accepts only one check digit for the demo prefix, which is why the fixture uses 4", () => {
    const accepted = [...Array(10).keys()].filter((d) => verhoeffValid(`23456789012${d}`));
    expect(accepted).toEqual([4]);
  });

  it("rejects anything that is not digits", () => {
    expect(verhoeffValid("2345 6789 0124")).toBe(false);
    expect(verhoeffValid("")).toBe(false);
    expect(verhoeffValid("23456789012x")).toBe(false);
  });
});

describe("Aadhaar", () => {
  it("accepts the demo value in spaced, hyphenated and bare forms", () => {
    expect(isAadhaarNumber(DEMO.aadhaar)).toBe(true);
    expect(isAadhaarNumber("2345-6789-0124")).toBe(true);
    expect(isAadhaarNumber("234567890124")).toBe(true);
    expect(normaliseAadhaar(DEMO.aadhaar)).toBe("234567890124");
  });

  it("rejects the checksum-invalid vector", () => {
    expect(isAadhaarNumber(DEMO.aadhaarInvalid)).toBe(false);
    expect(normaliseAadhaar(DEMO.aadhaarInvalid)).toBeNull();
  });

  it("rejects wrong lengths and numbers UIDAI does not issue", () => {
    expect(isAadhaarNumber("23456789012")).toBe(false); // 11 digits
    expect(isAadhaarNumber("2345678901245")).toBe(false); // 13 digits
    expect(isAadhaarNumber("034567890124")).toBe(false); // leading 0
    expect(isAadhaarNumber("134567890124")).toBe(false); // leading 1
  });
});

describe("Indian mobile", () => {
  it("accepts a ten-digit number starting 6-9, with or without a trunk or country prefix", () => {
    expect(isIndianMobile(DEMO.mobile)).toBe(true);
    expect(normaliseIndianMobile("+91 90000 00001")).toBe(DEMO.mobile);
    expect(normaliseIndianMobile("0-9000-000-001")).toBe(DEMO.mobile);
    expect(normaliseIndianMobile("6000000001")).toBe("6000000001");
  });

  it("rejects ranges that are not mobile, and wrong lengths", () => {
    expect(isIndianMobile("5000000001")).toBe(false);
    expect(isIndianMobile("900000000")).toBe(false);
    expect(isIndianMobile("90000000012")).toBe(false);
    expect(isIndianMobile("")).toBe(false);
  });

  it("does not accept a twelve-digit Aadhaar number as a phone number", () => {
    expect(isIndianMobile("234567890124")).toBe(false);
  });

  // M19 regression: a bare ten-digit mobile that begins 91 used to lose its first two digits to an
  // unconditional "+91" strip and be rejected. Synthetic numbers only.
  it.each(["9100000042", "9123456780", "9199999999", "91000 00042", "91-0000-0042"])(
    "keeps a bare ten-digit mobile that begins 91 exactly as it is (%s)",
    (raw) => {
      const expected = raw.replace(/[\s-]/g, "");
      expect(normaliseIndianMobile(raw) === expected).toBe(true);
      expect(isIndianMobile(raw)).toBe(true);
    }
  );

  it("classifies a bare ten-digit mobile that begins 91 as PHONE", () => {
    expect(classifyValue("9100000042", TODAY)).toBe("PHONE");
  });

  it.each([
    ["+91 and a mobile that begins 91", "+91 91000 00042", "9100000042"],
    ["91 and a mobile that begins 91", "919100000042", "9100000042"],
    ["0091 and a mobile", "0091 9000000001", "9000000001"],
    ["0091 and a mobile that begins 91", "00919100000042", "9100000042"],
    ["a trunk 0 and a mobile that begins 91", "09100000042", "9100000042"],
    ["+91 with hyphens", "+91-90000-00001", "9000000001"],
  ])("normalises a supported prefixed form: %s", (_, raw, expected) => {
    expect(normaliseIndianMobile(raw) === expected).toBe(true);
  });

  it.each([
    ["eleven digits beginning 91, no valid split", "91900000004"],
    ["a 91 prefix and nine digits", "91900000000"],
    ["a 91 prefix and eleven digits", "9190000000012"],
    ["+91 and a number starting 5", "+915000000001"],
    ["+91 and a number starting 0", "+910900000001"],
    ["a prefix with nothing after it", "+91"],
    ["a doubled country code", "+91+919000000001"],
    ["a plus sign mid-number", "90000+00001"],
    ["letters", "9OOOOOOOO1"],
    ["a dotted number", "9000.000.001"],
  ])("still fails closed for %s", (_, raw) => {
    expect(normaliseIndianMobile(raw)).toBeNull();
    expect(isIndianMobile(raw)).toBe(false);
  });
});

describe("date of birth", () => {
  it("accepts a real ISO date inside the plausible window", () => {
    expect(isDateOfBirth(DEMO.dob, TODAY)).toBe(true);
    expect(isDateOfBirth("1900-01-01", TODAY)).toBe(true);
  });

  it("rejects a calendar-shaped string that is not a calendar date", () => {
    expect(isDateOfBirth("2026-02-30", TODAY)).toBe(false);
    expect(isDateOfBirth("1998-13-01", TODAY)).toBe(false);
  });

  it("rejects other formats and dates outside the window", () => {
    expect(isDateOfBirth("12/04/1998", TODAY)).toBe(false);
    expect(isDateOfBirth("1998-4-12", TODAY)).toBe(false);
    expect(isDateOfBirth("1899-12-31", TODAY)).toBe(false);
    expect(isDateOfBirth("2030-01-01", TODAY)).toBe(false); // the future is not a birth date
  });
});

describe("name and OTP shapes", () => {
  it("accepts the demo name and rejects things that are not name-shaped", () => {
    expect(isDemoSafeName(DEMO.name)).toBe(true);
    expect(isDemoSafeName("Ramesh")).toBe(false); // one word
    expect(isDemoSafeName("ramesh kumar")).toBe(false); // not capitalised
    expect(isDemoSafeName("9000000001")).toBe(false);
    expect(isDemoSafeName("A B C D E")).toBe(false); // five words
  });

  it("recognises an OTP shape without claiming shape alone is enough to act on", () => {
    expect(isOtpShaped(DEMO.otp)).toBe(true);
    expect(isOtpShaped("1234")).toBe(true);
    expect(isOtpShaped("123")).toBe(false);
    expect(isOtpShaped("123456789")).toBe(false);
  });
});
