# ADR-0007 — HIT-TEST AGREEMENT and VERIFY RESULT

- **Status: PROPOSED.** The implementation lands with it; **one numeric tolerance is a proposal
  and requires owner approval** (§6), and the residual in §8 is a known, stated limit.
- **Date:** 2026-09-13
- **Decision owner:** `ronitsaha11`
- **Prepared by:** implementation engineer, **workstation 1** (`LAPTOP-6E14K34L`), stacked on
  PR #60 at `25327e4`
- **Depends on:** **PR #60 (ACT, ADR-0006) — OPEN and unmerged at the time of writing.** This
  decision builds on its contracts and must not merge before it.
- **Implements:** `docs/architecture/action-schema.md` §*Action freshness — pipeline stage 8*,
  and the `VERIFY RESULT` stage of the governing loop
- **Related:** ADR-0005 (VALIDATE + REFRESH) · ADR-0006 (ACT) ·
  `docs/security/security-invariants.md` INV-13, INV-15, INV-17–21, INV-24 ·
  `artifacts/experiments/MVP-2-hit-test-verify-result/`

> Two stages, one decision, because they are the two halves of the same sentence: **a dispatched
> action is not a successful action, and a validated target is not a targeted element.** Splitting
> them across two ADRs would let either half ship without the other, and either half alone leaves
> the agent confident about something it has not established.
>
> This ADR does **not** implement TYPE, RE-HYDRATE, SANITIZE, the privacy verifier, REASON, PLAN
> or any orchestration, and does not pretend to.

## 1. The two problems

**TOCTOU.** ADR-0005 closed the window between the *screenshot* and the *plan*. It did not close
the window between the *validation* and the *click*. VALIDATE proves a target was right when the
graph was built; ACT dispatches a point some milliseconds later. In between, a page can open a
modal, slide in a consent banner, or move another element into the same position. The MVP-1
harness says so in its own comment: `mouse.click` "does not force past actionability — whatever
element is topmost at that point receives the event, which is the honest behaviour and the reason
hit-testing is named as a gap." The gap is real and it is now measured: MVP-2 demo B.

**Dispatch mistaken for success.** ADR-0006 is explicit that `EXECUTED` means *dispatched without
an immediate error*, and that "whether the intended state actually arrived is **VERIFY RESULT**'s
question." Nothing asked it. An agent with no answer to it reports completed steps after clicking
dead pixels, and keeps doing so confidently — which is worse than failing, because it fails
silently and then plans on top of the false result.

## 2. Decision

Add **two stages, kept separate**, and one composition that sequences them:

```
PROPOSE → VALIDATE → ALLOW → HIT-TEST → MATCH → ACT → VERIFY RESULT
                        │                  │              │
                   RE_OBSERVE     MISMATCH / UNKNOWN   CONFIRMED /
                        │                  │          NOT_CONFIRMED /
                      stop               stop            UNKNOWN
```

| file | stage |
|---|---|
| `packages/agent/src/hitTest.ts` | HIT-TEST AGREEMENT — `establishHitAgreement`, `HitTestBridge`, `agreesForDispatch` |
| `packages/agent/src/verifyResult.ts` | VERIFY RESULT — `verifyActionResult`, `ExpectedPostcondition`, `wasConfirmed` |
| `packages/agent/src/guardedAct.ts` | the composition — `guardedAct`, `guardedActionConfirmed` |

They are not merged into ACT. A gate that lives inside the thing it gates cannot be reasoned about
separately, and the loop's own vocabulary already names them as distinct stages.

## 3. HIT-TEST AGREEMENT — the contract

**Input.** An attested `ALLOW` from `validateActionFreshness`, and a `HitTestBridge`.

**Bridge authority: one read-only method.**

```ts
interface HitTestBridge {
  readonly frameId: FrameId;
  topmostAtCssPoint(point: CssPoint): Promise<TopmostElement | null>;
}
```

It is a **separate interface** from `PageActionBridge`, not a method added to it: looking and
touching are different authorities, and an adapter may hold one without the other. There is no
navigate, no evaluate, no keyboard, no storage, no network — so INV-15/17/18/19 continue to hold
**by absence**. Reading which element is topmost is strictly less authority than the click ACT
already performs, so this adds no new browser capability.

**The implementer contract, and the distinction is load-bearing:**

| the bridge does | it means |
|---|---|
| resolves with a `TopmostElement` | "this is reliably what is on top there" |
| resolves with `null` | "there is reliably **nothing** there" → **MISMATCH** |
| **throws** | "I cannot answer" → **UNKNOWN** |

An implementation that cannot tell those apart must throw. Returning `null` for "I don't know"
would turn an unknown into a definite finding, which is the one direction this module must never
be wrong in.

**Output: three values, one of which permits a click.**

| | meaning | may ACT run? |
|---|---|---|
| `MATCH` | the topmost element agrees with the validated target | **yes** |
| `MISMATCH` | something else is topmost, or nothing is | **no** |
| `UNKNOWN` | agreement could not be established | **no** |

`agreesForDispatch` is a single expression — `agreement === "MATCH" && bearsHitAgreement(r)` — so
a caller cannot get the polarity wrong by enumerating failures, and a value this module has never
heard of is a refusal. There is no re-target, no nearest candidate, no retry.

**Identity comparison — and why it is not the node id.** `NodeId` is positional (`e0`, `e1`, …).
Removing an element renumbers everything after it, so a stale claim silently rebinds to a
different control; MVP-1 demo E measured exactly that. Agreement is therefore established from

1. **the stable DOM reference** — `domRef.selector`, plus `nth` where the selector is not unique;
2. **role**, exactly;
3. **accessible name**, exactly;
4. **geometry**, at an IoU floor (§6).

A validated node with **no** stable reference is `UNKNOWN`/`NO_STABLE_REFERENCE` — a refusal, not
a fallback to the node id. Geometry is kept as well as the selector because the MVP DOM probe
falls back to a tag name for an element with no id, so `button` can describe several controls.

**Geometry uses the element's FULL box, never the actable one.** `AllowedAction.viewportBox` is
the *actable* box — for a `CLIPPED` element, only the visible fragment — while a bridge's
`getBoundingClientRect()` reports the whole element. Comparing a fragment against a whole reports a
shape change that never happened and would refuse a half-scrolled button forever. `actionFreshness.ts`
learned this from a failing test; the distinction is carried over rather than rediscovered.

**Attestation.** Results carry a module-private symbol, the same device and the same stated limit
as `VALIDATED_BY_FRESHNESS`: a same-realm integrity check, not a capability. A `{ agreement:
"MATCH" }` literal — including one from `JSON.parse` — is not permission.

## 4. A coupling that must be stated: the hit-tested point is the clicked point

ACT derives its dispatch point privately as `decision.point ?? centre(decision.viewportBox)`. If
the hit test asked about a **different** point from the one ACT then clicks, the entire gate would
be theatre. The rule is therefore duplicated in `dispatchPointOf` and **pinned by a test that
sweeps both implementations over the same boxes** (`hitTest.test.ts`, "agrees with ACT over a
sweep of boxes and explicit points"). Recorded here rather than left to be discovered, because it
is a duplication that is safe only while the test exists. Folding it into a single exported helper
inside `act.ts` is the correct fix and is deferred with §8 for the same reason.

## 5. VERIFY RESULT — the contract

**Input.** The `ActResult`, the `ElementNode` that was acted on, the frame it was dispatched
against, a **declared** expected postcondition, and a **fresh** `PostActionObservation`.

**The postcondition is declared, never guessed.** There is no "something changed" check, and there
must not be: the QG-02 fixture contains a live region on a timer, so a generic diff would confirm
any action at all. The vocabulary is three kinds, each answerable from the element graph plus one
focus reading — `FOCUS_ON_TARGET`, `TARGET_ENABLED`, `TARGET_NAME`. Each exists because it is a
real observable of the controlled fixture. Navigation, submission and value change are **not**
observable by this stage and are not offered.

**Focus is three-valued**, and that is why `focusedSelector` is not a boolean: a selector means
that element has focus; `null` means reliably nothing does; the property being **absent** means the
observer could not establish it, which is `UNKNOWN` and must never be read as "nothing is focused".

**Output.**

| | when |
|---|---|
| `CONFIRMED` | the declared postcondition was positively observed |
| `NOT_CONFIRMED` | reliable evidence shows it did not occur — including ACT's own refusal, which is reliable evidence that nothing was dispatched |
| `UNKNOWN` | the evidence does not settle it |

**Timeouts are UNKNOWN, always.** `EXECUTION_ERROR` — `BRIDGE_TIMEOUT` *and* `BRIDGE_THREW` —
returns `UNKNOWN` **before the page is read at all**. A bridge may throw after dispatching, and a
page that happens to look right does not establish that *this* action made it so. MVP-2 demo E is
the demonstration: `document.activeElement` was exactly what a confirmation would look like, and
the answer was still `UNKNOWN`. **Nothing in this stage retries anything**; recovery belongs to an
orchestration layer that does not exist.

**A stale observation is UNKNOWN.** Verifying against the same frame the action was validated
against would "confirm" a postcondition that was already true beforehand. That is the dressed-up
version of assuming success, and it is refused explicitly.

**A vanished target is UNKNOWN, not a failure.** The element may have disappeared *because* the
action worked, or instead of it. The final state cannot say which, so it does not.

**Re-identification is by stable reference.** `ActedTarget` carries only the positional `nodeId`,
so the full `ElementNode` is required — its `domRef` is what survives a fresh observation. Zero
matches is `TARGET_ABSENT_AFTER_ACTION`; more than one is `TARGET_AMBIGUOUS`; a changed role is
`TARGET_IDENTITY_CHANGED`. All three are `UNKNOWN`.

## 6. The one number, and it is a proposal

`PROPOSED_HIT_TEST_TOLERANCE.minBoxIou = 0.8` — the minimum overlap between the validated
element's full box and the topmost element's box.

It is **borrowed**, not invented: it is `PROPOSED_FRESHNESS_TOLERANCE.minBoxIou` from ADR-0005,
answering the same question ("is this the same box?") a few milliseconds later. Using a second,
different number would imply a distinction nothing has measured. Borrowing across purposes is a
proposal, so it is configuration with a documented default and **an owner decision changes a call
site, not a source edit**. `DEFAULT_HIT_TEST_TIMEOUT_MS = 2000` is likewise a default, not a
measured bound.

**No detector threshold, NMS parameter, model, preprocessing step or capture policy is touched by
this ADR.**

## 7. What was considered and rejected

| option | why not |
|---|---|
| **Re-resolve the target by selector at dispatch time** (`locator.click`) | that is the executor choosing its own target. It converts a mismatch into a silent re-aim, which is the fallback-clicking this architecture forbids |
| **Click anyway and let VERIFY RESULT sort it out** | the click has already happened. VERIFY RESULT cannot un-submit a form |
| **Treat `UNKNOWN` as MATCH when the page "looks fine"** | there is no such thing as an unknown that is probably fine. It is the single change that would make the gate worthless |
| **A generic "did anything change?" postcondition** | the fixture's own live region would confirm every action. A check that always passes is not a check |
| **Let the final page state upgrade an unknown dispatch** | it cannot distinguish "my click did this" from "it was already like this" |
| **Add `topmostAtCssPoint` to `PageActionBridge`** | bundles looking with touching. Two interfaces let an adapter hold only the authority it needs |
| **Make the agreement a required argument to `act()`** | **correct, and deferred** — see §8 |

## 8. The residual, stated rather than buried

**`act()` remains exported and callable without a hit test.** The gate is enforced by `guardedAct`
— the composed path, which calls `act` from exactly one place inside the `MATCH` branch with no
statement in between — and by `act` being documented as the unguarded primitive. It is **not**
enforced by a mechanism that makes an unguarded dispatch impossible.

Making the agreement a required argument to `act()` would be strictly stronger. It would also mean
rewriting the tests of **PR #60, which is another author's open pull request**, and this run does
not do that. The follow-up is recorded in the MVP-2 decision record: make it required once PR #60
has merged, so the change touches settled code. A reviewer should treat success criteria 3 and 4
("UNKNOWN prevents ACT", "MISMATCH prevents ACT") as **established for the composed path and for
every caller that uses it**, and not as a property of `act` in isolation.

## 9. Security and privacy consequences

| | |
|---|---|
| Network | **none added.** Neither module imports anything that can reach a network |
| Storage | **none added.** Both stages are stateless; nothing is persisted |
| Secrets | **none.** No field in any type here can hold a value, a `value_ref` or a token. `type` is still refused |
| Page content | **none logged.** Bridge error *messages* are dropped and only the error class name is kept, because a message can quote page markup (INV-21). `TopmostElement` carries role, accessible name, selector and geometry — already-permitted element-graph metadata — and has no field for inner text, an `href` or a screenshot |
| New browser authority | **none.** One read-only query, strictly less than the click that already exists |
| Arbitrary execution | **none.** The observation handed to VERIFY RESULT is structured data, not a script. The MVP-2 harness's page probes are the harness's own fixed templates with only finite numbers and a validated element id substituted |
| Egress / CSP | **unchanged** |
| Detector | **unchanged and UNADOPTED.** Not loaded in MVP-2 |

## 10. Verification

| gate | result |
|---|---|
| `npm run verify` | **PASS** — see the PR body for exact counts |
| MVP-2 browser run | **`AS DESIGNED`**, `problems: []`, 8 demos, 1 CONFIRMED, 0 click events in every refusing demo |
| Mutation check | 5 deliberate source mutations, **5 killed** (1–6 tests each) |
| Unit + integration | `hitTest.test.ts` 19 · `verifyResult.test.ts` 22 · `guardedActOnMvpFixture.test.ts` 14 |

## 11. Rollback

Delete the three source files, the three test files and the MVP-2 experiment directory, and revert
the export block in `packages/agent/src/index.ts`. Nothing else depends on them: ACT, VALIDATE and
REFRESH are untouched, and no existing behaviour changes when this is removed.

## 12. What this does not decide

The detector's adoption (**UNADOPTED**), the D2 acceptance numbers (**PENDING**), the D5 source
authorisations (**PENDING**), the W-A real-data collection gate (**CLOSED**), the capture-format
policy (ADR-0002, unchanged), the freshness tolerances (ADR-0005, still PENDING), and whether
`type`, RE-HYDRATE, SANITIZE, the privacy verifier or any server stage should exist yet (they
still do not).
