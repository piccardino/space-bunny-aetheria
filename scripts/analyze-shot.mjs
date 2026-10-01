/**
 * Decode a PNG and report its real pixel statistics.
 * Used to verify that the renderer actually produced an image — reading the
 * live framebuffer with gl.readPixels is unreliable because the drawing buffer
 * is not preserved between frames.
 *
 * Usage: node scripts/analyze-shot.mjs shot-island.png
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const path = process.argv[2] ?? 'shot-island.png';
const buf = readFileSync(path);

if (buf.readUInt32BE(0) !== 0x89504e47) {
  console.error('not a PNG');
  process.exit(1);
}

let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];

while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}

const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
const raw = inflateSync(Buffer.concat(idat));
const stride = width * channels;
const bpp = channels * (bitDepth / 8);

// undo the per-scanline PNG filters
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

let sum = 0, n = 0, max = 0, min = 255;
const hist = new Array(16).fill(0);
for (let i = 0; i < out.length; i += channels * 7) {
  const l = (out[i] + out[i + 1] + out[i + 2]) / 3;
  sum += l; n++;
  if (l > max) max = l;
  if (l < min) min = l;
  hist[Math.min(15, Math.floor(l / 16))]++;
}

const mean = sum / n;
let variance = 0;
for (let i = 0; i < out.length; i += channels * 7) {
  const l = (out[i] + out[i + 1] + out[i + 2]) / 3;
  variance += (l - mean) ** 2;
}
const std = Math.sqrt(variance / n);

console.log(`${path}  ${width}x${height}`);
console.log(`  mean luma : ${mean.toFixed(2)}`);
console.log(`  std dev   : ${std.toFixed(2)}`);
console.log(`  min / max : ${min.toFixed(0)} / ${max.toFixed(0)}`);
console.log(`  histogram : ${hist.map((v) => (v / n * 100).toFixed(0).padStart(3)).join('')}`);

const dead = max < 14;
console.log(dead ? '  RESULT: BLANK / essentially black' : `  RESULT: image present (contrast ${std.toFixed(1)})`);
process.exit(dead ? 1 : 0);