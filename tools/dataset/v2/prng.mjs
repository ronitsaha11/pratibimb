/**
 * Deterministic randomness and hashing for the v2 generator. No `Math.random`, no clock.
 *
 * SEEDS (M22.3). A seed is the SHA-256 digest, 64 hex characters, of an IDENTITY: a JSON array such as
 * `["t1-ui-synthetic", "<version>", "sample", "<split>", <index>]`, serialised canonically. The array
 * form is unambiguous: no choice of strings can make two different identities serialise alike, as a
 * `"|"`-joined string could. Until M22.3 a seed was a 32-bit FNV-1a value of a `"|"`-joined string,
 * and seeded a PRNG with 32 bits of state. For random 32-bit values one collision is a coin toss by
 * about 77,000 seeds. On M22.2's actual TRAIN and DEV identity strings none occurred up to 1,000,000
 * (measured, M22.3), so this change removes a bound; it does not fix an observed collision.
 *
 * STREAMS. A sample draws from named, independent streams of its seed (`rngOf(seed, "layout")`,
 * `rngOf(seed, "appearance")`, …). Each stream's 128-bit state is the first 128 bits of
 * SHA-256(canonical JSON of [seed, stream]); the generator is xoshiro128**. Drawing more from one
 * stream never shifts another.
 */
import { createHash } from "node:crypto";

export const SEED_SCHEME = "sha256(canonical-json(identity))";
export const PRNG = "xoshiro128** per named stream; state = first 128 bits of sha256(canonical-json([seed, stream]))";

/**
 * JSON with keys sorted at every level, so equal content always serialises equally. STRICT: refuses
 * anything JSON would drop or silently change — `undefined` (in an object or an array), a function, a
 * symbol, a bigint, a non-finite number, an array hole, or an object that is not a plain object
 * (Date, Map, a class instance) — instead of emitting invalid or lossy JSON.
 */
export function canonicalJson(v, path = "$") {
  if (v === null) return "null";
  switch (typeof v) {
    case "string":
    case "boolean":
      return JSON.stringify(v);
    case "number":
      if (!Number.isFinite(v)) throw new Error(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(v);
    case "object":
      break;
    default:
      throw new Error(`canonicalJson: ${typeof v} at ${path} has no JSON form`);
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i += 1) {
      if (!(i in v)) throw new Error(`canonicalJson: array hole at ${path}[${i}]`);
      out.push(canonicalJson(v[i], `${path}[${i}]`));
    }
    return `[${out.join(",")}]`;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new Error(`canonicalJson: non-plain object at ${path}`);
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k], `${path}.${k}`)}`)
    .join(",")}}`;
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The seed of an identity (a JSON array of strings and integers): 64 hex characters. */
export function seedOf(identity) {
  if (!Array.isArray(identity) || identity.length === 0 || identity.some((x) => typeof x !== "string" && !Number.isInteger(x))) {
    throw new Error("seedOf: identity must be a non-empty array of strings and integers");
  }
  return sha256(canonicalJson(identity));
}

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

/** xoshiro128** (Blackman and Vigna), over four 32-bit words. Returns uint32 values. */
export function xoshiro128ss(s0, s1, s2, s3) {
  let a = s0 | 0;
  let b = s1 | 0;
  let c = s2 | 0;
  let d = s3 | 0;
  if ((a | b | c | d) === 0) throw new Error("xoshiro128**: the all-zero state is not allowed");
  return () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };
}

/** A small toolkit over one named stream of a seed. */
export function rngOf(seed, stream) {
  if (typeof seed !== "string" || !/^[0-9a-f]{64}$/.test(seed)) throw new Error("rngOf: seed must be 64 hex characters (from seedOf)");
  if (typeof stream !== "string" || stream.length === 0) throw new Error("rngOf: a stream name is required");
  const h = sha256(canonicalJson([seed, stream]));
  const u32 = xoshiro128ss(...[0, 8, 16, 24].map((i) => Number.parseInt(h.slice(i, i + 8), 16)));
  const next = () => u32() / 4294967296;
  return {
    next,
    between: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Fisher–Yates on a copy. */
    shuffle: (list) => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
