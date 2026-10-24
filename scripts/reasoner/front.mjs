/**
 * The product reasoner's front: the one address the extension may reach, and nothing else.
 *
 * The extension's CSP pins `connect-src` to exactly `http://127.0.0.1:8995/v1/chat/completions`
 * (ADR-0013). This front listens there — on 127.0.0.1 only — and forwards accepted requests to the
 * pinned `llama-server` on another loopback port. It is a filter in front of a model, not a second
 * client: every guarantee the client makes (sanitize, verify, egress guard, validate, bind, consent)
 * already happened before a byte reached it.
 *
 * WHAT IT GUARDS, AND WHAT IT DOES NOT. These checks guard this port only. The model server's port
 * is locked separately, by a per-launch key (`upstream.mjs`). `forward` is handed the path and the
 * body and nothing else, so no header of an incoming request — an `Authorization` header included —
 * can reach the model server; the launcher's forwarder attaches the key itself.
 *
 * WHAT IT ACCEPTS. `POST /v1/chat/completions` with a JSON body under a size limit, addressed to the
 * loopback host, from an extension page or from no browser page at all. `GET /health` for readiness.
 * `OPTIONS` preflights from an extension origin. Everything else is refused: other paths and methods
 * (404/405), a web page's origin (403 — a page on the user's machine may not drive their model), a
 * Host header that is not this loopback address (421, against DNS rebinding), an oversized body
 * (413). A body the tripwire finds value-shaped text in is REFUSED (422) and never reaches the model.
 *
 * WHAT IT LOGS. A line per request — status, sizes, latency, tripwire classes. Never a body, never a
 * prompt, never a model output: `onRequest` receives no text the request or response contained.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

import { tripwire } from "./tripwire.mjs";

/** A request is a few kilobytes of sanitized structure; anything near this is not one. */
export const MAX_BODY_BYTES = 256 * 1024;

const isExtensionOrigin = (origin) => typeof origin === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);

/**
 * Build the front. Pure enough to test: it forwards with the injected `forward` (the launcher
 * passes a fetch to the pinned upstream), and reports each request through `onRequest`.
 */
export function createFront({ endpoint, forward, health, onRequest = () => {}, now = () => performance.now() }) {
  const expectedHost = `${endpoint.host}:${endpoint.port}`;

  return createServer((request, response) => {
    const began = now();
    const origin = request.headers.origin;
    const report = (status, extra = {}) => onRequest({ method: request.method, path: request.url, status, ms: Math.round((now() - began) * 10) / 10, ...extra });
    const cors = isExtensionOrigin(origin)
      ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET, OPTIONS", "vary": "origin" }
      : {};
    const send = (status, body, extra = {}) => {
      const text = typeof body === "string" ? body : JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...cors, ...extra.headers });
      response.end(text);
      report(status, { bytesIn: extra.bytesIn ?? 0, bytesOut: Buffer.byteLength(text), ...(extra.tripwire ? { tripwire: extra.tripwire } : {}) });
    };

    if (request.headers.host !== expectedHost) return send(421, { error: "this service answers only on its loopback address" });
    if (origin !== undefined && !isExtensionOrigin(origin)) return send(403, { error: "only the PratiBimb extension may use this service" });

    const path = (request.url ?? "").split("?")[0];
    if (request.method === "OPTIONS" && (path === endpoint.path || path === "/health")) {
      response.writeHead(204, cors);
      response.end();
      return report(204);
    }
    if (path === "/health") {
      if (request.method !== "GET") return send(405, { error: "method not allowed" });
      return send(200, health());
    }
    if (path !== endpoint.path) return send(404, { error: "not found" });
    if (request.method !== "POST") return send(405, { error: "method not allowed" });

    const chunks = [];
    let size = 0;
    let refused = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !refused) {
        refused = true;
        send(413, { error: "request too large" }, { bytesIn: size });
        request.destroy();
        return;
      }
      if (!refused) chunks.push(chunk);
    });
    request.on("end", () => {
      if (refused) return;
      void (async () => {
        const raw = Buffer.concat(chunks);
        const body = raw.toString("utf8");
        const receipt = {
          "x-pratibimb-received-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
          "x-pratibimb-received-bytes": String(raw.length),
        };
        try {
          JSON.parse(body);
        } catch {
          return send(400, { error: "the body is not JSON" }, { bytesIn: raw.length, headers: receipt });
        }
        const hits = tripwire(body).map((hit) => hit.class);
        if (hits.length > 0) {
          // Fail closed: text shaped like a stored value never reaches the model. Classes only.
          return send(422, { error: "refused: the request carries value-shaped text", classes: hits }, { bytesIn: raw.length, tripwire: hits, headers: receipt });
        }
        let upstream;
        try {
          upstream = await forward(path, body);
        } catch {
          return send(502, { error: "the local model is not answering" }, { bytesIn: raw.length, headers: receipt });
        }
        return send(upstream.status, upstream.text, { bytesIn: raw.length, headers: receipt });
      })();
    });
  });
}
