/**
 * Runtime diagnostics against a live dev server.
 *
 * Opens the page in a real browser, captures every console message, page
 * error and failed network request, then reports what the DOM actually
 * contains. This is the tool for "nothing shows up" bugs, where the server
 * log is clean but the screen is empty.
 *
 * Usage:  node scripts/diag.mjs [url] [--shot out.png]
 */
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5173/';
const shotIdx = process.argv.indexOf('--shot');
const SHOT = shotIdx > -1 ? process.argv[shotIdx + 1] : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));


const BROWSER = resolveBrowser();
console.log(`  browser: ${describeBrowser()}`);

const browser = await puppeteer.launch({
  headless: BROWSER.headless,
  executablePath: BROWSER.executablePath,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const logs = [];
const errors = [];
const netfail = [];

page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e && e.stack ? e.stack : e)));
page.on('requestfailed', (r) => netfail.push(`${r.failure()?.errorText} ${r.url()}`));
page.on('response', (r) => { if (r.status() >= 400) netfail.push(`HTTP ${r.status()} ${r.url()}`); });

console.log(`\n=== loading ${URL} ===`);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.log('goto warn: ' + e.message));
await wait(9000);

const report = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')].map((c) => ({
    w: c.width, h: c.height,
    cssW: Math.round(c.getBoundingClientRect().width),
    cssH: Math.round(c.getBoundingClientRect().height),
  }));
  // Did the WebGL fallback take over?
  const fallback = !!document.querySelector('.fallback');
  // R3F keeps the scene on the canvas element's __r3f store
  const sceneInfo = canvases.map((c, i) => {
    const el = document.querySelectorAll('canvas')[i];
    const store = el && el.__r3f;
    return { i, hasStore: !!store, children: store?.root?.getState?.().scene?.children?.length ?? null };
  });
  return {
    title: document.title,
    canvases,
    fallback,
    sceneInfo,
    intro: !!document.querySelector('.intro__enter'),
    enterVisible: (() => {
      const b = document.querySelector('.intro__enter');
      if (!b) return null;
      const s = getComputedStyle(b);
      return { display: s.display, visibility: s.visibility, opacity: s.opacity };
    })(),
    labels: document.querySelectorAll('.hover-label').length,
    bodyText: (document.body.innerText || '').slice(0, 400),
  };
});

console.log('\n--- page errors (' + errors.length + ') ---');
errors.forEach((e) => console.log(e.split('\n').slice(0, 6).join('\n')));
console.log('\n--- console (' + logs.length + ') ---');
logs.slice(0, 60).forEach((l) => console.log(l.slice(0, 300)));
console.log('\n--- failed requests (' + netfail.length + ') ---');
netfail.slice(0, 40).forEach((l) => console.log(l));
console.log('\n--- DOM report ---');
console.log(JSON.stringify(report, null, 2));

if (SHOT) {
  await page.screenshot({ path: SHOT });
  console.log('\nscreenshot (intro) -> ' + SHOT);
}

/* ---- pass the intro gate and re-check, so we can tell "hidden behind the
       intro overlay" apart from "genuinely not rendering". ---- */
console.log('\n=== clicking .intro__enter ===');
await page.click('.intro__enter').catch((e) => console.log('click warn: ' + e.message));
await wait(11000);

const after = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  const intro = document.querySelector('.intro');
  return {
    introPresent: !!intro,
    introDisplay: intro ? getComputedStyle(intro).display : null,
    introOpacity: intro ? getComputedStyle(intro).opacity : null,
    hasGL: !!gl,
    renderer: gl ? (() => {
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
    })() : null,
    contentHidden: document.querySelector('.app__content')?.className ?? null,
  };
});
console.log(JSON.stringify(after, null, 2));

if (SHOT) {
  const s2 = SHOT.replace(/\.png$/, '-island.png');
  await page.screenshot({ path: s2 });
  console.log('screenshot (island) -> ' + s2);
}
await browser.close();
