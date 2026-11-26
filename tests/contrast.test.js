// WCAG 2.2 AA contrast for every colour pair the components use (docs/style/contrast.js),
// read straight from css/tokens.css so a token change can't slip through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAll, parseColor, over, luminance, PAIRS } from "../docs/style/contrast.js";

const css = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const blockAfter = (sel) => { const i = css.indexOf(sel); assert.ok(i >= 0, `found ${sel}`); const a = css.indexOf("{", i) + 1; return css.slice(a, css.indexOf("}", a)); };
const parse = (block) => Object.fromEntries([...block.matchAll(/(--c-[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const dark = parse(blockAfter(":root {"));
// Light overrides the colour tokens; anything it doesn't set falls back to the dark value.
const lightAttr = parse(blockAfter(':root[data-theme="light"]'));
const lightSystem = parse(blockAfter(':root:not([data-theme="dark"])'));
const themes = { dark, light: { ...dark, ...lightAttr } };
const tokens = dark;
const getter = t => name => { if (!(name in t)) throw new Error(`Missing token ${name}`); return t[name]; };
const get = getter(dark);

for (const [name, t] of Object.entries(themes)) {
  test(`every listed pair meets WCAG 2.2 AA (${name})`, () => {
    const fails = checkAll(getter(t)).filter(r => !r.pass)
      .map(r => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min} (${r.use})`);
    assert.deepEqual(fails, []);
  });
}

test("light theme sets every colour token, and the System copy matches the explicit one", () => {
  assert.deepEqual(Object.keys(dark).filter(k => !(k in lightAttr)), []);
  assert.deepEqual(lightSystem, lightAttr);
  const elev = (b) => [...b.matchAll(/(--elev-\d):\s*([^;]+);/g)].map(m => m[0]).join();
  assert.equal(elev(blockAfter(':root:not([data-theme="dark"])')), elev(blockAfter(':root[data-theme="light"]')));
});

test("the pair list covers every text and line colour token", () => {
  const used = new Set(PAIRS.flatMap(p => [p.fg, p.bg]));
  const paint = Object.keys(tokens).filter(t => !/scrim|glow$|line$/.test(t)); // scrim, glow fill and hairlines carry no information
  assert.deepEqual(paint.filter(t => !used.has(t)), []);
});

// The glow lightens a dark theme and darkens (tints) a light one: the "max" token is the
// worst case for text in each, i.e. the lit colour closest in luminance to the text.
for (const [name, t] of Object.entries(themes)) {
  const g = getter(t);
  const worse = (maxTok, lit) => name === "dark" ? luminance(maxTok) >= luminance(lit) - 1e-4 : luminance(maxTok) <= luminance(lit) + 1e-4;
  test(`--c-card-glow-max really is the worst point of the Next-up card (${name})`, () => {
    const lit = over(parseColor(g("--c-green-glow")), parseColor(g("--c-surface-2")).slice(0, 3));
    assert.ok(worse(parseColor(g("--c-card-glow-max")), lit), `lit ${lit}`);
  });
  test(`--c-bg-glow-max covers the desktop ambient light (${name})`, () => {
    const src = readFileSync(new URL("../js/ambient.js", import.meta.url), "utf8");
    const alpha = [...src.matchAll(/\ba:\s*([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
    const lit = over([41, 186, 116, alpha], parseColor(g("--c-bg")).slice(0, 3));
    assert.ok(worse(parseColor(g("--c-bg-glow-max")), lit), `lit ${lit}`);
  });
}


