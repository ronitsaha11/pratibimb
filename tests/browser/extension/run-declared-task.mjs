#!/usr/bin/env node
/**
 * M18 — A TASK AND WHAT EACH CLICK MUST DO, STATED IN THE EXTENSION'S PANEL, PLANNED BY THE REAL
 * LOCAL MODEL, AND VERIFIED BY THE PAGE.
 *
 *   Chrome for Testing + the PRODUCT build of the extension
 *   → the side panel page (sidepanel.html), opened in its own popup window because a harness cannot
 *     open Chrome's side panel; the fixture stays the active tab of the ordinary window, which is the
 *     page the panel reads, exactly as the real side panel would
 *   → in that page, as an operator would: type the goal, press "Read this page", pick a control, pick
 *     what clicking it should do (and type the label, for a label change), "Add expected result",
 *     "Start task"
 *   → the offscreen document checks the answer (`checkDeclaration`) and starts the run with the
 *     person's declaration; every turn goes through every gate, planned by Qwen2.5-0.5B on llama.cpp
 *     behind the recording front on 127.0.0.1:8995
 *
 * SCENARIOS (`M18_SCENARIOS`, default "alerts,save,callback"), each on a fresh load of the page:
 *   alerts   — "Turn on alerts.": #alerts, label changes to "Alerts on"         → expect CONFIRMED
 *   save     — "Save my preferences.": #save, becomes unavailable              → expect CONFIRMED
 *   callback — "Request a callback.": #callback, becomes unavailable — the page
 *              does nothing                                                    → expect NOT_CONFIRMED, stop
 *
 * NOTHING IS INJECTED: the declaration exists only because the panel's own controls were operated;
 * the harness never sends TASK_START itself and never supplies a plan. It reads the outcome through
 * TASK_STATUS from the panel page, as the panel does. The page is click-only, so no value-use grant
 * is asked for (a panel-started task that needs one would wait for the control plane — see README).
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M18_SCENARIOS=alerts,save,callback] node tests/browser/extension/run-declared-task.mjs
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
const OUT = join(ROOT, "artifacts", "experiments", "M18-declared-outcomes", "logs");
const FIXTURE = join(ROOT, "tests", "browser", "extension", "fixture", "declared-task.html");
const REASONER_URL = "http://127.0.0.1:8995/v1/chat/completions";
const SCENARIOS = {
  alerts: { goal: "Turn on alerts.", control: "Turn on alerts", expect: "TARGET_RENAMED", name: "Alerts on", outcome: "CONFIRMED" },
  save: { goal: "Save my preferences.", control: "Save preferences", expect: "TARGET_DISABLED", outcome: "CONFIRMED" },
  callback: { goal: "Request a callback.", control: "Request a callback", expect: "TARGET_DISABLED", outcome: "NOT_CONFIRMED" },
};
const RUN = (process.env.M18_SCENARIOS ?? "alerts,save,callback").split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = JSON.parse(readFileSync(join(ROOT, "models", "qwen2.5-0.5b-instruct-gguf", "acquisition.json"), "utf8"));

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
for (const s of RUN) if (!SCENARIOS[s]) refuse(`unknown scenario ${s}`);
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const weights = join(ROOT, MODEL.weights.path);
if (!existsSync(weights) || sha(weights) !== MODEL.weights.sha256) refuse(`the model on disk is not the pinned ${MODEL.model.file}`);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, "cft-declared-task.json")), WS);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));

let context = null;
let service = null;
let stopServer = null;
let failure = null;
let browserVersion = null;
const runs = [];
try {
  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));
  service = await startReasonerService({ mode: "forward", port: 8995 });
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-m18-")), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserVersion = context.browser()?.version() ?? null;
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${origin}/declared/`, { waitUntil: "load" });

  // The panel, in its own popup window: the ordinary window's active tab stays the fixture.
  const panelOpened = context.waitForEvent("page");
  await worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL("sidepanel.html"), type: "popup", width: 460, height: 760 }));
  const panel = await panelOpened;
  await panel.waitForLoadState("load");

  for (const [index, name] of RUN.entries()) {
    const s = SCENARIOS[name];
    const n = index + 1;
    const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
    await page.goto(`${origin}/declared/`, { waitUntil: "load" });
    for (let i = 0; i < 40; i++) {
      if (await worker.evaluate((before) => globalThis.__host.hellos.length > before, hellos)) break;
      await wait(250);
    }
    const capturesBefore = service.captures.length;

    // ── the person, at the panel ───────────────────────────────────────────────────────────
    await panel.fill("#goal", s.goal);
    await panel.click("#task-read");
    await panel.waitForFunction(() => document.documentElement.dataset.task === "form", null, { timeout: 30_000 });
    const offered = await panel.evaluate(() => ({
      status: document.getElementById("task-status")?.textContent ?? null,
      controls: [...document.querySelectorAll("#task-controls label")].map((l) => l.textContent?.trim() ?? ""),
    }));
    const radio = panel.locator("#task-controls label", { hasText: s.control }).locator("input");
    await radio.check();
    const expectOptions = await panel.evaluate(() => [...document.querySelectorAll("#task-expect option")].map((o) => o.textContent));
    await panel.selectOption("#task-expect", s.expect);
    if (s.name) await panel.fill("#task-name", s.name);
    await panel.click("#task-add");
    const declaredShown = await panel.evaluate(() => [...document.querySelectorAll("#task-declared li")].map((l) => l.textContent));
    await panel.click("#task-start");
    await panel.waitForFunction(() => ["started", "refused"].includes(document.documentElement.dataset.task ?? ""), null, { timeout: 30_000 });
    // What the panel showed after the one press of Start. (A replayed or stale answer is refused by
    // the offscreen desk; that is covered by apps/extension/test/declaredTask.test.ts, not here.)
    const replay = { panelState: await panel.evaluate(() => document.documentElement.dataset.task ?? null) };

    let status = null;
    for (let tick = 0; tick < 1200; tick++) {
      status = await panel.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }));
      if (status?.task && status.task.state !== "RUNNING") break;
      await wait(250);
    }
    // What the person sees: the panel's own status line, once its poll has caught up.
    await panel.waitForFunction(() => document.documentElement.dataset.task === "finished", null, { timeout: 10_000 }).catch(() => {});
    const panelSays = await panel.evaluate(() => document.getElementById("task-status")?.textContent ?? null);
    const truth = await page.evaluate(() => ({
      alertsName: document.getElementById("alerts")?.textContent ?? null,
      saveDisabled: document.getElementById("save")?.disabled ?? null,
      callbackName: document.getElementById("callback")?.textContent ?? null,
      status: document.getElementById("status")?.textContent ?? null,
      clicks: window.__clicks ?? null,
    }));
    const result = status?.task?.result ?? null;
    const loop = result?.loop ?? null;
    const exchanges = service.captures.slice(capturesBefore).map((c) => ({ tripwire: c.tripwire, modelContent: c.modelContent ?? null }));
    runs.push({
      run: n,
      scenario: name,
      goal: s.goal,
      panel: { offered, expectOptions, declaredShown, startState: replay.panelState, finalText: panelSays },
      taskState: status?.task?.state ?? null,
      taskRefused: status?.task?.refused ?? null,
      outcome: loop?.outcome ?? null,
      turns: (loop?.turns ?? []).map((t, i) => ({
        turn: i + 1,
        state: t.state,
        refusal: t.refusal ? { stage: t.refusal.stage, cause: t.refusal.cause } : null,
        declaration: t.declaration,
        postcondition: t.postcondition,
        reasonerKind: t.reasonerKind,
        fallback: t.fallback,
        plan: t.plan?.steps ?? null,
        acted: t.act?.reached ?? null,
        verification: t.act?.verification ?? null,
        declaredDone: t.declaredDone,
        observedFrame: t.initialObservation?.frameId ?? null,
        afterFrame: t.observation?.frameId ?? null,
      })),
      modelRequests: exchanges.length,
      modelProposals: exchanges.map((e) => e.modelContent),
      modelRequestTripwire: exchanges.map((e) => e.tripwire),
      egress: (result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination } : { sent: false, cause: e.refusal?.cause ?? null })),
      perception: (result?.ports?.perception ?? []).map((p) => ({ ran: p.ran, refusal: p.refusal?.code ?? null, route: p.route })),
      page: truth,
    });
    const r = runs.at(-1);
    console.log(
      `>>> ${n}/${RUN.length} [${name}] "${s.goal}": ${r.outcome ?? r.taskState ?? "?"} — turns ${r.turns
        .map((t) => `${t.plan ? t.plan.map((x) => (x.op === "done" ? "done" : `${x.op} ${x.target}`)).join("+") : "∅"}→${t.verification?.verification ?? t.refusal?.cause ?? (t.declaredDone ? "DECLARED_DONE" : t.state)}`)
        .join(" | ")} — page ${JSON.stringify(truth.clicks)} "${truth.status}"`
    );
  }
} catch (e) {
  failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
  console.log(`>>> FAILED: ${failure}`);
} finally {
  if (service) await service.stop().catch(() => {});
  if (context) await context.close();
  if (typeof stopServer === "function") await stopServer();
}

// ── what each run may claim, judged from the page and the record ─────────────────────────────────
const judge = (r) => {
  const s = SCENARIOS[r.scenario];
  const first = r.turns[0];
  const selector = `#${r.scenario}`;
  const clicked = (first?.plan ?? []).find((x) => x.op === "click")?.target ?? null;
  const common = {
    thePanelOfferedThePagesControls: JSON.stringify(r.panel.offered.controls) === JSON.stringify(["Turn on alerts — button", "Save preferences — button", "Request a callback — button"]),
    theDeclarationCameFromThePanel: r.panel.declaredShown.length === 1 && first?.declaration?.source === "PERSON" && JSON.stringify(first.declaration.targets) === JSON.stringify([selector]),
    theDeclaredPostconditionWasEnforced:
      s.expect === "TARGET_RENAMED"
        ? first?.postcondition?.kind === "TARGET_NAME" && first.postcondition.expected === s.name
        : first?.postcondition?.kind === "TARGET_ENABLED" && first.postcondition.expected === false,
    everyTurnFromTheLocalModel: r.turns.every((t) => t.reasonerKind === "LOCAL_MODEL" && t.fallback === null),
    noValueShapedTextReachedTheModel: r.modelRequestTripwire.every((w) => Array.isArray(w) && w.length === 0),
    allEgressLoopbackReasoner: r.egress.every((e) => !e.sent || e.destination === REASONER_URL),
    productBuildCapturedNoFrame: r.perception.every((p) => p.ran === false && p.refusal === "NO_ACTIVE_TAB_GRANT"),
    onlyTheDeclaredControlWasClicked: Object.entries(r.page.clicks ?? {}).every(([k, v]) => (k === r.scenario ? v <= 1 : v === 0)),
  };
  if (clicked !== selector) {
    return { ...common, theModelProposedTheDeclaredControl: false };
  }
  const verified = first?.verification?.verification;
  const afterFresh = first?.afterFrame !== null && first?.afterFrame !== first?.observedFrame;
  if (s.outcome === "CONFIRMED") {
    return {
      ...common,
      theModelProposedTheDeclaredControl: true,
      confirmedOnAFreshReading: verified === "CONFIRMED" && afterFresh,
      thePageAgrees: r.scenario === "alerts" ? r.page.alertsName === "Alerts on" : r.page.saveDisabled === true,
    };
  }
  return {
    ...common,
    theModelProposedTheDeclaredControl: true,
    notConfirmedOnAFreshReading: verified === "NOT_CONFIRMED" && afterFresh,
    theLoopStopped: r.outcome === "STOPPED_UNVERIFIED" && r.turns.length === 1,
    theControlReallyWasClickedOnce: r.page.clicks?.callback === 1,
  };
};
for (const r of runs) r.judged = judge(r);
const allHeld = failure === null && runs.length === RUN.length && runs.every((r) => Object.values(r.judged).every(Boolean));
const record = {
  experiment: "M18 — user-declared click outcomes, in the real extension, with the real local model (not a J7 experiment)",
  notAJ7Experiment: true,
  verdict: allHeld ? "PASS" : "FAIL",
  fixture: { path: "tests/browser/extension/fixture/declared-task.html", sha256: sha(FIXTURE) },
  scenarios: RUN.map((s) => ({ name: s, ...SCENARIOS[s] })),
  failure,
  model: { repo: MODEL.model.repo, revision: MODEL.model.revision, file: MODEL.model.file, sha256: MODEL.weights.sha256, runtime: `llama.cpp ${MODEL.runtime.build}` },
  build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
  browser: { binary: executablePath, version: browserVersion },
  runs,
  notAClaim: [
    "one run per scenario on one synthetic page; no reliability claim",
    "the panel page ran in its own popup window, because a harness cannot open Chrome's side panel; the page, its code and its messages are the shipped ones, but Chrome's side-panel surface itself was not exercised",
    "the harness operated the panel's controls as an operator; no person was in the loop",
    "perception ran the product's no-gesture floor: no frame was captured (no toolbar invocation occurred), and none left the client",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, headless: false },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
for (const r of runs) for (const [k, v] of Object.entries(r.judged)) console.log(`  ${v ? "PASS" : "FAIL"}  [${r.scenario}] ${k}`);
console.log(`\n${record.verdict}  M18 declared outcomes in the real extension${failure ? ` — FAILURE: ${failure}` : ""}`);
console.log(`written: ${TARGET}`);
process.exit(allHeld ? 0 : 1);
