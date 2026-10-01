/**
 * SEE-THROUGH TEST — finds empty spaces you can actually LOOK through.
 * --------------------------------------------------------------
 *   node scripts/audit-see-through.mjs            (all buildings)
 *   node scripts/audit-see-through.mjs clocktower  (one)
 *
 * The gap audit (audit-gaps.mjs) counts empty cells trapped inside the solid.
 * Most of those are just the interior of a hollow building and are harmless.
 *
 * What a player actually calls an "empty space" is different: a HOLE, i.e. a
 * gap that a ray can travel through and out the other side of a wall, roof or
 * hull. So for each of the 6 axis directions this casts rays across the whole
 * model and reports the ones that pass through a MIN_RUN-wide empty gap while
 * solid material sits on both sides of it. That is a see-through hole.
 *
 *   direction  axis  what it shows
 *   +X / -X    X     holes in the east/west walls
 *   +Y / -Y    Y     holes in roofs and floors
 *   +Z / -Z    Z     holes in the north/south walls
 */
import { BUILDERS } from '../src/world/buildWorld.js';
import VoxelCanvas from '../src/voxel/VoxelCanvas.js';
import { buildAirship, buildScoutAirship } from '../src/world/locations/models/airship.js';

const MIN_RUN = 3;   // a gap must be at least this wide to be worth fixing
const MIN_SOLID = 2;  // ...with at least this much wall on either side

/**
 * Cast rays along one axis and return every see-through run found.
 * @param {'x'|'y'|'z'} axis
 * @param {1|-1} sign  which way the ray travels
 */
function raysAlong(v, axis, sign) {
  const [minX, minY, minZ] = v.min;
  const [maxX, maxY, maxZ] = v.max;
  const idx = [0, 1, 2].map((a) => (a === 0 ? [minX, maxX] : a === 1 ? [minY, maxY] : [minZ, maxZ]));
  const a = 'xyz'.indexOf(axis);

  // the two axes that form the ray's cross-section
  const u = (a + 1) % 3, w = (a + 2) % 3;

  const from = sign > 0 ? idx[a][0] : idx[a][1];
  const to = sign > 0 ? idx[a][1] : idx[a][0];

  const at = (p, q, r) => {
    const c = [0, 0, 0];
    c[a] = p; c[u] = q; c[w] = r;
    return v.has(c[0], c[1], c[2]);
  };

  const holes = [];
  for (let q = idx[u][0]; q <= idx[u][1]; q++) {
    for (let r = idx[w][0]; r <= idx[w][1]; r++) {
      const line = [];
      for (let p = from; sign > 0 ? p <= to : p >= to; p += sign) line.push(at(p, q, r) ? 1 : 0);

      // find runs of empty cells that have solid wall on both sides
      let i = 0;
      while (i < line.length) {
        if (line[i] === 1) { i++; continue; }
        let j = i;
        while (j < line.length && line[j] === 0) j++;
        const runLen = j - i;
        const before = i, after = line.length - j;
        if (runLen >= MIN_RUN && before >= MIN_SOLID && after >= MIN_SOLID) {
          const p0 = from + i * sign;
          holes.push({
            axis, sign, q, r,
            start: p0, runLen,
            coord: axis === 'x' ? [p0, q, r] : axis === 'y' ? [q, p0, r] : [q, r, p0],
          });
        }
        i = j;
      }
    }
  }
  return holes;
}

const targets = [...Object.entries(BUILDERS)];
if (!process.argv[2] || process.argv[2] === 'airships') {
  targets.push(['airships', (v) => {
    buildAirship(v, { len: 34, r: 7 });
    buildScoutAirship(v, { len: 15, r: 3 });
    buildScoutAirship(v, { len: 15, r: 3 });
  }]);
}
const only = process.argv[2];

const DIRS = [
  ['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1],
];
const NAME = { 'x1': '+X wall', 'x-1': '-X wall', 'y1': 'roof (+Y)', 'y-1': 'floor (-Y)', 'z1': '+Z wall', 'z-1': '-Z wall' };

console.log(`see-through holes (gap >= ${MIN_RUN} cells, wall >= ${MIN_SOLID} on both sides)\n`);
let grand = 0;
for (const [id, fn] of targets) {
  if (only && id !== only) continue;
  const v = new VoxelCanvas(id);
  fn(v);
  const per = {};
  let total = 0;
  for (const [axis, sign] of DIRS) {
    const h = raysAlong(v, axis, sign);
    per[`${axis}${sign}`] = h;
    total += h.length;
  }
  grand += total;
  const worst = Object.entries(per)
    .filter(([, h]) => h.length)
    .sort((a, b) => b[1].length - a[1].length);
  console.log(`${id.padEnd(14)} ${String(total).padStart(5)} holes   ` +
    (worst.length ? worst.map(([k, h]) => `${NAME[k]}:${h.length}`).join('  ') : 'none'));
}

console.log(`\ntotal: ${grand}`);
console.log('\n-- worst runs per model (the biggest holes, where to look first) --');
for (const [id, fn] of targets) {
  if (only && id !== only) continue;
  const v = new VoxelCanvas(id);
  fn(v);
  const all = [];
  for (const [axis, sign] of DIRS) for (const h of raysAlong(v, axis, sign)) all.push(h);
  if (!all.length) continue;
  all.sort((a, b) => b.runLen - a.runLen);
  console.log(`\n${id}:`);
  for (const h of all.slice(0, 8))
    console.log(`  ${NAME[`${h.axis}${h.sign}`].padEnd(10)} run ${String(h.runLen).padStart(3)}  at ${h.coord.join(',')}`);
}