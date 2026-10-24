#!/usr/bin/env node
/**
 * M20 — the product launcher's whole life, checked and recorded: start, real inference through the
 * normal adapter, every refusal of its front, a second start refused on the busy port, stop, and no
 * process or listener left behind.
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
import { mkdirSync } from "node:fs";
import { request } from "node:http";
import { cpus, release as osRelease } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import { PIN, portIsFree } from "../../../../scripts/reasoner/reasoner.mjs";
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

/** Status code only. `host` lets a check send a Host header fetch() would not. */
const statusOf = (method, path, { headers = {}, body } = {}) =>
  new Promise((done) => {
    const r = request({ host: PIN.endpoint.host, port: PIN.endpoint.port, method, path, headers }, (res) => {
      res.resume();
      res.on("end", () => done(res.statusCode));
    });
    r.on("error", () => done(null));
    r.end(body);
  });

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
line.mark("STOPPED", checks.noProcessLeft && checks.noListenerLeft ? "CLEAN" : "LEFTOVER");

const pass = Object.entries(checks).every(([k, v]) => k === "refusals" || v === true);
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
mkdirSync(OUT, { recursive: true });
writeNewRecord(TARGET, record);
for (const [k, v] of Object.entries(checks)) if (k !== "refusals") console.log(`  ${v ? "PASS" : "FAIL"}  ${k}`);
console.log(`  refusals ${JSON.stringify(refusals)}\n${record.verdict}  written: ${TARGET}`);
process.exit(pass ? 0 : 1);
