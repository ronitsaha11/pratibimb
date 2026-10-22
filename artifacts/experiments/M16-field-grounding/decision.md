# M16 — decision record

**Decision:** which stored value may go into which empty field is decided by privacy
(`groundFill`), enforced by the plan validator, and offered to the reasoner as the only inserts it
may write. The reasoner can no longer be the authority on whether a private value fits a field.

## Within current contracts

The manifest, the action schema, the ADRs and the gates are unchanged. The verified handoff is
byte-for-byte what it was.

**What is new is a client-side input to the local reasoner, `ReasonerRequest.fill`:**
- It is built from element ids and reference tokens the handoff already carries, related by privacy's
  own field classifier. It holds no value.
- `sendToReasoner` refuses one that names anything outside the handoff.
- Through the local adapter's grammar, the loopback model is told which empty field takes which
  reference. That is the field's class, implied.

The adapter already told the model one derived fact that is not in the manifest: which fields are
`empty`.

## For owner approval — not decided here

1. **Is `ReasonerRequest.fill` acceptable as a client-internal input to the local reasoner?**
   This record treats it as within contract:
   - the frozen `ServerPlanner` interface (constitution §3) is "manifest + frame + goal";
   - the local adapter is a loopback stand-in;
   - its request body is already an adapter rendering, not the manifest.

   If the owner reads `ReasonerRequest` as the frozen planner interface itself, this needs an ADR.
2. **A remote `ServerPlanner` does not receive it.** Sending the field-to-reference pairing (or a
   field's class) to a server would be a **manifest change** (v1.1 → v1.2 or later), and it needs an
   ADR. Nothing here does that.
3. **Re-inserting a reference into the field it was read from is now refused**
   (`NOT_AN_EMPTY_FIELD`). The binder alone allowed it. It never had a purpose on the M2 page, and
   it was M15's run-1 failure mode.
4. **Two references of the class an empty field accepts → the field is withheld**
   (`CONFLICTING_REFERENCES`). Neither is chosen. Asking the person which one is the intended
   behaviour, but the panel has no "which one?" prompt yet. Today the run stops with the reason.
