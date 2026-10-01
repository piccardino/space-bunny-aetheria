/**
 * GitHub Pages smoke test.
 *
 * The failure this guards against is invisible to `npm run verify` (which runs
 * against the source tree) and to a plain `npm run preview`: both serve the app
 * from the domain ROOT. A project site is served from /<repo>/, and getting
 * that wrong yields a silently blank page — the HTML loads, the bundle 404s.
 *
 * So this reproduces Pages as faithfully as a local server can:
 *   - serves dist/ under a /space-bunny-aetheria/ subpath
 *   - answers an unknown path with 404.html, exactly like Pages does
 *   - asserts on real network traffic: every script/CSS/model must come back 200
 *
 * Usage: npm run build  &&  node scripts/verify-pages.mjs
 *        (set BASE_PATH to match how dist was actually built)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

/**
 * Chrome gets a throwaway profile: a personal Chrome already open under this
 * account owns the default one, and the launch then dies with a bare
 * "Failed to launch the browser process: Code: 0" that explains nothing.
 */
const TEMP_PROFILE = mkdtempSync(join(tmpdir(), 'aetheria-pages-'));

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

/* Mirrors how the deploy workflow builds: a project site lives under /<repo>/ */
const BASE = process.env.BASE_PATH ?? '/space-bunny-aetheria/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// `process.stdout.write` rather than console.log: when stdout is a pipe or a
// redirected file Node buffers it, and a run that stalls half way then shows
// nothing at all — which is exactly the case this script has to diagnose.
const say = (m) => process.stdout.write(`${m}\n`);

let failures = 0;
const ok = (m) => say(`  \x1b[32m.\x1b[0m ${m}`);
const bad = (m) => { failures++; say(`  \x1b[31mx\x1b[0m ${m}`); };

async function read(path) {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Serves dist/ under BASE, with Pages' 404 -> 404.html behaviour. */
function serve() {
  return new Promise((res) => {
    const server = createServer(async (req, rep) => {
      const url = new URL(req.url, 'http://localhost');
      const p = decodeURIComponent(url.pathname);

      if (!p.startsWith(BASE)) {
        rep.writeHead(404, { 'content-type': 'text/plain' });
        rep.end('outside base');
        return;
      }
      const rel = p.slice(BASE.length) || 'index.html';

      // directory -> index.html, like Pages
      let file = join(DIST, rel);
      if ((await read(file)) === null && (await read(join(file, 'index.html'))) !== null) {
        file = join(file, 'index.html');
      }

      let body = await read(file);
      let code = 200;

      // No such file: Pages falls back to 404.html. It answers with a 200 for the
      // fallback body — the document is a real page, only the *route* was unknown
      // — and serving it as a 404 status would make Chrome discard the body
      // entirely, which is the one thing the fallback exists to prevent.
      if (body === null) {
        file = join(DIST, '404.html');
        body = await read(file);
        if (body === null) {
          rep.writeHead(404, { 'content-type': 'text/plain' });
          rep.end('no 404.html either');
          return;
        }
      }

      rep.writeHead(code, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      rep.end(body);
    });
    server.listen(0, () => res({ server, port: server.address().port }));
  });
}

const { server, port } = await serve();
const ORIGIN = `http://localhost:${port}`;

/**
 * Joins ORIGIN + BASE + path with exactly one slash between the parts.
 *
 * BASE already ends in '/', so a naive `${BASE}${p}` yields a DOUBLE slash on
 * the landing route ('/space-bunny-aetheria//'). The test server answers that
 * with a 404, the app never mounts, and the failure looks like a hang rather
 * than the routing bug it actually is.
 */
const url = (p = '') => `${ORIGIN}${BASE}${String(p).replace(/^\/+/, '')}`;

say(`\nAETHERIA - GitHub Pages smoke test`);
say(`  base ${BASE}\n`);

/**
 * Resolves a browser the same way smoke.mjs / verify-render.mjs do: the
 * CHROME_PATH override first, then a system Chrome/Edge/Chromium install.
 * Puppeteer's own download is often skipped on a fresh clone, and falling back
 * to the system browser keeps this test runnable without a 150 MB fetch.
 */
function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const roots = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const rel = [
    'Google\\Chrome\\Application\\chrome.exe',
    'Microsoft\\Edge\\Application\\msedge.exe',
    'Chromium\\Application\\chrome.exe',
  ];
  for (const root of roots) {
    for (const r of rel) {
      const q = join(root, r);
      if (existsSync(q)) return q;
    }
  }
  // undefined lets Puppeteer use its own downloaded build
  return undefined;
}

const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  // software GL: a CI box has no GPU, and a WebGL-less box would fail the canvas
  // assertion for a reason that has nothing to do with deployment
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  // a real Chrome already running under this account would otherwise own the
  // default profile, and the launch fails with an opaque "Code: 0"
  `--user-data-dir=${TEMP_PROFILE}`,
];

const BROWSER_PATH = findBrowser();
say(`  browser ${BROWSER_PATH ?? '(puppeteer bundled)'}`);
say('  launching…');
const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: BROWSER_PATH,
  args: CHROME_ARGS,
  // a stalled launch should fail loudly instead of hanging the whole script
  timeout: 60000,
});
say('  launched\n');

/** Opens a path and reports network failures + whether the app mounted. */
async function visit(path) {
  const page = await browser.newPage();
  const errors = [];
  const badRequests = [];

  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => badRequests.push(`FAILED ${r.url()}`));

  // NOT `networkidle2`: the island runs a continuous render loop, so the network
  // never goes quiet and a network-based wait would always hit its timeout.
  // Waiting for the DOM the app actually produces is both faster and a stronger
  // signal — it fails precisely when the bundle did not execute.
  //
  // A deep link is answered by Pages with a 404 STATUS carrying 404.html, and
  // Chrome refuses to render a body it received with a 404 (ERR_INVALID_RESPONSE
  // / the document never commits). That is a property of the browser, not of the
  // fallback, so the navigation error on the FIRST hop is expected and ignored —
  // the 404.html script then redirects to the base, and the assertions below run
  // against that second, successful load.
  await page
    .goto(url(path), { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch((e) => {
      if (!/ERR_INVALID_RESPONSE|net::ERR_/.test(String(e))) throw e;
    });
  // mounted as soon as React has replaced #root with real markup
  await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, {
    timeout: 30000,
  });
  // give the lazy chunks + the glb a moment; they are fetched, not inlined
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => ({
    rootChildren: document.getElementById('root').children.length,
    // a mounted Canvas is proof the WebGL world came up, not just the DOM
    canvas: !!document.querySelector('canvas'),
    path: location.pathname,
    title: document.title,
  }));

  await page.close();
  return { ...info, errors, badRequests };
}
/* ---- 1) the landing page ------------------------------------------- */
say('1) landing page');
{
  const r = await visit('/');

  if (r.rootChildren > 0) ok('React mounted');
  else bad('React did not mount (blank page)');

  if (r.canvas) ok('WebGL canvas created');
  else bad('no canvas — the 3D world never started');

  // BASE keeps its trailing slash, so the landing URL is exactly BASE
  if (r.path === BASE) ok(`served from the subpath (${r.path})`);
  else bad(`unexpected path ${r.path}`);

  // the favicon is a cosmetic 404: the project ships no icon, and a browser
  // asking for /favicon.ico says nothing about whether the deployment works
  const real = r.badRequests.filter((b) => !/favicon\.ico/.test(b));
  if (real.length === 0) ok('every request returned 2xx');
  else real.forEach((b) => bad(`request failed: ${b}`));

  // a "Failed to load resource" line with no URL in it is the favicon 404 that
  // Chrome logs for any missing icon; the message text alone cannot tell us more
  const fatal = r.errors.filter(
    (e) => !/favicon/i.test(e) && !/fonts\.g/i.test(e) && !/Failed to load resource/.test(e),
  );
  if (fatal.length === 0) ok('no console errors');
  else fatal.slice(0, 3).forEach((e) => bad(`console: ${e.slice(0, 140)}`));
}

/* ---- 2) a deep link, which is a 404 on Pages without the fallback --- */
say('\n2) deep link (exercises the 404.html fallback)');
{
  const r = await visit('/projects');

  if (r.path.endsWith('/projects')) ok('URL restored after the 404 bounce');
  else bad(`URL not restored: ${r.path}`);

  if (r.rootChildren > 0) ok('React mounted on the deep link');
  else bad('deep link did not mount');

  if (r.title.includes('Projects')) ok(`document.title resolved (${r.title})`);
  else bad(`title did not update: ${r.title}`);
}

/* ---- 3) the .glb assets, the classic subpath 404 --------------------- */
say('\n3) static assets under the subpath');
for (const file of ['models/aether-cog.glb', 'models/brass-nut.glb']) {
  const res = await fetch(url(`/${file}`));
  if (res.ok) ok(`${file} -> ${res.status} (${(await res.arrayBuffer()).byteLength} bytes)`);
  else bad(`${file} -> ${res.status}  (bare absolute path not prefixed?)`);
}

await browser.close();
server.close();
rmSync(TEMP_PROFILE, { recursive: true, force: true });

say(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
