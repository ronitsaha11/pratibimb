#!/usr/bin/env node
/**
 * M20 — THE W1 PRODUCT BENCHMARK. Measured, on this machine, of the product as it ships today.
 *
 *   product launcher (`scripts/reasoner/reasoner.mjs`, started here as a child, cold)
 *   + Chrome for Testing with the PRODUCT build of the extension
 *   → a workload of bounded multi-turn tasks through the control plane, alternating the M2
 *     application page (maxTurns 2) and the M15 two-step page (maxTurns 3), each on a fresh document
 *   → every turn's own stage timings (`RunRecord.timings`, monotonic clock), the OS's counters for
 *     every process under test, the offscreen document's and service worker's JS heap, the network
 *     requests the offscreen document made, and sizes on disk.
 *
 * THE TEN-STEP QUESTION. The benchmark contract measures client resources "over a ten-step task". A
 * step is one pipeline pass (one turn), and a task may take at most `MAX_TASK_TURNS` = 5 turns. This
 * harness does NOT raise that cap: it runs several bounded tasks back to back and counts turns until
 * at least ten have been measured, and the record says so (`workload.tenStepNote`).
 *
 * WHO ANSWERS APPROVALS. The application task restores a stored value, which needs an approval. This
 * is a measurement of the machine, not a person: the harness answers through the control plane's
 * existing grant path (as the M15 harness does), and the record says so. That wait is reported as
 * its own stage and subtracted from the machine figures; it is not a person's time and is never
 * presented as one.
 *
 * WHAT IS NOT RECORDED: a stored value, a preview, page text, a prompt, a model output. The record is
 * checked for every synthetic value before it is written, and an existing record is never replaced.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [BENCH_RUNS_PER_TASK=3] node tests/browser/extension/run-product-benchmark.mjs
 * (Stop any `npm run reasoner` first: this harness starts its own, cold, and refuses a busy port.)
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { cpus, release as osRelease, tmpdir, totalmem } from "node:os";
import { createInterface } from "node:readline";

import { ROOT, startDemoServer } from "../demo/server.mjs";
import { Cdp } from "../support/cdp-offscreen.mjs";
import { resourcePeaks, stageTable, summarise } from "../support/bench-stats.mjs";
import { createTimeline, leaksIn, projectTurn, runIdOf, writeNewRecord } from "../support/smoke-record.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const WS = resolveWorkstation();
const PIN = JSON.parse(readFileSync(join(ROOT, "scripts", "reasoner", "pin.json"), "utf8"));
const ENDPOINT = `http://${PIN.endpoint.host}:${PIN.endpoint.port}${PIN.endpoint.path}`;
const APP = join(ROOT, "apps", "extension");
const EXT = join(APP, ".output", "chrome-mv3");
const OUT = join(ROOT, "artifacts", "benchmarks", "M20-w1-product");
const RUNS_PER_TASK = Number(process.env.BENCH_RUNS_PER_TASK ?? 3);
const CDP_PORT = 9347;
const MAX_TASK_TURNS = 5; // packages/orchestrator: the cap this harness does not raise.
const FIXTURE_VALUES = ["9000000001", "9000000002", "Ramesh Kumar", "2345 6789 0124", "234567890124", "1998-04-12", "482913", "90••••••01"];
const TASKS = {
  application: {
    path: "/fixture/",
    goal: "Submit my application with my registered mobile number.",
    maxTurns: 2,
    postconditions: { "#submit": { kind: "TARGET_ENABLED", expected: false } },
  },
  "two-step": {
    path: "/two-step/",
    goal: "Confirm the slot, then book it.",
    maxTurns: 3,
    postconditions: { "#confirm-slot": { kind: "TARGET_NAME", expected: "Slot confirmed" }, "#book": { kind: "TARGET_ENABLED", expected: false } },
  },
};
const STAGES = ["observeMs", "sanitizeMs", "verifyPayloadMs", "clarifyMs", "sendMs", "fallbackMs", "validatePlanMs", "grantMs", "rehydrateMs", "refreshMs", "structureMs", "actMs", "verifyResultMs", "totalMs"];

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");
if (!(RUNS_PER_TASK >= 1 && RUNS_PER_TASK <= 20)) refuse("BENCH_RUNS_PER_TASK must be 1…20");

const startedAt = new Date();
const RUN_ID = runIdOf(startedAt);
mkdirSync(OUT, { recursive: true });
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `cft-product-benchmark-${RUN_ID}.json`)), WS);
const RESOURCES = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `cft-product-benchmark-${RUN_ID}.resources.json`)), WS);
for (const f of [TARGET, RESOURCES]) if (existsSync(f)) refuse(`${basename(f)} exists; history is never overwritten`);
const line = createTimeline();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const mono = () => performance.now();
const dirBytes = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);

// ── BUILD ─────────────────────────────────────────────────────────────────────────────────────
console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
line.mark("EXTENSION_BUILT");

let launcher = null;
let ready = null;
let sampler = null;
let context = null;
let cdp = null;
let stopServer = null;
let failure = null;
let browserVersion = null;
const samples = [];
const heap = { offscreen: [], serviceWorker: [] };
const tasks = [];
let shutdownReport = null;
let launcherWallMs = null;
let browserReadyMs = null;

try {
  // ── THE LAUNCHER, COLD ──────────────────────────────────────────────────────────────────────
  const launchBegan = mono();
  launcher = spawn(process.execPath, [join(ROOT, "scripts", "reasoner", "reasoner.mjs")], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const lines = [];
  ready = await new Promise((ok, fail) => {
    const rl = createInterface({ input: launcher.stdout });
    rl.on("line", (l) => {
      lines.push(l.replace(/sha256 [0-9a-f]+…/, "sha256 …"));
      if (l.startsWith("PRATIBIMB_REASONER_READY ")) ok(JSON.parse(l.slice("PRATIBIMB_REASONER_READY ".length)));
    });
    launcher.stderr.on("data", (d) => lines.push(String(d).trim()));
    launcher.once("exit", (code) => fail(new Error(`the launcher exited (code ${code}) before it was ready: ${lines.filter((x) => x.includes("REFUSING") || x.includes("FAILED")).join(" ") || "no reason printed"}`)));
    setTimeout(() => fail(new Error("the launcher did not become ready in 180 s")), 180_000);
  });
  launcherWallMs = Math.round((mono() - launchBegan) * 100) / 100;
  line.mark("REASONER_READY");

  // ── THE SAMPLER ─────────────────────────────────────────────────────────────────────────────
  // `resolve`: the OS reports image paths with backslashes, and a forward-slash CHROME_PATH matched no
  // browser process at all (found in run 20261023T203123Z, whose record says so).
  sampler = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, "tests", "browser", "support", "proc-sampler.ps1"), resolve(executablePath), String(ready.serverPid), String(ready.launcherPid)], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  createInterface({ input: sampler.stdout }).on("line", (l) => {
    try {
      const s = JSON.parse(l);
      samples.push({ tMs: s.tMs, procs: (Array.isArray(s.procs) ? s.procs : [s.procs]).filter(Boolean) });
    } catch {
      /* a partial line */
    }
  });

  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));

  // ── THE BROWSER, COLD ───────────────────────────────────────────────────────────────────────
  const browserBegan = mono();
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-bench-")), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    args: [`--remote-debugging-port=${CDP_PORT}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserReadyMs = Math.round((mono() - browserBegan) * 100) / 100;
  browserVersion = context.browser()?.version() ?? null;
  line.mark("BROWSER_READY");

  cdp = await Cdp.connect(CDP_PORT);
  const offscreen = await cdp.attach((t) => t.url.includes("offscreen"));
  const sw = await cdp.attach((t) => t.type === "service_worker" && t.url.startsWith("chrome-extension://"));
  if (!offscreen) throw new Error("the offscreen document was not found over CDP");
  const network = await cdp.recordNetwork(offscreen.sessionId);
  let sampling = true;
  void (async () => {
    while (sampling) {
      const tMs = Math.round((mono() - browserBegan) * 10) / 10;
      for (const [key, target] of [["offscreen", offscreen], ["serviceWorker", sw]]) {
        if (!target) continue;
        try {
          const h = await cdp.send("Runtime.getHeapUsage", {}, target.sessionId);
          heap[key].push({ tMs, usedBytes: h.usedSize, totalBytes: h.totalSize });
        } catch {
          /* the target may be restarting; the gap is visible in the samples */
        }
      }
      await wait(500);
    }
  })();

  const page = await context.newPage();
  const order = [];
  for (let i = 0; i < RUNS_PER_TASK; i++) order.push("application", "two-step");
  for (const [n, name] of order.entries()) {
    const task = TASKS[name];
    const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
    await page.goto(`${origin}${task.path}`, { waitUntil: "load" });
    let identity = null;
    for (let i = 0; i < 80 && !identity; i++) {
      identity = await worker.evaluate((before) => (globalThis.__host.hellos.length > before ? [...globalThis.__host.hellos].reverse()[0].identity : null), hellos);
      if (!identity) await wait(125);
    }
    if (!identity) throw new Error(`the content script never attested ${task.path}`);
    const requestsBefore = network.all().length;
    const request = {
      tabId: identity.tabId,
      frameId: identity.frameId,
      goal: task.goal,
      act: "SUCCESS",
      endpoint: ENDPOINT,
      sessionId: `m20-bench-session-${n + 1}`,
      requestId: `m20-bench-request-${n + 1}`,
      maxTurns: task.maxTurns,
      postconditions: task.postconditions,
    };
    line.mark("TASK_STARTED", `${n + 1}`);
    const began = mono();
    await worker.evaluate((req) => {
      globalThis.__m20 = null;
      globalThis.__m20error = null;
      void globalThis.__host.runTask(req).then((r) => (globalThis.__m20 = r), (e) => (globalThis.__m20error = String(e)));
      return true;
    }, request);
    let settled = null;
    let approvalsAnsweredByHarness = 0;
    for (let tick = 0; tick < 6000 && !settled; tick++) {
      const s = await worker.evaluate(async () => ({ done: globalThis.__m20 !== null || globalThis.__m20error !== null, grant: await globalThis.__host.grantPeek() }));
      if (s.grant?.pending) {
        approvalsAnsweredByHarness += 1;
        await worker.evaluate(() => globalThis.__host.grantDecide(true));
      }
      if (s.done) settled = await worker.evaluate(() => ({ result: globalThis.__m20, error: globalThis.__m20error }));
      else await wait(20);
    }
    const harnessWallMs = Math.round((mono() - began) * 100) / 100;
    const reply = settled?.result ?? null;
    const result = reply?.ok === true ? reply.result : null;
    const loop = result?.loop ?? null;
    const turns = (loop?.turns ?? []).map(projectTurn);
    const endpointRequests = network.since(requestsBefore).filter((r) => r.url === ENDPOINT && r.method === "POST");
    const perception = result?.ports?.perception ?? [];
    tasks.push({
      run: n + 1,
      task: name,
      start: n === 0 ? "COLD" : "WARM",
      error: settled?.error ?? (settled ? (reply?.ok === false ? `REFUSED: ${reply.refused}` : null) : "TIMED_OUT"),
      outcome: loop?.outcome ?? null,
      confirmedActions: loop?.confirmedActions ?? null,
      maxTurns: task.maxTurns,
      approvalsAnsweredByHarness,
      harnessWallMs,
      turns,
      network: {
        endpointRequests: endpointRequests.length,
        endpointRequestsFinished: endpointRequests.filter((r) => r.outcome === "FINISHED").length,
        otherRequests: network.since(requestsBefore).length - endpointRequests.length,
        // Where the rest went, by origin only (no path, no body): an extension's own resources are
        // not egress, and the record should say which they were rather than leave a bare count.
        otherRequestOrigins: [...new Set(network.since(requestsBefore).filter((r) => !(r.url === ENDPOINT && r.method === "POST")).map((r) => {
          try {
            const u = new URL(r.url);
            return u.protocol === "chrome-extension:" ? "chrome-extension://(this extension)" : u.origin;
          } catch {
            return "UNPARSEABLE";
          }
        }))],
      },
      tiers: {
        observations: result?.ports?.observations ?? null,
        structureReads: result?.ports?.structureReads ?? null,
        visualPerceptionPasses: perception.length,
        visualPerceptionRan: perception.filter((p) => p.ran).length,
        detectorRan: perception.filter((p) => p.detector?.ran).length,
        visualRefusals: [...new Set(perception.filter((p) => !p.ran).map((p) => p.refusal?.code ?? "UNKNOWN"))],
      },
    });
    const t = tasks.at(-1);
    line.mark("TASK_FINISHED", `${n + 1}`);
    console.log(`>>> ${n + 1}/${order.length} ${name} (${t.start}): ${t.outcome ?? t.error} — ${t.turns.length} turn(s), ${t.network.endpointRequests} model request(s), ${harnessWallMs} ms`);
  }
  sampling = false;
  await wait(600);
} catch (e) {
  failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
  console.log(`>>> FAILED: ${failure}`);
} finally {
  if (cdp) cdp.close();
  if (context) await context.close().catch(() => {});
  if (typeof stopServer === "function") await stopServer().catch(() => {});
  if (sampler && sampler.exitCode === null) sampler.kill();
  // The launcher's own stop: it checks each recorded process is still the one it started, stops the
  // model first, then the launcher. A child.kill() on Windows would end the launcher only.
  if (launcher) {
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts", "reasoner", "reasoner.mjs"), "--stop"], { cwd: ROOT, encoding: "utf8" });
    } catch {
      /* reported below */
    }
    await wait(1500);
    const alive = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    shutdownReport = ready ? { modelProcessLeftRunning: alive(ready.serverPid), launcherLeftRunning: alive(ready.launcherPid) } : null;
  }
  line.mark("SHUTDOWN");
}

// ── THE RECORD ─────────────────────────────────────────────────────────────────────────────────
const allTurns = tasks.flatMap((t) => t.turns.map((turn) => ({ ...turn, task: t.task, start: t.start, run: t.run })));
const machineMs = (turn) => (typeof turn.timings.totalMs === "number" ? Math.round((turn.timings.totalMs - (turn.timings.grantMs ?? 0) - (turn.timings.clarifyMs ?? 0)) * 100) / 100 : undefined);
const withMachine = allTurns.map((t) => ({ ...t, timings: { ...t.timings, machineMs: machineMs(t) } }));
const STAGES_PLUS = [...STAGES, "machineMs"];
const coldTurn = withMachine.filter((t) => t.start === "COLD").slice(0, 1);
const warmTurns = withMachine.filter((t) => !(t.start === "COLD" && t.turn === 1));
const succeededTasks = tasks.filter((t) => t.outcome === "COMPLETED_AS_DECLARED").length;
const stepsMeasured = allTurns.length;
const networkFreeSteps = tasks.reduce((a, t) => a + Math.max(0, t.turns.length - t.network.endpointRequests), 0);
const groups = ["browser", "model", "launcher"];
const resources = resourcePeaks(samples, groups);
const heapPeak = (xs) => (xs.length ? Math.max(...xs.map((h) => h.usedBytes)) : null);
const runtimeDir = join(ROOT, PIN.runtime.dir);

const record = {
  benchmark: "M20 — W1 product benchmark: the shipped path (product launcher + product extension build), measured",
  runId: RUN_ID,
  verdict: failure === null && tasks.length === RUNS_PER_TASK * 2 ? "COMPLETE" : "INCOMPLETE",
  failure,
  labels: {
    measured: "read from a clock or an OS/browser counter during this run, on this machine",
    derived: "arithmetic on measured figures in this record (named in each field)",
    projected: "none in this record: the contract's projected budgets (benchmark-contract.md Rule 5) describe a different architecture (a server VLM over redacted frames) and are not compared here",
  },
  environment: {
    machine: WS.id,
    os: `${process.platform} ${osRelease()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
    browser: { binary: basename(executablePath), version: browserVersion, headed: true },
    extension: { build: "product (no evidence flags)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
    reasoner: { backend: `llama.cpp ${PIN.runtime.build} CPU (x64), ${PIN.upstream.args.join(" ")}`, model: `${PIN.model.repo} ${PIN.model.file} @ ${PIN.model.revision.slice(0, 12)}`, sha256: PIN.model.sha256, endpoint: ENDPOINT },
    perception: "DOM/text structure only in this workload: the product build captures no frame without the person's toolbar gesture (ADR-0009), and this harness makes none",
    node: process.version,
    date: startedAt.toISOString(),
  },
  workload: {
    tasks: Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, { path: v.path, maxTurns: v.maxTurns }])),
    order: tasks.map((t) => t.task),
    runsPerTask: RUNS_PER_TASK,
    stepsMeasured,
    tenStepNote: `A step is one pipeline pass (one turn). A single task is capped at MAX_TASK_TURNS = ${MAX_TASK_TURNS} and that cap is not raised here; the contract's "ten-step task" is met as ${tasks.length} bounded tasks run back to back in one browser and one model process, ${stepsMeasured} steps in all.`,
    approvals: "answered by this harness through the control plane's grant path, not by a person; the wait is reported as grantMs and excluded from machineMs",
  },
  outcomes: {
    label: "measured",
    tasks: tasks.length,
    completedAsDeclared: succeededTasks,
    byOutcome: tasks.reduce((a, t) => ({ ...a, [t.outcome ?? t.error ?? "NONE"]: (a[t.outcome ?? t.error ?? "NONE"] ?? 0) + 1 }), {}),
    note: "every task is included in the latency tables whatever its outcome; a failed or refused turn contributes the stages it reached",
  },
  latency: {
    label: "measured (stage timings: RunRecord.timings, monotonic clock in the offscreen document); machineMs is derived = totalMs − grantMs − clarifyMs",
    percentileMethod: "nearest rank: the sample at 1-based rank ⌈p/100 · n⌉ of the n sorted samples; n is given per stage; a stage with no samples is null",
    coldFirstStep: { note: "the first step after the launcher and the browser started: first model inference, first extension run", stages: stageTable(coldTurn, STAGES_PLUS) },
    warmSteps: { note: "every other step", stages: stageTable(warmTurns, STAGES_PLUS) },
    byTask: Object.fromEntries(Object.keys(TASKS).map((k) => [k, stageTable(warmTurns.filter((t) => t.task === k), STAGES_PLUS)])),
    taskWallMs: { label: "measured by the harness around each control-plane task, including messaging and approval polling", warm: summarise(tasks.filter((t) => t.start === "WARM").map((t) => t.harnessWallMs)), cold: summarise(tasks.filter((t) => t.start === "COLD").map((t) => t.harnessWallMs)) },
    networkFreeSteps: { label: "derived: steps minus POSTs to the reasoner endpoint seen by CDP in the offscreen document", value: networkFreeSteps, ofSteps: stepsMeasured },
    cacheHitRate: { label: "not applicable", value: null, note: "no screen-state cache exists in this build" },
  },
  coldStart: {
    label: "measured",
    launcher: { ...ready?.coldStart, wallMsUntilReady: launcherWallMs, note: "verifyMs: full SHA-256 of weights and runtime; modelLoadMs: llama-server spawn to healthy. The OS file cache may already hold the weights: this is a cold PROCESS start, not a cold disk." },
    browserUntilOffscreenReadyMs: browserReadyMs,
  },
  resources: {
    label: "measured (OS counters via Get-Process, every ~500 ms; JS heap via CDP Runtime.getHeapUsage, every ~500 ms); peaks are the largest sample unless named otherwise",
    samples: samples.length,
    processes: resources,
    jsHeapPeakUsedBytes: { offscreenDocument: heapPeak(heap.offscreen), serviceWorker: heapPeak(heap.serviceWorker), samples: heap.offscreen.length + heap.serviceWorker.length },
    gpuMemory: { label: "not measured", note: "no GPU backend is in this path: the model runs on llama.cpp's CPU build and no ONNX/WebGPU session is created in this workload" },
    rawSamplesFile: basename(RESOURCES),
  },
  disk: {
    label: "measured (bytes on disk)",
    modelWeights: statSync(join(ROOT, PIN.model.path)).size,
    runtimeInstalled: existsSync(runtimeDir) ? dirBytes(runtimeDir) : null,
    runtimeArchive: statSync(join(ROOT, PIN.runtime.zip)).size,
    extensionBuild: dirBytes(EXT),
  },
  tierFiring: {
    label: "measured (counts from the extension's own port report)",
    domStructureObservations: tasks.reduce((a, t) => a + (t.tiers.observations ?? 0), 0),
    structureReads: tasks.reduce((a, t) => a + (t.tiers.structureReads ?? 0), 0),
    visualPerceptionPasses: tasks.reduce((a, t) => a + t.tiers.visualPerceptionPasses, 0),
    visualPerceptionRan: tasks.reduce((a, t) => a + t.tiers.visualPerceptionRan, 0),
    detectorRan: tasks.reduce((a, t) => a + t.tiers.detectorRan, 0),
  },
  shutdown: shutdownReport,
  timeline: { clock: "monotonic, ms since the harness started", events: line.events },
  rawSamples: { label: "measured", turns: withMachine, tasks: tasks.map(({ turns, ...rest }) => rest) },
  notAClaim: [
    "one machine, one browser, one backend, synthetic pages; a small number of runs — no reliability rate, no cross-machine claim",
    "not a J7 experiment and not a privacy-metric run; J7/B5 remain open",
  ],
  provenance: { ...provenanceOf(WS), recordedAt: new Date().toISOString() },
};
const resourceRecord = { runId: RUN_ID, label: "measured", clock: "PowerShell Stopwatch, ms since the sampler started", groups, samples, jsHeap: { clock: "ms since the browser launch began", ...heap } };

if (leaksIn([record, resourceRecord], FIXTURE_VALUES).length > 0) refuse("the record would contain a stored value or its preview; nothing written");
writeNewRecord(TARGET, record);
writeNewRecord(RESOURCES, resourceRecord);
const fmt = (s) => (s.n === 0 ? "n=0" : `p50 ${s.p50} / p95 ${s.p95} ms (n=${s.n})`);
console.log(`\n${record.verdict}: ${tasks.length} tasks, ${stepsMeasured} steps, ${succeededTasks} completed as declared`);
for (const k of ["observeMs", "sendMs", "validatePlanMs", "actMs", "machineMs", "totalMs"]) console.log(`  warm ${k.padEnd(15)} ${fmt(record.latency.warmSteps.stages[k])}`);
console.log(`  shutdown: ${JSON.stringify(shutdownReport)}`);
console.log(`written: ${TARGET}\n         ${RESOURCES}`);
process.exit(record.verdict === "COMPLETE" ? 0 : 1);
