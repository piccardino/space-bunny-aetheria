/**
 * THE WORLD BUILDER
 * -----------------
 * One deterministic call that produces every voxel canvas the scene needs.
 * Runs once, off the render loop, and is memoised at module level so React
 * StrictMode double-mounts don't rebuild the island.
 *
 * Everything downstream (Island, Underisland, Locations, Vegetation) just reads
 * the result, which keeps the scene tree declarative and the data flow obvious.
 */
import VoxelCanvas from '../voxel/VoxelCanvas.js';
import { makeHeightField, buildTerrain } from './terrain.js';
import { buildUnderisland } from './underisland.js';
import { scatterVegetation, buildEasterEggs, paintEasterEggs } from './vegetation.js';
import { PADS } from './locations/registry.js';
import { WORLD } from './config.js';

import { buildClockTower } from './locations/models/clocktower.js';
import { buildWorkshop } from './locations/models/workshop.js';
import { buildAirshipDock } from './locations/models/airshipdock.js';
import { buildObservatory } from './locations/models/observatory.js';
import { buildLibrary } from './locations/models/library.js';
import { buildLaboratory } from './locations/models/laboratory.js';
import { buildEnergyTower } from './locations/models/energytower.js';
import { buildPortal } from './locations/models/portal.js';
import { buildAirship, buildScoutAirship } from './locations/models/airship.js';

export const BUILDERS = {
  clocktower: buildClockTower,
  workshop: buildWorkshop,
  airshipdock: buildAirshipDock,
  observatory: buildObservatory,
  library: buildLibrary,
  laboratory: buildLaboratory,
  energytower: buildEnergyTower,
  portal: buildPortal,
};

/** Extra standalone props not tied to a location. */
function buildAirshipProps() {
  const v = new VoxelCanvas('airships');
  buildAirship(v, { len: 34, r: 7 });
  buildScoutAirship(v, { len: 15, r: 3 });
  buildScoutAirship(v, { len: 15, r: 3 });
  return v;
}

let cache = null;

/**
 * @param {{ vegetationDensity?: number, includeBuildings?: boolean }} [opts]
 */
export function buildWorld(opts = {}) {
  if (cache) return cache;
  const { vegetationDensity = 1, includeBuildings = true } = opts;

  const heightAt = makeHeightField(PADS);

  const terrain = buildTerrain(heightAt);

  const underCanvas = new VoxelCanvas('underisland');
  const under = buildUnderisland(underCanvas, heightAt);

  const floraCanvas = new VoxelCanvas('flora');
  const flora = scatterVegetation(floraCanvas, heightAt, vegetationDensity);

  const eggs = buildEasterEggs(heightAt);
  paintEasterEggs(floraCanvas, eggs, heightAt);

  // each building gets its own canvas so it can be hovered / outlined alone
  const buildings = {};
  if (includeBuildings) {
    for (const [id, fn] of Object.entries(BUILDERS)) {
      const c = new VoxelCanvas(id);
      const res = fn(c);
      buildings[id] = { canvas: c, anim: res?.anim ?? {} };
    }
  }

  const airships = buildAirshipProps();

  cache = {
    heightAt,
    terrain,
    under: underCanvas,
    underAnim: under.anim,
    flora: floraCanvas,
    trees: flora.trees,
    eggs,
    buildings,
    airships,
    radius: WORLD.radius,
    stats: {
      terrainVoxels: terrain.size,
      underVoxels: underCanvas.size,
      floraVoxels: floraCanvas.size,
      buildingVoxels: Object.values(buildings).reduce((s, b) => s + b.canvas.size, 0),
    },
  };
  return cache;
}

export default buildWorld;