/**
 * M20 — the benchmark's arithmetic, and nothing else.
 *
 * PERCENTILE METHOD: nearest rank. For n sorted samples, the p-th percentile is the sample at
 * 1-based rank ⌈p/100 · n⌉. It always returns an observed sample — never an interpolated value no
 * run produced — and with few samples p95 is simply the largest or second largest, which the report
 * states alongside n. An empty set has no percentile (`null`), never 0.
 */

export function percentile(samples, p) {
  if (!(p > 0 && p <= 100)) throw new Error(`percentile: p must be in (0, 100], got ${p}`);
  const xs = samples.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  return xs[Math.ceil((p / 100) * xs.length) - 1];
}

/** n, p50, p95, min and max of a set of measurements; `null` statistics for an empty set. */
export function summarise(samples) {
  const xs = samples.filter((x) => typeof x === "number" && Number.isFinite(x));
  return {
    n: xs.length,
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
  };
}

/**
 * Per-stage statistics over turns. A turn in which a stage did not run contributes no sample to it
 * (absent is not 0), so each stage reports its own n.
 */
export function stageTable(turns, stages) {
  return Object.fromEntries(stages.map((key) => [key, summarise(turns.map((t) => t.timings?.[key]).filter((v) => v !== undefined))]));
}

/**
 * Resource samples → peaks. Each sample is `{ tMs, procs: [{ group, pid, ws, pv, peakWs, cpuMs }] }`
 * from the OS. Peak working set is reported two ways: the largest sampled sum (what was observed at
 * one instant) and the sum of each process's OS-recorded peak (an upper bound — the processes need
 * not have peaked together). CPU is busy core-time per wall time between consecutive samples.
 */
export function resourcePeaks(samples, groups) {
  const out = {};
  for (const group of groups) {
    let sampledPeakWs = null;
    let sampledPeakPrivate = null;
    const osPeak = new Map();
    let peakCores = null;
    for (const [i, s] of samples.entries()) {
      const procs = s.procs.filter((p) => p.group === group);
      if (procs.length === 0) continue;
      const ws = procs.reduce((a, p) => a + p.ws, 0);
      const pv = procs.reduce((a, p) => a + p.pv, 0);
      sampledPeakWs = Math.max(sampledPeakWs ?? 0, ws);
      sampledPeakPrivate = Math.max(sampledPeakPrivate ?? 0, pv);
      for (const p of procs) osPeak.set(p.pid, Math.max(osPeak.get(p.pid) ?? 0, p.peakWs));
      const prev = samples[i - 1];
      if (prev) {
        const dt = s.tMs - prev.tMs;
        // CPU time of processes present in both samples only: a process that started or ended
        // between them has no delta to report.
        const before = new Map(prev.procs.filter((p) => p.group === group).map((p) => [p.pid, p.cpuMs]));
        const busy = procs.reduce((a, p) => (before.has(p.pid) ? a + Math.max(0, p.cpuMs - before.get(p.pid)) : a), 0);
        if (dt > 0) peakCores = Math.max(peakCores ?? 0, busy / dt);
      }
    }
    out[group] = {
      sampledPeakWorkingSetBytes: sampledPeakWs,
      sampledPeakPrivateBytes: sampledPeakPrivate,
      sumOfProcessPeakWorkingSetBytes: osPeak.size ? [...osPeak.values()].reduce((a, b) => a + b, 0) : null,
      processesSeen: osPeak.size,
      peakCpuCoresBusy: peakCores === null ? null : Math.round(peakCores * 1000) / 1000,
    };
  }
  return out;
}
