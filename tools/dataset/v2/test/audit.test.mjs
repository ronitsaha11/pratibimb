/**
 * M22.5 — the PNG decoder the candidate audit relies on, and the audit's refusals. No dataset file
 * is read here: PNGs are encoded in memory, and the refusal runs name a candidate that does not exist.
 */
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../png.mjs";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const AUDIT = fileURLToPath(new URL("../audit-candidate.mjs", import.meta.url));

const pattern = (w, h) => Uint8Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));

describe("decodePng", () => {
  it("round-trips an RGBA image through the encoder", () => {
    const px = pattern(7, 5);
    const img = decodePng(encodePng(7, 5, px));
    expect([img.w, img.h]).toEqual([7, 5]);
    expect(Buffer.from(img.rgba).equals(Buffer.from(px))).toBe(true);
  });
  it("decodes 8-bit RGB with every scanline filter", () => {
    // Hand-built RGB stream: 3 × 5 pixels, rows filtered 0..4, each row's raw bytes chosen so the
    // filtered bytes are simple to state.
    const w = 3;
    const rows = [
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], // none
      [1, 1, 2, 3, 1, 1, 1, 1, 1, 1], // sub
      [2, 5, 5, 5, 5, 5, 5, 5, 5, 5], // up
      [3, 0, 0, 0, 0, 0, 0, 0, 0, 0], // average
      [4, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Paeth
    ];
    const raw = Buffer.from(rows.flat());
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(rows.length, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const png = withChunks([["IHDR", ihdr], ["IDAT", deflateSync(raw)], ["IEND", Buffer.alloc(0)]]);
    const img = decodePng(png);
    const rgb = (y) => [...img.rgba.subarray(y * w * 4, (y + 1) * w * 4)].filter((_, i) => i % 4 !== 3);
    expect(rgb(0)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(rgb(1)).toEqual([1, 2, 3, 2, 3, 4, 3, 4, 5]); // sub: each byte + the byte 3 to its left
    expect(rgb(2)).toEqual([6, 7, 8, 7, 8, 9, 8, 9, 10]); // up: + the byte above
    expect(rgb(3)).toEqual([3, 3, 4, 5, 5, 6, 6, 7, 8]); // average of left and above, floored
    expect(rgb(4)).toEqual([3, 3, 4, 5, 5, 6, 6, 7, 8]); // Paeth picks the predictor closest to a + b − c
  });
  it("refuses a bad signature, a corrupted chunk, truncation and unsupported formats", () => {
    const good = encodePng(4, 4, pattern(4, 4));
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/signature/);
    const flipped = Buffer.from(good);
    flipped[40] ^= 0xff; // inside IDAT
    expect(() => decodePng(flipped)).toThrow(/CRC mismatch/);
    expect(() => decodePng(good.subarray(0, good.length - 6))).toThrow(/truncated|IEND/);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 16;
    ihdr[9] = 2;
    expect(() => decodePng(withChunks([["IHDR", ihdr], ["IDAT", deflateSync(Buffer.alloc(7))], ["IEND", Buffer.alloc(0)]]))).toThrow(/unsupported/);
  });
});

describe("audit-candidate refuses before reading anything", () => {
  const run = (args) => {
    try {
      execFileSync(process.execPath, [AUDIT, ...args], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, err: "" };
    } catch (e) {
      return { code: e.status, err: String(e.stderr) };
    }
  };
  it("without a candidate number, or with one that does not exist", () => {
    expect(run([]).err).toMatch(/--candidate=<n> is required/);
    expect(run(["--candidate=0"]).err).toMatch(/--candidate=<n> is required/);
    const r = run(["--candidate=99999"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/does not exist/);
  });
  it("with contact sheets requested inside the repository", () => {
    expect(run(["--candidate=99999", `--sheets=${REPO}`]).err).toMatch(/does not exist|outside the repository/);
  });
});

/** A PNG from [type, body] chunks, with correct CRCs. */
function withChunks(chunks) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig];
  for (const [type, body] of chunks) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    parts.push(head, body, crc);
  }
  return Buffer.concat(parts);
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
