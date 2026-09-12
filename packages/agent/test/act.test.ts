/**
 * ACT — the executor. ADR-0006.
 *
 * The suite is organised around one claim: **there is no path from an unvalidated or refused
 * action to the browser.** Every negative case therefore asserts two things — the structured
 * result, and that the bridge's single method was never called. A recording bridge makes the
 * second assertion possible, and a counter of zero is the whole point of most of this file.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALLOWED_ACTIONS,
  EXECUTABLE_ACTIONS,
  act,
  actionableTarget,
  confirmationTierOf,
  validateActionFreshness,
  validateAndAct,
  wasDispatched,
  type ActResult,
  type CssPoint,
  type FreshnessDecision,
  type PageActionBridge,
  type ProposedAction,
  type TargetClaim,
} from "@pratibimb/agent";
import {
  cssBox,
  cssPx,
  docBox,
  frameId,
  nodeId,
  type CssBox,
  type ElementGraph,
  type ElementNode,
  type FrameId,
  type VisualEvidence,
} from "@pratibimb/perception";

const F1 = frameId("frame-1");
const F2 = frameId("frame-2");

const box = (x: number, y: number, w: number, h: number): CssBox =>
  cssBox(cssPx(x), cssPx(y), cssPx(w), cssPx(h));

const observed = (b: CssBox, frame: FrameId = F1): VisualEvidence => ({
  kind: "OBSERVED",
  frameId: frame,
  viewportBox: b,
  documentBox: docBox(b.x, b.y, b.w, b.h),
});

const clipped = (full: CssBox, visible: CssBox, frame: FrameId = F1): VisualEvidence => ({
  kind: "CLIPPED",
  frameId: frame,
  viewportBox: full,
  visiblePart: visible,
  documentBox: docBox(full.x, full.y, full.w, full.h),
});

const node = (over: Partial<ElementNode> = {}): ElementNode => ({
  id: nodeId("e1"),
  role: "textbox",
  name: "Phone",
  domRef: { selector: "#phone" },
  evidence: observed(box(100, 200, 240, 32)),
  enabled: true,
  parent: null,
  children: [],
  ...over,
});

const graphOf = (nodes: readonly ElementNode[], frame: FrameId = F1): ElementGraph => ({
  frameId: frame,
  nodes: [...nodes],
  byId: new Map(nodes.map((n) => [n.id, n])),
});

const claimOf = (n: ElementNode, frame: FrameId = F1): TargetClaim => {
  const e = n.evidence;
  if (e.kind !== "OBSERVED" && e.kind !== "CLIPPED") throw new Error("test setup: no box to claim");
  return { nodeId: n.id, role: n.role, name: n.name, frameId: frame, viewportBox: e.viewportBox };
};

/** A bridge that records every dispatch instead of performing one. */
class RecordingBridge implements PageActionBridge {
  readonly frameId: FrameId;
  readonly clicks: CssPoint[] = [];
  constructor(frame: FrameId = F1) {
    this.frameId = frame;
  }
  async clickAtCssPoint(point: CssPoint): Promise<void> {
    this.clicks.push(point);
  }
  get callCount(): number {
    return this.clicks.length;
  }
}

let bridge: RecordingBridge;
beforeEach(() => {
  bridge = new RecordingBridge();
});

/** Every refusal must look identical from the outside: no dispatch, ever. */
const expectNoBrowserOperation = (r: ActResult, b: RecordingBridge): void => {
  expect(b.callCount).toBe(0);
  expect(wasDispatched(r)).toBe(false);
  expect(r.status).not.toBe("EXECUTED");
};

const allowFor = (n: ElementNode, kind = "click", point?: CssPoint): FreshnessDecision =>
  validateActionFreshness(graphOf([n]), { kind, target: claimOf(n), ...(point ? { point } : {}) });

// ---------------------------------------------------------------------------------------------
// The supported path
// ---------------------------------------------------------------------------------------------

describe("ACT executes a validated click", () => {
  it("dispatches at the centre of the validated box and reports EXECUTED", async () => {
    const n = node();
    const r = await act(allowFor(n), bridge);
    expect(r.status).toBe("EXECUTED");
    expect(bridge.callCount).toBe(1);
    expect(bridge.clicks[0]).toEqual({ x: 220, y: 216 });
    if (r.status === "EXECUTED") {
      expect(r.kind).toBe("click");
      expect(r.target.nodeId).toBe(nodeId("e1"));
      expect(r.target.role).toBe("textbox");
      expect(r.target.box).toEqual(box(100, 200, 240, 32));
      expect(r.dispatchMs).toBeGreaterThanOrEqual(0);
    }
    expect(wasDispatched(r)).toBe(true);
  });

  it("uses the point the VALIDATOR echoed, not the centre, when one was validated", async () => {
    const n = node();
    const p: CssPoint = { x: cssPx(110), y: cssPx(205) };
    const r = await act(allowFor(n, "click", p), bridge);
    expect(r.status).toBe("EXECUTED");
    expect(bridge.clicks[0]).toEqual({ x: 110, y: 205 });
  });

  it("clicks inside the VISIBLE part of a clipped target, never the full box's centre", async () => {
    // Half-scrolled: the full box's centre is above the viewport; the visible part is not.
    const n = node({ evidence: clipped(box(100, -40, 240, 80), box(100, 0, 240, 40)) });
    const r = await act(allowFor(n), bridge);
    expect(r.status).toBe("EXECUTED");
    const p = bridge.clicks[0]!;
    expect(p).toEqual({ x: 220, y: 20 });
    expect(p.y).toBeGreaterThan(0);
  });

  it("is the executor for exactly one action kind", () => {
    expect([...EXECUTABLE_ACTIONS]).toEqual(["click"]);
    expect(ALLOWED_ACTIONS.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------------------------
// PROPERTY 1 — no validation, no execution
// ---------------------------------------------------------------------------------------------

describe("no validation means no execution", () => {
  it("refuses a RE_OBSERVE decision and never touches the bridge", async () => {
    const n = node();
    const stale: TargetClaim = { ...claimOf(n), frameId: F2 };
    const decision = validateActionFreshness(graphOf([n]), { kind: "click", target: stale });
    expect(decision.decision).toBe("RE_OBSERVE");
    const r = await act(decision, bridge);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") {
      expect(r.cause).toBe("NOT_VALIDATED");
      expect(r.detail).toContain("FRAME_MISMATCH");
    }
    expectNoBrowserOperation(r, bridge);
  });

  it("refuses a FORGED ALLOW that the validator did not produce", async () => {
    const n = node();
    const forged = {
      decision: "ALLOW",
      kind: "click",
      node: n,
      frameId: F1,
      viewportBox: box(100, 200, 240, 32),
    } as unknown as FreshnessDecision;
    const r = await act(forged, bridge);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") {
      expect(r.cause).toBe("NOT_VALIDATED");
      expect(r.detail).toContain("attestation");
    }
    expectNoBrowserOperation(r, bridge);
  });

  it("refuses a validated ALLOW that was copied — a spread drops the attestation", async () => {
    // A copy is a different object with the same fields; it is not the decision that passed.
    const copy = { ...(allowFor(node()) as object) } as FreshnessDecision;
    const r = await act(copy, bridge);
    expect(r.status).toBe("REJECTED");
    expectNoBrowserOperation(r, bridge);
  });

  it("refuses a decision that round-tripped through JSON", async () => {
    const revived = JSON.parse(JSON.stringify(allowFor(node()))) as FreshnessDecision;
    const r = await act(revived, bridge);
    expect(r.status).toBe("REJECTED");
    expectNoBrowserOperation(r, bridge);
  });

  it("refuses an unrecognised decision value rather than reading it as permission", async () => {
    const r = await act({ decision: "MAYBE" } as unknown as FreshnessDecision, bridge);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.cause).toBe("NOT_VALIDATED");
    expectNoBrowserOperation(r, bridge);
  });
});

// ---------------------------------------------------------------------------------------------
// PROPERTY 2 / 3 — no target, no execution; and never a substitute target
// ---------------------------------------------------------------------------------------------

describe("no target means no execution, and no target is ever invented", () => {
  it("refuses an ALLOW with no node or box", async () => {
    // `wait` validates to an ALLOW with no target at all; ACT refuses it as unsupported first,
    // so construct the harder case: a click-shaped ALLOW that carries no target.
    const targetless = validateActionFreshness(graphOf([node()]), { kind: "wait" });
    expect(targetless.decision).toBe("ALLOW");
    const r = await act(targetless, bridge);
    expect(r.status).toBe("UNSUPPORTED_ACTION");
    expectNoBrowserOperation(r, bridge);
  });

  it("does not fall back to another element when the target is gone", async () => {
    const wanted = node({ id: nodeId("e1"), name: "Phone" });
    const neighbour = node({ id: nodeId("e2"), name: "Email", evidence: observed(box(100, 260, 240, 32)) });
    const plan = claimOf(wanted);
    // the page now holds only the neighbour — a nearest-match executor would click it
    const decision = validateActionFreshness(graphOf([neighbour]), { kind: "click", target: plan });
    expect(decision.decision).toBe("RE_OBSERVE");
    const r = await act(decision, bridge);
    expectNoBrowserOperation(r, bridge);
    expect(actionableTarget(decision)).toBeNull();
  });

  it("sweeps every refusal reason and proves not one of them reaches the browser", async () => {
    const n = node();
    const offscreen = node({ evidence: { kind: "OFFSCREEN", documentBox: docBox(100, 2000, 240, 32) } });
    const disabled = node({ enabled: false });
    const hidden = node({
      evidence: { kind: "UNOBSERVED", reason: "ELEMENT_OUTSIDE_CAPTURE", detail: "css-hidden in the test fixture" },
    });
    // Each case pairs the page the executor is given with what the plan claims about it.
    const cases: { readonly why: string; readonly graph: ElementGraph; readonly proposal: ProposedAction }[] = [
      { why: "not in the grammar", graph: graphOf([n]), proposal: { kind: "dance", target: claimOf(n) } },
      { why: "stale frame", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), frameId: F2 } } },
      { why: "target gone", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), nodeId: nodeId("missing") } } },
      { why: "role changed", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), role: "button" } } },
      { why: "name changed", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), name: "Delete my account" } } },
      { why: "became disabled", graph: graphOf([disabled]), proposal: { kind: "click", target: claimOf(n) } },
      { why: "scrolled off screen", graph: graphOf([offscreen]), proposal: { kind: "click", target: claimOf(n) } },
      { why: "never observed", graph: graphOf([hidden]), proposal: { kind: "click", target: claimOf(n) } },
      { why: "moved", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), viewportBox: box(400, 600, 240, 32) } } },
      { why: "resized", graph: graphOf([n]), proposal: { kind: "click", target: { ...claimOf(n), viewportBox: box(100, 200, 900, 32) } } },
      { why: "point off target", graph: graphOf([n]), proposal: { kind: "click", target: claimOf(n), point: { x: cssPx(9000), y: cssPx(9000) } } },
      { why: "no target at all", graph: graphOf([n]), proposal: { kind: "click" } },
    ];
    for (const { why, graph, proposal } of cases) {
      const fresh = new RecordingBridge();
      const { decision, result } = await validateAndAct(graph, proposal, fresh);
      expect(decision.decision, why).toBe("RE_OBSERVE");
      expect(result.status, why).toBe("REJECTED");
      expect(fresh.callCount, why).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// PROPERTY 4 — unsupported actions
// ---------------------------------------------------------------------------------------------

describe("unsupported actions are refused with a specific, honest reason", () => {
  const expectUnsupported = async (proposal: ProposedAction, cause: string) => {
    const n = node();
    const { result } = await validateAndAct(graphOf([n]), proposal, bridge);
    expect(result.status).toBe("UNSUPPORTED_ACTION");
    if (result.status === "UNSUPPORTED_ACTION") expect(result.cause).toBe(cause);
    expectNoBrowserOperation(result, bridge);
  };

  it("refuses `type` because the clearance pipeline does not exist", async () => {
    const n = node();
    await expectUnsupported({ kind: "type", target: claimOf(n) }, "CLEARANCE_PIPELINE_ABSENT");
  });

  it("refuses `scroll` and `select` for want of a payload contract", async () => {
    const n = node();
    await expectUnsupported({ kind: "scroll", target: claimOf(n) }, "NO_SAFE_PAYLOAD_CONTRACT");
    await expectUnsupported({ kind: "select", target: claimOf(n) }, "NO_SAFE_PAYLOAD_CONTRACT");
  });

  it("refuses `confirm` because nothing can represent a human's consent", async () => {
    const n = node();
    await expectUnsupported({ kind: "confirm", target: claimOf(n) }, "NO_HUMAN_CONFIRMATION_CHANNEL");
  });

  it("refuses `wait`, `zoom_request` and `done` as not page operations", async () => {
    await expectUnsupported({ kind: "wait" }, "NOT_A_PAGE_OPERATION");
    await expectUnsupported({ kind: "zoom_request", target: claimOf(node()) }, "NOT_A_PAGE_OPERATION");
    await expectUnsupported({ kind: "done" }, "NOT_A_PAGE_OPERATION");
  });

  it("refuses a kind that is not in the grammar at all, before anything else", async () => {
    const n = node();
    const { decision, result } = await validateAndAct(graphOf([n]), { kind: "execute_javascript", target: claimOf(n) }, bridge);
    expect(decision.decision).toBe("RE_OBSERVE");
    if (decision.decision === "RE_OBSERVE") expect(decision.reason).toBe("ACTION_NOT_ALLOWLISTED");
    expectNoBrowserOperation(result, bridge);
  });

  it("covers every allowlisted action: each one either executes or is refused by name", async () => {
    const n = node();
    for (const kind of ALLOWED_ACTIONS) {
      const fresh = new RecordingBridge();
      const needsTarget = !["wait", "done"].includes(kind);
      const { result } = await validateAndAct(
        graphOf([n]),
        needsTarget ? { kind, target: claimOf(n) } : { kind },
        fresh
      );
      if (kind === "click") {
        expect(result.status).toBe("EXECUTED");
        expect(fresh.callCount).toBe(1);
      } else {
        expect(result.status).toBe("UNSUPPORTED_ACTION");
        expect(fresh.callCount).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The frame precondition, and the confirmation tier
// ---------------------------------------------------------------------------------------------

describe("the bridge must be driving the frame the decision was validated against", () => {
  it("refuses when the bridge is on a different frame", async () => {
    const other = new RecordingBridge(F2);
    const r = await act(allowFor(node()), other);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.cause).toBe("BRIDGE_FRAME_MISMATCH");
    expectNoBrowserOperation(r, other);
  });

  it("allows when the frames agree", async () => {
    const r = await act(allowFor(node()), new RecordingBridge(F1));
    expect(r.status).toBe("EXECUTED");
  });
});

describe("the human-confirmation tier refuses, and has no grant path", () => {
  it("refuses a submit button even though validation allowed it", async () => {
    const submit = node({ id: nodeId("e9"), role: "button", name: "Submit" });
    const decision = allowFor(submit);
    expect(decision.decision).toBe("ALLOW");
    const r = await act(decision, bridge);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.cause).toBe("HUMAN_CONFIRMATION_REQUIRED");
    expectNoBrowserOperation(r, bridge);
  });

  it("refuses every link, because the element graph cannot say where a link goes", async () => {
    const link = node({ id: nodeId("e8"), role: "link", name: "What number should I use?" });
    const r = await act(allowFor(link), bridge);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.cause).toBe("HUMAN_CONFIRMATION_REQUIRED");
    expectNoBrowserOperation(r, bridge);
  });

  it("screens the tier names the action schema lists", () => {
    for (const name of [
      "Submit", "submit application", "Send message", "Pay now", "Buy", "Purchase",
      "Place order", "Checkout", "Delete my account", "Remove", "Transfer funds",
      "Sign in", "Log out", "Login", "Authorise payment", "Confirm", "Approve", "I agree",
    ]) {
      expect(confirmationTierOf({ role: "button", name })).toBe("CONFIRM_REQUIRED");
    }
  });

  it("leaves ordinary controls routine", () => {
    for (const name of ["Phone", "Cancel", "Back", "Next page", "Search", "Filter", "Close"]) {
      expect(confirmationTierOf({ role: "button", name })).toBe("ROUTINE");
    }
    expect(confirmationTierOf({ role: "textbox", name: "Phone" })).toBe("ROUTINE");
  });

  it("exposes no way to grant confirmation — the refusal cannot be argued past", async () => {
    const submit = node({ id: nodeId("e9"), role: "button", name: "Submit" });
    const mod = await import("@pratibimb/agent");
    const grants = Object.keys(mod).filter((k) => /confirm(ation)?(Grant|Granted|Consent)|grant|consent|approveAction/i.test(k));
    expect(grants).toEqual([]);
    // and no options bag smuggles one through
    const r = await act(allowFor(submit), bridge, { timeoutMs: 1000 } as never);
    expect(r.status).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------------------------
// PROPERTY 5 — execution failures are explicit
// ---------------------------------------------------------------------------------------------

describe("dispatch failures are surfaced, never swallowed", () => {
  it("reports EXECUTION_ERROR when the bridge throws, and keeps the message out", async () => {
    class Throwing implements PageActionBridge {
      readonly frameId = F1;
      async clickAtCssPoint(): Promise<void> {
        const e = new Error("element is not visible: <input id=\"phone\" value=\"9876543210\">");
        e.name = "TimeoutError";
        throw e;
      }
    }
    const r = await act(allowFor(node()), new Throwing());
    expect(r.status).toBe("EXECUTION_ERROR");
    if (r.status === "EXECUTION_ERROR") {
      expect(r.category).toBe("BRIDGE_THREW");
      expect(r.errorName).toBe("TimeoutError");
      // the page content the bridge quoted must not appear anywhere in the result
      expect(JSON.stringify(r)).not.toContain("9876543210");
      expect(JSON.stringify(r)).not.toContain("input id");
    }
    expect(wasDispatched(r)).toBe(false);
  });

  it("reports a timeout as an UNKNOWN outcome rather than a failure to act", async () => {
    class Hanging implements PageActionBridge {
      readonly frameId = F1;
      clickAtCssPoint(): Promise<void> {
        return new Promise<void>(() => {
          /* never resolves */
        });
      }
    }
    const r = await act(allowFor(node()), new Hanging(), { timeoutMs: 1 });
    expect(r.status).toBe("EXECUTION_ERROR");
    if (r.status === "EXECUTION_ERROR") expect(r.category).toBe("BRIDGE_TIMEOUT");
  });

  it("does not convert a rejected promise into success", async () => {
    class Rejecting implements PageActionBridge {
      readonly frameId = F1;
      clickAtCssPoint(): Promise<void> {
        return Promise.reject(new Error("nope"));
      }
    }
    const r = await act(allowFor(node()), new Rejecting());
    expect(r.status).toBe("EXECUTION_ERROR");
  });
});

// ---------------------------------------------------------------------------------------------
// PROPERTY 6-8 — no network, no storage, no values
// ---------------------------------------------------------------------------------------------

describe("ACT carries no value and claims no authority it does not need", () => {
  it("has no field anywhere that could hold a typed value or a secret", async () => {
    const r = await act(allowFor(node()), bridge);
    expect(r.status).toBe("EXECUTED");
    const keys = Object.keys(r).concat(r.status === "EXECUTED" ? Object.keys(r.target) : []);
    for (const forbidden of ["value", "valueLiteral", "value_literal", "valueRef", "value_ref", "token", "secret", "text"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("dispatches only through the bridge: the module reaches no network or storage API", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/act.ts", import.meta.url), "utf8")
    );
    for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage", "indexedDB", "chrome.storage", "eval(", "Function("]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("is deterministic: the same decision dispatches the same point every time", async () => {
    const n = node();
    const points = [];
    for (let i = 0; i < 3; i += 1) {
      const b = new RecordingBridge();
      await act(allowFor(n), b);
      points.push(b.clicks[0]);
    }
    expect(points[0]).toEqual(points[1]);
    expect(points[1]).toEqual(points[2]);
  });
});

// ---------------------------------------------------------------------------------------------
// The single entry point
// ---------------------------------------------------------------------------------------------

describe("validateAndAct is the only path from a proposal to a page", () => {
  it("validates first and hands ACT the decision it produced", async () => {
    const n = node();
    const { decision, result } = await validateAndAct(graphOf([n]), { kind: "click", target: claimOf(n) }, bridge);
    expect(decision.decision).toBe("ALLOW");
    expect(result.status).toBe("EXECUTED");
    expect(bridge.callCount).toBe(1);
  });

  it("refuses without dispatching when validation refuses", async () => {
    const n = node();
    const { decision, result } = await validateAndAct(
      graphOf([n]),
      { kind: "click", target: { ...claimOf(n), name: "Delete my account" } },
      bridge
    );
    expect(decision.decision).toBe("RE_OBSERVE");
    expectNoBrowserOperation(result, bridge);
  });

  it("honours a stricter tolerance, and still does not dispatch when it fails", async () => {
    const n = node();
    const shifted: TargetClaim = { ...claimOf(n), viewportBox: box(101, 200, 240, 32) };
    const loose = await validateAndAct(graphOf([n]), { kind: "click", target: shifted }, new RecordingBridge());
    expect(loose.result.status).toBe("EXECUTED");
    const strict = await validateAndAct(graphOf([n]), { kind: "click", target: shifted }, bridge, {
      tolerance: { maxCentreShiftCssPx: 0.1, minBoxIou: 0.99 },
    });
    expect(strict.decision.decision).toBe("RE_OBSERVE");
    expectNoBrowserOperation(strict.result, bridge);
  });
});
