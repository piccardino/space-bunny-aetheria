/**
 * Focused check: does the `{ type: 'model' }` block actually put pixels on
 * screen on /lab?
 *
 * Asserts the canvas exists, has a non-zero box, and that nothing threw.
 */
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const r of roots) {
    for (const p of ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe']) {
      const q = join(r, p);
      if (existsSync(q)) return q;
    }
  }
}

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: findBrowser(),
  args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
const bad = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

const ROUTE = process.argv[2] || '/lab';
const SHOT = process.argv[3] || 'fix-model.png';

await page.goto(`http://localhost:5173${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 10000));
// the intro gate sits on top of everything; drop it so the page is reachable
await page.evaluate(() => { document.querySelector('.intro')?.remove(); });
await new Promise((r) => setTimeout(r, 12000));

const info = await page.evaluate(() => {
  const fig = document.querySelector('.shot--model');
  const cv = fig?.querySelector('canvas');
  const r = fig?.getBoundingClientRect();
  const cr = cv?.getBoundingClientRect();
  // scroll the model into view so the screenshot actually shows it
  fig?.scrollIntoView({ block: 'center' });
  return {
    figureBox: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
    canvasBuffer: cv ? `${cv.width}x${cv.height}` : null,
    canvasCss: cr ? `${Math.round(cr.width)}x${Math.round(cr.height)}` : null,
    stillPlaceholder: !!fig?.querySelector('.slot'),
    caption: fig?.querySelector('figcaption')?.textContent?.slice(0, 60) ?? null,
  };
});
await new Promise((r) => setTimeout(r, 2500));

console.log('page errors :', errors.length ? errors : 'none');
console.log('http >= 400 :', bad.filter((x) => !x.includes('favicon')).length ? bad : 'none (favicon ignored)');
console.log(`route       : ${ROUTE}`);
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: SHOT });
await browser.close();