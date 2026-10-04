/**
 * THE REAL-FRAME DIGEST IN THE J7 STREAM EVIDENCE.
 *
 * J7's G4 asks whether three passes over one frame produce identical boxes. Run 1 recorded the boxes
 * and not the frame, so a G4 failure could not be attributed: a differing box set is equally
 * consistent with runtime non-determinism over one frame and with two different frames. The evidence
 * now carries `capture.frameSha256` per pass, and that distinction becomes decidable.
 *
 * WHERE THE DIGEST COMES FROM, because it is the whole point. It is taken inside the realm that holds
 * the pixels — `apps/extension/probe/tr01.ts`, in the `onMaskPlanned` hook that `sanitizeFrame` fires
 * after both detectors have read the buffer and before the mask overwrites a byte — and only the hex
 * string crosses to Node. It is NOT recomputed from a screenshot, an encoded WebP, the dimensions or
 * the byte count, and it CANNOT be computed in Node: the service worker never receives frame pixels,
 * which is itself an enforced gate (`serviceWorkerSawNoPixels`).
 *
 * So the two checks that matter here are over REAL RECORDED CAPTURES, not over a second copy of
 * SHA-256. Six different held-out frames at one device scale share their width, height, byte count,
 * dpr and scaleToCss exactly; only their pixels differ. If the recorded digest were a hash of
 * anything but those pixels, those six values would collide. That collision is what `distinct`
 * below would catch, and no amount of correct hashing in this file could.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const M12_LOGS = join(ROOT, "artifacts", "experiments", "M12-qg04-enforcement", "logs");
const HARNESS = join(ROOT, "tests", "browser", "extension", "run-stream-re1.mjs");

const HEX64 = /^[0-9a-f]{64}$/;
const hex = (b) => createHash("sha256").update(b).digest("hex");

/**
 * Every stream record on disk that carries the per-pass digest, whichever workstation wrote it.
 *
 * Deliberately NOT workstation-resolved: these are committed artifacts whose internal consistency
 * holds wherever they are read, and a machine with no record of its own must skip rather than refuse.
 * Records predating the field are filtered out — they are evidence of the gap, not of a regression.
 */
const records = (existsSync(M12_LOGS) ? readdirSync(M12_LOGS) : [])
  .filter((f) => /cft-stream-re1.*\.json$/.test(f))
  .map((f) => ({ file: f, record: JSON.parse(readFileSync(join(M12_LOGS, f), "utf8")) }))
  .map(({ file, record }) => ({
    file,
    passes: (record.cells ?? []).flatMap((c) =>
      (c.images ?? []).flatMap((i) => (i.passes ?? []).map((p, index) => ({ dpr: c.dpr, image: i.image, index, ...p })))
    ),
  }))
  .filter(({ passes }) => passes.some((p) => p.capture && "frameSha256" in p.capture));

describe("the SHA-256 the probe reports for a captured frame", () => {
  it("is 64 lowercase hexadecimal characters", () => {
    expect(hex(Buffer.alloc(4))).toMatch(HEX64);
    expect(hex(Buffer.from("not a frame"))).toMatch(HEX64);
  });

  it("is the same for the same byte sequence", () => {
    const rgba = Buffer.from([0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0xff]);
    expect(hex(rgba)).toBe(hex(Buffer.from(rgba)));
  });
});

describe("the harness records the probe's digest rather than computing one", () => {
  const source = readFileSync(HARNESS, "utf8");

  it("assigns capture.frameSha256 straight from the probe's returned value", () => {
    expect(source).toContain("frameSha256: r.rawRgbaSha256 ?? null");
  });

  it("never hashes anything in Node but a file on disk", () => {
    // Both existing Node-side hashes are over held-out PNGs and build outputs read from disk. A frame
    // digest computed here would mean the pixels reached the harness, which the privacy boundary forbids.
    const calls = [...source.matchAll(/createHash\("sha256"\)\.update\(([^;]*?)\)\.digest/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) expect(arg).toMatch(/readFileSync\(/);
  });
});

describe.skipIf(records.length === 0)("the digests recorded by a real browser run", () => {
  if (records.length === 0) console.warn("frame digest: no stream record carries capture.frameSha256 yet — the recorded-evidence layer was SKIPPED");

  it("is present and well-formed on every pass that planned a mask", () => {
    for (const { file, passes } of records) {
      const masked = passes.filter((p) => p.detectorRan === true && p.failClosed === false);
      expect(masked.length, `${file}: no pass ran the detector`).toBeGreaterThan(0);
      for (const p of masked) {
        expect(p.capture.frameSha256, `${file} dpr=${p.dpr} ${p.image} pass=${p.index}`).toMatch(HEX64);
      }
      // Recorded per pass, not once per image: attribution needs all three.
      for (const p of passes) expect(p.capture, `${file} dpr=${p.dpr} ${p.image} pass=${p.index}`).toHaveProperty("frameSha256");
    }
  });

  it("differs between frames whose pixels differ, at identical dimensions and byte count", () => {
    let compared = 0;
    for (const { file, passes } of records) {
      for (const dpr of [...new Set(passes.map((p) => p.dpr))]) {
        // One pass index per image, so this compares frames and not repeats of one frame.
        const first = passes.filter((p) => p.dpr === dpr && p.index === 0 && typeof p.capture?.frameSha256 === "string");
        if (first.length < 2) continue;
        const where = `${file} dpr=${dpr}`;
        // The premise: these captures are indistinguishable by every field except the digest.
        const shape = [...new Set(first.map((p) => `${p.capture.w}x${p.capture.h}:${p.capture.bytes}:${p.capture.dpr}:${p.capture.scaleToCss}`))];
        if (shape.length !== 1) continue;
        expect(new Set(first.map((p) => p.capture.frameSha256)).size, `${where}: ${first.length} different frames, ${shape[0]}`).toBe(first.length);
        compared += first.length;
      }
    }
    expect(compared, "no record held two comparable frames at one device scale").toBeGreaterThan(0);
  });
});
