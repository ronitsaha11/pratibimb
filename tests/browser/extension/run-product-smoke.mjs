#!/usr/bin/env node
/**
 * M20 — THE PRODUCT, AS A PERSON RUNS IT, IN CHROME'S REAL SIDE PANEL. **HUMAN-IN-THE-LOOP.**
 *
 * The M19 smoke test started its own copy of the model. This one does not: the person starts the
 * product reasoner themselves, with the documented command (`npm run reasoner`), and this harness
 * refuses to run unless that service answers on the one endpoint the extension's CSP permits and
 * reports the pinned model. It then builds the product extension, starts the loopback demo page,
 * launches Chrome for Testing with the build loaded, and WAITS while the person opens the side panel
 * and does each scenario. It presses nothing, answers nothing, injects no message and sets no flag.
 *
 * WHAT IT RECORDS, value-free: its own timeline (monotonic, ms since it started) of what it saw and
 * when; for each run, the run's own event trail (`RunRecord.events`: task start → consent request →
 * the person's answer → binder revalidation → restoration → click authorised and dispatched → fresh
 * observation → result verified → outcome), its transitions and its measured stage timings; and what
 * the page shows afterwards, as codes. Never a stored value, the preview's text, page text, a prompt
 * or a model output. Each run writes a NEW record, named by its start time; an existing record is
 * never replaced.
 *
 * THE BROWSER stays open — with no time limit, during or after the scenarios — until the person closes it.
 * Ctrl+C at any point closes the browser and the demo page, writes what was recorded so far marked
 * INTERRUPTED, and leaves the person's reasoner running — it is theirs to stop.
 *
 * Usage:
 *   npm run reasoner                       (in its own terminal; leave it running)
 *   CHROME_PATH="<chrome for testing>" node tests/browser/extension/run-product-smoke.mjs [--scenarios allow,deny]
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cpus, release as osRelease, tmpdir } from "node:os";

import { ROOT, startDemoServer } from "../demo/server.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../support/workstation.mjs";
import { createTimeline, isOrdered, leaksIn, onceOnly, projectTurn, runIdOf, writeNewRecord } from "../support/smoke-record.mjs";

const WS = resolveWorkstation();
const PIN = JSON.parse(readFileSync(join(ROOT, "scripts", "reasoner", "pin.json"), "utf8"));
const ENDPOINT = `http://${PIN.endpoint.host}:${PIN.endpoint.port}${PIN.endpoint.path}`;
const HEALTH = `http://${PIN.endpoint.host}:${PIN.endpoint.port}/health`;
const APP = join(ROOT, "apps", "extension");
const EXT = join(APP, ".output", "chrome-mv3");
const OUT = join(ROOT, "artifacts", "experiments", "M20-runnable-measured-product", "logs");
const REGISTERED = "9000000001";
const ALTERNATE = "9000000002";
const FIXTURE_VALUES = [REGISTERED, ALTERNATE, "Ramesh Kumar", "2345 6789 0124", "234567890124", "1998-04-12", "482913", "90••••••01"];
const GOAL = "Submit my application with my registered mobile number.";
const ALL_SCENARIOS = {
  allow: { open: null, steps: ['Press "Allow once" when the consent appears.'] },
  deny: { open: "Reload the page tab (F5).", steps: ['Press "Deny" when the consent appears.'] },
};
const chosen = (() => {
  const i = process.argv.indexOf("--scenarios");
  const names = i > 0 ? process.argv[i + 1].split(",") : ["allow", "deny"];
  for (const n of names) if (!(n in ALL_SCENARIOS)) throw new Error(`unknown scenario ${n}`);
  return names;
})();

const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) {
  console.error("REFUSING: set CHROME_PATH to the Chrome for Testing binary");
  process.exit(2);
}

const startedAt = new Date();
const RUN_ID = runIdOf(startedAt);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `cft-product-sidepanel-smoke-${RUN_ID}.json`)), WS);
const line = createTimeline();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const say = (text) => console.log(`\n=== ${text}`);
line.mark("HARNESS_STARTED");

// ── THE PERSON'S REASONER, NOT OURS ─────────────────────────────────────────────────────────
let health;
try {
  health = await (await fetch(HEALTH)).json();
} catch {
  console.error(`REFUSING: nothing answers on ${HEALTH}. Start the product reasoner first, in its own terminal:\n\n    npm run reasoner\n`);
  process.exit(2);
}
if (health?.service !== "pratibimb-reasoner" || health?.model?.sha256 !== PIN.model.sha256 || health?.endpoint !== ENDPOINT) {
  console.error("REFUSING: the service on 127.0.0.1:8995 is not the product reasoner serving the pinned model.");
  process.exit(2);
}
line.mark("REASONER_HEALTH_OK");

console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
line.mark("EXTENSION_BUILT");

let context = null;
let stopServer = null;
let failure = null;
let browserVersion = null;
let page = null;
// The person sets the pace. Nothing here times out or closes the browser on them (the first M20
// session closed it after two 20-minute waits with nobody at the keyboard — run 20261023T205646Z).
let browserClosed = false;
const runs = [];

const judge = (r) => {
  const first = r.turns[0];
  const trail = (first?.events ?? []).map((e) => e.event);
  const at = (name) => trail.indexOf(name);
  const consent = first?.consents?.[0]?.outcome ?? null;
  const base = {
    finished: r.finished,
    runEventsOrdered: r.turns.every((t) => isOrdered(t.events) && t.events[0]?.event === "RUN_STARTED" && t.events.at(-1)?.event === "RUN_ENDED"),
    allEgressToTheOneEndpoint: r.egress.every((e) => !e.sent || e.destination === ENDPOINT),
    askedInThePanelNotTheControlPlane: r.consentsAsked === 1 && r.grantViaControlPlane?.asked === false,
    thePersonDeclaredTheExpectedResult: first?.declarationSource === "PERSON",
  };
  if (r.scenario === "allow") {
    const order = ["CONSENT_REQUESTED", "CONSENT_ANSWERED", "BINDER_REVALIDATED", "VALUE_RESTORED", "PAGE_REFRESHED", "CLICK_AUTHORIZED", "CLICK_DISPATCHED", "RESULT_OBSERVED", "RESULT_VERIFIED"];
    return {
      ...base,
      allowedOnce: consent === "ALLOWED_ONCE",
      consentBeforeRestoreBeforeClickBeforeVerify: order.every((n) => at(n) >= 0) && order.every((n, i) => i === 0 || at(n) > at(order[i - 1])),
      restoredIntoTheField: r.page.confirmHolds === "REGISTERED",
      clickVerifiedByThePage: first?.verification === "CONFIRMED" && r.page.submitDisabled === true,
    };
  }
  return {
    ...base,
    denied: consent === "CONSENT_DENIED",
    nothingRestoredOrClicked: ["VALUE_RESTORED", "CLICK_AUTHORIZED", "CLICK_DISPATCHED"].every((n) => at(n) < 0),
    nothingRestoredOrSubmitted: r.page.confirmHolds === "EMPTY" && r.page.submitClicks === 0,
  };
};

const shutdown = onceOnly(async (reason) => {
  line.mark("SHUTDOWN", reason);
  if (context) await context.close().catch(() => {});
  if (typeof stopServer === "function") await stopServer().catch(() => {});
  for (const r of runs) r.judged = judge(r);
  const complete = runs.length === chosen.length;
  const allHeld = reason === "FINISHED" && failure === null && complete && runs.every((r) => Object.values(r.judged).every(Boolean));
  const record = {
    experiment: "M20 — the product, run by a person: product reasoner launcher + product build in Chrome's real side panel (human-in-the-loop; not a J7 experiment)",
    runId: RUN_ID,
    humanInTheLoop: true,
    verdict: allHeld ? "PASS" : reason === "INTERRUPTED" ? "INTERRUPTED" : "FAIL",
    failure,
    scenarios: chosen,
    build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
    reasoner: { startedBy: "the person, with `npm run reasoner`", endpoint: health.endpoint, model: health.model, runtime: health.runtime, coldStart: health.coldStart },
    browser: { binary: basename(executablePath), version: browserVersion },
    timeline: { clock: "monotonic, ms since the harness started", events: line.events },
    runEventClock: "each run's events and transitions: monotonic, ms since that run started (offscreen document clock)",
    runs,
    notAClaim: [
      "synthetic pages and values only; one run per scenario; no reliability or latency claim — the benchmark is separate",
      "the harness observed only; every click in the panel and the page was the person's",
    ],
    recordedAt: new Date().toISOString(),
    provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version },
  };
  if (leaksIn(record, FIXTURE_VALUES).length > 0) {
    console.log(">>> REFUSING TO WRITE: the record would contain a stored value or its preview");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  try {
    writeNewRecord(TARGET, record);
  } catch (error) {
    console.log(`>>> NOT WRITTEN: ${TARGET} already exists (${error.code}); history is never overwritten`);
    process.exit(1);
  }
  for (const r of runs) for (const [k, v] of Object.entries(r.judged)) console.log(`  ${v ? "PASS" : "FAIL"}  [${r.scenario}] ${k}`);
  console.log(`\n${record.verdict}  product side-panel smoke test\nwritten: ${TARGET}\nThe reasoner is still running; stop it with Ctrl+C in its terminal, or \`npm run reasoner:stop\`.`);
  process.exit(allHeld ? 0 : 1);
});
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => void shutdown("INTERRUPTED"));

try {
  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));
  line.mark("DEMO_PAGE_READY");
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-product-")), {
    headless: false,
    executablePath,
    viewport: null,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--start-maximized"],
  });
  context.once("close", () => {
    browserClosed = true;
    if (line.events.at(-1)?.event !== "SHUTDOWN") line.mark("BROWSER_CLOSED");
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserVersion = context.browser()?.version() ?? null;
  page = context.pages()[0] ?? (await context.newPage());
  // The one navigation this harness makes: the first page, before the person starts.
  await page.goto(`${origin}/fixture/`, { waitUntil: "load" });
  line.mark("BROWSER_READY");

  say("BROWSER READY. Open PratiBimb in Chrome's own side panel, once:");
  console.log("    the side-panel button at the right of Chrome's toolbar → choose \"PratiBimb\".");
  console.log("    (Do NOT open sidepanel.html in a tab or window. This test is about the real side panel.)");

  const status = () => worker.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }));
  for (const [index, name] of chosen.entries()) {
    const s = ALL_SCENARIOS[name];
    const before = (await status())?.task?.formId ?? null;
    if (s.open !== null) {
      const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
      say(`SCENARIO ${index + 1}/${chosen.length}: ${name.toUpperCase()} — when you have checked the last result (and its timings in the panel): ${s.open}`);
      for (let tick = 0; ; tick++) {
        if (await worker.evaluate((n) => globalThis.__host.hellos.length > n, hellos)) break;
        if (browserClosed) throw new Error("the browser was closed before the page was reloaded");
        await wait(250);
      }
      line.mark("PAGE_RELOADED_BY_PERSON");
    }
    say(`SCENARIO ${index + 1}/${chosen.length}: ${name.toUpperCase()} — in the side panel:`);
    console.log(`    1. Goal: type  ${GOAL}`);
    console.log('    2. Press "Read this page".');
    console.log('    3. Choose "Submit application — button", choose "It becomes unavailable (greyed out)", press "Add expected result".');
    console.log('    4. Press "Start task".');
    s.steps.forEach((step, i) => console.log(`    ${5 + i}. ${step}`));
    console.log("    (waiting for you — there is no time limit; close the browser or press Ctrl+C here to stop)");
    line.mark("SCENARIO_PROMPTED", name.toUpperCase());

    let st = null;
    let seenRunning = false;
    for (;;) {
      if (browserClosed) throw new Error("the browser was closed before the scenario finished");
      st = await status();
      const t = st?.task;
      if (t && t.formId !== before && t.state === "RUNNING" && !seenRunning) {
        seenRunning = true;
        line.mark("TASK_SEEN_RUNNING");
      }
      if (t && t.formId !== before && t.state !== "RUNNING") break;
      await wait(250);
    }
    const t = st?.task;
    const fresh = Boolean(t && t.formId !== before && t.state !== "RUNNING");
    const loop = fresh ? t.result?.loop ?? null : null;
    line.mark("TASK_SEEN_FINISHED", fresh ? String(loop?.outcome ?? t.state) : "TIMED_OUT");
    const truth = await page
      .evaluate(({ registered, alternate }) => {
        const v = document.getElementById("mobile_confirm")?.value ?? "";
        return {
          confirmHolds: v === "" ? "EMPTY" : v === registered ? "REGISTERED" : v === alternate ? "ALTERNATE" : "OTHER",
          submitDisabled: document.getElementById("submit")?.disabled ?? null,
          submitClicks: (window.__submitEvents ?? []).filter((e) => e.type === "click").length,
        };
      }, { registered: REGISTERED, alternate: ALTERNATE })
      .catch(() => ({ confirmHolds: "UNREADABLE", submitDisabled: null, submitClicks: null }));
    line.mark("PAGE_CHECKED", truth.confirmHolds);
    runs.push({
      scenario: name,
      finished: fresh,
      taskState: fresh ? t.state : null,
      outcome: loop?.outcome ?? null,
      consentsAsked: fresh ? t.result?.consentsAsked ?? null : null,
      grantViaControlPlane: fresh ? t.result?.grant ?? null : null,
      turns: (loop?.turns ?? []).map(projectTurn),
      page: truth,
      egress: fresh ? (t.result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination } : { sent: false, cause: e.refusal?.cause ?? null })) : [],
    });
    const r = runs.at(-1);
    console.log(`>>> ${name}: ${r.finished ? `${r.outcome} — consent ${r.turns[0]?.consents?.[0]?.outcome ?? "none"} — confirm ${truth.confirmHolds}, submit clicks ${truth.submitClicks}` : "DID NOT FINISH"}`);
  }
  line.mark("ALL_SCENARIOS_RECORDED");
  say("ALL SCENARIOS RECORDED. Check the last result and the timings in the panel, then close the browser window to finish.");
  if (!browserClosed) await new Promise((done) => context.once("close", done));
} catch (e) {
  failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
  console.log(`>>> FAILED: ${failure}`);
}
await shutdown("FINISHED");
