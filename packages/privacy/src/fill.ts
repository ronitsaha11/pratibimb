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
  | "CONFLICTING_REFERENCES";

/** The parts of a handoff redaction this reads: no span, no hint, no geometry. */
export interface FillReference {
  readonly token: string;
  readonly class: PiiClass;
  readonly method: "token_reference" | "masked_no_token";
}

export interface FillGrounding {
  /** Empty field → the one reference the client allows into it. */
  readonly fillable: ReadonlyMap<string, string>;
  /** Empty fields nothing may fill, each with its reason. */
  readonly withheld: readonly { readonly target: string; readonly cause: FillCause }[];
}

/**
 * Ground every empty field against the references this handoff issued.
 *
 * `emptyFields` is the caller's list of text-entry elements that carry no redaction. Which elements
 * those are is a fact about the reading; what may go into them is decided here.
 */
export function groundFill(view: BindView, references: readonly FillReference[], emptyFields: readonly string[]): FillGrounding {
  const issued = references.filter((reference) => reference.method === "token_reference" && reference.token !== "");
  const fillable = new Map<string, string>();
  const withheld: { readonly target: string; readonly cause: FillCause }[] = [];

  for (const target of new Set(emptyFields)) {
    const field = view.fields.get(target);
    if (!field) {
      withheld.push({ target, cause: "UNKNOWN_TARGET" });
      continue;
    }
    if (field.accepts === "OTP") {
      withheld.push({ target, cause: "CRITICAL_FIELD" });
      continue;
    }
    if (field.accepts === "UNKNOWN" || field.accepts === "FREE_TEXT") {
      withheld.push({ target, cause: "AMBIGUOUS_FIELD" });
      continue;
    }
    const matching = [...new Set(issued.filter((reference) => fieldFit(field.accepts, reference.class) === "FITS").map((reference) => reference.token))];
    if (matching.length === 0) withheld.push({ target, cause: "NO_MATCHING_REFERENCE" });
    else if (matching.length > 1) withheld.push({ target, cause: "CONFLICTING_REFERENCES" });
    else fillable.set(target, matching[0]!);
  }

  return { fillable, withheld };
}
