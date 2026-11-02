/**
 * v2 HTML: a laid-out sample → a standalone document. Pure.
 *
 * Every labelled element carries `data-v2="<key>"` and its declared box inline, and ONE stylesheet
 * rule gives every `[data-v2]` `position:absolute` — the rule v1's icon lacked. Occluders are drawn
 * above (`z-index:2`) and are never labelled; decor is drawn below (`z-index:0`), never overlaps a
 * labelled element and is never labelled. `__measureV2()` returns, in document order (= spec order),
 * each labelled element's rendered rect and computed `position`, for G8; `__measureV2Occluders()`
 * returns each occluder's rendered rect, for provenance.
 *
 * APPEARANCE (M22.3) comes from the spec: palette colours as CSS custom properties, one local font
 * stack, one control style, and per element its own details. Icon glyphs are CSS gradients inside
 * the icon's rectangular box, and every labelled element's corner radius is the spec's hit-safe
 * radius, so the whole box stays hit-testable. No image, no URL, no @font-face, no @import.
 *
 * M22.6 fixes (from the M22.5 review of candidate 1):
 *   - TEXTBOX: drawn by its style's `textbox` treatment (`config.mjs`) — a field fill other than the
 *     page, or a full edge, never page-on-page.
 *   - ICON: the plate is `background-color` and the glyph is `background-image` with its own
 *     `-position`, `-size` and `-repeat` LONGHANDS. The `background:` shorthand is never used on an
 *     icon: it reset the plate to transparent for four glyphs in candidate 1.
 *   - CHECKBOX / RADIO: the browser's own control at its natural size, scaled to the box with a
 *     top-left transform, so its rendered rect is still the declared box.
 *   - LABELS: the fitted word and font size from the spec; `__measureV2` reports how many px of text
 *     overflowed each text element, so residual clipping is measured, not assumed away.
 *   - DECOR: dividers are dashed and panels borderless with a header band, so neither reads as an
 *     underlined or outlined field. OCCLUDERS vary in look (solid, banded, striped, card); their
 *     geometry is unchanged.
 *
 * Text is drawn from a small neutral word list; no personal data.
 */
import { NATIVE_BASE_PX } from "./config.mjs";
import { controlStyleOf, paletteOf } from "./appearance.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const px = (b) => `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;

/** Glyph layers in colour `c`: [image, position, size, repeat]. Drawn inside the box, over the plate. */
function glyphLayers(glyph, c) {
  const solid = `linear-gradient(${c},${c})`;
  switch (glyph) {
    case "disc":
      return [[`radial-gradient(circle,${c} 0 38%,transparent 39%)`, "center", "100% 100%", "no-repeat"]];
    case "ring":
      return [[`radial-gradient(circle,transparent 0 24%,${c} 25% 38%,transparent 39%)`, "center", "100% 100%", "no-repeat"]];
    case "square":
      return [[solid, "center", "56% 56%", "no-repeat"]];
    case "bars":
      return ["22%", "50%", "78%"].map((y) => [solid, `50% ${y}`, "64% 14%", "no-repeat"]);
    case "cross":
      return [45, -45].map((deg) => [`linear-gradient(${deg}deg,transparent 43%,${c} 43% 57%,transparent 57%)`, "center", "100% 100%", "no-repeat"]);
    case "plus":
      return [[solid, "center", "62% 16%", "no-repeat"], [solid, "center", "16% 62%", "no-repeat"]];
    case "slash":
      return [[`linear-gradient(135deg,transparent 42%,${c} 42% 58%,transparent 58%)`, "center", "100% 100%", "no-repeat"]];
    case "dots":
      return [[`radial-gradient(circle,${c} 0 28%,transparent 30%)`, "0 0", "50% 50%", "repeat"]];
    case "chevron":
      return [
        [`linear-gradient(to bottom right,transparent 42%,${c} 42% 58%,transparent 58%)`, "left", "50% 100%", "no-repeat"],
        [`linear-gradient(to bottom left,transparent 42%,${c} 42% 58%,transparent 58%)`, "right", "50% 100%", "no-repeat"],
      ];
    case "frame":
      return [];
    default:
      throw new Error(`html: unknown glyph ${glyph}`);
  }
}

/** An icon's plate and glyph as separate longhand declarations — never the `background:` shorthand. */
export function iconCss(ap, w, h) {
  const plate = ap.plate === "none" ? "transparent" : `var(--${ap.plate})`;
  const ink = ap.plate === "accent" ? "var(--on-accent)" : "var(--accent)";
  const layers = glyphLayers(ap.glyph, ink);
  const decl = [`background-color:${plate}`];
  if (layers.length) {
    decl.push(`background-image:${layers.map((l) => l[0]).join(",")}`);
    decl.push(`background-position:${layers.map((l) => l[1]).join(",")}`);
    decl.push(`background-size:${layers.map((l) => l[2]).join(",")}`);
    decl.push(`background-repeat:${layers.map((l) => l[3]).join(",")}`);
  }
  if (ap.glyph === "frame") decl.push(`box-shadow:inset 0 0 0 ${Math.max(1, Math.round(0.12 * Math.min(w, h)))}px ${ink}`);
  return decl.join(";");
}

const colourVar = (name) => `var(--${name === "fieldEdge" ? "field-edge" : name})`;

/** A textbox's field, by its style's treatment (M22.6). */
export function textboxCss(tb) {
  const decl = [`background:${colourVar(tb.fill)}`];
  decl.push(tb.border ? `border:${tb.border}px solid ${colourVar(tb.edge)}` : "border:0");
  if (tb.bottom) decl.push(`border-bottom:${tb.bottom.px}px solid ${colourVar(tb.bottom.colour)}`);
  return decl.join(";");
}

function elementHtml(e, style) {
  const ap = e.appearance;
  const key = `data-v2="${esc(e.key)}"`;
  const box = `${px(e.box)};border-radius:${ap.radiusPx}px`;
  const filled = style.fill === "accent";
  const control = `background:var(--${style.fill});color:${filled ? "var(--on-accent)" : "var(--text)"}`;
  const text = `${key} data-text="1" style="${box};font-size:${ap.fontPx}px`;
  switch (e.cls) {
    case "button":
      return `<button type="button" class="ctl" ${text};${control}">${esc(ap.label)}</button>`;
    case "link":
      return `<a href="#v2" ${text};line-height:${e.box.h}px;text-decoration:${ap.underline ? "underline" : "none"}">${esc(ap.label)}</a>`;
    case "textbox":
      return `<input type="text" ${key} style="${box};${textboxCss(ap.textbox)}" />`;
    case "checkbox":
    case "radio": {
      // Natural size, scaled to the box from its top-left corner: the rendered rect is the box.
      const s = `left:${e.box.x}px;top:${e.box.y}px;width:${NATIVE_BASE_PX}px;height:${NATIVE_BASE_PX}px;transform:scale(${ap.nativeScale});transform-origin:0 0`;
      const name = e.cls === "radio" ? ` name="g-${esc(e.key)}"` : "";
      return `<input type="${e.cls}"${name} ${key} style="${s}"${ap.checked ? " checked" : ""} />`;
    }
    case "select":
      return `<select class="ctl" ${key} style="${box};font-size:${ap.fontPx}px;${control}"><option>${esc(ap.label)}</option></select>`;
    case "tab":
      return `<div role="tab" class="ctl" ${text};line-height:${e.box.h}px;${control}${ap.selected ? ";box-shadow:inset 0 -2px 0 var(--accent)" : ""}">${esc(ap.label)}</div>`;
    case "icon":
      return `<div role="img" aria-label="icon" ${key} style="${box};${iconCss(ap, e.box.w, e.box.h)}"></div>`;
    default:
      throw new Error(`html: unknown class ${e.cls}`);
  }
}

/** An occluder's look (M22.6). Always a full rectangle over its declared box. */
export function occluderCss(style) {
  switch (style) {
    case "solid":
      return "background-color:var(--occluder)";
    case "banded":
      return "background-color:var(--occluder);background-image:linear-gradient(var(--border),var(--border));background-size:100% 28%;background-repeat:no-repeat";
    case "striped":
      return "background-color:var(--occluder);background-image:repeating-linear-gradient(45deg,var(--surface) 0 4px,transparent 4px 10px)";
    case "card":
      return "background-color:var(--page);border:1px solid var(--border);background-image:linear-gradient(var(--occluder),var(--occluder));background-size:100% 22%;background-repeat:no-repeat";
    default:
      throw new Error(`html: unknown occluder style ${style}`);
  }
}

function decorHtml(d) {
  const at = `class="decor" aria-hidden="true" style="${px(d.box)}`;
  if (d.kind === "text-lines") {
    const period = d.lineHeight + d.gap;
    return `<div ${at};background-image:repeating-linear-gradient(180deg,var(--decor) 0 ${d.lineHeight}px,transparent ${d.lineHeight}px ${period}px)"></div>`;
  }
  // Dashed, so a divider never reads as an underlined field's solid rule (M22.6).
  if (d.kind === "divider") return `<div ${at};background-image:repeating-linear-gradient(90deg,var(--border) 0 6px,transparent 6px 11px)"></div>`;
  // Borderless, with a header band, so a panel never reads as an outlined field (M22.6).
  return `<div ${at};background-color:var(--decor);background-image:linear-gradient(var(--border),var(--border));background-size:100% 6px;background-repeat:no-repeat"></div>`;
}

export function specToHtmlV2(spec) {
  const p = paletteOf(spec.appearance.palette);
  const style = controlStyleOf(spec.appearance.controlStyle);
  const ctl = [
    `border:${style.underline ? 0 : style.border}px solid var(--border)`,
    style.underline ? "border-bottom:2px solid var(--accent)" : "",
    style.shadow ? "box-shadow:0 1px 2px rgba(0,0,0,.35)" : "",
  ].filter(Boolean).join(";");
  const occluders = spec.occluders.map((o) => `<div class="occluder" data-occluder="${esc(o.id)}" data-occludes="${esc(o.for)}" style="${px(o.box)};${occluderCss(o.style)}"></div>`).join("");
  return `<!DOCTYPE html>
<meta charset="utf-8" />
<title>${esc(spec.id)}</title>
<style>
  :root{--page:${p.page};--text:${p.text};--masthead:${p.masthead};--surface:${p.surface};--border:${p.border};--accent:${p.accent};--on-accent:${p.onAccent};--decor:${p.decor};--occluder:${p.occluder};--field:${p.field};--field-edge:${p.fieldEdge};color-scheme:${p.scheme}}
  *{box-sizing:border-box;margin:0}
  html,body{width:${spec.viewport.w}px;height:${spec.viewport.h}px;overflow:hidden;background:var(--page);font-family:${spec.appearance.font};color:var(--text)}
  header{position:absolute;left:0;top:0;width:100%;height:${spec.masthead.h}px;background:var(--masthead)}
  [data-v2]{position:absolute;z-index:1;padding:0;border:0;overflow:hidden;white-space:nowrap;font-family:inherit}
  .ctl{${ctl}}
  a[data-v2]{display:block;background:transparent;color:var(--accent)}
  input[type=checkbox][data-v2],input[type=radio][data-v2]{accent-color:var(--accent)}
  [role=tab][data-v2]{text-align:center}
  .decor{position:absolute;z-index:0}
  .occluder{position:absolute;z-index:2}
</style>
<header></header>
${spec.decor.map(decorHtml).join("\n")}
${spec.elements.map((e) => elementHtml(e, style)).join("\n")}
${occluders}
<script>
  const rectOf = (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  window.__measureV2 = () => [...document.querySelectorAll("[data-v2]")].map((n) => ({
    key: n.getAttribute("data-v2"),
    rect: rectOf(n),
    computedPosition: getComputedStyle(n).position,
    textOverflowPx: n.hasAttribute("data-text") ? Math.max(0, n.scrollWidth - n.clientWidth) : null,
  }));
  window.__measureV2Occluders = () => [...document.querySelectorAll("[data-occluder]")].map((n) => ({ id: n.getAttribute("data-occluder"), rect: rectOf(n) }));
</script>`;
}
