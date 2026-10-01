/**
 * OFFICIAL MODEL SHEETS — renders every voxel model to a PNG contact sheet so
 * gaps/holes can actually be LOOKED AT instead of inferred from numbers.
 *
 *   node scripts/render-models.mjs             -> renders/shots/*.png
 *   node scripts/render-models.mjs clocktower  -> just one model
 *
 * Pure Node: a hand-rolled orthographic voxel raymarcher + a tiny PNG encoder.
 * Views per model: FRONT (+Z) | RIGHT (+X) | TOP (+Y).
 * No dependencies, no browser, no three.js — it only reads VoxelCanvas.
 */
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILDERS } from '../src/world/buildWorld.js';
import VoxelCanvas from '../src/voxel/VoxelCanvas.js';
import { MAT } from '../src/core/palette.js';
import { buildAirship, buildScoutAirship } from '../src/world/locations/models/airship.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'renders', 'shots');

/* ------------------------------------------------------------------ */
/* PNG encoder                                                         */
/* ------------------------------------------------------------------ */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** @param {Uint8Array} rgb  width*height*3 */
function encodePNG(rgb, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3)
      .copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/* ------------------------------------------------------------------ */
/* palette                                                             */
/* ------------------------------------------------------------------ */
const COLOR = new Map();
for (const [name, m] of Object.entries(MAT)) {
  const h = m.c;
  const boost = m.k === 'glow' ? 1.25 : 1; // emissive keeps its brightness
  COLOR.set(name, [
    Math.min(255, ((h >> 16) & 255) * boost),
    Math.min(255, ((h >> 8) & 255) * boost),
    Math.min(255, (h & 255) * boost),
  ]);
}

// per-face shading, close enough to the real mesher to spot holes by eye
const SHADE = { py: 1.0, ny: 0.5, pz: 0.84, nz: 0.66, px: 0.74, nx: 0.6 };
const AO = [1, 1, 0.97, 0.93, 0.88, 0.82, 0.76];
const BG = [24, 22, 34];

/* ------------------------------------------------------------------ */
/* the raymarcher — one axis-aligned view at a time                   */
/* ------------------------------------------------------------------ */
function renderView(v, view, scale) {
  const min = v.min, max = v.max;
  const U = view === 'right' ? (x, y, z) => z : (x, y, z) => x;
  const Vc = view === 'top' ? (x, y, z) => -z : (x, y, z) => y;
  const flip = view === 'right';

  const uMin = Math.min(U(min[0], min[1], min[2]), U(max[0], max[1], max[2])) - 1;
  const uMax = Math.max(U(min[0], min[1], min[2]), U(max[0], max[1], max[2])) + 1;
  const wMin = Math.min(Vc(min[0], min[1], min[2]), Vc(max[0], max[1], max[2])) - 1;
  const wMax = Math.max(Vc(min[0], min[1], min[2]), Vc(max[0], max[1], max[2])) + 1;
  const dMin = Math.min(view === 'right' ? -max[0] : view === 'top' ? min[1] : min[2],
                        view === 'right' ? -min[0] : view === 'top' ? max[1] : max[2]) - 1;
  const dMax = Math.max(view === 'right' ? -max[0] : view === 'top' ? min[1] : min[2],
                        view === 'right' ? -min[0] : view === 'top' ? max[1] : max[2]) + 1;

  const W = Math.round((uMax - uMin + 1) * scale);
  const H = Math.round((wMax - wMin + 1) * scale);
  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { img[i * 3] = BG[0]; img[i * 3 + 1] = BG[1]; img[i * 3 + 2] = BG[2]; }

  for (let py = 0; py < H; py++) {
    const w = wMax - (py + 0.5) / scale;
    for (let px = 0; px < W; px++) {
      const u = uMin + (px + 0.5) / scale;
      let hit = null;
      for (let d = dMin; d <= dMax; d++) {
        const x = flip ? -d : Math.round(u);
        const y = view === 'top' ? d : Math.round(w);
        const z = flip ? Math.round(u) : view === 'top' ? Math.round(-w) : d;
        if (v.has(x, y, z)) { hit = [x, y, z]; break; }
      }
      if (!hit) continue;
      const [x, y, z] = hit;
      const rgb = COLOR.get(v.get(x, y, z)) ?? [200, 200, 200];
      const near = view === 'right' ? -x : view === 'top' ? y : z;
      const key = view === 'top' ? 'py' : `${near > 0 ? 'p' : 'n'}${view === 'right' ? 'x' : 'z'}`;
      let n = 0;
      if (v.has(x + 1, y, z)) n++;
      if (v.has(x - 1, y, z)) n++;
      if (v.has(x, y + 1, z)) n++;
      if (v.has(x, y - 1, z)) n++;
      if (v.has(x, y, z + 1)) n++;
      if (v.has(x, y, z - 1)) n++;
      const s = SHADE[key] * AO[n];
      const o = (py * W + px) * 3;
      img[o] = Math.min(255, rgb[0] * s);
      img[o + 1] = Math.min(255, rgb[1] * s);
      img[o + 2] = Math.min(255, rgb[2] * s);
    }
  }
  return { img, W, H };
}

/* ---- isometric raymarcher: this is how the camera actually sees the island,
   and diagonal sightlines are exactly where axis-aligned views hide holes. */
function renderISO(v, scale) {
  const [minX, minY, minZ] = v.min, [maxX, maxY, maxZ] = v.max;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 2;
  const spanX = radius, spanY = radius;
  const W = Math.round(spanX * 2 * scale), H = Math.round(spanY * 2 * scale);

  // camera direction: from (+x,+y,+z) looking at the centre, slight downward tilt
  const dir = norm([1, 0.85, 1]);
  const right = norm(cross([0, 1, 0], dir));
  const up = cross(dir, right);

  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { img[i * 3] = BG[0]; img[i * 3 + 1] = BG[1]; img[i * 3 + 2] = BG[2]; }

  const step = 0.08;
  for (let py = 0; py < H; py++) {
    const vy = spanY - (py + 0.5) / scale;
    for (let px = 0; px < W; px++) {
      const vx = (px + 0.5) / scale - spanX;
      const ox = cx + right[0] * vx + up[0] * vy;
      const oy = cy + right[1] * vx + up[1] * vy;
      const oz = cz + right[2] * vx + up[2] * vy;
      let hit = null, t = 0;
      for (; t < radius * 3; t += step) {
        const x = Math.round(ox + dir[0] * t);
        const y = Math.round(oy + dir[1] * t);
        const z = Math.round(oz + dir[2] * t);
        if (v.has(x, y, z)) { hit = [x, y, z]; break; }
      }
      if (!hit) continue;
      const [x, y, z] = hit;
      const rgb = COLOR.get(v.get(x, y, z)) ?? [200, 200, 200];
      // shade by the dominant facing axis of the hit voxel
      let s = 1;
      const open = [
        [1, 0, 0, SHADE.px], [-1, 0, 0, SHADE.nx],
        [0, 1, 0, SHADE.py], [0, -1, 0, SHADE.ny],
        [0, 0, 1, SHADE.pz], [0, 0, -1, SHADE.nz],
      ];
      for (const [dx, dy, dz, sh] of open) if (!v.has(x + dx, y + dy, z + dz)) { s = sh; break; }
      let n = 0;
      if (v.has(x + 1, y, z)) n++;
      if (v.has(x - 1, y, z)) n++;
      if (v.has(x, y + 1, z)) n++;
      if (v.has(x, y - 1, z)) n++;
      if (v.has(x, y, z + 1)) n++;
      if (v.has(x, y, z - 1)) n++;
      s *= AO[n];
      const o = (py * W + px) * 3;
      img[o] = Math.min(255, rgb[0] * s);
      img[o + 1] = Math.min(255, rgb[1] * s);
      img[o + 2] = Math.min(255, rgb[2] * s);
    }
  }
  return { img, W, H };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Contact sheet: FRONT | RIGHT | TOP | ISO with a gutter. */
function sheet(views) {
  const gut = 4;
  const W = views.reduce((s, r) => s + r.W, 0) + gut * (views.length + 1);
  const H = Math.max(...views.map((r) => r.H)) + gut * 2;
  const out = new Uint8Array(W * H * 3).fill(60);
  let ox = gut;
  for (const r of views) {
    const oy = gut + Math.floor((H - gut * 2 - r.H) / 2);
    for (let y = 0; y < r.H; y++)
      for (let x = 0; x < r.W; x++) {
        const s = (y * r.W + x) * 3, d = ((y + oy) * W + (x + ox)) * 3;
        out[d] = r.img[s]; out[d + 1] = r.img[s + 1]; out[d + 2] = r.img[s + 2];
      }
    ox += r.W + gut;
  }
  return { out, W, H };
}

/* ------------------------------------------------------------------ */
await mkdir(OUT, { recursive: true });
const only = process.argv[2];

// The airships live in their own canvas (they drift independently), so they
// are NOT in BUILDERS — render them too, they are the classic hole suspect.
const targets = [...Object.entries(BUILDERS)];
if (!only || only === 'airships') {
  targets.push(['airships', (v) => {
    buildAirship(v, { len: 34, r: 7 });
    buildScoutAirship(v, { len: 15, r: 3 });
    buildScoutAirship(v, { len: 15, r: 3 });
  }]);
}

for (const [id, fn] of targets) {
  if (only && id !== only) continue;
  const v = new VoxelCanvas(id);
  fn(v);
  // a single-model run is a close-up, so it gets a much bigger scale
  const big = only === id;
  const views = ['front', 'right', 'top'].map((k) => renderView(v, k, big ? 8 : 3));
  views.push(renderISO(v, big ? 8 : 2));
  const s = sheet(views);
  await writeFile(join(OUT, `${id}.png`), encodePNG(s.out, s.W, s.H));
  console.log(`${id.padEnd(14)} ${s.W}x${s.H}  ${String(v.size).padStart(6)} voxels  dims ${v.dims().join('x')}`);
}
console.log('\nview order per sheet: FRONT(+Z) | RIGHT(+X) | TOP(+Y) | ISO');