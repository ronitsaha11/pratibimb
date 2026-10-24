/**
 * M20 — THE RUN'S EVENT TRAIL AND ITS CLOCK.
 *
 * Every run now carries `events`: a fixed name, a time since the run started on the monotonic clock,
 * and at most a code. These tests hold that trail to what the run actually did — in order, once per
 * thing that happened, never claiming a click that was not dispatched or a success that was not
 * verified — and to carrying no value. The gates are the real ones; only the page, the reasoner and
 * the person are doubles.
 */
import { describe, expect, it } from "vitest";
import { deterministicReasoner, unavailableReasoner } from "@pratibimb/reasoner";
import { runTask, type ConsentRequest, type RunEventName, type RunRecord } from "../src/index.js";
import { DEMO, RUN_OPTIONS, SECOND_MOBILE, SimulatedPage, portsFor, type PortOptions } from "./support/simulatedPage.js";

const allowOnce = async (r: ConsentRequest) => ({
  kind: "ALLOW_ONCE",
  consentId: r.consentId,
  sessionId: r.sessionId,
  origin: r.origin,
  documentId: r.documentId,
  target: r.target,
});
const deny = async (r: ConsentRequest) => ({ kind: "DENY", consentId: r.consentId });

const run = async (options: PortOptions = {}, extra: Record<string, unknown> = {}) => {
  const page = new SimulatedPage(options);
  const record = await runTask(portsFor(page, { reasoner: deterministicReasoner(), ...options }), { ...RUN_OPTIONS, ...extra });
  return { page, record };
};

const names = (record: RunRecord): RunEventName[] => record.events.map((e) => e.event);

const expectOrdered = (record: RunRecord) => {
  const times = record.events.map((e) => e.atMs);
  for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
  expect(times[0]).toBeGreaterThanOrEqual(0);
  expect(names(record)[0]).toBe("RUN_STARTED");
  expect(names(record).at(-1)).toBe("RUN_ENDED");
  expect(names(record).filter((n) => n === "RUN_ENDED")).toHaveLength(1);
};

const anyValueIn = (anything: unknown): boolean => {
  const text = JSON.stringify(anything);
  return [...Object.values(DEMO), SECOND_MOBILE].some((v) => text.includes(v));
};

describe("a completed run with consent", () => {
  it("records every stage in the order it happened, ending in a verified result", async () => {
    const { page, record } = await run({ consent: allowOnce });
    expect(names(record)).toEqual([
      "RUN_STARTED",
      "OBSERVED",
      "SANITIZED",
      "HANDOFF_VERIFIED",
      "PLAN_REQUESTED",
      "PLAN_RECEIVED",
      "PLAN_VALIDATED",
      "CONSENT_REQUESTED",
      "CONSENT_ANSWERED",
      "BINDER_REVALIDATED",
      "VALUE_RESTORED",
      "PAGE_REFRESHED",
      "CLICK_AUTHORIZED",
      "CLICK_DISPATCHED",
      "RESULT_OBSERVED",
      "RESULT_VERIFIED",
      "RUN_ENDED",
    ]);
    expectOrdered(record);
    const code = (n: RunEventName) => record.events.find((e) => e.event === n)?.code;
    expect(code("CONSENT_ANSWERED")).toBe("ALLOWED_ONCE");
    expect(code("BINDER_REVALIDATED")).toBe("OK");
    expect(code("VALUE_RESTORED")).toBe("PHONE");
    expect(code("RESULT_VERIFIED")).toBe("CONFIRMED");
    expect(code("RUN_ENDED")).toBe("DONE:CONFIRMED");
    expect(page.clicks).toBe(1);
  });

  it("forwards the click exactly once: one dispatch event, one click on the page", async () => {
    const { page, record } = await run({ consent: allowOnce });
    expect(names(record).filter((n) => n === "CLICK_AUTHORIZED")).toHaveLength(1);
    expect(names(record).filter((n) => n === "CLICK_DISPATCHED")).toHaveLength(1);
    expect(page.clicks).toBe(1);
  });

  it("carries no value: names, times and codes only", async () => {
    const { record } = await run({ consent: allowOnce });
    expect(anyValueIn(record.events)).toBe(false);
    for (const e of record.events) {
      expect(Object.keys(e).every((k) => ["event", "atMs", "code"].includes(k))).toBe(true);
      if (e.code !== undefined) expect(e.code).toMatch(/^[A-Z0-9_:]+$/);
    }
  });

  it("places each event between the transitions that bound its stage", async () => {
    const { record } = await run({ consent: allowOnce });
    const enteredAt = (to: string) => record.transitions.find((t) => t.to === to)!.elapsedMs;
    const at = (n: RunEventName) => record.events.find((e) => e.event === n)!.atMs;
    expect(at("CONSENT_REQUESTED")).toBeGreaterThanOrEqual(enteredAt("AWAIT_GRANT"));
    expect(at("VALUE_RESTORED")).toBeGreaterThanOrEqual(enteredAt("REHYDRATE"));
    expect(at("CLICK_DISPATCHED")).toBeGreaterThanOrEqual(enteredAt("VERIFY_RESULT"));
    expect(at("RUN_ENDED")).toBeLessThanOrEqual(record.timings.totalMs!);
  });
});

describe("runs that did not succeed say so", () => {
  it("a denial ends the trail at the answer: nothing restored, nothing clicked", async () => {
    const { page, record } = await run({ consent: deny });
    expectOrdered(record);
    expect(names(record).slice(-3)).toEqual(["CONSENT_REQUESTED", "CONSENT_ANSWERED", "RUN_ENDED"]);
    expect(record.events.at(-2)?.code).toBe("CONSENT_DENIED");
    expect(record.events.at(-1)?.code).toBe("REFUSED:CONSENT_DENIED");
    for (const n of ["VALUE_RESTORED", "CLICK_AUTHORIZED", "CLICK_DISPATCHED", "RESULT_VERIFIED"] as const) expect(names(record)).not.toContain(n);
    expect(page.clicks).toBe(0);
  });

  it("a dispatch that throws is recorded as failed, never as dispatched, and the end is not a success", async () => {
    const { record } = await run({ consent: allowOnce, clickThrows: true });
    expectOrdered(record);
    expect(names(record)).toContain("CLICK_AUTHORIZED");
    expect(names(record)).toContain("CLICK_DISPATCH_FAILED");
    expect(names(record)).not.toContain("CLICK_DISPATCHED");
    // The gate reads the page back anyway — a failed dispatch may still have happened — and the
    // verifier cannot confirm it. The trail says exactly that; `DONE` alone would read as success.
    expect(record.events.find((e) => e.event === "RESULT_VERIFIED")?.code).not.toBe("CONFIRMED");
    expect(record.events.at(-1)?.code).not.toBe("DONE:CONFIRMED");
  });

  it("a model outage and the recorded fallback appear as what they were", async () => {
    const page = new SimulatedPage({});
    const record = await runTask(
      { ...portsFor(page, { reasoner: unavailableReasoner(), consent: allowOnce }), fallback: deterministicReasoner() },
      RUN_OPTIONS
    );
    expectOrdered(record);
    const trail = names(record);
    const fellBack = trail.indexOf("FALLBACK_REQUESTED");
    expect(fellBack).toBeGreaterThan(trail.indexOf("PLAN_RECEIVED"));
    expect(record.events[trail.indexOf("PLAN_RECEIVED")]!.code).not.toBe("USABLE");
    expect(trail[fellBack + 1]).toBe("PLAN_RECEIVED");
    expect(record.events[fellBack + 1]!.code).toBe("USABLE");
  });
});

describe("the clock", () => {
  it("measures durations on the monotonic clock, unaffected by the wall clock jumping back", async () => {
    let wall = 1_000_000;
    let mono = 0;
    const { record } = await run(
      { consent: allowOnce },
      {
        // The wall clock steps backwards on every read; the monotonic one advances 1 ms per read.
        now: () => (wall -= 1000),
        monotonic: () => (mono += 1),
      }
    );
    for (const [key, ms] of Object.entries(record.timings)) expect(ms, key).toBeGreaterThanOrEqual(0);
    for (const t of record.transitions) expect(t.elapsedMs).toBeGreaterThanOrEqual(0);
    expectOrdered(record);
  });

  it("leaves a stage that did not run unmeasured, rather than zero", async () => {
    const { record } = await run({ consent: deny });
    expect("rehydrateMs" in record.timings).toBe(false);
    expect("actMs" in record.timings).toBe(false);
    expect("verifyResultMs" in record.timings).toBe(false);
  });
});
