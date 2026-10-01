/**
 * VEGETATION & SMALL PROPS
 * ------------------------
 * Nature fighting the machinery: voxel trees, pines, bushes, grass tufts,
 * flowers, moss clumps, plus the scattered human clutter that makes the island
 * feel inhabited.
 *
 * Everything is returned as *merged canvases per kind* so the whole island's
 * foliage is a handful of draw calls.
 */
import { makeRng, clamp } from '../core/math.js';
import { WORLD, isInside, islandRadius } from './config.js';
import { barrel, crate, lampPost, chain, pipe } from './locations/models/parts.js';

/**
 * A broadleaf voxel tree.
 * Deliberately slim: an earlier pass used canopies up to r≈5, which read as
 * broccoli towers next to 40-unit buildings. Real proportion here is a tree
 * roughly a quarter of a storey's height with a narrow crown.
 */
function tree(v, x, y, z, rng, scale = 1) {
  const h = Math.round((9 + rng() * 7) * scale);
  const trunk = rng() < 0.5 ? 'wood' : 'woodDark';
  const lean = rng() < 0.5 ? 1 : -1;
  for (let j = 0; j < h; j++) {
    const t = j / h;
    const ox = Math.round(Math.sin(t * 2.2) * lean);
    v.set(x + ox, y + j, z, j < 2 ? 'woodDark' : trunk);
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    v.setIfEmpty(x + dx, y, z + dz, 'woodDark');

  // canopy: two or three small overlapping lobes
  const cTop = y + h;
  const cMat = rng() < 0.5 ? 'leaf' : 'leafDark';
  const blobs = 2 + Math.floor(rng() * 2);
  for (let b = 0; b < blobs; b++) {
    const bx = x + Math.round((rng() * 2 - 1) * 1.6 * scale);
    const by = cTop - Math.round(rng() * 2);
    const bz = z + Math.round((rng() * 2 - 1) * 1.6 * scale);
    const br = (1.6 + rng() * 1.1) * scale;
    for (let i = -3; i <= 3; i++)
      for (let j = -3; j <= 3; j++)
        for (let k = -3; k <= 3; k++) {
          const d = Math.sqrt(i * i + j * j + k * k);
          if (d > br) continue;
          if (d > br - 0.9) v.setIfEmpty(bx + i, by + j, bz + k, rng() < 0.2 ? 'leafDark' : cMat);
        }
  }
  return h;
}

/** A conifer voxel tree. */
function pine(v, x, y, z, rng, scale = 1) {
  const h = Math.round((11 + rng() * 8) * scale);
  for (let j = 0; j < h; j++) v.setIfEmpty(x, y + j, z, j < 2 ? 'woodDark' : 'wood');
  const tiers = 4 + Math.floor(rng() * 2);
  for (let t = 0; t < tiers; t++) {
    const ty = y + Math.round(h * 0.4) + t * Math.max(2, Math.round((h * 0.58) / tiers));
    const r = Math.max(1, Math.round((tiers - t) * 0.82 * scale));
    for (let i = -r; i <= r; i++)
      for (let k = -r; k <= r; k++)
        if (Math.abs(i) + Math.abs(k) <= r + 1) v.setIfEmpty(x + i, ty, z + k, t % 2 ? 'leafDark' : 'leaf');
  }
  v.set(x, y + h + 1, z, 'leafDark');
  return h;
}

/** A small bush / moss clump. */
function bush(v, x, y, z, rng) {
  const r = 1.2 + rng() * 1.4;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let k = -2; k <= 2; k++) {
        if (Math.sqrt(i * i + j * j * 2 + k * k) > r) continue;
        v.setIfEmpty(x + i, y + j + 1, z + k, rng() < 0.25 ? 'leafDark' : rng() < 0.2 ? 'moss' : 'leaf');
      }
}

/** Grass tufts — tiny crossed blades, great for breaking up flat ground. */
function tuft(v, x, y, z, rng) {
  const h = 1 + Math.floor(rng() * 2);
  const mat = rng() < 0.25 ? 'grassDry' : 'grassDark';
  for (let j = 0; j < h; j++) {
    v.setIfEmpty(x, y + j, z, j === h - 1 ? 'grass' : mat);
    if (rng() < 0.4) v.setIfEmpty(x + (rng() < 0.5 ? 1 : -1), y + j, z, mat);
  }
}

/** A single flower. */
function flower(v, x, y, z, rng) {
  const h = 1 + Math.floor(rng() * 2);
  for (let j = 0; j < h; j++) v.setIfEmpty(x, y + j, z, 'leafDark');
  const petals = rng() < 0.5 ? 'flowerA' : rng() < 0.5 ? 'flowerB' : 'flowerC';
  v.setIfEmpty(x, y + h, z, petals);
  v.setIfEmpty(x + 1, y + h, z, petals);
  v.setIfEmpty(x, y + h, z + 1, petals);
  v.setIfEmpty(x, y + h + 1, z, rng() < 0.5 ? 'leafGold' : petals);
}

/**
 * Small hand-placed easter eggs. These are the rewards for orbiting slowly
 * and zooming in — a fishing robot, a cat on a girder, a drone, a tiny house.
 *
 * Each returns a list of positions so the scene can also add tiny point lights.
 */
export function buildEasterEggs(heightAt) {
  const eggs = [];
  const rng = makeRng(5150);
  const R = WORLD.radius;

  const push = (name, x, z, yaw, meta = {}) => {
    if (!isInside(x, z, 4)) return;
    eggs.push({ name, x, y: heightAt(Math.round(x), Math.round(z)) + 1, z, yaw, ...meta });
  };

  // 1. the robot fishing over the edge
  {
    const ang = 2.1;
    const x = Math.cos(ang) * (R * 0.78), z = Math.sin(ang) * (R * 0.78);
    push('fishing', Math.round(x), Math.round(z), ang + Math.PI / 2, { glow: 'lampWarm' });
  }
  // 2. the cat on a girder
  {
    const ang = 4.0;
    const x = Math.cos(ang) * (R * 0.76), z = Math.sin(ang) * (R * 0.76);
    push('cat', Math.round(x), Math.round(z), ang);
  }
  // 3. the drone circling (animated separately)
  push('drone', 0, 0, 0, { flying: true, radius: R * 0.55, speed: 0.22, phase: 0.4 });
  push('drone2', 0, 0, 0, { flying: true, radius: R * 0.78, speed: -0.15, phase: 2.2, height: 22 });
  // 4. the tiny shed on the quiet side
  {
    const ang = -1.4;
    const x = Math.cos(ang) * (R * 0.62), z = Math.sin(ang) * (R * 0.62);
    push('shed', Math.round(x), Math.round(z), ang + 1.2, { glow: 'lampWarm' });
  }
  // 5. the strange door nobody can explain
  {
    const ang = 5.3;
    const x = Math.cos(ang) * (R * 0.8), z = Math.sin(ang) * (R * 0.8);
    push('door', Math.round(x), Math.round(z), ang, { glow: 'neonPink' });
  }
  // 6. the bench + telescope an astronomer left behind
  {
    const ang = 0.9;
    const x = Math.cos(ang) * (R * 0.5), z = Math.sin(ang) * (R * 0.5);
    push('telescope', Math.round(x), Math.round(z), ang);
  }
  void rng;
  return eggs;
}

/**
 * Paint the static easter-egg props into a canvas (the flying drone is skipped
 * because it is animated as a separate object).
 */
export function paintEasterEggs(canvas, eggs, heightAt) {
  const rng = makeRng(4242);
  for (const e of eggs) {
    if (e.flying) continue;
    const { x, y, z } = e;
    switch (e.name) {
      /* ---- a small automaton, fishing into the void -------------- */
      case 'fishing': {
        // stool
        canvas.cylY(x, y, z, 1.6, 2, 'wood');
        canvas.cylY(x, y + 2, z, 0.9, 1, 'iron');
        // body
        canvas.box(x - 1, y + 3, z - 1, 3, 4, 3, 'copper');
        canvas.box(x - 1, y + 5, z - 1, 3, 1, 3, 'brass');
        // head with a glowing visor
        canvas.box(x - 1, y + 7, z - 1, 3, 2, 3, 'brass');
        canvas.box(x - 1, y + 8, z + 1, 3, 1, 1, 'lampWarm');
        canvas.box(x + 1, y + 7, z - 1, 1, 1, 1, 'lampCyan');
        // arm + rod
        canvas.box(x + 1, y + 5, z, 1, 1, 4, 'iron');
        canvas.line(x + 1, y + 6, z + 3, x + 1, y + 2, z + 9, 'ironDark');
        chain(canvas, x + 1, y + 2, z + 9, x + 1, y - 3, z + 10, 'ironLight', 1);
        break;
      }
      /* ---- a cat, because someone has to keep the mice down ----- */
      case 'cat': {
        canvas.box(x - 1, y, z, 3, 2, 5, 'blackIron');
        canvas.box(x - 1, y + 2, z + 2, 3, 2, 2, 'blackIron');      // head
        canvas.set(x, y + 4, z + 3, 'blackIron');
        canvas.set(x - 1, y + 4, z + 3, 'blackIron');
        canvas.set(x, y + 4, z + 3, 'lampGreen');                    // eyes
        canvas.set(x + 1, y + 4, z + 3, 'lampGreen');
        canvas.box(x, y + 4, z - 1, 1, 1, 4, 'blackIron');          // tail
        canvas.set(x, y + 5, z - 3, 'blackIron');
        break;
      }
      /* ---- the shed nobody uses ---------------------------------- */
      case 'shed': {
        canvas.box(x - 3, y, z - 3, 7, 5, 6, 'wood');
        canvas.box(x - 3, y, z - 3, 7, 1, 6, 'woodDark');
        for (let s = 0; s < 4; s++) canvas.box(x - 4 + s, y + 5, z - 4 + s, 1 + s * 2, 1, 8 - s * 2, 'slate');
        canvas.carveBox(x - 1, y, z + 2, 3, 3, 3);
        canvas.box(x - 1, y, z + 2, 3, 3, 1, 'woodDark');
        canvas.box(x - 3, y + 3, z + 2, 1, 1, 1, 'lampWarm');
        canvas.box(x + 2, y + 3, z + 2, 1, 1, 1, 'lampWarm');
        barrel(canvas, x + 5, y, z - 2, 2, 5);
        break;
      }
      /* ---- the inexplicable door -------------------------------- */
      case 'door': {
        canvas.box(x - 2, y, z - 1, 5, 6, 3, 'stoneDark');
        canvas.boxFrame(x - 2, y, z - 1, 5, 6, 3, 'brass', 1);
        canvas.carveBox(x - 1, y, z + 2, 3, 5, 2);
        canvas.box(x - 1, y, z + 1, 3, 5, 1, 'woodDark');
        for (let i = -1; i < 2; i += 2) canvas.set(x + i * 0, y + 2, z + 2, 'neonPink');
        canvas.box(x - 1, y + 5, z + 2, 3, 1, 1, 'gold');
        for (let j = 0; j < 4; j++) canvas.set(x - 1 + j, y + 6 + j, z, 'brass');
        break;
      }
      /* ---- the astronomer's abandoned instrument ---------------- */
      case 'telescope': {
        canvas.cylY(x, y, z, 1, 3, 'ironDark');
        canvas.box(x - 1, y + 3, z - 1, 3, 2, 3, 'brass');
        for (let i = -3; i <= 3; i++) canvas.set(x + i, y + 4 + Math.abs(i) * 0.6, z, 'brassDark');
        canvas.set(x, y + 7, z, 'brass');
        canvas.box(x - 2, y, z + 3, 5, 1, 1, 'wood');
        canvas.box(x - 2, y, z + 2, 1, 2, 1, 'wood');
        canvas.box(x + 1, y, z + 2, 1, 2, 1, 'wood');
        break;
      }
      default:
        break;
    }
  }

  /* ---- a wandering NPC on the plaza (static pose, animated separately) */
  const nx = Math.round(Math.cos(0.6) * 18);
  const nz = Math.round(Math.sin(0.6) * 18);
  const ny = heightAt(nx, nz) + 1;
  canvas.box(nx - 1, ny, nz - 1, 3, 4, 3, 'fabric');
  canvas.box(nx - 1, ny + 4, nz - 1, 3, 2, 3, 'skin');
  canvas.box(nx - 1, ny + 6, nz - 1, 3, 1, 3, 'woodDark');
  canvas.box(nx + 1, ny + 2, nz - 1, 1, 1, 1, 'skin');
  canvas.box(nx - 2, ny + 2, nz - 1, 1, 1, 1, 'skin');
  void rng;
  return canvas;
}

/**
 * Scatter vegetation across the island, avoiding buildings and steep cliffs.
 *
 * @param {import('../voxel/VoxelCanvas.js').default} canvas
 * @param {(x:number,z:number)=>number} heightAt
 * @param {number} density 0..1 quality scalar
 */
export function scatterVegetation(canvas, heightAt, density = 1) {
  const rng = makeRng(31415);
  const R = WORLD.radius;
  const trees = [];

  const blocked = (x, z, margin) => {
    if (!isInside(x, z, margin)) return true;
    const r = Math.hypot(x, z);
    if (r < 17) return true;                              // keep the plaza clear
    if (r > islandRadius(x, z) - 5) return true;          // and the cliff edge
    return false;
  };
  const flat = (x, z) => {
    const h = heightAt(x, z);
    return Math.abs(heightAt(x + 1, z) - h) <= 1 && Math.abs(heightAt(x, z + 1) - h) <= 1 && h > -2;
  };

  /* ---- trees: a handful of groves, not a uniform sprinkle ------- */
  const groves = 7 + Math.round(rng() * 4);
  for (let gI = 0; gI < groves; gI++) {
    const ga = rng() * Math.PI * 2;
    const gr = 22 + Math.sqrt(rng()) * (R - 34);
    const gx = Math.round(Math.cos(ga) * gr);
    const gz = Math.round(Math.sin(ga) * gr);
    const perGrove = Math.round((6 + rng() * 10) * density);
    for (let i = 0; i < perGrove; i++) {
      const x = Math.round(gx + (rng() * 2 - 1) * 9);
      const z = Math.round(gz + (rng() * 2 - 1) * 9);
      if (blocked(x, z, 5) || !flat(x, z)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
      const y = heightAt(x, z) + 1;
      const isPine = rng() < 0.38;
      const h = isPine ? pine(canvas, x, y, z, rng, 0.9 + rng() * 0.35)
        : tree(canvas, x, y, z, rng, 0.85 + rng() * 0.5);
      trees.push({ x, y, z, h, pine: isPine });
    }
  }
  // a few lone sentinels out on the open ground
  for (let i = 0; i < Math.round(26 * density); i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 20 + Math.sqrt(rng()) * (R - 28);
    const x = Math.round(Math.cos(ang) * rad);
    const z = Math.round(Math.sin(ang) * rad);
    if (blocked(x, z, 6) || !flat(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    const y = heightAt(x, z) + 1;
    const isPine = rng() < 0.45;
    const h = isPine ? pine(canvas, x, y, z, rng, 1 + rng() * 0.3)
      : tree(canvas, x, y, z, rng, 1 + rng() * 0.4);
    trees.push({ x, y, z, h, pine: isPine });
  }

  /* ---- bushes, tufts, flowers ------------------------------------ */
  for (let i = 0; i < Math.round(R * R * 0.02 * density); i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * (R - 3);
    const x = Math.round(Math.cos(ang) * rad);
    const z = Math.round(Math.sin(ang) * rad);
    if (!isInside(x, z, 2) || !flat(x, z)) continue;
    bush(canvas, x, heightAt(x, z) + 1, z, rng);
  }
  for (let i = 0; i < Math.round(R * R * 0.16 * density); i++) {
    const x = Math.round((rng() * 2 - 1) * R);
    const z = Math.round((rng() * 2 - 1) * R);
    if (!isInside(x, z, 1)) continue;
    const h = heightAt(x, z);
    if (h < -1 || h > 10) continue;
    tuft(canvas, x, h + 1, z, rng);
  }
  for (let i = 0; i < Math.round(R * R * 0.012 * density); i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * (R - 8);
    const x = Math.round(Math.cos(ang) * rad);
    const z = Math.round(Math.sin(ang) * rad);
    if (!isInside(x, z, 3) || !flat(x, z)) continue;
    if (rng() < 0.6) tuft(canvas, x, heightAt(x, z) + 1, z, rng);
    flower(canvas, x, heightAt(x, z) + 1, z, rng);
  }

  paintPlaza(canvas, heightAt);

  /* ---- street lamps + benches around the plaza ------------------- */
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.39;
    const lx = Math.round(Math.cos(ang) * 15.5);
    const lz = Math.round(Math.sin(ang) * 15.5);
    if (isInside(lx, lz, 2)) lampPost(canvas, lx, heightAt(lx, lz) + 1, lz, 7, 'ironDark', 'lampWarm');
  }
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2 + 0.8;
    const bx = Math.round(Math.cos(ang) * 12);
    const bz = Math.round(Math.sin(ang) * 12);
    if (!isInside(bx, bz, 2)) continue;
    const by = heightAt(bx, bz) + 1;
    canvas.box(bx - 2, by, bz, 5, 1, 2, 'wood');
    canvas.box(bx - 2, by + 1, bz, 5, 1, 1, 'woodDark');
    canvas.box(bx - 2, by, bz - 1, 1, 2, 1, 'woodDark');
    canvas.box(bx + 2, by, bz - 1, 1, 2, 1, 'woodDark');
  }

  return { trees };
}

/**
 * The central plaza: concentric stone paving with a brass compass inlay and
 * stone paths radiating toward each location. This is what visually "wires" the
 * buildings together into one coherent place.
 */
function paintPlaza(canvas, heightAt) {
  for (let r = 0; r <= 16; r += 2) {
    for (let a = 0; a < 160; a++) {
      const ang = (a / 160) * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r);
      const z = Math.round(Math.sin(ang) * r);
      const y = heightAt(x, z) + 1;
      if (canvas.get(x, y, z) === undefined) continue;
      canvas.set(x, y, z, r % 6 === 0 ? 'stoneLight' : r % 4 === 0 ? 'brassDark' : 'stone');
    }
  }
  for (let i = -4; i <= 4; i++)
    for (let k = -4; k <= 4; k++) {
      if (i * i + k * k > 16) continue;
      canvas.set(i, heightAt(i, k) + 1, k,
        i * i + k * k < 5 ? 'brass' : i * i + k * k < 14 ? 'stoneLight' : 'gold');
    }
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    for (let r = 6; r < 46; r++) {
      const x = Math.round(Math.cos(ang) * r);
      const z = Math.round(Math.sin(ang) * r);
      if (!isInside(x, z, 1)) break;
      const y = heightAt(x, z) + 1;
      if (canvas.get(x, y, z) === undefined) continue;
      canvas.set(x, y, z, r % 7 === 0 ? 'stoneLight' : 'stone');
      if (r % 3 === 0) {
        canvas.setIfEmpty(x + 1, y, z, 'stoneDark');
        canvas.setIfEmpty(x, y, z + 1, 'stoneDark');
      }
    }
  }
  void clamp; void pipe; void chain; void crate;
}