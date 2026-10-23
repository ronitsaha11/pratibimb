#!/usr/bin/env node
/**
 * M15 — A TWO-STEP TASK, IN THE REAL EXTENSION, PLANNED BY THE REAL LOCAL MODEL.
 *
 *   Chrome for Testing + the PRODUCT build of the extension
 *   → RUN_TASK { maxTurns: 3, postconditions } on a synthetic two-step page
 *   → every turn through the product pipeline (observe, sanitize, verify, reason, validate, refresh,
 *     act, verify result)
 *   → the reasoner is Qwen2.5-0.5B-Instruct Q4_K_M under llama.cpp b10956 on 127.0.0.1:8977, behind
 *     the project's recording front on 127.0.0.1:8995 (the product CSP's one connect-src endpoint).
 *
 * WHAT IS REAL: the browser, the extension build, the model, every gate. WHAT IS NOT A PERSON: the
 * harness answers any approval the run parks on (none is expected: the page holds no values).
 * NOTHING IS SCRIPTED: no plan is supplied, substituted or retried by this file. If the model proposes
 * something the gates refuse, that refusal is the result.
 *
 * The page is click-only and synthetic (`fixture/two-step.html`):
 *   #confirm-slot → its name becomes "Slot confirmed", and #book is enabled
 *   #book         → it becomes disabled
 * and the task declares exactly those as its postconditions. Several independent runs are made, each
 * on a fresh document, so the result says something about how reliably this small model plans, not
 * only whether it can.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M15_RUNS=3] node tests/browser/extension/run-two-step-task.mjs
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus, release as osRelease, tmpdir } from "node:os";

import { ROOT, startDemoServer } from "../demo/server.mjs";
import { startReasonerService } from "../demo/reasoner-service.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";

const WS = resolveWorkstation();
const APP = join(ROOT, "apps", "extension");
const EXT = join(APP, ".output", "chrome-mv3");
const OUT = join(ROOT, "artifacts", "experiments", "M15-two-step-task", "logs");
const RUNS = Number(process.env.M15_RUNS ?? 3);
const REASONER_PORT = 8995;
const REASONER_URL = `http://127.0.0.1:${REASONER_PORT}/v1/chat/completions`;
/**
 * The task. `two-step` (default) is M15's demonstration. `application` drives the M2 application page
 * through the same harness — used to diagnose a regression, and written under its own record name.
 */
const TASK = process.env.M15_TASK ?? "two-step";
const TASKS = {
  "two-step": {
    path: "/two-step/",
    fixture: ["tests", "browser", "extension", "fixture", "two-step.html"],
    goal: "Confirm the slot, then book it.",
    maxTurns: 3,
    postconditions: { "#confirm-slot": { kind: "TARGET_NAME", expected: "Slot confirmed" }, "#book": { kind: "TARGET_ENABLED", expected: false } },
    record: "cft-two-step-task.json",
  },
  application: {
    path: "/fixture/",
    fixture: ["tests", "browser", "demo", "fixture", "application.html"],
    goal: "Submit my application with my registered mobile number.",
    maxTurns: 2,
    postconditions: { "#submit": { kind: "TARGET_ENABLED", expected: false } },
    record: "cft-application-task.json",
  },
};
if (!TASKS[TASK]) refuse(`unknown M15_TASK ${TASK}`);
const { goal: GOAL, maxTurns: MAX_TURNS, postconditions: POSTCONDITIONS } = TASKS[TASK];
const FIXTURE = join(ROOT, ...TASKS[TASK].fixture);
const MODEL = JSON.parse(readFileSync(join(ROOT, "models", "qwen2.5-0.5b-instruct-gguf", "acquisition.json"), "utf8"));

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const weights = join(ROOT, MODEL.weights.path);
if (!existsSync(weights) || sha(weights) !== MODEL.weights.sha256) refuse(`the model on disk is not the pinned ${MODEL.model.file}`);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, TASKS[TASK].record)), WS);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));

let context = null;
let service = null;
let stopServer = null;
let failure = null;
const runs = [];
try {
  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));
  service = await startReasonerService({ mode: "forward", port: REASONER_PORT });
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-m15-")), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  const browserVersion = context.browser()?.version() ?? null;
  const page = await context.newPage();

  for (let n = 1; n <= RUNS; n++) {
    const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
    await page.goto(`${origin}${TASKS[TASK].path}`, { waitUntil: "load" });
    let identity = null;
    for (let i = 0; i < 40 && !identity; i++) {
      identity = await worker.evaluate((before) => (globalThis.__host.hellos.length > before ? [...globalThis.__host.hellos].reverse()[0].identity : null), hellos);
      if (!identity) await wait(250);
    }
    if (!identity) throw new Error("the content script never attested the two-step page");
    const capturesBefore = service.captures.length;
    const request = {
      tabId: identity.tabId,
      frameId: identity.frameId,
      goal: GOAL,
      act: "SUCCESS",
      endpoint: REASONER_URL,
      sessionId: `m15-session-${n}`,
      requestId: `m15-request-${n}`,
      maxTurns: MAX_TURNS,
      postconditions: POSTCONDITIONS,
    };
    await worker.evaluate((req) => {
      globalThis.__m15 = null;
      globalThis.__m15error = null;
      void globalThis.__host.runTask(req).then((r) => (globalThis.__m15 = r), (e) => (globalThis.__m15error = String(e)));
      return true;
    }, request);
    let settled = null;
    let grantsAnswered = 0;
    for (let tick = 0; tick < 1200 && !settled; tick++) {
      const s = await worker.evaluate(async () => ({ done: globalThis.__m15 !== null || globalThis.__m15error !== null, grant: await globalThis.__host.grantPeek() }));
      if (s.grant?.pending) {
        grantsAnswered += 1;
        await worker.evaluate(() => globalThis.__host.grantDecide(true));
      }
      if (s.done) settled = await worker.evaluate(() => ({ result: globalThis.__m15, error: globalThis.__m15error }));
      else await wait(250);
    }
    const truth = TASK !== "two-step" ? await page.evaluate(() => ({ status: document.getElementById("status")?.textContent ?? null, submitDisabled: document.getElementById("submit")?.disabled ?? null })) : await page.evaluate(() => ({
      confirmName: document.getElementById("confirm-slot")?.textContent ?? null,
      bookDisabled: document.getElementById("book")?.disabled ?? null,
      stage: document.getElementById("status")?.dataset.stage ?? null,
      status: document.getElementById("status")?.textContent ?? null,
      clicks: window.__clicks ?? null,
    }));
    // `__host.runTask` resolves to the offscreen reply: `{ ok: true, result }` or `{ ok: false, refused }`.
    const reply = settled?.result ?? null;
    const result = reply?.ok === true ? reply.result : null;
    const loop = result?.loop ?? null;
    // What the model was actually asked and what it actually answered, from the recording front.
    // The model's answers are in each turn's record (`plan`, from the parser); the front records the
    // requests: when, how big, and whether the server-side PII tripwire saw anything value-shaped.
    const exchanges = service.captures.slice(capturesBefore).map((c) => ({ at: c.at, receivedBytes: c.receivedBytes, receivedSha256: c.receivedSha256, tripwire: c.tripwire, modelContent: c.modelContent ?? null }));
    runs.push({
      run: n,
      error: settled?.error ?? (settled ? (reply?.ok === false ? `REFUSED: ${reply.refused}` : null) : "TIMED_OUT"),
      grantsAnswered,
      outcome: loop?.outcome ?? null,
      confirmedActions: loop?.confirmedActions ?? null,
      turns: (loop?.turns ?? []).map((t, i) => ({
        turn: i + 1,
        requestId: t.requestId,
        state: t.state,
        refusal: t.refusal ? { stage: t.refusal.stage, cause: t.refusal.cause } : null,
        reasonerKind: t.reasonerKind,
        fallback: t.fallback,
        modelResponded: t.response?.received ?? null,
        plan: t.plan?.steps ?? null,
        postcondition: t.postcondition,
        acted: t.act?.reached ?? null,
        verification: t.act?.verification ?? null,
        declaredDone: t.declaredDone,
        observedFrame: t.initialObservation?.frameId ?? null,
        afterFrame: t.observation?.frameId ?? null,
        actionableAtStart: t.initialObservation?.actionable ?? null,
      })),
      modelRequests: exchanges.length,
      // The model's raw answers, in order, exactly as llama-server returned them — before any gate.
      modelProposals: exchanges.map((e) => e.modelContent),
      modelRequestTripwire: exchanges.map((e) => e.tripwire),
      egress: (result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination, bytes: e.record.bytes } : { sent: false, cause: e.refusal?.cause ?? null })),
      page: truth,
    });
    console.log(`>>> RUN ${n}/${RUNS}: ${loop?.outcome ?? settled?.error} — turns ${runs.at(-1).turns.map((t) => `${t.plan ? t.plan.map((s) => (s.op === "done" ? "done" : `${s.op} ${s.target}`)).join("+") : "∅"}→${t.verification?.verification ?? t.refusal?.cause ?? (t.declaredDone ? "DECLARED_DONE" : t.state)}`).join(" | ")} — page stage ${truth.stage}, clicks ${JSON.stringify(truth.clicks)}`);
  }
  runs.browserVersion = browserVersion;
} catch (e) {
  failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
  console.log(`>>> FAILED: ${failure}`);
} finally {
  if (service) await service.stop().catch(() => {});
  if (context) await context.close();
  if (typeof stopServer === "function") await stopServer();
}

// ── what each run may claim, judged from the page and the record, never from the model ──────────
const judge = (r) => {
  const t = r.turns;
  const confirmed = (x, kind) => x?.verification?.verification === "CONFIRMED" && x.verification.postcondition === kind;
  return {
    stayedWithinBudget: t.length >= 1 && t.length <= MAX_TURNS,
    everyTurnFromTheLocalModel: t.every((x) => x.reasonerKind === "LOCAL_MODEL" && x.modelResponded === true),
    // The front's own PII tripwire: classes of value-shaped text in what the model received. Empty = none.
    noValueShapedTextReachedTheModel: r.modelRequestTripwire.every((w) => Array.isArray(w) && w.length === 0),
    firstStepConfirmedByThePage: confirmed(t[0], "TARGET_NAME") && r.page.clicks?.["confirm-slot"] >= 1,
    secondStepFromAFreshObservation: t.length >= 2 && t[1].observedFrame !== t[0].observedFrame && t[1].actionableAtStart?.includes("#book") === true && t[0].actionableAtStart?.includes("#book") === false,
    secondStepConfirmedByThePage: confirmed(t[1], "TARGET_ENABLED") && r.page.stage === "2",
    loopStoppedOnASupportedOutcome: ["COMPLETED_AS_DECLARED", "STOPPED_REFUSED", "STOPPED_UNVERIFIED", "STOPPED_NO_PROGRESS", "STOPPED_TURN_BUDGET", "STOPPED_SINGLE_TURN_PLANNER"].includes(r.outcome),
    onlyAuthorisedClicks: (r.page.clicks?.["confirm-slot"] ?? 0) <= 1 && (r.page.clicks?.book ?? 0) <= 1,
    allEgressLoopbackReasoner: r.egress.every((e) => !e.sent || e.destination === REASONER_URL),
  };
};
for (const r of runs) r.judged = judge(r);
const completedTwoSteps = runs.filter((r) => r.judged.firstStepConfirmedByThePage && r.judged.secondStepConfirmedByThePage).length;
const record = {
  experiment: "M15 — two-step task in the real extension, planned by the real local model (not a J7 experiment)",
  notAJ7Experiment: true,
  goal: GOAL,
  task: TASK,
  fixture: { path: TASKS[TASK].fixture.join("/"), sha256: sha(FIXTURE) },
  maxTurns: MAX_TURNS,
  postconditions: POSTCONDITIONS,
  runsRequested: RUNS,
  runsCompleted: runs.length,
  runsCompletingBothSteps: completedTwoSteps,
  failure,
  model: { repo: MODEL.model.repo, revision: MODEL.model.revision, file: MODEL.model.file, sha256: MODEL.weights.sha256, runtime: `llama.cpp ${MODEL.runtime.build}` },
  build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
  browser: { binary: executablePath, version: runs.browserVersion ?? null },
  runs,
  notAClaim: [
    "a handful of runs of one synthetic page; no claim about other pages, longer tasks or the model's reliability beyond these runs",
    "perception ran the product's no-gesture DOM floor; no frame was captured and none left the client",
    "the harness answered approvals on the operator's behalf (none was expected: the page holds no values)",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, headless: false },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
console.log(`\nM15 two-step task: ${completedTwoSteps}/${runs.length} runs completed both steps, each confirmed by the page${failure ? ` — FAILURE: ${failure}` : ""}`);
console.log(`written: ${TARGET}`);
process.exit(failure ? 1 : 0);
