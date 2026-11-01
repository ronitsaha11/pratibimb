/**
 * v2 split architecture: each split independently addressable, nothing shared across splits, and
 * TEST sealed.
 *
 *   - One manifest and one frame folder PER SPLIT: `manifest-<split>.json`, `frames-<split>/`. An
 *     audit of TRAIN or DEV never needs a file that holds TEST.
 *   - Seeds derived from (version, split, index), and ids prefixed by split, so no seed or id can be
 *     shared by construction; `assertNoLeakage` checks it, and checks layouts too.
 *   - TEST is planned only with an explicit seal token, for the one sealed build; the audit reader
 *     refuses TEST before it touches the filesystem, and opens only one exact file name — it never
 *     lists a directory.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPLITS, V2 } from "./config.mjs";
import { canonicalJson, fnv1a, sha256 } from "./prng.mjs";

export const AUDITABLE_SPLITS = Object.freeze(["train", "dev"]);

const assertSplit = (split) => {
  if (!SPLITS.includes(split)) throw new Error(`unknown split ${JSON.stringify(split)}`);
};

export const manifestName = (split) => (assertSplit(split), `manifest-${split}.json`);
export const framesDir = (split) => (assertSplit(split), `frames-${split}`);
export const sampleId = (split, index) => (assertSplit(split), `${split}-${String(index).padStart(5, "0")}`);

/** The layout seed of one sample: a function of version, split and index, and nothing else. */
export const seedFor = (split, index, version = V2.version) => (assertSplit(split), fnv1a(`${V2.name}|${version}|${split}|${index}`));

/** The token a sealed TEST build must present. Not a secret: an explicit, recorded intent. */
export const testSealToken = (version = V2.version) => `SEAL-TEST-BUILD:${V2.name}@${version}`;

/**
 * Ids and seeds for one split. TEST only with `{ sealToken }` equal to `testSealToken()`.
 */
export function planSplitIds(split, count, { sealToken } = {}) {
  assertSplit(split);
  if (!Number.isInteger(count) || count <= 0) throw new Error(`count must be a positive integer, got ${count}`);
  if (split === "test" && sealToken !== testSealToken()) {
    throw new Error("TEST is planned only by the sealed one-time build, with its seal token");
  }
  return Array.from({ length: count }, (_, i) => ({ split, index: i, id: sampleId(split, i), seed: seedFor(split, i) }));
}

/**
 * Read ONE split's manifest for an audit. TEST is refused before any filesystem call; only the exact
 * file `manifest-<split>.json` is opened.
 */
export function openAuditManifest(dir, split, read = readFileSync) {
  if (!AUDITABLE_SPLITS.includes(split)) throw new Error(`audits may open ${AUDITABLE_SPLITS.join(" and ")} only, not ${JSON.stringify(split)}`);
  const m = JSON.parse(read(join(dir, manifestName(split)), "utf8"));
  if (m.split !== split) throw new Error(`manifest-${split}.json declares split ${JSON.stringify(m.split)}`);
  if (m.samples.some((s) => s.split !== split)) throw new Error(`manifest-${split}.json holds a sample of another split`);
  return m;
}

/** A layout's identity: the classes and declared boxes, order-independent. */
export const layoutSignature = (elements) =>
  sha256(canonicalJson(elements.map((e) => [e.cls, e.box.x, e.box.y, e.box.w, e.box.h]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))));

/**
 * No id, seed or layout in two splits; no duplicate id anywhere.
 * @param specs [{ id, split, seed, elements }]
 */
export function assertNoLeakage(specs) {
  const seen = { id: new Map(), seed: new Map(), layout: new Map() };
  const clash = [];
  for (const s of specs) {
    for (const [kind, key] of [["id", s.id], ["seed", s.seed], ["layout", layoutSignature(s.elements)]]) {
      const prior = seen[kind].get(key);
      if (prior !== undefined && (kind === "id" || prior !== s.split)) clash.push(`${kind} ${kind === "layout" ? "signature" : key} in ${prior} and ${s.split}`);
      if (prior === undefined) seen[kind].set(key, s.split);
    }
  }
  if (clash.length) throw new Error(`split leakage: ${clash.slice(0, 5).join("; ")}${clash.length > 5 ? ` (+${clash.length - 5})` : ""}`);
  return true;
}
