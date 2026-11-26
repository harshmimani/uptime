// The desktop-only ambient effect must never reach a phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ambientAllowed } from "../js/ambient-loader.js";

const root = new URL("..", import.meta.url).pathname;
const files = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  if (f.startsWith(".") || f === "node_modules" || f === "tests") return [];
  return statSync(p).isDirectory() ? files(p) : /\.(js|mjs|html)$/.test(f) ? [p] : [];
});

const win = (matches, nav = {}) => ({ matchMedia: q => ({ matches: matches(q) }), navigator: nav });
const desktop = q => q.includes("min-width: 1024px");

test("loads on a desktop with a mouse", () => assert.equal(ambientAllowed(win(desktop)), true));
test("never on a phone or tablet", () => assert.equal(ambientAllowed(win(() => false)), false));
test("never with reduced motion", () => assert.equal(ambientAllowed(win(q => desktop(q) || q.includes("reduce"))), false));
test("never with data saver", () => assert.equal(ambientAllowed(win(desktop, { connection: { saveData: true } })), false));
test("never on a low-memory machine", () => assert.equal(ambientAllowed(win(desktop, { deviceMemory: 2 })), false));

test("ambient.js is only ever reached through a dynamic import in the loader", () => {
  const offenders = files(root).filter(p => !p.endsWith("ambient.js") && !p.endsWith("ambient-loader.js"))
    .filter(p => /ambient\.js/.test(readFileSync(p, "utf8")));
  assert.deepEqual(offenders.map(p => p.replace(root, "")), []);
  const loader = readFileSync(join(root, "js/ambient-loader.js"), "utf8");
  assert.doesNotMatch(loader, /^\s*import\s[^(]*["'].*ambient\.js["']/m, "no static import");
  assert.match(loader, /import\(\s*["']\.\/ambient\.js["']\s*\)/, "dynamic import present");
});

test("the service worker doesn't precache it", () => {
  assert.doesNotMatch(readFileSync(join(root, "sw.js"), "utf8"), /ambient/);
});
