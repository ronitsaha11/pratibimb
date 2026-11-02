/**
 * v2 candidate audit (M22.5): an independent, READ-ONLY check of one built TRAIN/DEV candidate.
 *
 *   node tools/dataset/v2/audit-candidate.mjs --candidate=<n> [--sheets=<absolute directory outside the repository>]
 *
 * Reads ONLY `artifacts/datasets/t1-ui-synthetic-2.1.0-draft-candidate-<n>/`: its two manifests
 * (through `openAuditManifest`, which refuses TEST before touching the filesystem), its build record
 * and status, and the files in its `frames-train/` and `frames-dev/`. Nothing else under
 * `artifacts/datasets` is named, listed or read, and nothing in the candidate is written.
 *
 * It recomputes, rather than trusting the build: ids, frame presence, PNG decoding (every CRC,
 * inflate, unfilter), frame sizes and hashes, manifest hashes, annotation counts, valid positives
 * and observed occlusion per class × size cell, bucket membership from the rendered boxes, and a
 * scan of every string for paths or personal data. It also measures, on the decoded pixels, each
 * positive's edge contrast (the strongest colour in its 2 px inner edge band against the dominant
 * colour just outside it) and ink contrast (the strongest colour inside it, ≥ 0.5% of its area,
 * against its dominant colour), with the WCAG 2.x contrast-ratio formula. These are measurements,
 * not a WCAG conformance claim. Low-salience flags use audit thresholds stated in the output.
 *
 * `--sheets` writes contact sheets (crops of real frames) for the visual review, outside the repo.
 * Prints one JSON record; no path, no page text.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSES, CONTROL_STYLES, FONT_STACKS, ICON_GLYPHS, ICON_PLATES, PALETTES, SIZE_BUCKETS, VIEWPORTS, V2 } from "./config.mjs";
import { canonicalJson, sha256 } from "./prng.mjs";
import { AUDITABLE_SPLITS, openAuditManifest } from "./splits.mjs";
import { CANDIDATE_PREFIX, assertScratchRoot, candidateRoot } from "./render.mjs";
import { decodePng, encodePng } from "./png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const refuse = (m) => {
  console.error(`REFUSING: ${m}`);
  process.exit(2);
};
const n = Number(arg("candidate"));
if (!Number.isInteger(n) || n < 1) refuse("--candidate=<n> is required");
const dir = candidateRoot(ROOT, n);
if (!existsSync(dir)) refuse(`candidate ${n} does not exist`);
const sheetsDir = arg("sheets") ? assertScratchRoot(ROOT, arg("sheets")) : null;

/** The edge and ink contrast below which an element is flagged for review. Audit thresholds, not standards. */
const LOW = 1.25;

const BUCKET_IDS = SIZE_BUCKETS.map((b) => b.id);
const bucketOfModel = (s) => SIZE_BUCKETS.find((b) => s >= b.lo && s < b.hi)?.id ?? "unbucketed";
const q = (list, ps = [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) => {
  if (!list.length) return null;
  const a = [...list].sort((x, y) => x - y);
  return Object.fromEntries(ps.map((p) => [`p${Math.round(p * 100)}`, Math.round(a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] * 1000) / 1000]));
};
const inc = (o, k, by = 1) => (o[k] = (o[k] ?? 0) + by);
const r3 = (x) => Math.round(x * 1000) / 1000;

// ── colour ───────────────────────────────────────────────────────────────────────────────────
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lumOf = (rgb) => 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255);
const contrast = (a, b) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, r) => r - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = (s) => Number.parseInt(s.slice(1), 16);

/** Contrast of the declared colour pairs that matter, per palette, from the CSS values. */
function cssContrast() {
  const out = {};
  for (const p of PALETTES) {
    const c = (a, b) => r3(contrast(hex(p[a]), hex(p[b])));
    out[p.id] = {
      "text on page (link, textbox text)": c("text", "page"),
      "accent on page (link, icon without plate)": c("accent", "page"),
      "text on surface (outlined / flat / raised controls)": c("text", "surface"),
      "on-accent on accent (filled controls, accent plate)": c("onAccent", "accent"),
      "accent on surface (icon on surface plate)": c("accent", "surface"),
      "border on page (outlined control edge)": c("border", "page"),
      "surface on page (flat control edge, no border)": c("surface", "page"),
      "accent on page (filled control edge)": c("accent", "page"),
      "occluder on page": c("occluder", "page"),
      "decor on page": c("decor", "page"),
    };
  }
  return out;
}

// ── pixels ───────────────────────────────────────────────────────────────────────────────────
function pixelStats(img, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.h, Math.ceil(box.y + box.h));
  const at = (x, y) => {
    const i = (y * img.w + x) * 4;
    return (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2];
  };
  const inside = new Map();
  const band = new Map();
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const v = at(x, y);
      inside.set(v, (inside.get(v) ?? 0) + 1);
      if (x - x0 < 2 || x1 - 1 - x < 2 || y - y0 < 2 || y1 - 1 - y < 2) band.set(v, (band.get(v) ?? 0) + 1);
    }
  }
  const ring = new Map();
  for (let y = y0 - 4; y < y1 + 4; y += 1) {
    for (let x = x0 - 4; x < x1 + 4; x += 1) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      if (x >= x0 - 1 && x < x1 + 1 && y >= y0 - 1 && y < y1 + 1) continue; // 3 px ring, 1 px off the box
      const v = at(x, y);
      ring.set(v, (ring.get(v) ?? 0) + 1);
    }
  }
  const mode = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const area = (x1 - x0) * (y1 - y0);
  const inMode = mode(inside);
  const outMode = mode(ring);
  const bandTotal = [...band.values()].reduce((a, b) => a + b, 0);
  const edge = Math.max(1, ...[...band].filter(([, k]) => k >= 0.15 * bandTotal).map(([v]) => contrast(v, outMode)));
  const ink = Math.max(1, ...[...inside].filter(([v, k]) => v !== inMode && k >= Math.max(2, 0.005 * area)).map(([v]) => contrast(v, inMode)));
  return { edge, ink, fillVsSurround: contrast(inMode, outMode), colours: inside.size };
}

// ── audit ────────────────────────────────────────────────────────────────────────────────────
const record = JSON.parse(readFileSync(join(dir, "build-record.json"), "utf8"));
const status = JSON.parse(readFileSync(join(dir, "BUILD-STATUS.json"), "utf8"));
const integrity = {};
const reconciliation = {};
const distribution = {};
const measured = { thresholds: { lowSalience: LOW }, byClass: {}, byPaletteAndStyle: {}, flagged: { lowEdge: 0, lowInk: 0, both: 0 }, flaggedByClass: {}, flaggedByCombo: {}, examples: [] };
const strings = [];
const walk = (v) => (typeof v === "string" ? strings.push(v) : v && typeof v === "object" ? Object.values(v).forEach(walk) : null);
walk(record);
walk(status);
const forSheets = [];

for (const split of AUDITABLE_SPLITS) {
  const m = openAuditManifest(dir, split);
  walk(m);
  const rec = record.splits[split];
  const { hash, ...body } = m;
  const ids = m.samples.map((s) => s.id);
  const expected = Array.from({ length: rec.plannedSamples }, (_, i) => `${split}-${String(i).padStart(5, "0")}`);
  const framesDir = `frames-${split}`;
  const onDisk = readdirSync(join(dir, framesDir)).sort();
  const referenced = new Set(m.samples.map((s) => s.framePath));
  const it = {
    manifestSamples: m.samples.length,
    plannedInRecord: rec.plannedSamples,
    uniqueIds: new Set(ids).size,
    idsAreExactlyThePlannedSequence: canonicalJson(ids) === canonicalJson(expected),
    framesOnDisk: onDisk.length,
    unexpectedFiles: onDisk.filter((f) => !referenced.has(`${framesDir}/${f}`)).length,
    framePathsOutsideSplitDir: m.samples.filter((s) => s.framePath !== `${framesDir}/${s.id}.png`).length,
    missingFrames: 0,
    decoded: 0,
    decodeFailures: [],
    sizeMismatches: 0,
    hashMismatches: 0,
    annotations: 0,
    annotationsInRecord: rec.annotations,
    manifestHashRecomputed: sha256(canonicalJson(body)),
    manifestHashStored: hash,
    manifestHashInRecord: rec.hashes.manifestSha256,
  };
  const cells = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(BUCKET_IDS.map((b) => [b, { validPositives: 0, flaggedPositive: 0, partialPlanned: 0, partialObserved: 0, fullPlanned: 0, fullObserved: 0 }]))]));
  let bucketDisagreements = 0;
  let validityOther = 0;
  const d = { samplesByViewport: {}, positivesByViewport: {}, samplesByPalette: {}, samplesByFont: {}, samplesByControlStyle: {}, samplesByDensity: {}, samplesByPaletteAndStyle: {}, iconsByGlyph: {}, iconsByPlate: {}, aspectByClass: {}, cssShorterByClass: {}, modelShorterByBucket: {}, targetsPerSample: [] };
  const aspects = {};
  const cssShort = {};
  const modelShort = {};

  for (const s of m.samples) {
    const vp = `${s.viewportCss.w}x${s.viewportCss.h}`;
    const ap = s.provenance.appearance;
    inc(d.samplesByViewport, vp);
    inc(d.samplesByPalette, ap.palette);
    inc(d.samplesByFont, ap.font);
    inc(d.samplesByControlStyle, ap.controlStyle);
    inc(d.samplesByDensity, ap.density);
    inc(d.samplesByPaletteAndStyle, `${ap.palette} / ${ap.controlStyle}`);
    d.targetsPerSample.push(s.annotations.length);
    it.annotations += s.annotations.length;
    let img = null;
    const p = join(dir, s.framePath);
    if (!existsSync(p)) it.missingFrames += 1;
    else {
      const buf = readFileSync(p);
      if (sha256(buf) !== s.frame.sha256) it.hashMismatches += 1;
      try {
        img = decodePng(buf);
        it.decoded += 1;
        if (img.w !== s.viewportCss.w || img.h !== s.viewportCss.h || img.w !== s.frame.w || img.h !== s.frame.h) it.sizeMismatches += 1;
      } catch (e) {
        it.decodeFailures.push(`${s.id}: ${e.message}`);
      }
    }
    const scale = V2.modelInput / Math.max(s.viewportCss.w, s.viewportCss.h);
    for (const a of s.annotations) {
      const bucket = a.source.bucket;
      const c = cells[a.cls][bucket];
      const shorterModel = Math.min(a.box.w, a.box.h) * scale;
      if (bucketOfModel(shorterModel) !== bucket) bucketDisagreements += 1;
      const inside = a.box.x >= 0 && a.box.y >= 0 && a.box.x + a.box.w <= s.viewportCss.w && a.box.y + a.box.h <= s.viewportCss.h;
      const dd = a.source.declared;
      const delta = Math.max(Math.abs(a.box.x - dd.x), Math.abs(a.box.y - dd.y), Math.abs(a.box.x + a.box.w - (dd.x + dd.w)), Math.abs(a.box.y + a.box.h - (dd.y + dd.h)));
      if (a.intent === "positive") {
        const valid =
          a.positive === true &&
          a.validity === "HIT_TESTABLE" &&
          a.hitTest?.category5 === "HIT_TESTABLE" &&
          a.hitTest?.category9 === "HIT_TESTABLE" &&
          a.hitTest?.fraction5 === 1 &&
          a.hitTest?.fraction9 === 1 &&
          inside &&
          delta <= 0.5 &&
          a.source.computedPosition === "absolute";
        if (valid) c.validPositives += 1;
        if (a.positive) c.flaggedPositive += 1;
        if (!valid) validityOther += 1;
        inc(d.positivesByViewport, vp);
        (aspects[a.cls] ??= []).push(a.box.w / a.box.h);
        (cssShort[a.cls] ??= []).push(Math.min(a.box.w, a.box.h));
        (modelShort[bucket] ??= []).push(shorterModel);
        if (a.cls === "icon") {
          inc(d.iconsByGlyph, a.source.appearance.glyph);
          inc(d.iconsByPlate, a.source.appearance.plate);
        }
        if (img) {
          const px = pixelStats(img, a.box);
          const combo = `${ap.palette} / ${ap.controlStyle}`;
          const cls = (measured.byClass[a.cls] ??= { edge: [], ink: [] });
          cls.edge.push(px.edge);
          cls.ink.push(px.ink);
          const cb = (measured.byPaletteAndStyle[combo] ??= { n: 0, lowEdge: 0, lowInk: 0, both: 0 });
          cb.n += 1;
          const lowEdge = px.edge < LOW;
          const lowInk = px.ink < LOW;
          if (lowEdge) (measured.flagged.lowEdge += 1, (cb.lowEdge += 1));
          if (lowInk) (measured.flagged.lowInk += 1, (cb.lowInk += 1));
          if (lowEdge && lowInk) {
            measured.flagged.both += 1;
            cb.both += 1;
            inc(measured.flaggedByClass, `${a.cls} / ${ap.controlStyle}`);
            if (measured.examples.length < 40) measured.examples.push({ id: a.id, cls: a.cls, bucket, palette: ap.palette, controlStyle: ap.controlStyle, edge: r3(px.edge), ink: r3(px.ink) });
          }
          if (sheetsDir) forSheets.push({ split, sample: s, a, px, combo });
        }
      } else {
        const kind = a.intent === "occlusion-full" ? "full" : "partial";
        c[`${kind}Planned`] += 1;
        if (a.validity === (kind === "full" ? "FULLY_OCCLUDED" : "PARTIALLY_OCCLUDED") && a.positive === false) c[`${kind}Observed`] += 1;
        if (sheetsDir && img && forSheets.filter((x) => x.a.intent === a.intent).length < 24) forSheets.push({ split, sample: s, a, px: null, combo: null });
      }
    }
  }
  for (const [k, v] of Object.entries(aspects)) d.aspectByClass[k] = q(v);
  for (const [k, v] of Object.entries(cssShort)) d.cssShorterByClass[k] = q(v);
  for (const b of BUCKET_IDS) d.modelShorterByBucket[b] = { ...q(modelShort[b] ?? []), configured: SIZE_BUCKETS.find((x) => x.id === b) && { lo: SIZE_BUCKETS.find((x) => x.id === b).lo, hi: Number.isFinite(SIZE_BUCKETS.find((x) => x.id === b).hi) ? SIZE_BUCKETS.find((x) => x.id === b).hi : null } };
  d.targetsPerSample = q(d.targetsPerSample);
  integrity[split] = it;

  // Reconcile with the build record, cell by cell.
  const cellRows = [];
  let recordDisagreements = 0;
  for (const cls of CLASSES) for (const b of BUCKET_IDS) {
    const c = cells[cls][b];
    const recPos = rec.validPositivesByCell[cls]?.[b];
    const recOcc = rec.occlusionByCell[`${cls}/${b}`];
    if (recPos !== c.validPositives || recOcc.partialObserved !== c.partialObserved || recOcc.fullObserved !== c.fullObserved || recOcc.partialPlanned !== c.partialPlanned || recOcc.fullPlanned !== c.fullPlanned) recordDisagreements += 1;
    cellRows.push({ cell: `${cls}/${b}`, ...c });
  }
  const sum = (k) => cellRows.reduce((a, r) => a + r[k], 0);
  reconciliation[split] = {
    cells: cellRows.length,
    validPositives: { total: sum("validPositives"), min: Math.min(...cellRows.map((r) => r.validPositives)), max: Math.max(...cellRows.map((r) => r.validPositives)) },
    flaggedPositives: sum("flaggedPositive"),
    positivesNotValid: validityOther,
    occlusionPartial: { planned: sum("partialPlanned"), observed: sum("partialObserved") },
    occlusionFull: { planned: sum("fullPlanned"), observed: sum("fullObserved") },
    renderedBucketDisagreesWithDeclared: bucketDisagreements,
    cellsDisagreeingWithBuildRecord: recordDisagreements,
    byCell: cellRows,
  };
  distribution[split] = d;
}

const suspicious = [...new Set(strings.filter((v) => /[A-Za-z]:[\\/]|\\|\/Users\/|\/home\/|AppData|https?:|@(?!\d)/.test(v) && v !== `${V2.name}@${V2.version}`))];
const coverage = {
  palettes: PALETTES.map((p) => p.id).filter((id) => AUDITABLE_SPLITS.some((s) => distribution[s].samplesByPalette[id])).length,
  fonts: FONT_STACKS.filter((f) => AUDITABLE_SPLITS.some((s) => distribution[s].samplesByFont[f])).length,
  controlStyles: CONTROL_STYLES.map((c) => c.id).filter((id) => AUDITABLE_SPLITS.some((s) => distribution[s].samplesByControlStyle[id])).length,
  viewports: VIEWPORTS.map((v) => `${v.w}x${v.h}`).filter((k) => AUDITABLE_SPLITS.some((s) => distribution[s].samplesByViewport[k])).length,
  iconGlyphs: ICON_GLYPHS.filter((g) => AUDITABLE_SPLITS.some((s) => distribution[s].iconsByGlyph[g])).length,
  iconPlates: ICON_PLATES.filter((g) => AUDITABLE_SPLITS.some((s) => distribution[s].iconsByPlate[g])).length,
  of: { palettes: PALETTES.length, fonts: FONT_STACKS.length, controlStyles: CONTROL_STYLES.length, viewports: VIEWPORTS.length, iconGlyphs: ICON_GLYPHS.length, iconPlates: ICON_PLATES.length },
};
for (const k of Object.keys(measured.byClass)) measured.byClass[k] = { n: measured.byClass[k].edge.length, edge: q(measured.byClass[k].edge), ink: q(measured.byClass[k].ink) };
for (const [k, v] of Object.entries(measured.byPaletteAndStyle)) v.lowEdgeShare = r3(v.lowEdge / v.n);

// ── contact sheets (outside the repository) ────────────────────────────────────────────────
const sheets = [];
if (sheetsDir) {
  mkdirSync(sheetsDir, { recursive: true });
  const CELL = 112;
  let last = null; // one decoded frame at a time: a frame is ~4 MB of RGBA
  const imgOf = (split, s) => {
    if (last?.id !== s.id) last = { id: s.id, img: decodePng(readFileSync(join(dir, s.framePath))) };
    return last.img;
  };
  const sheet = (name, rows) => {
    const cols = Math.max(...rows.map((r) => r.length));
    const W = cols * CELL;
    const H = rows.length * CELL;
    const out = new Uint8Array(W * H * 4).fill(128);
    rows.forEach((row, ri) => row.forEach((e, ci) => {
      const img = imgOf(e.split, e.sample);
      const b = e.a.box;
      const m = 6;
      const cx0 = Math.max(0, Math.floor(b.x - m));
      const cy0 = Math.max(0, Math.floor(b.y - m));
      const cw = Math.min(img.w, Math.ceil(b.x + b.w + m)) - cx0;
      const ch = Math.min(img.h, Math.ceil(b.y + b.h + m)) - cy0;
      const s = Math.min((CELL - 6) / cw, (CELL - 6) / ch, 8);
      const dw = Math.max(1, Math.floor(cw * s));
      const dh = Math.max(1, Math.floor(ch * s));
      const ox = ci * CELL + Math.floor((CELL - dw) / 2);
      const oy = ri * CELL + Math.floor((CELL - dh) / 2);
      for (let y = 0; y < dh; y += 1) for (let x = 0; x < dw; x += 1) {
        const sx = cx0 + Math.min(cw - 1, Math.floor(x / s));
        const sy = cy0 + Math.min(ch - 1, Math.floor(y / s));
        const si = (sy * img.w + sx) * 4;
        const di = ((oy + y) * W + ox + x) * 4;
        out[di] = img.rgba[si];
        out[di + 1] = img.rgba[si + 1];
        out[di + 2] = img.rgba[si + 2];
        out[di + 3] = 255;
      }
    }));
    writeFileSync(join(sheetsDir, `${name}.png`), encodePng(W, H, out));
    sheets.push({ name, rows: rows.length, cols, ids: rows.map((r) => r.map((e) => e.a.id)) });
  };
  const positives = forSheets.filter((e) => e.px);
  // Per class: one row per bucket, 12 columns spread over palette × style combinations.
  for (const cls of CLASSES) {
    const rows = BUCKET_IDS.map((b) => {
      const pool = positives.filter((e) => e.a.cls === cls && e.a.source.bucket === b);
      const seen = new Set();
      const pick = [];
      for (const e of pool) if (!seen.has(e.combo) && pick.length < 12) (seen.add(e.combo), pick.push(e));
      return pick;
    });
    sheet(`class-${cls}`, rows);
  }
  const flagged = positives.filter((e) => e.px.edge < LOW && e.px.ink < LOW).slice(0, 60);
  if (flagged.length) sheet("flagged-low-salience", Array.from({ length: Math.ceil(flagged.length / 12) }, (_, i) => flagged.slice(i * 12, i * 12 + 12)));
  const lowEdge = positives.filter((e) => e.px.edge < LOW && !(e.px.ink < LOW)).slice(0, 36);
  if (lowEdge.length) sheet("flagged-low-edge-only", Array.from({ length: Math.ceil(lowEdge.length / 12) }, (_, i) => lowEdge.slice(i * 12, i * 12 + 12)));
  const occ = forSheets.filter((e) => !e.px);
  sheet("occlusion-cases", [occ.filter((e) => e.a.intent === "occlusion-partial").slice(0, 12), occ.filter((e) => e.a.intent === "occlusion-full").slice(0, 12)]);
}

// Representative full frames: a greedy cover of viewport, palette, font, style and icon glyph.
const want = new Set([...VIEWPORTS.map((v) => `vp:${v.w}x${v.h}`), ...PALETTES.map((p) => `pal:${p.id}`), ...FONT_STACKS.map((f) => `font:${f}`), ...CONTROL_STYLES.map((c) => `style:${c.id}`), ...ICON_GLYPHS.map((g) => `glyph:${g}`)]);
const all = AUDITABLE_SPLITS.flatMap((s) => openAuditManifest(dir, s).samples);
const keysOf = (s) => new Set([`vp:${s.viewportCss.w}x${s.viewportCss.h}`, `pal:${s.provenance.appearance.palette}`, `font:${s.provenance.appearance.font}`, `style:${s.provenance.appearance.controlStyle}`, ...s.annotations.filter((a) => a.cls === "icon").map((a) => `glyph:${a.source.appearance.glyph}`)]);
const cover = [];
while (want.size) {
  const best = all.map((s) => [s, [...keysOf(s)].filter((k) => want.has(k)).length]).sort((x, y) => y[1] - x[1] || (x[0].id < y[0].id ? -1 : 1))[0];
  if (!best || best[1] === 0) break;
  cover.push(best[0].id);
  for (const k of keysOf(best[0])) want.delete(k);
}

console.log(JSON.stringify({
  audit: "M22.5 — independent read-only audit of a v2 TRAIN/DEV candidate (no detector, no training, no TEST)",
  candidate: `artifacts/datasets/${CANDIDATE_PREFIX}${n}`,
  buildStatus: status.status,
  integrity,
  privacy: { stringsScanned: strings.length, suspicious },
  reconciliation,
  distribution,
  appearanceCoverage: coverage,
  contrast: { formula: "WCAG 2.x contrast ratio (relative luminance); a measurement, not a conformance claim", declaredCssPairs: cssContrast(), measuredOnPixels: measured },
  visualReview: { representativeFrames: cover, sheets: sheets.map(({ name, rows, cols }) => ({ name, rows, cols })) },
}, null, 2));
