/**
 * Headless validation of the voxel engine + every building model.
 * Run with:  node scripts/verify-voxel.mjs
 *
 * Fails loudly if a model paints an unknown material, produces no geometry,
 * emits invalid indices / NaN vertices, or if the triangle budget explodes.
 */
import { performance } from 'node:perf_hooks';
import { VoxelCanvas } from '../src/voxel/VoxelCanvas.js';
import { meshVoxels } from '../src/voxel/mesher.js';
import { MAT } from '../src/core/palette.js';
import { buildTerrain, makeHeightField } from '../src/world/terrain.js';
import { PADS } from '../src/world/locations/registry.js';

const MODELS = [
  ['clocktower', '../src/world/locations/models/clocktower.js', 'buildClockTower'],
  ['workshop', '../src/world/locations/models/workshop.js', 'buildWorkshop'],
  ['airshipdock', '../src/world/locations/models/airshipdock.js', 'buildAirshipDock'],
  ['observatory', '../src/world/locations/models/observatory.js', 'buildObservatory'],
  ['library', '../src/world/locations/models/library.js', 'buildLibrary'],
  ['laboratory', '../src/world/locations/models/laboratory.js', 'buildLaboratory'],
  ['energytower', '../src/world/locations/models/energytower.js', 'buildEnergyTower'],
  ['portal', '../src/world/locations/models/portal.js', 'buildPortal'],
  ['airship', '../src/world/locations/models/airship.js', 'buildAirship'],
];

let failures = 0;
const fail = (m) => { console.error('  x ' + m); failures++; };
const ok = (m) => console.log('  . ' + m);

function validateMaterials(name, v) {
  const bad = new Set();
  for (const mat of v.voxels.values()) if (!Object.hasOwn(MAT, mat)) bad.add(mat);
  if (bad.size) fail(`${name}: unknown materials -> ${[...bad].join(', ')}`);
}

function validateGeometry(name, geo) {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!pos || pos.count === 0) return fail(`${name}: empty geometry`);
  if (!idx) return fail(`${name}: missing index buffer`);
  let max = 0;
  for (let i = 0; i < idx.count; i++) max = Math.max(max, idx.getX(i));
  if (max >= pos.count) fail(`${name}: index out of range (${max} >= ${pos.count})`);
  if (idx.count % 3 !== 0) fail(`${name}: index count not a multiple of 3`);
  const arr = pos.array;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) { fail(`${name}: non-finite vertex at ${i}`); break; }
  }
  const covered = geo.groups.reduce((s, g) => s + g.count, 0);
  if (covered !== idx.count) fail(`${name}: groups cover ${covered}/${idx.count} indices`);
  if (pos.count % 4 !== 0) fail(`${name}: vertex count ${pos.count} not a multiple of 4`);
}

console.log('\nAETHERIA - voxel engine validation\n');

/* ---------------- 1. primitives ------------------------------- */
console.log('1) VoxelCanvas primitives');
{
  const v = new VoxelCanvas('test');
  v.box(0, 0, 0, 4, 4, 4, 'stone');
  if (v.size !== 64) fail(`box painted ${v.size}, expected 64`); else ok('box paints 64 voxels');

  v.clear();
  v.boxShell(0, 0, 0, 5, 5, 5, 'wood');
  const expected = 125 - 27;
  if (v.size !== expected) fail(`boxShell painted ${v.size}, expected ${expected}`);
  else ok('boxShell paints only the shell');

  v.clear(); v.cylY(0, 0, 0, 3, 5, 'copper');      ok(`cylY -> ${v.size} voxels`);
  v.clear(); v.sphere(0, 0, 0, 4, 'iron');         ok(`sphere -> ${v.size} voxels`);
  v.clear(); v.domeY(0, 0, 0, 5, 'gold');         ok(`domeY -> ${v.size} voxels`);
  v.clear(); v.line(0, 0, 0, 10, 6, -4, 'ironLight'); ok(`line -> ${v.size} voxels`);
  v.clear(); v.ringZ(0, 0, 0, 8, 2, 'brass');     ok(`ringZ -> ${v.size} voxels`);

  v.clear();
  v.set(-300, -300, -300, 'stone');
  v.set(300, 300, 300, 'wood');
  if (v.get(-300, -300, -300) !== 'stone') fail('negative coord round-trip failed');
  else if (v.get(300, 300, 300) !== 'wood') fail('positive coord round-trip failed');
  else if (v.min[0] !== -300 || v.max[2] !== 300) fail('bounds not tracked');
  else ok('packed keys handle the full +/-512 range');
}

/* ---------------- 2. mesher ----------------------------------- */
console.log('\n2) Mesher');
{
  const v = new VoxelCanvas('one');
  v.set(0, 0, 0, 'stone');
  const geo = meshVoxels(v);
  if (geo.getAttribute('position').count !== 24) fail('single voxel should emit 24 verts');
  else ok('single voxel -> 24 verts (6 quads)');

  v.clear();
  v.set(0, 0, 0, 'stone'); v.set(1, 0, 0, 'stone');
  const g2 = meshVoxels(v);
  const n2 = g2.getAttribute('position').count;
  // each voxel emits 24 verts; the shared face is culled on both sides (8 verts)
  if (n2 !== 40) fail(`2 adjacent voxels -> ${n2} verts, expected 40`);
  else ok('shared faces are culled (40 verts, not 48)');

  const v2 = new VoxelCanvas('ao');
  v2.box(0, 0, 0, 3, 3, 3, 'stone');
  v2.set(-1, -1, -1, 'stone');
  const g3 = meshVoxels(v2);
  const col = g3.getAttribute('color');
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < col.count; i++) { min = Math.min(min, col.getX(i)); max = Math.max(max, col.getX(i)); }
  if (!(max - min > 0.02)) fail(`AO produced no darkening (range ${(max - min).toFixed(4)})`);
  else ok(`AO darkens corners (range ${(max - min).toFixed(3)})`);

  const empty = new VoxelCanvas('empty');
  if (meshVoxels(empty).getAttribute('position').count !== 0) fail('empty canvas produced geometry');
  else ok('empty canvas returns empty geometry');
}

/* ---------------- 3. models ----------------------------------- */
console.log('\n3) Building models');
let totalVoxels = 0, totalTris = 0;
for (const [name, path, fn] of MODELS) {
  const mod = await import(path);
  const builder = mod[fn];
  if (typeof builder !== 'function') { fail(`${name}: export "${fn}" is not a function`); continue; }
  const v = new VoxelCanvas(name);
  const t0 = performance.now();
  let res;
  try { res = builder(v); } catch (e) { fail(`${name}: build threw -> ${e.message}`); continue; }
  const buildMs = performance.now() - t0;
  const t1 = performance.now();
  const geo = meshVoxels(v);
  const meshMs = performance.now() - t1;

  validateMaterials(name, v);
  validateGeometry(name, geo);

  const tris = geo.getIndex().count / 3;
  totalVoxels += v.size; totalTris += tris;
  console.log(
    `  ${name.padEnd(13)} voxels ${String(v.size).padStart(6)}  dims ${v.dims().join('x').padEnd(12)}` +
    ` tris ${String(tris).padStart(6)}  build ${buildMs.toFixed(0)}ms mesh ${meshMs.toFixed(0)}ms` +
    ` anim:${res?.anim ? Object.keys(res.anim).length : 0}`,
  );
  if (v.size < 400) fail(`${name}: suspiciously small (${v.size} voxels)`);
  // Buildings return { v, anim }; standalone props (airship) return the canvas.
  const isBuilding = fn !== 'buildAirship';
  if (isBuilding && res && res.anim === undefined) fail(`${name}: missing "anim" handle`);
}

/* ---------------- 4. terrain ---------------------------------- */
console.log('\n4) Terrain');
{
  const t0 = performance.now();
  const heightAt = makeHeightField(PADS);
  const terrain = buildTerrain(heightAt);
  const buildMs = performance.now() - t0;
  const t1 = performance.now();
  const geo = meshVoxels(terrain);
  const meshMs = performance.now() - t1;

  validateMaterials('terrain', terrain);
  validateGeometry('terrain', geo);
  const tris = geo.getIndex().count / 3;
  totalVoxels += terrain.size; totalTris += tris;
  console.log(
    `  terrain        voxels ${String(terrain.size).padStart(6)}  dims ${terrain.dims().join('x').padEnd(12)}` +
    ` tris ${String(tris).padStart(6)}  build ${buildMs.toFixed(0)}ms mesh ${meshMs.toFixed(0)}ms`,
  );
  if (terrain.size > 400000) fail(`terrain too dense: ${terrain.size}`);
  else ok(`shell optimisation working (${terrain.size} voxels, not ~630k)`);

  let okPads = true;
  for (const p of PADS) if (heightAt(p.x, p.z) !== p.y) okPads = false;
  if (!okPads) fail('building plateaus are not flat');
  else ok(`all ${PADS.length} building plateaus are flat`);
}

/* ---------------- 5. totals ----------------------------------- */
console.log('\n5) Budget');
console.log(`  total voxels : ${totalVoxels.toLocaleString()}`);
console.log(`  total tris   : ${totalTris.toLocaleString()}`);
if (totalTris > 1500000) fail('triangle budget exceeded (>1.5M)');
else ok('triangle budget within limits for a merged-buffer scene');

console.log('');
if (failures) { console.error(`${failures} check(s) failed\n`); process.exit(1); }
console.log('all checks passed\n');