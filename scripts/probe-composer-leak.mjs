/**
 * COMPOSER LEAK PROBE
 * -------------------
 * PostProcessing.jsx remounts <EffectComposer> by changing its React `key` every
 * time the drawing-buffer pixel count changes. @react-three/postprocessing's
 * EffectComposer has no dispose-on-unmount (verified: no `dispose` anywhere in
 * its dist/EffectComposer.js), so every remount leaves a whole postprocessing
 * chain behind: two full-size buffers, the RenderPass, the EffectPass, the Bloom
 * mip pyramid, SMAA's edge/weight targets.
 *
 * That is a GPU memory leak whose trigger is EXACTLY the mobile pinch: the pixel
 * ratio moves during the gesture, so the composer is rebuilt several times a
 * gesture, and a phone GPU reclaims the context under that pressure. The context
 * loss is then unrecoverable and the screen is black for good.
 *
 * This measures renderer.info.memory, which is a count of live geometries and
 * textures. If it grows with every remount, the leak is real and measurable.
 */
import puppeteer from 'puppeteer';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.env.URL ?? 'http://localhost:4173/';
const ROUNDS = Number(process.env.ROUNDS ?? 8);

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
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('   [pageerror] ' + e.message));

await page.evaluateOnNewDocument(() => {
  const target = new EventTarget();
  target.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o && o.isWebGLRenderer && !o.__watched) {
      o.__watched = true;
      window.__renderer = o;
    }
  });
  window.__THREE_DEVTOOLS__ = target;
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await wait(6000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((x) => /enter the island/i.test(x.textContent || ''))?.click();
});
await wait(6000);

const probe = () => page.evaluate(() => {
  const r = window.__renderer;
  const c = document.querySelector('canvas');
  return {
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    programs: r.info.programs?.length ?? 0,
    buffer: `${c.width}x${c.height}`,
    dpr: +r.getPixelRatio().toFixed(3),
    contextLost: r.getContext().isContextLost(),
  };
});

const swap = async () => {
  const btn = await page.$('.hud__icon[aria-label*="resolution"]');
  if (btn) await btn.click();
  await wait(1400);
};

console.log('\n=== baseline ===');
console.log(' ', JSON.stringify(await probe()));

console.log(`\n=== ${ROUNDS} low-res toggles (each one remounts the composer) ===`);
for (let i = 1; i <= ROUNDS; i++) {
  await swap();
  await swap();
  const p = await probe();
  console.log(`  round ${String(i).padStart(2)}  geometries ${String(p.geometries).padStart(4)}  textures ${String(p.textures).padStart(4)}  programs ${String(p.programs).padStart(3)}  buffer ${p.buffer}  dpr ${p.dpr}`);
}

console.log('\n=== resize storm (CSS size changes -> composer remounts) ===');
for (const [w, h] of [[390, 844], [420, 900], [360, 780], [440, 920]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await wait(1500);
  const p = await probe();
  console.log(`  ${w}x${h}  geometries ${String(p.geometries).padStart(4)}  textures ${String(p.textures).padStart(4)}  buffer ${p.buffer}  lost=${p.contextLost}`);
}

await browser.close();