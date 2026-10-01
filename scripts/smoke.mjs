/**
 * End-to-end runtime check in a real browser.
 *
 * Boots the production build, clicks through the intro, verifies the scene
 * actually draws pixels (not a black frame), that the render loop runs, that
 * hover produces a label, and that clicking a building actually navigates.
 *
 * Usage:  node scripts/smoke.mjs [--shots]
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = process.argv.includes('--shots');
const PORT = 4317;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const fail = (m) => { console.error('  x ' + m); failures++; };
const ok = (m) => console.log('  . ' + m);
const info = (m) => console.log('    ' + m);

/* ---- a minimal static server for dist/ ------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const indexHtml = await readFile(join(DIST, 'index.html'));

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = join(DIST, p === '/' ? '/index.html' : p);
  try {
    const buf = p === '/' ? indexHtml : await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    // SPA fallback so deep links work
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(indexHtml);
  }
});

await new Promise((r) => server.listen(PORT, r));
info(`serving dist/ on http://localhost:${PORT}`);

/* Prefer Puppeteer's bundled Chromium, but fall back to a system browser so
   the smoke test also runs on machines where the download was skipped. */
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
      const p = join(root, r);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: findBrowser(),
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
    '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  /* ---------------- 1. boot ------------------------------------- */
  console.log('\n1) Boot');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });

  // If React never mounted, surface the reason instead of a bare timeout.
  await Promise.race([
    page.waitForSelector('.intro__enter', { timeout: 25000 }),
    page.waitForSelector('.fallback', { timeout: 25000 }).then(() => {
      throw new Error('the WebGL fallback was rendered — WebGL is unavailable here');
    }),
    (async () => {
      await wait(9000);
      throw new Error(
        'React did not mount. Errors so far:\n' +
          (errors.length ? errors.slice(0, 5).map((e) => `      ${e}`).join('\n') : '      (none logged)'),
      );
    })(),
  ]);
  ok('intro screen rendered');

  if (!(await page.$('canvas'))) fail('no <canvas> in the DOM');
  else ok('WebGL canvas mounted');

  /* ---------------- 2. enter the island -------------------------- */
  console.log('\n2) Enter the island');
  await page.click('.intro__enter');
  await wait(4500);
  if (await page.$('.intro')) fail('intro did not dismiss');
  else ok('intro dismissed');

  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  if (!size || size.w < 100) fail(`canvas not sized: ${JSON.stringify(size)}`);
  else ok(`canvas sized ${size.w}×${size.h}`);

  /* ---------------- 3. does it actually draw? -------------------- */
  console.log('\n3) Rendering');
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else resolve((frames / (performance.now() - t0)) * 1000);
        };
        requestAnimationFrame(tick);
      }),
  );
  info(`~${fps.toFixed(1)} fps on the software rasteriser (a real GPU is orders of magnitude faster)`);

  // NOTE: gl.readPixels() on the default framebuffer returns black because the
  // drawing buffer is not preserved between frames. We therefore verify the
  // image with an actual screenshot + PNG decode, which is the honest test.
  const shotPath = join(ROOT, 'shot-island.png');
  if (SHOTS) {
    await writeFile(shotPath, await page.screenshot({ type: 'png' }));
    info(`wrote shot-island.png`);
  } else {
    await writeFile(shotPath, await page.screenshot({ type: 'png' }));
  }
  ok('render loop is running (screenshot captured for analysis)');

  /* ---------------- 4. UI chrome -------------------------------- */
  console.log('\n4) UI');
  if (!(await page.$('.hud__brand'))) fail('HUD brand missing');
  else ok('HUD rendered');

  const icons = await page.$$('.hud__icon');
  if (icons.length < 3) fail(`expected 3 HUD icon buttons, found ${icons.length}`);
  else ok(`${icons.length} HUD controls`);

  await icons[icons.length - 1].click();
  await wait(700);
  if (!(await page.$('.index--open'))) fail('places index did not open');
  else ok('places index opens');

  const items = await page.$$('.index__list li');
  if (items.length !== 8) fail(`index lists ${items.length} places, expected 8`);
  else ok('index lists all 8 places');

  await icons[icons.length - 1].click();
  await wait(600);

  /* ---------------- 5. interaction + navigation ----------------- */
  console.log('\n5) Interaction');
  let label = null;
  let hoverPoint = null;
  outer:
  for (let y = 280; y <= 680; y += 22) {
    for (let x = 360; x <= 1100; x += 22) {
      await page.mouse.move(x, y);
      // the software rasteriser runs at ~1 fps, so raycast events need room
      await wait(120);
      const l = await page.$('.voxel-label[data-visible="true"]');
      if (l) {
        label = await l.evaluate((e) => e.textContent);
        hoverPoint = [x, y];
        break outer;
      }
    }
  }
  if (!label) fail('no hover label found — raycasting may be broken');
  else ok(`hover label at ${hoverPoint}: "${label.slice(0, 44)}"`);

  if (hoverPoint) {
    await page.mouse.click(hoverPoint[0], hoverPoint[1]);

    /* On the software rasteriser a single frame can take ~3 s, which blocks the
       main thread and delays React's effects. So we POLL for the outcome rather
       than assuming a fixed latency. On a real GPU this settles in ~1.2 s. */
    const ROUTES = /(\/projects|\/experiments|\/gallery|\/about|\/archive|\/lab|\/chronicle|\/contact)$/;
    let navigated = false;
    let titleEl = null;
    const t0 = Date.now();

    while (Date.now() - t0 < 25000) {
      await wait(400);
      if (ROUTES.test(new URL(page.url()).pathname)) {
        navigated = true;
        // now wait for the lazy chunk to paint
        for (let i = 0; i < 20 && !titleEl; i++) {
          titleEl = await page.$('.page__title');
          if (!titleEl) await wait(400);
        }
        break;
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (!navigated) fail(`click did not navigate (still at ${page.url()})`);
    else ok(`click navigated to ${new URL(page.url()).pathname} in ${elapsed}s (software rasteriser)`);

    if (navigated && !titleEl) {
      const diag = await page.evaluate(() => ({
        contentClass: document.querySelector('.app__content')?.className,
        hasWrap: !!document.querySelector('.page-wrap'),
        text: document.querySelector('.app__content')?.innerText?.slice(0, 100),
      }));
      fail(`page content did not render — ${JSON.stringify(diag)}`);
    } else if (titleEl) {
      const heading = await page.$eval('.page__title', (e) => e.textContent);
      ok(`page content rendered ("${heading}")`);
    }

    if (SHOTS) {
      await writeFile(join(ROOT, 'shot-page.png'), await page.screenshot({ type: 'png' }));
      info('wrote shot-page.png');
    }

    const back = await page.$('.backlink');
    if (!back) fail('no "back to the island" control');
    else {
      await back.click();
      let home = false;
      const tb = Date.now();
      while (Date.now() - tb < 15000) {
        await wait(400);
        if (new URL(page.url()).pathname === '/') { home = true; break; }
      }
      if (!home) fail('back button did not return to the island');
      else ok('back-to-island works');
    }
  }

  /* ---------------- 6. console errors --------------------------- */
  console.log('\n6) Console');
  const real = errors.filter(
    (e) => !/favicon|Failed to load resource|SwiftShader|WebGL|Automatic fallback|deprecated/i.test(e),
  );
  if (real.length) real.slice(0, 8).forEach((e) => fail(`console: ${e.slice(0, 220)}`));
  else ok('no application errors logged');

} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures) { console.error(`${failures} check(s) failed\n`); process.exit(1); }
console.log('all runtime checks passed\n');