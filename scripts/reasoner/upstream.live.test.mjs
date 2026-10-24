/**
 * M20 B1 — THE PINNED llama-server, LOCKED. Opt-in: `PRATIBIMB_REASONER_LIVE=1` and the pinned
 * runtime and model on disk (`npm run reasoner:check`).
 *
 * Starts the real b10956 binary through the launcher's own `upstreamArgs` and `upstreamEnv`, on
 * spare loopback ports so a running reasoner is never disturbed. Each test uses a key it generates and
 * keeps to itself. Statuses are the binary's own; a connection error fails the test.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertUpstreamLocked, newApiKey, upstreamArgs, upstreamEnv } from "./upstream.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PIN = JSON.parse(readFileSync(join(HERE, "pin.json"), "utf8"));
const BINARY = join(ROOT, PIN.runtime.dir, PIN.runtime.binary);
const MODEL = join(ROOT, PIN.model.path);
const LIVE = process.env.PRATIBIMB_REASONER_LIVE === "1" && existsSync(BINARY) && existsSync(MODEL);

/** Start the pinned binary on `port` with the launcher's arguments, and `env` as given. */
async function startModel(port, env) {
  const pin = { ...PIN, upstream: { ...PIN.upstream, port } };
  const child = spawn(BINARY, upstreamArgs(MODEL, pin), { stdio: "ignore", windowsHide: true, env });
  for (let i = 0; i < 480; i++) {
    if (child.exitCode !== null) throw new Error(`llama-server exited ${child.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error("llama-server did not become healthy");
}

const chat = JSON.stringify({ messages: [{ role: "user", content: "Reply with ok." }], max_tokens: 2 });
const statusOf = async (url, init) => {
  const reply = await fetch(url, init); // a connection error throws and fails the test
  await reply.arrayBuffer();
  return { status: reply.status, allowOrigin: reply.headers.get("access-control-allow-origin") };
};
const post = (key, extra = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra }, body: chat });

describe.skipIf(!LIVE)("the pinned llama-server with the launcher's key and --no-slots", () => {
  const port = 18977;
  const base = `http://127.0.0.1:${port}`;
  const key = newApiKey();
  let child;
  beforeAll(async () => {
    child = await startModel(port, upstreamEnv(key));
  }, 150_000);
  afterAll(() => child?.kill());

  it("refuses inference without a key (401), even from a web page's origin", async () => {
    expect((await statusOf(`${base}/v1/chat/completions`, post(null))).status).toBe(401);
    expect((await statusOf(`${base}/v1/chat/completions`, post(null, { origin: "http://evil.example" }))).status).toBe(401);
    expect((await statusOf(`${base}/completion`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"prompt":"x","n_predict":1}' })).status).toBe(401);
  });

  it("refuses a wrong key (401)", async () => {
    expect((await statusOf(`${base}/v1/chat/completions`, post(newApiKey()))).status).toBe(401);
  });

  it("has /slots off: 401 without the key, 501 with it", async () => {
    expect((await statusOf(`${base}/slots`)).status).toBe(401);
    expect((await statusOf(`${base}/slots`, { headers: { authorization: `Bearer ${key}` } })).status).toBe(501);
  });

  it("answers with the key, and the launcher's own lock check passes", async () => {
    expect((await statusOf(`${base}/v1/chat/completions`, post(key))).status).toBe(200);
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port, key })).resolves.toEqual({ keylessRefused: true, wrongKeyRefused: true, slotsDisabled: true });
  }, 60_000);
});

describe.skipIf(!LIVE)("the same binary started WITHOUT the key — what the launcher must refuse", () => {
  const port = 18979;
  let child;
  beforeAll(async () => {
    // The failure B1 guards against: a model server whose key never got configured.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^LLAMA_/i.test(k)));
    child = await startModel(port, env);
  }, 150_000);
  afterAll(() => child?.kill());

  it("answers anyone, so the launcher's lock check refuses it", async () => {
    expect((await statusOf(`http://127.0.0.1:${port}/v1/chat/completions`, post(null))).status).toBe(200);
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port, key: newApiKey() })).rejects.toThrow(/not locked \(keyless → 200/);
  }, 60_000);
});
