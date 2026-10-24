#!/usr/bin/env node
/**
 * M20 — the product launcher's whole life, checked and recorded: start, real inference through the
 * normal adapter, every refusal of its front, the model server refusing anyone without its
 * per-launch key (B1), a second start refused on the busy port, stop, and no process, listener,
 * state file or key left behind.
 *
 * It starts `npm run reasoner`'s script exactly as a person would (no flags), so the first thing it
 * needs is both loopback ports free; a running reasoner is reported, never stopped.
 *
 * Writes a NEW value-free record under logs/, named by its start time. Never a request or response
 * body: refusal checks record status codes, the inference check records the Vitest verdict.
 *
 * Usage: node artifacts/experiments/M20-runnable-measured-product/harness/launcher-lifecycle.mjs
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { cpus, release as osRelease } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import { PIN, STATE_FILE, portIsFree } from "../../../../scripts/reasoner/reasoner.mjs";
import { assertOwnEvidencePath, evidenceFileName, provenanceOf, resolveWorkstation } from "../../../../tests/browser/support/workstation.mjs";
import { createTimeline, runIdOf, writeNewRecord } from "../../../../tests/browser/support/smoke-record.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const LAUNCHER = join(ROOT, "scripts", "reasoner", "reasoner.mjs");
const WS = resolveWorkstation();
const RUN_ID = runIdOf();
const OUT = join(HERE, "..", "logs");
const TARGET = assertOwnEvidencePath(join(OUT, evidenceFileName(WS, `launcher-lifecycle-${RUN_ID}.json`)), WS);
const BASE = `http://${PIN.endpoint.host}:${PIN.endpoint.port}`;
const line = createTimeline();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Status code only. `host` lets a check send a Host header fetch() would not. A connection error is
 * `null`, which no check accepts as a refusal.
 */
const statusAt = (port, method, path, { headers = {}, body } = {}) =>
  new Promise((done) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      res.resume();
      res.on("end", () => done(res.statusCode));
    });
    r.on("error", () => done(null));
    r.end(body);
  });
const statusOf = (method, path, options) => statusAt(PIN.endpoint.port, method, path, options);

const checks = {};
for (const port of [PIN.endpoint.port, PIN.upstream.port]) {
  if (!(await portIsFree(port))) {
    console.error(`REFUSING: port ${port} is in use. Stop a running reasoner first (npm run reasoner:stop); nothing was stopped.`);
    process.exit(2);
  }
}
line.mark("PORTS_FREE");

const child = spawn(process.execPath, [LAUNCHER], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
const said = [];
const complained = [];
child.stderr.on("data", (d) => complained.push(String(d)));
const ready = await new Promise((ok, fail) => {
  createInterface({ input: child.stdout }).on("line", (l) => {
    said.push(l);
    if (l.startsWith("PRATIBIMB_REASONER_READY ")) ok(JSON.parse(l.slice("PRATIBIMB_REASONER_READY ".length)));
  });
  child.once("exit", (code) => fail(new Error(`launcher exited ${code}`)));
  setTimeout(() => fail(new Error("not ready in 180 s")), 180_000);
});
line.mark("READY");

const health = await (await fetch(`${BASE}/health`)).json();
checks.healthReportsThePin = health.service === "pratibimb-reasoner" && health.model?.sha256 === PIN.model.sha256 && health.endpoint === `${BASE}${PIN.endpoint.path}`;

// B1: the model server itself, addressed directly, the way a web page or another local process
// could. This harness never learns the key; it can only knock without it or with a wrong one.
const direct = (method, path, { headers = {}, body } = {}) => statusAt(PIN.upstream.port, method, path, { headers, body });
const chatBody = JSON.stringify({ messages: [{ role: "user", content: "probe" }], max_tokens: 1 });
const modelServer = {
  inferenceWithoutKey: await direct("POST", "/v1/chat/completions", { headers: { "content-type": "application/json" }, body: chatBody }),
  inferenceWithoutKeyFromWebOrigin: await direct("POST", "/v1/chat/completions", { headers: { "content-type": "application/json", origin: "http://evil.example" }, body: chatBody }),
  inferenceWithWrongKey: await direct("POST", "/v1/chat/completions", { headers: { "content-type": "application/json", authorization: `Bearer ${"w".repeat(43)}` }, body: chatBody }),
  slotsWithoutKey: await direct("GET", "/slots"),
  healthIsPublic: await direct("GET", "/health"),
};
checks.modelServer = modelServer;
checks.modelServerRefusesWithoutTheKey =
  modelServer.inferenceWithoutKey === 401 && modelServer.inferenceWithoutKeyFromWebOrigin === 401 && modelServer.inferenceWithWrongKey === 401 && modelServer.slotsWithoutKey === 401;
line.mark("MODEL_SERVER_LOCK_CHECKED", checks.modelServerRefusesWithoutTheKey ? "PASS" : "FAIL");

// The state file names processes, never the key.
const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
checks.stateFileHoldsOnlyProcesses = JSON.stringify(Object.keys(state).sort()) === JSON.stringify(["binary", "launcherPid", "serverPid", "startedAt"]);
const stateText = readFileSync(STATE_FILE, "utf8");

// The pinned binary's own behaviour with a key the test holds: 401s, /slots 501, and an unkeyed
// server refused by the launcher's lock check (spare ports; this launcher is not disturbed).
const pinned = spawnSync(process.execPath, [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "scripts/reasoner/upstream.live.test.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PRATIBIMB_REASONER_LIVE: "1" },
  encoding: "utf8",
});
checks.pinnedBinaryLockedAndUnkeyedRefused = pinned.status === 0 && /5 passed/.test(pinned.stdout);
line.mark("PINNED_BINARY_CHECKED", checks.pinnedBinaryLockedAndUnkeyedRefused ? "PASS" : "FAIL");

// Real inference, through the product adapter, against the launched service.
const live = spawnSync(process.execPath, [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "packages/reasoner/test/launcher.live.test.ts"], {
  cwd: ROOT,
  env: { ...process.env, PRATIBIMB_REASONER_LIVE: "1" },
  encoding: "utf8",
});
checks.inferenceThroughLocalModelReasoner = live.status === 0 && /2 passed/.test(live.stdout);
line.mark("INFERENCE_CHECKED", checks.inferenceThroughLocalModelReasoner ? "PASS" : "FAIL");

const json = { "content-type": "application/json" };
const refusals = {
  webPageOrigin: await statusOf("POST", PIN.endpoint.path, { headers: { ...json, origin: "http://127.0.0.1:8975" }, body: "{}" }),
  remoteOrigin: await statusOf("POST", PIN.endpoint.path, { headers: { ...json, origin: "https://example.com" }, body: "{}" }),
  rebindingHost: await statusOf("POST", PIN.endpoint.path, { headers: { ...json, host: "attacker.example:8995" }, body: "{}" }),
  otherPath: await statusOf("POST", "/v1/completions", { headers: json, body: "{}" }),
  getOnEndpoint: await statusOf("GET", PIN.endpoint.path),
  notJson: await statusOf("POST", PIN.endpoint.path, { headers: json, body: "not json" }),
  valueShapedText: await statusOf("POST", PIN.endpoint.path, { headers: json, body: JSON.stringify({ messages: [{ content: "9000000001" }] }) }),
};
checks.refusals = refusals;
checks.everyRefusalAsSpecified =
  refusals.webPageOrigin === 403 && refusals.remoteOrigin === 403 && refusals.rebindingHost === 421 && refusals.otherPath === 404 && refusals.getOnEndpoint === 405 && refusals.notJson === 400 && refusals.valueShapedText === 422;
line.mark("REFUSALS_CHECKED", checks.everyRefusalAsSpecified ? "PASS" : "FAIL");

// The launcher's request log must carry no body: the value-shaped request's digits never appear.
checks.requestLogCarriesNoBody = !said.some((l) => l.includes("9000000001"));

// A second launcher is refused on the busy port and stops nothing.
const second = spawnSync(process.execPath, [LAUNCHER], { cwd: ROOT, encoding: "utf8" });
checks.secondStartRefused = second.status === 2 && /already in use/.test(second.stderr) && /Nothing was stopped/.test(second.stderr);
checks.firstStillServing = alive(ready.serverPid) && alive(ready.launcherPid) && (await statusOf("GET", "/health")) === 200;
line.mark("SECOND_START_REFUSED", checks.secondStartRefused ? "PASS" : "FAIL");

// Stop, the documented way.
execFileSync(process.execPath, [LAUNCHER, "--stop"], { cwd: ROOT, encoding: "utf8" });
for (let i = 0; i < 40 && (alive(ready.serverPid) || alive(ready.launcherPid)); i++) await wait(250);
checks.noProcessLeft = !alive(ready.serverPid) && !alive(ready.launcherPid);
checks.noListenerLeft = (await portIsFree(PIN.endpoint.port)) && (await portIsFree(PIN.upstream.port));
checks.noStateFileLeft = !existsSync(STATE_FILE);
line.mark("STOPPED", checks.noProcessLeft && checks.noListenerLeft && checks.noStateFileLeft ? "CLEAN" : "LEFTOVER");

// No key anywhere this harness can see. It does not know the key, so it looks for its shape — a
// 43-character base64url token — in everything the launcher printed or wrote, in the second
// launcher's output and in the test runs' output. (Hex digests cannot match: they are 40 or 64
// characters, and a base64url key almost surely holds a character outside 0-9a-f.)
const KEY_SHAPED = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
const keyShaped = (text) => (String(text).match(KEY_SHAPED) ?? []).filter((t) => /[^0-9a-f]/.test(t));
const seenText = [said.join("\n"), complained.join(""), stateText, second.stdout, second.stderr, live.stdout, live.stderr, pinned.stdout, pinned.stderr].join("\n");
checks.noKeyShapedTokenInAnyOutput = keyShaped(seenText).length === 0;

const pass = Object.entries(checks).every(([k, v]) => k === "refusals" || k === "modelServer" || v === true);
const record = {
  experiment: "M20 — product reasoner launcher lifecycle",
  runId: RUN_ID,
  verdict: pass ? "PASS" : "FAIL",
  launcher: "node scripts/reasoner/reasoner.mjs (what `npm run reasoner` runs)",
  pin: { model: `${PIN.model.repo} ${PIN.model.file} @ ${PIN.model.revision}`, sha256: PIN.model.sha256, runtime: `llama.cpp ${PIN.runtime.build}`, endpoint: `${BASE}${PIN.endpoint.path}`, upstream: `${PIN.upstream.host}:${PIN.upstream.port}` },
  coldStart: { label: "measured", ...ready.coldStart },
  checks,
  timeline: { clock: "monotonic, ms since the harness started", events: line.events },
  recordedAt: new Date().toISOString(),
  provenance: { ...provenanceOf(WS), os: `${process.platform} ${osRelease()}`, cpu: cpus()[0]?.model ?? "unknown", node: process.version },
};
if (keyShaped(JSON.stringify(record)).length > 0) {
  console.log("REFUSING TO WRITE: the record would contain a key-shaped token");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
writeNewRecord(TARGET, record);
for (const [k, v] of Object.entries(checks)) if (k !== "refusals" && k !== "modelServer") console.log(`  ${v ? "PASS" : "FAIL"}  ${k}`);
console.log(`  refusals ${JSON.stringify(refusals)}\n  model server ${JSON.stringify(modelServer)}\n${record.verdict}  written: ${TARGET}`);
process.exit(pass ? 0 : 1);
