# M17 — decision record

**Decision (M16 owner question 4, implemented within current contracts):**
- When two or more stored values fit an empty field, the run stops at a human-decision state,
  `AWAIT_CLARIFICATION`, before anything is sent or planned.
- The person is asked in the extension's side panel which value the field takes. Candidates are
  named only by the label of the field each came from.
- A choice is re-checked by privacy and then passes every existing gate.
- Anything other than a valid choice stops the run, with nothing filled and nothing submitted.
- If the labels cannot tell the candidates apart, the person is told to enter the value themselves;
  nobody is asked to pick blind.

## Why this is within contract

- **Manifest, action schema, ADRs and gates are unchanged.** The question travels only between the
  core realm (offscreen) and an extension page. It is not part of any handoff and never reaches a
  reasoner.
- **No new executable action.** An answer names a candidate and can carry nothing else (strict
  keys). It cannot authorise a click, name a target to act on, or carry a value.
- **The pipeline's stages are not removed, reordered or made conditional.** `AWAIT_CLARIFICATION`
  is a human-decision state like `AWAIT_GRANT`. It is entered only when privacy withheld a field as
  conflicting, and every other run's transitions are exactly as before.
- **The extension's message boundary is extended, not bypassed.** Two message kinds were added to
  the offscreen document, accepted only from this extension's own pages (sender URL).

## Behaviour change from M16, stated

M16 sent a page with a conflicting field to the planner, with that field withheld. The planner could
then click submit with the field empty; the page would refuse it, but the click still happened. Now:
- with a way to ask, the person is asked;
- without one (`ClientPorts.clarify` absent), the run stops (`CLARIFICATION_UNAVAILABLE`) before any
  planner is asked.

Two M16 orchestrator tests were updated to assert the stricter behaviour, and one privacy test to
assert the recorded candidates. No assertion was removed.

## Still for the owner — not decided here

1. **M16 Q1:** is `ReasonerRequest.fill` acceptable as a client-internal input to the local
   reasoner? It now also carries `chosenByPerson` and candidate tokens; `sendToReasoner` still
   refuses anything not from the handoff.
2. **M16 Q2:** giving the pairing to a remote planner would be a manifest change and needs an ADR.
   Not done.
3. **M16 Q3:** refusing reinsertion into a field that already holds a value. Unchanged.
4. **New:** the clarification TTL reuses the grant TTL, which ADR-0008 §5 leaves unapproved, as all
   TTLs here are.
5. **New:** should a person be able to see a **masked** preview (for example the last two digits)?
   Not implemented. It would need the value-holding page realm to produce value-derived text for the
   core realm and the panel, which is a privacy-boundary decision. Labels only, today.
6. **J7 / B5 / D1–D4, F-M13-1, production frame egress:** untouched and open.
