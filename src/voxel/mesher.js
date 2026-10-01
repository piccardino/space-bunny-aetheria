/**
 * Voxel mesher.
 * ------------
 * Turns a VoxelCanvas into ONE BufferGeometry containing:
 *   • hidden-face culling (interior faces are never emitted)
 *   • per-vertex ambient occlusion, baked from the 3 cells touching each corner
 *   • a deterministic per-voxel colour jitter (the hand-placed voxel texture)
 *   • geometry groups per material kind → 1 draw call per bucket
 *     (matte / metal / glow / glass), typically 2–4 calls per object.
 *
 * Vertices are de-indexed per quad so every face carries a flat normal without
 * any smoothing-group bookkeeping, which keeps the buffer cache friendly.
 */
import * as THREE from 'three';
import { MAT, MAT_NAMES } from '../core/palette.js';

/* Render order: opaque first, transmissive last. */
export const KIND_SLOTS = ['matte', 'metal', 'glow', 'glass'];
const SLOT_OF = new Map(KIND_SLOTS.map((k, i) => [k, i]));

/* ---- face tables -------------------------------------------------- *
 * corners are CCW when the face is viewed from outside the voxel.
 * AO neighbours are computed from the corner geometry (see aoOffsets).
 * ------------------------------------------------------------------- */
const FACES = [
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/**
 * For each corner of a face, return the [sideA, sideB, cornerCell] offsets
 * (relative to the voxel) used for occlusion.
 *
 * On the two axes perpendicular to the normal, a corner sits either on the
 * low edge (offset 0 → neighbour direction -1) or the high edge (offset 1 →
 * +1). Those two tangent directions plus the face direction fully determine
 * the three cells that can darken this corner.
 */
const AO_TABLE = FACES.map((face) => {
  const normalAxis = face.n.findIndex((v) => v !== 0);
  const tangents = [0, 1, 2].filter((a) => a !== normalAxis);
  return face.corners.map((corner) => {
    const sA = corner[tangents[0]] === 0 ? -1 : 1;
    const sB = corner[tangents[1]] === 0 ? -1 : 1;
    const base = [...face.n];
    const sideA = [...base];
    sideA[tangents[0]] += sA;
    const sideB = [...base];
    sideB[tangents[1]] += sB;
    const both = [...sideA];
    both[tangents[1]] += sB;
    return [sideA, sideB, both];
  });
});

/* ---- colour helpers ------------------------------------------------ */
const _c = new THREE.Color();

/** Pre-resolve every palette entry into a linear-ish RGB triple. */
const PALETTE_RGB = new Map(
  MAT_NAMES.map((name) => {
    const { c, k } = MAT[name];
    _c.setHex(c, THREE.SRGBColorSpace);
    return [name, [_c.r, _c.g, _c.b, k]];
  }),
);

function hash3f(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Soft AO ramp — deliberately gentle so the world never looks dirty. */
const AO_RAMP = [0.56, 0.72, 0.88, 1.0];

/**
 * @param {import('./VoxelCanvas').VoxelCanvas} canvas
 * @param {object}  [opts]
 * @param {number}  [opts.aoStrength=1]  0 disables baked occlusion
 * @param {number}  [opts.jitter=0.055]  per-voxel colour variation
 * @param {[number,number,number]} [opts.offset=[0,0,0]] world-space shift
 * @param {boolean}[opts.center=false]  re-origin the result at its centre
 * @param {number}  [opts.glowBoost=1.6] emissive voxels resist occlusion
 */
export function meshVoxels(canvas, opts = {}) {
  const {
    aoStrength = 1,
    jitter = 0.055,
    offset = [0, 0, 0],
    center = false,
    glowBoost = 1.6,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
  } = opts;

  const vx = canvas.voxels;
  if (vx.size === 0) return emptyVoxelGeometry();

  const has = (x, y, z) =>
    vx.has(((x + 512) & 1023) | (((y + 512) & 1023) << 10) | (((z + 512) & 1023) << 20));

  const loX = minX ?? canvas.min[0], loY = minY ?? canvas.min[1], loZ = minZ ?? canvas.min[2];
  const hiX = maxX ?? canvas.max[0], hiY = maxY ?? canvas.max[1], hiZ = maxZ ?? canvas.max[2];

  const baseX = offset[0] - (center ? (canvas.min[0] + canvas.max[0]) / 2 : 0);
  const baseY = offset[1] - (center ? (canvas.min[1] + canvas.max[1]) / 2 : 0);
  const baseZ = offset[2] - (center ? (canvas.min[2] + canvas.max[2]) / 2 : 0);

  // one bucket per material kind → contiguous groups, minimal draw calls
  const buckets = KIND_SLOTS.map(() => ({ pos: [], nrm: [], col: [], idx: [], count: 0 }));

  for (let x = loX; x <= hiX; x++) {
    for (let y = loY; y <= hiY; y++) {
      for (let z = loZ; z <= hiZ; z++) {
        const mat = canvas.get(x, y, z);
        if (mat === undefined) continue;

        const pal = PALETTE_RGB.get(mat);
        if (!pal) continue;
        const bucket = buckets[SLOT_OF.get(pal[3]) ?? 0];
        const isGlow = pal[3] === 'glow';

        // deterministic colour variation: fine per-voxel + coarse per-2³ block
        const fine = hash3f(x, y, z);
        const coarse = hash3f(x >> 2, y >> 2, z >> 2);
        const tone = (1 + (fine - 0.5) * 2 * jitter) * (1 + (coarse - 0.5) * 0.055);
        const cr = pal[0] * tone;
        const cg = pal[1] * tone;
        const cb = pal[2] * tone;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const n = face.n;
          if (has(x + n[0], y + n[1], z + n[2])) continue; // hidden → cull

          const start = bucket.count;

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            const px = x + corner[0] + baseX;
            const py = y + corner[1] + baseY;
            const pz = z + corner[2] + baseZ;

            let shade = 1;
            if (aoStrength > 0) {
              const o = AO_TABLE[f][c];
              const sA = has(x + o[0][0], y + o[0][1], z + o[0][2]) ? 1 : 0;
              const sB = has(x + o[1][0], y + o[1][1], z + o[1][2]) ? 1 : 0;
              const co = has(x + o[2][0], y + o[2][1], z + o[2][2]) ? 1 : 0;
              // two perpendicular sides fully blocked → darkest step
              const level = sA && sB ? 0 : 3 - (sA + sB + co);
              shade = 1 + (AO_RAMP[level] - 1) * aoStrength;
              if (isGlow) shade = 1 + (shade - 1) / glowBoost; // lamps read from inside
            }

            bucket.pos.push(px, py, pz);
            bucket.nrm.push(n[0], n[1], n[2]);
            bucket.col.push(cr * shade, cg * shade, cb * shade);
            bucket.count++;
          }

          // AO-aware triangulation: choose the diagonal that runs along the
          // smoother luminance gradient, so strongly occluded corners do not
          // produce the classic voxel "tear" artefact.
          const l0 = lum(bucket.col, start);
          const l1 = lum(bucket.col, start + 1);
          const l2 = lum(bucket.col, start + 2);
          const l3 = lum(bucket.col, start + 3);
          if (l0 + l2 > l1 + l3) {
            bucket.idx.push(start, start + 1, start + 3, start + 1, start + 2, start + 3);
          } else {
            bucket.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
          }
        }
      }
    }
  }

  let totalVerts = 0;
  let totalIdx = 0;
  for (const b of buckets) {
    totalVerts += b.count;
    totalIdx += b.idx.length;
  }
  if (totalVerts === 0) return emptyVoxelGeometry();

  const position = new Float32Array(totalVerts * 3);
  const normal = new Float32Array(totalVerts * 3);
  const color = new Float32Array(totalVerts * 3);
  const index = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  const geo = new THREE.BufferGeometry();
  let vOff = 0;
  let iOff = 0;

  for (let s = 0; s < buckets.length; s++) {
    const b = buckets[s];
    if (b.count === 0) continue;
    position.set(b.pos, vOff * 3);
    normal.set(b.nrm, vOff * 3);
    color.set(b.col, vOff * 3);
    for (let i = 0; i < b.idx.length; i++) index[iOff + i] = b.idx[i] + vOff;
    geo.addGroup(iOff, b.idx.length, s);
    vOff += b.count;
    iOff += b.idx.length;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function lum(arr, i) {
  return arr[i * 3] * 0.299 + arr[i * 3 + 1] * 0.587 + arr[i * 3 + 2] * 0.114;
}

export function emptyVoxelGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
  return g;
}

export default meshVoxels;