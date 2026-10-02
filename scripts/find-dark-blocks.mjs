/**
 * DARK BLOCK DETECTOR
 * --------------------
 *   node scripts/find-dark-blocks.mjs artifacts/sweep/az-*.png
 *
 * Reports the large near-black regions in a screenshot as a bounding box plus a
 * FILL RATIO (pixels / bounding-box area). That ratio is what separates the two
 * kinds of dark area on the island:
 *
 *   fill ~ 1.0   a hard-edged RECTANGLE — a quad, not geometry. This is the
 *                signature of something drawing a flat panel where no voxels
 *                should be, e.g. the hover outline shell.
 *   fill ~ 0.3   an irregular blob — the island's own shadowed underside.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

function decode(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const bpp = channels;
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
  // normalise to 3 channels
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = out[i * channels];
    rgb[i * 3 + 1] = out[i * channels + 1];
    rgb[i * 3 + 2] = out[i * channels + 2];
  }
  return { width, height, rgb };
}

const LUMA = Number(process.env.LUMA ?? 18); // below this counts as "black"
const MIN_AREA = Number(process.env.MIN_AREA ?? 1500); // ignore specks

function blocks({ width, height, rgb }) {
  const N = width * height;
  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  const out = [];
  const isBlack = (i) => rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2] < LUMA * 3;
  for (let seed = 0; seed < N; seed++) {
    if (label[seed] !== 0) continue;
    if (!isBlack(seed)) { label[seed] = -1; continue; }
    const id = out.length + 1;
    let sp = 0;
    stack[sp++] = seed;
    label[seed] = id;
    let minx = width, maxx = -1, miny = height, maxy = -1, count = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % width, y = (p - x) / width;
      count++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      const push = (q, qx) => {
        if (q < 0 || q >= N || label[q] !== 0) return;
        if (Math.abs(qx - x) > 1) return;
        if (!isBlack(q)) { label[q] = -1; return; }
        label[q] = id;
        stack[sp++] = q;
      };
      push(p - 1, x - 1);
      push(p + 1, x + 1);
      push(p - width, x);
      push(p + width, x);
    }
    const w = maxx - minx + 1, h = maxy - miny + 1;
    let sum = 0;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const i = y * width + x;
        if (label[i] === id) sum += (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;
      }
    }
    out.push({
      minx, miny, maxx, maxy, w, h, count, fill: count / (w * h),
      mean: sum / count,
      peak: (() => {
        let m = 0;
        for (let y = miny; y <= maxy; y++)
          for (let x = minx; x <= maxx; x++) {
            const i = y * width + x;
            if (label[i] === id) m = Math.max(m, (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3);
          }
        return m;
      })(),
    });
  }
  return out.filter((b) => b.count >= MIN_AREA).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ *
 * CROP — magnify one region so it can actually be LOOKED at.
 *   node scripts/find-dark-blocks.mjs --crop x,y,w,h out.png shot.png [zoom]
 * ------------------------------------------------------------------ */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
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
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const argv = process.argv.slice(2);
if (argv[0] === '--crop') {
  const [x, y, w, h] = argv[1].split(',').map(Number);
  const outPath = argv[2];
  const img = decode(argv[3]);
  const zoom = Number(argv[4] ?? 4);
  const W = w * zoom, H = h * zoom;
  const out = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const sx = Math.min(img.width - 1, x + Math.floor(i / zoom));
      const sy = Math.min(img.height - 1, y + Math.floor(j / zoom));
      const s = (sy * img.width + sx) * 3, d = (j * W + i) * 3;
      out[d] = img.rgb[s]; out[d + 1] = img.rgb[s + 1]; out[d + 2] = img.rgb[s + 2];
    }
  }
  writeFileSync(outPath, encodePNG(out, W, H));
  console.log(`cropped ${w}x${h} at (${x},${y}) -> ${W}x${H}  ${outPath}`);
  process.exit(0);
}

for (const path of argv) {
  const img = decode(path);
  const found = blocks(img);
  console.log(`\n${path}  ${img.width}x${img.height}  — ${found.length} dark block(s) >= ${MIN_AREA}px`);
  for (const b of found.slice(0, 8)) {
    const kind = b.fill > 0.85 ? 'RECTANGLE' : b.fill > 0.6 ? 'blocky' : 'irregular';
    console.log(
      `   ${kind.padEnd(11)} ${String(b.count).padStart(7)}px  ` +
      `box ${String(b.w).padStart(4)}x${String(b.h).padStart(4)} at (${b.minx},${b.miny})  ` +
      `fill ${b.fill.toFixed(2)}  luma ${b.mean.toFixed(1)} (peak ${b.peak.toFixed(0)})`,
    );
  }
}

