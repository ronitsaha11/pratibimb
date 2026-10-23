/**
 * M18 — a task stated in the side panel, with what each click must do: the desk that holds the form
 * in the offscreen document, the panel's model of it, the wiring that keeps pages and the control
 * plane from declaring on the person's behalf, and the whole path against the REAL gates.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prepareDeclarationForm, runTaskLoop, type DeclarationForm } from "@pratibimb/orchestrator";
import { type ReasonerClient } from "@pratibimb/reasoner";

import { createTaskDesk } from "../host-lib/task-desk";
import { addExpectation, describeExpectation, panelFormOf, summariseTask, taskAnswer, taskHeadline, type PanelForm } from "../host-lib/task-panel";
import { GOAL, ORIGIN, RUN_OPTIONS, SESSION, SimulatedPage, portsFor } from "../../../packages/orchestrator/test/support/simulatedPage";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const strip = (source: string): string => source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
const TARGET = { tabId: 7, frameId: 0 };

const formOf = async (page: SimulatedPage, formId = "form-1"): Promise<DeclarationForm> => {
  const reading = await page.observe();
  page.observations = 0;
  return prepareDeclarationForm({ nodes: reading.graph.nodes, focusedSelector: reading.focusedSelector ?? null }, { formId, sessionId: SESSION, origin: ORIGIN, documentId: reading.documentId });
};

/** What the panel receives from TASK_PREPARE, exactly as the offscreen document replies. */
const replyFor = (desk: ReturnType<typeof createTaskDesk>, form: DeclarationForm) => ({ ok: true, ...desk.hold(form, TARGET) });

const panelOf = (reply: unknown): PanelForm => {
  const form = panelFormOf(reply);
  if (!form) throw new Error("test setup: the panel could not read the form");
  return form;
};

describe("the panel's model of the form", () => {
  it("shows each control by name and role, and only the offers the form made", async () => {
    const desk = createTaskDesk();
    const form = panelOf(replyFor(desk, await formOf(new SimulatedPage({ twoStep: true }))));
    expect(form.controls).toEqual([
      { controlId: "k1", text: "Submit application — button, currently unavailable", offers: ["TARGET_RENAMED", "TARGET_FOCUSED"] },
      { controlId: "k2", text: "Verify mobile number — button", offers: ["TARGET_DISABLED", "TARGET_RENAMED", "TARGET_FOCUSED"] },
    ]);
  });

  it("refuses a reply it cannot read, and one whose binding names another form", () => {
    expect(panelFormOf({ ok: false, refused: "NO_TAB" })).toBeNull();
    expect(panelFormOf({ ok: true, form: { formId: "a", origin: ORIGIN, controls: [] }, binding: { formId: "b", sessionId: "s", origin: ORIGIN, documentId: "d" } })).toBeNull();
  });

  it("adds an expectation only for an offered result, once per control, and a label change needs a label", async () => {
    const form = panelOf(replyFor(createTaskDesk(), await formOf(new SimulatedPage({ twoStep: true }))));
    expect(addExpectation(form, [], null, "TARGET_DISABLED", "")).toMatchObject({ ok: false });
    expect(addExpectation(form, [], "k1", "TARGET_DISABLED", "")).toMatchObject({ ok: false }); // disabled already: not offered
    expect(addExpectation(form, [], "k2", "TARGET_RENAMED", "  ")).toMatchObject({ ok: false });
    const one = addExpectation(form, [], "k2", "TARGET_DISABLED", "");
    expect(one).toEqual({ ok: true, list: [{ controlId: "k2", expect: "TARGET_DISABLED" }] });
    expect(one.ok && addExpectation(form, one.list, "k2", "TARGET_FOCUSED", "")).toMatchObject({ ok: false });
    expect(one.ok && describeExpectation(form, one.list[0]!)).toBe("Verify mobile number — button: It becomes unavailable (greyed out)");
  });

  it("summarises a finished task without any value", () => {
    const text = summariseTask({
      ok: true,
      task: {
        state: "FINISHED",
        result: { loop: { outcome: "STOPPED_UNVERIFIED", turns: [{ plan: { steps: [{ op: "click", target: "#go" }] }, act: { verification: { verification: "NOT_CONFIRMED" } }, declaredDone: false }] } },
      },
    });
    expect(text).toBe("STOPPED_UNVERIFIED — turn 1: clicked #go → NOT_CONFIRMED");
  });

  it("ties the status line to the task it describes: when and where it started (M19 manual-test finding)", () => {
    const at = new Date(2026, 9, 23, 18, 22, 5);
    expect(taskHeadline({ at, origin: "http://127.0.0.1:8975" }, "COMPLETED_AS_DECLARED — turn 1: clicked #submit → CONFIRMED")).toBe(
      "Task started 18:22:05 on http://127.0.0.1:8975 (if you reloaded the page since, this is that earlier page): COMPLETED_AS_DECLARED — turn 1: clicked #submit → CONFIRMED"
    );
    expect(taskHeadline(null, "No task started.")).toBe("No task started.");
  });

  it("says a refused click was proposed and refused — never that it was clicked", () => {
    const text = summariseTask({
      ok: true,
      task: { state: "FINISHED", result: { loop: { outcome: "STOPPED_REFUSED", turns: [{ plan: { steps: [{ op: "click", target: "#alerts" }] }, act: null, refusal: { cause: "NO_DECLARED_POSTCONDITION" }, declaredDone: false }] } } },
    });
    expect(text).toBe("STOPPED_REFUSED — turn 1: the model proposed clicking #alerts; refused (NO_DECLARED_POSTCONDITION), nothing clicked");
  });
});

describe("the desk in the offscreen document", () => {
  it("starts once for an accepted answer; a second press of Start is refused", async () => {
    const desk = createTaskDesk();
    const form = panelOf(replyFor(desk, await formOf(new SimulatedPage())));
    const answer = taskAnswer(form, GOAL, [{ controlId: "k1", expect: "TARGET_DISABLED" }]);
    const first = desk.start(answer);
    expect(first.ok).toBe(true);
    expect(first.ok && first.target).toEqual(TARGET);
    expect(desk.start(answer)).toEqual({ ok: false, cause: "FORM_ALREADY_USED" });
  });

  it("refuses an answer from a panel still showing an earlier form after the page was read again", async () => {
    const desk = createTaskDesk();
    const page = new SimulatedPage();
    const stale = panelOf(replyFor(desk, await formOf(page, "form-1")));
    replyFor(desk, await formOf(page, "form-2")); // the person pressed "Read this page" again
    expect(desk.start(taskAnswer(stale, GOAL, [{ controlId: "k1", expect: "TARGET_DISABLED" }]))).toMatchObject({ ok: false, cause: "NOT_THIS_FORM" });
  });

  it("refuses with nothing held, and keeps refusing a spent form after clear()", async () => {
    const desk = createTaskDesk();
    expect(desk.start({ formId: "x" })).toEqual({ ok: false, cause: "NO_FORM" });
    const form = panelOf(replyFor(desk, await formOf(new SimulatedPage())));
    const answer = taskAnswer(form, GOAL, [{ controlId: "k1", expect: "TARGET_DISABLED" }]);
    expect(desk.start(answer).ok).toBe(true);
    desk.clear();
    expect(desk.start(answer)).toEqual({ ok: false, cause: "FORM_ALREADY_USED" });
  });

  it("passes a refused declaration's cause back, and keeps the form for a corrected answer", async () => {
    const desk = createTaskDesk();
    const form = panelOf(replyFor(desk, await formOf(new SimulatedPage())));
    expect(desk.start(taskAnswer(form, GOAL, [{ controlId: "k1", expect: "TARGET_RENAMED", name: "Submit application" }]))).toMatchObject({ ok: false, cause: "POSTCONDITION_ALREADY_HOLDS", at: 0 });
    expect(desk.start(taskAnswer(form, GOAL, [{ controlId: "k1", expect: "TARGET_DISABLED" }])).ok).toBe(true);
  });
});

describe("only the person's panel declares", () => {
  const offscreen = strip(readFileSync(join(ROOT, "apps/extension/host/offscreen/main.ts"), "utf8"));
  const panel = strip(readFileSync(join(ROOT, "apps/extension/host/sidepanel/main.ts"), "utf8"));
  const config = readFileSync(join(ROOT, "apps/extension/wxt.config.ts"), "utf8");

  it("checks the sender is this extension's own page before any TASK_* message is handled", () => {
    expect(offscreen).toMatch(
      /if \(msg\.kind === "TASK_PREPARE" \|\| msg\.kind === "TASK_START" \|\| msg\.kind === "TASK_STATUS"\) \{\s*if \(!isFromExtensionUi\(sender\)\) \{\s*sendResponse\(\{ ok: false, refused: "NOT_FROM_AN_EXTENSION_PAGE" \}\);/
    );
  });

  it("refuses a control-plane run that carries a declaration", () => {
    expect(offscreen).toMatch(/"declaration" in msg\.request\) \{\s*sendResponse\(\{ ok: false, refused: "DECLARATION_ONLY_FROM_THE_PANEL" \}\);/);
  });

  it("starts the person's run with the declaration the desk accepted, and no other table", () => {
    expect(offscreen).toContain("postconditions: declaration.postconditions,\n      declaration,");
    expect(offscreen).toContain("const started = taskDesk.start(msg.answer);");
  });

  it("reasons through the one endpoint the CSP pins, from the same two constants", () => {
    expect(config).toContain("__REASONER_ENDPOINT__: JSON.stringify(`${HOST_COLLECTOR_ORIGIN}${HOST_REASONER_PATH}`)");
    expect(offscreen).toContain("endpoint: __REASONER_ENDPOINT__,");
  });

  it("the panel renders page text as text and builds its answer through taskAnswer", () => {
    expect(panel).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(panel).toContain("taskAnswer(taskForm, goalInput?.value ?? \"\", expectations)");
    // A new reading clears the last task's line; a started task's line names when and where.
    expect(panel).toContain("taskStarted = null; // a new reading");
    expect(panel).toContain("say(taskHeadline(taskStarted, summariseTask(status)));");
  });
});

describe("panel → desk → the real gates", () => {
  /** The local model's part, scripted: click `target`, then say done. */
  const model = (target: string): ReasonerClient => {
    let turn = 0;
    return {
      name: "test:click-then-done",
      transport: "IN_PROCESS",
      async propose(request) {
        turn += 1;
        const provenance = { requestId: request.requestId, sessionId: request.sessionId, viewId: request.handoff.request.requestId, origin: request.origin };
        if (turn > 1) return { planVersion: "1", steps: [{ op: "done" }], provenance };
        const ref = request.fill.fillable.get("#mobile_confirm");
        return { planVersion: "1", steps: [...(ref ? [{ op: "insert", target: "#mobile_confirm", ref }] : []), { op: "click", target }], provenance };
      },
    };
  };

  const run = async (pageOptions: ConstructorParameters<typeof SimulatedPage>[0], expect_: { controlId: string; expect: string; name?: string }, target: string) => {
    const page = new SimulatedPage(pageOptions);
    const desk = createTaskDesk();
    const form = panelOf(replyFor(desk, await formOf(page)));
    const started = desk.start(taskAnswer(form, GOAL, [expect_ as never]));
    if (!started.ok) throw new Error(`test setup: ${started.cause}`);
    const { declaration } = started;
    const result = await runTaskLoop(portsFor(page, { ...pageOptions, reasoner: model(target) }), {
      ...RUN_OPTIONS,
      goal: declaration.goal,
      sessionId: declaration.sessionId,
      postconditions: declaration.postconditions,
      declaration,
      maxTurns: 3,
    });
    return { page, result };
  };

  it("the person declares the label change; the click is confirmed by the page and the task continues", async () => {
    const { page, result } = await run({ twoStep: true }, { controlId: "k2", expect: "TARGET_RENAMED", name: "Mobile number verified" }, "#verify");
    expect(result.turns[0]!.act?.verification).toMatchObject({ verification: "CONFIRMED", postcondition: "TARGET_NAME" });
    expect(result.turns[0]!.declaration).toEqual({ source: "PERSON", formId: "form-1", targets: ["#verify"] });
    expect(result.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(page.clicks).toBe(1);
  });

  it("the declared result does not happen: NOT_CONFIRMED, and no further turn", async () => {
    const { page, result } = await run({ twoStep: true, verifyDoesNothing: true }, { controlId: "k2", expect: "TARGET_RENAMED", name: "Mobile number verified" }, "#verify");
    expect(result.turns[0]!.act?.verification?.verification).toBe("NOT_CONFIRMED");
    expect(result.outcome).toBe("STOPPED_UNVERIFIED");
    expect(result.turns).toHaveLength(1);
    expect(page.clicks).toBe(1);
  });
});
