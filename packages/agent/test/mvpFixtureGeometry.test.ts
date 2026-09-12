/**
 * The MVP fixture rects must be the ones a real browser reports. Machine-checked.
 *
 * WHY THIS FILE EXISTS, stated plainly because it is the whole justification:
 *
 * `actOnMvpFixture.test.ts` and `guardedActOnMvpFixture.test.ts` both hard-code the geometry of
 * `tests/browser/qg02/fixture/form.html` and both describe it as "the rects a real Chromium
 * measured". For `actOnMvpFixture.test.ts` that was **false from its first commit** — `#cancel`
 * was recorded at `x=32, w=96` where the browser reports `x=620, w=120` — and the claim cited
 * `MVP-1 logs/mvp1.json`, a file that records click points and a viewport and has never contained
 * a single rect.
 *
 * It survived because **nothing checked it**. Reverting any one of those six rects to its wrong
 * value breaks **zero** tests in that file: the numbers feed `buildElementGraph`, every element
 * stays in the same visibility class either way, and `#phone`'s centre lands on `(550, 276)` under
 * both the right and the wrong box. The one point assertion in the suite cannot tell them apart.
 *
 * So correcting the numbers alone would fix today's documentation defect and leave tomorrow's
 * drift just as invisible. This file is the guard: it compares both suites against a recorded
 * browser measurement, so a wrong rect is a failing test rather than a sentence nobody verified.
 *
 * It reads the two suites as TEXT on purpose. Their fixtures are module-private literals, and
 * exporting them to make this check possible would reshape another author's file for the benefit
 * of a guard. Reading source text to defend a claim made in source text is the idiom
 * `packages/perception/test/realCaptureConformance.test.ts` already uses here.
 *
 * The measurement is data, not prose: `artifacts/experiments/MVP-2-hit-test-verify-result/
 * logs/fixture-geometry.json`, Chromium 151.0.7922.34 at 1024x768 DPR 1, workstation 1. Re-measure
 * with the MVP-2 harness's approach if the fixture ever changes — and change the fixture and this
 * record together.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const MEASUREMENT = "artifacts/experiments/MVP-2-hit-test-verify-result/logs/fixture-geometry.json";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Measured {
  readonly chromiumVersion: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  readonly elements: readonly {
    readonly selector: string;
    readonly rect: Rect;
    readonly centre: { readonly x: number; readonly y: number };
  }[];
}

const measured: Measured = JSON.parse(readFileSync(join(REPO, MEASUREMENT), "utf8")) as Measured;

const measuredBySelector = new Map(measured.elements.map((e) => [e.selector, e.rect]));

/**
 * Pull `{ selector: "#x", ... rect: { x: N, y: N, w: N, h: N } ... }` out of a suite's fixture.
 *
 * Deliberately strict: a line whose shape this does not recognise is simply not returned, and the
 * per-file test below asserts a minimum count, so a fixture that is reformatted beyond recognition
 * fails loudly instead of silently checking nothing.
 */
function rectsDeclaredIn(relPath: string): Map<string, Rect> {
  const source = readFileSync(join(REPO, relPath), "utf8");
  const found = new Map<string, Rect>();
  const line = /\{\s*selector:\s*"([^"]+)"[^\n]*?rect:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*w:\s*(-?[\d.]+),\s*h:\s*(-?[\d.]+)\s*\}/g;
  for (const m of source.matchAll(line)) {
    const [, selector, x, y, w, h] = m;
    if (!selector || found.has(selector)) continue;
    found.set(selector, { x: Number(x), y: Number(y), w: Number(w), h: Number(h) });
  }
  return found;
}

const SUITES = [
  { path: "packages/agent/test/actOnMvpFixture.test.ts", minimumElements: 6 },
  { path: "packages/agent/test/guardedActOnMvpFixture.test.ts", minimumElements: 5 },
] as const;

describe("the recorded measurement is what it claims to be", () => {
  it("was taken at the viewport and DPR both suites assume", () => {
    expect(measured.viewport).toEqual({ width: 1024, height: 768 });
    expect(measured.devicePixelRatio).toBe(1);
    expect(measured.chromiumVersion).toMatch(/^\d+\./);
  });

  it("covers every element the fixture defines", () => {
    expect([...measuredBySelector.keys()].sort()).toEqual(
      ["#cancel", "#dynamic", "#footer-link", "#help-link", "#masthead", "#phone", "#phone-label", "#submit"].sort()
    );
  });
});

describe.each(SUITES)("$path declares the measured geometry", ({ path, minimumElements }) => {
  const declared = rectsDeclaredIn(path);

  it("declares a fixture this guard can actually read", () => {
    // Without this, a reformatted fixture would make every assertion below vacuous.
    expect(declared.size).toBeGreaterThanOrEqual(minimumElements);
  });

  it("names only elements the fixture really has", () => {
    for (const selector of declared.keys()) expect(measuredBySelector.has(selector)).toBe(true);
  });

  it("matches the browser for every element it declares", () => {
    const mismatches: string[] = [];
    for (const [selector, rect] of declared) {
      const truth = measuredBySelector.get(selector);
      if (!truth) continue;
      if (rect.x !== truth.x || rect.y !== truth.y || rect.w !== truth.w || rect.h !== truth.h) {
        mismatches.push(
          `${selector}: declared {x:${rect.x}, y:${rect.y}, w:${rect.w}, h:${rect.h}} ` +
            `but Chromium measured {x:${truth.x}, y:${truth.y}, w:${truth.w}, h:${truth.h}}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("the two suites agree with each other", () => {
  it("declares identical rects for every element both files define", () => {
    const a = rectsDeclaredIn(SUITES[0].path);
    const b = rectsDeclaredIn(SUITES[1].path);
    const shared = [...a.keys()].filter((s) => b.has(s));
    // The suites overlap on purpose: one is the VALIDATE -> ACT counterpart, the other the
    // VALIDATE -> HIT-TEST -> ACT -> VERIFY one. They describe the same page.
    expect(shared.length).toBeGreaterThanOrEqual(5);
    for (const selector of shared) expect({ selector, ...a.get(selector) }).toEqual({ selector, ...b.get(selector) });
  });
});
