/**
 * T1 synthetic dataset, VERSION 2 — fixed configuration. Isolated from v1: nothing here is imported
 * by `tools/dataset/build-dataset.mjs`, and nothing here reads `artifacts/datasets`.
 *
 * Generation ranges are geometry the generator can draw. They are NOT quotas and NOT training
 * thresholds: how many examples of each class and size a split gets is a schedule the owner states
 * (`schedule.mjs`), and the quality gate's thresholds are the owner's too.
 */

export const V2 = Object.freeze({
  name: "t1-ui-synthetic",
  version: "2.1.0-draft", // M22.3: SHA-256 seeds, appearance variety, full provenance — every output differs from 2.0.0-draft
  generator: "tools/dataset/v2",
  modelInput: 640, // the T1 head's square input; model px = CSS px × 640 / max(viewport w, h) at DPR 1
});

export const CLASSES = Object.freeze(["button", "link", "textbox", "checkbox", "radio", "select", "tab", "icon"]);

/**
 * Size buckets by shorter side in model px — the M22 buckets, with generation bounds.
 * `lo` / `hi` are the M22 bucket edges. `drawLo` / `drawHi` are where the generator samples inside
 * the bucket: the very-small floor of 4 model px keeps a control renderable, and the large ceiling
 * keeps every class placeable in the smallest viewport. Both are recorded in every manifest.
 */
export const SIZE_BUCKETS = Object.freeze([
  Object.freeze({ id: "very-small", lo: 0, hi: 8, drawLo: 4, drawHi: 7.75 }),
  Object.freeze({ id: "small", lo: 8, hi: 16, drawLo: 8, drawHi: 15.75 }),
  Object.freeze({ id: "medium", lo: 16, hi: 32, drawLo: 16, drawHi: 31.75 }),
  Object.freeze({ id: "large", lo: 32, hi: Number.POSITIVE_INFINITY, drawLo: 32, drawHi: 48 }),
]);

/**
 * Per-class shape. `aspect` = width ÷ height, drawn LOG-UNIFORMLY (M22.3), so the narrow and the wide
 * end of each range are drawn equally often; until M22.3 the draw was uniform, which under-drew the
 * narrow end. M22.3 also widened the ranges (owner decision: are they acceptable?). A box wider than
 * the usable area is clamped to it, so very wide large boxes come out less wide than drawn; the
 * drawn and the realised aspect are both recorded. They are generation geometry, not a realism claim.
 */
export const CLASS_GEOMETRY = Object.freeze({
  button: Object.freeze({ aspect: [1, 6] }),
  link: Object.freeze({ aspect: [1.5, 12] }),
  textbox: Object.freeze({ aspect: [3, 16] }),
  checkbox: Object.freeze({ aspect: [1, 1] }),
  radio: Object.freeze({ aspect: [1, 1] }),
  select: Object.freeze({ aspect: [2.5, 10] }),
  tab: Object.freeze({ aspect: [1.2, 5] }),
  icon: Object.freeze({ aspect: [0.75, 4 / 3] }),
});

/** Viewports, CSS px at DPR 1: landscape, square-ish and portrait. One is drawn per sample. */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ w: 1280, h: 720 }),
  Object.freeze({ w: 1280, h: 800 }),
  Object.freeze({ w: 1024, h: 640 }),
  Object.freeze({ w: 960, h: 600 }),
  Object.freeze({ w: 1024, h: 1024 }),
  Object.freeze({ w: 800, h: 1280 }),
]);

/** Layout constants, CSS px. Clearance keeps intended positives apart, and off the masthead. */
export const LAYOUT = Object.freeze({
  mastheadHeight: Object.freeze([44, 60]),
  margin: 16,
  clearance: Object.freeze([8, 24]),
});

export const SPLITS = Object.freeze(["train", "dev", "test"]);

/** Hard limit on samples per split: ids are fixed-width (`train-00000` … `train-99999`), so string order is index order. */
export const MAX_SAMPLES_PER_SPLIT = 100000;

// ─────────────────────────────── appearance (M22.3) ───────────────────────────────
//
// Every value below is drawn from the sample's seed (`appearance.mjs`), so a sample's look is as
// reproducible as its layout. No external asset: no image, no downloaded or @font-face font, no URL.
// Colours are CSS hex; fonts are CSS font-family stacks ending in a generic family, resolved by
// whatever fonts the rendering machine has (the stack is recorded; the resolved face is UNKNOWN
// until a renderer records it).

/** Colour palettes: three light, two dark, one high-contrast. The first is M22.2's only palette. */
export const PALETTES = Object.freeze([
  Object.freeze({ id: "slate-light", scheme: "light", page: "#ffffff", text: "#111111", masthead: "#12395c", surface: "#e8eef6", border: "#9db4cc", accent: "#12395c", onAccent: "#ffffff", decor: "#e3e7ec", occluder: "#5a6b7a" }),
  Object.freeze({ id: "sand-light", scheme: "light", page: "#faf6ee", text: "#2b2118", masthead: "#7a4b1e", surface: "#efe4d2", border: "#c4a77f", accent: "#9c5a1c", onAccent: "#ffffff", decor: "#ebe2d3", occluder: "#6e5a46" }),
  Object.freeze({ id: "mint-light", scheme: "light", page: "#f4fbf7", text: "#0f2a1d", masthead: "#1d6b4a", surface: "#dcefe5", border: "#8fc2a8", accent: "#1d6b4a", onAccent: "#ffffff", decor: "#e0eee7", occluder: "#4d6b5d" }),
  Object.freeze({ id: "graphite-dark", scheme: "dark", page: "#1b1d21", text: "#e6e6e6", masthead: "#2c3038", surface: "#2f343c", border: "#59616e", accent: "#7fb0ff", onAccent: "#0d1420", decor: "#262a30", occluder: "#8a94a3" }),
  Object.freeze({ id: "navy-dark", scheme: "dark", page: "#0f1a2b", text: "#e3ebf5", masthead: "#1c2d48", surface: "#1d2f4a", border: "#4a6487", accent: "#f2b84b", onAccent: "#1a1306", decor: "#162540", occluder: "#9aa9bd" }),
  Object.freeze({ id: "high-contrast", scheme: "light", page: "#ffffff", text: "#000000", masthead: "#000000", surface: "#ffffff", border: "#000000", accent: "#0000c8", onAccent: "#ffffff", decor: "#d9d9d9", occluder: "#444444" }),
]);

/** Font stacks: local system faces only, each ending in a generic family. */
export const FONT_STACKS = Object.freeze([
  "system-ui, sans-serif",
  "Arial, Helvetica, sans-serif",
  "Verdana, Geneva, sans-serif",
  "Tahoma, sans-serif",
  "Georgia, serif",
  "'Times New Roman', Times, serif",
  "'Courier New', ui-monospace, monospace",
]);

/**
 * The largest corner radius a LABELLED element may have, as a share of its shorter side. Hit tests
 * respect rounded corners (INFERENCE from browser behaviour; UNKNOWN on this stack until rendered),
 * and the M22 validity grids sample points 1/(2n) of the way in from each edge: 1/18 for the 9 × 9
 * grid. A circular corner of radius r keeps the corner point (d, d) inside the box only while
 * r ≤ d / (1 − 1/√2) ≈ 3.41 d, i.e. r ≤ 0.19 × the shorter side for the 9 × 9 grid. 0.15 leaves a
 * margin. M22.2's `circle` (50%) and `rounded` (22%) icon radii broke this rule; round shapes are now
 * DRAWN inside a rectangular, fully hit-testable box instead (`ICON_GLYPHS`).
 */
export const HIT_SAFE_RADIUS = 0.15;

/**
 * Control appearances, one per sample (a page has one design language). `radius` is a share of the
 * shorter side, clamped to `HIT_SAFE_RADIUS`. `fill`: which palette colour fills the box.
 */
export const CONTROL_STYLES = Object.freeze([
  Object.freeze({ id: "outlined", border: 1, radius: 0.12, fill: "surface", underline: false, shadow: false }),
  Object.freeze({ id: "filled", border: 0, radius: 0.12, fill: "accent", underline: false, shadow: false }),
  Object.freeze({ id: "flat", border: 0, radius: 0, fill: "surface", underline: false, shadow: false }),
  Object.freeze({ id: "heavy-outline", border: 2, radius: 0.06, fill: "page", underline: false, shadow: false }),
  Object.freeze({ id: "underlined", border: 0, radius: 0, fill: "page", underline: true, shadow: false }),
  Object.freeze({ id: "raised", border: 1, radius: 0.15, fill: "surface", underline: false, shadow: true }),
]);

/**
 * Icon glyphs, drawn with CSS gradients INSIDE the icon's rectangular box (no image, no font glyph).
 * The box itself stays hit-testable everywhere; only the drawing is round, barred or crossed.
 */
export const ICON_GLYPHS = Object.freeze(["disc", "ring", "square", "bars", "cross", "plus", "slash", "dots", "chevron", "frame"]);
/** Whether the glyph sits on a filled plate or on the page. */
export const ICON_PLATES = Object.freeze(["none", "surface", "accent"]);

/**
 * Layout density, one per sample. `weight` scales how many targets the sample is dealt, relative to
 * the others (`schedule.mjs`); `decor` is how many unlabelled decorative blocks (text-line bars,
 * dividers, empty panels) are attempted. Decor never overlaps a labelled element or an occluder, sits
 * below them, and is never a label.
 */
export const DENSITY_LEVELS = Object.freeze([
  Object.freeze({ id: "sparse", weight: 1, decor: Object.freeze([0, 2]) }),
  Object.freeze({ id: "medium", weight: 2, decor: Object.freeze([2, 5]) }),
  Object.freeze({ id: "dense", weight: 3, decor: Object.freeze([4, 8]) }),
]);
export const DECOR_KINDS = Object.freeze(["text-lines", "divider", "panel"]);
