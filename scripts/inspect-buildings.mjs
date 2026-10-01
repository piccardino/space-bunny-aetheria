/** Dump each building canvas's LOCAL bounds, to check model origin assumptions. */
import { buildWorld } from '../src/world/buildWorld.js';
import { LOCATIONS } from '../src/world/locations/registry.js';

const w = buildWorld();
console.log('location'.padEnd(14), 'registry pos'.padEnd(16), 'padY', ' local min..max (model space)');
for (const l of LOCATIONS) {
  const b = w.buildings[l.id];
  if (!b) { console.log(l.id, 'MISSING'); continue; }
  const c = b.canvas;
  console.log(
    l.id.padEnd(14),
    JSON.stringify(l.position).padEnd(16),
    String(l.pad?.y ?? 0).padEnd(4),
    `  x[${c.min[0]},${c.max[0]}] y[${c.min[1]},${c.max[1]}] z[${c.min[2]},${c.max[2]}]`,
    ` voxels=${c.size}`,
  );
}
console.log('\nterrain height at each pad (registry y):');
for (const l of LOCATIONS) {
  console.log(' ', l.id.padEnd(14), 'padY=', l.pad?.y ?? 0, ' heightAt=', w.heightAt(l.position[0], l.position[2]));
}
