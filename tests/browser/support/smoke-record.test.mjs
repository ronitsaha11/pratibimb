import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createTimeline, isOrdered, leaksIn, onceOnly, projectTurn, runIdOf, writeNewRecord } from "./smoke-record.mjs";

describe("the harness timeline", () => {
  it("is in milliseconds since it began, in order", () => {
    let t = 1000;
    const line = createTimeline(() => t);
    line.mark("HARNESS_READY");
    t += 12.345;
    line.mark("TASK_SEEN_RUNNING", "FORM_2");
    expect(line.events).toEqual([
      { event: "HARNESS_READY", atMs: 0 },
      { event: "TASK_SEEN_RUNNING", atMs: 12.35, code: "FORM_2" },
    ]);
    expect(isOrdered(line.events)).toBe(true);
  });

  it("refuses free text as an event or a code, so page text cannot be recorded", () => {
    const line = createTimeline(() => 0);
    expect(() => line.mark("the user typed 9000000001")).toThrow(/not an event name/);
    expect(() => line.mark("PAGE_CHECKED", "Ramesh Kumar")).toThrow(/not a code/);
    expect(line.events).toEqual([]);
  });

  it("refuses a clock that goes backwards", () => {
    let t = 10;
    const line = createTimeline(() => t);
    line.mark("A");
    t = 5;
    expect(() => line.mark("B")).toThrow(/backwards/);
  });

  it("isOrdered rejects an out-of-order trail", () => {
    expect(isOrdered([{ event: "A", atMs: 2 }, { event: "B", atMs: 1 }])).toBe(false);
  });
});

describe("a recorded turn", () => {
  const turn = {
    state: "DONE",
    refusal: null,
    reasonerKind: "LOCAL_MODEL",
    plan: { steps: [{ op: "insert", target: "#mobile_confirm", ref: "<PII:PHONE:1>", literal: "9000000001" }, { op: "click", target: "#submit" }] },
    consents: [{ target: "#mobile_confirm", piiClass: "PHONE", outcome: "ALLOWED_ONCE", preview: "90••••••01" }],
    rehydrated: [{ ref: "<PII:PHONE:1>", target: "#mobile_confirm", piiClass: "PHONE", inserted: true }],
    act: { verification: { verification: "CONFIRMED" } },
    declaration: { source: "PERSON", targets: ["#submit"] },
    events: [{ event: "RUN_STARTED", atMs: 0 }, { event: "RUN_ENDED", atMs: 9.5, code: "DONE:CONFIRMED" }],
    transitions: [{ from: "IDLE", to: "OBSERVE", at: 1761250000000, elapsedMs: 0.1 }],
    timings: { observeMs: 3.2, totalMs: 9.5, bogus: "x" },
    handoff: { text: "Ramesh Kumar" },
  };

  it("keeps codes, times and ids of controls, and nothing that could be a value", () => {
    const p = projectTurn(turn, 0);
    expect(p.planOps).toEqual([{ op: "insert", target: "#mobile_confirm" }, { op: "click", target: "#submit" }]);
    expect(p.consents).toEqual([{ target: "#mobile_confirm", piiClass: "PHONE", outcome: "ALLOWED_ONCE" }]);
    expect(p.transitions).toEqual([{ from: "IDLE", to: "OBSERVE", elapsedMs: 0.1 }]);
    expect(p.timings).toEqual({ observeMs: 3.2, totalMs: 9.5 });
    expect(leaksIn(p, ["9000000001", "Ramesh Kumar", "90••••••01", "<PII:PHONE:1>"])).toEqual([]);
  });
});

describe("records are new, never rewritten", () => {
  it("writes a file that does not exist, and refuses one that does — leaving it untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "pratibimb-record-"));
    const path = join(dir, "w1-run.json");
    writeNewRecord(path, { verdict: "PASS" });
    expect(() => writeNewRecord(path, { verdict: "FAIL" })).toThrow(/EEXIST/);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ verdict: "PASS" });
  });

  it("does not overwrite an existing historical record either", () => {
    const dir = mkdtempSync(join(tmpdir(), "pratibimb-record-"));
    const path = join(dir, "w1-history.json");
    writeFileSync(path, "history\n");
    expect(() => writeNewRecord(path, {})).toThrow(/EEXIST/);
    expect(readFileSync(path, "utf8")).toBe("history\n");
  });

  it("names a run by its start time only", () => {
    expect(runIdOf(new Date("2026-10-24T09:05:07.123Z"))).toBe("20261024T090507Z");
  });
});

describe("shutdown", () => {
  it("runs once however many times it is asked", async () => {
    let calls = 0;
    const shutdown = onceOnly(async () => {
      calls += 1;
    });
    await Promise.all([shutdown("SIGINT"), shutdown("closed"), shutdown("done")]);
    expect(calls).toBe(1);
  });
});
