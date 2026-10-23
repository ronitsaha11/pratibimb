#!/usr/bin/env node
/**
 * M19 — "MAY PRATIBIMB PUT THIS STORED VALUE INTO THIS FIELD?", ASKED AND ANSWERED IN THE EXTENSION'S
 * PANEL, FOR A TASK THE PERSON STARTED THERE, PLANNED BY THE REAL LOCAL MODEL.
 *
 *   Chrome for Testing + the PRODUCT build of the extension
 *   → the side panel page (sidepanel.html) in its own popup window — a HARNESS DEMONSTRATION: a
 *     harness cannot open Chrome's side panel, so Chrome's side-panel surface itself is not exercised
 *   → in that page: goal, "Read this page", declare "Submit application" becomes unavailable (M18),
 *     "Start task"
 *   → the run plans with Qwen2.5-0.5B, grounds the value (M16), and before restoring it parks a
 *     consent request; the panel shows site, field, kind and a masked preview
 *   → the harness presses the panel's own Allow once / Deny buttons, as an operator would
 *
 * SCENARIOS (`M19_SCENARIOS`, default "allow,deny,stale,clarify-allow"), each on a fresh page:
 *   allow         — Allow once → restored into "Confirm mobile number", submit CONFIRMED by the page
 *   deny          — Deny → nothing restored, nothing submitted
 *   stale         — while the request waits, two crafted answers are sent from the panel page, as a
 *                   stale panel would: one for the PREVIOUS request (the desk must refuse it and keep
 *                   waiting), then one for this request but the PREVIOUS document (the desk passes it
 *                   on; the orchestrator must refuse it). Nothing restored, nothing submitted.
 *   clarify-allow — the two-numbers page (M17): choose "Mobile number" in the panel, then Allow once
 *
 * WHAT IS NEVER RECORDED: the preview's text, any stored value. The record keeps the preview's shape
 * and a boolean for whether it is the last two digits of the synthetic registered number.
 *
 * Usage: CHROME_PATH="<chrome for testing>" [M19_SCENARIOS=…] node tests/browser/extension/run-consent-task.mjs
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
const REASONER_URL = "http://127.0.0.1:8995/v1/chat/completions";
const GOAL = "Submit my application with my registered mobile number.";
/** Synthetic, from the fixtures. Named only to classify the field and to scan the record. */
const REGISTERED = "9000000001";
const ALTERNATE = "9000000002";
const FIXTURE_VALUES = [REGISTERED, ALTERNATE, "Ramesh Kumar", "2345 6789 0124", "234567890124", "1998-04-12", "482913"];
const SCENARIOS = {
  allow: { path: "/fixture/", fixture: ["tests", "browser", "demo", "fixture", "application.html"], answer: "allow" },
  deny: { path: "/fixture/", fixture: ["tests", "browser", "demo", "fixture", "application.html"], answer: "deny" },
  stale: { path: "/fixture/", fixture: ["tests", "browser", "demo", "fixture", "application.html"], answer: "stale" },
  "clarify-allow": { path: "/two-phones/", fixture: ["tests", "browser", "extension", "fixture", "two-phones.html"], answer: "allow", clarify: "c1" },
};
const RUN = (process.env.M19_SCENARIOS ?? "allow,deny,stale,clarify-allow").split(",").map((s) => s.trim()).filter(Boolean);
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
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, "cft-consent-task.json")), WS);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const leaks = (anything) => FIXTURE_VALUES.filter((v) => JSON.stringify(anything ?? null).includes(v));

console.log("building the PRODUCT extension (no evidence flags)…");
execSync("npm run build", { cwd: APP, env: { ...process.env, TR01_PROBE: "", M3_WORKER_FRAME: "", STRUCTURAL_PROBE: "", E6_PROBE: "", EGRESS_EVIDENCE_PROBE: "" }, stdio: "pipe" });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));

let context = null;
let service = null;
let stopServer = null;
let failure = null;
let browserVersion = null;
const runs = [];
let previous = null; // the last request this harness saw: { consentId, documentId }
try {
  const { server, origin } = await startDemoServer(8975);
  stopServer = () => new Promise((ok) => server.close(ok));
  service = await startReasonerService({ mode: "forward", port: 8995 });
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pratibimb-m19-")), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  await worker.evaluate(() => globalThis.__host.ensureOffscreen());
  browserVersion = context.browser()?.version() ?? null;
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${origin}/fixture/`, { waitUntil: "load" });
  const panelOpened = context.waitForEvent("page");
  await worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL("sidepanel.html"), type: "popup", width: 460, height: 900 }));
  const panel = await panelOpened;
  await panel.waitForLoadState("load");

  for (const [index, name] of RUN.entries()) {
    const s = SCENARIOS[name];
    const hellos = await worker.evaluate(() => globalThis.__host.hellos.length);
    await page.goto(`${origin}${s.path}`, { waitUntil: "load" });
    for (let i = 0; i < 40; i++) {
      if (await worker.evaluate((before) => globalThis.__host.hellos.length > before, hellos)) break;
      await wait(250);
    }
    const capturesBefore = service.captures.length;

    // ── the person, at the panel: the task and what the click must do (M18) ───────────────
    await panel.fill("#goal", GOAL);
    await panel.click("#task-read");
    await panel.waitForFunction(() => document.documentElement.dataset.task === "form", null, { timeout: 30_000 });
    await panel.locator("#task-controls label", { hasText: "Submit application" }).locator("input").check();
    await panel.selectOption("#task-expect", "TARGET_DISABLED");
    await panel.click("#task-add");
    await panel.click("#task-start");
    await panel.waitForFunction(() => ["started", "refused"].includes(document.documentElement.dataset.task ?? ""), null, { timeout: 30_000 });

    // ── wait for a question: which number (M17), then may it be used (M19) ────────────────
    let clarified = null;
    let shown = null;
    const stale = {};
    let answered = null;
    for (let tick = 0; tick < 1200; tick++) {
      if (s.clarify && clarified === null && (await panel.evaluate(() => document.documentElement.dataset.clarification)) === "pending") {
        const options = await panel.evaluate(() => [...document.querySelectorAll("#clarify-options label")].map((l) => l.textContent?.trim() ?? ""));
        await panel.check(`#clarify-options input[value="${s.clarify}"]`);
        await panel.click("#clarify-use");
        clarified = { options };
      }
      if ((await panel.evaluate(() => document.documentElement.dataset.consent)) === "pending" && shown === null) {
        // What the person sees — kept as text except the preview, which is kept as a shape.
        const screen = await panel.evaluate(() => ({
          heading: document.getElementById("consent-heading")?.textContent ?? null,
          site: document.getElementById("consent-site")?.textContent ?? null,
          field: document.getElementById("consent-field")?.textContent ?? null,
          statement: document.getElementById("consent-statement")?.textContent ?? null,
          then: document.getElementById("consent-then")?.textContent ?? null,
          preview: document.getElementById("consent-preview")?.textContent ?? "",
          buttons: [...document.querySelectorAll("#consent button")].map((b) => b.textContent),
        }));
        const { preview, ...rest } = screen;
        shown = {
          ...rest,
          previewShape: /^•{8}[0-9]{2}$/.test(preview) ? "SUFFIX_2_OF_10" : preview === "••••••" ? "GENERIC" : "OTHER",
          previewIsTheRegisteredNumbersLastTwoDigits: preview === `••••••••${REGISTERED.slice(-2)}`,
          previewContainsAFullStoredValue: FIXTURE_VALUES.some((v) => preview.includes(v)),
        };
        const current = await panel.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_PEEK" }));
        const view = current?.pending ?? null;

        if (s.answer === "stale" && view) {
          // A stale panel, as a harness can play one: an answer to the previous request…
          stale.previousRequest = await panel.evaluate(
            ({ v, p }) => chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_DECIDE", answer: { kind: "ALLOW_ONCE", consentId: p.consentId, sessionId: v.sessionId, origin: v.origin, documentId: v.documentId, target: v.target } }),
            { v: view, p: previous ?? { consentId: "m19-never-issued.consent.1" } }
          );
          stale.stillWaitingAfterIt = (await panel.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_PEEK" })))?.pending?.consentId === view.consentId;
          // …then one for this request but the page as it was before the reload.
          stale.previousDocument = await panel.evaluate(
            ({ v, p }) => chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_DECIDE", answer: { kind: "ALLOW_ONCE", consentId: v.consentId, sessionId: v.sessionId, origin: v.origin, documentId: p.documentId, target: v.target } }),
            { v: view, p: previous ?? { documentId: "m19-earlier-document" } }
          );
          answered = "stale";
        } else if (s.answer === "deny") {
          await panel.click("#consent-deny");
          answered = "deny";
        } else {
          await panel.click("#consent-allow");
          answered = "allow";
        }
        if (view) previous = { consentId: view.consentId, documentId: view.documentId };
      }
      const status = await panel.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }));
      if (status?.task && status.task.state !== "RUNNING") break;
      await wait(250);
    }
    await panel.waitForFunction(() => document.documentElement.dataset.task === "finished", null, { timeout: 10_000 }).catch(() => {});
    const status = await panel.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" }));
    const panelSays = await panel.evaluate(() => ({ task: document.getElementById("task-status")?.textContent ?? null, consent: document.getElementById("consent-result")?.textContent ?? null }));
    const truth = await page.evaluate(({ registered, alternate }) => {
      const v = document.getElementById("mobile_confirm")?.value ?? "";
      return {
        confirmHolds: v === "" ? "EMPTY" : v === registered ? "REGISTERED" : v === alternate ? "ALTERNATE" : "OTHER",
        submitDisabled: document.getElementById("submit")?.disabled ?? null,
        submitClicks: (window.__submitEvents ?? []).filter((e) => e.type === "click").length,
        status: document.getElementById("status")?.textContent ?? null,
      };
    }, { registered: REGISTERED, alternate: ALTERNATE });
    const result = status?.task?.result ?? null;
    const loop = result?.loop ?? null;
    const exchanges = service.captures.slice(capturesBefore).map((c) => ({ tripwire: c.tripwire, modelContent: c.modelContent ?? null }));
    runs.push({
      run: index + 1,
      scenario: name,
      fixture: { path: s.fixture.join("/"), sha256: sha(join(ROOT, ...s.fixture)) },
      clarified,
      consentScreen: shown,
      answered,
      stale: s.answer === "stale" ? stale : null,
      panelSays,
      consentsAsked: result?.consentsAsked ?? null,
      taskState: status?.task?.state ?? null,
      outcome: loop?.outcome ?? null,
      turns: (loop?.turns ?? []).map((t, i) => ({
        turn: i + 1,
        state: t.state,
        refusal: t.refusal ? { stage: t.refusal.stage, cause: t.refusal.cause } : null,
        clarifications: t.clarifications,
        consents: t.consents,
        declaration: t.declaration,
        reasonerKind: t.reasonerKind,
        fallback: t.fallback,
        plan: t.plan?.steps ?? null,
        rehydrated: t.rehydrated,
        verification: t.act?.verification ?? null,
        declaredDone: t.declaredDone,
      })),
      modelProposals: exchanges.map((e) => e.modelContent),
      modelRequestTripwire: exchanges.map((e) => e.tripwire),
      egress: (result?.egress ?? []).map((e) => (e.record ? { sent: true, destination: e.record.destination } : { sent: false, cause: e.refusal?.cause ?? null })),
      perception: (result?.ports?.perception ?? []).map((p) => ({ ran: p.ran, refusal: p.refusal?.code ?? null })),
      grantViaControlPlane: result?.grant ?? null,
      page: truth,
    });
    const r = runs.at(-1);
    console.log(
      `>>> ${index + 1}/${RUN.length} [${name}]: ${r.outcome ?? r.taskState} — consent ${shown ? `shown (${shown.previewShape})` : "NOT SHOWN"}, answered ${answered} — turns ${r.turns
        .map((t) => `${t.plan ? t.plan.map((x) => (x.op === "done" ? "done" : `${x.op} ${x.target}`)).join("+") : "∅"}→${t.verification?.verification ?? t.refusal?.cause ?? (t.declaredDone ? "DECLARED_DONE" : t.state)}`)
        .join(" | ")} — confirm ${truth.confirmHolds}, submit clicks ${truth.submitClicks}`
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

// ── what each run may claim ───────────────────────────────────────────────────────────────────
const judge = (r) => {
  const first = r.turns[0];
  const consent = first?.consents?.[0] ?? null;
  const common = {
    theConsentScreenWasShownBeforeRestoration: r.consentScreen !== null && r.consentsAsked === 1,
    itNamedTheSiteFieldAndKind:
      r.consentScreen?.site?.startsWith("http://127.0.0.1:") === true && r.consentScreen?.field === "Confirm mobile number" && r.consentScreen?.heading === "Allow PratiBimb to use your phone number?",
    itShowedOnlyAMaskedPreview: r.consentScreen?.previewShape === "SUFFIX_2_OF_10" && r.consentScreen?.previewIsTheRegisteredNumbersLastTwoDigits === true && r.consentScreen?.previewContainsAFullStoredValue === false,
    itOfferedOnlyAllowOnceAndDeny: JSON.stringify(r.consentScreen?.buttons) === JSON.stringify(["Allow once", "Deny"]),
    theControlPlaneWasNotAsked: r.grantViaControlPlane?.asked === false,
    theModelPlannedFromTheLocalModel: first?.reasonerKind === "LOCAL_MODEL" && first?.fallback === null,
    noValueShapedTextReachedTheModel: r.modelRequestTripwire.every((w) => Array.isArray(w) && w.length === 0),
    noStoredValueOrPreviewInTheRecord: leaks({ turns: r.turns, panelSays: r.panelSays, consentScreen: r.consentScreen }).length === 0,
    allEgressLoopbackReasoner: r.egress.every((e) => !e.sent || e.destination === REASONER_URL),
    productBuildCapturedNoFrame: r.perception.every((p) => p.ran === false && p.refusal === "NO_ACTIVE_TAB_GRANT"),
  };
  if (r.scenario === "allow" || r.scenario === "clarify-allow") {
    return {
      ...common,
      ...(r.scenario === "clarify-allow" ? { thePersonChoseTheNumberFirst: first?.clarifications?.[0]?.outcome === "CHOSEN" && first.clarifications[0].candidateId === "c1" } : {}),
      allowedOnce: consent?.outcome === "ALLOWED_ONCE",
      restoredIntoTheIntendedField: r.page.confirmHolds === "REGISTERED" && first?.rehydrated?.length === 1 && first.rehydrated[0].target === "#mobile_confirm",
      theClickWasVerifiedByThePage: first?.verification?.verification === "CONFIRMED" && r.page.submitDisabled === true && r.page.submitClicks === 1,
    };
  }
  if (r.scenario === "deny") {
    return {
      ...common,
      denied: consent?.outcome === "CONSENT_DENIED" && first?.refusal?.stage === "AWAIT_GRANT",
      nothingRestoredNothingSubmitted: r.page.confirmHolds === "EMPTY" && r.page.submitClicks === 0 && (first?.rehydrated ?? []).length === 0,
    };
  }
  return {
    ...common,
    theDeskRefusedTheAnswerToThePreviousRequest: r.stale?.previousRequest?.answered === false && r.stale.previousRequest.refused === "NOT_THIS_CONSENT" && r.stale.stillWaitingAfterIt === true,
    theOrchestratorRefusedTheAnswerForThePreviousDocument: r.stale?.previousDocument?.answered === true && consent?.outcome === "DOCUMENT_CHANGED",
    nothingRestoredNothingSubmitted: r.page.confirmHolds === "EMPTY" && r.page.submitClicks === 0 && (first?.rehydrated ?? []).length === 0,
  };
};
for (const r of runs) r.judged = judge(r);
const allHeld = failure === null && runs.length === RUN.length && runs.every((r) => Object.values(r.judged).every(Boolean));
const record = {
  experiment: "M19 — just-in-time, one-time consent in the extension's panel, with a masked preview (not a J7 experiment)",
  notAJ7Experiment: true,
  verdict: allHeld ? "PASS" : "FAIL",
  goal: GOAL,
  scenarios: RUN,
  failure,
  model: { repo: MODEL.model.repo, revision: MODEL.model.revision, file: MODEL.model.file, sha256: MODEL.weights.sha256, runtime: `llama.cpp ${MODEL.runtime.build}` },
  build: { flags: "none (product build)", csp: manifest.content_security_policy?.extension_pages ?? null, permissions: manifest.permissions },
  browser: { binary: executablePath, version: browserVersion },
  runs,
  notAClaim: [
    "a HARNESS DEMONSTRATION: the shipped panel page ran in its own popup window, because a harness cannot open Chrome's side panel; Chrome's side-panel surface itself was not exercised",
    "the harness pressed the panel's controls and, in the stale scenario, sent two crafted answers from the panel page; no person was in the loop",
    "one run per scenario on synthetic pages; no reliability claim",
    "the preview's text and every stored value are deliberately absent from this record; only the preview's shape is kept",
    "perception ran the product's no-gesture floor; no frame was captured and none left the client",
  ],
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version, playwright: require2("playwright/package.json").version, headless: false },
};
if (leaks(record).length > 0) {
  // The one rule this record exists to keep: if a value got in, do not write it anywhere.
  console.log(`>>> REFUSING TO WRITE: the record would contain ${leaks(record).length} stored value(s)`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(record, null, 2)}\n`, "utf8");
for (const r of runs) for (const [k, v] of Object.entries(r.judged)) console.log(`  ${v ? "PASS" : "FAIL"}  [${r.scenario}] ${k}`);
console.log(`\n${record.verdict}  M19 panel consent in the real extension${failure ? ` — FAILURE: ${failure}` : ""}`);
console.log(`written: ${TARGET}`);
process.exit(allHeld ? 0 : 1);
