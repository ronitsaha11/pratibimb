/**
 * M20 — the product reasoner launcher: its pins, its address, and every refusal of its front.
 *
 * The front is tested over a real loopback socket with an injected upstream, so what is checked is
 * the HTTP behaviour the extension meets — not a mocked handler. The model itself is exercised by the
 * integration check in `artifacts/experiments/M20-runnable-measured-product/`, not here.
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { MAX_BODY_BYTES, createFront } from "./front.mjs";
import { PinError, verifyModel } from "./verify.mjs";
import { zipEntries } from "./zip.mjs";
import { tripwire } from "./tripwire.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PIN = JSON.parse(readFileSync(join(HERE, "pin.json"), "utf8"));
const EXTENSION = `chrome-extension://${"a".repeat(32)}`;

describe("the pin and the address", () => {
  it("serves exactly the endpoint the extension's CSP pins, built from the same two constants", () => {
    const config = readFileSync(join(ROOT, "apps/extension/wxt.config.ts"), "utf8");
    const origin = /export const HOST_COLLECTOR_ORIGIN = "([^"]+)"/.exec(config)?.[1];
    const path = /export const HOST_REASONER_PATH = "([^"]+)"/.exec(config)?.[1];
    expect(`http://${PIN.endpoint.host}:${PIN.endpoint.port}${PIN.endpoint.path}`).toBe(`${origin}${path}`);
  });

  it("binds loopback only, for the front and for the model, and nowhere names a wildcard address", () => {
    expect(PIN.endpoint.host).toBe("127.0.0.1");
    expect(PIN.upstream.host).toBe("127.0.0.1");
    const sources = readdirSync(HERE).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
    for (const f of sources) {
      const code = readFileSync(join(HERE, f), "utf8");
      expect(code.includes("0.0.0.0"), f).toBe(false);
      expect(/::\b|"::"|'::'/.test(code), f).toBe(false);
    }
    const launcher = readFileSync(join(HERE, "reasoner.mjs"), "utf8");
    expect(launcher).toContain('"--host", PIN.upstream.host');
    expect(launcher).toContain("front.server.listen(PIN.endpoint.port, PIN.endpoint.host, ok)");
  });

  it("pins the same model every recorded run used", () => {
    expect(PIN.model.sha256).toBe("74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db");
    expect(PIN.model.revision).toBe("9217f5db79a29953eb74d5343926648285ec7e67");
    const fetcher = readFileSync(join(ROOT, "artifacts/experiments/LOOP-2-local-reasoner-egress/harness/fetch-model.mjs"), "utf8");
    expect(fetcher).toContain(`revision: "${PIN.model.revision}"`);
    expect(fetcher).toContain(`build: "${PIN.runtime.build}"`);
  });

  it("discards the model server's output rather than logging it", () => {
    const launcher = readFileSync(join(HERE, "reasoner.mjs"), "utf8");
    expect(launcher).toMatch(/\{ stdio: "ignore", windowsHide: true \}/);
  });
});

/** Start a front on a free loopback port with an injected upstream. */
async function frontFor(forward = async () => ({ status: 200, text: '{"choices":[]}' })) {
  const port = await new Promise((done) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const p = probe.address().port;
      probe.close(() => done(p));
    });
  });
  const seen = [];
  const reports = [];
  const server = createFront({
    endpoint: { host: "127.0.0.1", port, path: "/v1/chat/completions" },
    forward: async (path, body) => {
      seen.push({ path, body });
      return forward(path, body);
    },
    health: () => ({ status: "ok", service: "pratibimb-reasoner" }),
    onRequest: (r) => reports.push(r),
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  const url = (path) => `http://127.0.0.1:${port}${path}`;
  return { server, port, url, seen, reports };
}

let open = null;
afterEach(async () => {
  if (open) await new Promise((ok) => open.close(ok));
  open = null;
});

const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

describe("the front", () => {
  it("forwards a JSON request from the extension and returns the model's answer with a receipt", async () => {
    const f = await frontFor(async () => ({ status: 200, text: '{"choices":[{"message":{"content":"{}"}}]}' }));
    open = f.server;
    const body = JSON.stringify({ messages: [{ role: "user", content: "<PII:PHONE:1>" }] });
    const reply = await post(f.url("/v1/chat/completions"), body, { origin: EXTENSION });
    expect(reply.status).toBe(200);
    expect(reply.headers.get("access-control-allow-origin")).toBe(EXTENSION);
    expect(reply.headers.get("x-pratibimb-received-sha256")).toBe(createHash("sha256").update(body).digest("hex"));
    expect(f.seen).toEqual([{ path: "/v1/chat/completions", body }]);
  });

  it("answers health", async () => {
    const f = await frontFor();
    open = f.server;
    const reply = await fetch(f.url("/health"));
    expect(await reply.json()).toEqual({ status: "ok", service: "pratibimb-reasoner" });
  });

  it.each([
    ["a web page's origin", { origin: "http://127.0.0.1:8975" }, 403],
    ["a remote web origin", { origin: "https://example.com" }, 403],
    ["a malformed extension origin", { origin: "chrome-extension://not-an-id" }, 403],
  ])("refuses %s, and forwards nothing", async (_, headers, status) => {
    const f = await frontFor();
    open = f.server;
    const reply = await post(f.url("/v1/chat/completions"), "{}", headers);
    expect(reply.status).toBe(status);
    expect(f.seen).toEqual([]);
  });

  it("refuses a request addressed to another Host (DNS rebinding)", async () => {
    const f = await frontFor();
    open = f.server;
    const { request } = await import("node:http");
    const status = await new Promise((done) => {
      const r = request({ host: "127.0.0.1", port: f.port, path: "/v1/chat/completions", method: "POST", headers: { host: "attacker.example:8995", "content-type": "application/json" } }, (res) => done(res.statusCode));
      r.end("{}");
    });
    expect(status).toBe(421);
    expect(f.seen).toEqual([]);
  });

  it.each([
    ["another path", "POST", "/v1/completions", 404],
    ["GET on the endpoint", "GET", "/v1/chat/completions", 405],
    ["POST on health", "POST", "/health", 405],
  ])("refuses %s", async (_, method, path, status) => {
    const f = await frontFor();
    open = f.server;
    const reply = await fetch(f.url(path), { method, ...(method === "POST" ? { body: "{}", headers: { "content-type": "application/json" } } : {}) });
    expect(reply.status).toBe(status);
    expect(f.seen).toEqual([]);
  });

  it("refuses a body that is not JSON, or one over the size limit", async () => {
    const f = await frontFor();
    open = f.server;
    expect((await post(f.url("/v1/chat/completions"), "not json")).status).toBe(400);
    const big = JSON.stringify({ x: "y".repeat(MAX_BODY_BYTES) });
    const reply = await post(f.url("/v1/chat/completions"), big).catch(() => ({ status: 413 }));
    expect(reply.status).toBe(413);
    expect(f.seen).toEqual([]);
  });

  it("refuses value-shaped text before it reaches the model, and reports only the class", async () => {
    const f = await frontFor();
    open = f.server;
    const reply = await post(f.url("/v1/chat/completions"), JSON.stringify({ messages: [{ content: "call 9000000001" }] }), { origin: EXTENSION });
    expect(reply.status).toBe(422);
    expect(await reply.json()).toEqual({ error: "refused: the request carries value-shaped text", classes: ["PHONE"] });
    expect(f.seen).toEqual([]);
    expect(f.reports.at(-1)).toMatchObject({ status: 422, tripwire: ["PHONE"] });
  });

  it("reports an upstream failure as 502", async () => {
    const f = await frontFor(async () => {
      throw new Error("down");
    });
    open = f.server;
    expect((await post(f.url("/v1/chat/completions"), "{}")).status).toBe(502);
  });

  it("never hands a body or a model answer to its request log", async () => {
    const f = await frontFor(async () => ({ status: 200, text: '{"secret-shaped":"answer-text"}' }));
    open = f.server;
    await post(f.url("/v1/chat/completions"), JSON.stringify({ messages: [{ content: "<PII:NAME:1> request-text" }] }), { origin: EXTENSION });
    const logged = JSON.stringify(f.reports);
    expect(logged.includes("request-text")).toBe(false);
    expect(logged.includes("answer-text")).toBe(false);
    expect(Object.keys(f.reports[0]).sort()).toEqual(["bytesIn", "bytesOut", "method", "ms", "path", "status"]);
  });

  it("the tripwire is the shared one: the test front re-exports this module", () => {
    const testFront = readFileSync(join(ROOT, "tests/browser/demo/reasoner-service.mjs"), "utf8");
    expect(testFront).toContain('import { tripwire } from "../../../scripts/reasoner/tripwire.mjs";');
    expect(tripwire("<PII:PHONE:1> and 9000000001").map((t) => t.class)).toEqual(["PHONE"]);
  });
});

describe("pin verification refuses what is not pinned", () => {
  const fakeRoot = () => {
    const dir = mkdtempSync(join(tmpdir(), "pratibimb-pin-"));
    mkdirSync(join(dir, "models"), { recursive: true });
    return dir;
  };
  const pinFor = (bytes, sha256) => ({ model: { path: "models/m.gguf", bytes, sha256 } });

  it("a missing model, with how to fetch it", async () => {
    await expect(verifyModel(fakeRoot(), pinFor(4, "x"))).rejects.toThrow(/model not found .*fetch-model\.mjs/);
  });

  it("a model of the wrong size", async () => {
    const root = fakeRoot();
    writeFileSync(join(root, "models/m.gguf"), "abcd");
    await expect(verifyModel(root, pinFor(5, "x"))).rejects.toBeInstanceOf(PinError);
  });

  it("a model of the right size and the wrong bytes", async () => {
    const root = fakeRoot();
    writeFileSync(join(root, "models/m.gguf"), "abcd");
    const other = createHash("sha256").update("abce").digest("hex");
    await expect(verifyModel(root, pinFor(4, other))).rejects.toThrow(/does not match the pinned SHA-256/);
  });

  it("accepts exactly the pinned bytes", async () => {
    const root = fakeRoot();
    writeFileSync(join(root, "models/m.gguf"), "abcd");
    const sha = createHash("sha256").update("abcd").digest("hex");
    await expect(verifyModel(root, pinFor(4, sha))).resolves.toMatchObject({ bytes: 4, sha256: sha });
  });
});

describe("the zip reader the runtime check relies on", () => {
  /** A minimal valid zip with one stored and one deflated entry. */
  const buildZip = (files) => {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data, method } of files) {
      const body = method === 8 ? deflateRawSync(data) : data;
      const nameBuf = Buffer.from(name);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(method, 8);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(method, 10);
      central.writeUInt32LE(body.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt32LE(offset, 42);
      locals.push(local, nameBuf, body);
      centrals.push(central, nameBuf);
      offset += 30 + nameBuf.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, eocd]);
  };

  it("hashes stored and deflated entries by their uncompressed bytes", () => {
    const a = Buffer.from("loader");
    const b = Buffer.from("x".repeat(1000));
    const entries = zipEntries(buildZip([{ name: "bin/a.exe", data: a, method: 0 }, { name: "bin/b.dll", data: b, method: 8 }]));
    expect(entries).toEqual([
      { name: "bin/a.exe", size: a.length, sha256: createHash("sha256").update(a).digest("hex") },
      { name: "bin/b.dll", size: b.length, sha256: createHash("sha256").update(b).digest("hex") },
    ]);
  });

  it("refuses something that is not a zip", () => {
    expect(() => zipEntries(Buffer.alloc(64))).toThrow(/no end-of-central-directory/);
  });
});

describe("a busy port is reported, never taken", () => {
  it("portIsFree is false while something else holds the port, and the holder is untouched", async () => {
    const { portIsFree } = await import("./reasoner.mjs");
    const holder = createServer();
    const port = await new Promise((ok) => holder.listen(0, "127.0.0.1", () => ok(holder.address().port)));
    expect(await portIsFree(port)).toBe(false);
    expect(holder.listening).toBe(true);
    await new Promise((ok) => holder.close(ok));
    expect(await portIsFree(port)).toBe(true);
  });
});
