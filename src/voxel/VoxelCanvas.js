/**
 * VoxelCanvas — the authoring surface for every 3D object in Aetheria.
 * ---------------------------------------------------------------
 * A sparse voxel volume (no dense array) stored in a Map keyed by a packed
 * 30-bit integer, so coordinates from -512..511 on every axis are supported
 * while keeping memory proportional to the voxels you actually paint.
 *
 * Everything in the world — terrain, buildings, props, trees, NPCs — is
 * authored with these primitives. Think of it as a tiny sculpting DSL.
 *
 *   const v = new VoxelCanvas();
 *   v.box(0, 0, 0, 10, 4, 6, 'stone');
 *   v.cylY(5, 4, 3, 3, 8, 'copper');
 *   const mesh = <VoxelMesh canvas={v} />;
 */

const OFFSET = 512;
const MASK = 1023;
const key = (x, y, z) =>
  ((x + OFFSET) & MASK) | (((y + OFFSET) & MASK) << 10) | (((z + OFFSET) & MASK) << 20);
const unkey = (k) => [(k & MASK) - OFFSET, ((k >> 10) & MASK) - OFFSET, ((k >> 20) & MASK) - OFFSET];

export class VoxelCanvas {
  constructor(name = 'canvas') {
    this.name = name;
    /** @type {Map<number, string>} packed coord -> material name */
    this.voxels = new Map();
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  /* ---------------------------------------------------------------- *
   * core
   * ---------------------------------------------------------------- */
  set(x, y, z, mat) {
    x |= 0; y |= 0; z |= 0;
    const k = key(x, y, z);
    if (this.voxels.get(k) === mat) return this;
    this.voxels.set(k, mat);
    if (x < this.min[0]) this.min[0] = x;
    if (y < this.min[1]) this.min[1] = y;
    if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x;
    if (y > this.max[1]) this.max[1] = y;
    if (z > this.max[2]) this.max[2] = z;
    return this;
  }

  /** Only paint if the target cell is empty (keeps earlier detail). */
  setIfEmpty(x, y, z, mat) {
    if (!this.voxels.has(key(x | 0, y | 0, z | 0))) this.set(x, y, z, mat);
    return this;
  }

  get(x, y, z) {
    return this.voxels.get(key(x | 0, y | 0, z | 0));
  }

  has(x, y, z) {
    return this.voxels.has(key(x | 0, y | 0, z | 0));
  }

  delete(x, y, z) {
    this.voxels.delete(key(x | 0, y | 0, z | 0));
    return this;
  }

  get size() {
    return this.voxels.size;
  }

  center() {
    return [
      (this.min[0] + this.max[0]) / 2,
      (this.min[1] + this.max[1]) / 2,
      (this.min[2] + this.max[2]) / 2,
    ];
  }

  dims() {
    return [
      this.max[0] - this.min[0] + 1,
      this.max[1] - this.min[1] + 1,
      this.max[2] - this.min[2] + 1,
    ];
  }

  clone() {
    const c = new VoxelCanvas(this.name);
    c.voxels = new Map(this.voxels);
    c.min = [...this.min];
    c.max = [...this.max];
    return c;
  }

  clear() {
    this.voxels.clear();
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
    return this;
  }

  /** Copy another canvas into this one, optionally offset. */
  merge(other, ox = 0, oy = 0, oz = 0) {
    for (const [k, mat] of other.voxels) {
      const [x, y, z] = unkey(k);
      this.set(x + ox, y + oy, z + oz, mat);
    }
    return this;
  }

  /** Re-tint every voxel of `matFrom` to `matTo` (optionally filtered). */
  remap(matFrom, matTo, filter = null) {
    for (const [k, mat] of this.voxels) {
      if (mat !== matFrom) continue;
      if (filter) {
        const [x, y, z] = unkey(k);
        if (!filter(x, y, z)) continue;
      }
      this.voxels.set(k, matTo);
    }
    return this;
  }

  /** Spread a material over a set of variants using a deterministic hash. */
  dither(matFrom, variants) {
    for (const [k, mat] of this.voxels) {
      if (mat !== matFrom) continue;
      const [x, y, z] = unkey(k);
      const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const frac = n - Math.floor(n);
      this.voxels.set(k, variants[Math.min(variants.length - 1, Math.floor(frac * variants.length))]);
    }
    return this;
  }

  /* ---------------------------------------------------------------- *
   * primitives — every one returns `this` for chaining
   * ---------------------------------------------------------------- */

  /** Filled axis-aligned box, origin = min corner. */
  box(x, y, z, w, h, d, mat) {
    const x1 = x + w - 1, y1 = y + h - 1, z1 = z + d - 1;
    for (let i = x; i <= x1; i++)
      for (let j = y; j <= y1; j++)
        for (let k = z; k <= z1; k++) this.set(i, j, k, mat);
    return this;
  }

  /** Hollow box: only the shell walls. */
  boxShell(x, y, z, w, h, d, mat) {
    const x1 = x + w - 1, y1 = y + h - 1, z1 = z + d - 1;
    for (let i = x; i <= x1; i++)
      for (let j = y; j <= y1; j++)
        for (let k = z; k <= z1; k++) {
          if (i === x || i === x1 || j === y || j === y1 || k === z || k === z1)
            this.set(i, j, k, mat);
        }
    return this;
  }

  /** Box outline (edges only) — window frames, ironwork, cages. */
  boxFrame(x, y, z, w, h, d, mat, thickness = 1) {
    const t = Math.max(0, thickness - 1);
    const x1 = x + w - 1, y1 = y + h - 1, z1 = z + d - 1;
    for (let i = x; i <= x1; i++)
      for (let j = y; j <= y1; j++)
        for (let k = z; k <= z1; k++) {
          const ex = i <= x + t || i >= x1 - t;
          const ey = j <= y + t || j >= y1 - t;
          const ez = k <= z + t || k >= z1 - t;
          const onX = i === x || i === x1;
          const onY = j === y || j === y1;
          const onZ = k === z || k === z1;
          if ((onX && (ey || ez)) || (onY && (ex || ez)) || (onZ && (ex || ey))) this.set(i, j, k, mat);
        }
    return this;
  }

  /** Solid sphere / ellipsoid. */
  sphere(cx, cy, cz, r, mat, opts = {}) {
    const { squashY = 1, hollow = false, noise = 0, rng = null } = opts;
    const ry = Math.max(0.001, r * squashY);
    const R = Math.ceil(r) + 1;
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++)
        for (let k = -R; k <= R; k++) {
          const rad = noise && rng ? r * (1 - noise + rng() * noise * 2) : r;
          const d = (i * i + k * k) / (rad * rad) + (j * j) / (ry * ry);
          if (d <= 1) {
            if (hollow && d > 0.45) continue;
            this.set(cx + i, cy + j, cz + k, mat);
          }
        }
    return this;
  }

  /** Vertical cylinder (Y axis). */
  cylY(cx, cy, cz, r, h, mat, opts = {}) {
    const { capTop = true, capBot = true, hollow = false, thickness = 1 } = opts;
    const R = Math.ceil(r);
    for (let j = 0; j < h; j++)
      for (let i = -R; i <= R; i++)
        for (let k = -R; k <= R; k++) {
          const d = Math.sqrt(i * i + k * k);
          if (hollow) {
            if (d <= r && d > r - thickness) this.set(cx + i, cy + j, cz + k, mat);
          } else if (d <= r) {
            this.set(cx + i, cy + j, cz + k, mat);
          }
        }
    if (capTop) this.discY(cx, cy + h - 1, cz, r, mat);
    if (capBot) this.discY(cx, cy, cz, r, mat);
    return this;
  }

  /** Horizontal cylinder along X. */
  cylX(cx, cy, cz, r, len, mat, opts = {}) {
    const { capStart = true, capEnd = true } = opts;
    const R = Math.ceil(r);
    for (let i = 0; i < len; i++)
      for (let j = -R; j <= R; j++)
        for (let k = -R; k <= R; k++)
          if (j * j + k * k <= r * r) this.set(cx + i, cy + j, cz + k, mat);
    if (capStart) this.discX(cx, cy, cz, r, mat);
    if (capEnd) this.discX(cx + len - 1, cy, cz, r, mat);
    return this;
  }

  /** Horizontal cylinder along Z. */
  cylZ(cx, cy, cz, r, len, mat, opts = {}) {
    const { capStart = true, capEnd = true } = opts;
    const R = Math.ceil(r);
    for (let i = 0; i < len; i++)
      for (let j = -R; j <= R; j++)
        for (let k = -R; k <= R; k++)
          if (j * j + k * k <= r * r) this.set(cx + j, cy + k, cz + i, mat);
    if (capStart) this.discZ(cx, cy, cz, r, mat);
    if (capEnd) this.discZ(cx, cy, cz + len - 1, r, mat);
    return this;
  }

  /** Flat filled disc on the XZ plane. */
  discY(cx, cy, cz, r, mat) {
    const R = Math.ceil(r);
    for (let i = -R; i <= R; i++)
      for (let k = -R; k <= R; k++) if (i * i + k * k <= r * r) this.set(cx + i, cy, cz + k, mat);
    return this;
  }

  /** Flat filled disc on the YZ plane (facing X). */
  discX(cx, cy, cz, r, mat) {
    const R = Math.ceil(r);
    for (let j = -R; j <= R; j++)
      for (let k = -R; k <= R; k++) if (j * j + k * k <= r * r) this.set(cx, cy + j, cz + k, mat);
    return this;
  }

  /** Flat filled disc on the XY plane (facing Z). */
  discZ(cx, cy, cz, r, mat) {
    const R = Math.ceil(r);
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++) if (i * i + j * j <= r * r) this.set(cx + i, cy + j, cz, mat);
    return this;
  }

  /** Ring on the XZ plane (walls only). */
  ringY(cx, cy, cz, r, thickness, mat) {
    const R = Math.ceil(r);
    for (let i = -R; i <= R; i++)
      for (let k = -R; k <= R; k++) {
        const d = Math.sqrt(i * i + k * k);
        if (d <= r && d > r - thickness) this.set(cx + i, cy, cz + k, mat);
      }
    return this;
  }

  /** Ring in the XY plane — clock bezels, portal rings. */
  ringZ(cx, cy, cz, r, thickness, mat) {
    const R = Math.ceil(r + thickness);
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++) {
        const d = Math.sqrt(i * i + j * j);
        if (d <= r + thickness && d > r) this.set(cx + i, cy + j, cz, mat);
      }
    return this;
  }

  /** Cone narrowing toward +Y. */
  coneY(cx, cy, cz, rBottom, rTop, h, mat) {
    const R = Math.ceil(Math.max(rBottom, rTop)) + 1;
    for (let j = 0; j < h; j++) {
      const t = h <= 1 ? 0 : j / (h - 1);
      const r = rBottom + (rTop - rBottom) * t;
      for (let i = -R; i <= R; i++)
        for (let k = -R; k <= R; k++) {
          const d = Math.sqrt(i * i + k * k);
          if (d <= r) {
            /* Epsilon matters: 2.2 - 1.2 === 1.0000000000000002 in binary float,
               so a plain `d < r - 1.2` silently culled rim cells that were meant
               to survive (d === 1) and left cone tips detached in mid-air. */
            if (rBottom - rTop > 1.5 && j < h - 1 && d < r - 1.2 - 1e-9) continue;
            this.set(cx + i, cy + j, cz + k, mat);
          }
        }
    }
    return this;
  }

  /** Dome (upper half sphere) sitting on the XZ plane. */
  domeY(cx, cy, cz, r, mat, opts = {}) {
    const { hollow = false } = opts;
    const R = Math.ceil(r);
    for (let i = -R; i <= R; i++)
      for (let j = 0; j <= R; j++)
        for (let k = -R; k <= R; k++) {
          const d = (i * i + j * j + k * k) / (r * r);
          if (d <= 1) {
            if (hollow && d < 0.55) continue;
            this.set(cx + i, cy + j, cz + k, mat);
          }
        }
    return this;
  }

  /** Stairs ascending along +X. */
  stairsX(x, y, z, steps, mat, opts = {}) {
    const { width = 1, dirZ = 1 } = opts;
    for (let s = 0; s < steps; s++)
      for (let w = 0; w < width; w++)
        for (let h = 0; h <= s; h++) this.set(x + s, y + h, z + w * dirZ, mat);
    return this;
  }

  /** Stairs ascending along +Z. */
  stairsZ(x, y, z, steps, mat, opts = {}) {
    const { width = 1 } = opts;
    for (let s = 0; s < steps; s++)
      for (let w = 0; w < width; w++)
        for (let h = 0; h <= s; h++) this.set(x + w, y + h, z + s, mat);
    return this;
  }

  /** 3D Bresenham line — pipes, cables, ropes, chains. */
  line(x0, y0, z0, x1, y1, z1, mat) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let x = x0, y = y0, z = z0;
    if (dx >= dy && dx >= dz) {
      let ey = 2 * dy - dx, ez = 2 * dz - dx;
      for (let i = 0; i <= dx; i++) {
        this.set(x, y, z, mat);
        if (ey > 0) { y += sy; ey -= 2 * dx; }
        if (ez > 0) { z += sz; ez -= 2 * dx; }
        ey += 2 * dy; ez += 2 * dz; x += sx;
      }
    } else if (dy >= dx && dy >= dz) {
      let ex = 2 * dx - dy, ez = 2 * dz - dy;
      for (let i = 0; i <= dy; i++) {
        this.set(x, y, z, mat);
        if (ex > 0) { x += sx; ex -= 2 * dy; }
        if (ez > 0) { z += sz; ez -= 2 * dy; }
        ex += 2 * dx; ez += 2 * dz; y += sy;
      }
    } else {
      let ex = 2 * dx - dz, ey = 2 * dy - dz;
      for (let i = 0; i <= dz; i++) {
        this.set(x, y, z, mat);
        if (ex > 0) { x += sx; ex -= 2 * dz; }
        if (ey > 0) { y += sy; ey -= 2 * dz; }
        ex += 2 * dx; ey += 2 * dy; z += sz;
      }
    }
    return this;
  }

  /** Repeat a block pattern with strides — rivets, tiles, lamp rows. */
  stamp(x, y, z, w, h, d, mat, opts = {}) {
    const { strideX = 2, strideY = 2, strideZ = 2 } = opts;
    for (let i = 0; i < w; i += strideX)
      for (let j = 0; j < h; j += strideY)
        for (let k = 0; k < d; k += strideZ) {
          const px = x + i, py = y + j, pz = z + k;
          if (px > x + w - 1 || py > y + h - 1 || pz > z + d - 1) continue;
          this.setIfEmpty(px, py, pz, mat);
        }
    return this;
  }

  /** Scatter over existing exposed voxels — surface moss, rust, wear. */
  scatter(minX, minY, minZ, maxX, maxY, maxZ, mat, rng, opts = {}) {
    const { chance = 0.3, onlyExposed = true, onlyTop = false } = opts;
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++) {
          if (!this.has(x, y, z)) continue;
          if (onlyExposed) {
            const exposed =
              !this.has(x + 1, y, z) || !this.has(x - 1, y, z) ||
              !this.has(x, y + 1, z) || !this.has(x, y - 1, z) ||
              !this.has(x, y, z + 1) || !this.has(x, y, z - 1);
            if (!exposed) continue;
            if (onlyTop && this.has(x, y + 1, z)) continue;
          }
          if (rng() < chance) this.set(x, y, z, mat);
        }
    return this;
  }

  /** Carve a sphere — caves, archways, hollow domes. */
  carveSphere(cx, cy, cz, r, opts = {}) {
    const { squashY = 1 } = opts;
    const R = Math.ceil(r);
    const ry = Math.max(0.001, r * squashY);
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++)
        for (let k = -R; k <= R; k++) {
          const d = (i * i + k * k) / (r * r) + (j * j) / (ry * ry);
          if (d <= 1) this.delete(cx + i, cy + j, cz + k);
        }
    return this;
  }

  /** Carve an axis-aligned box — doors, windows, tunnels. */
  carveBox(x, y, z, w, h, d) {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++)
        for (let k = z; k < z + d; k++) this.delete(i, j, k);
    return this;
  }

  /** Glazed window on a Z-facing wall. */
  windowZ(x, y, z, w, h, glassMat, frameMat) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) {
        const border = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        this.set(x + i, y + j, z, border ? frameMat : glassMat);
      }
    return this;
  }

  /** Glazed window on an X-facing wall. */
  windowX(x, y, z, w, h, glassMat, frameMat) {
    for (let k = 0; k < w; k++)
      for (let j = 0; j < h; j++) {
        const border = k === 0 || j === 0 || k === w - 1 || j === h - 1;
        this.set(x, y + j, z + k, border ? frameMat : glassMat);
      }
    return this;
  }
}

export { key as voxelKey, unkey as unkeyVoxel };
export default VoxelCanvas;
