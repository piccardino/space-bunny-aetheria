import { performance } from 'node:perf_hooks';
import { buildWorld } from '../src/world/buildWorld.js';
import { meshVoxels } from '../src/voxel/mesher.js';
import { MAT } from '../src/core/palette.js';
import { LOCATIONS, locationOrigin } from '../src/world/locations/registry.js';

let failures = 0;
const fail = (m) => { console.error('  x ' + m); failures++; };
const ok = (m) => console.log('  . ' + m);

console.log('\nAETHERIA - full world build\n');

const t0 = performance.now();
const w = buildWorld({ vegetationDensity: 1 });
const total = performance.now() - t0;

console.log(`  built in ${total.toFixed(0)} ms`);
console.log(`  terrain ${w.stats.terrainVoxels.toLocaleString()}  under ${w.stats.underVoxels.toLocaleString()}  ` +
  `flora ${w.stats.floraVoxels.toLocaleString()}  buildings ${w.stats.buildingVoxels.toLocaleString()}`);

// every canvas must use only known materials
const canvases = {
  terrain: w.terrain,
  underisland: w.under,
  flora: w.flora,
  airships: w.airships,
  ...Object.fromEntries(Object.entries(w.buildings).map(([k, b]) => [k, b.canvas])),
};
for (const [name, c] of Object.entries(canvases)) {
  const bad = new Set();
  for (const m of c.voxels.values()) if (!Object.hasOwn(MAT, m)) bad.add(m);
  if (bad.size) fail(`${name}: unknown materials -> ${[...bad].join(', ')}`);
  if (c.size === 0) fail(`${name}: empty canvas`);
}

// meshing + triangle budget
let tris = 0;
for (const [name, c] of Object.entries(canvases)) {
  const g = meshVoxels(c);
  if (!g.getAttribute('position') || g.getAttribute('position').count === 0) fail(`${name}: no geometry`);
  const t = g.getIndex().count / 3;
  tris += t;
  console.log(`  ${name.padEnd(13)} ${String(c.size).padStart(7)} voxels  ${String(t).padStart(7)} tris`);
}
console.log(`  ${'TOTAL'.padEnd(13)} ${' '.repeat(7)}         ${String(tris).padStart(7)} tris`);

if (tris > 900000) fail(`triangle budget exceeded: ${tris}`);
else ok(`within budget (${tris.toLocaleString()} tris)`);

// animated handles must be present
for (const [id, b] of Object.entries(w.buildings)) {
  if (!b.anim || Object.keys(b.anim).length === 0) fail(`${id}: no anim handles`);
}
ok(`${Object.keys(w.buildings).length} buildings carry anim handles`);

for (const key of ['propellers', 'turbines', 'reactors', 'chains', 'vents']) {
  if (!w.underAnim[key]?.length) fail(`underisland: no "${key}"`);
}
console.log(`  underisland anim: propellers ${w.underAnim.propellers.length}, turbines ${w.underAnim.turbines.length}, ` +
  `reactors ${w.underAnim.reactors.length}, chains ${w.underAnim.chains.length}, vents ${w.underAnim.vents.length}`);

if (w.trees.length < 10) fail(`too few trees: ${w.trees.length}`);
else ok(`${w.trees.length} trees, ${w.eggs.length} easter eggs`);

/* ------------------------------------------------------------------ *
 * PLACEMENT CONVENTION
 *
 * Models are authored in model space; the scene group carries them into the
 * world at `locationOrigin(loc)`. Assert the result of that composition for
 * every building, because the failure mode is silent and severe: a building
 * offset from its own plateau still renders, it just renders in the wrong
 * place (historically all eight stacked at the island centre, rotated but
 * not translated, while their outlines sat correctly on the plateaus).
 *
 * Deliberately NOT asserted: exact bounding-box symmetry (yard dressing,
 * chimneys and cantilevered legs legitimately push the box off-centre) or a
 * non-negative base (the dock's legs are *meant* to hang into the void).
 * What must hold is that each building touches its plateau at y=0 and that
 * no two buildings share ground.
 * ------------------------------------------------------------------ */
console.log('\n  placement:');
{
  let bad = 0;
  for (const loc of LOCATIONS) {
    const b = w.buildings[loc.id];
    if (!b) { fail(`${loc.id}: no building canvas`); bad++; continue; }
    const c = b.canvas;
    const [ox, oy, oz] = locationOrigin(loc);

    // the plateau under the origin must be exactly as high as the origin,
    // otherwise the building floats above or sinks into its own pad
    const ground = w.heightAt(ox, oz);
    if (ground !== oy) {
      fail(`${loc.id}: terrain under the origin is ${ground} but origin.y is ${oy}`);
      bad++;
    }

    // the model must actually reach y = 0, i.e. stand ON the plateau
    let touchesGround = false;
    for (let x = c.min[0]; x <= c.max[0] && !touchesGround; x++)
      for (let z = c.min[2]; z <= c.max[2] && !touchesGround; z++)
        if (c.has(x, 0, z)) touchesGround = true;
    if (!touchesGround) {
      fail(`${loc.id}: no voxel at y=0 — the building does not meet its plateau`);
      bad++;
    }

    console.log(
      `    ${loc.id.padEnd(13)} origin[${String(ox).padStart(4)},${String(oy).padStart(3)},${String(oz).padStart(4)}]` +
      `  terrain=${ground}  voxels y[${c.min[1]},${c.max[1]}]  pad r=${loc.pad?.r ?? 10}`,
    );
  }
  if (!bad) ok('every building meets its own plateau at the right height');
}

// Plateaus must not fight for the same ground. Two overlapping pads at the SAME
// height simply merge into one plateau and are harmless (and often intended —
// a shared courtyard). Pads at DIFFERENT heights cannot overlap: the height
// field only blends toward whichever wins, so one building ends up buried in
// or floating above the other's pad.
{
  let clashes = 0;
  let merged = 0;
  for (let i = 0; i < LOCATIONS.length; i++) {
    for (let j = i + 1; j < LOCATIONS.length; j++) {
      const a = LOCATIONS[i], b = LOCATIONS[j];
      const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
      const need = (a.pad?.r ?? 10) + (b.pad?.r ?? 10);
      if (d >= need) continue;
      const ay = a.pad?.y ?? 0, by = b.pad?.y ?? 0;
      if (ay === by) { merged++; continue; }
      fail(
        `${a.id}(y=${ay}) and ${b.id}(y=${by}): different-height pads overlap by ` +
        `${(need - d).toFixed(1)} units — one building will sit at the wrong height`,
      );
      clashes++;
    }
  }
  if (!clashes) ok(
    `no conflicting plateaus${merged ? ` (${merged} same-height pad pair${merged > 1 ? 's' : ''} merge by design)` : ''}`,
  );
}

// determinism
console.log('');
process.exit(failures ? 1 : 0);