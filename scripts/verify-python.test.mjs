/**
 * M22.8 — the Python adapter tests are part of the canonical verification, and stay so: `npm run
 * verify` ends with `npm run test:py`, which runs `scripts/verify-python.py`, and CI runs the same
 * runner with strict version pins. A change that drops either fails here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Python adapter tests in the canonical verification", () => {
  const scripts = JSON.parse(read("package.json")).scripts;

  it("`npm run verify` runs the Python tests after the JavaScript tests, and fails with them", () => {
    expect(scripts["test:py"]).toBe("python scripts/verify-python.py");
    const steps = scripts.verify.split("&&").map((s) => s.trim());
    expect(steps).toContain("npm test");
    expect(steps.at(-1)).toBe("npm run test:py");
    expect(steps.indexOf("npm run test:py")).toBeGreaterThan(steps.indexOf("npm test"));
  });

  it("CI installs the pinned dependencies and runs the same runner with strict pins", () => {
    const ci = read(".github/workflows/ci.yml");
    const job = ci.slice(ci.indexOf("\n  detector-adapter:"), ci.indexOf("\n  coordinate-contract:"));
    expect(job).toContain("python -m pip install --quiet -r tools/detector/requirements-test.txt");
    expect(job).toMatch(/PRATIBIMB_STRICT_PY_PINS: '1'\s+run: python scripts\/verify-python\.py/);
    expect(job).not.toMatch(/continue-on-error|if: false/);
  });

  it("every dependency is an exact pin", () => {
    const lines = read("tools/detector/requirements-test.txt").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("--"));
    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const l of lines) expect(l).toMatch(/^[A-Za-z0-9_.-]+==\S+$/);
  });
});
