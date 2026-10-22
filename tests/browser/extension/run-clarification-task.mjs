#!/usr/bin/env node
/**
 * M17 — "WHICH STORED VALUE?", ASKED AND ANSWERED IN THE REAL EXTENSION'S SIDE PANEL.
 *
 *   Chrome for Testing + the PRODUCT build of the extension
 *   → RUN_TASK { maxTurns: 2, #submit → TARGET_ENABLED false } on `fixture/two-phones.html`
 *   → privacy withholds "Confirm mobile number": two stored phone numbers fit it
 *   → the run parks at AWAIT_CLARIFICATION; the side panel page (sidepanel.html, opened in a tab
 *     because a harness cannot open Chrome's side panel) shows the question
 *   → this harness, as the operator, picks an option in that page and presses its button
 *   → the run continues through every gate, planned by the real local model (Qwen2.5-0.5B on
 *     llama.cpp, behind the recording front on 127.0.0.1:8995)
 *
 * SCENARIOS (`M17_SCENARIOS`, default "c1,c2,decline"):
 *   c1      — "The number from “Mobile number”": the page should accept the application
 *   c2      — "The number from “Alternate mobile number”": honoured; the page should refuse it
 *   decline — "Don't use either": nothing filled, nothing clicked, no planner asked
 *
 * WHAT IS NOT A PERSON: the harness clicks the panel's own controls, and answers the value-use grant
 * through the worker's control plane, exactly as earlier harnesses answer grants. Nothing else is
 * scripted: no plan is supplied, substituted or retried. The record holds no value: the confirm
 * field is reported as which number it holds (REGISTERED / ALTERNATE / EMPTY / OTHER), not as text.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M17_SCENARIOS=c1,c2,decline] node tests/browser/extension/run-clarification-task.mjs
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
const OUT = join(ROOT, "artifacts", "experiments", "M17-clarification", "logs");
const FIXTURE = join(ROOT, "tests", "browser", "extension", "fixture", "two-phones.html");
const REASONER_URL = "http://127.0.0.1:8995/v1/chat/completions";
const GOAL = "Submit my application with my registered mobile number.";
const POSTCONDITIONS = { "#submit": { kind: "TARGET_ENABLED", expected: false } };
const MAX_TURNS = 2;
const SCENARIOS = (process.env.M17_SCENARIOS ?? "c1,c2,decline").split(",").map((s) => s.trim()).filter(Boolean);
/** The fixture's synthetic numbers, named only to classify the confirm field and to scan records. */
const REGISTERED = "9000000001";
const ALTERNATE = "9000000002";
const FIXTURE_VALUES = [REGISTERED, ALTERNATE, "Ramesh Kumar", "2345 6789 0124", "234567890124", "1998-04-12", "482913"];
const MODEL = JSON.parse(readFileSync(join(ROOT, "models", "qwen2.5-0.5b-instruct-gguf", "acquisition.json"), "utf8"));

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
for (const s of SCENARIOS) if (!["c1", "c2", "decline"].includes(s)) refuse(`unknown scenario ${s}`);
const require2 = createRequire(import.meta.url);
const { chromium } = require2("playwright");
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !existsSync(executablePath)) refuse("set CHROME_PATH to the Chrome for Testing binary");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const weights = join(ROOT, MODEL.weights.path);
if (!existsSync(weights) || sha(weights) !== MODEL.weights.sha256) refuse(`the model on disk is not the pinned ${MODEL.model.file}`);
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, "cft-clarification-task.json")), WS);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const leaks = (anything) => FIXTURE_VALUES.filter((v) => JSON.stringify(anything ?? null).includes(v));

console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));

let context = null;
let service = null;
let stopServer = null;
let failure = null;
const runs = [];
let browserVersion = null;
try {
  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));
  service = await startReasonerService({ mode: "forward", port: 8995 });
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-m17-")), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserVersion = context.browser()?.version() ?? null;
  const extensionId = await worker.evaluate(() => chrome.runtime.id);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: "load" });
  const page = await context.newPage();

  for (const [index, scenario] of SCENARIOS.entries()) {
    const n = index + 1;
    const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
    await page.bringToFront();
    await page.goto(`${origin}/two-phones/`, { waitUntil: "load" });
    let identity = null;
    for (let i = 0; i < 40 && !identity; i++) {
      identity = await worker.evaluate((before) => (globalThis.__host.hellos.length > before ? [...globalThis.__host.hellos].reverse()[0].identity : null), hellos);
      if (!identity) await wait(250);
    }
    if (!identity) throw new Error("the content script never attested the fixture page");
    const capturesBefore = service.captures.length;
    const request = {
      tabId: identity.tabId,
      frameId: identity.frameId,
      goal: GOAL,
      act: "SUCCESS",
      endpoint: REASONER_URL,
      sessionId: `m17-session-${n}`,
      requestId: `m17-request-${n}`,
      maxTurns: MAX_TURNS,
      postconditions: POSTCONDITIONS,
    };
    await worker.evaluate((req) => {
      globalThis.__m17 = null;
      globalThis.__m17error = null;
      void globalThis.__host.runTask(req).then((r) => (globalThis.__m17 = r), (e) => (globalThis.__m17error = String(e)));
      return true;
    }, request);

    let settled = null;
    let grantsAnswered = 0;
    const shown = [];
    let panelReply = null;
    for (let tick = 0; tick < 1200 && !settled; tick++) {
      const state = await panel.evaluate(() => document.documentElement.dataset.clarification ?? "none");
      if (state === "pending" && panelReply === null) {
        // What the person sees, read off the page as rendered.
        shown.push(
          await panel.evaluate(() => ({
            question: document.getElementById("clarify-question")?.textContent ?? null,
            options: [...document.querySelectorAll("#clarify-options label")].map((l) => l.textContent?.trim() ?? ""),
            useDisabledBeforeChoosing: document.getElementById("clarify-use")?.disabled ?? null,
          }))
        );
        await panel.bringToFront();
        if (scenario === "decline") await panel.click("#clarify-decline");
        else {
          await panel.check(`#clarify-options input[value="${scenario}"]`);
          await panel.click("#clarify-use");
        }
        for (let i = 0; i < 40 && panelReply === null; i++) {
          const after = await panel.evaluate(() => ({ state: document.documentElement.dataset.clarification, text: document.getElementById("clarify-result")?.textContent ?? "" }));
          if (after.state !== "pending") panelReply = after;
          else await wait(100);
        }
        await page.bringToFront();
      }
      const s = await worker.evaluate(async () => ({ done: globalThis.__m17 !== null || globalThis.__m17error !== null, grant: await globalThis.__host.grantPeek() }));
      if (s.grant?.pending) {
        grantsAnswered += 1;
        await worker.evaluate(() => globalThis.__host.grantDecide(true));
      }
      if (s.done) settled = await worker.evaluate(() => ({ result: globalThis.__m17, error: globalThis.__m17error }));
      else await wait(250);
    }

    const truth = await page.evaluate(
      ({ registered, alternate }) => {
        const v = document.getElementById("mobile_confirm")?.value ?? "";
        return {
          status: document.getElementById("status")?.textContent ?? null,
          submitDisabled: document.getElementById("submit")?.disabled ?? null,
          submitEvents: (window.__submitEvents ?? []).filter((e) => e.type === "click").length,
          confirmHolds: v === "" ? "EMPTY" : v === registered ? "REGISTERED" : v === alternate ? "ALTERNATE" : "OTHER",
        };
      },
      { registered: REGISTERED, alternate: ALTERNATE }
    );
    const reply = settled?.result ?? null;
    const result = reply?.ok === true ? reply.result : null;
    const loop = result?.loop ?? null;
    const exchanges = service.captures.slice(capturesBefore).map((c) => ({ tripwire: c.tripwire, modelContent: c.modelContent ?? null }));
    runs.push({
      run: n,
      scenario,
      error: settled?.error ?? (settled ? (reply?.ok === false ? `REFUSED: ${reply.refused}` : null) : "TIMED_OUT"),
      panel: { shown, reply: panelReply },
      clarificationsAsked: result?.clarificationsAsked ?? null,
      grantsAnswered,
      outcome: loop?.outcome ?? null,
      confirmedActions: loop?.confirmedActions ?? null,
      turns: (loop?.turns ?? []).map((t, i) => ({
        turn: i + 1,
        state: t.state,
        transitions: t.transitions.map((x) => x.to),
        refusal: t.refusal ? { stage: t.refusal.stage, cause: t.refusal.cause, detail: t.refusal.detail } : null,
        clarifications: t.clarifications,
        fill: t.fill,
        reasonerKind: t.reasonerKind,
        fallback: t.fallback,
        plan: t.plan?.steps ?? null,
        rehydrated: t.rehydrated,
        verification: t.act?.verification ?? null,
        declaredDone: t.declaredDone,
      })),
      modelRequests: exchanges.length,
      modelProposals: exchanges.map((e) => e.modelContent),
      modelRequestTripwire: exchanges.map((e) => e.tripwire),
      egress: (result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination } : { sent: false, cause: e.refusal?.cause ?? null })),
      page: truth,
    });
    const r = runs.at(-1);
    console.log(
      `>>> ${n}/${SCENARIOS.length} [${scenario}]: ${r.outcome ?? r.error} — panel "${panelReply?.state ?? "never shown"}" — turns ${r.turns
        .map((t) => `${t.plan ? t.plan.map((s) => (s.op === "done" ? "done" : `${s.op} ${s.target}`)).join("+") : "∅"}→${t.verification?.verification ?? t.refusal?.cause ?? (t.declaredDone ? "DECLARED_DONE" : t.state)}`)
        .join(" | ")} — confirm ${truth.confirmHolds}, "${truth.status}"`
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
  const first = r.turns[0];
  const asked = first?.clarifications?.[0] ?? null;
  const common = {
    thePanelShowedTwoLabelledOptionsAndNoValue:
      r.panel.shown.length === 1 &&
      JSON.stringify(r.panel.shown[0].options) === JSON.stringify(["The number from “Mobile number”", "The number from “Alternate mobile number”"]) &&
      r.panel.shown[0].useDisabledBeforeChoosing === true &&
      leaks(r.panel.shown).length === 0,
    // Asked once, and before SEND — or, when declined, with no SEND at all.
    askedOnceBeforeAnyPlanning: (() => {
      const at = first?.transitions?.indexOf("AWAIT_CLARIFICATION") ?? -1;
      const send = first?.transitions?.indexOf("SEND") ?? -1;
      return r.clarificationsAsked === 1 && at >= 0 && (send === -1 || at < send);
    })(),
    noValueShapedTextReachedTheModel: r.modelRequestTripwire.every((w) => Array.isArray(w) && w.length === 0),
    noFixtureValueInTheRecord: leaks(r.turns).length === 0,
    allEgressLoopbackReasoner: r.egress.every((e) => !e.sent || e.destination === REASONER_URL),
  };
  if (r.scenario === "decline") {
    return {
      ...common,
      declinedAndStoppedBeforePlanning: asked?.outcome === "CLARIFICATION_DECLINED" && first?.refusal?.stage === "AWAIT_CLARIFICATION" && r.modelRequests === 0,
      nothingFilledNothingClicked: r.page.confirmHolds === "EMPTY" && r.page.submitEvents === 0 && r.grantsAnswered === 0,
    };
  }
  const chosen = r.scenario;
  return {
    ...common,
    theChoiceWasRecorded: asked?.outcome === "CHOSEN" && asked.candidateId === chosen && JSON.stringify(first?.fill?.chosenByPerson) === JSON.stringify(["#mobile_confirm"]),
    theModelPlannedFromTheLocalModel: first?.reasonerKind === "LOCAL_MODEL" && first?.fallback === null,
    theGrantWasStillAsked: r.grantsAnswered === 1,
    theFieldHoldsExactlyTheChosenNumber: r.page.confirmHolds === (chosen === "c1" ? "REGISTERED" : "ALTERNATE"),
    thePageDecidedTheResult:
      chosen === "c1"
        ? first?.verification?.verification === "CONFIRMED" && r.page.submitDisabled === true
        : first?.verification?.verification === "NOT_CONFIRMED" && r.page.submitDisabled === false && r.outcome === "STOPPED_UNVERIFIED",
  };
};
for (const r of runs) r.judged = judge(r);
const allHeld = failure === null && runs.length === SCENARIOS.length && runs.every((r) => Object.values(r.judged).every(Boolean));
const record = {
  experiment: "M17 — user-guided clarification of an ambiguous stored-value match, in the real extension (not a J7 experiment)",
  notAJ7Experiment: true,
  verdict: allHeld ? "PASS" : "FAIL",
  goal: GOAL,
  fixture: { path: "tests/browser/extension/fixture/two-phones.html", sha256: sha(FIXTURE) },
  maxTurns: MAX_TURNS,
  postconditions: POSTCONDITIONS,
  scenarios: SCENARIOS,
  failure,
  model: { repo: MODEL.model.repo, revision: MODEL.model.revision, file: MODEL.model.file, sha256: MODEL.weights.sha256, runtime: `llama.cpp ${MODEL.runtime.build}` },
  build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
  browser: { binary: executablePath, version: browserVersion },
  runs,
  notAClaim: [
    "one synthetic page, one run per scenario; no reliability claim",
    "the side panel page was opened in a tab, because a harness cannot open Chrome's side panel; the page, its code and its messages are the shipped ones",
    "the harness clicked the panel's controls and answered the value-use grant as the operator; no person was in the loop",
    "perception ran the product's no-gesture DOM floor; no frame was captured and none left the client",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, headless: false },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
for (const r of runs) for (const [k, v] of Object.entries(r.judged)) console.log(`  ${v ? "PASS" : "FAIL"}  [${r.scenario}] ${k}`);
console.log(`\n${record.verdict}  M17 clarification in the real extension${failure ? ` — FAILURE: ${failure}` : ""}`);
console.log(`written: ${TARGET}`);
process.exit(allHeld ? 0 : 1);
