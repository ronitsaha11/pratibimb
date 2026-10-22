/**
 * M14 — stage 12 in the extension's product run path, held in place by reading the source.
 *
 * `extension-run.ts` is exercised only in a browser (coverageBoundary.test.ts), so its wiring is
 * pinned here the way the other boundary tests pin theirs. The loop's behaviour itself — every turn
 * through every gate, and every way it stops — is tested against the real gates in
 * `packages/orchestrator/test/loop.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const source = readFileSync(join(ROOT, "apps/extension/host-lib/extension-run.ts"), "utf8");
const code = source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");

describe("stage 12 in the extension run", () => {
  it("one turn, exactly as before, when the request names no budget", () => {
    expect(code).toMatch(/if \(request\.maxTurns === undefined\) \{\s*record = await runTask\(ports, runOptions\);/);
  });

  it("a budget is checked, never clamped, before the loop starts", () => {
    expect(code).toContain("maxTurns: checkTurnBudget(request.maxTurns)");
  });

  it("the loop runs through the same ports, so every turn meets the same gates and the same attested document", () => {
    expect(code).toMatch(/runTaskLoop\(ports, \{\s*\.\.\.runOptions,/);
    // There is exactly one set of ports and one privacy boundary per run; no turn builds its own.
    expect(code.match(/createExtensionPorts\(/g)).toHaveLength(1);
    expect(code.match(/createRemotePrivacyBoundary\(/g)).toHaveLength(1);
  });

  it("revokes every capability between turns", () => {
    expect(code).toMatch(/betweenTurns: async \(\) => \{\s*deps\.capabilities\.revokeAll\(\);\s*\}/);
  });

  it("projects every turn exactly as a single run is projected before it crosses the worker", () => {
    expect(code).toContain("turns: result.turns.map(crossable)");
    expect(code).toContain("record: crossable(record)");
  });

  it("still revokes and forgets once at the end, however the task ended", () => {
    expect(code).toMatch(/finally \{\s*deps\.capabilities\.revokeAll\(\);\s*await privacy\.forget\(\)/);
  });
});
