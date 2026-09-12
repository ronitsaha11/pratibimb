/**
 * MVP-2 — HIT-TEST AGREEMENT and VERIFY RESULT against a real browser, on a LOCAL controlled page.
 *
 * What this harness is for, and nothing more:
 *
 *   1. a validated click passes a real hit test and reaches a real Chromium, and the PAGE — not
 *      the executor's bookkeeping — is what says the expected state arrived;
 *   2. an overlay that appears between validation and dispatch produces MISMATCH and **zero click
 *      events in the page**, counted by the page itself;
 *   3. a hit test that cannot answer produces UNKNOWN and also zero click events;
 *   4. a dispatch whose expected postcondition never arrives is NOT_CONFIRMED, not "probably fine";
 *   5. a dispatch whose outcome ACT could not establish stays UNKNOWN even when the page happens
 *      to look correct.
 *
 * It is NOT an end-to-end agent run. There is no observation loop, no planner, no server, no
 * SANITIZE, no RE-HYDRATE and no vault; `type` is refused by design (ADR-0006 §3), so no form is
 * filled and no task is completed. One confirmed click is not an agent.
 *
 * Authorisation: the page is the repository's own QG-02 fixture, served from 127.0.0.1 by this
 * harness and READ, never modified. No external site is contacted, no real data and no credential
 * is used, no account exists, and no security control is bypassed. The detector is not loaded.
 *
 * The overlay is installed by the HARNESS, using the harness's own fixed script — never by the
 * action bridge and never by the hit-test bridge, whose production interfaces stay read-only and
 * script-free.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hostname, cpus, totalmem } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = join(HERE, "..");
const ROOT = join(HERE, "..", "..", "..", "..");
const LOGS = join(EXP, "logs");
const PORT = 8983;

const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};

for (const p of ["packages/perception/dist/src/index.js", "packages/agent/dist/src/index.js"]) {
  if (!existsSync(join(ROOT, p))) refuse(`missing ${p} (run: npm run typecheck)`);
}
const P = await import(pathToFileURL(join(ROOT, "packages/perception/dist/src/index.js")).href);
const A = await import(pathToFileURL(join(ROOT, "packages/agent/dist/src/index.js")).href);

// Guards on the things this run must not quietly change. A harness that silently tolerates a
// retuned decode or a widened executor is not evidence about the thing it claims to test.
if (P.PROVISIONAL_THRESHOLDS.score !== 0.25 || P.PROVISIONAL_THRESHOLDS.nmsIou !== 0.5) {
  refuse("PROVISIONAL_THRESHOLDS has been changed — this harness must not run against a retuned decode");
}
if (A.EXECUTABLE_ACTIONS.length !== 1 || A.EXECUTABLE_ACTIONS[0] !== "click") {
  refuse(`ACT claims to execute ${JSON.stringify(A.EXECUTABLE_ACTIONS)}; this harness asserts click only`);
}
for (const k of Object.keys(A)) {
  if (/grant|consent|approveAction/i.test(k)) refuse(`the agent package exports "${k}" — a confirmation grant path must not exist yet`);
}

const FIXTURE = join(ROOT, "tests/browser/qg02/fixture/form.html");
if (!existsSync(FIXTURE)) refuse(`missing fixture ${FIXTURE}`);

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(FIXTURE));
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
 * counter is installed by the harness, it observes, and it never acts.
 */
const INSTALL_COUNTERS = `(() => {
  window.__clicks = {};
  window.__anyClicks = 0;
  document.addEventListener("click", () => { window.__anyClicks += 1; }, true);
  for (const id of ["phone-label", "phone", "help-link", "cancel", "submit", "footer-link"]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => { window.__clicks[id] = (window.__clicks[id] || 0) + 1; }, true);
  }
  return true;
})()`;

/** The role rule, written once and used by BOTH probes so identity comparison is meaningful. */
const ROLE_FN = `(el) => {
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
  }`;

const NAME_FN = `(el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60)`;

/**
 * The harness's own DOM probe. Reads only what a content script may read — role, accessible name,
 * geometry, enabled, CSS visibility — and never a value or the inner text of an arbitrary node.
 *
 * It also reports which element holds focus, by STABLE DOM REFERENCE. Three-valued on purpose:
 * a selector, or `null` for "reliably nothing", and it never guesses.
 */
const DOM_PROBE = `(() => {
  const role = ${ROLE_FN};
  const name = ${NAME_FN};
  const sel = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase());
  const nodes = Array.from(document.querySelectorAll("a, button, input, select, textarea, label, [role]"));
  const active = document.activeElement;
  const focused = (!active || active === document.body || active === document.documentElement) ? null : sel(active);
  return {
    viewport: {
      dpr: window.devicePixelRatio,
      viewportCssWidth: document.documentElement.clientWidth,
      viewportCssHeight: document.documentElement.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      origin: window.location.origin,
    },
    focusedSelector: focused,
    elements: nodes.map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        selector: sel(el),
        role: role(el),
        name: name(el),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        enabled: !el.disabled,
        cssHidden: style.display === "none" || style.visibility === "hidden" || r.width === 0 || r.height === 0,
        parentIndex: -1,
      };
    }),
  };
})()`;

/**
 * Playwright evaluates a STRING as an expression and does not apply an argument to it, so every
 * parameterised probe here is built as a complete expression with its parameters already
 * substituted. Discovered the hard way: passing the function source plus an argument silently
 * produced `undefined`, which the hit test correctly reported as MALFORMED_TOPMOST — an honest
 * refusal to read an answer it could not read.
 *
 * Every substituted value is checked to be a finite number or a fixed identifier first, so
 * nothing that is not already the harness's own arithmetic can enter the expression.
 */
const num = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v)) refuse(`${what} is not a finite number`);
  return String(v);
};

/**
 * The hit-test probe. `document.elementFromPoint` and nothing else.
 *
 * It returns a DESCRIPTION — selector, role, accessible name, box — and cannot click, navigate,
 * type, store or fetch. It is strictly less authority than the click ACT already performs. The
 * role and accessible-name rules are the SAME templates the DOM probe uses, because comparing an
 * identity derived by one rule against an identity derived by another would compare nothing.
 */
const hitProbe = (x, y) => `(() => {
  const role = ${ROLE_FN};
  const name = ${NAME_FN};
  const el = document.elementFromPoint(${num(x, "hit-test x")}, ${num(y, "hit-test y")});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    selector: el.id ? "#" + el.id : el.tagName.toLowerCase(),
    role: role(el),
    name: name(el),
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
})()`;

/** The harness's overlay. A consent banner, exactly as one would appear between two frames. */
const installOverlay = (top, height) => `(() => {
  const d = document.createElement("div");
  d.id = "consent-banner";
  d.textContent = "We use cookies";
  d.style.cssText =
    "position:fixed;left:0;width:1024px;background:#eee;border:1px solid #999;" +
    "z-index:9999;top:${num(top, "overlay top")}px;height:${num(height, "overlay height")}px;";
  document.body.appendChild(d);
  return true;
})()`;

const removeElement = (id) => {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) refuse(`removeElement: "${id}" is not a plain element id`);
  return `(() => {
  const el = document.getElementById("${id}");
  if (el) el.remove();
  return !!el;
})()`;
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const results = [];
let frameCounter = 0;

/** Observe the page and build a REAL element graph from the page's own measurements. */
async function observe(page) {
  const raw = await page.evaluate(DOM_PROBE);
  const v = raw.viewport;
  const geometry = {
    dpr: v.dpr,
    zoom: 1,
    viewportCss: { w: v.viewportCssWidth, h: v.viewportCssHeight },
    captureSize: { w: Math.round(v.viewportCssWidth * v.dpr), h: Math.round(v.viewportCssHeight * v.dpr) },
    scroll: { x: v.scrollX, y: v.scrollY },
    origin: v.origin,
  };
  frameCounter += 1;
  const fid = P.frameId(`mvp2-frame-${frameCounter}`);
  return {
    graph: P.buildElementGraph(raw.elements, geometry, fid),
    fid,
    focusedSelector: raw.focusedSelector,
    measured: raw.elements.length,
  };
}

const nodeFor = (graph, selector) => graph.nodes.find((n) => n.domRef.selector === selector);

const claimOf = (graph, selector) => {
  const n = nodeFor(graph, selector);
  if (!n) return null;
  const e = n.evidence;
  if (e.kind !== "OBSERVED" && e.kind !== "CLIPPED") return null;
  return { nodeId: n.id, role: n.role, name: n.name, frameId: graph.frameId, viewportBox: e.viewportBox };
};

/** The Playwright adapter for `PageActionBridge`. One method. */
const makeActionBridge = (page, frameId, behaviour = "OK") => {
  const calls = [];
  return {
    frameId,
    calls,
    /**
     * A real trusted mouse click at the validated CSS point.
     *
     * `mouse.click` rather than `locator.click`: a locator would RE-RESOLVE the element by
     * selector, which is the executor choosing its own target. This clicks exactly where
     * validation said, and it does not force past actionability — which is precisely why the
     * hit test above it is load-bearing rather than decorative.
     */
    async clickAtCssPoint(point) {
      calls.push(point);
      await page.mouse.click(point.x, point.y);
      // "the click landed and the bridge then stopped answering" — a genuinely unknown outcome,
      // not a simulated failure. Used by demo E only.
      if (behaviour === "HANG_AFTER_CLICK") await new Promise(() => {});
    },
  };
};

/** The Playwright adapter for `HitTestBridge`. Read-only: one query, no mutation. */
const makeHitBridge = (page, frameId, behaviour = "OK") => {
  const asked = [];
  return {
    frameId,
    asked,
    async topmostAtCssPoint(point) {
      asked.push(point);
      if (behaviour === "THROW") throw new Error("hit-test unavailable");
      const t = await page.evaluate(hitProbe(point.x, point.y));
      // `null` means the page reliably reported nothing there. A bridge that could not ANSWER
      // must throw instead — the distinction is the contract, and it is honoured here.
      return t === null ? null : { ...t, frameId };
    },
  };
};

const pageState = (page) =>
  page.evaluate(() => ({
    clicks: window.__clicks,
    anyClicks: window.__anyClicks,
    activeElementId: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
  }));

/** Run one demonstration on a fresh page, and record exactly what the page saw. */
async function demo(spec) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.evaluate(INSTALL_COUNTERS);

  const before = await observe(page);
  const claim = claimOf(before.graph, spec.selector);
  if (!claim && !spec.expectNoClaim) refuse(`${spec.name}: ${spec.selector} produced no usable claim`);

  // The page changes AFTER the observation the plan was made from — the TOCTOU window itself.
  if (spec.mutateBeforeAct) {
    const changed = await page.evaluate(spec.mutateBeforeAct);
    if (changed !== true) refuse(`${spec.name}: the harness mutation did not take effect`);
  }

  const actBridge = makeActionBridge(page, before.graph.frameId, spec.actBehaviour ?? "OK");
  const hitBridge = makeHitBridge(page, spec.hitFrameId ?? before.graph.frameId, spec.hitBehaviour ?? "OK");

  const outcome = await A.guardedAct(
    spec.graphOverride ? spec.graphOverride(before) : before.graph,
    { kind: spec.kind ?? "click", target: claim },
    { action: actBridge, hitTest: hitBridge },
    {
      ...(spec.timeoutMs ? { timeoutMs: spec.timeoutMs } : {}),
      ...(spec.expect
        ? {
            verify: {
              expect: spec.expect,
              observe: async () => {
                if (spec.mutateBeforeObserve) {
                  const removed = await page.evaluate(spec.mutateBeforeObserve);
                  if (removed !== true) refuse(`${spec.name}: the harness mutation did not take effect`);
                }
                const fresh = await observe(page);
                return { graph: fresh.graph, focusedSelector: fresh.focusedSelector };
              },
            },
          }
        : {}),
    }
  );

  const state = await pageState(page);
  await page.close();

  const record = {
    demo: spec.name,
    intent: spec.intent,
    target: spec.selector,
    reached: outcome.reached,
    validate: outcome.decision.decision,
    validateReason: outcome.decision.decision === "RE_OBSERVE" ? outcome.decision.reason : null,
    hitTest: outcome.hit ? outcome.hit.agreement : "NOT_REACHED",
    hitCause: outcome.hit && outcome.hit.agreement !== "MATCH" ? outcome.hit.cause : null,
    hitObserved: outcome.hit && outcome.hit.agreement === "MISMATCH" && outcome.hit.observed ? outcome.hit.observed.selector : null,
    hitPoint: outcome.hit && outcome.hit.point ? outcome.hit.point : null,
    act: outcome.result ? outcome.result.status : "NOT_CALLED",
    actCause: outcome.result ? outcome.result.cause || outcome.result.category || null : null,
    verifyResult: outcome.verification ? outcome.verification.verification : "NOT_VERIFIED",
    verifyCause: outcome.verification && outcome.verification.verification !== "CONFIRMED" ? outcome.verification.cause : null,
    verifyEvidence: outcome.verification && outcome.verification.verification === "CONFIRMED" ? outcome.verification.evidence : null,
    hitBridgeCalls: hitBridge.asked.length,
    actBridgeCalls: actBridge.calls.length,
    pageClickEvents: state.anyClicks,
    pageClicksByControl: state.clicks,
    pageActiveElementId: state.activeElementId,
    confirmed: A.guardedActionConfirmed(outcome),
    dispatched: A.guardedActionDispatched(outcome),
  };
  results.push(record);
  console.log(
    `${spec.name.padEnd(38)} validate=${String(record.validate).padEnd(10)} hit=${String(record.hitTest).padEnd(9)}` +
      `${record.hitCause ? `(${record.hitCause})` : ""} act=${String(record.act).padEnd(16)} ` +
      `verify=${String(record.verifyResult).padEnd(14)} pageClicks=${record.pageClickEvents}`
  );
  return record;
}

// ── A — a validated click that agrees, and whose effect the page confirms ────────────────────
await demo({
  name: "A valid click, confirmed",
  intent: "click the phone field; the page should report focus on it",
  selector: "#phone",
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── B — an overlay appears between observation and dispatch ──────────────────────────────────
await demo({
  name: "B overlay over the click point",
  intent: "a consent banner covers #cancel after the plan was made; nothing may be clicked",
  selector: "#cancel",
  mutateBeforeAct: installOverlay(330, 120),
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── C — the hit test cannot answer ──────────────────────────────────────────────────────────
await demo({
  name: "C hit test cannot answer",
  intent: "the read-only query fails; UNKNOWN must refuse exactly as hard as MISMATCH",
  selector: "#cancel",
  hitBehaviour: "THROW",
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── D — dispatched, but the expected postcondition never arrived ─────────────────────────────
await demo({
  name: "D dispatched, state not confirmed",
  intent: "click the label expecting focus on it; the fixture's `for` sends focus to #phone",
  selector: "#phone-label",
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── E — the dispatch outcome is unknown, even though the page looks right ─────────────────────
await demo({
  name: "E dispatch outcome unknown",
  intent: "the bridge clicks and then stops answering; the page looks correct, the outcome is not established",
  selector: "#phone",
  actBehaviour: "HANG_AFTER_CLICK",
  timeoutMs: 400,
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── F — the target disappears after the action ───────────────────────────────────────────────
await demo({
  name: "F target disappears after the act",
  intent: "#cancel is removed before the readback; the final state cannot say what happened",
  selector: "#cancel",
  mutateBeforeObserve: removeElement("cancel"),
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── G — the earlier boundary still fires first ───────────────────────────────────────────────
await demo({
  name: "G stale frame, refused by VALIDATE",
  intent: "a claim from an earlier frame; the hit test must never be reached",
  selector: "#cancel",
  graphOverride: (before) => ({ ...before.graph, frameId: P.frameId("mvp2-frame-stale") }),
  expect: { kind: "FOCUS_ON_TARGET" },
});

// ── H — a MATCH is not a permission ──────────────────────────────────────────────────────────
await demo({
  name: "H confirmation tier, refused by ACT",
  intent: "the help link agrees on hit test and is still refused; agreement is not consent",
  selector: "#help-link",
  expect: { kind: "FOCUS_ON_TARGET" },
});

await browser.close();
server.close();

// ── The assertions this run is only meaningful if it can make ────────────────────────────────
const by = (n) => results.find((r) => r.demo.startsWith(n));
const problems = [];
const must = (cond, msg) => {
  if (!cond) problems.push(msg);
};

must(by("A").hitTest === "MATCH" && by("A").act === "EXECUTED" && by("A").verifyResult === "CONFIRMED", "A did not reach CONFIRMED");
must(by("A").pageClickEvents === 1, "A did not produce exactly one page click event");
must(by("B").hitTest === "MISMATCH" && by("B").act === "NOT_CALLED", "B did not stop at the hit test");
must(by("B").pageClickEvents === 0, "B produced a page click event");
must(by("C").hitTest === "UNKNOWN" && by("C").act === "NOT_CALLED", "C did not stop at the hit test");
must(by("C").pageClickEvents === 0, "C produced a page click event");
must(by("D").act === "EXECUTED" && by("D").verifyResult === "NOT_CONFIRMED", "D did not report NOT_CONFIRMED");
must(by("E").verifyResult === "UNKNOWN", "E did not report UNKNOWN");
must(by("F").verifyResult === "UNKNOWN", "F did not report UNKNOWN");
must(by("G").validate === "RE_OBSERVE" && by("G").hitTest === "NOT_REACHED", "G reached the hit test");
must(by("G").pageClickEvents === 0, "G produced a page click event");
must(by("H").hitTest === "MATCH" && by("H").act === "REJECTED", "H was not refused by ACT");
must(by("H").pageClickEvents === 0, "H produced a page click event");
must(
  results.filter((r) => r.confirmed).length === 1,
  `exactly one demo may be CONFIRMED; ${results.filter((r) => r.confirmed).length} were`
);

const version = typeof browser.version === "function" ? browser.version() : null;
const log = {
  experiment: "MVP-2-hit-test-verify-result",
  workstation: 1,
  hostname: hostname(),
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: cpus()[0]?.model ?? null,
    cpuCount: cpus().length,
    totalMemGiB: Math.round((totalmem() / 1024 ** 3) * 100) / 100,
    chromiumExecutable: exe,
    chromiumVersion: version,
    headless: true,
    viewport: { width: 1024, height: 768 },
    fixture: "tests/browser/qg02/fixture/form.html (read, never modified)",
    origin: `http://127.0.0.1:${PORT}`,
    detectorLoaded: false,
    network: "127.0.0.1 only; no external request issued",
  },
  demos: results,
  problems,
  verdict: problems.length === 0 ? "AS DESIGNED" : "PROBLEMS",
};

mkdirSync(LOGS, { recursive: true });
writeFileSync(join(LOGS, "mvp2.json"), `${JSON.stringify(log, null, 2)}\n`, "utf8");

console.log("");
console.log(`page click events, total across all eight demos: ${results.reduce((a, r) => a + r.pageClickEvents, 0)}`);
console.log(`demos CONFIRMED: ${results.filter((r) => r.confirmed).length} of ${results.length}`);
console.log(`verdict: ${log.verdict}`);
if (problems.length) {
  for (const p of problems) console.error(`  PROBLEM: ${p}`);
  process.exit(1);
}
