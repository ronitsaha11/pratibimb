/**
 * M23.7 — WHETHER A TASK LOOKS AT PIXELS. In a product build it does not.
 *
 * OD-R (owner, 2026-11-03) selected a DOM-only Phase 1: normal task execution captures no frame,
 * loads and runs no UI head (OD-P), and invokes no TR-01. This file is the one place that decision
 * is applied to a task run, so the absence of capture is a property of the wiring rather than a
 * side effect of nobody having clicked the toolbar. The gesture grant used to be what kept a task
 * frame-free; it no longer is.
 *
 * WHAT A PRODUCT TASK GETS. No `perceive` port at all. `extension-ports.ts` then takes the reading
 * without a perception pass (its documented DOM-only floor), `extension-run.ts`'s `visual()` has
 * nothing to declare, and the handoff carries the structural floor: `backend: "none"`,
 * `tiers_fired: ["T0", "T2"]`, `scale_to_css: 1`, every element `source: "dom"`. Nothing claims a
 * detector tier that did not run.
 *
 * WHAT AN EVIDENCE BUILD GETS. Exactly what it had: the perception pass, T1 and TR-01 included, so
 * the gesture, redaction and detector harnesses keep measuring the realm they were written for.
 * `EVIDENCE_BUILD` in `wxt.config.ts` is the same flag that already selects the evidence CSP.
 *
 * Substituted at build time (`__EVIDENCE_BUILD__`), like `__M3_WORKER_FRAME__`: a product bundle
 * carries the `false` branch only.
 */

declare global {
  // eslint-disable-next-line no-var
  var __EVIDENCE_BUILD__: boolean;
}

/** What a task run's dependencies may carry for perception, by build. */
export type TaskPerception<P> = { readonly perceive?: P };

/**
 * The task run's perception dependency: the given port in an evidence build, nothing in a product
 * build. Nothing else is decided here — not the port's behaviour, not the realm, not the model.
 */
export function taskPerception<P>(evidenceBuild: boolean, perceive: P): TaskPerception<P> {
  return evidenceBuild ? { perceive } : {};
}

/**
 * Whether the offscreen realm may load the UI head (T1). Only an evidence build packages it
 * (`wxt.config.ts`), so a product build does not ask for an asset it does not carry.
 */
export function loadsUiHead(evidenceBuild: boolean): boolean {
  return evidenceBuild;
}
