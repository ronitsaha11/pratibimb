/**
 * v2 annotation and manifests. Pure: a laid-out spec plus what the browser rendered → annotations;
 * annotations → one split's manifest.
 *
 * Each annotation records its provenance: the declared box (the source), the rendered box (the
 * label, from `getBoundingClientRect`), the computed `position`, the hit-test validity, and the
 * generator's intent. A label is a POSITIVE training target only when it was intended as one AND is
 * HIT_TESTABLE: a fully occluded element can never be a positive, nor can an occlusion case.
 */
import { SPLITS, V2 } from "./config.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";

const VALIDITY = ["HIT_TESTABLE", "PARTIALLY_OCCLUDED", "FULLY_OCCLUDED", "SAMPLING_SENSITIVE", "PARTIALLY_CLIPPED", "OFFSCREEN"];

function visibilityOf(b, v) {
  const inside = b.x >= 0 && b.y >= 0 && b.x + b.w <= v.w && b.y + b.h <= v.h;
  const intersects = b.x < v.w && b.y < v.h && b.x + b.w > 0 && b.y + b.h > 0;
  return inside ? "VISIBLE" : intersects ? "CLIPPED" : "OFFSCREEN";
}

/**
 * @param spec     from `layoutSample`
 * @param rendered { elements: [{ key, rect, computedPosition }], validity: { [key]: category } }
 */
export function annotateSample(spec, rendered) {
  const byKey = new Map(rendered.elements.map((e) => [e.key, e]));
  if (byKey.size !== spec.elements.length) throw new Error(`${spec.id}: rendered ${byKey.size} labelled elements, spec has ${spec.elements.length}`);
  const annotations = spec.elements.map((e) => {
    const r = byKey.get(e.key);
    if (!r) throw new Error(`${spec.id}: element ${e.key} was not rendered`);
    const validity = rendered.validity?.[e.key];
    if (!VALIDITY.includes(validity)) throw new Error(`${spec.id}: element ${e.key} has no hit-test validity`);
    return {
      id: e.key,
      cls: e.cls,
      box: { x: r.rect.x, y: r.rect.y, w: r.rect.w, h: r.rect.h },
      visibility: visibilityOf(r.rect, spec.viewport),
      validity,
      intent: e.intent,
      positive: e.intent === "positive" && validity === "HIT_TESTABLE",
      source: { declared: { ...e.box }, computedPosition: r.computedPosition, bucket: e.bucket },
    };
  });
  return {
    id: spec.id,
    split: spec.split,
    seed: spec.seed,
    viewportCss: { ...spec.viewport },
    annotations,
    deferred: spec.deferred.length,
    specHash: sha256(canonicalJson(spec)),
  };
}

/** One split's manifest. Its hash covers everything but the hash itself. */
export function buildSplitManifest(split, samples, meta) {
  if (!SPLITS.includes(split)) throw new Error(`unknown split ${split}`);
  if (samples.some((s) => s.split !== split)) throw new Error(`manifest-${split}: a sample of another split`);
  const ordered = [...samples].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = { name: V2.name, version: V2.version, split, generator: V2.generator, meta, samples: ordered };
  return { ...body, hash: sha256(canonicalJson(body)) };
}
