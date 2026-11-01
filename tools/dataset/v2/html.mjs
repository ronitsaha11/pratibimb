/**
 * v2 HTML: a laid-out sample → a standalone document. Pure.
 *
 * Every labelled element carries `data-v2="<key>"` and its declared box inline, and ONE stylesheet
 * rule gives every `[data-v2]` `position:absolute` — the rule v1's icon lacked. Occluders are drawn
 * above (`z-index:2`) and are never labelled. `__measureV2()` returns, in document order (= spec
 * order), each labelled element's rendered rect and computed `position`, for G8.
 *
 * Text is drawn from a small neutral word list; no personal data.
 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const px = (b) => `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px`;

const SHAPE_CSS = {
  circle: "border-radius:50%",
  square: "border-radius:0",
  rounded: "border-radius:22%",
  glyph: "border-radius:4px;background-image:linear-gradient(135deg,transparent 42%,#1b3a5c 42%,#1b3a5c 58%,transparent 58%)",
};

function elementHtml(e) {
  const a = `data-v2="${esc(e.key)}" style="${px(e.box)}`;
  const font = `font-size:${Math.max(6, Math.round(e.box.h * (e.cls === "link" ? 0.7 : 0.5)))}px`;
  switch (e.cls) {
    case "button":
      return `<button type="button" ${a};${font}">${esc(e.label)}</button>`;
    case "link":
      return `<a href="#v2" ${a};${font};line-height:${e.box.h}px">${esc(e.label)}</a>`;
    case "textbox":
      return `<input type="text" ${a};${font}" />`;
    case "checkbox":
      return `<input type="checkbox" ${a}" />`;
    case "radio":
      return `<input type="radio" name="g" ${a}" />`;
    case "select":
      return `<select ${a};${font}"><option>${esc(e.label)}</option></select>`;
    case "tab":
      return `<div role="tab" ${a};${font};line-height:${e.box.h}px">${esc(e.label)}</div>`;
    case "icon":
      return `<div role="img" aria-label="icon" ${a};${SHAPE_CSS[e.shape] ?? ""}"></div>`;
    default:
      throw new Error(`html: unknown class ${e.cls}`);
  }
}

export function specToHtmlV2(spec) {
  const occluders = spec.occluders.map((o) => `<div class="occluder" data-occludes="${esc(o.for)}" style="${px(o.box)}"></div>`).join("");
  return `<!DOCTYPE html>
<meta charset="utf-8" />
<title>${esc(spec.id)}</title>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${spec.viewport.w}px;height:${spec.viewport.h}px;overflow:hidden;background:#fff;font-family:system-ui,sans-serif;color:#111}
  header{position:absolute;left:0;top:0;width:100%;height:${spec.masthead.h}px;background:#12395c}
  [data-v2]{position:absolute;z-index:1;padding:0;border:1px solid #9db4cc;background:#e8eef6;overflow:hidden;white-space:nowrap}
  a[data-v2]{display:block;border:0;background:transparent;color:#12395c}
  [role=tab][data-v2]{text-align:center}
  .occluder{position:absolute;z-index:2;background:#5a6b7a}
</style>
<header></header>
${spec.elements.map(elementHtml).join("\n")}
${occluders}
<script>
  window.__measureV2 = () => [...document.querySelectorAll("[data-v2]")].map((n) => {
    const r = n.getBoundingClientRect();
    return { key: n.getAttribute("data-v2"), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, computedPosition: getComputedStyle(n).position };
  });
</script>`;
}
