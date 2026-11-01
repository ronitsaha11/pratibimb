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

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
};

/**
 * How alike two layouts are: elements are matched one-to-one, same class, at IoU ≥ `elementIou`
 * (greedy by best IoU); the similarity is matched ÷ the larger element count. 1 for identical
 * layouts; a layout shifted by 1 px is still close to 1 at any reasonable `elementIou`.
 */
export function layoutSimilarity(a, b, elementIou) {
  if (a.length === 0 || b.length === 0) return 0;
  const pairs = [];
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (a[i].cls !== b[j].cls) continue;
      const v = iou(a[i].box, b[j].box);
      if (v >= elementIou) pairs.push([v, i, j]);
    }
  }
  pairs.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2]);
  const ua = new Set();
  const ub = new Set();
  for (const [, i, j] of pairs) {
    if (ua.has(i) || ub.has(j)) continue;
    ua.add(i);
    ub.add(j);
  }
  return ua.size / Math.max(a.length, b.length);
}

/**
 * Split leakage. Throws on any CROSS-split leak; reports same-split similarity without throwing.
 *
 *   - a duplicate id anywhere (ids must be unique across the whole dataset);
 *   - a seed in two splits;
 *   - an exactly identical layout in two splits;
 *   - a NEAR-identical layout in two splits: `layoutSimilarity ≥ layoutShare` at `elementIou`.
 *
 * BOTH THRESHOLDS ARE REQUIRED and have no default; whoever plans states them. Empty layouts are
 * not compared (there is nothing in them to leak); they are counted.
 *
 * @param specs   [{ id, split, seed, elements }]
 * @param options { elementIou: (0, 1], layoutShare: (0, 1] }
 * @returns { crossSplit: [], sameSplit: { seeds, exactLayouts, nearLayouts }, emptyLayouts, comparedPairs }
 */
export function assertNoLeakage(specs, options) {
  const inUnit = (v) => typeof v === "number" && v > 0 && v <= 1;
  if (!inUnit(options?.elementIou) || !inUnit(options?.layoutShare)) {
    throw new Error("leakage: options elementIou and layoutShare must be stated, each in (0, 1] — no default is invented");
  }
  const crossSplit = [];
  const sameSplit = { seeds: 0, exactLayouts: 0, nearLayouts: 0 };
  const ids = new Map();
  const seeds = new Map();
  const exact = new Map();
  for (const s of specs) {
    if (ids.has(s.id)) crossSplit.push(`id ${s.id} appears twice (${ids.get(s.id)}, ${s.split})`);
    ids.set(s.id, s.split);
    const priorSeed = seeds.get(s.seed);
    if (priorSeed !== undefined) {
      if (priorSeed !== s.split) crossSplit.push(`seed ${s.seed} in ${priorSeed} and ${s.split}`);
      else sameSplit.seeds += 1;
    } else seeds.set(s.seed, s.split);
  }
  const nonEmpty = specs.filter((s) => s.elements.length > 0);
  for (const s of nonEmpty) {
    const sig = layoutSignature(s.elements);
    const prior = exact.get(sig);
    if (prior !== undefined) {
      if (prior.split !== s.split) crossSplit.push(`identical layout in ${prior.id} (${prior.split}) and ${s.id} (${s.split})`);
      else sameSplit.exactLayouts += 1;
    } else exact.set(sig, { id: s.id, split: s.split });
  }
  let comparedPairs = 0;
  for (let i = 0; i < nonEmpty.length; i += 1) {
    for (let j = i + 1; j < nonEmpty.length; j += 1) {
      const a = nonEmpty[i];
      const b = nonEmpty[j];
      comparedPairs += 1;
      const sim = layoutSimilarity(a.elements, b.elements, options.elementIou);
      if (sim < options.layoutShare) continue;
      if (a.split !== b.split) crossSplit.push(`near-identical layout in ${a.id} (${a.split}) and ${b.id} (${b.split}): similarity ${sim.toFixed(3)}`);
      else sameSplit.nearLayouts += 1;
    }
  }
  const report = { crossSplit, sameSplit, emptyLayouts: specs.length - nonEmpty.length, comparedPairs, options: { ...options } };
  if (crossSplit.length) {
    throw new Error(`split leakage: ${crossSplit.slice(0, 5).join("; ")}${crossSplit.length > 5 ? ` (+${crossSplit.length - 5} more)` : ""}`);
  }
  return report;
}
