/**
 * M22.6 — the visual fixes, checked at the level of the generated CSS and the declared colours, for
 * EVERY palette × control style and EVERY glyph × plate. Pixel evidence is separate: the browser
 * fixture runner (`tools/dataset/v2/render-fixtures.mjs`) renders the same combinations and measures
 * them, because a CSS string can be right and still draw nothing.
 */
import { describe, expect, it } from "vitest";
import { CONTROL_STYLES, ICON_GLYPHS, ICON_PLATES, OCCLUDER_STYLES, PALETTES } from "../config.mjs";
import { WORDS, CHAR_EM, elementAppearanceOf } from "../appearance.mjs";
import { iconCss, occluderCss, textboxCss } from "../html.mjs";
import { rngOf, seedOf } from "../prng.mjs";

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("textbox: never page-on-page, in every palette × style", () => {
  for (const style of CONTROL_STYLES) {
    const tb = style.textbox;
    it(`${style.id}: a field fill other than the page, or a full edge; and a visible cue in every palette`, () => {
      expect(tb.fill !== "page" || tb.border > 0).toBe(true);
      if (tb.fill === "field") expect(tb.bottom).not.toBeNull(); // a tinted field always carries a rule
      const css = textboxCss(tb);
      expect(css).not.toMatch(/background:var\(--page\);border:0(;|$)/);
      for (const p of PALETTES) {
        // The strongest cue this style gives against the page: its edge, its bottom rule or its fill.
        const cues = [];
        if (tb.border) cues.push(contrast(p[tb.edge], p.page));
        if (tb.bottom) cues.push(contrast(p[tb.bottom.colour], p.page));
        if (tb.fill === "field") cues.push(contrast(p.field, p.page));
        expect(Math.max(...cues), `${style.id} / ${p.id}`).toBeGreaterThanOrEqual(1.9);
      }
    });
  }
  it("textbox styles still differ from one another", () => {
    expect(new Set(CONTROL_STYLES.map((s) => textboxCss(s.textbox))).size).toBe(CONTROL_STYLES.length);
  });
  it("every palette's field differs from its page, and text reads on it", () => {
    for (const p of PALETTES) {
      expect(contrast(p.field, p.page), p.id).toBeGreaterThanOrEqual(1.15);
      expect(contrast(p.text, p.field), p.id).toBeGreaterThanOrEqual(7);
    }
  });
  it("high-contrast's surface is no longer the page colour (flat controls had no edge)", () => {
    for (const p of PALETTES) expect(p.surface.toLowerCase(), p.id).not.toBe(p.page.toLowerCase());
  });
});

describe("icon: plate and glyph are separate layers, for every glyph × plate", () => {
  for (const glyph of ICON_GLYPHS) {
    for (const plate of ICON_PLATES) {
      it(`${glyph} on ${plate}`, () => {
        const css = iconCss({ glyph, plate }, 40, 40);
        expect(css).not.toMatch(/(^|;)background:/); // the shorthand reset the plate in candidate 1
        expect(css).toMatch(new RegExp(`^background-color:${plate === "none" ? "transparent" : `var\\(--${plate}\\)`}`));
        if (glyph !== "frame") expect(css).toMatch(/background-image:.+background-position:.+background-size:.+background-repeat:/);
      });
    }
  }
  it("glyph ink contrasts with its plate, and the plate (or the glyph, with no plate) with the page, in every palette", () => {
    for (const p of PALETTES) {
      expect(contrast(p.onAccent, p.accent), `${p.id} on-accent/accent`).toBeGreaterThanOrEqual(4);
      expect(contrast(p.accent, p.surface), `${p.id} accent/surface`).toBeGreaterThanOrEqual(4);
      // An accent plate against the page, or an un-plated accent glyph against the page: the same pair.
      expect(contrast(p.accent, p.page), `${p.id} accent/page`).toBeGreaterThanOrEqual(4);
      // A surface plate is faint against the page (1.14–1.35 by design); its accent glyph carries it.
      expect(contrast(p.surface, p.page), `${p.id} surface plate/page`).toBeGreaterThan(1);
    }
  });
});

describe("occluders and labels", () => {
  it("every occluder style is a full rectangle: no corner radius, no clip, no transparency of its own", () => {
    for (const s of OCCLUDER_STYLES) {
      const css = occluderCss(s);
      expect(css).not.toMatch(/border-radius|clip|opacity|transparent;|^background-color:transparent/);
      expect(css).toMatch(/^background-color:var\(--(occluder|page)\)/);
    }
  });
  it("a fitted label's estimated width fits its box, down to the 4 px floor", () => {
    const style = CONTROL_STYLES[0];
    let fitted = 0;
    let total = 0;
    for (const cls of ["button", "link", "tab", "select"]) {
      for (const [w, h] of [[8, 8], [12, 8], [20, 10], [30, 12], [60, 20], [200, 40], [96, 96]]) {
        const ap = elementAppearanceOf(rngOf(seedOf(["fixture", cls, w, h]), "elements"), cls, w, h, style);
        total += 1;
        expect(WORDS).toContain(ap.label);
        expect(ap.fontPx).toBeGreaterThanOrEqual(4);
        if (ap.fitted) {
          fitted += 1;
          const arrow = cls === "select" ? Math.max(12, Math.round(ap.fontPx * 1.6)) : 0;
          const edges = cls === "link" ? 0 : 2 * style.border + 2;
          expect(ap.label.length * ap.fontPx * CHAR_EM).toBeLessThanOrEqual(w - edges - arrow);
        }
      }
    }
    expect(fitted).toBeGreaterThan(total / 2);
  });
});
