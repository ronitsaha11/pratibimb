/**
 * VERIFY RESULT — unit tests.
 *
 * The claim being defended is one sentence: **a dispatch is not a result.** So the suite spends
 * most of its effort on the ways a successful-looking `EXECUTED` must NOT become `CONFIRMED` —
 * an unknown dispatch, a stale observation, a vanished target, a focus that moved somewhere else
 * — and only a little on the happy path, which is the easy half.
 *
 * There is no "something changed" assertion anywhere, because there is no such check to assert.
 */
import { describe, expect, it } from "vitest";
import {
  verifyActionResult,
  wasConfirmed,
  actedNodeId,
  type ActResult,
  type ExpectedPostcondition,
  type PostActionObservation,
  type VerificationRequest,
} from "@pratibimb/agent";
import {
  buildElementGraph,
  frameId,
  nodeId,
  type CaptureGeometry,
  type DomMeasurement,
  type ElementGraph,
  type ElementNode,
  type FrameId,
} from "@pratibimb/perception";

const BEFORE = frameId("verify-frame-1");
const AFTER = frameId("verify-frame-2");

const geometry: CaptureGeometry = {
  dpr: 1,
  zoom: 1,
  viewportCss: { w: 1024, h: 768 },
  captureSize: { w: 1024, h: 768 },
  scroll: { x: 0, y: 0 },
  origin: "http://127.0.0.1:8983",
};

const measurements = (): DomMeasurement[] => [
  { selector: "#phone-label", role: "label", name: "Phone", rect: { x: 400, y: 220, w: 300, h: 20 }, cssHidden: false, enabled: true, parentIndex: -1 },
  { selector: "#phone", role: "textbox", name: "Phone", rect: { x: 400, y: 260, w: 300, h: 32 }, cssHidden: false, enabled: true, parentIndex: -1 },
  { selector: "#cancel", role: "button", name: "Cancel", rect: { x: 620, y: 360, w: 120, h: 40 }, cssHidden: false, enabled: true, parentIndex: -1 },
];

const graph = (over: Partial<DomMeasurement>[] = [], frame: FrameId = BEFORE, drop: string[] = []): ElementGraph =>
  buildElementGraph(
    measurements()
      .map((m, i) => ({ ...m, ...(over[i] ?? {}) }))
      .filter((m) => !drop.includes(m.selector)),
    geometry,
    frame
  );

const nodeFor = (g: ElementGraph, selector: string): ElementNode => {
  const n = g.nodes.find((x) => x.domRef.selector === selector);
  if (!n) throw new Error(`test setup: ${selector} absent`);
  return n;
};

/** An `EXECUTED` result for a node. The point and box are irrelevant to verification: the
 *  postcondition is read from the page, not from what ACT recorded about where it clicked. */
const executed = (n: ElementNode): ActResult =>
  ({
    status: "EXECUTED",
    kind: "click",
    target: { nodeId: n.id, role: n.role, name: n.name, point: { x: 0, y: 0 }, box: { x: 0, y: 0, w: 1, h: 1 } },
    dispatchMs: 1,
  }) as unknown as ActResult;

const verify = (over: Partial<VerificationRequest>): ReturnType<typeof verifyActionResult> => {
  const before = graph();
  const acted = nodeFor(before, "#phone");
  const base: VerificationRequest = {
    result: executed(acted),
    acted,
    actedFrameId: BEFORE,
    expected: { kind: "FOCUS_ON_TARGET" },
    observation: { graph: graph([], AFTER), focusedSelector: "#phone" },
  };
  return verifyActionResult({ ...base, ...over });
};

describe("VERIFY RESULT — 7: the expected postcondition is present", () => {
  it("focus on the clicked element is CONFIRMED, and the page's own answer is the evidence", () => {
    const v = verify({});
    expect(v.verification).toBe("CONFIRMED");
    expect(wasConfirmed(v)).toBe(true);
    if (v.verification === "CONFIRMED") expect(v.evidence).toContain("#phone");
  });

  it("an expected enabled state that holds is CONFIRMED", () => {
    const before = graph();
    const acted = nodeFor(before, "#cancel");
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "TARGET_ENABLED", expected: false },
      observation: { graph: graph([{}, {}, { enabled: false }], AFTER) },
    });
    expect(v.verification).toBe("CONFIRMED");
  });

  it("an expected accessible name that holds is CONFIRMED", () => {
    const before = graph();
    const acted = nodeFor(before, "#cancel");
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "TARGET_NAME", expected: "Cancelling…" },
      observation: { graph: graph([{}, {}, { name: "Cancelling…" }], AFTER) },
    });
    expect(v.verification).toBe("CONFIRMED");
  });
});

describe("VERIFY RESULT — 8: the expected postcondition is absent", () => {
  it("focus that landed on a different element is NOT_CONFIRMED, and names where it went", () => {
    // The real case this models: clicking a <label for=…> focuses the INPUT, not the label. The
    // click was dispatched and had an effect — just not the one that was asked for.
    const before = graph();
    const acted = nodeFor(before, "#phone-label");
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "FOCUS_ON_TARGET" },
      observation: { graph: graph([], AFTER), focusedSelector: "#phone" },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") {
      expect(v.cause).toBe("FOCUS_ELSEWHERE");
      expect(v.detail).toContain("#phone-label");
    }
    expect(wasConfirmed(v)).toBe(false);
  });

  it("nothing focused at all is NOT_CONFIRMED", () => {
    const v = verify({ observation: { graph: graph([], AFTER), focusedSelector: null } });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("FOCUS_ABSENT");
  });

  it("a state that did not change is NOT_CONFIRMED", () => {
    const before = graph();
    const acted = nodeFor(before, "#cancel");
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "TARGET_ENABLED", expected: false },
      observation: { graph: graph([], AFTER) },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("STATE_DIFFERS");
  });

  it("an action ACT refused is NOT_CONFIRMED — nothing was dispatched", () => {
    const v = verify({
      result: { status: "REJECTED", cause: "HUMAN_CONFIRMATION_REQUIRED", detail: "tier", kind: "click" },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("ACTION_NOT_DISPATCHED");
  });

  it("an action this executor does not perform is NOT_CONFIRMED", () => {
    const v = verify({
      result: { status: "UNSUPPORTED_ACTION", kind: "type", cause: "CLEARANCE_PIPELINE_ABSENT", detail: "no vault" },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("ACTION_NOT_DISPATCHED");
  });
});

describe("VERIFY RESULT — 9: insufficient evidence is UNKNOWN", () => {
  it("an observation that does not report focus is UNKNOWN, never 'nothing is focused'", () => {
    const v = verify({ observation: { graph: graph([], AFTER) } });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("FOCUS_NOT_OBSERVED");
    expect(wasConfirmed(v)).toBe(false);
  });

  it("re-reading the SAME frame is UNKNOWN — it cannot show what the action changed", () => {
    // The trap: the pre-action graph already satisfies the postcondition, so verifying against it
    // would "confirm" an action that never happened.
    const v = verify({ observation: { graph: graph([], BEFORE), focusedSelector: "#phone" } });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("OBSERVATION_STALE");
  });

  it("a target that is no longer there is UNKNOWN, not a failure", () => {
    const v = verify({
      observation: { graph: graph([], AFTER, ["#phone"]), focusedSelector: null },
    });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("TARGET_ABSENT_AFTER_ACTION");
  });

  it("a target whose stable reference now matches several elements is UNKNOWN", () => {
    const twice = buildElementGraph(
      [
        { selector: "#phone", role: "textbox", name: "Phone", rect: { x: 400, y: 260, w: 300, h: 32 }, cssHidden: false, enabled: true, parentIndex: -1 },
        { selector: "#phone", role: "textbox", name: "Phone", rect: { x: 400, y: 300, w: 300, h: 32 }, cssHidden: false, enabled: true, parentIndex: -1 },
      ],
      geometry,
      AFTER
    );
    const v = verify({ observation: { graph: twice, focusedSelector: "#phone" } });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("TARGET_AMBIGUOUS");
  });

  it("a target whose role changed is UNKNOWN — it may not be the same control", () => {
    const v = verify({ observation: { graph: graph([{}, { role: "button" }], AFTER), focusedSelector: "#phone" } });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("TARGET_IDENTITY_CHANGED");
  });

  it("a node with no stable reference cannot be re-identified, so it is UNKNOWN", () => {
    const anon = buildElementGraph(
      [{ selector: "", role: "textbox", name: "Phone", rect: { x: 400, y: 260, w: 300, h: 32 }, cssHidden: false, enabled: true, parentIndex: -1 }],
      geometry,
      BEFORE
    );
    const acted = anon.nodes[0] as ElementNode;
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "FOCUS_ON_TARGET" },
      observation: { graph: graph([], AFTER), focusedSelector: "#phone" },
    });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("NO_STABLE_REFERENCE");
  });

  it("a result about a different node than the one asked about is UNKNOWN", () => {
    const before = graph();
    const v = verify({ result: executed(nodeFor(before, "#cancel")) });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("MALFORMED_REQUEST");
  });
});

describe("VERIFY RESULT — 10: a timeout is UNKNOWN and stays UNKNOWN", () => {
  it("BRIDGE_TIMEOUT is UNKNOWN even when the page looks exactly as hoped", () => {
    // The page says focus is on the target. The dispatch outcome is still unknown, and a page
    // that happens to look right does not establish that THIS action made it so.
    const v = verify({
      result: { status: "EXECUTION_ERROR", kind: "click", category: "BRIDGE_TIMEOUT", errorName: "DispatchTimeout", dispatchMs: 5000 },
      observation: { graph: graph([], AFTER), focusedSelector: "#phone" },
    });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("DISPATCH_OUTCOME_UNKNOWN");
    expect(wasConfirmed(v)).toBe(false);
  });

  it("a bridge that threw is also UNKNOWN — it may have thrown after dispatching", () => {
    const v = verify({
      result: { status: "EXECUTION_ERROR", kind: "click", category: "BRIDGE_THREW", errorName: "TypeError", dispatchMs: 3 },
    });
    expect(v.verification).toBe("UNKNOWN");
    if (v.verification === "UNKNOWN") expect(v.cause).toBe("DISPATCH_OUTCOME_UNKNOWN");
  });

  it("nothing in this module retries anything", () => {
    let observations = 0;
    const obs = (): PostActionObservation => {
      observations += 1;
      return { graph: graph([], AFTER), focusedSelector: null };
    };
    verify({ observation: obs() });
    expect(observations).toBe(1);
  });
});

describe("VERIFY RESULT — 11: the wrong target's state is never a confirmation", () => {
  it("the sibling changing state does not confirm an action on the target", () => {
    const before = graph();
    const acted = nodeFor(before, "#cancel");
    const v = verifyActionResult({
      result: executed(acted),
      acted,
      actedFrameId: BEFORE,
      expected: { kind: "TARGET_ENABLED", expected: false },
      // #phone became disabled; #cancel did not.
      observation: { graph: graph([{}, { enabled: false }], AFTER) },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("STATE_DIFFERS");
  });

  it("an unrelated part of the page changing does not confirm anything", () => {
    // The QG-02 fixture has a live region on a timer. A "something changed" check would call
    // this a success; a declared postcondition does not.
    const v = verify({
      observation: {
        graph: buildElementGraph(
          [
            ...measurements(),
            { selector: "#queue", role: "generic", name: "Queue position: 7", rect: { x: 400, y: 430, w: 300, h: 60 }, cssHidden: false, enabled: true, parentIndex: -1 },
          ],
          geometry,
          AFTER
        ),
        focusedSelector: null,
      },
    });
    expect(v.verification).toBe("NOT_CONFIRMED");
    if (v.verification === "NOT_CONFIRMED") expect(v.cause).toBe("FOCUS_ABSENT");
  });
});

describe("VERIFY RESULT — 12: the same evidence always gives the same answer", () => {
  it("is deterministic over repeated verification", () => {
    const cases: ExpectedPostcondition[] = [
      { kind: "FOCUS_ON_TARGET" },
      { kind: "TARGET_ENABLED", expected: true },
      { kind: "TARGET_NAME", expected: "Phone" },
    ];
    for (const expected of cases) {
      const answers = new Set<string>();
      for (let i = 0; i < 25; i += 1) {
        const v = verify({ expected });
        answers.add(`${v.verification}/${"cause" in v ? v.cause : "-"}`);
      }
      expect(answers.size).toBe(1);
    }
  });

  it("actedNodeId reports a node only for a real dispatch", () => {
    const before = graph();
    expect(actedNodeId(executed(nodeFor(before, "#phone")))).toBe(nodeId("e1"));
    expect(actedNodeId({ status: "REJECTED", cause: "NOT_VALIDATED", detail: "-" })).toBeNull();
    expect(
      actedNodeId({ status: "EXECUTION_ERROR", kind: "click", category: "BRIDGE_TIMEOUT", errorName: "DispatchTimeout", dispatchMs: 1 })
    ).toBeNull();
  });
});
