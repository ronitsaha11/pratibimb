/**
 * v2 reproducibility check (M22.4): compare two TRAIN/DEV builds of the same configuration.
 *
 *   node tools/dataset/v2/compare-builds.mjs --a=<build directory> --b=<build directory>
 *
 * Opens exactly `manifest-train.json` and `manifest-dev.json` in each (`openAuditManifest`, which
 * refuses TEST before touching the filesystem) and compares, sample by sample: the spec hash, the
 * HTML hash, the annotations, the provenance and the frame hash. Manifest hashes are compared with
 * the destination label removed, since the two builds are written to different places on purpose.
 * Prints counts and the first differing ids; no path.
 */
import { AUDITABLE_SPLITS, openAuditManifest } from "./splits.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";

const arg = (n) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3);
const a = arg("a");
const b = arg("b");
if (!a || !b) {
  console.error("REFUSING: --a=<build> and --b=<build> are required");
  process.exit(2);
}

const FIELDS = {
  specHash: (s) => s.specHash,
  htmlSha256: (s) => s.htmlSha256,
  annotations: (s) => sha256(canonicalJson(s.annotations)),
  provenance: (s) => sha256(canonicalJson(s.provenance)),
  frameSha256: (s) => s.frame.sha256,
};
const withoutDestination = (m) => {
  const { hash, meta, ...rest } = m;
  const { destination, ...metaRest } = meta;
  return sha256(canonicalJson({ ...rest, meta: metaRest }));
};

const report = {};
let identical = true;
for (const split of AUDITABLE_SPLITS) {
  const ma = openAuditManifest(a, split);
  const mb = openAuditManifest(b, split);
  const ids = (m) => m.samples.map((s) => s.id).join();
  const r = { samples: [ma.samples.length, mb.samples.length], sameIds: ids(ma) === ids(mb), differing: {}, firstDiffering: {} };
  for (const [name, f] of Object.entries(FIELDS)) {
    const diff = ma.samples.filter((s, k) => !mb.samples[k] || f(s) !== f(mb.samples[k])).map((s) => s.id);
    r.differing[name] = diff.length;
    if (diff.length) r.firstDiffering[name] = diff.slice(0, 10);
  }
  r.manifestHashExceptDestination = withoutDestination(ma) === withoutDestination(mb) ? "identical" : "different";
  if (!r.sameIds || Object.values(r.differing).some(Boolean) || r.manifestHashExceptDestination !== "identical") identical = false;
  report[split] = r;
}
console.log(JSON.stringify({ identical, splits: report }, null, 2));
process.exit(identical ? 0 : 1);
