# ADR-0006 — ACT: the browser-action executor

- **Status: PROPOSED.** The implementation lands with it; the **confirmation-tier screen of
  §6 requires owner approval** before it can be called a policy rather than a proposal.
- **Date:** 2026-09-12
- **Decision owner:** `ronitsaha11`
- **Prepared by:** implementation engineer, workstation 2, at main `692df28`
- **Implements:** `docs/architecture/action-schema.md` — the allowlist, the `type` dual mode,
  the human-confirmation tier · `docs/security/security-invariants.md` INV-13, INV-14
  (both name the **action executor** as their enforcement point), INV-15/17/18/19, INV-20
- **Builds directly on:** [ADR-0005](ADR-0005-action-freshness-validation.md) — ACT consumes
  that stage's `ALLOW` and nothing else
- **Related:** `artifacts/reviews/AUDIT-0005-mvp-loop-readiness.md` (nine stages unbuilt) ·
  `artifacts/experiments/MVP-0-dom-sufficiency/` (which clicked with **no** validation at all)

> This is the **second** implemented stage of the execution loop after perception, and the
> first that touches a page. It is deliberately boring: one supported action, one method of
> browser authority, no judgement of its own about safety.
>
> It does **not** implement VERIFY RESULT, RE-HYDRATE, SANITIZE, VERIFY or REASON.

## 1. Input contract — a decision, never a proposal

ACT's input is a **`FreshnessDecision`** from `validateActionFreshness` — the union, not the
`ALLOW` alone. That choice is deliberate and it is the opposite of decorative:

- accepting only `AllowedAction` would make "a failed validation cannot reach the browser" a
  **compile-time** claim, unprovable at runtime and erased entirely by a `JSON.parse` or an
  `as` cast at any future call site;
- accepting the union means the refusal is a **real, executed, testable branch** — the suite
  hands ACT genuine `RE_OBSERVE` values and asserts the bridge was never touched.

There is **no exported function that takes a `ProposedAction` and reaches the browser** except
`validateAndAct`, which calls the validator itself. A caller cannot skip VALIDATE by choosing a
different entry point, because no such entry point exists.

### 1a. Why a structural `ALLOW` is not enough, and the witness

`AllowedAction` is a plain interface, so `{ decision: "ALLOW", kind: "click", … }` type-checks
and would otherwise be indistinguishable from a validated decision. A forged object is not a
hypothetical: it is what a future caller writes by accident when a test fixture leaks into
production code, or what a deserialised plan looks like.

So `validateActionFreshness` now stamps every decision it returns with a **module-private
symbol** (`VALIDATED_BY_FRESHNESS`), non-enumerably, and freezes the object.
`bearsFreshnessAttestation` is the only way to read it. The symbol is not exported, so no other
module — and nothing that arrives over a message port or out of `JSON.parse` — can produce a
decision that passes.

**Its limit, stated honestly:** this is a same-realm integrity check, not a capability. Code
running in this process can reach the symbol through `Object.getOwnPropertySymbols` if it
decides to. It converts *accidental* bypass into an impossibility and *deliberate* bypass into
something that cannot be written by mistake or reviewed past. That is the available guarantee,
and claiming more would be false.

## 2. Preconditions — ordered, fail-closed

| # | precondition | result when it fails |
|---|---|---|
| 0 | the decision is exactly `ALLOW` | `REJECTED` · `NOT_VALIDATED` |
| 1 | the decision bears the validator's attestation | `REJECTED` · `NOT_VALIDATED` |
| 2 | the action kind is on the frozen allowlist | `UNSUPPORTED_ACTION` · `NOT_ON_ALLOWLIST` |
| 3 | this executor supports that kind | `UNSUPPORTED_ACTION` · a specific cause (§3) |
| 4 | the decision carries a node, a box and a frame | `REJECTED` · `TARGET_MISSING_IN_DECISION` |
| 5 | the bridge is driving the **same frame** the decision was validated against | `REJECTED` · `BRIDGE_FRAME_MISMATCH` |
| 6 | the target is not in the human-confirmation tier | `REJECTED` · `HUMAN_CONFIRMATION_REQUIRED` |
| 7 | the point to be acted on lies inside the validated box | `REJECTED` · `POINT_OUTSIDE_TARGET` |

Only after all eight does the bridge get called. **Check 5 matters more than it looks:** a
decision validated against frame *A* says nothing about a bridge pointed at frame *B*, and
"the graph is fresh" is not the same claim as "the page in front of the executor is that graph".

## 3. Supported actions — `click`, and why the other seven are refused

The frozen allowlist is `click, type, scroll, select, wait, zoom_request, confirm, done`. ACT
implements **one** of them. Each refusal below is a consequence of a contract that already
exists, not a convenience:

| action | status | why |
|---|---|---|
| `click` | **SUPPORTED** | the only one whose full precondition chain exists today |
| `type` | `CLEARANCE_PIPELINE_ABSENT` | **both** modes depend on unbuilt stages. `value_ref` needs the vault (RE-HYDRATE). A literal is admissible only after the schema's **three checks** — target check, shape check through D1/D2/D3, vault comparison — and **none of those components exists**. Worse, concretely: the one field the controlled MVP would type into is `<input type="tel" autocomplete="tel">`, exactly what D1 detects, so the target check forbids a literal there *even once the pipeline exists*. Typing a synthetic string anyway would be the "secret-handling workaround" this project's rules forbid |
| `scroll` | `NO_SAFE_PAYLOAD_CONTRACT` | the grammar names `scroll` with no payload, and ADR-0005 classifies it as **targeted** — so the only scroll that can pass validation is one aimed at an element that is *already visible*, while the reason to scroll is to reach an element that is **not**. That catch-22 is a real architectural gap (see §7), and the honest response is to leave it unsupported rather than invent a viewport-delta payload the contract does not define |
| `select` | `NO_SAFE_PAYLOAD_CONTRACT` | option identity is not in the element graph, so there is nothing to validate an option against |
| `wait` | `NOT_A_PAGE_OPERATION` | a scheduler concern for the loop; the executor should not own a clock |
| `zoom_request` | `NOT_A_PAGE_OPERATION` | a request to the capture layer (OBSERVE), not an operation on the page |
| `confirm` | `NO_HUMAN_CONFIRMATION_CHANNEL` | there is no confirmation UI, so nothing can represent a human's consent. An executor that could *emit* a confirmation would be fabricating it |
| `done` | `NOT_A_PAGE_OPERATION` | a terminal signal for the loop |

**One supported action is not a thin result.** `click` is the action with a page effect, a
coordinate, a tolerance, a confirmation tier and a stale-target window — every hazard this
stage exists to contain is present in it.

## 4. Output states

```
EXECUTED            the bridge accepted the dispatch and returned without error
REJECTED            a precondition failed — carries a machine-readable cause
UNSUPPORTED_ACTION  the kind is real but this executor will not perform it
EXECUTION_ERROR     the bridge was called and failed — carries an error category
```

**`EXECUTED` does not mean the page changed.** It means the browser operation was dispatched
without an immediate error. Whether the intended state actually arrived is **VERIFY RESULT**'s
question, and that stage does not exist — so no caller may read `EXECUTED` as success of the
task. `EXECUTION_ERROR` with category `BRIDGE_TIMEOUT` is weaker still: it means the **outcome
is unknown**, and a caller must treat the action as possibly-performed, never as not-performed.

Errors are never swallowed and never converted into success. The error's `name` is reported and
its **message is deliberately dropped**: a bridge message can quote page markup, and INV-21's
rule against logging page-derived content outranks the convenience of a richer string.

## 5. The bridge — the whole of ACT's browser authority

```ts
interface PageActionBridge {
  readonly frameId: FrameId;
  clickAtCssPoint(point: CssPoint): Promise<void>;
}
```

**One method.** ACT cannot navigate, evaluate script, read the DOM, type, scroll, upload, open
a tab or touch storage, because there is no method for any of it — INV-15/17/18/19 hold by
absence rather than by enforcement. It is an interface rather than an implementation because
the product's real transport (an extension content script) **does not exist**: there is no
`manifest.json` in the repository. Binding ACT to the only thing that can drive a browser today
(Playwright, in the harness) would put a test tool in the product. The adapter therefore lives
in the experiment harness, and the package stays free of `lib.dom` and of Playwright.

The point is computed **by ACT** from the validated box — its centre, or the point the
validator itself echoed — never supplied by a caller alongside the decision. A caller cannot
hand ACT a box that passed validation and a coordinate that did not.

## 6. The human-confirmation tier — PROPOSED, and conservative

The action schema requires confirmation for *submit, purchase, delete, sending a message,
anything touching authentication, and navigation to a new origin* (INV-20). Nothing implemented
it, and ACT is where it has to bite — after validation, before dispatch.

Two rules, both failing in the direction of refusing:

1. **Role `link` is always confirmation-required.** `ElementNode` carries no `href`, so ACT
   cannot establish that a link stays on this origin. An unknown destination is not a safe
   destination.
2. **A conservative accessible-name screen**, matched case-insensitively on word boundaries:
   submit · send · pay · purchase · buy · order · checkout · delete · remove · transfer ·
   sign in · sign out · log in · log out · login · logout · authorise/authorize · confirm ·
   approve · accept · agree.

**Both are PROPOSED and need the owner's ruling**, for opposite reasons: the list will produce
false positives (a benign "Send feedback" is refused), and the `role === "link"` rule refuses
every link including a same-page anchor. False positives here cost an agent a click; a false
negative costs a submitted form.

**A known weakness, not hidden:** the screen reads the accessible name because the element
graph does not record that a control is a `type="submit"` button. A submit control named
"Continue" passes the screen. The correct fix is a `submitControl` flag on `DomMeasurement`,
which is a perception-contract change and therefore out of this ADR's scope.

**There is no grant path.** ACT exposes no parameter, type or function by which consent can be
supplied, so a confirmation-tier action is **always** refused. When the confirmation UI exists,
the grant becomes a new input with its own ADR — and until then the absence is the guarantee.

## 7. Two additive changes to ADR-0005's output, and one gap found

`AllowedAction` gained two optional fields and the attestation:

| addition | why it is necessary, not cosmetic |
|---|---|
| `frameId` | without it ACT cannot perform precondition 5 — the decision could not say which frame it was valid for |
| `point` | the validator already validates a supplied point; without echoing it, ACT would either ignore a validated point (silently acting somewhere else) or re-accept it unvalidated from the caller (worse) |
| attestation | §1a |

No behaviour of the validator changed: every existing check, order and rejection is untouched,
and its 53 tests pass unmodified.

**The gap:** `scroll` cannot be expressed at all (§3). Recording it here rather than patching
it, because the fix is a grammar question — does a scroll target an element or a viewport, and
what re-validation does a successful scroll force? — and a scroll **invalidates the very
observation that authorised it**, which is a loop-contract decision, not an executor detail.

## 8. What this ADR explicitly does NOT do

No VERIFY RESULT — nothing here reads the page back. No RE-HYDRATE, no vault, no token, no
value: ACT has **no field anywhere that can hold a typed string**, so there is nothing for a
secret to pass through. No SANITIZE, no detector, no redaction. No REASON, no server, no
network — the package imports nothing that can reach one. No storage of any kind. No telemetry
subsystem. No detector, threshold, NMS, decode or model change. No change to any security
invariant, and no weakening of Invariant E. No capture-size policy. No real site, no real data.

## 9. Consequences

**Gained:** the first executable path from a validated decision to a page, with a refusal that
is a branch rather than a comment; INV-13 and INV-14 have an actual enforcement point for the
first time; and the confirmation tier exists in code instead of only in prose.

**Cost:** the product still cannot complete a form, because `type` is refused for a reason that
will not go away until SANITIZE and the vault exist. That is the correct cost to pay.

**Risk accepted:** the confirmation screen is a name-matching heuristic, and it will be wrong in
both directions until the element graph can say "this control submits".
