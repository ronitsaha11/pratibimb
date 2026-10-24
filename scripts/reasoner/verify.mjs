/**
 * Before anything starts: is what is on disk exactly what `pin.json` pins?
 *
 * Every check reads the bytes; nothing is taken from a filename, a size alone, or a previous run.
 * A failure names what is wrong and how to fix it, and starts nothing.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { zipEntries } from "./zip.mjs";

export class PinError extends Error {
  name = "PinError";
}

/** SHA-256 of a file, streamed: the weights are ~490 MB. */
export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyModel(root, pin) {
  const path = join(root, pin.model.path);
  if (!existsSync(path)) {
    throw new PinError(`model not found at ${pin.model.path}. Fetch it with: node artifacts/experiments/LOOP-2-local-reasoner-egress/harness/fetch-model.mjs`);
  }
  const bytes = statSync(path).size;
  if (bytes !== pin.model.bytes) throw new PinError(`model at ${pin.model.path} is ${bytes} bytes; the pin says ${pin.model.bytes}. Refusing to start.`);
  const sha256 = await sha256File(path);
  if (sha256 !== pin.model.sha256) throw new PinError(`model at ${pin.model.path} does not match the pinned SHA-256 (${pin.model.sha256.slice(0, 12)}…). Refusing to start.`);
  return { path, bytes, sha256 };
}

/**
 * The runtime: the pinned release archive's SHA-256, then every installed `.exe` and `.dll` against
 * the same-named file inside that archive. `llama-server.exe` is a 9 KiB loader; the server is in
 * the DLLs, so all of them are checked.
 */
export async function verifyRuntime(root, pin) {
  const zip = join(root, pin.runtime.zip);
  const dir = join(root, pin.runtime.dir);
  const binary = join(dir, pin.runtime.binary);
  if (!existsSync(zip) || !existsSync(binary)) {
    throw new PinError(`llama.cpp ${pin.runtime.build} not found under ${pin.runtime.dir}. Fetch it with: node artifacts/experiments/LOOP-2-local-reasoner-egress/harness/fetch-model.mjs`);
  }
  const zipSha = await sha256File(zip);
  if (zipSha !== pin.runtime.zipSha256) throw new PinError(`${pin.runtime.zip} does not match the pinned SHA-256. Refusing to start.`);
  const entries = new Map(zipEntries(readFileSync(zip)).map((entry) => [entry.name.split("/").pop(), entry]));
  const installed = readdirSync(dir).filter((name) => /\.(exe|dll)$/i.test(name));
  for (const name of installed) {
    const entry = entries.get(name);
    if (!entry) throw new PinError(`${pin.runtime.dir}/${name} is not part of the pinned release. Refusing to start.`);
    if ((await sha256File(join(dir, name))) !== entry.sha256) throw new PinError(`${pin.runtime.dir}/${name} differs from the pinned release. Refusing to start.`);
  }
  if (!installed.includes(pin.runtime.binary)) throw new PinError(`${pin.runtime.binary} is missing from ${pin.runtime.dir}.`);
  return { binary, files: installed.length, zipSha256: zipSha };
}
