#!/usr/bin/env node
/**
 * M19 — THE REAL CHROME SIDE PANEL, OPERATED BY A PERSON. **HUMAN-IN-THE-LOOP.**
 *
 * Every earlier panel result (M17, M18, M19) came from the shipped panel page opened in a popup
 * window and operated by a harness, because a harness cannot open Chrome's side panel. This one does
 * not operate anything. It builds the product extension, starts the loopback demo server and the
 * real local model, launches Chrome for Testing, opens the fixture tab — and then WAITS while a
 * person opens Chrome's own side panel and does each scenario. It injects no message, presses no
 * button, answers no question and sets no flag; it only watches the run's value-free record (through
 * the extension's own TASK_STATUS) and the page, and writes what it saw.
 *
 * THE PERSON'S STEPS are printed when the browser is ready, scenario by scenario:
 *   allow   — state the task, Start, and when the consent appears press "Allow once"
 *   deny    — the same, but press "Deny"
 *   stale   — the same, but when the consent appears RELOAD THE PAGE first, then press "Allow once"
 *   clarify — on the two-numbers page: choose "Mobile number", then "Allow once"
 *
 * WHAT IT NEVER RECORDS: a stored value, the preview's text. Synthetic pages only. Not a J7
 * experiment; no frame is captured unless the person also clicks the toolbar button, and none leaves.
 *
 * Usage: CHROME_PATH="<chrome for testing>" node tests/browser/extension/run-sidepanel-smoke.mjs
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
const OUT = join(ROOT, "artifacts", "experiments", "M19-panel-consent", "logs");
const REGISTERED = "9000000001";
const ALTERNATE = "9000000002";
const FIXTURE_VALUES = [REGISTERED, ALTERNATE, "Ramesh Kumar", "2345 6789 0124", "234567890124", "1998-04-12", "482913"];
const GOAL = "Submit my application with my registered mobile number.";
// `open` is what the PERSON does to load the scenario's page; this harness never navigates after setup
// (an earlier version reloaded the page the moment a scenario ended, wiping the result before the
// person could check it — found in the first real side-panel session).
const SCENARIOS = [
  { name: "allow", path: "/fixture/", open: null, steps: ['Press "Allow once" when the consent appears.'] },
  { name: "deny", path: "/fixture/", open: "Reload the page tab (F5).", steps: ['Press "Deny" when the consent appears.'] },
  { name: "stale", path: "/fixture/", open: "Reload the page tab (F5).", steps: ["When the consent appears, RELOAD the page tab (F5) first.", 'Then press "Allow once" in the panel.'] },
  { name: "clarify", path: "/two-phones/", open: "In the page tab's address bar, open  http://127.0.0.1:8975/two-phones/", steps: ['When asked which number, choose "The number from “Mobile number”" and press "Use this value".', 'Then press "Allow once".'] },
];
const MODEL = JSON.parse(readFileSync(join(ROOT, "models", "qwen2.5-0.5b-instruct-gguf", "acquisition.json"), "utf8"));
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) {
  console.error("REFUSING: set CHROME_PATH to the Chrome for Testing binary");
  process.exit(2);
}
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
if (sha(join(ROOT, MODEL.weights.path)) !== MODEL.weights.sha256) {
  console.error(`REFUSING: the model on disk is not the pinned ${MODEL.model.file}`);
  process.exit(2);
}
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, "cft-real-sidepanel-smoke.json")), WS);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const leaks = (anything) => FIXTURE_VALUES.filter((v) => JSON.stringify(anything ?? null).includes(v));
const say = (text) => console.log(`\n=== ${text}`);

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
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-sidepanel-")), {
    headless: false,
    executablePath,
    viewport: null,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--start-maximized"],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserVersion = context.browser()?.version() ?? null;
  const page = context.pages()[0] ?? (await context.newPage());
  // The one navigation this harness makes: the first page, before the person starts.
  await page.goto(`${origin}/fixture/`, { waitUntil: "load" });

  say("BROWSER READY. Open PratiBimb in Chrome's own side panel, once:");
  console.log("    the side-panel button at the right of Chrome's toolbar → choose \"PratiBimb\".");
  console.log("    (Do NOT open sidepanel.html in a tab or window. This test is about the real side panel.)");

  for (const [index, s] of SCENARIOS.entries()) {
    const before = (await worker.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" })))?.task?.formId ?? null;
    if (s.open !== null) {
      // The person checks the last result, then loads this scenario's page themselves.
      const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
      say(`SCENARIO ${index + 1}/${SCENARIOS.length}: ${s.name.toUpperCase()} — when you have checked the last result: ${s.open}`);
      for (let tick = 0; ; tick++) {
        const loaded = await worker.evaluate((n) => globalThis.__host.hellos.length > n, hellos);
        if (loaded && new URL(page.url()).pathname === s.path) break;
        if (tick > 4800) throw new Error(`the ${s.path} page was not opened within 20 minutes`);
        await wait(250);
      }
    }
    say(`SCENARIO ${index + 1}/${SCENARIOS.length}: ${s.name.toUpperCase()} — in the side panel:`);
    console.log(`    1. Goal: type  ${GOAL}`);
    console.log('    2. Press "Read this page".');
    console.log('    3. Choose "Submit application — button", choose "It becomes unavailable (greyed out)", press "Add expected result".');
    console.log('    4. Press "Start task".');
    s.steps.forEach((step, i) => console.log(`    ${5 + i}. ${step}`));
    console.log("    (waiting up to 20 minutes for this scenario to finish…)");
    const capturesBefore = service.captures.length;

    let status = null;
    for (let tick = 0; tick < 4800; tick++) {
      status = await worker.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }));
      const t = status?.task;
      if (t && t.formId !== before && t.state !== "RUNNING") break;
      await wait(250);
    }
    const t = status?.task;
    const fresh = t && t.formId !== before && t.state !== "RUNNING";
    const loop = fresh ? t.result?.loop ?? null : null;
    const truth = await page.evaluate(({ registered, alternate }) => {
      const v = document.getElementById("mobile_confirm")?.value ?? "";
      return {
        confirmHolds: v === "" ? "EMPTY" : v === registered ? "REGISTERED" : v === alternate ? "ALTERNATE" : "OTHER",
        submitDisabled: document.getElementById("submit")?.disabled ?? null,
        submitClicks: (window.__submitEvents ?? []).filter((e) => e.type === "click").length,
      };
    }, { registered: REGISTERED, alternate: ALTERNATE }).catch(() => ({ confirmHolds: "UNREADABLE", submitDisabled: null, submitClicks: null }));
    runs.push({
      scenario: s.name,
      finished: Boolean(fresh),
      taskState: fresh ? t.state : null,
      outcome: loop?.outcome ?? null,
      consentsAsked: fresh ? t.result?.consentsAsked ?? null : null,
      clarificationsAsked: fresh ? t.result?.clarificationsAsked ?? null : null,
      grantViaControlPlane: fresh ? t.result?.grant ?? null : null,
      turns: (loop?.turns ?? []).map((x, i) => ({
        turn: i + 1,
        state: x.state,
        refusal: x.refusal ? { stage: x.refusal.stage, cause: x.refusal.cause } : null,
        clarifications: x.clarifications,
        consents: x.consents,
        declaration: x.declaration,
        reasonerKind: x.reasonerKind,
        plan: x.plan?.steps ?? null,
        rehydrated: x.rehydrated,
        verification: x.act?.verification?.verification ?? null,
        declaredDone: x.declaredDone,
      })),
      page: truth,
      // The privacy boundary, as the other harnesses check it: what the model was sent, and where.
      modelRequestTripwire: service.captures.slice(capturesBefore).map((c) => c.tripwire),
      egress: fresh ? (t.result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination } : { sent: false, cause: e.refusal?.cause ?? null })) : [],
    });
    const r = runs.at(-1);
    console.log(`>>> ${s.name}: ${r.finished ? `${r.outcome} — consents ${JSON.stringify(r.turns[0]?.consents ?? [])} — confirm ${truth.confirmHolds}, submit clicks ${truth.submitClicks}` : "DID NOT FINISH"}`);
  }
  // Leave the last result on screen for the person: the browser stays open until they close the
  // window (or 10 minutes pass). An earlier version closed it at once, so the person never saw the
  // final scenario's page — found in the first full real side-panel session.
  say("ALL SCENARIOS RECORDED. Check the last result, then close the browser window to finish (it closes itself after 10 minutes).");
  await Promise.race([new Promise((done) => context.once("close", done)), wait(10 * 60_000)]);
} catch (e) {
  failure = `${e.name}: ${String(e.message).slice(0, 400)}`;
  console.log(`>>> FAILED: ${failure}`);
} finally {
  if (service) await service.stop().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (typeof stopServer === "function") await stopServer();
}

const judge = (r) => {
  const first = r.turns[0];
  const consent = first?.consents?.[0]?.outcome ?? null;
  const base = {
    finished: r.finished,
    noValueShapedTextReachedTheModel: r.modelRequestTripwire.every((w) => Array.isArray(w) && w.length === 0),
    allEgressLoopbackReasoner: r.egress.every((e) => !e.sent || e.destination === "http://127.0.0.1:8995/v1/chat/completions"),
    askedInThePanelNotTheControlPlane: r.consentsAsked === 1 && r.grantViaControlPlane?.asked === false,
    thePersonDeclaredTheExpectedResult: first?.declaration?.source === "PERSON",
  };
  if (r.scenario === "allow" || r.scenario === "clarify") {
    return {
      ...base,
      ...(r.scenario === "clarify" ? { chosenNotGuessed: first?.clarifications?.[0]?.outcome === "CHOSEN" } : {}),
      allowedOnce: consent === "ALLOWED_ONCE",
      restoredIntoTheField: r.page.confirmHolds === "REGISTERED",
      clickVerifiedByThePage: first?.verification === "CONFIRMED" && r.page.submitDisabled === true,
    };
  }
  if (r.scenario === "deny") return { ...base, denied: consent === "CONSENT_DENIED", nothingRestoredOrSubmitted: r.page.confirmHolds === "EMPTY" && r.page.submitClicks === 0 };
  // stale: the page was reloaded while the consent waited; the allow must not reach the new page.
  return {
    ...base,
    theRunStoppedWithoutAConfirmedAction: r.outcome !== "COMPLETED_AS_DECLARED" && first?.verification !== "CONFIRMED",
    notRestoredAfterReload: r.page.confirmHolds === "EMPTY" && r.page.submitClicks === 0 && (first?.rehydrated ?? []).every((x) => x.inserted !== true),
  };
};
for (const r of runs) r.judged = judge(r);
const allHeld = failure === null && runs.length === SCENARIOS.length && runs.every((r) => Object.values(r.judged).every(Boolean));
const record = {
  experiment: "M19 — the REAL Chrome side panel, operated by a person (human-in-the-loop smoke test; not a J7 experiment)",
  humanInTheLoop: true,
  verdict: allHeld ? "PASS" : "FAIL",
  failure,
  build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
  browser: { binary: executablePath, version: browserVersion },
  model: { file: MODEL.model.file, sha256: MODEL.weights.sha256 },
  runs,
  notAClaim: ["synthetic pages and values only; one run per scenario; no reliability claim", "the harness observed only; every click was the person's"],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version },
};
if (leaks(record).length > 0) {
  console.log(">>> REFUSING TO WRITE: the record would contain a stored value");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
for (const r of runs) for (const [k, v] of Object.entries(r.judged)) console.log(`  ${v ? "PASS" : "FAIL"}  [${r.scenario}] ${k}`);
console.log(`\n${record.verdict}  real side panel smoke test\nwritten: ${TARGET}`);
process.exit(allHeld ? 0 : 1);
