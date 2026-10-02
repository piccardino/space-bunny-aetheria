/**
 * HOVER A/B — the same building, hovered and not hovered, from the same camera.
 * ---------------------------------------------------------------------------
 *   node scripts/hover-ab.mjs
 *
 * The black facade quad was only ever seen in sweep frames, and every sweep
 * frame ends with the pointer resting on a building — so "the quad is on the
 * hovered building" and "the quad is missing voxels" were indistinguishable from
 * the screenshots alone. This script breaks the tie: it parks the camera on ONE
 * building, screenshots it un-hovered, then hovers that same building and
 * screenshots it again, from a camera that has not moved between the two.
 *
 * If the quad is the hover outline it appears only in the second image. If it is
 * a hole in the model it is in both, and the model sheet is wrong.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.env.URL ?? 'http://localhost:4173/';
const OUT = 'artifacts/hover-ab';
const TARGET = process.env.TARGET ?? 'observatory';

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
await wait(9000);

/** Park the pointer in a corner: over no building at all. */
const parkPointer = async () => {
  await page.mouse.move(1090, 712);
  await wait(1800);
};

/** Read which location the store currently considers hovered. */
const hovered = () =>
  page.evaluate(() => window.__aetheriaHovered ?? document.querySelector('.hover-label')?.textContent ?? null);

// ---- 1. un-hovered baseline ------------------------------------------
await parkPointer();
await page.screenshot({ path: `${OUT}/${TARGET}-A-nohover.png` });
console.log(`  A  no hover   -> ${OUT}/${TARGET}-A-nohover.png   (hovered: ${await hovered()})`);

// ---- 2. hover it -------------------------------------------------------
// The building is picked by a real pointer, so sweep the pointer across the
// canvas until the store reports the id we want.
const box = await page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

let found = null;
outer:
for (let gy = 0.25; gy <= 0.8; gy += 0.055) {
  for (let gx = 0.2; gx <= 0.85; gx += 0.03) {
    const px = box.x + box.w * gx;
    const py = box.y + box.h * gy;
    await page.mouse.move(px, py);
    await wait(90);
    const h = await page.evaluate(() => window.__aetheriaHoverId ?? null);
    if (h === TARGET) { found = { px, py }; break outer; }
  }
}

if (!found) {
  console.log(`  ! could not get a pointer onto "${TARGET}" — the A/B is inconclusive`);
} else {
  // settle the damped lift so the outline is fully faded in
  await page.mouse.move(found.px, found.py);
  await wait(2200);
  await page.screenshot({ path: `${OUT}/${TARGET}-B-hover.png` });
  console.log(`  B  hovering   -> ${OUT}/${TARGET}-B-hover.png    at (${found.px | 0},${found.py | 0})`);
}

await browser.close();
