---
id: ADR-0014
title: "Just-in-time, one-time consent in the extension's side panel, with a masked local preview"
version: 1.0
status: ACCEPTED — directed by the owner in the M19 brief (2026-10-23); implemented in M19. Scope is the local consent UI only
owner: pratibimb-architect
proposed_by: privacy-security-engineer · browser-engineer
created: 2026-10-23
modified: 2026-10-23
amends: none. ADR-0008 §5 (TTLs) is NOT touched; no manifest, handoff or plan schema changes
related_invariants: ["INV-07", "INV-21", "INV-22"]
evidence: artifacts/experiments/M19-panel-consent/
---

# ADR-0014 — Panel consent with a masked local preview

> **STATUS: ACCEPTED (owner-directed, M19) and IMPLEMENTED.** Scope: the extension's own side panel,
> for tasks the person started there. It is not permission to show a value, or any part of one, to
> any other realm.

## 0. The owner decision, as given

From the M19 brief: *"Adopt the following privacy UX design for this milestone: Just-in-time,
one-time consent with a masked local preview."*

The brief sets these rules:
- Before a stored value is restored, the person explicitly approves that exact use in the side panel.
- The panel shows the origin, the field's verified label, the category and a masked preview "when
  it can be produced safely".
- The panel offers exactly two choices, **Allow once** and **Deny**.
- There is no reveal-full-value option.
- No masking rule is invented for structures the repository has not approved.

## 1. Decision

| | |
|---|---|
| **When** | AWAIT_GRANT, for each reference-backed insert, before REHYDRATE. Only for a run started in the side panel (M18 `TASK_START`). A control-plane run keeps `requestGrant`. |
| **What is asked** | One restoration: this reference, into this field, on this origin, document and session, in this turn (`ConsentRequest`, `packages/orchestrator/src/consent.ts`). |
| **What is shown** | Site; field label; category; masked preview; "PratiBimb is about to put your … into “…” on …"; the click that follows. |
| **Answers** | `ALLOW_ONCE`, which echoes consent id, session, origin, document and field, or `DENY`, which carries the consent id only. Strict keys. Checked by `checkConsentAnswer`. |
| **Who may answer** | Only the side panel page (`isFromSidePanel`): not a page, not the service worker's control plane, not the offscreen document. |
| **What an allow is** | The same one-shot `UseGrant` the run always made. The binder still decides, `rehydrate` still restores, and nothing is cached. It authorises no click: the declared postcondition, REFRESH, the permit gate and VERIFY RESULT still govern. |
| **Anything else** | Deny, a closed panel, a malformed, forged, replayed or stale answer, or a page whose structure moved while the person decided: nothing is restored and nothing is submitted. |

## 2. The masked preview

`consentPreview` (`packages/privacy/src/preview.ts`) is computed in the page realm, where the vault
is. It is produced only for a live reference going into a field it fits. The rule:

| Class | Preview |
|---|---|
| PHONE, and the value is an Indian mobile by the classifier's own validator (`normaliseIndianMobile`) | `••••••••` + last two digits (the owner's example) |
| PHONE that does not validate; NAME; DOB; AADHAAR; anything else | fixed generic indicator `••••••`. No approved mask exists for these structures; none is invented. |

**It may go to the extension's consent UI and nowhere else.** That excludes:
- the handoff and the model prompt;
- the run's record, logs and experiment records;
- the service worker's traffic recorder, which records requests, not replies.

The page realm's reply carrying it passes the same held-value scan as every other reply.
`packages/privacy/test/boundaries.test.ts` names `preview.ts` as the second reader of the reveal
path, beside `bind.ts`.

## 3. Not decided here — for the owner

1. **Masks for other classes**, e.g. the UIDAI masked-Aadhaar convention. Not adopted; generic for
   now.
2. **A time limit on a consent request.** ADR-0008 §5 leaves every TTL unapproved; M19 adds none.
   Staleness is decided by the page: document identity and the structural signal.
3. **Panel consent for control-plane-started runs.** Unchanged: they use `requestGrant`.

## 4. Rollback

Remove `ports.consent` from the panel path in `apps/extension/host/offscreen/main.ts`. Panel-started
runs then fall back to `requestGrant`, as before M19. Nothing else depends on it.
