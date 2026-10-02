/**
 * DEVICE PITCH DIAGNOSTIC
 * ========================
 * Reproduces the black-screen report on real phone hardware, through the real
 * mobile browser and the real input pipeline.
 *
 * Why this exists
 * ---------------
 * The desktop pinch test in `verify-touch.mjs` dispatches touch events into a
 * desktop Chromium. That path shares almost nothing with the failing case:
 *
 *   • the page-zoom gesture recogniser only exists on mobile, so a pinch the
 *     browser can claim can never be exercised from a desktop build;
 *   • `touch-action` is honoured differently once a real compositor and a real
 *     visual viewport are in play;
 *   • the GPU is genuinely different (a phone SoC, not SwiftShader).
 *
 * So the desktop test passes while the phone is broken. This drives the phone.
 *
 * How it works
 * ------------
 *   1. `adb forward` exposes Brave's DevTools socket on localhost:9222.
 *   2. We speak CDP to the live tab — no build step, no local server: this is
 *      the deployed site running on the handset.
 *   3. Telemetry is installed BEFORE the gesture, because the interesting
 *      signals (context loss, ratio drift) only mean something next to the
 *      reading taken before the pinch.
 *   4. The pinch is dispatched as a genuine two-finger touch stream through
 *      `Input.dispatchTouchEvent`, so the browser's own gesture handling runs —
 *      page zoom included. That is the point of the exercise.
 *   5. Screenshots are captured either side, so "went black" is measured rather
 *      than assumed: a correct frame and a black one differ in mean luminance
 *      by an order of magnitude.
 *
 * Usage
 * -----
 *   node scripts/device-pinch.mjs [--url <url>] [--serial <adb-serial>]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const URL_UNDER_TEST = arg('url', 'https://piccardino.github.io/space-bunny-aetheria/');
const SERIAL = arg('serial', null);
const PORT = arg('port', '9222');
const OUT_DIR = 'artifacts/device-pinch';

/* ------------------------------------------------------------------ adb --- */

const adb = (args, quiet = false) =>
  execFileSync('adb', SERIAL ? ['-s', SERIAL, ...args] : args, {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
  });

/* ------------------------------------------------------------------ cdp --- */

/** Minimal CDP client over the browser-native WebSocket (Node >= 22). */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error
          ? reject(new Error(msg.error.message))
          : resolve(msg.result);
      } else if (msg.method) {
        this.handlers.get(msg.method)?.forEach((fn) => fn(msg.params));
      }
    });
  }

  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error(`cannot reach ${wsUrl}`)), { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  /** Evaluate an expression in the page and return its value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'evaluation threw');
    }
    return r.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/* ------------------------------------------------------------ telemetry --- */

/**
 * The snapshot. Every field answers one question — "do the renderer and the
 * page still agree on how big the screen is?" — because a black frame means the
 * final blit is sampling a buffer that no longer matches the canvas, and each
 * field is one side of that comparison.
 */
const SNAPSHOT = `(() => {
  const c = document.querySelector('.app__canvas canvas');
  const vv = window.visualViewport;
  const r = c && c.getBoundingClientRect();
  return {
    visualViewport: vv
      ? { scale: +vv.scale.toFixed(4), width: Math.round(vv.width), height: Math.round(vv.height) }
      : null,
    layout: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    canvasCss: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    canvasBuffer: c ? { w: c.width, h: c.height } : null,
    contextEvents: window.__aetheriaContextEvents ?? null,
    contextLost: !!(c && c.__aetheriaContextLost),
  };
})()`;

/* --------------------------------------------------------------- gesture --- */

/**
 * One two-finger pinch.
 *
 * `from`/`to` are the half-separations, in CSS pixels, of the two contact
 * points about the screen centre. Spreading them (`to > from`) is a pinch-OUT,
 * which under `user-scalable` page zoom is a magnification.
 *
 * `steps` matters: a pinch is a *stream*, and a browser only decides whether it
 * is a page zoom after watching enough of one. A single jump can be
 * reinterpreted as a fling or a scroll, which is exactly why a one-shot
 * synthetic gesture was never equivalent to the real thing.
 */
async function pinch(cdp, { from, to, steps = 24, cx, cy }) {
  const frame = async (half, type) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [
        { x: cx, y: cy - half },
        { x: cx, y: cy + half },
      ],
    });
  };

  await frame(from, 'touchStart');
  for (let i = 1; i <= steps; i++) {
    await frame(from + ((to - from) * i) / steps, 'touchMove');
    await sleep(16);
  }
  await frame(to, 'touchEnd');
}


/* ----------------------------------------------------------------- setup --- */

mkdirSync(OUT_DIR, { recursive: true });

console.log('· forwarding the DevTools socket');
adb(['forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote'], true);

const list = JSON.parse(
  await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).text(),
);
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('Brave exposes no page target');

const cdp = await CDP.attach(page.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');

/* Console and WebGL errors are the cheapest early warning that a context died. */
const problems = [];
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error' || p.type === 'warning') {
    problems.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
});
cdp.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error') problems.push(`log: ${p.entry.text}`);
});

console.log(`· opening ${URL_UNDER_TEST}`);
await cdp.send('Page.navigate', { url: URL_UNDER_TEST });

/* The island has to be alive before a pinch means anything, so wait on the
   canvas rather than on a fixed sleep. */
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  await sleep(1000);
  ready = await cdp
    .eval(`!!document.querySelector('.app__canvas canvas')?.width`)
    .catch(() => false);
}
if (!ready) throw new Error('the canvas never appeared');
console.log('· canvas is up');

/* Let the intro finish and the idle orbit settle: a gesture taken during the
   fly-in would be measuring the intro, not the pinch. */
await sleep(9000);

const dims = await cdp.eval('({w: innerWidth, h: innerHeight})');
const cx = Math.round(dims.w / 2);
const cy = Math.round(dims.h / 2);
console.log(`· viewport ${dims.w}x${dims.h}, pinching about (${cx}, ${cy})`);

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(data, 'base64'));
};

/** Mean luminance, read from the page itself: a black frame is objectively dark. */
const luma = () => cdp.eval(`(() => {
  const src = document.querySelector('.app__canvas canvas');
  const c = document.createElement('canvas');
  c.width = 160; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 160, 320);
  const d = ctx.getImageData(0, 0, 160, 320).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
  return +(sum / (d.length / 4)).toFixed(2);
})()`);

const before = { state: await cdp.eval(SNAPSHOT), luma: await luma() };
await shot('1-before');
console.log('· before:', JSON.stringify(before));

console.log('· pinch-OUT');
await pinch(cdp, { from: dims.h * 0.12, to: dims.h * 0.34, cx, cy });
await sleep(2500);

const after = { state: await cdp.eval(SNAPSHOT), luma: await luma() };
await shot('2-after-pinchout');
console.log('· after: ', JSON.stringify(after));

/* Undo the gesture so the two readings are comparable. */
await pinch(cdp, { from: dims.h * 0.34, to: dims.h * 0.12, cx, cy });
await sleep(2500);
await shot('3-after-pinchin');

/* ------------------------------------------------------------- verdict --- */

const black = after.luma < Math.max(6, before.luma * 0.2);
const ratioMoved =
  before.state.devicePixelRatio !== after.state.devicePixelRatio ||
  before.state.visualViewport?.scale !== after.state.visualViewport?.scale;
const bufferMismatch =
  after.state.canvasBuffer &&
  after.state.canvasCss &&
  Math.abs(after.state.canvasBuffer.w / after.state.canvasCss.w - after.state.devicePixelRatio) > 0.01;

writeFileSync(
  `${OUT_DIR}/report.json`,
  JSON.stringify({ before, after, black, ratioMoved, bufferMismatch, problems }, null, 2),
);

console.log('\n================ VERDICT ================');
console.log(`black frame:            ${black ? 'YES' : 'no'}`);
console.log(`page zoom / dpr moved:  ${ratioMoved ? 'YES' : 'no'}`);
console.log(`buffer vs css mismatch: ${bufferMismatch ? 'YES' : 'no'}`);
if (problems.length) console.log(`console problems:\n  ${problems.slice(0, 20).join('\n  ')}`);
console.log(`\nartifacts in ${OUT_DIR}/`);

process.exit(black ? 1 : 0);
