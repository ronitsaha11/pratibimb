/**
 * MVP-1 — ACT against a real browser, on a LOCAL controlled page.
 *
 * What this harness proves, and nothing more:
 *
 *   1. a validated action reaches a real Chromium and changes real page state;
 *   2. every refused action — stale, moved, renamed, removed, off-screen, confirmation-tier,
 *      unsupported — produces NO click event in the page, measured by the page itself;
 *   3. the one method of browser authority ACT has is the bridge's `clickAtCssPoint`.
 *
 * It is NOT an end-to-end agent run. SANITIZE, VERIFY, REASON, PLAN, RE-HYDRATE and
 * VERIFY RESULT do not exist; `type` is refused by design (ADR-0006 §3), so no form is filled
 * and no task is completed. See `README.md` for the honest result.
 *
 * Authorisation: both pages are served from 127.0.0.1 by this harness. Mode A is the
 * repository's own QG-02 fixture (read, never modified); mode B is the MVP-0 canvas fixture,
 * generated locally from fabricated strings. No external site is contacted, no real data and no
 * credential is used, and no security control is bypassed.
 *
 * The detector is NOT loaded here: ACT consumes element-graph nodes, and a detector candidate
 * is not one. That is itself a finding, recorded in the README.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hostname } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = join(HERE, "..");
const ROOT = join(HERE, "..", "..", "..", "..");
const LOGS = join(EXP, "logs");
const PORT = 8982;
const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1e3) / 1e3 : v);

for (const p of ["packages/perception/dist/src/index.js", "packages/agent/dist/src/index.js"]) {
  if (!existsSync(join(ROOT, p))) refuse(`missing ${p} (run: npm run typecheck)`);
}
const P = await import(pathToFileURL(join(ROOT, "packages/perception/dist/src/index.js")).href);
const A = await import(pathToFileURL(join(ROOT, "packages/agent/dist/src/index.js")).href);

// Guards on the things this run must not quietly change.
if (P.PROVISIONAL_THRESHOLDS.score !== 0.25 || P.PROVISIONAL_THRESHOLDS.nmsIou !== 0.5) {
  refuse("PROVISIONAL_THRESHOLDS has been changed — this harness must not run against a retuned decode");
}
if (A.EXECUTABLE_ACTIONS.length !== 1 || A.EXECUTABLE_ACTIONS[0] !== "click") {
  refuse(`ACT claims to execute ${JSON.stringify(A.EXECUTABLE_ACTIONS)}; this harness asserts click only`);
}
for (const k of Object.keys(A)) {
  if (/grant|consent|approveAction/i.test(k)) refuse(`the agent package exports "${k}" — a confirmation grant path must not exist yet`);
}

const MODE_A = join(ROOT, "tests/browser/qg02/fixture/form.html");
const MODE_B = join(ROOT, "artifacts/experiments/MVP-0-dom-sufficiency/harness/fixture/mode-b-canvas-form.html");
for (const f of [MODE_A, MODE_B]) if (!existsSync(f)) refuse(`missing fixture ${f}`);

const server = createServer((req, res) => {
  const which = (req.url || "").startsWith("/mode-b") ? MODE_B : MODE_A;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(which));
});
await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));

const require2 = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require2("playwright"));
} catch {
  refuse("playwright not resolvable (run: npm ci)");
}
const exe = process.env.CHROME_PATH || chromium.executablePath();
if (!existsSync(exe)) refuse(`no Chromium at ${exe} (set CHROME_PATH)`);

/**
 * Count click events per control, in the page.
 *
 * This is the evidence that matters: a refusal is only a refusal if the PAGE saw nothing. The
 * counter is installed by the harness, not by ACT, and it observes — it never acts.
 */
const INSTALL_COUNTERS = `(() => {
  window.__clicks = {};
  for (const id of ["phone", "cancel", "help-link", "submit", "footer-link"]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => { window.__clicks[id] = (window.__clicks[id] || 0) + 1; }, true);
  }
  return true;
})()`;

/** The Playwright adapter for `PageActionBridge`. One method, and it counts its own calls. */
const makeBridge = (page, frameId) => {
  const calls = [];
  return {
    frameId,
    calls,
    /**
     * A real trusted mouse click at the validated CSS point.
     *
     * `mouse.click` rather than `locator.click` on purpose: a locator would RE-RESOLVE the
     * element by selector, which is the executor choosing its own target. This clicks exactly
     * where validation said and nowhere else. It does not force past actionability — whatever
     * element is topmost at that point receives the event, which is the honest behaviour and
     * the reason hit-testing is named as a gap in the README.
     */
    async clickAtCssPoint(point) {
      calls.push(point);
      await page.mouse.click(point.x, point.y);
    },
  };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const results = [];
let frameCounter = 0;

/**
 * The harness's own DOM probe — deliberately NOT the QG-02 fixture's `window.__measure`.
 *
 * Two reasons. The fixture's probe enumerates a fixed list of ids and throws if one is missing,
 * which demo E (a removed target) requires; and the fixture is a frozen gate artifact that this
 * experiment reads and never edits. This reads only what a content script may read — role,
 * accessible name, geometry, enabled, CSS visibility — and never a value or inner text of an
 * arbitrary node.
 */
const DOM_PROBE = `(() => {
  const role = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const t = el.tagName;
    if (t === "INPUT") return (el.type === "checkbox" || el.type === "radio") ? el.type : "textbox";
    if (t === "TEXTAREA") return "textbox";
    if (t === "SELECT") return "listbox";
    if (t === "BUTTON") return "button";
    if (t === "A") return "link";
    if (t === "LABEL") return "label";
    return "generic";
  };
  const nodes = Array.from(document.querySelectorAll("a, button, input, select, textarea, label, [role]"));
  const cs = (el) => getComputedStyle(el);
  return {
    viewport: {
      dpr: window.devicePixelRatio,
      viewportCssWidth: document.documentElement.clientWidth,
      viewportCssHeight: document.documentElement.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      origin: window.location.origin,
    },
    elements: nodes.map((el) => {
      const r = el.getBoundingClientRect();
      const style = cs(el);
      return {
        selector: el.id ? "#" + el.id : el.tagName.toLowerCase(),
        role: role(el),
        name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        enabled: !el.disabled,
        cssHidden: style.display === "none" || style.visibility === "hidden" || r.width === 0 || r.height === 0,
        parentIndex: -1,
      };
    }),
  };
})()`;

/**
 * Observe the page and build a REAL element graph from the page's own measurements.
 *
 * `reuseFrameId` models the harder case: the page mutated and was re-measured WITHOUT a new
 * capture, so frame identity cannot be what catches the change — only identity and geometry can.
 */
async function observe(ctxPage, mode = "mode-a", reuseFrameId) {
  const raw = await ctxPage.evaluate(DOM_PROBE);
  const v = raw.viewport;
  const geometry = {
    dpr: v.dpr,
    zoom: 1,
    viewportCss: { w: v.viewportCssWidth, h: v.viewportCssHeight },
    captureSize: { w: Math.round(v.viewportCssWidth * v.dpr), h: Math.round(v.viewportCssHeight * v.dpr) },
    scroll: { x: v.scrollX, y: v.scrollY },
    origin: v.origin,
  };
  let fid = reuseFrameId;
  if (!fid) {
    frameCounter += 1;
    fid = P.frameId(`${mode}-frame-${frameCounter}`);
  }
  const graph = P.buildElementGraph(raw.elements, geometry, fid);
  return { graph, geometry, fid, measured: raw.elements.length };
}

const bySelector = (graph, selector) => graph.nodes.find((n) => n.domRef.selector === selector);

const claimOf = (graph, selector) => {
  const n = bySelector(graph, selector);
  if (!n) return null;
  const e = n.evidence;
  if (e.kind !== "OBSERVED" && e.kind !== "CLIPPED") return { unobservable: e.kind, node: n };
  return { nodeId: n.id, role: n.role, name: n.name, frameId: graph.frameId, viewportBox: e.viewportBox };
};

/** Run one demonstration on a fresh page, and record exactly what the page saw. */
async function demo({ name, intent, viewport, mode = "mode-a", mutate, build, sameFrame = false }) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://127.0.0.1:${PORT}/${mode}`, { waitUntil: "load" });
  await page.evaluate(INSTALL_COUNTERS);
  const before = await observe(page, mode);
  const plan = build ? build(before) : null;
  if (mutate) await page.evaluate(mutate);
  const after = mutate ? await observe(page, mode, sameFrame ? before.graph.frameId : undefined) : before;

  const bridge = makeBridge(page, after.graph.frameId);
  let decision = null;
  let result = null;
  if (plan && plan.action) {
    const out = await A.validateAndAct(after.graph, plan.action, bridge);
    decision = out.decision;
    result = out.result;
  }

  const pageState = await page.evaluate(() => ({
    clicks: window.__clicks,
    activeElementId: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
    phoneValue: document.getElementById("phone") ? document.getElementById("phone").value : null,
    href: window.location.href,
  }));
  await page.close();

  const record = {
    demo: name,
    intent,
    viewport,
    mode,
    measuredElements: after.measured,
    actionableNodes: after.graph.nodes.filter(
      (n) => n.evidence.kind === "OBSERVED" || n.evidence.kind === "CLIPPED"
    ).length,
    plan: plan ? plan.describe : null,
    validateDecision: decision ? decision.decision : "NOT_REACHED",
    validateReason: decision && decision.decision === "RE_OBSERVE" ? decision.reason : null,
    actStatus: result ? result.status : "NOT_CALLED",
    actCause: result ? result.cause || result.category || null : null,
    actUnsupportedCause: result && result.status === "UNSUPPORTED_ACTION" ? result.cause : null,
    bridgeCalls: bridge.calls.length,
    bridgePoint: bridge.calls[0] ? { x: r3(bridge.calls[0].x), y: r3(bridge.calls[0].y) } : null,
    pageClicks: pageState.clicks,
    activeElementId: pageState.activeElementId,
    phoneValue: pageState.phoneValue,
    href: pageState.href,
  };
  results.push(record);
  const verdict = record.actStatus === "EXECUTED" ? "DISPATCHED" : "NO BROWSER OPERATION";
  console.log(
    `${name.padEnd(34)} validate=${String(record.validateDecision).padEnd(10)} ` +
      `act=${String(record.actStatus).padEnd(19)} bridgeCalls=${record.bridgeCalls} ${verdict}`
  );
  return record;
}

/** Tall enough to bring #submit (y=1180 in this fixture) fully on screen. */
const TALL = { width: 1024, height: 1600 };
const STD = { width: 1024, height: 768 };

// A — the positive case: a validated click on an ordinary control.
await demo({
  name: "A click a validated textbox",
  intent: "a fresh, visible, enabled, routine control is clicked and the page reacts",
  viewport: STD,
  build: (o) => {
    const c = claimOf(o.graph, "#phone");
    return { describe: "click #phone (role textbox, name Phone)", action: { kind: "click", target: c } };
  },
});

// B — stale frame: the claim belongs to an observation that is gone.
await demo({
  name: "B stale frame",
  intent: "a claim from an earlier frame must not execute against a newer one",
  viewport: STD,
  mutate: () => true, // forces a second observation with a new frame id
  build: (o) => {
    const c = claimOf(o.graph, "#phone");
    return { describe: "click #phone with the PREVIOUS frame's claim", action: { kind: "click", target: c } };
  },
});

// C — the page reflowed: same frame id, geometry moved beyond tolerance.
await demo({
  name: "C target moved",
  sameFrame: true,
  intent: "a control that moved further than the tolerance is refused on geometry alone",
  viewport: STD,
  mutate: () => {
    document.getElementById("cancel").style.marginTop = "60px";
    return true;
  },
  build: (o) => {
    const c = claimOf(o.graph, "#cancel");
    return { describe: "click #cancel after it moved 60 CSS px", action: { kind: "click", target: c } };
  },
});

// D — the lookalike swap: same place, different control.
await demo({
  name: "D name changed in place",
  sameFrame: true,
  intent: "a benign control replaced by a destructive one must not be clicked",
  viewport: STD,
  mutate: () => {
    document.getElementById("cancel").textContent = "Delete my account";
    return true;
  },
  build: (o) => {
    const c = claimOf(o.graph, "#cancel");
    return { describe: 'click #cancel after its name became "Delete my account"', action: { kind: "click", target: c } };
  },
});

// E — the target is gone, and its id REBINDS to a surviving element.
//
// `NodeId` is positional within a snapshot, so deleting an element shifts every later id: the
// claim's id now resolves to a DIFFERENT element. The refusal therefore comes from the identity
// checks (role, name), not from the id lookup — which is precisely why identity is checked at
// all, and why `TARGET_MISSING` under-fires in practice. Recorded in the README as a finding.
await demo({
  name: "E target removed (id rebinds)",
  sameFrame: true,
  intent: "a removed target is refused on identity after its id rebound to a neighbour",
  viewport: STD,
  mutate: () => {
    document.getElementById("cancel").remove();
    return true;
  },
  build: (o) => {
    const c = claimOf(o.graph, "#cancel");
    return { describe: "click #cancel after it was removed", action: { kind: "click", target: c } };
  },
});

// E2 — removing the LAST element in document order, where no id can rebind.
await demo({
  name: "E2 last target removed",
  sameFrame: true,
  intent: "with no later element to rebind to, the lookup itself fails",
  viewport: TALL,
  mutate: () => {
    document.getElementById("footer-link").remove();
    return true;
  },
  build: (o) => {
    const c = claimOf(o.graph, "#footer-link");
    return { describe: "click #footer-link after it was removed", action: { kind: "click", target: c } };
  },
});

// F — the confirmation tier, on a real visible submit button.
await demo({
  name: "F submit: confirmation tier",
  intent: "a perfectly fresh submit button is refused because no human can confirm it",
  viewport: TALL,
  build: (o) => {
    const c = claimOf(o.graph, "#submit");
    return { describe: "click #submit (role button, name Submit), fully visible", action: { kind: "click", target: c } };
  },
});

// G — a link: destination unknowable from the element graph.
await demo({
  name: "G link: unknown destination",
  intent: "a link is refused because the graph cannot say whether it leaves this origin",
  viewport: STD,
  build: (o) => {
    const c = claimOf(o.graph, "#help-link");
    return { describe: "click #help-link (role link)", action: { kind: "click", target: c } };
  },
});

// H — off-screen: the builder's own classification refuses it before ACT is reached.
await demo({
  name: "H submit off screen",
  intent: "an element below the fold has no pixel claim, so it cannot be acted on",
  viewport: STD,
  build: (o) => {
    const c = claimOf(o.graph, "#submit");
    return c && c.unobservable
      ? {
          describe: `#submit is ${c.unobservable}; a stale claim is constructed as a planner would hold it`,
          action: {
            kind: "click",
            target: {
              nodeId: c.node.id,
              role: c.node.role,
              name: c.node.name,
              frameId: o.graph.frameId,
              viewportBox: { x: 580, y: 900, w: 100, h: 32 },
            },
          },
        }
      : { describe: "#submit was visible at this viewport — demo H not applicable", action: null };
  },
});

// I — `type` is refused: the clearance pipeline does not exist.
await demo({
  name: "I type is unsupported",
  intent: "typing is refused rather than approximated, and the field stays empty",
  viewport: STD,
  build: (o) => {
    const c = claimOf(o.graph, "#phone");
    return { describe: "type into #phone (a tel field)", action: { kind: "type", target: c } };
  },
});

// J — the DOM-poor canvas page: nothing to claim, so nothing to act on.
await demo({
  name: "J canvas page has no targets",
  intent: "a vision-only candidate is not an element-graph node, so no action can be validated",
  viewport: STD,
  mode: "mode-b",
  build: () => ({ describe: "no claim can be constructed: the DOM exposes no actionable node", action: null }),
});

await browser.close();
server.close();

// ------------------------------------------------------------------------------------------
// Assertions. The harness fails loudly rather than writing a log that flatters the result.
// ------------------------------------------------------------------------------------------
const byName = Object.fromEntries(results.map((r) => [r.demo.split(" ")[0], r]));
const problems = [];
const must = (cond, msg) => {
  if (!cond) problems.push(msg);
};

must(byName.A.actStatus === "EXECUTED", "A did not execute");
must(byName.A.bridgeCalls === 1, "A did not dispatch exactly one click");
must(byName.A.pageClicks.phone === 1, "A: the page did not receive the click");
must(byName.A.activeElementId === "phone", "A: focus did not move to the clicked field");

for (const k of ["B", "C", "D", "E", "E2", "F", "G", "H", "I"]) {
  const r = byName[k];
  must(r.actStatus !== "EXECUTED", `${k}: ACT executed when it must not`);
  must(r.bridgeCalls === 0, `${k}: the bridge was called ${r.bridgeCalls} times`);
  must(Object.keys(r.pageClicks).length === 0, `${k}: the page saw a click event`);
}
must(byName.B.validateReason === "FRAME_MISMATCH", "B: wrong rejection reason");
must(byName.C.validateReason === "MOVED_BEYOND_TOLERANCE", "C: wrong rejection reason");
must(byName.D.validateReason === "NAME_CHANGED", "D: wrong rejection reason");
// E refuses on identity because its id rebound; E2 refuses on the lookup. Both are refusals.
must(["NAME_CHANGED", "ROLE_CHANGED", "TARGET_MISSING"].includes(byName.E.validateReason), "E: unexpected rejection reason");
must(byName.E2.validateReason === "TARGET_MISSING", "E2: wrong rejection reason");
must(byName.F.validateDecision === "ALLOW", "F: validation should have allowed the fresh submit button");
must(byName.F.actCause === "HUMAN_CONFIRMATION_REQUIRED", "F: wrong ACT rejection cause");
must(byName.G.actCause === "HUMAN_CONFIRMATION_REQUIRED", "G: wrong ACT rejection cause");
must(byName.H.validateReason === "NOT_VISIBLE", "H: wrong rejection reason");
must(byName.I.actUnsupportedCause === "CLEARANCE_PIPELINE_ABSENT", "I: wrong unsupported cause");
must(byName.I.phoneValue === "", "I: something typed into the field");
must(byName.J.actionableNodes === 0, "J: the canvas page unexpectedly exposed actionable nodes");

const out = {
  experiment: "MVP-1-act-executor",
  date: new Date().toISOString().slice(0, 10),
  workstation: "W2",
  hostname: hostname(),
  node: process.version,
  // The browser is identified, not its path: a machine-specific path is noise in a shared log.
  chromium: { executable: exe.split(/[\/]/).pop(), fromChromePathEnv: Boolean(process.env.CHROME_PATH) },
  authorisation:
    "both pages served from 127.0.0.1 by this harness; mode A is the repository's own QG-02 fixture (unmodified on disk); " +
    "mode B is the MVP-0 canvas fixture generated locally from fabricated strings; no external site contacted; " +
    "no real data, no real PII, no credential, no security control bypassed",
  executorContract: {
    executableActions: A.EXECUTABLE_ACTIONS,
    refusedActions: A.ALLOWED_ACTIONS.filter((k) => !A.EXECUTABLE_ACTIONS.includes(k)),
    confirmationGrantPathExists: false,
    browserAuthority: "PageActionBridge.clickAtCssPoint — one method",
  },
  detector: "NOT LOADED. ACT consumes element-graph nodes; a detector candidate is not one.",
  findings: [
    "NodeId is positional within a snapshot: deleting an element shifts later ids, so a claim's id can " +
      "resolve to a DIFFERENT element (demo E). Safety comes from the role and name checks, not from the id, " +
      "and TARGET_MISSING therefore fires only when nothing can rebind (demo E2).",
    "A detector candidate is not an ElementNode, so a vision-only target cannot be validated or acted on at " +
      "all today (demo J): on the canvas page the DOM exposes 0 actionable nodes, so the loop has nothing to " +
      "hand ACT regardless of what the detector grounded.",
    "ACT clicks a coordinate. Nothing yet proves the validated element is the TOPMOST element at that point, " +
      "so an overlay placed after observation would receive the click. Hit-testing is a bridge-level gap.",
  ],
  demos: results,
  assertionFailures: problems,
  verdict: problems.length === 0 ? "PASS" : "FAIL",
};
mkdirSync(LOGS, { recursive: true });
writeFileSync(join(LOGS, "mvp1.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n${problems.length === 0 ? "PASS" : "FAIL"} — ${results.length} demonstrations, ${problems.length} assertion failure(s)`);
for (const p of problems) console.log(`  FAILED: ${p}`);
process.exit(problems.length === 0 ? 0 : 1);
