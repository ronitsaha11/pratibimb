/**
 * v2 appearance (M22.3): how a sample looks, drawn from its seed. Pure.
 *
 * A PAGE draws one palette, one font stack, one control style and one density level from its
 * seed's `appearance` stream: one design language per page, as real pages have. Each ELEMENT then
 * draws its own details (an icon's glyph and plate, a checkbox's checked state, a link's underline,
 * a neutral label word) from the seed's `elements` stream, in element order.
 *
 * Nothing here loads an asset: colours are hex values, fonts are local stacks ending in a generic
 * family, glyphs are CSS gradients (`html.mjs`). No label word is personal or page-derived.
 */
import { CONTROL_STYLES, DENSITY_LEVELS, FONT_STACKS, HIT_SAFE_RADIUS, ICON_GLYPHS, ICON_PLATES, NATIVE_BASE_PX, PALETTES } from "./config.mjs";
import { rngOf } from "./prng.mjs";

/** Neutral label words for buttons, links, tabs and selects; two-letter ones for the narrowest controls. */
export const WORDS = Object.freeze(["Apply", "Next", "Back", "Save", "Open", "Close", "Find", "Help", "Edit", "Done", "Start", "Step", "More", "View", "Add", "Sort", "Go", "OK"]);

/**
 * Label fitting (M22.6). Candidate 1 drew every label at a size set by the box height alone, so wide
 * words in narrow boxes were cut by `overflow: hidden`. Now the word and its size are chosen to fit
 * the box's width, estimating a character at `CHAR_EM` of the font size (a deliberately generous
 * estimate; fonts differ). The box is never changed. If no word fits at 4 px, the shortest is drawn
 * and recorded as `fitted: false`. The renderer measures what really overflowed.
 */
export const CHAR_EM = 0.66;
const MIN_FONT_PX = 4;

function fitLabel(rng, cls, w, h, style) {
  let fontPx = Math.max(6, Math.round(h * (cls === "link" ? 0.7 : 0.5)));
  const edges = cls === "link" ? 0 : 2 * style.border + 2;
  const arrowPx = (f) => (cls === "select" ? Math.max(12, Math.round(f * 1.6)) : 0); // the select's drop-down arrow
  const fits = (word, f) => word.length * f * CHAR_EM <= w - edges - arrowPx(f);
  let pool = WORDS.filter((x) => fits(x, fontPx));
  while (pool.length === 0 && fontPx > MIN_FONT_PX) {
    fontPx -= 1;
    pool = WORDS.filter((x) => fits(x, fontPx));
  }
  const fitted = pool.length > 0;
  const label = rng.pick(fitted ? pool : WORDS.filter((x) => x.length === 2));
  return { label, fontPx, fitted };
}

const byId = (list, id, what) => {
  const v = list.find((x) => x.id === id);
  if (!v) throw new Error(`appearance: unknown ${what} ${JSON.stringify(id)}`);
  return v;
};
export const paletteOf = (id) => byId(PALETTES, id, "palette");
export const controlStyleOf = (id) => byId(CONTROL_STYLES, id, "control style");
export const densityLevelOf = (id) => byId(DENSITY_LEVELS, id, "density level");

/** One page's design language, from its seed. */
export function pageAppearanceOf(seed) {
  const rng = rngOf(seed, "appearance");
  return {
    palette: rng.pick(PALETTES).id,
    font: rng.pick(FONT_STACKS),
    controlStyle: rng.pick(CONTROL_STYLES).id,
    density: rng.pick(DENSITY_LEVELS).id,
  };
}

/** The corner radius, CSS px, a labelled w × h box may have under a style: never above HIT_SAFE_RADIUS. */
export const hitSafeRadiusPx = (style, w, h) => Math.floor(Math.min(style.radius, HIT_SAFE_RADIUS) * Math.min(w, h));

/**
 * One element's own appearance. `rng` is the sample's `elements` stream, drawn in element order.
 * Native checkboxes and radios keep the browser's own drawing (`radiusPx: 0`, `native: true`).
 */
export function elementAppearanceOf(rng, cls, w, h, style) {
  // M22.6: the browser's own control, drawn at its natural size and scaled to the box, so a large
  // checkbox is a scaled checkbox (borders scale too) rather than a hairline square.
  if (cls === "checkbox" || cls === "radio") return { native: true, radiusPx: 0, checked: rng.next() < 0.5, nativeScale: w / NATIVE_BASE_PX };
  const radiusPx = hitSafeRadiusPx(style, w, h);
  if (cls === "icon") return { native: false, radiusPx, glyph: rng.pick(ICON_GLYPHS), plate: rng.pick(ICON_PLATES) };
  if (cls === "textbox") return { native: false, radiusPx, textbox: { ...style.textbox, bottom: style.textbox.bottom ? { ...style.textbox.bottom } : null } };
  const out = { native: false, radiusPx, ...fitLabel(rng, cls, w, h, style) };
  if (cls === "link") out.underline = rng.next() < 0.5;
  if (cls === "tab") out.selected = rng.next() < 0.3;
  return out;
}
