// Offline and update safety for sw.js (how it works: the comment at the top of sw.js).
// - Every file the service worker caches exists (one missing file fails the whole install).
// - Every file a page or module loads is cached, so the app works fully offline.
// - The committed VERSION matches the committed app files (.githooks/pre-commit stamps it),
//   so no change ever ships without phones being offered the update.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, normalize } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const sw = readFileSync(join(root, "sw.js"), "utf8");
const ASSETS = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
// The desktop-only light is left out on purpose: phones never download it.
const DESKTOP_ONLY = new Set(["js/ambient-loader.js", "js/ambient.js"]);

test("every cached file exists", () => {
  const missing = ASSETS.filter((a) => a !== "./" && !existsSync(join(root, a)));
  assert.deepEqual(missing, []);
});

test("everything the app loads is cached for offline use", () => {
  const cached = new Set(ASSETS);
  const needed = new Set();
  const visit = (file) => {
    if (needed.has(file) || DESKTOP_ONLY.has(file)) return;
    needed.add(file);
    const src = readFileSync(join(root, file), "utf8");
    const refs = file.endsWith(".html")
      ? [...src.matchAll(/(?:src|href)="([^"#:?]+)"/g)].map((m) => m[1])
      : file.endsWith(".css")
        ? [...src.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:"))
        : [...src.matchAll(/(?:import\s[^"']*?from\s*|import\(\s*)["']([^"']+)["']/g), ...src.matchAll(/new URL\("([^"]+)", import\.meta\.url\)/g)].map((m) => m[1]);
    for (const r of refs) {
      const f = normalize(join(dirname(file), r)).replace(/^\.\//, "");
      if (/\.(html|js|css|woff2|png|svg|mp4|webmanifest)$/.test(f) && f !== "sw.js") visit(f);
    }
  };
  for (const page of ["index.html", "workout.html", "progress.html", "plan.html"]) visit(page);
  for (const icon of JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8")).icons) needed.add(icon.src);
  assert.deepEqual([...needed].filter((f) => !cached.has(f)).sort(), []);
});

test("the committed service worker version matches the committed app files", (t) => {
  let head;
  try { head = execSync("git rev-parse --verify -q HEAD", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a git checkout */ }
  if (!head) return t.skip("not a git checkout");
  const committed = execSync("git show HEAD:sw.js", { cwd: root, encoding: "utf8" });
  if (!/^const VERSION = /m.test(committed)) return t.skip("HEAD predates versioned updates");
  // Recompute exactly as .githooks/pre-commit does, from HEAD's files in a scratch index.
  const dir = mkdtempSync(join(tmpdir(), "uptime-sw-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
    execSync("git read-tree HEAD", { cwd: root, env });
    const files = execSync("git ls-files -s -- '*.html' manifest.webmanifest css js assets ':(exclude)docs' ':(exclude)tests'", { cwd: root, env, encoding: "utf8" });
    const rest = committed.split("\n").filter((l) => !l.startsWith("const VERSION = ")).join("\n");
    const want = execSync("git hash-object --stdin", { cwd: root, input: files + rest, encoding: "utf8" }).trim().slice(0, 12);
    const have = committed.match(/^const VERSION = "(.*)";/m)[1];
    assert.equal(have, want, "sw.js VERSION is stale: commit from a clone with `git config core.hooksPath .githooks`, never through the GitHub website");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
