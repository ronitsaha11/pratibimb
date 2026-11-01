/**
 * M22.4 — the v2 renderer's pure checks and the build command's refusals. No browser is launched
 * here: the browser step is exercised by the build itself and recorded under
 * `artifacts/experiments/M22.4-train-dev-candidate/`. No TEST id, seed or layout is computed; the
 * one TEST-named call is a refusal that throws before the page is touched.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASSES } from "../config.mjs";
import { BUCKET_IDS } from "../schedule.mjs";
import { planSplit } from "../plan.mjs";
import { CANDIDATE_PREFIX, assertScratchRoot, candidateRoot, pngSize, renderDefects, renderSample } from "../render.mjs";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const BUILD = fileURLToPath(new URL("../build-candidate.mjs", import.meta.url));

function schedule(pos, occ) {
  const cells = (v) => Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(BUCKET_IDS.map((b) => [b, typeof v === "function" ? v() : v]))]));
  return { maxTargetsPerSample: 12, maxOverflowSamples: 10, positives: { dev: cells(pos) }, occlusionCases: { dev: cells(() => ({ ...occ })) } };
}
const spec = planSplit(schedule(1, { partial: 1, full: 1 }), "dev", 12).specs.find((s) => s.occluders.length > 0);

/** What a faithful render of `spec` would report. */
const faithful = (s) => ({
  environment: { w: s.viewport.w, h: s.viewport.h, dpr: 1 },
  frame: { w: s.viewport.w, h: s.viewport.h, sha256: "0".repeat(64) },
  requests: 0,
  elements: s.elements.map((e) => ({ key: e.key, rect: { ...e.box }, computedPosition: "absolute" })),
  occluders: s.occluders.map((o) => ({ id: o.id, rect: { ...o.box } })),
  validity: Object.fromEntries(s.elements.map((e) => [e.key, "HIT_TESTABLE"])),
});
const TOL = { occluderTolerancePx: 0.5 };

describe("renderDefects — what refuses a build", () => {
  it("a faithful render has no defect", () => {
    expect(renderDefects(spec, faithful(spec), TOL)).toEqual([]);
  });
  const cases = [
    ["a wrong viewport", (r) => (r.environment.w -= 1), /viewport/],
    ["a device pixel ratio other than 1", (r) => (r.environment.dpr = 2), /device pixel ratio/],
    ["a frame of the wrong size", (r) => (r.frame.h += 1), /frame/],
    ["a network request", (r) => (r.requests = 1), /network/],
    ["a missing labelled element", (r) => r.elements.pop(), /labelled elements/],
    ["an extra labelled element", (r) => r.elements.push({ key: "dev-99999-e000", rect: { x: 0, y: 0, w: 1, h: 1 }, computedPosition: "absolute" }), /labelled elements/],
    ["an element with no classification", (r) => delete r.validity[r.elements[0].key], /no hit-test classification/],
    ["a non-finite rect", (r) => (r.elements[0].rect.w = Number.NaN), /non-finite/],
    ["a missing occluder", (r) => r.occluders.pop(), /occluder/],
    ["an occluder rendered away from its declared box", (r) => (r.occluders[0].rect.x += 2), /from its declared box/],
  ];
  for (const [name, spoil, msg] of cases) {
    it(`refuses ${name}`, () => {
      const r = structuredClone(faithful(spec));
      spoil(r);
      expect(renderDefects(spec, r, TOL).join("; ")).toMatch(msg);
    });
  }
  it("a labelled element rendered away from its box is NOT a render defect: the gate (G4, G8) judges it", () => {
    const r = faithful(spec);
    r.elements[0].rect.x += 3;
    expect(renderDefects(spec, r, TOL)).toEqual([]);
  });
});

describe("destinations — one new candidate, or a scratch copy outside the repository", () => {
  it("the primary destination is a numbered candidate of this version under artifacts/datasets", () => {
    expect(candidateRoot(REPO, 3).replace(/\\/g, "/")).toMatch(new RegExp(`/artifacts/datasets/${CANDIDATE_PREFIX}3$`));
    for (const bad of [0, -1, 1.5, "1"]) expect(() => candidateRoot(REPO, bad)).toThrow(/positive integer/);
  });
  it("a scratch destination must be absolute and outside the repository", () => {
    expect(() => assertScratchRoot(REPO, "relative/dir")).toThrow(/absolute/);
    expect(() => assertScratchRoot(REPO, join(REPO, "tmp", "x"))).toThrow(/outside the repository/);
    expect(() => assertScratchRoot(REPO, REPO)).toThrow(/outside the repository/);
    expect(assertScratchRoot(REPO, join(tmpdir(), "v2-scratch"))).toBe(join(tmpdir(), "v2-scratch"));
  });
});

describe("pngSize", () => {
  it("reads a PNG's width and height, and refuses anything else", () => {
    const head = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
    head.writeUInt32BE(13, 8);
    head.write("IHDR", 12, "latin1");
    head.writeUInt32BE(1280, 16);
    head.writeUInt32BE(720, 20);
    expect(pngSize(head)).toEqual({ w: 1280, h: 720 });
    expect(() => pngSize(Buffer.from("not a png at all, really not"))).toThrow(/not a PNG/);
  });
});

describe("renderSample refuses any split but TRAIN and DEV before touching the page", () => {
  it("throws for TEST, and for an unknown split, with no page call", async () => {
    const page = new Proxy({}, { get: () => () => { throw new Error("the page was touched"); } });
    await expect(renderSample(page, { split: "test" }, () => 0)).rejects.toThrow(/only train and dev/);
    await expect(renderSample(page, { split: "holdout" }, () => 0)).rejects.toThrow(/only train and dev/);
  });
});

describe("build-candidate refuses before planning or rendering", () => {
  const dir = mkdtempSync(join(tmpdir(), "v2-build-refusal-"));
  const run = (args) => {
    try {
      execFileSync(process.execPath, [BUILD, ...args], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, err: "" };
    } catch (e) {
      return { code: e.status, err: String(e.stderr) };
    }
  };
  const write = (name, cfg) => {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(cfg));
    return p;
  };
  const base = {
    counts: { train: 2, dev: 2 },
    schedule: { maxTargetsPerSample: 12, maxOverflowSamples: 0, positives: { train: {}, dev: {} }, occlusionCases: { train: {}, dev: {} } },
    expectedTotals: {},
    leakage: { elementIou: 0.5, layoutShare: 0.5 },
    gate: { requiredChecks: "REQUIRED_CHECKS_V2" },
  };

  it("a split other than TRAIN and DEV", () => {
    const r = run([`--config=${write("extra.json", { ...base, counts: { train: 2, dev: 2, holdout: 2 } })}`, `--scratch-out=${join(dir, "o1")}`]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/exactly train and dev/);
  });
  it("schedule totals that differ from the stated totals — a quota is never silently changed", () => {
    const cells = (v) => Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(BUCKET_IDS.map((b) => [b, typeof v === "function" ? v() : v]))]));
    const cfg = {
      ...base,
      schedule: { ...base.schedule, positives: { train: cells(1), dev: cells(1) }, occlusionCases: { train: cells(() => ({ partial: 0, full: 0 })), dev: cells(() => ({ partial: 0, full: 0 })) } },
      expectedTotals: { train: { positives: 33, occlusionPartial: 0, occlusionFull: 0, all: 33 }, dev: { positives: 32, occlusionPartial: 0, occlusionFull: 0, all: 32 } },
    };
    const r = run([`--config=${write("totals.json", cfg)}`, `--scratch-out=${join(dir, "o2")}`]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/schedule totals .* differ from the stated/);
  });
  it("no destination, or both destinations", () => {
    const cfgPath = join(REPO, "tools/dataset/v2/configs/m22.4-train-dev.json");
    expect(run([`--config=${cfgPath}`]).err).toMatch(/exactly one of/);
    expect(run([`--config=${cfgPath}`, "--candidate=1", `--scratch-out=${join(dir, "o3")}`]).err).toMatch(/exactly one of/);
  });
  it("a destination that already exists — a candidate is never overwritten", () => {
    const r = run([`--config=${join(REPO, "tools/dataset/v2/configs/m22.4-train-dev.json")}`, `--scratch-out=${dir}`]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/already exists/);
  });
});
