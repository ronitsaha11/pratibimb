/**
 * M20 B1 — the model server is locked by a per-launch key, and the launcher fails closed without it.
 *
 * Unit level: the key, the child's arguments and environment, the front's forwarder, and the lock
 * check against stand-in model servers on real loopback sockets. The pinned binary's own behaviour
 * is checked by `upstream.live.test.mjs`. Every status asserted here is a status a server actually
 * sent; a connection error is never read as a refusal.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createFront } from "./front.mjs";
import { AuthSetupError, assertUpstreamLocked, newApiKey, upstreamArgs, upstreamEnv, upstreamForwarder } from "./upstream.mjs";
import { PinError } from "./verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(readFileSync(join(HERE, "pin.json"), "utf8"));
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((ok) => s.close(ok))));
});

/** A stand-in model server on a free loopback port. `answer(req)` → [status, body]. */
async function standIn(answer) {
  const seen = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization ?? null, headers: Object.keys(req.headers) });
      const [status, body] = answer(req);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  servers.push(server);
  return { port: server.address().port, seen };
}

/** What the pinned b10956 build does with a key and `--no-slots` (measured in M20). */
const lockedLike = (key) => (req) => {
  if (req.url === "/health") return [200, '{"status":"ok"}'];
  if (req.headers.authorization !== `Bearer ${key}`) return [401, '{"error":{"code":401}}'];
  if (req.url === "/slots") return [501, '{"error":{"code":501}}'];
  return [200, '{"choices":[{"message":{"content":"{}"}}]}'];
};

describe("the key", () => {
  it("is 256 bits from the secure source, base64url, different every launch", () => {
    const a = newApiKey();
    const b = newApiKey();
    expect(a).toMatch(KEY_SHAPE);
    expect(b).toMatch(KEY_SHAPE);
    expect(a).not.toBe(b);
  });

  it("refuses to start when the random source fails or is short", () => {
    expect(() =>
      newApiKey(() => {
        throw new Error("no entropy");
      })
    ).toThrow(AuthSetupError);
    expect(() => newApiKey(() => Buffer.alloc(16))).toThrow(/not 32 random bytes/);
    // A refusal to start is a pin-class error: the launcher exits 2 and starts nothing.
    expect(new AuthSetupError("x")).toBeInstanceOf(PinError);
  });
});

describe("the model server's launch", () => {
  it("binds the pinned loopback address, keeps the pin's arguments, adds --no-slots, and never carries the key", () => {
    const args = upstreamArgs("model.gguf", PIN);
    expect(args.slice(0, 6)).toEqual(["-m", "model.gguf", "--host", "127.0.0.1", "--port", "8977"]);
    expect(args).toEqual(expect.arrayContaining([...PIN.upstream.args, "--no-slots"]));
    expect(args.some((a) => /api|key/i.test(a))).toBe(false);
  });

  it("gets the key through its environment only, with every other LLAMA_* setting removed", () => {
    const key = newApiKey();
    const env = upstreamEnv(key, { PATH: "p", LLAMA_API_KEY: "from-the-shell", LLAMA_ARG_HOST: "0.0.0.0", llama_arg_endpoint_slots: "1", HOME: "h" });
    expect(env).toEqual({ PATH: "p", HOME: "h", LLAMA_API_KEY: key });
  });

  it("refuses to build an environment without a valid key — no unauthenticated fallback", () => {
    for (const bad of [undefined, "", "short", 42, "x".repeat(44)]) expect(() => upstreamEnv(bad, {})).toThrow(AuthSetupError);
  });

  it("the launcher spawns with that environment, checks the lock before the front listens, and never prints the key", () => {
    const launcher = readFileSync(join(HERE, "reasoner.mjs"), "utf8");
    const at = (s) => launcher.indexOf(s);
    expect(at("const key = newApiKey();")).toBeGreaterThan(0);
    expect(at("env: upstreamEnv(key)")).toBeGreaterThan(at("const key = newApiKey();"));
    expect(at("await assertUpstreamLocked(")).toBeGreaterThan(at("await waitHealthy("));
    expect(at("front.server = createFront(")).toBeGreaterThan(at("await assertUpstreamLocked("));
    // In code (comments aside) the key appears exactly four times: made, handed to the child's
    // environment, to the lock check and to the forwarder. None of those lines prints or stores it.
    const code = launcher.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    // The identifier, not the word: string literals (such as the health text) are blanked first.
    const keyLines = code.filter((l) => /\bkey\b/.test(l.replace(/"[^"]*"/g, '""')));
    expect(keyLines.map((l) => l.trim())).toEqual([
      "const key = newApiKey();",
      '{ stdio: "ignore", windowsHide: true, env: upstreamEnv(key) }',
      "await assertUpstreamLocked({ host: PIN.upstream.host, port: PIN.upstream.port, key });",
      "forward: upstreamForwarder({ host: PIN.upstream.host, port: PIN.upstream.port, key }),",
    ]);
    for (const line of keyLines) {
      expect(line, line).not.toMatch(/say\(|console\.|writeFileSync|STATE_FILE|throw /);
    }
    expect(launcher).not.toMatch(/process\.env\.LLAMA_API_KEY\s*=/);
  });
});

describe("the front's forwarder", () => {
  it("sends the launcher's key and drops the browser's Authorization header", async () => {
    const key = newApiKey();
    const model = await standIn(lockedLike(key));
    const front = createFront({
      endpoint: { host: "127.0.0.1", port: 0, path: "/v1/chat/completions" },
      forward: upstreamForwarder({ host: "127.0.0.1", port: model.port, key }),
      health: () => ({}),
    });
    await new Promise((ok) => front.listen(0, "127.0.0.1", ok));
    servers.push(front);
    const port = front.address().port;
    // The front checks its own Host; build one for the port it actually bound.
    const { request } = await import("node:http");
    const status = await new Promise((done, fail) => {
      const r = request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/v1/chat/completions",
          headers: { host: `127.0.0.1:0`, "content-type": "application/json", authorization: "Bearer attacker-supplied", "x-forwarded-for": "1.2.3.4" },
        },
        (res) => {
          res.resume();
          res.on("end", () => done(res.statusCode));
        }
      );
      r.on("error", fail);
      r.end("{}");
    });
    expect(status).toBe(200);
    expect(model.seen).toHaveLength(1);
    expect(model.seen[0].authorization).toBe(`Bearer ${key}`);
    expect(model.seen[0].headers).not.toContain("x-forwarded-for");
  });

  it("is handed the path and the body only, so no incoming header can reach the model server", () => {
    const front = readFileSync(join(HERE, "front.mjs"), "utf8");
    expect(front).toContain("upstream = await forward(path, body);");
    expect(front.match(/forward\(/g)).toHaveLength(1);
  });
});

describe("the launcher fails closed", () => {
  it("accepts a model server that refuses keyless and wrong-keyed requests and has /slots off", async () => {
    const key = newApiKey();
    const model = await standIn(lockedLike(key));
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port: model.port, key })).resolves.toEqual({ keylessRefused: true, wrongKeyRefused: true, slotsDisabled: true });
    // The key went only into the /slots request; the wrong key was a fresh random one.
    const auth = model.seen.map((s) => s.authorization);
    expect(auth[0]).toBeNull();
    expect(auth[1]).not.toBe(`Bearer ${key}`);
    expect(auth[2]).toBe(`Bearer ${key}`);
  });

  it("refuses a model server that answers without the key — the B1 configuration", async () => {
    const key = newApiKey();
    const open = await standIn((req) => (req.url === "/slots" ? [200, "[]"] : [200, "{}"]));
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port: open.port, key })).rejects.toThrow(/not locked \(keyless → 200, wrong key → 200, \/slots → 200/);
  });

  it("refuses a model server that is keyed but still exposes /slots", async () => {
    const key = newApiKey();
    const slotsOn = await standIn((req) => (req.headers.authorization !== `Bearer ${key}` ? [401, "{}"] : [200, "[]"]));
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port: slotsOn.port, key })).rejects.toThrow(/\/slots → 200/);
  });

  it("refuses when nothing answers: an unreachable model server is not a locked one", async () => {
    const key = newApiKey();
    const gone = await standIn(lockedLike(key));
    const port = gone.port;
    await new Promise((ok) => servers.pop().close(ok));
    await expect(assertUpstreamLocked({ host: "127.0.0.1", port, key })).rejects.toThrow(/keyless → null, wrong key → null, \/slots → null/);
  });

  it("never puts the key in its refusal", async () => {
    const key = newApiKey();
    const open = await standIn(() => [200, "{}"]);
    const error = await assertUpstreamLocked({ host: "127.0.0.1", port: open.port, key }).catch((e) => e);
    expect(String(error.message).includes(key)).toBe(false);
  });
});
