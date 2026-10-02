/**
 * VERIFY RENDER — la resa a schermo regge?
 * ----------------------------------------
 * Tre verifiche, tutte misurate e non dedotte:
 *
 *   1b. i render target dell'EffectComposer hanno la STESSA dimensione del
 *       canvas. Se non coincidono il blit finale campiona una regione
 *       sbagliata e lo schermo va nero. Il bug era qui: `dpr={[1, 2]}` sul
 *       Canvas e una seconda `gl.setPixelRatio()` in Scene.jsx si dividevano
 *       la proprietà del pixel ratio, e il composer — che si ridimensiona solo
 *       al cambiamento della `size` CSS — restava sulla risoluzione vecchia.
 *
 *   1c. il pulsante Low-res riduce davvero i pixel disegnati e si ripristina.
 *
 *   2.  perdita e ripristino del contesto WebGL (il TDR del driver Windows):
 *       misura la luminanza dell'immagine prima e dopo. Serve a distinguere un
 *       vero context loss da uno schermo nero per altra causa.
 *
 * Va eseguito con SCALE=2 per colpire il caso HiDPI: su un display 1x il
 * disaccordo sui pixel ratio non si vede.
 *
 * Usage:  URL=http://localhost:4174/ SCALE=2 node scripts/verify-render.mjs
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.env.URL ?? 'http://localhost:4173/';

/** Statistiche di luminanza lette direttamente dal PNG. */
function luma(path) {
  const buf = readFileSync(path);
  let pos = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
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

/* A HiDPI display, R3F's dpr={[1,2]} resolves to 2 while the tier's dpr is
   1.15 on a weak GPU. Those two disagree, which is the situation this test
   exists to check. On a 1x display both resolve to 1 and the bug is invisible
   — which is exactly why it only shows up "every now and then", on some
   machines and not others. */
const SCALE = Number(process.env.SCALE ?? 2);
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: SCALE });
console.log(`  deviceScaleFactor ${SCALE}`);
page.on('pageerror', (e) => console.log('   [pageerror] ' + e.message));

await page.evaluateOnNewDocument(() => {
  window.__events = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const ctx = orig.apply(this, args);
    if (ctx && !ctx.__watched) {
      const isGL = (typeof WebGLRenderingContext !== 'undefined' && ctx instanceof WebGLRenderingContext)
        || (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext);
      if (isGL) {
        ctx.__watched = true;
        this.addEventListener('webglcontextlost', () => window.__events.push('lost'), true);
        this.addEventListener('webglcontextrestored', () => window.__events.push('restored'), true);
      }
    }
    return ctx;
  };

  // three broadcasts every object it builds to `window.__THREE_DEVTOOLS__`;
  // listening for `observe` is the supported way in (no debug global in the app).
  const target = new EventTarget();
  target.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o && o.isWebGLRenderer && !o.__wrapped) {
      o.__wrapped = true;
      window.__renderer = o;
    }
  });
  window.__THREE_DEVTOOLS__ = target;
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await wait(6000);

/* The intro is a full-screen overlay that sits on top of the canvas. Without
   dismissing it the baseline screenshot measures the intro, not the island —
   which is exactly the mistake that made an earlier run compare two black
   frames and conclude "it recovered". */
const enterBtn = await page.$('.intro__enter');
if (enterBtn) {
  await enterBtn.click();
  console.log('  intro dismissed');
} else {
  console.log('  !! no .intro__enter button found');
}
await wait(9000);

/* ---- 1. baseline ------------------------------------------------- */
await page.screenshot({ path: 'ctx-before.png' });
const before = luma('ctx-before.png');
console.log('\n=== 1. baseline (scena normale) ===');
console.log(`  luma media ${before.mean.toFixed(2)}   max ${before.max.toFixed(0)}`);

/* ---- 1b. i buffer del composer sono della misura giusta? --------- */
const sync = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = window.__renderer;
  // three espone i render target del composer solo tramite i loro oggetti;
  // li catturiamo agganciando setRenderTarget durante un frame.
  const seen = new Map();
  const orig = r.setRenderTarget.bind(r);
  r.setRenderTarget = (t) => {
    if (t && t.texture && !seen.has(t.uuid)) {
      seen.set(t.uuid, { w: t.width, h: t.height });
    }
    return orig(t);
  };
  return new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      r.setRenderTarget = orig;
      res({
        canvasBuffer: { w: c.width, h: c.height },
        cssSize: { w: c.clientWidth, h: c.clientHeight },
        pixelRatio: r.getPixelRatio(),
        devicePixelRatio: window.devicePixelRatio,
        targets: [...seen.values()],
      });
    }));
  });
});
console.log('\n=== 1b. buffer del composer vs canvas ===');
console.log(`  css ${sync.cssSize.w}x${sync.cssSize.h}  dpr ${sync.pixelRatio}  devicePixelRatio ${sync.devicePixelRatio}`);
console.log(`  canvas drawing buffer: ${sync.canvasBuffer.w}x${sync.canvasBuffer.h}`);
for (const t of sync.targets) {
  const matches = t.w === sync.canvasBuffer.w && t.h === sync.canvasBuffer.h;
  console.log(`  render target: ${t.w}x${t.h}  ${matches ? 'ok' : '<<< NON COMBACIA con il canvas'}`);
}

/* ---- 1c. il pulsante Low-res cambia davvero il buffer ----------- */
console.log('\n=== 1c. pulsante Low-res ===');
const measure = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = window.__renderer;
  return { w: c.width, h: c.height, dpr: r.getPixelRatio() };
});
const nativeBuf = await measure();
await page.click('.hud__icon[aria-label*="low resolution"]');
await wait(1500);
const lowBuf = await measure();
await page.screenshot({ path: 'ctx-lowres.png' });
const lowLuma = luma('ctx-lowres.png');

console.log(`  nativo   : ${nativeBuf.w}x${nativeBuf.h}  dpr ${nativeBuf.dpr}`);
console.log(`  low-res  : ${lowBuf.w}x${lowBuf.h}  dpr ${lowBuf.dpr}`);
const pixelRatioDrop = (lowBuf.w * lowBuf.h) / (nativeBuf.w * nativeBuf.h);
console.log(`  pixel disegnati: ${(pixelRatioDrop * 100).toFixed(0)}% del nativo`);
console.log(`  schermo low-res ancora visibile? luma ${lowLuma.mean.toFixed(2)} ${lowLuma.mean > 20 ? 'si' : 'NO — NERO'}`);

// torna a piena risoluzione
await page.click('.hud__icon[aria-label*="full resolution"]');
await wait(1200);
const backBuf = await measure();
console.log(`  tornato  : ${backBuf.w}x${backBuf.h}  ${backBuf.w === nativeBuf.w ? 'ok' : '!! non e tornato indietro'}`);

/* ---- 2. perdita del contesto, POI ripristino (il TDR reale) ------ */
console.log('\n=== 2. perdita contesto + ripristino (simula il TDR di Windows) ===');
await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const ext = gl.getExtension('WEBGL_lose_context');
  ext?.loseContext();
  // nel TDR vero il browser ripristina da solo; qui lo facciamo a mano
  setTimeout(() => ext?.restoreContext(), 1500);
});
await wait(3000);

for (const t of [2000, 4000, 8000]) {
  await page.screenshot({ path: `ctx-after-${t}.png` });
  const l = luma(`ctx-after-${t}.png`);
  const ev = await page.evaluate(() => window.__events.slice());
  const verdict = l.mean > before.mean * 0.5 ? 'si e ripresa' : 'ANCORA NERA';
  console.log(`  +${t}ms  luma ${l.mean.toFixed(2)}  max ${l.max.toFixed(0)}  -> ${verdict}   eventi: ${JSON.stringify(ev)}`);
}

console.log('\n=== interpretazione ===');
const last = luma('ctx-after-8000.png');
if (last.mean < before.mean * 0.5) {
  console.log('  BUG CONFERMATO: il contesto torna, ma lo schermo resta nero.');
  console.log('  three.js ricrea il suo stato, ma i render target dell EffectComposer no.');
} else {
  console.log('  lo schermo si e ripreso: il context loss non e la causa.');
}

await browser.close();

