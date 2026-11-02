/**
 * G10 (development name) — a PIXEL visibility diagnostic for labelled elements (M22.6). Pure: a decoded
 * frame and a box in, metrics out. Separate from G1–G9, which never look at pixels.
 *
 * Why: candidate 1 passed G1–G9 while 374 positives were effectively invisible. Hit-testing asks
 * whether the browser would deliver a click to the element; it says nothing about whether anything
 * is drawn there. These metrics look at what was drawn.
 *
 * METRICS, for one element box, against the SURROUND (the dominant colour of a 3 px ring, 1 px
 * outside the box — the page or panel the element sits on):
 *   salience       the k-th highest per-pixel contrast to the surround inside the box,
 *                  k = max(3, ⌈0.5% of the box⌉): "is there a real patch of pixels that stands out?",
 *                  robust to a stray anti-aliased pixel
 *   coverage@c     the share of the box's pixels whose contrast to the surround is at least c, for
 *                  c in COVERAGE_LEVELS: "how much of the box stands out?"
 *   fill           contrast of the box's dominant colour to the surround (a field, plate or fill)
 *   edge           the strongest colour holding ≥ 15% of the 2 px inner edge band, against the surround
 *   ink            the k-th highest per-pixel contrast to the box's own dominant colour: text, glyph or
 *                  mark against its fill
 * with the class-specific readings derived from them (`readings`): a textbox's field-or-edge, an
 * icon's plate against the page and glyph against the plate, a text control's text against its fill.
 *
 * Contrast is the WCAG 2.x ratio of relative luminances. It is a measurement, NOT a WCAG conformance
 * claim, and NOT a measure of recognisability: a high-contrast blob can still be an unrecognisable
 * icon. G10 only separates "something is visibly drawn here" from "nothing is".
 *
 * CLASSIFICATION needs thresholds that WHOEVER RUNS IT states (`classifyVisibility`); there is no
 * default. Until the owner approves thresholds, results are diagnostic only.
 */

export const G10_VERSION = "g10-dev-1";
export const COVERAGE_LEVELS = Object.freeze([1.1, 1.25, 1.5, 2, 3]);
export const G10_CATEGORIES = Object.freeze(["VISIBLE", "BORDERLINE", "INVISIBLE", "NOT_APPLICABLE"]);

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lumCache = new Map();
const lumOf = (rgb) => {
  let v = lumCache.get(rgb);
  if (v === undefined) {
    v = 0.2126 * lin((rgb >> 16) & 255) + 0.7152 * lin((rgb >> 8) & 255) + 0.0722 * lin(rgb & 255);
    if (lumCache.size < 1 << 20) lumCache.set(rgb, v);
  }
  return v;
};
export const contrastOf = (a, b) => {
  const x = lumOf(a);
  const y = lumOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const modeOf = (m) => {
  let best;
  let n = -1;
  for (const [k, v] of m) if (v > n || (v === n && k < best)) [best, n] = [k, v];
  return best;
};
const kthHighest = (values, k) => {
  const a = Float64Array.from(values).sort();
  return a.length ? a[Math.max(0, a.length - k)] : 1;
};
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Pixel metrics of one element.
 * @param img { w, h, rgba } from `decodePng`
 * @param box { x, y, w, h } CSS px (= frame px at DPR 1)
 */
export function elementPixelMetrics(img, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w));
  const y1 = Math.min(img.h, Math.ceil(box.y + box.h));
  const at = (x, y) => {
    const i = (y * img.w + x) * 4;
    return (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2];
  };
  const ring = new Map();
  for (let y = y0 - 4; y < y1 + 4; y += 1) {
    for (let x = x0 - 4; x < x1 + 4; x += 1) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      if (x >= x0 - 1 && x < x1 + 1 && y >= y0 - 1 && y < y1 + 1) continue;
      const v = at(x, y);
      ring.set(v, (ring.get(v) ?? 0) + 1);
    }
  }
  const surround = modeOf(ring);
  const inside = new Map();
  const band = new Map();
  const pixels = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const v = at(x, y);
      pixels.push(v);
      inside.set(v, (inside.get(v) ?? 0) + 1);
      if (x - x0 < 2 || x1 - 1 - x < 2 || y - y0 < 2 || y1 - 1 - y < 2) band.set(v, (band.get(v) ?? 0) + 1);
    }
  }
  const area = pixels.length;
  if (area === 0 || surround === undefined) return null;
  const k = Math.max(3, Math.ceil(0.005 * area));
  const field = modeOf(inside);
  const toSurround = pixels.map((v) => contrastOf(v, surround));
  const toField = pixels.map((v) => contrastOf(v, field));
  const bandTotal = [...band.values()].reduce((a, b) => a + b, 0);
  const edge = Math.max(1, ...[...band].filter(([, n]) => n >= 0.15 * bandTotal).map(([v]) => contrastOf(v, surround)));
  const coverage = Object.fromEntries(COVERAGE_LEVELS.map((c) => [String(c), r3(toSurround.filter((t) => t >= c).length / area)]));
  return {
    area,
    salience: r3(kthHighest(toSurround, k)),
    coverage,
    fill: r3(contrastOf(field, surround)),
    edge: r3(edge),
    ink: r3(kthHighest(toField, k)),
  };
}

/** The class-specific readings of the metrics (reported; the classification uses salience and coverage). */
export function readings(cls, m, appearance = {}) {
  switch (cls) {
    case "textbox":
      return { fieldOrEdge: Math.max(m.fill, m.edge) };
    case "icon":
      return appearance.plate === "none" ? { glyphVsPage: m.salience } : { plateVsPage: m.fill, glyphVsPlate: m.ink };
    case "link":
      return { textVsPage: m.ink };
    case "button":
    case "select":
    case "tab":
      return { boundary: Math.max(m.fill, m.edge), textVsFill: m.ink };
    case "checkbox":
    case "radio":
      return { markVsPage: m.salience };
    default:
      return {};
  }
}

const REQUIRED = ["salienceInvisibleBelow", "salienceVisibleAtLeast", "coverageContrast", "coverageInvisibleBelow", "coverageVisibleAtLeast"];

/** Refuse thresholds that are missing or inconsistent. There is no default. */
export function assertThresholds(t) {
  for (const k of REQUIRED) if (typeof t?.[k] !== "number" || !Number.isFinite(t[k])) throw new Error(`G10: threshold ${k} must be stated (no default is invented)`);
  if (!COVERAGE_LEVELS.includes(t.coverageContrast)) throw new Error(`G10: coverageContrast must be one of the measured levels ${COVERAGE_LEVELS.join(", ")}`);
  if (!(t.salienceInvisibleBelow <= t.salienceVisibleAtLeast) || !(t.coverageInvisibleBelow <= t.coverageVisibleAtLeast)) {
    throw new Error("G10: each 'invisible below' threshold must not exceed its 'visible at least' threshold");
  }
}

/**
 * VISIBLE when salience and coverage both reach their "visible" thresholds; INVISIBLE when either is
 * below its "invisible" threshold; BORDERLINE in between. NOT_APPLICABLE for anything that is not an
 * intended positive (occlusion cases are hidden on purpose) or has no pixels to measure.
 */
export function classifyVisibility(intent, m, t) {
  assertThresholds(t);
  if (intent !== "positive" || !m) return "NOT_APPLICABLE";
  const cov = m.coverage[String(t.coverageContrast)];
  if (m.salience < t.salienceInvisibleBelow || cov < t.coverageInvisibleBelow) return "INVISIBLE";
  if (m.salience >= t.salienceVisibleAtLeast && cov >= t.coverageVisibleAtLeast) return "VISIBLE";
  return "BORDERLINE";
}
