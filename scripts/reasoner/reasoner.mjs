#!/usr/bin/env node
/**
 * `npm run reasoner` — start PratiBimb's local reasoner, the way a person (or a judge) runs it.
 *
 *   1. Verify the pinned model (`pin.json`): size and full SHA-256 of the weights.
 *   2. Verify the pinned llama.cpp runtime: the release archive's SHA-256, then every installed
 *      `.exe`/`.dll` against the same file inside that archive.
 *   3. Check both loopback ports are free. A busy port is reported and left alone: nothing that is
 *      not ours is ever stopped.
 *   4. Start `llama-server` on 127.0.0.1:8977 with a per-launch key (`upstream.mjs`) and `--no-slots`
 *      (output discarded: it may echo prompts), wait until it reports healthy, then check it refuses
 *      a keyless and a wrong-keyed request and has `/slots` off. If not, stop it and refuse.
 *   5. Serve the extension's one permitted endpoint, http://127.0.0.1:8995/v1/chat/completions,
 *      through `front.mjs` — loopback only, extension origins only, tripwire on, no bodies logged —
 *      which forwards to the model server with the key it attaches itself.
 *
 *   npm run reasoner           start, and stay in the foreground (Ctrl+C stops both processes)
 *   npm run reasoner -- --check   verify the pins and the ports, then exit; starts nothing
 *   npm run reasoner:stop      stop an instance this launcher started (recorded in its state file),
 *                              checking each process is ours before stopping it
 *
 * Not a production server: one user, one machine. Loopback binding keeps other machines out, and
 * nothing more: local processes and web pages in the person's browser can still reach both ports.
 * So 8995 (the front) admits only extension origins or no browser origin, its own Host and the one
 * path, and 8977 (the model server) admits only requests carrying the key this launcher generated
 * and only the front holds. Frame egress does not exist here — this service receives the sanitized
 * structure-only handoff and nothing else (ADR-0012 keeps frame egress blocked).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFront } from "./front.mjs";
import { assertUpstreamLocked, newApiKey, upstreamArgs, upstreamEnv, upstreamForwarder } from "./upstream.mjs";
import { PinError, verifyModel, verifyRuntime } from "./verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const PIN = JSON.parse(readFileSync(join(HERE, "pin.json"), "utf8"));
/** Inside `models/`, which git ignores: a record of what this launcher started, for `--stop`. */
export const STATE_FILE = join(ROOT, "models", ".reasoner-state.json");

const say = (line) => console.log(`[reasoner] ${line}`);
const mono = () => performance.now();

/** Is this loopback port free right now? Asked by binding it, briefly — never by probing a peer. */
export const portIsFree = (port, host = "127.0.0.1") =>
  new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, host, () => probe.close(() => done(true)));
  });

async function checkPorts() {
  for (const [what, port] of [["the extension's endpoint", PIN.endpoint.port], ["the model's internal port", PIN.upstream.port]]) {
    if (!(await portIsFree(port))) {
      throw new PinError(
        `port ${port} (${what}) is already in use. If a PratiBimb reasoner is already running, use it or stop it with \`npm run reasoner:stop\`; otherwise free the port. Nothing was stopped.`
      );
    }
  }
}

async function verifyAll() {
  const began = mono();
  const model = await verifyModel(ROOT, PIN);
  say(`model OK: ${PIN.model.file} @ ${PIN.model.revision.slice(0, 12)}, ${model.bytes} bytes, sha256 ${model.sha256.slice(0, 12)}…`);
  const runtime = await verifyRuntime(ROOT, PIN);
  say(`runtime OK: llama.cpp ${PIN.runtime.build}, ${runtime.files} executables/libraries match the pinned release`);
  return { model, runtime, verifyMs: Math.round(mono() - began) };
}

async function waitHealthy(port, deadlineMs, child) {
  const until = mono() + deadlineMs;
  while (mono() < until) {
    if (child.exitCode !== null) throw new PinError(`llama-server exited during start-up (code ${child.exitCode}).`);
    try {
      const reply = await fetch(`http://127.0.0.1:${port}/health`);
      if (reply.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((ok) => setTimeout(ok, 250));
  }
  throw new PinError(`llama-server did not become healthy within ${Math.round(deadlineMs / 1000)} s.`);
}

async function start() {
  const launchedAt = mono();
  const verified = await verifyAll();
  await checkPorts();

  // The model server's key: per launch, in this process's memory and the child's environment only.
  const key = newApiKey();
  const modelBegan = mono();
  const child = spawn(
    verified.runtime.binary,
    upstreamArgs(verified.model.path, PIN),
    // Its output is discarded, not logged: a model server's diagnostics can contain request text.
    { stdio: "ignore", windowsHide: true, env: upstreamEnv(key) }
  );
  let stopping = false;
  const front = { server: null };
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    say("stopping…");
    front.server?.close();
    if (child.exitCode === null) child.kill();
    rmSync(STATE_FILE, { force: true });
    process.exitCode = code;
    setTimeout(() => process.exit(code), 1500).unref();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => stop(0));
  process.on("exit", () => {
    if (child.exitCode === null) child.kill();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      // Also the path `--stop` takes: it stops the model, and the launcher follows it down.
      say(`llama-server exited (code ${code}); stopping the front.`);
      stop(1);
    }
  });

  await waitHealthy(PIN.upstream.port, 120_000, child);
  const modelLoadMs = Math.round(mono() - modelBegan);
  // Fail closed: no front in front of a model server that would answer without the key.
  try {
    await assertUpstreamLocked({ host: PIN.upstream.host, port: PIN.upstream.port, key });
  } catch (error) {
    stopping = true;
    if (child.exitCode === null) child.kill();
    throw error;
  }

  const startedAt = new Date().toISOString();
  const coldStart = { verifyMs: verified.verifyMs, modelLoadMs, totalMs: Math.round(mono() - launchedAt) };
  front.server = createFront({
    endpoint: PIN.endpoint,
    forward: upstreamForwarder({ host: PIN.upstream.host, port: PIN.upstream.port, key }),
    health: () => ({
      status: "ok",
      service: "pratibimb-reasoner",
      model: { repo: PIN.model.repo, revision: PIN.model.revision, file: PIN.model.file, sha256: PIN.model.sha256 },
      runtime: { build: PIN.runtime.build },
      modelServer: { authentication: "per-launch key", slots: "disabled" },
      endpoint: `http://${PIN.endpoint.host}:${PIN.endpoint.port}${PIN.endpoint.path}`,
      startedAt,
      coldStart,
    }),
    onRequest: (r) => say(`${r.status} ${r.method} ${r.path} in=${r.bytesIn ?? 0}B out=${r.bytesOut ?? 0}B ${r.ms}ms${r.tripwire ? ` REFUSED tripwire=${r.tripwire.join(",")}` : ""}`),
  });
  await new Promise((ok, fail) => {
    front.server.once("error", fail);
    front.server.listen(PIN.endpoint.port, PIN.endpoint.host, ok);
  });

  writeFileSync(STATE_FILE, `${JSON.stringify({ launcherPid: process.pid, serverPid: child.pid, binary: verified.runtime.binary, startedAt }, null, 2)}\n`);
  say(`ready: http://${PIN.endpoint.host}:${PIN.endpoint.port}${PIN.endpoint.path} (model loaded in ${modelLoadMs} ms; checks took ${verified.verifyMs} ms). Ctrl+C to stop.`);
  // One machine-readable line, for harnesses that start this launcher and measure cold start.
  console.log(`PRATIBIMB_REASONER_READY ${JSON.stringify({ startedAt, coldStart, launcherPid: process.pid, serverPid: child.pid })}`);
}

/** What is running under this PID, from the OS — never from our own record alone. */
function processInfo(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`],
        { encoding: "utf8" }
      ).trim();
      return out ? JSON.parse(out) : null;
    }
    const command = execFileSync("ps", ["-o", "command=", "-p", String(Number(pid))], { encoding: "utf8" }).trim();
    return command ? { ExecutablePath: command.split(" ")[0], CommandLine: command } : null;
  } catch {
    return null;
  }
}

function stopRecorded() {
  if (!existsSync(STATE_FILE)) {
    say("no running instance recorded; nothing to stop.");
    return;
  }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const same = (a, b) => typeof a === "string" && resolve(a).toLowerCase() === resolve(b).toLowerCase();
  const targets = [
    // The model first, so a launcher the OS stops outright (no signal handler runs) leaves nothing behind.
    { pid: state.serverPid, ours: (info) => same(info?.ExecutablePath, state.binary), what: "llama-server" },
    { pid: state.launcherPid, ours: (info) => /scripts[\\/]reasoner[\\/]reasoner\.mjs/.test(info?.CommandLine ?? ""), what: "launcher" },
  ];
  for (const t of targets) {
    const info = processInfo(t.pid);
    if (!info) {
      say(`${t.what} (pid ${t.pid}) is not running.`);
      continue;
    }
    if (!t.ours(info)) {
      say(`pid ${t.pid} is no longer the ${t.what} this launcher started; leaving it alone.`);
      continue;
    }
    process.kill(t.pid);
    say(`stopped ${t.what} (pid ${t.pid}).`);
  }
  rmSync(STATE_FILE, { force: true });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv.includes("--stop") ? "stop" : process.argv.includes("--check") ? "check" : "start";
  try {
    if (mode === "stop") stopRecorded();
    else if (mode === "check") {
      await verifyAll();
      await checkPorts();
      say("pins verified and ports free; nothing was started.");
    } else await start();
  } catch (error) {
    console.error(`[reasoner] ${error instanceof PinError ? "REFUSING TO START" : "FAILED"}: ${error.message}`);
    process.exit(error instanceof PinError ? 2 : 1);
  }
}
