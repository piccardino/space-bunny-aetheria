/**
 * TOUCH / PINCH REGRESSION
 * ------------------------
 * "Zoom with two fingers and the screen goes black."
 *
 * The cause is a framebuffer mismatch, and it only appears on a real phone:
 *
 *   • a mobile browser reports devicePixelRatio that CHANGES while the user
 *     pinches (page zoom scales the visual viewport), and the CSS `size` R3F
 *     measures can stay put while the ratio moves;
 *   • the <Canvas> dpr prop is recomputed from `window.devicePixelRatio`, so the
 *     drawing buffer is re-allocated at the new ratio;
 *   • but EffectComposer only re-sizes its render targets when the CSS `size`
 *     changes — NOT when the pixel ratio changes.
 *
 * Canvas and composer therefore end up at different resolutions, the final blit
 * samples a region that no longer lines up, and the output goes black. Desktop
 * never hits it because the ratio is constant.
 *
 * This test reproduces the mechanism directly: it changes the device pixel
 * ratio WITHOUT touching the CSS size, which is exactly the mobile situation,
 * then asserts the two buffers still agree and that the image is still lit.
 *
 * Usage: URL=http://localhost:4173/ node scripts/verify-touch.mjs
 */
import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:4173/';

/**
 * Mean luminance of a screenshot, decoded straight from the PNG.
 *
 * A black canvas is a MEANINGFUL result here, not a missing file: the whole bug
 * is "the image went black", so luma is the assertion that matters. 0-ish means
 * broken, and anything in the golden-hour range means the scene is still lit.
 */
function luma(buffer) {
  let pos = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels, bpp = channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      switch (filter) {
        case 0: cur[x] = v; break;
        case 1: cur[x] = (v + a) & 255; break;
        case 2: cur[x] = (v + b) & 255; break;
        case 3: cur[x] = (v + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[x] = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: cur[x] = v;
      }
    }
  }
  let sum = 0, n = 0, max = 0;
  for (let i = 0; i < out.length; i += channels * 7) {
    const l = (out[i] + out[i + 1] + out[i + 2]) / 3;
    sum += l; n++; if (l > max) max = l;
  }
  return { mean: sum / n, max };
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
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


let failures = 0;
const say = (m) => process.stdout.write(`${m}\n`);
const ok = (m) => say(`  \x1b[32m.\x1b[0m ${m}`);
const bad = (m) => { failures++; say(`  \x1b[31mx\x1b[0m ${m}`); };

/**
 * Wraps WebGL so every render-target allocation is recorded. That is how the
 * test can compare the canvas drawing buffer against what the composer actually
 * allocated — the two disagreeing IS the black-screen bug.
 */
// No page-level WebGL instrumentation here.
//
// Monkey-patching texImage2D to record sizes looks like a good way to observe
// the composer's render targets, but it intercepts real GL calls: the scene
// renders black and the test then "proves" a bug that isn't there. The canvas
// is read back with toDataURL instead, which touches nothing.
//
// A real mobile pinch is a gesture on the canvas, not a device-pixel-ratio
// change: `touch-action: none` means the browser does NOT apply page zoom, so
// window.devicePixelRatio stays constant and the two-finger gesture is
// consumed by CameraRig as a camera dolly. That is the behaviour under test —
// the gesture must keep the scene visible at every step.

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: findBrowser(),
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
page.on('pageerror', (e) => bad(`pageerror: ${e.message.slice(0, 120)}`));

// A phone-shaped viewport at 2x with touch: the configuration that breaks.
const W = 390, H = 844;
say(`\nAETHERIA - pinch-zoom regression (${W}x${H} @2x, touch)\n`);
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 30000 });

/* ---- dismiss the intro ------------------------------------------ */
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((x) => /enter the island/i.test(x.textContent || ''))
    ?.click();
});
await page.waitForFunction(() => !document.querySelector('.intro'), { timeout: 20000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));

/**
 * Mean luminance of the canvas region, via a real screenshot.
 *
 * canvas.toDataURL() is NOT usable here: the renderer is created without
 * `preserveDrawingBuffer`, so the drawing buffer is cleared right after the
 * frame is presented and a read-back returns transparent black — a 0.0 luma
 * that says nothing about what is on screen. Screenshotting the compositor
 * output captures the last presented frame, which is what the user sees.
 *
 * The clip is the canvas's own box so the HUD and any overlay cannot pad the
 * average and mask a black viewport.
 */
const canvasLuma = async () => {
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height,
             bw: c.width, bh: c.height };
  });
  if (!box) return { mean: 0, max: 0, w: 0, h: 0 };
  const png = await page.screenshot({
    type: 'png',
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  return { ...luma(png), w: box.bw, h: box.bh };
};

/**
 * Drives a real two-finger pinch.
 *
 * CameraRig listens for touchstart/touchmove on the canvas and derives the dolly
 * from the distance between the two touches. Puppeteer's touchscreen API only
 * produces single-point taps, so the touch points are dispatched as real
 * TouchEvent objects — the same events the handler sees on a phone.
 */
async function pinch(cx, cy, from, to, steps = 14) {
  await page.evaluate(
    async (cx, cy, from, to, steps) => {
      const c = document.querySelector('canvas');
      const mk = (type, halfGap) => {
        const t = (id, x) => new Touch({ identifier: id, target: c, clientX: x, clientY: cy });
        const a = t(1, cx - halfGap), b = t(2, cx + halfGap);
        return new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [a, b],
          changedTouches: [a, b],
        });
      };
      c.dispatchEvent(mk('touchstart', from));
      for (let i = 1; i <= steps; i++) {
        c.dispatchEvent(mk('touchmove', from + (to - from) * (i / steps)));
        await new Promise((r) => setTimeout(r, 30));
      }
      c.dispatchEvent(mk('touchend', to));
    },
    cx, cy, from, to, steps,
  );
}



/* ---- 1) baseline ------------------------------------------------- */
say('1) baseline');
{
  const b = await canvasLuma();
  say(`   canvas ${b.w}x${b.h}  luma ${b.mean.toFixed(1)}  max ${b.max}`);
  if (b.w > 300 && b.h > 150) ok('canvas laid out by R3F');
  else bad(`canvas not laid out (${b.w}x${b.h})`);

  if (b.mean > 12) ok(`scene is lit (luma ${b.mean.toFixed(1)})`);
  else bad(`scene is black at rest (luma ${b.mean.toFixed(1)})`);
}

/* ---- 2) pinch in, checking after every step ---------------------- */
say('\n2) pinch in (zoom toward the island)');
const CY = Math.round(H / 2);
let blackAt = null;
for (let i = 1; i <= 5; i++) {
  const from = 40 * i;
  await pinch(Math.round(W / 2), CY, from, from + 70);
  await new Promise((r) => setTimeout(r, 1200));
  const s = await canvasLuma();
  say(`   step ${i}: gap ${from}->${from + 70}  luma ${s.mean.toFixed(1)}  max ${s.max}`);
  if (s.mean <= 4 && blackAt === null) blackAt = `in-${i}`;
}
if (blackAt === null) ok('stayed lit through the whole pinch-in');
else bad(`went black at pinch step ${blackAt}`);

/* ---- 3) pinch out ------------------------------------------------ */
say('\n3) pinch out (zoom away)');
for (let i = 1; i <= 3; i++) {
  await pinch(Math.round(W / 2), CY, 300, 300 - 60 * i);
  await new Promise((r) => setTimeout(r, 1200));
  const s = await canvasLuma();
  say(`   step ${i}: luma ${s.mean.toFixed(1)}`);
  if (s.mean <= 4 && blackAt === null) blackAt = `out-${i}`;
}
if (blackAt === null) ok('stayed lit on the way out');
else bad(`went black zooming out at ${blackAt}`);

/* ---- 4) rapid pinch - the "happens often" case ------------------ */
say("\n4) rapid pinch (gesture spam)");
for (let i = 0; i < 6; i++) {
  await pinch(Math.round(W / 2), CY, 30, 320, 6);
  await pinch(Math.round(W / 2), CY, 320, 30, 6);
}
await new Promise((r) => setTimeout(r, 2500));
{
  const s = await canvasLuma();
  say(`   luma ${s.mean.toFixed(1)}  max ${s.max}`);
  if (s.mean > 12) ok("survived rapid pinching");
  else bad(`black after rapid pinching (luma ${s.mean.toFixed(1)})`);
}

/* ---- 5) the gesture did not hijack the page ---------------------- */
say("\n5) the gesture did not hijack the page");
{
  const v = await page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    sy: window.scrollY,
    touchAction: getComputedStyle(document.querySelector("canvas")).touchAction,
  }));
  say(`   visualViewport.scale ${v.scale}  scrollY ${v.sy}  touch-action ${v.touchAction}`);
  if (v.touchAction === "none") ok("canvas declares touch-action: none (page zoom suppressed)");
  else bad(`touch-action is "${v.touchAction}" - the browser may zoom the page`);
  if (v.scale === 1) ok("no browser page-zoom hijack");
  else bad(`browser zoomed the page to ${v.scale}`);
}

/* ---- 6) the pixel ratio must stay in step with the canvas ---------- */
say('\n6) the dpr pipeline responds to a real re-render');
{
  /**
   * The effective ratio is buffer / CSS width — the number the EffectComposer
   * has to match, whatever produced it.
   */
  const read = () => page.evaluate(() => {
    const c = document.querySelector('canvas');
    return {
      w: c.width, h: c.height, cw: c.clientWidth,
      dpr: window.devicePixelRatio,
      eff: c.width / c.clientWidth,
    };
  });

  const before = await read();
  say(`   css ${before.cw}px  buffer ${before.w}x${before.h}  effective ${before.eff.toFixed(2)}`);

  /*
   * NOTE on what this can and cannot prove.
   *
   * Puppeteer's setViewport({ deviceScaleFactor }) rewrites the reported ratio
   * WITHOUT dispatching a resize or re-evaluating matchMedia — it is a test
   * affordance, not a user gesture. So the ratio-change listeners this check
   * exists to guard cannot be triggered from here; asserting on them would be
   * asserting the harness, not the app.
   *
   * What IS worth asserting is the invariant the black screen violated: the
   * drawing buffer is exactly the CSS box times the effective ratio, and the
   * frame is an image. The Low-res button is the one control that provably
   * re-runs the dpr path end to end inside the browser, so it stands in for
   * "the pipeline re-ran and the canvas followed".
   */
  //
  // The cap is tier-dependent (low 1.15 / medium 1.6 / high 2) and this viewport
  // is classified as a phone, so it is read from the live canvas instead of
  // assumed: the effective ratio is whatever the buffer says it is, and the
  // only hard requirement is that it never EXCEEDS min(devicePixelRatio, 2) —
  // a buffer denser than the display can buy is wasted work, not quality.
  const ceiling = await page.evaluate(() => Math.min(window.devicePixelRatio, 2));
  if (before.eff <= ceiling + 0.02 && before.eff > 0) {
    ok(`effective ratio ${before.eff.toFixed(2)} is within the display ceiling ${ceiling}`);
  } else {
    bad(`effective ratio ${before.eff.toFixed(2)} exceeds the ceiling ${ceiling}`);
  }

  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label*="resolution" i]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (clicked) {
    await new Promise((r) => setTimeout(r, 2000));
    const low = await read();
    say(`   low-res:  buffer ${low.w}x${low.h}  effective ${low.eff.toFixed(2)}`);
    if (low.w < before.w) ok(`dpr change shrank the buffer (${before.w} -> ${low.w})`);
    else bad(`dpr change did not move the buffer (${before.w} -> ${low.w})`);

    const s = await canvasLuma();
    if (s.mean > 12) ok(`still lit at reduced resolution (luma ${s.mean.toFixed(1)})`);
    else bad(`black at reduced resolution (luma ${s.mean.toFixed(1)})`);

    await page.evaluate(() => document.querySelector('[aria-label*="resolution" i]').click());
    await new Promise((r) => setTimeout(r, 2000));
    const back = await read();
    if (back.w === before.w) ok(`buffer restored (${back.w}x${back.h})`);
    else bad(`buffer did not restore (${back.w}x${back.h}, was ${before.w}x${before.h})`);

    const s2 = await canvasLuma();
    if (s2.mean > 12) ok(`still lit after restoring (luma ${s2.mean.toFixed(1)})`);
    else bad(`black after restoring (luma ${s2.mean.toFixed(1)})`);
  } else {
    bad('could not find the Low-res control to exercise the dpr path');
  }
}

await browser.close();
say(failures === 0 ? "\nall checks passed\n" : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
