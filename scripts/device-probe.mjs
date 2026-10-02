/**
 * DEVICE PROBE
 * ============
 * A one-shot look at what the deployed page actually IS on the phone.
 *
 * Why this exists
 * --------------
 * `device-pinch.mjs` aborts with "the canvas never appeared", and that message
 * alone says nothing about WHY. The island is a React tree: the intro, the
 * canvas and the WebGL fallback are three different worlds, and which one we
 * are in decides everything downstream. So we ask the page directly instead of
 * inferring it from a screenshot.
 *
 * It reports, from inside the live tab:
 *   • which surface is on screen: canvas, intro or WebGL fallback;
 *   • the canvas geometry and the DPR the renderer settled on;
 *   • the unmasked GL renderer, so a SwiftShader/llvmpipe surprise is visible;
 *   • every console error plus the context-loss telemetry.
 *
 * Usage
 * -----
 *   node scripts/device-probe.mjs [--url <url>] [--serial <adb-serial>]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const URL_UNDER_TEST = arg('url', 'https://piccardino.github.io/space-bunny-aetheria/');
const SERIAL = arg('serial', null);
const OUT_DIR = 'artifacts/device-pinch';

const adb = (args, quiet = false) =>
  execFileSync('adb', SERIAL ? ['-s', SERIAL, ...args] : args, {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe'],
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
      }, 20000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  eval(expression) {
    return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      .then((r) => r.result?.value);
  }
}

/* The DevTools socket lives in the app's private data directory, which adb may
   not read (and Brave is not debuggable, so `run-as` is out too). The supported
   way in is to forward the abstract socket to localhost and ask the HTTP
   endpoint what targets exist. */
const PORT = arg('port', '9222');

console.log(`· forwarding the DevTools socket (tcp:${PORT})`);
adb(['forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote'], true);

const targets = JSON.parse(await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).text());
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error(`Brave exposes no page target (saw ${targets.length})`);
console.log(`· attached to ${page.url.slice(0, 80)}`);

mkdirSync(OUT_DIR, { recursive: true });

const cdp = await CDP.attach(page.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');

/* Console noise is half the diagnosis: a shader that fails to compile or a
   context that dies leaves its only trace here. */
const problems = [];
cdp.on('Runtime.exceptionThrown', (p) =>
  problems.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error' || p.type === 'warning')
    problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
});
cdp.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error') problems.push(`log: ${p.entry.text}`);
});

console.log(`· opening ${URL_UNDER_TEST}`);
await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
await sleep(12000);

/* One query, so the reading is a single consistent snapshot rather than three
   taken at three different moments. */
const probe = await cdp.eval(`(() => {
  const c = document.querySelector('.app__canvas canvas');
  const r = c?.getBoundingClientRect();
  const gl = c?.getContext('webgl2') || c?.getContext('webgl');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    href: location.href,
    readyState: document.readyState,
    appChildren: document.querySelector('#root')?.children.length ?? 0,
    hasCanvas: !!c,
    hasIntro: !!document.querySelector('.intro'),
    introEnter: document.querySelector('.intro__enter')?.textContent?.trim() ?? null,
    hasFallback: !!document.querySelector('.fallback'),
    hasHud: !!document.querySelector('.hud'),
    canvasBuffer: c ? { w: c.width, h: c.height } : null,
    canvasCss: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    devicePixelRatio,
    visualViewportScale: window.visualViewport?.scale ?? null,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    contextLost: !!(c && c.__aetheriaContextLost),
    contextEvents: window.__aetheriaContextEvents ?? null,
  };
})()`);

/* Print the reading BEFORE the screenshot. On this handset `Page.captureScreenshot`
   never answers, and a diagnostic that dies on its own nicest-to-have step is a
   diagnostic that always reports nothing. */
console.log('\n================ PROBE ================');
console.log(JSON.stringify(probe, null, 2));
console.log(`\nproblems (${problems.length}):`);
console.log(problems.length ? `  ${problems.slice(0, 25).join('\n  ')}` : '  none');

writeFileSync(`${OUT_DIR}/probe.json`, JSON.stringify({ probe, problems }, null, 2));

/* `adb exec-out screencap` captures the real framebuffer: it does not care what
   the renderer is doing, and it is the same path that works when the GPU has
   wedged — which is precisely the state we most want a picture of. */
writeFileSync(
  `${OUT_DIR}/probe.png`,
  execFileSync('adb', SERIAL ? ['-s', SERIAL, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
  }),
);

console.log(`\nscreenshot -> ${OUT_DIR}/probe.png`);