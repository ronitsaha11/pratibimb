/**
 * The model server behind the front, and the key that keeps everything else out of it.
 *
 * WHY A KEY. `llama-server` binds 127.0.0.1, but loopback binding alone keeps out only other
 * machines. Any local process can reach the port, and so can a web page in the person's browser:
 * the pinned b10956 build answers CORS for every origin by default (`--cors-origins` defaults to `*`)
 * and exposes `/slots`. The front's origin, Host and tripwire checks guard 8995 only. So the model
 * server now requires a key:
 *
 * - generated per launch from the OS's secure random source;
 * - handed to the child only through its environment (`LLAMA_API_KEY`), never its command line;
 * - held by the launcher in memory and attached by the front's forwarder itself — an incoming
 *   request's headers never reach the model server;
 * - never printed, logged, written to the state file, or put in an error message.
 *
 * `--no-slots` turns the slots-monitoring endpoint off as well. Measured on b10956 (M20): with the
 * key set, every endpoint except `/health` answers 401 without the key or with a wrong one, and
 * `/slots` answers 501 even with the right one.
 *
 * FAIL CLOSED. Before the front starts, `assertUpstreamLocked` asks the running model server to
 * refuse a keyless and a wrong-keyed request and to report `/slots` disabled. If any of the three
 * does not happen, the launcher stops the model server and refuses to start. There is no
 * unauthenticated fallback.
 */
import { randomBytes } from "node:crypto";

import { PinError } from "./verify.mjs";

export class AuthSetupError extends PinError {
  name = "AuthSetupError";
}

/** 256 bits from the OS CSPRNG, as base64url (43 characters). Refuses anything shorter. */
export function newApiKey(random = randomBytes) {
  let bytes;
  try {
    bytes = random(32);
  } catch {
    throw new AuthSetupError("could not generate the model server's key. Refusing to start.");
  }
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new AuthSetupError("the model server's key was not 32 random bytes. Refusing to start.");
  return bytes.toString("base64url");
}

/** The model server's arguments: the pin's, plus `--no-slots`. The key is never among them. */
export const upstreamArgs = (modelPath, pin) => ["-m", modelPath, "--host", pin.upstream.host, "--port", String(pin.upstream.port), ...pin.upstream.args, "--no-slots"];

/**
 * The child's environment: the parent's, minus every `LLAMA_*` variable (so nothing in the person's
 * shell can loosen the server's configuration), plus the key.
 */
export function upstreamEnv(key, base = process.env) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new AuthSetupError("no valid key for the model server. Refusing to start.");
  const env = Object.fromEntries(Object.entries(base).filter(([name]) => !/^LLAMA_/i.test(name)));
  return { ...env, LLAMA_API_KEY: key };
}

/** The front's forwarder. It builds the upstream request's headers itself; nothing is copied in. */
export const upstreamForwarder = ({ host, port, key }) => async (path, body) => {
  const reply = await fetch(`http://${host}:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body,
  });
  return { status: reply.status, text: await reply.text() };
};

/**
 * Ask the running model server to prove it is locked. Statuses only: no body is read beyond being
 * drained, and the key goes only into the one request that is meant to carry it.
 */
export async function assertUpstreamLocked({ host, port, key }) {
  const url = (path) => `http://${host}:${port}${path}`;
  const status = async (path, init) => {
    try {
      const reply = await fetch(url(path), init);
      await reply.arrayBuffer();
      return reply.status;
    } catch {
      return null;
    }
  };
  const probe = JSON.stringify({ messages: [{ role: "user", content: "probe" }], max_tokens: 1 });
  const json = { "content-type": "application/json" };
  const keyless = await status("/v1/chat/completions", { method: "POST", headers: json, body: probe });
  const wrong = await status("/v1/chat/completions", { method: "POST", headers: { ...json, authorization: `Bearer ${newApiKey()}` }, body: probe });
  const slots = await status("/slots", { headers: { authorization: `Bearer ${key}` } });
  const locked = { keylessRefused: keyless === 401, wrongKeyRefused: wrong === 401, slotsDisabled: slots === 501 };
  if (!Object.values(locked).every(Boolean)) {
    throw new AuthSetupError(
      `the model server is not locked (keyless → ${keyless}, wrong key → ${wrong}, /slots → ${slots}; expected 401, 401, 501). Refusing to start.`
    );
  }
  return locked;
}
