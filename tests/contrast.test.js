// WCAG 2.2 AA contrast for every colour pair the components use (docs/style/contrast.js),
// read straight from css/tokens.css so a token change can't slip through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAll, parseColor, over, luminance, PAIRS } from "../docs/style/contrast.js";

const css = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
const tokens = Object.fromEntries([...rootBlock.matchAll(/(--c-[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const get = name => { if (!(name in tokens)) throw new Error(`Missing token ${name}`); return tokens[name]; };

test("every listed pair meets WCAG 2.2 AA", () => {
  const fails = checkAll(get).filter(r => !r.pass)
    .map(r => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min} (${r.use})`);
  assert.deepEqual(fails, []);
});

test("the pair list covers every text and line colour token", () => {
  const used = new Set(PAIRS.flatMap(p => [p.fg, p.bg]));
  const paint = Object.keys(tokens).filter(t => !/scrim|glow$|line$/.test(t)); // scrim, glow fill and hairlines carry no information
  assert.deepEqual(paint.filter(t => !used.has(t)), []);
});

test("--c-card-glow-max really is the brightest point of the Next-up card", () => {
  const lit = over(parseColor(get("--c-green-glow")), parseColor(get("--c-surface-2")).slice(0, 3));
  assert.ok(luminance(parseColor(get("--c-card-glow-max"))) >= luminance(lit) - 1e-4);
});

test("--c-bg-glow-max really is the brightest the desktop ambient can make the page", () => {
  const src = readFileSync(new URL("../js/ambient.js", import.meta.url), "utf8");
  const alpha = [...src.matchAll(/\ba:\s*([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.ok(alpha > 0, "found the light alphas");
  const lit = over([41, 186, 116, alpha], parseColor(get("--c-bg")).slice(0, 3));
  assert.ok(luminance(parseColor(get("--c-bg-glow-max"))) >= luminance(lit) - 1e-4,
    `ambient lights add up to alpha ${alpha}; raise --c-bg-glow-max or dim the lights`);
});
