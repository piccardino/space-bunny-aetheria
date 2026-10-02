/**
 * ISLAND SWEEP
 * ------------
 * Screenshots the live island from a ring of azimuths so a visibly broken
 * building can be identified from what the user actually sees, rather than
 * guessed at from the source.
 *
 *   URL=http://localhost:4173/ node scripts/sweep-island.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.env.URL ?? 'http://localhost:4173/';
const OUT = 'artifacts/sweep';

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
await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('   [pageerror] ' + e.message));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await wait(6000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((x) => /enter the island/i.test(x.textContent || ''))?.click();
});
await wait(8000);

// The camera rig publishes an imperative API on the object App.jsx holds in a
// ref; there is no global to reach it through, so drive it with a real gesture:
// a horizontal drag on the canvas rotates the orbit by a known angle per pixel.
const drag = async (dx) => {
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + (dx * i) / steps, box.y);
    await wait(16);
  }
  await page.mouse.up();
  await wait(2600);
};

console.log('\n=== sweeping the island ===');
for (let i = 0; i < 8; i++) {
  const name = `${OUT}/az-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: name });
  console.log('  ' + name);
  await drag(-190);
}

await browser.close();