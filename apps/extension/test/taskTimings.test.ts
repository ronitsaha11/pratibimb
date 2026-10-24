/**
 * M20 — THE PANEL'S PER-STAGE TIMINGS.
 *
 * `timingRows` turns a finished task's status into rows the panel renders with `textContent`. Held
 * here: pipeline order, one unit, "not measured" kept distinct from 0, a person's time labelled as
 * theirs, a refused or failed turn headed as what it was, and no value anywhere in what is shown.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTask, type ConsentRequest } from "@pratibimb/orchestrator";
import { deterministicReasoner } from "@pratibimb/reasoner";

import { TIMING_STAGES, formatMs, timingRows } from "../host-lib/task-panel";
import { DEMO, RUN_OPTIONS, SECOND_MOBILE, SimulatedPage, portsFor } from "../../../packages/orchestrator/test/support/simulatedPage";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const finished = (turns: unknown[], outcome = "COMPLETED_AS_DECLARED") => ({ ok: true, task: { state: "FINISHED", result: { record: turns.at(-1), loop: { outcome, turns } } } });

describe("the rows", () => {
  it("follow the pipeline's order, ending with the total", () => {
    expect(TIMING_STAGES.map((s) => s.key)).toEqual([
      "observeMs",
      "sanitizeMs",
      "verifyPayloadMs",
      "clarifyMs",
      "sendMs",
      "fallbackMs",
      "validatePlanMs",
      "grantMs",
      "rehydrateMs",
      "refreshMs",
      "structureMs",
      "actMs",
      "verifyResultMs",
      "totalMs",
    ]);
  });

  it("show 0 as 0.0 ms and an absent stage as not measured — never the same thing", () => {
    const [turn] = timingRows(finished([{ timings: { observeMs: 0, totalMs: 12.345 }, refusal: { cause: "OBSERVER_THREW" } }], "STOPPED_REFUSED"));
    const row = (label: string) => turn!.rows.find((r) => r.label === label)!;
    expect(row("Read the page")).toMatchObject({ ms: 0, text: "0.0 ms" });
    expect(row("Sanitize")).toMatchObject({ ms: null, text: "not measured" });
    expect(row("Total (includes your time)").text).toBe("12.3 ms");
  });

  it("use one unit throughout", () => {
    expect([formatMs(0.04), formatMs(2043.21), formatMs(null)]).toEqual(["0.0 ms", "2043.2 ms", "not measured"]);
  });

  it("refuse to show a number that is not a measurement", () => {
    const [turn] = timingRows(finished([{ timings: { observeMs: -1, sanitizeMs: "3", sendMs: Number.NaN } }]));
    for (const label of ["Read the page", "Sanitize", "Reasoner"]) expect(turn!.rows.find((r) => r.label === label)!.ms).toBeNull();
  });

  it("label a person's deciding time as theirs", () => {
    const [turn] = timingRows(finished([{ timings: { grantMs: 4000, clarifyMs: 2000 } }]));
    expect(turn!.rows.filter((r) => r.person).map((r) => r.label)).toEqual(["Waiting for you: which value", "Waiting for you: allow or deny"]);
  });
});

describe("what a turn is headed as", () => {
  it("a refused turn says refused and nothing clicked", () => {
    const [turn] = timingRows(
      finished([{ timings: { observeMs: 3 }, plan: { steps: [{ op: "click", target: "#submit" }] }, act: null, refusal: { cause: "CONSENT_DENIED" } }], "STOPPED_REFUSED")
    );
    expect(turn!.heading).toBe("Turn 1: the model proposed clicking #submit; refused (CONSENT_DENIED), nothing clicked");
  });

  it("an unverified click says so", () => {
    const [turn] = timingRows(finished([{ timings: {}, plan: { steps: [{ op: "click", target: "#go" }] }, act: { verification: { verification: "UNKNOWN" } } }], "STOPPED_UNVERIFIED"));
    expect(turn!.heading).toBe("Turn 1: clicked #go → UNKNOWN");
  });

  it("nothing is shown while running, for a task that failed to run, or for no task", () => {
    expect(timingRows({ ok: true, task: { state: "RUNNING" } })).toEqual([]);
    expect(timingRows({ ok: true, task: { state: "FAILED", refused: "NO_ACTIVE_TAB_GRANT" } })).toEqual([]);
    expect(timingRows({ ok: true, task: null })).toEqual([]);
  });

  it("one row set per turn, in turn order", () => {
    const turns = timingRows(finished([{ timings: { totalMs: 1 } }, { timings: { totalMs: 2 }, declaredDone: true }]));
    expect(turns.map((t) => t.heading)).toEqual(["Turn 1: stopped (?)", "Turn 2: the model said the task is done"]);
    expect(turns.map((t) => t.rows.at(-1)!.ms)).toEqual([1, 2]);
  });
});

describe("from a real run", () => {
  it("shows the stages the run measured, and no value", async () => {
    const consent = async (r: ConsentRequest) => ({ kind: "ALLOW_ONCE", consentId: r.consentId, sessionId: r.sessionId, origin: r.origin, documentId: r.documentId, target: r.target });
    const page = new SimulatedPage();
    const record = await runTask(portsFor(page, { reasoner: deterministicReasoner(), consent }), RUN_OPTIONS);
    const [turn] = timingRows(finished([record]));
    const measured = turn!.rows.filter((r) => r.ms !== null).map((r) => r.label);
    expect(measured).toEqual([
      "Read the page",
      "Sanitize",
      "Verify the handoff",
      "Reasoner",
      "Validate the plan",
      "Waiting for you: allow or deny",
      "Restore the value",
      "Re-read the page",
      "Click, then read the result",
      "of which: read the result",
      "Total (includes your time)",
    ]);
    expect(turn!.heading).toBe("Turn 1: clicked #submit → CONFIRMED");
    const shown = JSON.stringify(turn);
    expect([...Object.values(DEMO), SECOND_MOBILE].some((v) => shown.includes(v))).toBe(false);
  });
});

describe("the panel", () => {
  it("renders the rows with textContent into #task-timings, never as markup", () => {
    const panel = readFileSync(join(ROOT, "apps/extension/host/sidepanel/main.ts"), "utf8");
    const html = readFileSync(join(ROOT, "apps/extension/host/sidepanel/index.html"), "utf8");
    expect(html).toContain('<div id="task-timings"></div>');
    const block = panel.slice(panel.indexOf("function renderTimings"));
    expect(block).toContain("ms.textContent = row.text;");
    expect(panel).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
  });
});
