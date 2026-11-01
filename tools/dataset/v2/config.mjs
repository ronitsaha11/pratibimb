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
  version: "2.0.0-draft",
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
 * Per-class shape. `aspect` = width ÷ height, drawn uniformly. Icons also draw a shape. The ranges
 * cover v1's observed aspects and widen them; they are generation geometry, not a realism claim.
 */
export const CLASS_GEOMETRY = Object.freeze({
  button: Object.freeze({ aspect: [1.5, 6] }),
  link: Object.freeze({ aspect: [2.5, 10] }),
  textbox: Object.freeze({ aspect: [4, 12] }),
  checkbox: Object.freeze({ aspect: [1, 1] }),
  radio: Object.freeze({ aspect: [1, 1] }),
  select: Object.freeze({ aspect: [3, 8] }),
  tab: Object.freeze({ aspect: [1.5, 4] }),
  icon: Object.freeze({ aspect: [0.8, 1.25], shapes: Object.freeze(["circle", "square", "rounded", "glyph"]) }),
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
