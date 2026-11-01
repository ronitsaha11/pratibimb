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
 * Text is drawn from a small neutral word list; no personal data.
 */
import { paletteOf, controlStyleOf } from "./appearance.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const px = (b) => `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;

/** A glyph in colour `c`, drawn inside the box. */
function glyphCss(glyph, c, w, h) {
  const g = (pos, size) => `linear-gradient(${c},${c}) ${pos}/${size} no-repeat`;
  switch (glyph) {
    case "disc":
      return `background-image:radial-gradient(circle,${c} 0 38%,transparent 39%)`;
    case "ring":
      return `background-image:radial-gradient(circle,transparent 0 24%,${c} 25% 38%,transparent 39%)`;
    case "square":
      return `background:${g("center", "56% 56%")}`;
    case "bars":
      return `background:${g("50% 22%", "64% 14%")},${g("50% 50%", "64% 14%")},${g("50% 78%", "64% 14%")}`;
    case "cross":
      return `background-image:linear-gradient(45deg,transparent 43%,${c} 43% 57%,transparent 57%),linear-gradient(-45deg,transparent 43%,${c} 43% 57%,transparent 57%)`;
    case "plus":
      return `background:${g("center", "62% 16%")},${g("center", "16% 62%")}`;
    case "slash":
      return `background-image:linear-gradient(135deg,transparent 42%,${c} 42% 58%,transparent 58%)`;
    case "dots":
      return `background-image:radial-gradient(circle,${c} 0 28%,transparent 30%);background-size:50% 50%`;
    case "chevron":
      return `background:linear-gradient(to bottom right,transparent 42%,${c} 42% 58%,transparent 58%) left/50% 100% no-repeat,linear-gradient(to bottom left,transparent 42%,${c} 42% 58%,transparent 58%) right/50% 100% no-repeat`;
    case "frame":
      return `box-shadow:inset 0 0 0 ${Math.max(1, Math.round(0.12 * Math.min(w, h)))}px ${c}`;
    default:
      throw new Error(`html: unknown glyph ${glyph}`);
  }
}

function elementHtml(e, style) {
  const ap = e.appearance;
  const radius = `border-radius:${ap.radiusPx}px`;
  const a = `data-v2="${esc(e.key)}" style="${px(e.box)};${radius}`;
  const font = `font-size:${Math.max(6, Math.round(e.box.h * (e.cls === "link" ? 0.7 : 0.5)))}px`;
  const filled = style.fill === "accent";
  const control = `background:var(--${style.fill});color:${filled ? "var(--on-accent)" : "var(--text)"}`;
  switch (e.cls) {
    case "button":
      return `<button type="button" class="ctl" ${a};${font};${control}">${esc(ap.label)}</button>`;
    case "link":
      return `<a href="#v2" ${a};${font};line-height:${e.box.h}px;text-decoration:${ap.underline ? "underline" : "none"}">${esc(ap.label)}</a>`;
    case "textbox":
      return `<input type="text" class="ctl" ${a};${font};background:var(--page);color:var(--text)" />`;
    case "checkbox":
      return `<input type="checkbox" ${a}"${ap.checked ? " checked" : ""} />`;
    case "radio":
      return `<input type="radio" name="g-${esc(e.key)}" ${a}"${ap.checked ? " checked" : ""} />`;
    case "select":
      return `<select class="ctl" ${a};${font};${control}"><option>${esc(ap.label)}</option></select>`;
    case "tab":
      return `<div role="tab" class="ctl" ${a};${font};line-height:${e.box.h}px;${control}${ap.selected ? ";box-shadow:inset 0 -2px 0 var(--accent)" : ""}">${esc(ap.label)}</div>`;
    case "icon": {
      const plate = ap.plate === "none" ? "transparent" : `var(--${ap.plate})`;
      const ink = ap.plate === "accent" ? "var(--on-accent)" : "var(--accent)";
      return `<div role="img" aria-label="icon" ${a};background-color:${plate};${glyphCss(ap.glyph, ink, e.box.w, e.box.h)}"></div>`;
    }
    default:
      throw new Error(`html: unknown class ${e.cls}`);
  }
}

function decorHtml(d) {
  const at = `class="decor" aria-hidden="true" style="${px(d.box)}`;
  if (d.kind === "text-lines") {
    const period = d.lineHeight + d.gap;
    return `<div ${at};background-image:repeating-linear-gradient(180deg,var(--decor) 0 ${d.lineHeight}px,transparent ${d.lineHeight}px ${period}px)"></div>`;
  }
  if (d.kind === "divider") return `<div ${at};background:var(--border)"></div>`;
  return `<div ${at};background:var(--decor);border:1px solid var(--border)"></div>`;
}

export function specToHtmlV2(spec) {
  const p = paletteOf(spec.appearance.palette);
  const style = controlStyleOf(spec.appearance.controlStyle);
  const ctl = [
    `border:${style.underline ? 0 : style.border}px solid var(--border)`,
    style.underline ? "border-bottom:2px solid var(--accent)" : "",
    style.shadow ? "box-shadow:0 1px 2px rgba(0,0,0,.35)" : "",
  ].filter(Boolean).join(";");
  const occluders = spec.occluders.map((o) => `<div class="occluder" data-occluder="${esc(o.id)}" data-occludes="${esc(o.for)}" style="${px(o.box)}"></div>`).join("");
  return `<!DOCTYPE html>
<meta charset="utf-8" />
<title>${esc(spec.id)}</title>
<style>
  :root{--page:${p.page};--text:${p.text};--masthead:${p.masthead};--surface:${p.surface};--border:${p.border};--accent:${p.accent};--on-accent:${p.onAccent};--decor:${p.decor};--occluder:${p.occluder};color-scheme:${p.scheme}}
  *{box-sizing:border-box;margin:0}
  html,body{width:${spec.viewport.w}px;height:${spec.viewport.h}px;overflow:hidden;background:var(--page);font-family:${spec.appearance.font};color:var(--text)}
  header{position:absolute;left:0;top:0;width:100%;height:${spec.masthead.h}px;background:var(--masthead)}
  [data-v2]{position:absolute;z-index:1;padding:0;border:0;overflow:hidden;white-space:nowrap;font-family:inherit}
  .ctl{${ctl}}
  a[data-v2]{display:block;background:transparent;color:var(--accent)}
  input[type=checkbox][data-v2],input[type=radio][data-v2]{accent-color:var(--accent)}
  [role=tab][data-v2]{text-align:center}
  .decor{position:absolute;z-index:0}
  .occluder{position:absolute;z-index:2;background:var(--occluder)}
</style>
<header></header>
${spec.decor.map(decorHtml).join("\n")}
${spec.elements.map((e) => elementHtml(e, style)).join("\n")}
${occluders}
<script>
  const rectOf = (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  window.__measureV2 = () => [...document.querySelectorAll("[data-v2]")].map((n) => ({ key: n.getAttribute("data-v2"), rect: rectOf(n), computedPosition: getComputedStyle(n).position }));
  window.__measureV2Occluders = () => [...document.querySelectorAll("[data-occluder]")].map((n) => ({ id: n.getAttribute("data-occluder"), rect: rectOf(n) }));
</script>`;
}
