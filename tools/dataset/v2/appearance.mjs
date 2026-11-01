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
import { CONTROL_STYLES, DENSITY_LEVELS, FONT_STACKS, HIT_SAFE_RADIUS, ICON_GLYPHS, ICON_PLATES, PALETTES } from "./config.mjs";
import { rngOf } from "./prng.mjs";

/** Neutral label words for buttons, links, tabs and selects. */
export const WORDS = Object.freeze(["Apply", "Next", "Back", "Save", "Open", "Close", "Find", "Help", "Edit", "Done", "Start", "Step", "More", "View", "Add", "Sort"]);

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
  if (cls === "checkbox" || cls === "radio") return { native: true, radiusPx: 0, checked: rng.next() < 0.5 };
  const radiusPx = hitSafeRadiusPx(style, w, h);
  if (cls === "icon") return { native: false, radiusPx, glyph: rng.pick(ICON_GLYPHS), plate: rng.pick(ICON_PLATES) };
  if (cls === "textbox") return { native: false, radiusPx };
  const out = { native: false, radiusPx, label: rng.pick(WORDS) };
  if (cls === "link") out.underline = rng.next() < 0.5;
  if (cls === "tab") out.selected = rng.next() < 0.3;
  return out;
}
