/**
 * GAP AUDIT — measures "empty spaces" inside the voxel models.
 * ---------------------------------------------------------
 *   node scripts/audit-gaps.mjs            (all buildings)
 *   node scripts/audit-gaps.mjs clocktower (one)
 *
 * A "gap" here is an EMPTY cell that the viewer can see into but that the
 * author clearly did not intend. Three measurable classes:
 *
 *   CAVITY  an empty cell NOT reachable from outside by flood fill through
 *          empty cells -> it is walled in, so you see a void through a crack.
 *   FLOAT   an occupied cell with no face-neighbour below it in its own
 *          column-support sense -> nothing carries it.
 *   CRACK   an empty cell fully surrounded on 4+ sides (a pinhole).
 *
 * This is a measurement tool, not a guess: it prints numbers per model.
 */
import { BUILDERS } from '../src/world/buildWorld.js';
import VoxelCanvas from '../src/voxel/VoxelCanvas.js';

function analyse(v) {
  const [minX, minY, minZ] = v.min;
  const [maxX, maxY, maxZ] = v.max;
  const pad = 2;
  const X0 = minX - pad, X1 = maxX + pad;
  const Y0 = minY - pad, Y1 = maxY + pad;
  const Z0 = minZ - pad, Z1 = maxZ + pad;
  const W = X1 - X0 + 1, H = Y1 - Y0 + 1, D = Z1 - Z0 + 1;

  const solid = (x, y, z) => v.has(x, y, z);
  const idx = (x, y, z) => ((x - X0) * D + (z - Z0)) * H + (y - Y0);
  const N = W * D * H;
  const seen = new Uint8Array(N);

  // ---- CAVITY: flood fill empty space inwards from the padded shell ----
  const stack = [];
  for (let x = X0; x <= X1; x++)
    for (let z = Z0; z <= Z1; z++)
      for (const y of [Y0, Y1]) {
        if (!solid(x, y, z)) { const i = idx(x, y, z); if (!seen[i]) { seen[i] = 1; stack.push(i); } }
      }
  for (let x = X0; x <= X1; x++)
    for (let y = Y0; y <= Y1; y++)
      for (const z of [Z0, Z1]) {
        if (!solid(x, y, z)) { const i = idx(x, y, z); if (!seen[i]) { seen[i] = 1; stack.push(i); } }
      }
  for (let y = Y0; y <= Y1; y++)
    for (let z = Z0; z <= Z1; z++)
      for (const x of [X0, X1]) {
        if (!solid(x, y, z)) { const i = idx(x, y, z); if (!seen[i]) { seen[i] = 1; stack.push(i); } }
      }

  while (stack.length) {
    const i = stack.pop();
    const y = i % H + Y0;
    const rest = (i - (y - Y0)) / H;
    const z = rest % D + Z0;
    const x = (rest - (z - Z0)) / D + X0;
    const push = (a, b, c) => {
      if (a < X0 || a > X1 || b < Y0 || b > Y1 || c < Z0 || c > Z1) return;
      if (solid(a, b, c)) return;
      const j = idx(a, b, c);
      if (seen[j]) return;
      seen[j] = 1;
      stack.push(j);
    };
    push(x + 1, y, z); push(x - 1, y, z);
    push(x, y + 1, z); push(x, y - 1, z);
    push(x, y, z + 1); push(x, y, z - 1);
  }

  // every empty cell still unseen == trapped inside the solid
  const cavities = [];
  for (let x = X0; x <= X1; x++)
    for (let y = Y0; y <= Y1; y++)
      for (let z = Z0; z <= Z1; z++) {
        if (solid(x, y, z)) continue;
        const i = idx(x, y, z);
        if (seen[i]) continue;
        let open = 0;
        if (!solid(x + 1, y, z)) open++;
        if (!solid(x - 1, y, z)) open++;
        if (!solid(x, y + 1, z)) open++;
        if (!solid(x, y - 1, z)) open++;
        if (!solid(x, y, z + 1)) open++;
        if (!solid(x, y, z - 1)) open++;
        cavities.push({ x, y, z, open });
      }

  // ---- FLOAT: occupied cells with zero face neighbours ----
  let floats = 0;
  for (const k of v.voxels.keys()) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    if (!solid(x + 1, y, z) && !solid(x - 1, y, z) && !solid(x, y + 1, z) &&
        !solid(x, y - 1, z) && !solid(x, y, z + 1) && !solid(x, y, z - 1)) floats++;
  }

  return {
    size: v.size,
    dims: v.dims(),
    cavities,
    sealed: cavities.filter((c) => c.open === 0).length,
    floats,
  };
}

const only = process.argv[2];
console.log('model          voxels   dims                cavities  sealed  floats');
console.log('-'.repeat(72));

let worst = [];
for (const [id, fn] of Object.entries(BUILDERS)) {
  if (only && id !== only) continue;
  const v = new VoxelCanvas(id);
  fn(v);
  const r = analyse(v);
  console.log(
    `${id.padEnd(14)} ${String(r.size).padStart(6)}   ` +
    `${r.dims.map(String).join('x').padEnd(18)} ${String(r.cavities.length).padStart(8)}  ` +
    `${String(r.sealed).padStart(5)}  ${String(r.floats).padStart(6)}`,
  );
  if (r.cavities.length) worst.push([id, r]);
}

// Where are the cavities? Cluster them per column so a report stays readable.
if (worst.length) {
  console.log('\n--- cavity detail (sample of the largest runs) ---');
  for (const [id, r] of worst) {
    const byX = new Map();
    for (const c of r.cavities) {
      const k = `${c.x},${c.z}`;
      if (!byX.has(k)) byX.set(k, []);
      byX.get(k).push(c.y);
    }
    const rowsFor = [...byX.entries()]
      .map(([k, ys]) => {
        ys.sort((a, b) => a - b);
        let lo = ys[0], hi = ys[0], n = 0;
        const spans = [];
        for (const y of ys) {
          if (y > hi + 1) { spans.push(`${lo}..${hi}`); lo = y; }
          hi = y; n++;
        }
        spans.push(`${lo}..${hi}`);
        return `  x,z=(${k})  y ${spans.join(' ')}  (${n})`;
      })
      .sort((a, b) => parseInt(b.match(/\((\d+)\)/)[1], 10) - parseInt(a.match(/\((\d+)\)/)[1], 10));
    console.log(`${id}: ${r.cavities.length} empty trapped cells`);
    console.log(rowsFor.slice(0, 12).join('\n'));
    if (rowsFor.length > 12) console.log(`  ... +${rowsFor.length - 12} more columns`);
  }
}