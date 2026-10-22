/**
 * WHAT A CLICK IS EXPECTED TO DO — declared by the client, never by the model or the page.
 *
 * VERIFY RESULT (ADR-0007) evaluates one DECLARED postcondition from a closed set. Until M15 this
 * package declared the same one for every click — "the clicked control becomes disabled", a property
 * of one demo fixture's submit button. That made every other click unverifiable by construction.
 *
 * Now the declaration is a table the CLIENT supplies with the task: target selector → expected
 * postcondition. The table is the client's own knowledge of what each control it is willing to have
 * clicked should do. It is NOT taken from:
 *
 * - **the model.** A plan carries operations and targets only; `parsePlan` drops any other field. A
 *   reasoner that could choose its own success condition could choose one that is already true.
 * - **the page.** A page that declared its own postconditions would declare trivially true ones.
 *
 * Two refusals follow, both BEFORE anything is granted, restored or clicked:
 * - a click whose target has no declaration — it could never be verified, so it is not performed;
 * - a click whose declared postcondition already holds — confirming it afterwards would prove nothing.
 */
import { type ExpectedPostcondition } from "@pratibimb/agent";

/** Target selector → what clicking it must make true. Frozen once checked. */
export type ClickPostconditions = Readonly<Record<string, ExpectedPostcondition>>;

/** A refusal to start: the table is not a well-formed set of ADR-0007 postconditions. */
export class PostconditionsError extends TypeError {
  override readonly name = "PostconditionsError";
}

/** Enough for any page this client drives; a bound on an object that may arrive as a message. */
export const MAX_DECLARED_POSTCONDITIONS = 32;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Check a table that may have arrived as untyped data (an extension message). Anything outside
 * ADR-0007's closed set, or with an extra field, is refused — never coerced or dropped.
 */
export function checkPostconditions(raw: unknown): ClickPostconditions {
  if (!isObject(raw)) throw new PostconditionsError("postconditions must be an object of selector → postcondition");
  const entries = Object.entries(raw);
  if (entries.length === 0) throw new PostconditionsError("postconditions is empty: no click could ever be verified");
  if (entries.length > MAX_DECLARED_POSTCONDITIONS) {
    throw new PostconditionsError(`postconditions declares ${entries.length} targets; at most ${MAX_DECLARED_POSTCONDITIONS}`);
  }
  const table: Record<string, ExpectedPostcondition> = {};
  for (const [selector, value] of entries) {
    if (selector.trim() === "") throw new PostconditionsError("a postcondition is declared for an empty selector");
    if (!isObject(value)) throw new PostconditionsError(`${selector}: a postcondition must be an object`);
    const keys = Object.keys(value).sort().join(",");
    if (value.kind === "FOCUS_ON_TARGET" && keys === "kind") {
      table[selector] = Object.freeze({ kind: "FOCUS_ON_TARGET" });
    } else if (value.kind === "TARGET_ENABLED" && keys === "expected,kind" && typeof value.expected === "boolean") {
      table[selector] = Object.freeze({ kind: "TARGET_ENABLED", expected: value.expected });
    } else if (value.kind === "TARGET_NAME" && keys === "expected,kind" && typeof value.expected === "string" && value.expected.trim() !== "") {
      table[selector] = Object.freeze({ kind: "TARGET_NAME", expected: value.expected });
    } else {
      throw new PostconditionsError(`${selector}: not one of ADR-0007's postconditions (FOCUS_ON_TARGET, TARGET_ENABLED, TARGET_NAME)`);
    }
  }
  return Object.freeze(table);
}
