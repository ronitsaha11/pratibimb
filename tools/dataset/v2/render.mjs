/**
 * v2 rendering (M22.4): a planned spec → its frame, its measured geometry and its hit-test validity.
 * TRAIN and DEV only. `build-candidate.mjs` drives it; this module holds the browser step and the
 * pure checks around it.
 *
 * THE BROWSER STEP (`renderSample`), for one spec, in one page of a headless Chromium context created
 * with `deviceScaleFactor: 1`, offline, every request aborted:
 *   1. set the viewport to the spec's exactly, and load the spec's standalone HTML with `setContent`
 *      (no URL, no network: the document loads nothing);
 *   2. wait for fonts, then read back the viewport, DPR and every labelled element's
 *      `getBoundingClientRect` and computed `position` (`__measureV2`), and every occluder's rect;
 *   3. for each labelled element, ask `document.elementFromPoint` at the 5 × 5 and 9 × 9 points of
 *      `samplingPlan` whether the answer is the element by `hitMatches` — both functions from
 *      `tests/browser/support/fixture-validity.mjs`, the tested M22 rule, injected from source — and
 *      classify with `classifyElement`. Nothing in the page decides a category;
 *   4. capture the viewport as PNG.
 *
 * A hit is the browser's hit test, not a pixel: no grid proves pixel-level visibility.
 *
 * FAIL CLOSED (`renderDefects`): a wrong viewport or DPR, a frame of the wrong size, a labelled
 * element or occluder missing or extra, an occluder rendered away from its declared box, or any
 * network request is a DEFECT, and a build with a defect is refused. A labelled element rendered
 * away from its declared box is not a render defect: it is recorded as measured, and the gate (G4,
 * G8) fails it.
 */
import { isAbsolute, join, relative, resolve } from "node:path";
import { classifyElement, hitMatches, samplingPlan } from "../../../tests/browser/support/fixture-validity.mjs";
import { specToHtmlV2 } from "./html.mjs";
import { sha256 } from "./prng.mjs";

export const RENDERABLE_SPLITS = Object.freeze(["train", "dev"]);

/** The only primary destination: a new, numbered candidate of this generator version. */
export const CANDIDATE_PREFIX = "t1-ui-synthetic-2.1.0-draft-candidate-";

/**
 * Where a primary candidate goes: `<repo>/artifacts/datasets/<CANDIDATE_PREFIX><n>`. Nothing else
 * under `artifacts/datasets` is named, listed or read; the caller checks that this exact path does
 * not exist yet.
 */
export function candidateRoot(repoRoot, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`candidate number must be a positive integer, got ${n}`);
  return join(repoRoot, "artifacts", "datasets", `${CANDIDATE_PREFIX}${n}`);
}

/** A scratch destination (reproducibility runs) must be absolute and outside the repository. */
export function assertScratchRoot(repoRoot, dir) {
  if (typeof dir !== "string" || !isAbsolute(dir)) throw new Error("scratch destination must be an absolute path");
  const rel = relative(resolve(repoRoot), resolve(dir));
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (inside) throw new Error("scratch destination must be outside the repository");
  return resolve(dir);
}

/** Width and height from a PNG's IHDR. Throws if it is not a PNG. */
export function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || sig.some((b, i) => buf[i] !== b) || buf.toString("latin1", 12, 16) !== "IHDR") throw new Error("not a PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const edgeDelta = (a, d) => Math.max(Math.abs(a.x - d.x), Math.abs(a.y - d.y), Math.abs(a.x + a.w - (d.x + d.w)), Math.abs(a.y + a.h - (d.y + d.h)));

/**
 * Everything wrong with one render that must refuse the build. Pure.
 * @returns string[] — empty when the render is complete and consistent
 */
export function renderDefects(spec, r, { occluderTolerancePx }) {
  const out = [];
  const v = r.environment;
  if (v.w !== spec.viewport.w || v.h !== spec.viewport.h) out.push(`viewport ${v.w}x${v.h}, spec ${spec.viewport.w}x${spec.viewport.h}`);
  if (v.dpr !== 1) out.push(`device pixel ratio ${v.dpr}, expected 1`);
  if (r.frame.w !== spec.viewport.w || r.frame.h !== spec.viewport.h) out.push(`frame ${r.frame.w}x${r.frame.h}, spec ${spec.viewport.w}x${spec.viewport.h}`);
  if (r.requests > 0) out.push(`${r.requests} network request(s) attempted`);
  const want = spec.elements.map((e) => e.key);
  const got = r.elements.map((e) => e.key);
  if (want.join() !== got.join()) out.push(`labelled elements rendered [${got.length}] differ from the spec's [${want.length}]`);
  for (const e of r.elements) {
    if (![e.rect.x, e.rect.y, e.rect.w, e.rect.h].every(Number.isFinite)) out.push(`${e.key}: non-finite rect`);
    if (!r.validity[e.key]) out.push(`${e.key}: no hit-test classification`);
  }
  const occ = new Map(r.occluders.map((o) => [o.id, o.rect]));
  if (occ.size !== spec.occluders.length) out.push(`occluders rendered [${occ.size}] differ from the spec's [${spec.occluders.length}]`);
  for (const o of spec.occluders) {
    const rect = occ.get(o.id);
    if (!rect) out.push(`${o.id}: occluder not rendered`);
    else if (!(edgeDelta(rect, o.box) <= occluderTolerancePx)) out.push(`${o.id}: occluder rendered ${edgeDelta(rect, o.box)} px from its declared box`);
  }
  return out;
}

/**
 * Render one spec in `page` (see the module comment). `requestsSoFar()` reports the context's
 * aborted-request count. Returns the measured render; `renderDefects` judges it.
 */
export async function renderSample(page, spec, requestsSoFar) {
  if (!RENDERABLE_SPLITS.includes(spec.split)) throw new Error(`render: only ${RENDERABLE_SPLITS.join(" and ")} are rendered, not ${JSON.stringify(spec.split)}`);
  const before = requestsSoFar();
  const html = specToHtmlV2(spec);
  await page.setViewportSize({ width: spec.viewport.w, height: spec.viewport.h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const environment = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
  await page.addScriptTag({ content: `window.__v2HitMatches = ${hitMatches.toString()};` });
  const elements = await page.evaluate(() => window.__measureV2());
  const occluders = await page.evaluate(() => window.__measureV2Occluders());
  const viewport = { w: spec.viewport.w, h: spec.viewport.h };
  const plans = elements.map((e) => ({ key: e.key, plan: samplingPlan(e.rect, viewport) }));
  const answers = await page.evaluate((list) => {
    return list.map(({ key, plan }) => {
      const el = document.querySelector(`[data-v2="${CSS.escape(key)}"]`);
      if (!el) return null;
      const probe = (pts) => pts.map((p) => window.__v2HitMatches(el, document.elementFromPoint(p.x, p.y)));
      return { five: probe(plan.points5), nine: probe(plan.points9) };
    });
  }, plans);
  const validity = {};
  const hitTest = {};
  elements.forEach((e, k) => {
    const a = answers[k];
    if (!a) return;
    const c = classifyElement(e.rect, viewport, a.five, a.nine);
    validity[e.key] = c.category;
    hitTest[e.key] = { category5: c.category5, category9: c.category9, fraction5: c.fraction5, fraction9: c.fraction9 };
  });
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide", scale: "css" });
  const size = pngSize(png);
  return {
    html,
    htmlSha256: sha256(html),
    environment,
    elements,
    occluders,
    validity,
    hitTest,
    png,
    frame: { w: size.w, h: size.h, sha256: sha256(png) },
    requests: requestsSoFar() - before,
  };
}
