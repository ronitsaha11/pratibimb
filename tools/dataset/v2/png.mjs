/**
 * A strict, minimal PNG decoder and encoder for auditing v2 frames (M22.5). Pure; Node's zlib only.
 *
 * Decoding checks the signature and EVERY chunk's CRC, requires IHDR first and IEND last, inflates
 * the IDAT stream and reverses the five scanline filters. It accepts what the renderer writes and
 * the audit needs: 8-bit truecolour (RGB) or truecolour with alpha (RGBA), not interlaced. Anything
 * else is refused, never guessed. The encoder writes 8-bit RGBA, filter 0, for contact sheets.
 */
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @returns { w, h, rgba: Uint8Array (w × h × 4) } */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("png: bad signature");
  let off = 8;
  let ihdr = null;
  const idat = [];
  let ended = false;
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error("png: truncated chunk");
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`png: truncated ${type}`);
    const body = buf.subarray(off + 8, off + 8 + len);
    if ((crc32(buf.subarray(off + 4, off + 8 + len)) >>> 0) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`png: CRC mismatch in ${type}`);
    if (!ihdr && type !== "IHDR") throw new Error("png: IHDR is not first");
    if (type === "IHDR") ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") {
      ended = true;
      off += 12 + len;
      break;
    }
    off += 12 + len;
  }
  if (!ended) throw new Error("png: no IEND");
  if (off !== buf.length) throw new Error("png: data after IEND");
  if (ihdr.depth !== 8 || ![2, 6].includes(ihdr.colour) || ihdr.interlace !== 0) {
    throw new Error(`png: unsupported format (depth ${ihdr.depth}, colour type ${ihdr.colour}, interlace ${ihdr.interlace})`);
  }
  const bpp = ihdr.colour === 6 ? 4 : 3;
  const stride = ihdr.w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== ihdr.h * (stride + 1)) throw new Error(`png: ${raw.length} bytes of image data, expected ${ihdr.h * (stride + 1)}`);
  const px = new Uint8Array(ihdr.h * stride);
  for (let y = 0; y < ihdr.h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i];
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y > 0 ? px[row - stride + i] : 0;
      const c = i >= bpp && y > 0 ? px[row - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`png: unknown filter ${f} on row ${y}`);
      px[row + i] = v & 0xff;
    }
  }
  if (bpp === 4) return { w: ihdr.w, h: ihdr.h, rgba: px };
  const rgba = new Uint8Array(ihdr.w * ihdr.h * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i];
    rgba[j + 1] = px[i + 1];
    rgba[j + 2] = px[i + 2];
    rgba[j + 3] = 255;
  }
  return { w: ihdr.w, h: ihdr.h, rgba };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** 8-bit RGBA, filter 0. */
export function encodePng(w, h, rgba) {
  if (rgba.length !== w * h * 4) throw new Error("png: pixel buffer does not match w × h × 4");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y += 1) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
