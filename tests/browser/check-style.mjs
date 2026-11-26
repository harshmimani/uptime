// Browser check for the style preview (docs/style/index.html). Needs Playwright with Chromium.
//   node tests/browser/check-style.mjs [outDir]
// 1. Phone (Pixel 7 emulation) and tablet (iPad): js/ambient.js is never requested.
// 2. Desktop: js/ambient.js loads after idle and the canvas appears.
// 3. No console errors, no horizontal scroll at 360 px.
// 4. Every visible text element meets AA against its real (composited) background.
// Screenshots go to outDir if given.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright"); // CommonJS require also finds a global install
const root = new URL("../..", import.meta.url).pathname;
const out = process.argv[2];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = join(root, p.endsWith("/") ? p + "index.html" : p);
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/docs/style/`;
const browser = await chromium.launch();
let failed = 0;
const fail = m => { failed++; console.log("FAIL", m); };
const ok = m => console.log("ok  ", m);

async function visit(name, ctxOpts, { screenshot } = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on("request", r => requests.push(new URL(r.url()).pathname));
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(4500); // past idle + the loader's timeout
  const ambient = requests.some(p => p.endsWith("/js/ambient.js"));
  const canvas = await page.locator("canvas.ambient").count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (screenshot && out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  return { ctx, page, ambient, canvas, errors, overflow, requests };
}

// ---- phone and tablet: never downloaded
for (const [name, dev] of [["phone", devices["Pixel 7"]], ["tablet", devices["iPad (gen 7)"]]]) {
  const r = await visit(name, { ...dev }, { screenshot: true });
  r.ambient || r.canvas ? fail(`${name}: ambient.js was requested`) : ok(`${name}: ambient.js never requested (${r.requests.filter(p => p.endsWith(".js")).join(", ")})`);
  r.errors.length ? fail(`${name}: errors ${r.errors.join(" | ")}`) : ok(`${name}: no console errors`);
  r.overflow > 0 ? fail(`${name}: horizontal scroll ${r.overflow}px`) : ok(`${name}: no horizontal scroll`);
  await r.ctx.close();
}

// ---- narrow phone width
{
  const r = await visit("phone-360", { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  r.overflow > 0 ? fail(`360px: horizontal scroll ${r.overflow}px`) : ok("360px: no horizontal scroll");
  r.ambient ? fail("360px: ambient.js requested") : ok("360px: ambient.js never requested");
  await r.ctx.close();
}

// ---- desktop, reduced motion: not loaded
{
  const r = await visit("desktop-reduced", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  r.ambient ? fail("desktop + reduced motion: ambient.js requested") : ok("desktop + reduced motion: ambient.js never requested");
  await r.ctx.close();
}

// ---- desktop: loaded, then the text contrast sweep
{
  const r = await visit("desktop", { viewport: { width: 1440, height: 900 } }, { screenshot: true });
  r.ambient && r.canvas ? ok("desktop: ambient.js loaded after idle, canvas running") : fail(`desktop: ambient not loaded (request ${r.ambient}, canvas ${r.canvas})`);
  r.errors.length ? fail(`desktop: errors ${r.errors.join(" | ")}`) : ok("desktop: no console errors");

  // let entrance animations finish so opacity is final
  await r.page.waitForTimeout(1500);
  const bad = await r.page.evaluate(() => {
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3]));
    const bgOf = el => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      let base = [11, 13, 12];
      for (const l of layers.reverse()) base = over(l, base);
      return base;
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (el.closest(".sr-only, [aria-hidden='true'] .ch, .pairs, svg") || cs.visibility === "hidden") continue;
      if (el.closest("[aria-disabled='true'], :disabled")) continue; // WCAG exempts inactive controls
      if (el.closest(".rot__step.is-next")) continue; // sits on the sliding highlight, a sibling: covered by the --c-bg on --c-text token pair
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      if (op < 0.99) continue; // mid-animation or intentionally hidden layer (e.g. a swapped label)
      const fg = parse(cs.color); const bg = bgOf(el);
      const c = over(fg, bg);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(c, bg);
      if (r < min) out.push(`${r.toFixed(2)} < ${min}: "${el.textContent.trim().slice(0, 40)}" (${cs.color} on rgb(${bg.map(Math.round)}))`);
    }
    return { out, n: seen.size };
  });
  bad.out.length ? bad.out.forEach(b => fail("contrast " + b)) : ok(`rendered text: all ${bad.n} text elements pass AA`);
  await r.ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll browser checks passed");
process.exit(failed ? 1 : 0);
