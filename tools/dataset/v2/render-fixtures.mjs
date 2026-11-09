/**
 * M22.6 — rendered-pixel evidence for the visual fixes, in a real browser. NOT a dataset build: the
 * pages are hand-laid fixtures, nothing is written under `artifacts/datasets`, and nothing here is
 * a TRAIN, DEV or TEST sample.
 *
 *   node tools/dataset/v2/render-fixtures.mjs [--frames=<absolute directory outside the repository>]
 *
 * One fixture page per palette × control style (36). Each holds textboxes at three sizes, every text
 * control, native checkboxes and radios (checked and not, at 16 and 64 px), all 10 icon glyphs on all
 * 3 plates, a divider beside a textbox, a decor panel, and every occluder style over a partial and a
 * full occlusion case. Each page is rendered by `renderSample` (the candidate renderer, so the same
 * browser settings and fail-closed checks), then every labelled element is measured on the decoded
 * PNG with the G10 metrics (`visibility.mjs`) and its hit-test validity is recorded.
 *
 * FIXTURE FLOOR. The run fails if any textbox or icon positive falls below salience 1.5, or below 2%
 * of its pixels at contrast ≥ 1.25 — far above candidate 1's invisible elements (salience 1.00–1.09,
 * coverage 0), and a development check of THESE fixtures only. It is not a G10 acceptance threshold:
 * none is approved. Prints one JSON record; no path, no page text.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROL_STYLES, FONT_STACKS, ICON_GLYPHS, ICON_PLATES, NATIVE_BASE_PX, OCCLUDER_STYLES, PALETTES, V2 } from "./config.mjs";
import { elementAppearanceOf, hitSafeRadiusPx } from "./appearance.mjs";
import { rngOf, seedOf } from "./prng.mjs";
import { assertScratchRoot, renderDefects, renderSample } from "./render.mjs";
import { decodePng } from "./png.mjs";
import { elementPixelMetrics, readings } from "./visibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const framesDir = arg("frames") ? assertScratchRoot(ROOT, arg("frames")) : null;
const FLOOR = { salience: 1.5, coverageAt: 1.25, coverage: 0.02 };

/** One fixture page for a palette × style. Boxes are laid by hand on a 1280 × 800 page. */
function fixtureSpec(pi, si) {
  const palette = PALETTES[pi];
  const style = CONTROL_STYLES[si];
  const id = `fixture-${palette.id}-${style.id}`;
  const rng = rngOf(seedOf(["m22.6-fixture", palette.id, style.id]), "elements");
  const elements = [];
  const occluders = [];
  const add = (cls, box, intent = "positive", extra = {}) => {
    const key = `${id}-e${String(elements.length).padStart(3, "0")}`;
    const appearance = { ...elementAppearanceOf(rng, cls, box.w, box.h, style), ...extra };
    elements.push({ key, cls, bucket: "fixture", intent, box, appearance, occluderId: null });
    return elements.at(-1);
  };
  // Row 1: textboxes, three sizes.
  add("textbox", { x: 40, y: 70, w: 120, h: 14 });
  add("textbox", { x: 200, y: 70, w: 220, h: 28 });
  add("textbox", { x: 460, y: 70, w: 420, h: 72 });
  // Row 2: text controls and native controls.
  add("button", { x: 40, y: 170, w: 110, h: 28 });
  add("select", { x: 180, y: 170, w: 160, h: 28 });
  add("tab", { x: 370, y: 170, w: 100, h: 28 });
  add("link", { x: 500, y: 174, w: 80, h: 20 });
  for (const [k, [cls, size, checked]] of [["checkbox", 16, false], ["checkbox", 16, true], ["radio", 16, false], ["radio", 16, true], ["checkbox", 64, true], ["radio", 64, true], ["checkbox", 64, false]].entries()) {
    add(cls, { x: 620 + k * 90, y: 170, w: size, h: size }, "positive", { checked, nativeScale: size / NATIVE_BASE_PX });
  }
  // Rows 3–5: every glyph on every plate, 40 px.
  ICON_PLATES.forEach((plate, r) => {
    ICON_GLYPHS.forEach((glyph, c) => {
      add("icon", { x: 40 + c * 70, y: 270 + r * 70, w: 40, h: 40 }, "positive", { glyph, plate, radiusPx: hitSafeRadiusPx(style, 40, 40) });
    });
  });
  // Row 6: a textbox beside a divider, and a decor panel.
  add("textbox", { x: 40, y: 500, w: 300, h: 24 });
  const decor = [
    { id: `${id}-d000`, kind: "divider", box: { x: 380, y: 512, w: 300, h: 2 } },
    { id: `${id}-d001`, kind: "panel", box: { x: 760, y: 470, w: 300, h: 120 } },
  ];
  // Row 7: every occluder style over a partial and a full occlusion case.
  OCCLUDER_STYLES.forEach((os, k) => {
    for (const [j, kind] of ["partial", "full"].entries()) {
      const e = add("button", { x: 40 + k * 280 + j * 130, y: 650, w: 100, h: 32 }, `occlusion-${kind}`);
      e.occluderId = `${id}-o${String(occluders.length).padStart(3, "0")}`;
      const b = e.box;
      const box = kind === "full" ? { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 } : { x: b.x + Math.floor(b.w / 2), y: b.y - 1, w: Math.ceil(b.w / 2) + 1, h: b.h + 2 };
      occluders.push({ id: e.occluderId, role: "occluder", kind, for: e.key, box, style: os });
    }
  });
  return {
    version: V2.version,
    renderRevision: V2.renderRevision,
    id,
    split: "dev", // the renderer accepts TRAIN or DEV only; this is a fixture, in neither
    viewport: { w: 1280, h: 800 },
    masthead: { x: 0, y: 0, w: 1280, h: 48 },
    appearance: { palette: palette.id, font: FONT_STACKS[(pi * CONTROL_STYLES.length + si) % FONT_STACKS.length], controlStyle: style.id, density: "dense" },
    elements,
    occluders,
    decor,
  };
}

const { chromium } = await import("playwright");
const playwrightVersion = createRequire(import.meta.url)("playwright/package.json").version;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, offline: true, colorScheme: "light", reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });
let aborted = 0;
await context.route("**/*", (r) => {
  aborted += 1;
  return r.abort();
});
const page = await context.newPage();
if (framesDir) mkdirSync(framesDir, { recursive: true });

const rows = [];
const failures = [];
for (let pi = 0; pi < PALETTES.length; pi += 1) {
  for (let si = 0; si < CONTROL_STYLES.length; si += 1) {
    const spec = fixtureSpec(pi, si);
    const r = await renderSample(page, spec, () => aborted);
    const defects = renderDefects(spec, r, { occluderTolerancePx: 0.5 });
    if (defects.length) failures.push(`${spec.id}: ${defects.join("; ")}`);
    if (framesDir) writeFileSync(join(framesDir, `${spec.id}.png`), r.png);
    const img = decodePng(r.png);
    const measuredBy = new Map(r.elements.map((e) => [e.key, e]));
    for (const e of spec.elements) {
      const m = elementPixelMetrics(img, measuredBy.get(e.key).rect);
      const want = e.intent === "positive" ? "HIT_TESTABLE" : e.intent === "occlusion-full" ? "FULLY_OCCLUDED" : "PARTIALLY_OCCLUDED";
      const row = {
        palette: spec.appearance.palette,
        style: spec.appearance.controlStyle,
        cls: e.cls,
        intent: e.intent,
        size: `${e.box.w}x${e.box.h}`,
        ...(e.cls === "icon" ? { glyph: e.appearance.glyph, plate: e.appearance.plate } : {}),
        ...(e.cls === "checkbox" || e.cls === "radio" ? { checked: e.appearance.checked } : {}),
        validity: r.validity[e.key],
        textOverflowPx: measuredBy.get(e.key).textOverflowPx,
        metrics: m,
        readings: readings(e.cls, m, e.appearance),
      };
      rows.push(row);
      if (r.validity[e.key] !== want) failures.push(`${e.key}: validity ${r.validity[e.key]}, expected ${want}`);
      if (e.intent === "positive" && (e.cls === "textbox" || e.cls === "icon") && (m.salience < FLOOR.salience || m.coverage[String(FLOOR.coverageAt)] < FLOOR.coverage)) {
        failures.push(`${e.key} (${e.cls}${e.cls === "icon" ? ` ${e.appearance.glyph}/${e.appearance.plate}` : ""}): salience ${m.salience}, coverage@${FLOOR.coverageAt} ${m.coverage[String(FLOOR.coverageAt)]}`);
      }
    }
  }
}
const browserVersion = browser.version();
await browser.close();

const minOf = (list, f) => Math.min(...list.map(f));
const group = (keyOf, list) => list.reduce((m, r) => ((m[keyOf(r)] ??= []).push(r), m), {});
const pos = rows.filter((r) => r.intent === "positive");
const summary = {
  textbox: Object.fromEntries(Object.entries(group((r) => `${r.palette} / ${r.style}`, pos.filter((r) => r.cls === "textbox"))).map(([k, v]) => [k, { minSalience: minOf(v, (r) => r.metrics.salience), minFieldOrEdge: minOf(v, (r) => r.readings.fieldOrEdge), minCoverage125: minOf(v, (r) => r.metrics.coverage["1.25"]) }])),
  iconByGlyphAndPlate: Object.fromEntries(Object.entries(group((r) => `${r.glyph} / ${r.plate}`, pos.filter((r) => r.cls === "icon"))).map(([k, v]) => [k, { n: v.length, minSalience: minOf(v, (r) => r.metrics.salience), minCoverage125: minOf(v, (r) => r.metrics.coverage["1.25"]), ...(k.endsWith("/ none") ? {} : { minPlateVsPage: minOf(v, (r) => r.readings.plateVsPage), minGlyphVsPlate: minOf(v, (r) => r.readings.glyphVsPlate) }) }])),
  nativeControls: Object.fromEntries(Object.entries(group((r) => `${r.cls} ${r.size} ${r.checked ? "checked" : "unchecked"}`, pos.filter((r) => r.cls === "checkbox" || r.cls === "radio"))).map(([k, v]) => [k, { minSalience: minOf(v, (r) => r.metrics.salience), hitTestable: v.every((r) => r.validity === "HIT_TESTABLE") }])),
  textControls: Object.fromEntries(Object.entries(group((r) => r.cls, pos.filter((r) => ["button", "select", "tab", "link"].includes(r.cls)))).map(([k, v]) => [k, { minSalience: minOf(v, (r) => r.metrics.salience), overflowing: v.filter((r) => (r.textOverflowPx ?? 0) > 0).length, of: v.length }])),
  occlusion: Object.fromEntries(Object.entries(group((r) => r.intent, rows.filter((r) => r.intent !== "positive"))).map(([k, v]) => [k, { n: v.length, matched: v.filter((r) => r.validity === (k === "occlusion-full" ? "FULLY_OCCLUDED" : "PARTIALLY_OCCLUDED")).length }])),
};
console.log(JSON.stringify({
  run: "M22.6 — rendered fixture evidence for the visual fixes (not a dataset; no TRAIN, DEV or TEST sample)",
  environment: { browser: `Chromium ${browserVersion}, headless, Playwright ${playwrightVersion}`, node: process.version },
  renderRevision: V2.renderRevision,
  pages: PALETTES.length * CONTROL_STYLES.length,
  elements: rows.length,
  fixtureFloor: { ...FLOOR, note: "a development check of these fixtures only; NOT a G10 acceptance threshold" },
  pass: failures.length === 0,
  failures,
  summary,
}, null, 2));
process.exit(failures.length ? 1 : 0);
