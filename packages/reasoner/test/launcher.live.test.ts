/**
 * M20 — THE PRODUCT LAUNCHER, ANSWERING THROUGH THE NORMAL ADAPTER.
 *
 * Opt-in: runs only with `PRATIBIMB_REASONER_LIVE=1` and `npm run reasoner` already running. A green
 * `/health` proves a process is listening; this proves the extension's own path works end to end —
 * a real verified handoff, `sendToReasoner` → egress guard → the launcher's front on the one CSP
 * endpoint → the pinned model → a plan the client parses as untrusted.
 *
 * It asserts the shape of the answer, never its content: what the model chose is not under test here,
 * and nothing it said is printed.
 */
import { describe, expect, it } from "vitest";

import { localModelReasoner, sendToReasoner } from "../src/index.js";
import { GOAL, ORIGIN, REQUEST, SESSION, verifiedHandoff } from "./support/handoff.js";

const LIVE = process.env.PRATIBIMB_REASONER_LIVE === "1";
const ENDPOINT = "http://127.0.0.1:8995/v1/chat/completions";

describe.skipIf(!LIVE)("the launched reasoner (npm run reasoner)", () => {
  it("reports the pinned model on /health", async () => {
    const health = (await (await fetch("http://127.0.0.1:8995/health")).json()) as Record<string, unknown>;
    expect(health).toMatchObject({
      status: "ok",
      service: "pratibimb-reasoner",
      model: { sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db" },
      endpoint: ENDPOINT,
    });
  });

  it("answers a real verified handoff through localModelReasoner with a parsed plan", async () => {
    const { handoff, vault, fill } = await verifiedHandoff();
    const egress: string[] = [];
    const client = localModelReasoner({ endpoint: ENDPOINT, onEgress: (e) => egress.push(e.record ? "SENT" : "REFUSED") });
    // The product's own deadline (DEFAULT_REASONER_TIMEOUT_MS): no allowance is made for the launcher.
    const response = await sendToReasoner(client, { handoff, vault, fill, goal: GOAL, requestId: REQUEST, sessionId: SESSION, origin: ORIGIN });
    expect(egress).toEqual(["SENT"]);
    expect(response.received, response.received ? "" : response.cause).toBe(true);
    if (!response.received) return;
    expect(response.transport).toBe("LOOPBACK_HTTP");
    const raw = response.raw as { planVersion?: string; steps?: { op: string }[] };
    expect(raw.planVersion).toBe("1");
    expect(raw.steps?.length).toBeGreaterThan(0);
    for (const step of raw.steps ?? []) expect(["insert", "click", "done"]).toContain(step.op);
  }, 120_000);
});
