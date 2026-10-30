import { describe, expect, it } from "vitest";

import { percentile, resourcePeaks, stageTable, summarise } from "./bench-stats.mjs";

describe("nearest-rank percentiles", () => {
  it("returns an observed sample at rank ⌈p·n⌉", () => {
    const xs = [15, 20, 35, 40, 50];
    expect(percentile(xs, 50)).toBe(35); // ⌈2.5⌉ = 3rd
    expect(percentile(xs, 95)).toBe(50); // ⌈4.75⌉ = 5th
    expect(percentile(xs, 30)).toBe(20); // ⌈1.5⌉ = 2nd
    expect(percentile(xs, 100)).toBe(50);
  });

  it("sorts, and ignores what is not a measurement", () => {
    expect(percentile([3, "2", Number.NaN, 1, undefined, 2], 50)).toBe(2);
  });

  it("has no percentile for no samples — null, never 0", () => {
    expect(percentile([], 50)).toBeNull();
    expect(summarise([])).toEqual({ n: 0, p50: null, p95: null, min: null, max: null });
  });

  it("refuses a meaningless p", () => {
    expect(() => percentile([1], 0)).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });

  it("with 20 samples p95 is the 19th", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(19);
    expect(percentile(xs, 50)).toBe(10);
  });
});

describe("the stage table", () => {
  it("gives each stage its own n: a stage that did not run contributes no sample", () => {
    const table = stageTable([{ timings: { sendMs: 10, grantMs: 4 } }, { timings: { sendMs: 30 } }, { timings: { sendMs: 20 } }], ["sendMs", "grantMs", "actMs"]);
    expect(table.sendMs).toEqual({ n: 3, p50: 20, p95: 30, min: 10, max: 30 });
    expect(table.grantMs.n).toBe(1);
    expect(table.actMs).toEqual({ n: 0, p50: null, p95: null, min: null, max: null });
  });
});

describe("resource peaks", () => {
  const samples = [
    { tMs: 0, procs: [{ group: "browser", pid: 1, ws: 100, pv: 80, peakWs: 120, cpuMs: 0 }, { group: "browser", pid: 2, ws: 50, pv: 40, peakWs: 60, cpuMs: 0 }] },
    { tMs: 500, procs: [{ group: "browser", pid: 1, ws: 150, pv: 90, peakWs: 160, cpuMs: 250 }, { group: "browser", pid: 2, ws: 40, pv: 40, peakWs: 60, cpuMs: 250 }] },
    { tMs: 1000, procs: [{ group: "browser", pid: 1, ws: 110, pv: 85, peakWs: 160, cpuMs: 300 }, { group: "browser", pid: 3, ws: 70, pv: 60, peakWs: 70, cpuMs: 900 }] },
  ];

  it("reports the sampled peak sum, the sum of OS-recorded peaks, and peak busy cores", () => {
    const r = resourcePeaks(samples, ["browser", "model"]);
    expect(r.browser).toEqual({
      sampledPeakWorkingSetBytes: 190,
      sampledPeakPrivateBytes: 145,
      sumOfProcessPeakWorkingSetBytes: 160 + 60 + 70,
      processesSeen: 3,
      // 0→500 ms: 500 ms CPU over 500 ms = 1 core. 500→1000: pid 1 only (+50), pid 3 is new.
      peakCpuCoresBusy: 1,
    });
  });

  it("a group never seen has no figures, not zeros", () => {
    expect(resourcePeaks(samples, ["model"]).model).toEqual({
      sampledPeakWorkingSetBytes: null,
      sampledPeakPrivateBytes: null,
      sumOfProcessPeakWorkingSetBytes: null,
      processesSeen: 0,
      peakCpuCoresBusy: null,
    });
  });
});
