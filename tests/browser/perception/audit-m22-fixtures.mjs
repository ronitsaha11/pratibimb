/**
 * M22 fixture audit — NO DETECTOR. For every DEV spec in every planned M22 cell, does the browser's
 * own hit test at the centre of each measured element (wholly inside the viewport) return that
 * element? Prints counts per cell and, for failures, the element's tag/role and what covers it —
 * never text. The basis of `artifacts/experiments/M22-small-target-recall/design-amendment-1.md`.
 *
 *   CHROME_PATH="<Chrome for Testing chrome.exe>" node tests/browser/perception/audit-m22-fixtures.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const E = await import(pathToFileURL(join(ROOT, "packages/evaluation/dist/src/index.js")).href);
const G = await import(pathToFileURL(join(ROOT, "artifacts/experiments/W1-detector-precision-scale/harness/w1-guards.mjs")).href);
const { chromium } = await import("playwright");
const cells = [[1280,720,1],[1280,800,1],[1280,640,1],[1280,1280,1],[960,1280,1],[720,1280,1],[1280,720,0.5],[1280,720,0.75],[1280,720,1.5],[1280,720,2],[1280,720,3]];
const b = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const kinds = new Map(); let fails = 0, total = 0;
for (const [w, h, z] of cells) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  let cf = 0, ct = 0;
  for (let i = 0; i < 20; i++) {
    await page.setContent(E.specToHtml({ ...E.makeSpec(G.specIdFor(i), G.seedFor(i)), viewport: { w, h } }), { waitUntil: "load" });
    await page.addStyleTag({ content: `html,body{overflow:hidden!important} main{zoom:${z}}` });
    const r = await page.evaluate(() => {
      const out = [];
      for (const n of document.querySelectorAll("button,a,select,input,[role=tab],[role=img]")) {
        const b = n.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0 || b.right > innerWidth || b.bottom > innerHeight || b.x < 0 || b.y < 0) continue;
        const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        const ok = at === n || n.contains(at) || (at && at.control === n);
        const d = (e) => e ? `${e.tagName.toLowerCase()}${e.getAttribute("role") ? "[role=" + e.getAttribute("role") + "]" : ""}${e.type ? "[type=" + e.type + "]" : ""}` : "none";
        out.push({ ok, el: d(n), at: d(at), w: Math.round(b.width), h: Math.round(b.height) });
      }
      return out;
    });
    for (const x of r) { ct++; if (!x.ok) { cf++; const k = `${x.el} covered by ${x.at} (${x.w}x${x.h})`; kinds.set(k, (kinds.get(k) ?? 0) + 1); } }
  }
  total += ct; fails += cf;
  console.log(`${w}x${h} zoom ${z}: ${cf}/${ct} fail`);
}
console.log(`ALL: ${fails}/${total} fail`);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
await b.close();
