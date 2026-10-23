/**
 * WHICH STORED VALUE MAY GO INTO WHICH EMPTY FIELD — decided by the client, before anything is asked.
 *
 * M16. On the M2 page the local model proposed the NAME reference for the empty mobile-number field.
 * The binder refused it (`CLASS_MISMATCH`), which is the boundary working. But the client knew the
 * answer all along: `classifyField` (D1) said what the field accepts, and the handoff said which
 * reference has which class. The model was being asked a question this client can answer itself,
 * and it is not the party that should be answering it.
 *
 * SO THE PAIRING IS PRIVACY'S, NOT THE MODEL'S. `groundFill` names, for each empty field, the one
 * reference the client will allow into it — or withholds the field and says why. The reasoner is
 * offered only those pairings, and the validator refuses any reference insert that is not one of
 * them. The model still decides *whether* to fill and *what to click*; it no longer decides which
 * private value belongs where.
 *
 * FAIL CLOSED, NEVER GUESS. A field whose type is unknown, ambiguous or OTP is withheld. So is a
 * field with no matching reference, and one with more than one: two phone numbers and one phone
 * field is a question for the person, not something to resolve by picking the first. Nothing here
 * ever substitutes a different value for one that was refused.
 *
 * VALUE-FREE. Everything read here is a field class, a reference token and its class: the same
 * descriptors `bind` decides on, in a realm that holds no values.
 */
import { TIER_OF, type FieldClass, type PiiClass } from "./classes.js";
import { type BindView } from "./bind.js";

/**
 * May a reference of this class ever go into a field classified as this?
 *
 * The class half of `bind`, in `bind`'s order, and `bind` calls it: there is one rule, not two that
 * could drift. Everything else `bind` checks — session, view, document, origin, consumption, grants —
 * is about *this use*, not about the pairing.
 */
export type FieldFit = "FITS" | "CRITICAL_NEVER_AGENT_TYPED" | "CRITICAL_FIELD" | "AMBIGUOUS_FIELD" | "CLASS_MISMATCH";

export function fieldFit(accepts: FieldClass, piiClass: PiiClass): FieldFit {
  // A CRITICAL reference cannot exist — issuance refuses one — so this is defence in depth against a
  // vault that was populated some other way.
  if (TIER_OF[piiClass] === "CRITICAL") return "CRITICAL_NEVER_AGENT_TYPED";
  if (accepts === "OTP") return "CRITICAL_FIELD";
  if (accepts === "UNKNOWN" || accepts === "FREE_TEXT") return "AMBIGUOUS_FIELD";
  if (accepts !== piiClass) return "CLASS_MISMATCH";
  return "FITS";
}

/** Why an empty field is not offered for filling. A code, never a value. */
export type FillCause =
  /** The field is not in the view the binder will decide against. */
  | "UNKNOWN_TARGET"
  /** The field takes a one-time code: never agent-typed. */
  | "CRITICAL_FIELD"
  /** The client could not establish what the field accepts. */
  | "AMBIGUOUS_FIELD"
  /** No reference of the class the field accepts was issued. */
  | "NO_MATCHING_REFERENCE"
  /** More than one was, and choosing between them is the person's decision. */
  | "CONFLICTING_REFERENCES"
  /**
   * A person's choice was given for this field and is not one of the references that fit it — or
   * the field was not one a person was asked about (M17). The choice is refused, not corrected.
   */
  | "CHOICE_NOT_A_CANDIDATE";

/** The parts of a handoff redaction this reads: no span, no hint, no geometry. */
export interface FillReference {
  readonly token: string;
  readonly class: PiiClass;
  readonly method: "token_reference" | "masked_no_token";
}

/** An empty field nothing may fill, and why. */
export interface FillWithheld {
  readonly target: string;
  readonly cause: FillCause;
  /**
   * For `CONFLICTING_REFERENCES` and `CHOICE_NOT_A_CANDIDATE`: every reference that fits the field,
   * in issue order. Tokens the handoff already carries; never a value. This is what a person may be
   * asked to choose between (M17).
   */
  readonly candidates?: readonly string[];
}

export interface FillGrounding {
  /** Empty field → the one reference the client allows into it. */
  readonly fillable: ReadonlyMap<string, string>;
  /** Empty fields nothing may fill, each with its reason. */
  readonly withheld: readonly FillWithheld[];
  /** Fields in `fillable` whose reference a person chose among candidates (M17). Targets only. */
  readonly chosenByPerson: readonly string[];
}

/**
 * Ground every empty field against the references this handoff issued.
 *
 * `emptyFields` is the caller's list of text-entry elements that carry no redaction. Which elements
 * those are is a fact about the reading; what may go into them is decided here.
 *
 * `choices` (M17) is what a person chose for a field privacy withheld as `CONFLICTING_REFERENCES`:
 * target → one of its candidates. It is evidence of the person's intent and nothing more. It is
 * applied only if the chosen reference still fits the field on THIS view, and only to a field that
 * is still conflicting; anything else withholds the field as `CHOICE_NOT_A_CANDIDATE`. It never
 * makes a field fillable that the class rule refuses, and never picks a different reference.
 */
export function groundFill(
  view: BindView,
  references: readonly FillReference[],
  emptyFields: readonly string[],
  choices: ReadonlyMap<string, string> = new Map()
): FillGrounding {
  const issued = references.filter((reference) => reference.method === "token_reference" && reference.token !== "");
  const fillable = new Map<string, string>();
  const withheld: FillWithheld[] = [];
  const chosenByPerson: string[] = [];
  const empty = new Set(emptyFields);

  // A choice for a field that is not an empty field of this reading was never asked about here.
  for (const target of choices.keys()) {
    if (!empty.has(target)) withheld.push({ target, cause: "CHOICE_NOT_A_CANDIDATE" });
  }

  for (const target of empty) {
    const field = view.fields.get(target);
    const choice = choices.get(target);
    const refuseChoice = (candidates?: readonly string[]): void => {
      withheld.push({ target, cause: "CHOICE_NOT_A_CANDIDATE", ...(candidates ? { candidates } : {}) });
    };
    if (!field) {
      if (choice !== undefined) {
        refuseChoice();
        continue;
      }
      withheld.push({ target, cause: "UNKNOWN_TARGET" });
      continue;
    }
    // A choice is refused for a field whose type the client could not establish: a person picking a
    // value does not tell the binder what the field accepts.
    if (field.accepts === "OTP") {
      if (choice !== undefined) refuseChoice();
      else withheld.push({ target, cause: "CRITICAL_FIELD" });
      continue;
    }
    if (field.accepts === "UNKNOWN" || field.accepts === "FREE_TEXT") {
      if (choice !== undefined) refuseChoice();
      else withheld.push({ target, cause: "AMBIGUOUS_FIELD" });
      continue;
    }
    const matching = [...new Set(issued.filter((reference) => fieldFit(field.accepts, reference.class) === "FITS").map((reference) => reference.token))];
    if (matching.length > 1) {
      if (choice === undefined) withheld.push({ target, cause: "CONFLICTING_REFERENCES", candidates: matching });
      else if (matching.includes(choice)) {
        fillable.set(target, choice);
        chosenByPerson.push(target);
      } else refuseChoice(matching);
    } else if (choice !== undefined) {
      // Nothing to choose between: no person was asked, so no answer is taken.
      refuseChoice();
    } else if (matching.length === 0) withheld.push({ target, cause: "NO_MATCHING_REFERENCE" });
    else fillable.set(target, matching[0]!);
  }

  return { fillable, withheld, chosenByPerson };
}
