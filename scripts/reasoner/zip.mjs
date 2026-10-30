/**
 * The smallest ZIP reader that can answer one question: what are the bytes of each file in the
 * pinned llama.cpp release archive?
 *
 * The runtime directory holds a 9 KiB `llama-server.exe` that loads the server from DLLs beside it,
 * so checking the executable alone would prove little. The launcher instead checks every installed
 * `.exe` and `.dll` against the same-named entry in the pinned archive (whose own SHA-256 is pinned).
 * No dependency: the central directory is parsed by hand and entries are inflated with `node:zlib`.
 * Only stored (0) and deflated (8) entries are supported; anything else is refused, not guessed.
 */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Every file entry in the archive: its name and the SHA-256 and length of its uncompressed bytes. */
export function zipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no end-of-central-directory record");
  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== CENTRAL) throw new Error("zip: malformed central directory");
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (buffer.readUInt32LE(localAt) !== LOCAL) throw new Error(`zip: malformed local header for ${name}`);
    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    const raw = buffer.subarray(dataAt, dataAt + compressed);
    let bytes;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = inflateRawSync(raw);
    else throw new Error(`zip: ${name} uses compression method ${method}, which this reader does not support`);
    if (bytes.length !== size) throw new Error(`zip: ${name} inflated to ${bytes.length} bytes, expected ${size}`);
    entries.push({ name, size, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return entries;
}
