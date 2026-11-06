/**
 * M23.8 — THE ORDINARY PRODUCT TASK, OBSERVED RATHER THAN READ.
 *
 * M23.7 pinned the DOM-only wiring by reading the source. These run it: a real `RUN_TASK` or a real
 * panel task, through the real `background.ts`, `offscreen/main.ts`, task run, orchestrator, privacy
 * boundary, execution gate and egress guard, with every browser API faked and counted
 * (`support/simulatedExtension.ts`). "It captured no frame" is then a counter that stayed at zero.
 *
 * WHAT MAKES THE ZEROES MEAN SOMETHING. The negative controls run the same rig with the perception pass
 * put back, and the same counters and the same checks must then fail. A regression that wires T1 or
 * capture back into an ordinary task fails here.
 *
 * WHAT THIS IS NOT. A browser validation. See the rig's header. Nothing here touches a real frame, a
 * real model file, a real worker or a real model server.
 */
import { afterEach, describe, expect, it } from "vitest";

import { buildElementGraph, cssBox, frameId, fuse, projectElement, type CaptureGeometry, type DomMeasurement, type VisualDetection } from "@pratibimb/perception";
import { buildHandoffDraft, classifyObservation, createVault } from "@pratibimb/privacy";

import { domOnlyTaskChecks, failedChecks, structuralRequestProblems } from "../../../tests/browser/support/dom-only-checks.mjs";
import { panelAnswer } from "../host-lib/clarification-panel";
import { consentAnswer, consentViewOf, type ConsentScreen } from "../host-lib/consent-panel";
import { addExpectation, panelFormOf, taskAnswer } from "../host-lib/task-panel";
import {
  bootSimulatedExtension,
  CANARIES,
  contextOf,
  control,
  NO_VISUAL_ACTIVITY,
  PAGE_ORIGIN,
  REASONER_ENDPOINT,
  registrationPage,
  SENDERS,
  TAB_ID,
  taskRequest,
  type ModelReply,
  type ModelRequest,
  type ModelScript,
  type PageSpec,
  type Rig,
  type RigOptions,
  type RunResultShape,
  type TurnShape,
} from "./support/simulatedExtension";

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
});

const boot = async (options: Partial<RigOptions> = {}): Promise<Rig> => {
  rig = await bootSimulatedExtension({ evidenceBuild: false, ...options });
  return rig;
};

const clickSubmit: ModelScript = () => [{ op: "click", target: "#submit" }];

/** The stored number's reference, read from what the model was actually shown. */
const tokenOf = (request: ModelRequest, cls: string): string => {
  const references = contextOf(request).references as readonly { token: string; class: string }[];
  const found = references.find((r) => r.class === cls);
  if (!found) throw new Error(`test setup: no ${cls} reference was offered`);
  return found.token;
};
/** Restore the stored number into the empty field that takes it, then submit. */
const restoreThenSubmit: ModelScript = (request) => [
  { op: "insert", target: "#mobile_confirm", ref: tokenOf(request, "PHONE") },
  { op: "click", target: "#submit" },
];

const resultOf = (reply: { ok: boolean; result?: RunResultShape; refused?: string }): RunResultShape => {
  expect(reply.refused).toBeUndefined();
  expect(reply.ok).toBe(true);
  return reply.result!;
};
const turnsOf = (result: RunResultShape): readonly TurnShape[] => result.loop?.turns ?? [result.record];
const checksOf = (r: Rig, result: RunResultShape) =>
  domOnlyTaskChecks({
    perception: result.ports.perception,
    perceptionBoot: result.perceptionBoot,
    handoffs: turnsOf(result).map((t) => t.handoff),
    modelRequests: r.modelRequests.map((m) => m.raw),
  });
const verificationOf = (turn: TurnShape): string | undefined => turn.act?.verification?.verification;

/** A task a person starts in the side panel, as `host/sidepanel/main.ts` drives it. */
async function panelTask(
  r: Rig,
  options: {
    readonly control: string;
    readonly consent?: boolean;
    readonly maxTurns?: number;
    /** After the person read the page and before they pressed start. */
    readonly beforeStart?: () => void;
  }
): Promise<{ readonly result: RunResultShape | null; readonly task: { state: string; refused?: string }; readonly screens: readonly (ConsentScreen | null)[]; readonly rawQuestions: readonly unknown[] }> {
  const form = panelFormOf(await r.sendToOffscreen({ kind: "TASK_PREPARE", tabId: TAB_ID }, SENDERS.sidePanel));
  if (form === null) throw new Error("test setup: the panel could not read the form");
  const controlId = form.controls.find((c) => c.text.startsWith(options.control))?.controlId ?? null;
  const added = addExpectation(form, [], controlId, "TARGET_DISABLED", "");
  if (!added.ok) throw new Error(`test setup: ${added.reason}`);
  options.beforeStart?.();
  const started = (await r.sendToOffscreen({ kind: "TASK_START", answer: taskAnswer(form, "Submit the registration form", added.list), maxTurns: options.maxTurns ?? 1 }, SENDERS.sidePanel)) as { ok?: boolean; refused?: string };
  if (!started.ok) throw new Error(`test setup: TASK_START refused ${started.refused}`);

  const screens: (ConsentScreen | null)[] = [];
  const rawQuestions: unknown[] = [];
  for (;;) {
    const peek = (await r.sendToOffscreen({ kind: "CONSENT_PEEK" }, SENDERS.sidePanel)) as { pending?: unknown };
    if (peek.pending) {
      rawQuestions.push(peek.pending);
      screens.push(consentViewOf(peek.pending));
      if (options.consent === undefined) throw new Error("test setup: a consent was asked and the test did not expect one");
      await r.sendToOffscreen({ kind: "CONSENT_DECIDE", answer: consentAnswer(peek.pending, options.consent) }, SENDERS.sidePanel);
    }
    const status = (await r.sendToOffscreen({ kind: "TASK_STATUS" }, SENDERS.sidePanel)) as { task: { state: string; result?: RunResultShape; refused?: string } };
    if (status.task.state !== "RUNNING") return { result: status.task.result ?? null, task: status.task, screens, rawQuestions };
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("A — an ordinary product task captures no frame", () => {
  it("completes, confirmed by the page, with every capture, decode, model and worker counter at zero", async () => {
    const r = await boot({ model: clickSubmit });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.state).toBe("DONE");
    expect(verificationOf(result.record)).toBe("CONFIRMED");
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(r.messages).not.toContain("CAPTURE_FRAME");
    expect(failedChecks(checksOf(r, result))).toEqual([]);
  });

  it("does not depend on the absence of a grant: one held by the authority changes nothing", async () => {
    const r = await boot({ model: clickSubmit });
    r.holdGrant();
    expect(r.host.captureState().grants).toHaveLength(1); // the authority would say yes, if it were asked
    const result = resultOf(await r.run(taskRequest()));
    expect(verificationOf(result.record)).toBe("CONFIRMED");
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result))).toEqual([]);
  });

  it("is not provoked by a canvas or an image on the page", async () => {
    const r = await boot({ model: clickSubmit });
    expect(r.page.visualRegions()).toHaveLength(2);
    const result = resultOf(await r.run(taskRequest()));
    expect(result.ports.observations).toBeGreaterThanOrEqual(3); // read, refreshed, read back
    expect(result.ports.perception).toEqual([]);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("holds on every turn of a multi-turn task", async () => {
    const r = await boot({ model: (_request, turn) => (turn === 1 ? [{ op: "click", target: "#submit" }] : [{ op: "done" }]) });
    r.holdGrant();
    const result = resultOf(await r.run(taskRequest({ maxTurns: 3 })));
    expect(result.loop?.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(result.loop?.turns).toHaveLength(2);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result))).toEqual([]);
  });

  it("holds for the route a person actually uses: a task started in the side panel", async () => {
    const r = await boot({ model: (_request, turn) => (turn === 1 ? [{ op: "click", target: "#submit" }] : [{ op: "done" }]) });
    r.holdGrant();
    const { result } = await panelTask(r, { control: "Submit", maxTurns: 3 });
    expect(result?.loop?.outcome).toBe("COMPLETED_AS_DECLARED");
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result!))).toEqual([]);
  });

  it("holds when the model is down and the deterministic planner answers", async () => {
    const r = await boot({ model: () => "UNAVAILABLE" });
    const result = resultOf(await r.run(taskRequest(), { grant: false }));
    expect(result.record.reasonerKind).toBe("DETERMINISTIC_FALLBACK");
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });
});

describe("B — T1 is not loaded, run or fused in an ordinary product task", () => {
  it("asks for no T1 file, creates no session and runs no inference; the only fetch is the reasoner", async () => {
    const r = await boot({ model: clickSubmit });
    resultOf(await r.run(taskRequest()));
    const activity = r.visualActivity();
    expect(activity.t1Fetches).toBe(0);
    expect(activity.inferenceSessions).toBe(0);
    expect(activity.inferences).toBe(0);
    expect(activity.ortBootstraps).toBe(0);
    expect(new Set(r.fetched)).toEqual(new Set([REASONER_ENDPOINT]));
  });

  it("builds no perception realm, and nothing in the result claims one", async () => {
    const r = await boot({ model: clickSubmit });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.perceptionBoot).toBeNull();
    expect(result.ports.perception).toEqual([]);
  });

  it("declares the structural floor and no detector tier, in the handoff the task actually used", async () => {
    const r = await boot({ model: clickSubmit });
    const { handoff, handoffSerialized } = resultOf(await r.run(taskRequest())).record;
    expect(handoff?.capability).toEqual({ backend: "none", tiers_fired: ["T0", "T2"] });
    expect(handoff?.capture.scale_to_css).toBe(1);
    expect(new Set(handoff?.elements.map((e) => e.source))).toEqual(new Set(["dom"]));
    expect(handoffSerialized).not.toMatch(/"T1"|dom\+vision|"vision"/);
  });
});

describe("C — TR-01 is not invoked in an ordinary product task", () => {
  it("starts no worker, loads no weights, sends no frame, draws on no canvas", async () => {
    const r = await boot({ model: clickSubmit });
    r.holdGrant();
    resultOf(await r.run(taskRequest()));
    const activity = r.visualActivity();
    expect(activity.tr01Workers).toBe(0);
    expect(activity.tr01Inits).toBe(0);
    expect(activity.tr01Frames).toBe(0);
    expect(activity.canvases).toBe(0);
  });
});

describe("the negative controls: the same rig and the same checks DO fail when perception comes back", () => {
  it("a regression that rewires perception into a product task is caught, with no grant in sight", async () => {
    const r = await boot({ model: clickSubmit, reintroducePerceptionInProductTasks: true });
    const result = resultOf(await r.run(taskRequest()));
    // The task still finishes: a refused pass does not stop the reading. Which is why only these catch it.
    expect(verificationOf(result.record)).toBe("CONFIRMED");
    const activity = r.visualActivity();
    expect(activity.captureRequests).toBeGreaterThan(0);
    expect(activity.t1Fetches).toBe(1);
    expect(activity.inferenceSessions).toBe(1);
    expect(activity.getUserMedia).toBe(0);
    expect(r.visualActivity()).not.toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result))).toEqual(["noPerceptionPassRan", "noPerceptionRealmWasBuilt"]);
    expect(result.ports.perception.every((p) => !p.ran && p.refusal?.code === "NO_ACTIVE_TAB_GRANT")).toBe(true);
  });

  it("with a grant the same regression captures, runs T1 and TR-01, and claims the detector tier", async () => {
    const r = await boot({ model: clickSubmit, reintroducePerceptionInProductTasks: true });
    r.clickToolbar();
    const result = resultOf(await r.run(taskRequest()));
    const activity = r.visualActivity();
    expect(activity.getUserMedia).toBeGreaterThan(0);
    expect(activity.grabFrame).toBeGreaterThan(0);
    expect(activity.inferences).toBeGreaterThan(0);
    expect(activity.tr01Workers).toBe(1);
    expect(activity.tr01Frames).toBeGreaterThan(0);
    expect(result.record.handoff?.capability).toEqual({ backend: "wasm", tiers_fired: ["T0", "T1", "T2"] });
    const failed = failedChecks(checksOf(r, result));
    expect(failed).toContain("noPerceptionPassRan");
    expect(failed).toContain("backendDeclaresTheStructuralFloor");
    expect(failed).toContain("tiersDeclareTheStructuralFloor");
  });

  it("the old assertion could not have told: it passes on the very run the new checks fail", async () => {
    const r = await boot({ model: clickSubmit });
    const product = resultOf(await r.run(taskRequest()));
    // `perception.every(...)` over an empty array, the assertion M23.8 removed.
    expect(product.ports.perception.every(() => false)).toBe(true);
  });
});

describe("an evidence build keeps the perception pass in its tasks (the wiring, under the same fakes)", () => {
  it("with no grant: it still asks for a frame and loads T1, and the task goes on from the DOM", async () => {
    const r = await boot({ evidenceBuild: true, model: clickSubmit });
    const result = resultOf(await r.run(taskRequest()));
    expect(verificationOf(result.record)).toBe("CONFIRMED");
    expect(result.ports.perception.length).toBeGreaterThan(0);
    expect(result.ports.perception.every((p) => !p.ran && p.refusal?.code === "NO_ACTIVE_TAB_GRANT")).toBe(true);
    const activity = r.visualActivity();
    expect(activity.captureRequests).toBeGreaterThan(0);
    expect(activity.t1Fetches).toBe(1);
    expect(activity.getUserMedia).toBe(0);
    expect(result.record.handoff?.capability).toEqual({ backend: "none", tiers_fired: ["T0", "T2"] });
  });

  it("with a grant: it captures, runs T1 and TR-01 on every pass, and declares the visual tier truthfully", async () => {
    const r = await boot({ evidenceBuild: true, model: clickSubmit });
    r.clickToolbar();
    const result = resultOf(await r.run(taskRequest()));
    expect(result.ports.perception.every((p) => p.ran && p.detector.ran)).toBe(true);
    const activity = r.visualActivity();
    expect(activity.getUserMedia).toBe(result.ports.perception.length);
    expect(activity.inferences).toBe(result.ports.perception.length);
    expect(activity.tr01Frames).toBe(result.ports.perception.length);
    expect(result.record.handoff?.capability).toEqual({ backend: "wasm", tiers_fired: ["T0", "T1", "T2"] });
    // Pixels moved locally. The request to the model is still only the structural view.
    for (const request of r.modelRequests) expect(structuralRequestProblems(request.raw)).toEqual([]);
  });
});

describe("D — structural observation, on a real reading of a synthetic page", () => {
  it("the handoff holds every DOM element, with its role, name and enabled state", async () => {
    const r = await boot({ model: clickSubmit });
    const { handoff } = resultOf(await r.run(taskRequest())).record;
    expect(handoff?.elements.map((e) => [e.id, e.role, e.name, e.enabled])).toEqual([
      ["#name", "textbox", "Full name", true],
      ["#mobile", "textbox", "Mobile number", true],
      ["#mobile_confirm", "textbox", "Confirm mobile number", true],
      ["#submit", "button", "Submit", true],
      ["#cancel", "button", "Cancel", true],
      ["#archive", "button", "Archive", false],
      ["#help", "link", "Help", true],
    ]);
  });

  it("stored values became typed references, and no value is anywhere in the result", async () => {
    const r = await boot({ model: clickSubmit });
    const reply = await r.run(taskRequest());
    const { handoff } = resultOf(reply).record;
    expect(handoff?.redactions.map((x) => [x.targetId, x.class])).toEqual([
      ["#name", "NAME"],
      ["#mobile", "PHONE"],
    ]);
    for (const redaction of handoff?.redactions ?? []) expect(redaction.token).toMatch(/^<PII:[A-Z]+:\d+>$/);
    expect(JSON.stringify(reply)).not.toContain(CANARIES.phone);
    expect(JSON.stringify(reply)).not.toContain(CANARIES.name);
  });

  it("an empty page is an explicit non-result: no element, no model request, no click, no success", async () => {
    const r = await boot({ model: clickSubmit, page: { elements: [], inputs: [] } });
    const result = resultOf(await r.run(taskRequest()));
    expect(r.modelRequests).toEqual([]);
    expect(r.page.clicks).toBe(0);
    expect(verificationOf(result.record)).not.toBe("CONFIRMED");
    expect(result.record.refusal).not.toBeNull();
    const failed = failedChecks(checksOf(r, result));
    expect(failed).toContain("theFirstTurnObservedThePage");
    expect(failed).toContain("everyHandoffNamedDomElements");
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("a tab that cannot be read is a refused task, not an empty success", async () => {
    const r = await boot({ model: clickSubmit });
    const reply = await r.run(taskRequest({ tabId: TAB_ID + 1 }));
    expect(reply.ok).toBe(false);
    expect(reply.refused).toBeTruthy();
    expect(r.modelRequests).toEqual([]);
    expect(r.page.clicks).toBe(0);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });
});

describe("E — the reasoner boundary: sendVerified, and only structure crosses it", () => {
  it("sends the approved structural fields and nothing else, to the one endpoint, as JSON", async () => {
    const r = await boot({ model: clickSubmit });
    resultOf(await r.run(taskRequest()));
    expect(r.modelRequests).toHaveLength(1);
    const request = r.modelRequests[0]!;
    expect(request.url).toBe(REASONER_ENDPOINT);
    expect(request.method).toBe("POST");
    expect(request.contentType).toBe("application/json");
    expect(structuralRequestProblems(request.raw)).toEqual([]);
    const context = contextOf(request);
    expect(Object.keys(context).sort()).toEqual(["buttons", "fields", "goal", "references"]);
    expect(context.goal).toBe("Submit the registration form");
    expect(context.fields).toEqual([
      { id: "#name", name: "Full name", empty: false },
      { id: "#mobile", name: "Mobile number", empty: false },
      { id: "#mobile_confirm", name: "Confirm mobile number", empty: true },
    ]);
    expect(context.buttons).toEqual([
      { id: "#submit", name: "Submit", enabled: true },
      { id: "#cancel", name: "Cancel", enabled: true },
      { id: "#archive", name: "Archive", enabled: false },
    ]);
  });

  it("carries no frame, no value and no perception metadata", async () => {
    const r = await boot({ model: restoreThenSubmit });
    resultOf(await r.run(taskRequest(), { grant: true }));
    const { raw } = r.modelRequests[0]!;
    for (const absent of [CANARIES.phone, CANARIES.name, "data:image", "image_url", "scale_to_css", "tiers_fired", "capability", "bbox", "dom+vision", "UNREAD_REGION"]) {
      expect(raw, absent).not.toContain(absent);
    }
    // Every message is text. A multipart message is how an image would travel.
    for (const message of r.modelRequests[0]!.body.messages) expect(typeof message.content).toBe("string");
  });

  it("constrains the model to what exists: visible enabled controls, and privacy's one pairing", async () => {
    const r = await boot({ model: clickSubmit });
    resultOf(await r.run(taskRequest()));
    const request = r.modelRequests[0]!;
    const schema = request.body.response_format?.json_schema?.schema as { properties: { steps: { items: { oneOf: readonly { properties: Record<string, { const?: string; enum?: readonly string[] }> }[] } } } };
    const options = schema.properties.steps.items.oneOf;
    const clicks = options.find((o) => o.properties.op?.const === "click");
    const inserts = options.filter((o) => o.properties.op?.const === "insert");
    expect(clicks?.properties.target?.enum).toEqual(["#submit", "#cancel", "#help"]);
    expect(inserts.map((o) => [o.properties.target?.enum, o.properties.ref?.enum])).toEqual([[["#mobile_confirm"], [tokenOf(request, "PHONE")]]]);
    expect(options.map((o) => o.properties.op?.const).sort()).toEqual(["click", "done", "insert"]);
  });

  it("refuses a destination off this machine before any byte moves", async () => {
    const r = await boot({ model: clickSubmit });
    const result = resultOf(await r.run(taskRequest({ endpoint: "https://example.com/v1/chat/completions" }), { grant: false }));
    expect(r.fetched).toEqual([]);
    expect(result.egress.some((e) => e.refusal?.cause === "DESTINATION_NOT_LOOPBACK")).toBe(true);
  });

  it("a stored value in the goal stops the task at SANITIZE, and nothing is sent or clicked", async () => {
    const r = await boot({ model: clickSubmit });
    const result = resultOf(await r.run(taskRequest({ goal: `Register ${CANARIES.phone} on this form` }), { grant: false }));
    expect(result.record.refusal).toMatchObject({ stage: "SANITIZE", cause: "VERIFY_VAULT_VALUE_IN_HANDOFF" });
    expect(result.record.handoff).toBeNull();
    expect(result.record.handoffSerialized).toBeNull();
    expect(r.fetched).toEqual([]);
    expect(r.page.clicks).toBe(0);
  });
});

describe("F — DOM grounding and the action set", () => {
  /** Plans the validator or the parser rejects. None of these may ever reach the page. */
  const REJECTED: readonly (readonly [string, readonly unknown[], string])[] = [
    ["a target the page does not have", [{ op: "click", target: "#not-on-this-page" }], "#not-on-this-page"],
    ["a disabled control", [{ op: "click", target: "#archive" }], "#archive"],
    ["a second click in one plan", [{ op: "click", target: "#cancel" }, { op: "click", target: "#help" }], "#cancel"],
    ["a TYPE action", [{ op: "type", target: "#cancel", text: "x" }], "#cancel"],
    ["a NAVIGATE action", [{ op: "navigate", target: "#cancel", url: "https://example.com" }], "#cancel"],
    ["a SCROLL action", [{ op: "scroll", target: "#cancel" }], "#cancel"],
    ["a SUBMIT action", [{ op: "submit", target: "#cancel" }], "#cancel"],
    ["a KEYPRESS action", [{ op: "keypress", target: "#cancel", key: "Enter" }], "#cancel"],
  ];

  /** Nothing here for the deterministic planner, so a rejected plan has no replacement. */
  const controlsOnly = (): PageSpec => ({
    elements: [
      { selector: "#note", role: "textbox", name: "Note", box: { x: 100, y: 100, w: 300, h: 40 }, enabled: true },
      control("submit", "Submit", 0, (_document, element) => {
        element.enabled = false;
      }),
      control("cancel", "Cancel", 1),
      { ...control("archive", "Archive", 2), enabled: false },
      control("help", "Help", 3, undefined, "link"),
    ],
    inputs: [{ id: "note", value: "", type: "text", label: "Note" }],
  });

  for (const [what, steps, target] of REJECTED) {
    it(`${what}: refused, and with nothing else to do nothing is clicked`, async () => {
      const r = await boot({ page: controlsOnly(), model: () => steps as ModelReply });
      const result = resultOf(await r.run(taskRequest()));
      expect(result.record.refusal).not.toBeNull();
      expect(r.page.clicks).toBe(0);
      expect(r.page.clicksOn(target)).toBe(0);
      expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    });

    it(`${what}: never executed even when the fallback planner has a plan of its own`, async () => {
      const r = await boot({ model: () => steps as ModelReply });
      const result = resultOf(await r.run(taskRequest(), { grant: true }));
      // Recorded policy (`packages/reasoner/src/fallback.ts`): a plan that is merely unusable may be
      // replaced by the deterministic planner, whose plan then passes every gate on its own.
      expect(result.record.reasonerKind).toBe("DETERMINISTIC_FALLBACK");
      expect(result.record.fallback).toMatchObject({ fellBack: true });
      expect(r.page.clicksOn(target)).toBe(0);
      expect(result.grant.asked).toBe(true);
    });
  }

  it("an off-screen control is reported, is not offered to the model, and is not clicked", async () => {
    const page = controlsOnly();
    const later = {
      ...control("later", "Later", 0, (_document, element) => {
        element.enabled = false;
      }),
      box: { x: 500, y: 2000, w: 120, h: 40 },
    };
    const r = await boot({ page: { ...page, elements: [...page.elements, later] }, model: () => [{ op: "click", target: "#later" }] });
    const result = resultOf(await r.run(taskRequest({ postconditions: { "#later": { kind: "TARGET_ENABLED", expected: false } } })));
    expect(result.record.handoff?.elements.find((e) => e.id === "#later")).toMatchObject({ visible: false, offscreen: true });
    const schema = r.modelRequests[0]!.body.response_format?.json_schema?.schema as { properties: { steps: { items: { oneOf: readonly { properties: Record<string, { const?: string; enum?: readonly string[] }> }[] } } } };
    expect(schema.properties.steps.items.oneOf.find((o) => o.properties.op?.const === "click")?.properties.target?.enum).not.toContain("#later");
    expect(result.record.refusal).not.toBeNull();
    expect(r.page.clicks).toBe(0);
    expect(r.page.clicksOn("#later")).toBe(0);
  });

  it("a click on a text field has no declared result, so it is not made", async () => {
    const r = await boot({ page: controlsOnly(), model: () => [{ op: "click", target: "#note" }] });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "NO_DECLARED_POSTCONDITION" });
    expect(r.page.clicks).toBe(0);
  });

  it("a control the task declared no result for is not clicked: a click it could not verify is not made", async () => {
    const r = await boot({ model: () => [{ op: "click", target: "#cancel" }] });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "VALIDATE_PLAN", cause: "NO_DECLARED_POSTCONDITION" });
    expect(r.page.clicks).toBe(0);
  });

  /** Evidence of something wrong, not of a weak model: no second planner may hide it behind a success. */
  const hostile = async (model: ModelScript): Promise<{ reply: unknown; record: TurnShape; r: Rig }> => {
    const r = await boot({ model });
    const reply = await r.run(taskRequest(), { grant: true });
    const record = resultOf(reply).record;
    expect(record.refusal, "a caught event must stay visible").not.toBeNull();
    expect(record.fallback).toMatchObject({ outcome: "HOSTILE", fellBack: false });
    expect(r.page.clicks).toBe(0);
    expect(r.inputs.get("#mobile_confirm")?.value).toBe("");
    return { reply, record, r };
  };

  it("a reference the vault never issued is refused, with no fallback", async () => {
    await hostile(() => [{ op: "insert", target: "#mobile_confirm", ref: "<PII:PHONE:99>" }, { op: "click", target: "#submit" }]);
  });

  it("a real reference in a field privacy did not pair it with is refused, with no fallback", async () => {
    await hostile((request) => [{ op: "insert", target: "#mobile_confirm", ref: tokenOf(request, "NAME") }, { op: "click", target: "#submit" }]);
  });

  it("a stored value written out as a literal is refused, with no fallback, and stays out of the record", async () => {
    const { reply } = await hostile(() => [{ op: "insert", target: "#mobile_confirm", literal: CANARIES.phone }, { op: "click", target: "#submit" }]);
    expect(JSON.stringify(reply)).not.toContain(CANARIES.phone);
  });

  it("free text from the model is never acted on: the only plan left still has to win a person's grant", async () => {
    const r = await boot({ model: () => ({ rawBody: JSON.stringify({ choices: [{ message: { content: "click the submit button please" } }] }) }) });
    const result = resultOf(await r.run(taskRequest(), { grant: false }));
    expect(result.record.reasonerKind).toBe("DETERMINISTIC_FALLBACK");
    expect(result.record.refusal?.stage).toBe("AWAIT_GRANT");
    expect(r.page.clicks).toBe(0);
  });
});

describe("G — an ambiguous reference is withheld until a person decides", () => {
  const twoNumbers = (): PageSpec => ({
    elements: [
      { selector: "#mobile", role: "textbox", name: "Mobile number", box: { x: 100, y: 100, w: 300, h: 40 }, enabled: true },
      { selector: "#alternate", role: "textbox", name: "Alternate mobile number", box: { x: 100, y: 160, w: 300, h: 40 }, enabled: true },
      { selector: "#mobile_confirm", role: "textbox", name: "Confirm mobile number", box: { x: 100, y: 220, w: 300, h: 40 }, enabled: true },
      control("submit", "Submit", 0, (_document, element) => {
        element.enabled = false;
      }),
    ],
    inputs: [
      { id: "mobile", value: CANARIES.phone, type: "tel", label: "Mobile number", autocomplete: "tel" },
      { id: "alternate", value: CANARIES.otherPhone, type: "tel", label: "Alternate mobile number", autocomplete: "tel" },
      { id: "mobile_confirm", value: "", type: "tel", label: "Confirm mobile number", autocomplete: "tel" },
    ],
  });

  it("asks before anything is sent or planned, and a declined question stops the run with nothing done", async () => {
    const r = await boot({ page: twoNumbers(), model: clickSubmit });
    const running = r.run(taskRequest());
    let question: unknown = null;
    while (question === null) {
      const peek = (await r.sendToOffscreen({ kind: "CLARIFY_PEEK" }, SENDERS.sidePanel)) as { pending?: unknown };
      question = peek.pending ?? null;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(r.modelRequests).toEqual([]); // the person is asked first
    expect(JSON.stringify(question)).not.toContain(CANARIES.phone);
    expect(JSON.stringify(question)).not.toContain(CANARIES.otherPhone);
    await r.sendToOffscreen({ kind: "CLARIFY_DECIDE", answer: panelAnswer(question, null) }, SENDERS.sidePanel);

    const result = resultOf(await running);
    expect(result.record.refusal?.stage).toBe("AWAIT_CLARIFICATION");
    expect(result.record.fill?.withheld.map((w) => [w.target, w.cause])).toEqual([["#mobile_confirm", "CONFLICTING_REFERENCES"]]);
    expect(r.modelRequests).toEqual([]);
    expect(r.page.clicks).toBe(0);
    expect(r.inputs.get("#mobile_confirm")?.value).toBe("");
  });

  it("a page script is not the person: only an extension page may read or answer the question", async () => {
    const r = await boot({ page: twoNumbers(), model: clickSubmit });
    const running = r.run(taskRequest());
    let question: unknown = null;
    while (question === null) {
      const peek = (await r.sendToOffscreen({ kind: "CLARIFY_PEEK" }, SENDERS.sidePanel)) as { pending?: unknown };
      question = peek.pending ?? null;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(await r.sendToOffscreen({ kind: "CLARIFY_PEEK" }, SENDERS.contentScript)).toEqual({ refused: "NOT_FROM_AN_EXTENSION_PAGE" });
    expect(await r.sendToOffscreen({ kind: "CLARIFY_DECIDE", answer: panelAnswer(question, null) }, SENDERS.contentScript)).toEqual({ refused: "NOT_FROM_AN_EXTENSION_PAGE" });
    await r.sendToOffscreen({ kind: "CLARIFY_DECIDE", answer: panelAnswer(question, null) }, SENDERS.sidePanel);
    resultOf(await running);
  });
});

describe("H — freshness and the hit test, end to end", () => {
  it("a page with no structural observer gets no click: unestablished staleness is not freshness", async () => {
    const r = await boot({ model: clickSubmit, page: { ...registrationPage(), structurallyObserved: false } });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "ACT", cause: "OBSERVATION_STALE" });
    expect(r.page.clicks).toBe(0);
  });

  it("a page that moves after REFRESH gets no click", async () => {
    const r = await boot({
      model: (_request, _turn, page) => {
        page.afterNextMeasure = () => page.structureChanged();
        return [{ op: "click", target: "#submit" }];
      },
    });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "ACT", cause: "OBSERVATION_STALE" });
    expect(r.page.clicks).toBe(0);
  });

  it("a target removed while the model was planning gets no click", async () => {
    const r = await boot({
      model: (_request, _turn, page) => {
        page.elements = page.elements.filter((e) => e.selector !== "#submit");
        page.structureChanged();
        return [{ op: "click", target: "#submit" }];
      },
    });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "ACT", cause: "TARGET_ABSENT_AFTER_REFRESH" });
    expect(r.page.clicks).toBe(0);
  });

  it("a control the person declared, renamed while the model was planning, gets no click", async () => {
    const r = await boot({
      model: (_request, _turn, page) => {
        page.find("#submit")!.name = "Pay now";
        page.structureChanged();
        return [{ op: "click", target: "#submit" }];
      },
    });
    const { result } = await panelTask(r, { control: "Submit" });
    expect(result?.loop?.turns[0]?.refusal).toMatchObject({ stage: "ACT", cause: "DECLARATION_STALE" });
    expect(r.page.clicks).toBe(0);
  });

  it("an overlay that arrives while the model was planning takes no click and gives none to the target", async () => {
    const r = await boot({
      model: (_request, _turn, page) => {
        const under = page.find("#submit")!;
        page.elements.push({ selector: "#overlay", role: "button", name: "Claim prize", box: { ...under.box }, enabled: true });
        page.structureChanged();
        return [{ op: "click", target: "#submit" }];
      },
    });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).toMatchObject({ stage: "ACT", cause: "DIFFERENT_ELEMENT" });
    expect(r.page.clicks).toBe(0);
  });
});

describe("I — result verification and the five-turn cap", () => {
  it("a click that changes nothing is NOT_CONFIRMED, once, and stops the task", async () => {
    const page = registrationPage();
    const inert: PageSpec = { ...page, elements: page.elements.map((e) => (e.selector === "#submit" ? control("submit", "Submit", 0) : e)) };
    const r = await boot({ page: inert, model: clickSubmit });
    const result = resultOf(await r.run(taskRequest({ maxTurns: 3 })));
    expect(result.loop?.outcome).toBe("STOPPED_UNVERIFIED");
    expect(verificationOf(result.loop!.turns[0]!)).toBe("NOT_CONFIRMED");
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.modelRequests).toHaveLength(1);
  });

  it("a result already true before the click refuses the click: confirming it would prove nothing", async () => {
    const page = registrationPage();
    const already: PageSpec = { ...page, elements: page.elements.map((e) => (e.selector === "#submit" ? { ...e, enabled: false } : e)) };
    const r = await boot({ page: already, model: clickSubmit });
    const result = resultOf(await r.run(taskRequest()));
    expect(result.record.refusal).not.toBeNull();
    expect(r.page.clicks).toBe(0);
  });

  const sixSteps = (): PageSpec => ({
    elements: [1, 2, 3, 4, 5, 6].map((n) =>
      control(`step${n}`, `Step ${n}`, n - 1, (_document, element) => {
        element.enabled = false;
      })
    ),
    inputs: [],
  });
  const sixPostconditions = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`#step${n}`, { kind: "TARGET_ENABLED", expected: false }]));

  it("stops at five turns with a sixth control still waiting, each turn gated on its own", async () => {
    const r = await boot({ page: sixSteps(), model: (_request, turn) => [{ op: "click", target: `#step${turn}` }] });
    const result = resultOf(await r.run(taskRequest({ maxTurns: 5, postconditions: sixPostconditions })));
    expect(result.loop?.outcome).toBe("STOPPED_TURN_BUDGET");
    expect(result.loop?.confirmedActions).toBe(5);
    expect(result.loop?.turns).toHaveLength(5);
    expect(r.modelRequests).toHaveLength(5);
    expect(r.page.clicks).toBe(5);
    expect(r.page.clicksOn("#step6")).toBe(0);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result))).toEqual([]);
  });

  it("refuses a sixth turn outright, and a budget that is not a whole number from one to five", async () => {
    for (const maxTurns of [6, 0, 1.5, "5"]) {
      const r = await boot({ page: sixSteps(), model: (_request, turn) => [{ op: "click", target: `#step${turn}` }] });
      const reply = await r.run(taskRequest({ maxTurns, postconditions: sixPostconditions }));
      expect(reply.ok, String(maxTurns)).toBe(false);
      expect(reply.refused, String(maxTurns)).toMatch(/TurnBudgetError/);
      expect(r.modelRequests).toEqual([]);
      expect(r.page.clicks).toBe(0);
      r.dispose();
    }
    rig = null;
  });
});

describe("J — consent and human approval for a stored value", () => {
  it("control-plane task: a value is restored only after a person grants it, then the click, then the check", async () => {
    const r = await boot({ model: restoreThenSubmit });
    const result = resultOf(await r.run(taskRequest(), { grant: true }));
    expect(result.grant).toEqual({ asked: true, granted: true });
    expect(r.inputs.get("#mobile_confirm")?.value).toBe(CANARIES.phone);
    expect(result.record.rehydrated?.map((x) => x.target)).toEqual(["#mobile_confirm"]);
    expect(verificationOf(result.record)).toBe("CONFIRMED");
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
    expect(failedChecks(checksOf(r, result))).toEqual([]);
  });

  it("control-plane task: a refused grant restores nothing and clicks nothing", async () => {
    const r = await boot({ model: restoreThenSubmit });
    const result = resultOf(await r.run(taskRequest(), { grant: false }));
    expect(result.grant).toEqual({ asked: true, granted: false });
    expect(result.record.refusal?.stage).toBe("AWAIT_GRANT");
    expect(r.inputs.get("#mobile_confirm")?.value).toBe("");
    expect(r.page.clicks).toBe(0);
  });

  it("a page's own content script cannot answer the grant for itself", async () => {
    const r = await boot({ model: restoreThenSubmit });
    const running = r.run(taskRequest());
    let pending: unknown = null;
    while (!pending) {
      pending = ((await r.host.grantPeek()) as { pending?: unknown }).pending ?? null;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(await r.sendToOffscreen({ kind: "GRANT_DECIDE", granted: true }, SENDERS.contentScript)).toEqual({ refused: "DECISION_NOT_FROM_A_PAGE" });
    expect(r.inputs.get("#mobile_confirm")?.value).toBe("");
    await r.host.grantDecide(false);
    resultOf(await running);
    expect(r.page.clicks).toBe(0);
  });

  it("panel task: Allow once restores the value, after a screen showing only a masked preview", async () => {
    const r = await boot({ model: (request, turn) => (turn === 1 ? restoreThenSubmit(request, turn, r0()) : [{ op: "done" }]) });
    const { result, screens, rawQuestions } = await panelTask(r, { control: "Submit", consent: true, maxTurns: 3 });
    expect(screens).toHaveLength(1);
    expect(screens[0]?.site).toBe(PAGE_ORIGIN);
    expect(screens[0]?.field).toBe("Confirm mobile number");
    expect(JSON.stringify(screens)).not.toContain(CANARIES.phone);
    expect(JSON.stringify(rawQuestions)).not.toContain(CANARIES.phone);
    expect(result?.loop?.turns[0]?.consents.map((c) => c.outcome)).toEqual(["ALLOWED_ONCE"]);
    expect(result?.grant.asked).toBe(false); // the panel asked; the control plane was not
    expect(r.inputs.get("#mobile_confirm")?.value).toBe(CANARIES.phone);
    expect(r.page.clicksOn("#submit")).toBe(1);
    expect(r.visualActivity()).toEqual(NO_VISUAL_ACTIVITY);
  });

  it("panel task: Deny restores nothing and clicks nothing", async () => {
    const r = await boot({ model: (request, turn) => restoreThenSubmit(request, turn, r0()) });
    const { result } = await panelTask(r, { control: "Submit", consent: false });
    const first = result?.loop?.turns[0];
    expect(first?.consents.map((c) => c.outcome)).toEqual(["CONSENT_DENIED"]);
    expect(first?.refusal?.stage).toBe("AWAIT_GRANT");
    expect(r.inputs.get("#mobile_confirm")?.value).toBe("");
    expect(r.page.clicks).toBe(0);
  });

  it("only the side panel may read or answer a consent: not the worker's control plane, not a page", async () => {
    const r = await boot({ model: (request, turn) => restoreThenSubmit(request, turn, r0()) });
    for (const sender of [SENDERS.worker, SENDERS.contentScript]) {
      expect(await r.sendToOffscreen({ kind: "CONSENT_PEEK" }, sender)).toEqual({ refused: "NOT_FROM_THE_SIDE_PANEL" });
      expect(await r.sendToOffscreen({ kind: "CONSENT_DECIDE", answer: {} }, sender)).toEqual({ refused: "NOT_FROM_THE_SIDE_PANEL" });
    }
  });
});

/** The rig's page, for a script that does not use it. */
const r0 = (): Rig["page"] => rig!.page;

describe("K — a vision-only detection cannot create an element in the handoff", () => {
  /**
   * The realm's join and the privacy layer's assembly, with a synthetic detection. Not a real model
   * output: the question is what the join does with a box the DOM has nothing under, and T1 stays out
   * of the product either way. This is the guard for any build in which fusion runs at all.
   */
  it("a box with no DOM element under it stays out, and a box on one only relabels it", () => {
    const geometry: CaptureGeometry = { dpr: 1, zoom: 1, viewportCss: { w: 1024, h: 768 }, captureSize: { w: 1024, h: 768 }, scroll: { x: 0, y: 0 }, origin: PAGE_ORIGIN };
    const frame = frameId("vision-only");
    const measurements: DomMeasurement[] = [
      { selector: "#submit", role: "button", name: "Submit", rect: { x: 500, y: 100, w: 120, h: 40 }, enabled: true, cssHidden: false, parentIndex: -1 },
      { selector: "#cancel", role: "button", name: "Cancel", rect: { x: 500, y: 160, w: 120, h: 40 }, enabled: true, cssHidden: false, parentIndex: -1 },
    ];
    const graph = buildElementGraph(measurements, geometry, frame);
    const detection = (x: number, y: number, w: number, h: number): VisualDetection => ({ box: cssBox(x, y, w, h), label: "button", score: 0.9, role: "UIElementDetector", frameId: frame, modelId: "synthetic", revision: "synthetic" });

    const fusion = fuse(graph, [detection(500, 100, 120, 40), detection(800, 600, 80, 40)], true, geometry);
    expect(fusion.visionOnlyCount).toBe(1);
    expect(fusion.elements.map((e) => e.provenance.source).sort()).toEqual(["dom", "dom+vision", "vision"]);

    // Exactly the join `perception-realm.ts` does, which the next test pins.
    const sourceById: Record<string, "dom" | "vision" | "dom+vision"> = {};
    for (const element of fusion.elements) {
      const node = graph.byId.get(element.id);
      if (node) sourceById[node.domRef.selector] = projectElement(element).source;
    }

    const viewport = { w: 1024, h: 768, dpr: 1, zoom: 1, scrollX: 0, scrollY: 0 };
    const vault = createVault({ sessionId: "s", origin: PAGE_ORIGIN, now: () => 1 });
    const classified = classifyObservation(graph, { sessionId: "s", requestId: "r", origin: PAGE_ORIGIN, viewport, now: 1, vault }, { fields: [] });
    if (!classified.ok) throw new Error("test setup: classification refused");

    const draft = buildHandoffDraft({ redactions: classified.redactions, elements: classified.elements }, "goal", { sessionId: "s", requestId: "r", origin: PAGE_ORIGIN, viewport, now: 1, sourceById });
    expect(draft.elements.map((e) => [e.id, e.source])).toEqual([
      ["#submit", "dom+vision"],
      ["#cancel", "dom"],
    ]);
  });
});
