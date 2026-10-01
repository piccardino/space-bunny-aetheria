/**
 * Generates the .glb assets used by the `{ type: 'model' }` page blocks.
 *
 * Written by hand as raw glTF 2.0 + a binary chunk — no export pipeline, no DCC,
 * no extra dependency. The models are built from a voxel grid, which keeps them
 * on-style: everything in Aetheria is made of cubes.
 *
 *   node scripts/make-models.mjs     ->   public/models/*.glb
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');

/* ------------------------------------------------------------------ */
/* A tiny voxel emitter: every occupied cell becomes a full cube, so the
   inner faces of holes and gaps come for free.                          */
/* ------------------------------------------------------------------ */
class VoxelMesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.idx = [];
  }

  /** Axis-aligned cube. `size` is the full edge length. */
  box(cx, cy, cz, size) {
    const h = size / 2;
    const x0 = cx - h, x1 = cx + h;
    const y0 = cy - h, y1 = cy + h;
    const z0 = cz - h, z1 = cz + h;

    // [normal, four corners in CCW winding seen from outside]
    const faces = [
      [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
      [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    ];

    for (const [n, ...c] of faces) {
      const base = this.pos.length / 3;
      for (const p of c) {
        this.pos.push(p[0], p[1], p[2]);
        this.nrm.push(n[0], n[1], n[2]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Merge another mesh in, offsetting its indices and optionally its Z. */
  merge(other, dz = 0) {
    const off = this.pos.length / 3;
    for (let i = 0; i < other.pos.length; i += 3) {
      this.pos.push(other.pos[i], other.pos[i + 1], other.pos[i + 2] + dz);
      this.nrm.push(other.nrm[i], other.nrm[i + 1], other.nrm[i + 2]);
    }
    for (const i of other.idx) this.idx.push(i + off);
  }
}

/**
 * Reads an occupancy grid and extrudes every set cell into a cube, stacked
 * `depth` slices deep. `test(col, row)` receives integer grid coordinates.
 */
function extrude(mesh, cols, rows, cell, depth, test) {
  for (let d = 0; d < depth; d++) {
    const z = (d - (depth - 1) / 2) * cell;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!test(c, r)) continue;
        const x = (c - (cols - 1) / 2) * cell;
        const y = (r - (rows - 1) / 2) * cell;
        mesh.box(x, y, z, cell * 1.001); // slight overlap kills seams
      }
    }
  }
}
/* ------------------------------------------------------------------ */
/* GLB packing                                                          */
/* ------------------------------------------------------------------ */
function buildGLB(mesh, { name, color, metallic, roughness, rotateX = 0 }) {
  const pos = new Float32Array(mesh.pos);
  const nrm = new Float32Array(mesh.nrm);
  const idx = new Uint32Array(mesh.idx);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }

  // pack positions, normals, indices — each bufferView 4-byte aligned
  const parts = [
    { bytes: Buffer.from(pos.buffer), target: 34962 },
    { bytes: Buffer.from(nrm.buffer), target: 34962 },
    { bytes: Buffer.from(idx.buffer), target: 34963 },
  ];
  let offset = 0;
  const bufferViews = parts.map((p) => {
    const bv = { buffer: 0, byteOffset: offset, byteLength: p.bytes.length, target: p.target };
    offset = (offset + p.bytes.length + 3) & ~3;
    return bv;
  });
  const bin = Buffer.concat(parts.map((p) => {
    const pad = (4 - (p.bytes.length % 4)) % 4;
    return Buffer.concat([p.bytes, Buffer.alloc(pad)]);
  }));

  const node = { mesh: 0, name };
  if (rotateX) {
    // stand the flat grid upright so it faces the camera
    node.rotation = [Math.sin(rotateX / 2), 0, 0, Math.cos(rotateX / 2)];
  }

  const gltf = {
    asset: { version: '2.0', generator: 'aetheria scripts/make-models.mjs' },
    scene: 0,
    scenes: [{ nodes: [0], name }],
    nodes: [node],
    meshes: [{
      name,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
    }],
    materials: [{
      name: 'brass',
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  let jsonStr = JSON.stringify(gltf);
  while (jsonStr.length % 4 !== 0) jsonStr += ' '; // pad JSON with spaces
  const json = Buffer.from(jsonStr, 'utf8');
  const binPad = (4 - (bin.length % 4)) % 4;
  const binFull = Buffer.concat([bin, Buffer.alloc(binPad)]);

  const total = 12 + 8 + json.length + 8 + binFull.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(json.length, 12);
  out.write('JSON', 16, 'ascii');
  json.copy(out, 20);
  const bh = 20 + json.length;
  out.writeUInt32LE(binFull.length, bh);
  out.write('BIN\0', bh + 4, 'ascii');
  binFull.copy(out, bh + 8);

  return { out, verts: pos.length / 3, tris: idx.length / 3 };
}
/* ------------------------------------------------------------------ */
/* The two models                                                       */
/* ------------------------------------------------------------------ */

/** A 12-tooth cog with a hub, a rim, spokes and teeth. */
function gearGrid(teeth) {
  const cols = 31;
  const mid = (cols - 1) / 2;
  const R = 13.5;
  const TAU = Math.PI * 2;
  return (col, row) => {
    const dx = col - mid;
    const dy = row - mid;
    const r = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    if (r <= 3.8) return true;                 // hub
    if (r >= R - 3.2 && r <= R) return true;   // rim
    const t = ((ang + TAU) % TAU) / TAU;
    if (t * teeth % 1 < 0.46 && r > R - 0.2 && r <= R + 2.6) return true; // teeth
    if (t * 6 % 1 < 0.17 && r > 3.8 && r < R - 3.2) return true;        // spokes
    return false;
  };
}

/** A thick nut: a round ring with a hexagonal bore. */
function nutGrid() {
  const cols = 25;
  const mid = (cols - 1) / 2;
  const TAU = Math.PI / 3;
  return (col, row) => {
    const dx = col - mid;
    const dy = row - mid;
    const r = Math.hypot(dx, dy);
    if (r > 10.5 || r < 5) return false;
    const ang = Math.atan2(dy, dx);
    const hex = 6.3 / Math.cos(((ang + Math.PI / 6) % TAU) - Math.PI / 6);
    return r > hex;
  };
}

await mkdir(OUT, { recursive: true });

const models = [
  {
    file: 'aether-cog.glb',
    name: 'Aether Cog',
    make: () => {
      const m = new VoxelMesh();
      extrude(m, 31, 31, 0.22, 2, gearGrid(12));
      return m;
    },
    color: [0.85, 0.62, 0.26, 1],
    metallic: 0.25,
    roughness: 0.45,
  },
  {
    file: 'brass-nut.glb',
    name: 'Brass Nut',
    make: () => {
      const m = new VoxelMesh();
      extrude(m, 25, 25, 0.26, 3, nutGrid());
      return m;
    },
    color: [0.78, 0.55, 0.3, 1],
    metallic: 0.25,
    roughness: 0.4,
  },
];

for (const spec of models) {
  const { out, verts, tris } = buildGLB(spec.make(), spec);
  await writeFile(join(OUT, spec.file), out);
  console.log(`  ${spec.file}  ${(out.length / 1024).toFixed(1)} kB  ${verts} verts  ${tris} tris`);
}
console.log('\nmodels written to public/models/');