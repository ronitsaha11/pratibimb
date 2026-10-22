/**
 * M16 — `fieldFit` and `groundFill`: which stored value may go into which empty field.
 *
 * `fieldFit` is the class half of `bind`, and `bind` calls it, so the first block is a table of the
 * whole rule. `groundFill` is what the reasoner is offered and what the validator holds every
 * reference insert to; it pairs a field with a reference only when exactly one fits, and otherwise
 * withholds the field with a reason. Never a guess, and never a value.
 */
import { describe, expect, it } from "vitest";
import {
  PII_CLASSES,
  classifyField,
  fieldFit,
  groundFill,
  type BindView,
  type FieldClass,
  type FillReference,
  type PiiClass,
} from "../src/index.js";

const ORIGIN = "http://127.0.0.1:8970";
const FIELD_CLASSES: readonly FieldClass[] = [...PII_CLASSES, "FREE_TEXT"];

const viewOf = (accepts: Record<string, FieldClass>): BindView => ({
  viewId: "v1",
  documentId: "d1",
  fields: new Map(Object.entries(accepts).map(([id, cls]) => [id, { accepts: cls, origin: ORIGIN, fingerprint: id }])),
});

const ref = (token: string, cls: PiiClass, method: FillReference["method"] = "token_reference"): FillReference => ({ token, class: cls, method });

const PHONE = ref("<PII:PHONE:1>", "PHONE");
const NAME = ref("<PII:NAME:1>", "NAME");
const AADHAAR = ref("<PII:AADHAAR:1>", "AADHAAR");
const DOB = ref("<PII:DOB:1>", "DOB");
const ALL = [NAME, PHONE, AADHAAR, DOB];

describe("fieldFit — the class rule bind() and groundFill() share", () => {
  it("fits only when the field accepts exactly the reference's class", () => {
    for (const accepts of FIELD_CLASSES) {
      for (const cls of PII_CLASSES) {
        const fit = fieldFit(accepts, cls);
        if (fit === "FITS") expect(accepts, `${cls} into ${accepts}`).toBe(cls);
      }
    }
    expect(fieldFit("PHONE", "PHONE")).toBe("FITS");
    expect(fieldFit("NAME", "NAME")).toBe("FITS");
  });

  it("refuses NAME into a phone field and PHONE into a name field as a class mismatch", () => {
    expect(fieldFit("PHONE", "NAME")).toBe("CLASS_MISMATCH");
    expect(fieldFit("NAME", "PHONE")).toBe("CLASS_MISMATCH");
  });

  it("never fits an unknown, free-text or OTP field, whatever the reference", () => {
    for (const cls of ["NAME", "PHONE", "AADHAAR", "DOB"] as const) {
      expect(fieldFit("UNKNOWN", cls)).toBe("AMBIGUOUS_FIELD");
      expect(fieldFit("FREE_TEXT", cls)).toBe("AMBIGUOUS_FIELD");
      expect(fieldFit("OTP", cls)).toBe("CRITICAL_FIELD");
    }
  });

  it("checks a CRITICAL reference first, as bind() always has", () => {
    expect(fieldFit("OTP", "OTP")).toBe("CRITICAL_NEVER_AGENT_TYPED");
    expect(fieldFit("PHONE", "OTP")).toBe("CRITICAL_NEVER_AGENT_TYPED");
  });
});

describe("groundFill — one reference per empty field, or the field is withheld", () => {
  it("pairs the empty mobile field with the PHONE reference and the empty name field with NAME", () => {
    const fill = groundFill(viewOf({ "#mobile_confirm": "PHONE", "#name_confirm": "NAME" }), ALL, ["#mobile_confirm", "#name_confirm"]);
    expect(new Map(fill.fillable)).toEqual(
      new Map([
        ["#mobile_confirm", PHONE.token],
        ["#name_confirm", NAME.token],
      ])
    );
    expect(fill.withheld).toEqual([]);
  });

  it("pairs only empty fields: a field not listed as empty is never offered", () => {
    const fill = groundFill(viewOf({ "#mobile": "PHONE", "#mobile_confirm": "PHONE" }), ALL, ["#mobile_confirm"]);
    expect([...fill.fillable.keys()]).toEqual(["#mobile_confirm"]);
  });

  it.each([
    ["an unknown field", "UNKNOWN", "AMBIGUOUS_FIELD"],
    ["a free-text field", "FREE_TEXT", "AMBIGUOUS_FIELD"],
    ["a one-time-code field", "OTP", "CRITICAL_FIELD"],
  ] as const)("withholds %s", (_, accepts, cause) => {
    const fill = groundFill(viewOf({ "#x": accepts }), ALL, ["#x"]);
    expect(fill.fillable.size).toBe(0);
    expect(fill.withheld).toEqual([{ target: "#x", cause }]);
  });

  it("withholds a field whose signals conflict: classifyField will not guess, so neither does this", () => {
    // autocomplete says phone, the label says name.
    const accepts = classifyField({ label: "Full name", autocomplete: "tel", type: "text" });
    expect(accepts).toBe("UNKNOWN");
    expect(groundFill(viewOf({ "#x": accepts }), ALL, ["#x"]).withheld).toEqual([{ target: "#x", cause: "AMBIGUOUS_FIELD" }]);
  });

  it("withholds a field with no matching reference", () => {
    const fill = groundFill(viewOf({ "#mobile_confirm": "PHONE" }), [NAME, AADHAAR], ["#mobile_confirm"]);
    expect(fill.withheld).toEqual([{ target: "#mobile_confirm", cause: "NO_MATCHING_REFERENCE" }]);
  });

  it("withholds a field two references could fill, and chooses neither", () => {
    const fill = groundFill(viewOf({ "#mobile_confirm": "PHONE" }), [PHONE, ref("<PII:PHONE:2>", "PHONE"), NAME], ["#mobile_confirm"]);
    expect(fill.fillable.size).toBe(0);
    // M17: the candidates are named, so a person can be asked; nothing is chosen here.
    expect(fill.withheld).toEqual([{ target: "#mobile_confirm", cause: "CONFLICTING_REFERENCES", candidates: [PHONE.token, "<PII:PHONE:2>"] }]);
    expect(fill.chosenByPerson).toEqual([]);
  });

  it("does not count a masked span with no token as a reference", () => {
    const fill = groundFill(viewOf({ "#mobile_confirm": "PHONE" }), [PHONE, ref("", "PHONE", "masked_no_token")], ["#mobile_confirm"]);
    expect([...fill.fillable]).toEqual([["#mobile_confirm", PHONE.token]]);
  });

  it("withholds a target the view does not have", () => {
    expect(groundFill(viewOf({}), ALL, ["#ghost"]).withheld).toEqual([{ target: "#ghost", cause: "UNKNOWN_TARGET" }]);
  });

  it("never pairs NAME with a phone field or PHONE with a name field, whatever the order of references", () => {
    for (const order of [ALL, [...ALL].reverse()]) {
      const fill = groundFill(viewOf({ "#mobile_confirm": "PHONE", "#name_confirm": "NAME" }), order, ["#name_confirm", "#mobile_confirm"]);
      expect(fill.fillable.get("#mobile_confirm")).toBe(PHONE.token);
      expect(fill.fillable.get("#name_confirm")).toBe(NAME.token);
    }
  });
});

describe("groundFill with a person's choice (M17) — evidence of intent, re-checked here", () => {
  const PHONE2 = ref("<PII:PHONE:2>", "PHONE");
  const twoPhones = [PHONE, PHONE2, NAME];
  const view = viewOf({ "#mobile_confirm": "PHONE", "#name_confirm": "NAME", "#notes": "UNKNOWN" });

  it.each([
    ["the first", PHONE.token],
    ["the second", PHONE2.token],
  ])("applies %s candidate to the conflicting field, and records that a person chose it", (_, token) => {
    const fill = groundFill(view, twoPhones, ["#mobile_confirm"], new Map([["#mobile_confirm", token]]));
    expect([...fill.fillable]).toEqual([["#mobile_confirm", token]]);
    expect(fill.chosenByPerson).toEqual(["#mobile_confirm"]);
    expect(fill.withheld).toEqual([]);
  });

  it("refuses a choice of a reference that does not fit the field, and substitutes nothing", () => {
    const fill = groundFill(view, twoPhones, ["#mobile_confirm"], new Map([["#mobile_confirm", NAME.token]]));
    expect(fill.fillable.size).toBe(0);
    expect(fill.withheld).toEqual([{ target: "#mobile_confirm", cause: "CHOICE_NOT_A_CANDIDATE", candidates: [PHONE.token, PHONE2.token] }]);
  });

  it("refuses a choice that became incompatible: the field now accepts NAME on this view", () => {
    const changed = viewOf({ "#mobile_confirm": "NAME" });
    const fill = groundFill(changed, [...twoPhones, ref("<PII:NAME:2>", "NAME")], ["#mobile_confirm"], new Map([["#mobile_confirm", PHONE.token]]));
    expect(fill.fillable.size).toBe(0);
    expect(fill.withheld[0]).toMatchObject({ target: "#mobile_confirm", cause: "CHOICE_NOT_A_CANDIDATE" });
  });

  it("refuses a choice of a token the handoff never issued", () => {
    const fill = groundFill(view, twoPhones, ["#mobile_confirm"], new Map([["#mobile_confirm", "<PII:PHONE:9>"]]));
    expect(fill.fillable.size).toBe(0);
    expect(fill.withheld[0]?.cause).toBe("CHOICE_NOT_A_CANDIDATE");
  });

  it("refuses a choice for a field that had only one candidate: nobody was asked", () => {
    const fill = groundFill(view, twoPhones, ["#name_confirm"], new Map([["#name_confirm", NAME.token]]));
    expect(fill.fillable.size).toBe(0);
    expect(fill.withheld).toEqual([{ target: "#name_confirm", cause: "CHOICE_NOT_A_CANDIDATE" }]);
  });

  it("refuses a choice for a field of unknown type: a person's pick does not tell the binder what it accepts", () => {
    const fill = groundFill(view, twoPhones, ["#notes"], new Map([["#notes", PHONE.token]]));
    expect(fill.withheld).toEqual([{ target: "#notes", cause: "CHOICE_NOT_A_CANDIDATE" }]);
  });

  it("refuses a choice for a field that is not empty in this reading", () => {
    const fill = groundFill(view, twoPhones, [], new Map([["#mobile_confirm", PHONE.token]]));
    expect(fill.withheld).toEqual([{ target: "#mobile_confirm", cause: "CHOICE_NOT_A_CANDIDATE" }]);
  });

  it("leaves every other field to the ordinary rule", () => {
    const fill = groundFill(view, twoPhones, ["#mobile_confirm", "#name_confirm"], new Map([["#mobile_confirm", PHONE2.token]]));
    expect(new Map(fill.fillable)).toEqual(new Map([["#mobile_confirm", PHONE2.token], ["#name_confirm", NAME.token]]));
    expect(fill.chosenByPerson).toEqual(["#mobile_confirm"]);
  });
});
