/**
 * TERRAIN GENERATOR
 * -----------------
 * Produces the island's rock mass. The key optimisation: instead of filling a
 * solid volume (≈630k voxels) we only build the SHELL — the surface band, the
 * floor band and the full cliff wall on boundary columns. Interior volume is
 * invisible, and the mesher culls hidden faces anyway, so we get an identical
 * silhouette for ~70k voxels.
 */
import VoxelCanvas from '../voxel/VoxelCanvas.js';
import { makeRng, fbm2, clamp, smoothstep, lerp } from '../core/math.js';
import { WORLD, rawHeight, islandRadius, isInside, bottomAt } from './config.js';

/**
 * Flattens the terrain into building pads.
 * Each pad is a circular plateau; inside it the terrain snaps to `y`, with a
 * soft blend over the surrounding `blend` voxels so nothing looks chopped.
 *
 * @param {{x:number,z:number,y:number,r:number,blend?:number}[]} pads
 * @returns {(x:number,z:number)=>number}
 */
export function makeHeightField(pads = []) {
  const cache = new Map();
  const ck = (x, z) => `${x},${z}`;

  return function heightAt(x, z) {
    const key = ck(x, z);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    let h = rawHeight(x, z);

    // ---- plateau pass
    let bestW = 0;
    let target = h;
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      const blend = p.blend ?? 6;
      if (d > p.r + blend) continue;
      const w =
        d <= p.r ? 1 : 1 - smoothstep(p.r, p.r + blend, d);
      if (w > bestW) {
        bestW = w;
        target = lerp(h, p.y, w);
      }
    }
    if (bestW > 0) h = Math.round(target);

    // ---- keep a clear lip near the rim so cliffs read as cliffs
    const r = Math.hypot(x, z);
    const rim = islandRadius(x, z);
    const edgeT = clamp((rim - r) / 12, 0, 1);
    if (edgeT < 1) h = Math.round(h * (0.55 + 0.45 * edgeT));

    cache.set(key, h);
    return h;
  };
}

/**
 * Pick the surface material for a column.
 * Grass on plateaus, dry grass on slopes, bare rock on the cliffs, moss where
 * the terrain is damp and low.
 */
function surfaceMaterial(x, z, y, heightAt, rng) {
  const r = Math.hypot(x, z);
  const rim = islandRadius(x, z);
  const edgeT = clamp((rim - r) / rim, 0, 1); // 1 = centre, 0 = rim

  // exposure: how steep is the neighbourhood?
  const hx = heightAt(x + 2, z) - heightAt(x - 2, z);
  const hz = heightAt(x, z + 2) - heightAt(x, z - 2);
  const slope = Math.abs(hx) + Math.abs(hz);

  if (edgeT < 0.06 || slope > 4) return rng() < 0.35 ? 'stoneDark' : 'stone';
  if (y < -2) return rng() < 0.5 ? 'stoneDark' : 'stone';
  if (edgeT < 0.18) return rng() < 0.4 ? 'stone' : 'sand';

  const damp = fbm2(x * 0.06, z * 0.06, 3, 5501);
  if (y < 1 && damp > 0.62) return 'moss';
  if (damp > 0.72) return rng() < 0.5 ? 'grassDark' : 'moss';
  if (slope > 2) return rng() < 0.55 ? 'grassDark' : 'grass';
  return rng() < 0.22 ? 'grassDry' : rng() < 0.5 ? 'grass' : 'grassDark';
}

/**
 * Build the island rock mass.
 *
 * @param {(x:number,z:number)=>number} heightAt
 * @param {{oreDensity?:number, seed?:number}} [opts]
 * @returns {VoxelCanvas}
 */
export function buildTerrain(heightAt, opts = {}) {
  const { oreDensity = 0.035, seed = WORLD.seed } = opts;
  const rng = makeRng(seed);
  const v = new VoxelCanvas('terrain');
  const R = WORLD.radius;
  const Rceil = Math.ceil(R) + 4;

  const inside = (x, z) => isInside(x, z);

  for (let x = -Rceil; x <= Rceil; x++) {
    for (let z = -Rceil; z <= Rceil; z++) {
      if (!inside(x, z)) continue;

      const top = heightAt(x, z);
      const bottom = bottomAt(x, z);

      // is this column on the cliff face?
      const boundary =
        !inside(x + 1, z) || !inside(x - 1, z) || !inside(x, z + 1) || !inside(x, z - 1);

      const surfaceMat = surfaceMaterial(x, z, top, heightAt, rng);

      if (boundary) {
        // ---- full cliff wall: this is what makes the island read as solid
        for (let y = bottom; y <= top; y++) {
          let mat;
          if (y === top) mat = surfaceMat;
          else if (y >= top - WORLD.soilDepth) mat = y === top - 1 ? 'dirt' : 'dirtDark';
          else {
            const t = (y - bottom) / Math.max(1, top - bottom); // 0 bottom → 1 top
            mat = t > 0.62 ? 'stone' : t > 0.34 ? 'stoneDark' : 'basalt';
          }
          v.set(x, y, z, mat);
        }
      } else {
        // ---- interior: only the surface band and the floor band
        v.set(x, top, z, surfaceMat);
        for (let y = top - 1; y > top - WORLD.soilDepth; y--) {
          v.set(x, y, z, y === top - 1 ? 'dirt' : 'dirtDark');
        }
        for (let y = bottom; y < bottom + WORLD.floorDepth; y++) {
          const t = (y - bottom) / WORLD.floorDepth;
          v.set(x, y, z, t > 0.6 ? 'stoneDark' : 'basalt');
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Ore veins — the island funds its own machinery.
   * ---------------------------------------------------------------- */
  const veinRng = makeRng(seed + 77);
  const veins = Math.round(R * R * 0.004 * (oreDensity / 0.035));
  const ores = ['oreCopper', 'oreBrass', 'oreIron', 'coal'];

  for (let n = 0; n < veins; n++) {
    const a = veinRng() * Math.PI * 2;
    const rad = veinRng() * R * 0.86;
    const x0 = Math.round(Math.cos(a) * rad);
    const z0 = Math.round(Math.sin(a) * rad);
    if (!inside(x0, z0)) continue;
    const top = heightAt(x0, z0);
    const bottom = bottomAt(x0, z0);
    const y0 = Math.round(lerp(bottom + 3, top - 4, veinRng()));
    const ore = veinRng.pick(ores);
    const len = 3 + Math.floor(veinRng() * 7);
    const dx = Math.round(veinRng() * 2 - 1);
    const dz = Math.round(veinRng() * 2 - 1);
    const dy = veinRng() < 0.45 ? 1 : 0;

    let cx = x0, cy = y0, cz = z0;
    for (let s = 0; s < len; s++) {
      for (let r = 0; r < 2; r++) {
        const rr = r === 0 ? 0 : veinRng() < 0.5 ? 1 : -1;
        const px = cx + (dz !== 0 ? rr : 0);
        const pz = cz + (dx !== 0 ? rr : 0);
        if (v.has(px, cy, pz) && v.get(px, cy, pz) !== 'grass') v.set(px, cy, pz, ore);
      }
      cx += dx; cy += dy; cz += dz;
      if (cy > top || cy < bottom) break;
    }
  }

  /* ---------------------------------------------------------------- *
   * Roots clinging to the cliff face — nature vs machinery.
   * ---------------------------------------------------------------- */
  const rootRng = makeRng(seed + 404);
  for (let i = 0; i < R * 2.2; i++) {
    const a = rootRng() * Math.PI * 2;
    const rad = islandRadius(Math.cos(a) * R, Math.sin(a) * R) - 1;
    const x0 = Math.round(Math.cos(a) * rad);
    const z0 = Math.round(Math.sin(a) * rad);
    if (!inside(x0, z0)) continue;
    const top = heightAt(x0, z0);
    const drop = 4 + Math.floor(rootRng() * 11);
    const sway = rootRng() < 0.5 ? 1 : -1;
    for (let s = 0; s < drop; s++) {
      const y = top - s;
      if (s > 3 && rootRng() < 0.35) continue;
      const px = x0 + Math.round(Math.sin(s * 0.35) * sway);
      const mat = s === 0 ? 'grassDark' : rootRng() < 0.5 ? 'woodDark' : 'leafDark';
      v.setIfEmpty(px, y, z0 + sway, mat);
      if (s % 4 === 1) v.setIfEmpty(px + sway, y - 1, z0, 'leaf');
    }
  }

  /* ---------------------------------------------------------------- *
   * Weathering pass — moss, small stones, rust bleeding from the machinery.
   * ---------------------------------------------------------------- */
  const wearRng = makeRng(seed + 909);
  v.scatter(-Rceil, -14, -Rceil, Rceil, 18, Rceil, 'moss', wearRng, { chance: 0.05, onlyExposed: true, onlyTop: true });
  v.scatter(-Rceil, -14, -Rceil, Rceil, 18, Rceil, 'stoneLight', wearRng, { chance: 0.02, onlyExposed: true, onlyTop: true });
  v.scatter(-Rceil, -30, -Rceil, Rceil, -8, Rceil, 'rust', wearRng, { chance: 0.012, onlyExposed: true });

  return v;
}

export { surfaceMaterial };