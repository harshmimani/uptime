// Renders every app icon from assets/icon.svg. Needs Playwright with Chromium.
//   node tests/browser/make-icons.mjs
// - icon-192 / icon-512: full-bleed square (Android crops it to its own shape).
// - icon-maskable: the artwork shrunk to the 80% safe zone, so no launcher mask clips it.
// - apple-touch-icon (180): opaque, iOS rounds the corners itself.
// - favicon.svg: the same artwork as a vector, for browser tabs.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const dir = new URL("../../assets/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", dir), "utf8");
const art = svg.replace(/<!--[\s\S]*?-->\s*/g, "");

// maskable: same background, artwork scaled to 72% around the centre (inside the 80% safe circle)
const maskable = art.replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 256) scale(.72) translate(-256 -256)">$2</g></svg>');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(markup, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:#0B0D0C}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: new URL(file, dir).pathname, omitBackground: false });
  console.log("wrote", file);
}
await render(art, 192, "icon-192.png");
await render(art, 512, "icon-512.png");
await render(maskable, 512, "icon-maskable.png");
await render(art, 180, "apple-touch-icon.png");
writeFileSync(new URL("favicon.svg", dir), art.trim() + "\n");
console.log("wrote favicon.svg");
await browser.close();
