/**
 * `done` — the frozen action schema's terminal step (constitution §1 stage 12).
 *
 * A `done` is the reasoner's claim that the goal is already met. It must be the plan's only step, it
 * names no element, and it authorises nothing. It is still a claim ABOUT A VIEW, so every identity
 * and freshness check that guards an action guards it too.
 */
import { describe, expect, it } from "vitest";
import { PLAN_OPERATIONS, parsePlan, redactPlan, validatePlan, type Plan } from "../src/index.js";
import { REQUEST, rawPlan, scenario } from "./support/scenario.js";

const DONE = { op: "done" };
const CLICK = { op: "click", target: "#submit" };

const parse = (raw: unknown): Plan => {
  const parsed = parsePlan(raw);
  if (!parsed.ok) throw new Error(`test setup: parse refused (${parsed.cause})`);
  return parsed.plan;
};

describe("parsing done", () => {
  it("is a recognised operation, and the executable allowlist is not what this widens", () => {
    expect(PLAN_OPERATIONS).toEqual(["insert", "click", "done"]);
  });

  it("accepts a plan whose only step is done, with no target", () => {
    const parsed = parsePlan(rawPlan([DONE]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.steps).toEqual([{ op: "done" }]);
  });

  it.each([
    ["before an action", [DONE, CLICK], 0],
    ["after an action", [CLICK, DONE], 1],
    ["twice", [DONE, DONE], 0],
  ])("refuses done %s: it must stand alone", (_, steps, at) => {
    expect(parsePlan(rawPlan(steps))).toEqual({ ok: false, cause: "DONE_NOT_ALONE", at });
  });

  it("refuses a done that names an element", () => {
    expect(parsePlan(rawPlan([{ op: "done", target: "#submit" }]))).toEqual({ ok: false, cause: "DONE_TAKES_NO_TARGET", at: 0 });
  });

  it("still needs provenance", () => {
    expect(parsePlan({ planVersion: "1", steps: [DONE] })).toEqual({ ok: false, cause: "MISSING_PROVENANCE" });
  });
});

describe("validating done", () => {
  it("accepts done against the live view, and reports that it declares completion and needs nothing", async () => {
    const s = await scenario();
    const result = validatePlan(parse(rawPlan([DONE])), s.ctx);
    expect(result).toEqual({ ok: true, steps: [{ op: "done", index: 0 }], needsHuman: [], declaresDone: true });
  });

  it("an ordinary action plan does not declare completion", async () => {
    const s = await scenario();
    const result = validatePlan(parse(rawPlan([{ op: "insert", target: "#mobile_confirm", ref: s.phoneRef }, CLICK])), s.ctx);
    expect(result.ok && result.declaresDone).toBe(false);
  });

  it.each([
    ["a stale view", { provenance: { requestId: REQUEST, sessionId: "plan-session-1", viewId: "another-view" } }, "STALE_VIEW"],
    ["another request", { provenance: { requestId: "someone-else", sessionId: "plan-session-1", viewId: REQUEST } }, "REQUEST_MISMATCH"],
    ["another session", { provenance: { requestId: REQUEST, sessionId: "someone-else", viewId: REQUEST } }, "SESSION_MISMATCH"],
  ])("refuses a done made against %s, exactly as it would refuse an action", async (_, over, cause) => {
    const s = await scenario();
    const result = validatePlan(parse(rawPlan([DONE], over)), s.ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.cause).toBe(cause);
  });

  it("refuses a hand-built done the parser never produced", async () => {
    const s = await scenario();
    const forged = { planVersion: "1", steps: [{ op: "done" }], provenance: { requestId: REQUEST, sessionId: "plan-session-1", viewId: REQUEST } } as unknown as Plan;
    const result = validatePlan(forged, s.ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.cause).toBe("NOT_A_PARSED_PLAN");
  });
});

describe("one action per turn (M15)", () => {
  it("refuses a plan with two clicks, naming the second", async () => {
    const s = await scenario();
    const result = validatePlan(parse(rawPlan([{ op: "insert", target: "#mobile_confirm", ref: s.phoneRef }, CLICK, { op: "click", target: "#mobile_confirm" }])), s.ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toMatchObject({ cause: "MORE_THAN_ONE_CLICK", at: 2 });
  });
});

describe("displaying done", () => {
  it("projects to a bare done step: nothing to redact and nothing to show but the claim", async () => {
    const s = await scenario();
    expect(redactPlan(parse(rawPlan([DONE])), s.ctx.vault).steps).toEqual([{ op: "done" }]);
  });
});
