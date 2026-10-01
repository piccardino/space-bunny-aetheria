/**
 * FORGE & ANVIL WORKS — the island's industrial heart.
 * A soot-blackened brick shed with a sawtooth roof, three glowing furnace
 * mouths, a chimney stack, exposed steam pipes, a mechanical hammer and an
 * overhead crane rail.
 */
import { gearXY, gearXZ, pipe, chimney, barrel, crate, archOutline } from './parts.js';

export const WORKSHOP_HEIGHT = 26;

export function buildWorkshop(v) {
  const anim = {};
  const W = 30, D = 24, H = 15;
  const x0 = -W / 2, z0 = -D / 2;

  /* ---- stone footing + brick body ---------------------------- */
  v.box(x0 - 1, 0, z0 - 1, W + 2, 2, D + 2, 'stoneDark');
  v.box(x0, 2, z0, W, 2, D, 'stone');
  v.boxShell(x0, 4, z0, W, H, D, 'brick_dark');
  // brick banding: alternate courses, plus soot above the furnaces
  for (let y = 4; y < 4 + H; y++)
    for (let i = x0; i < x0 + W; i++)
      for (let k = z0; k < z0 + D; k++) {
        if (!(i === x0 || i === x0 + W - 1 || k === z0 || k === z0 + D - 1)) continue;
        const soot = k === z0 + D - 1 && y < 12;
        v.set(i, y, k, soot ? 'soot' : y % 3 === 0 ? 'brick_light' : 'brick');
      }

  /* ---- sawtooth roof (north-facing clerestory windows) ------- */
  for (let s = 0; s < 4; s++) {
    const sx = x0 + 1 + s * 7;
    v.box(sx, 4 + H, z0, 6, 2, D, 'iron');
    v.box(sx + 4, 4 + H, z0, 2, 5, D, 'brick');
    // the angled glazing of each tooth
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < D; k++)
        v.set(sx + 1 + i, 4 + H + 2 + Math.floor((3 - i) * 0.7), z0 + k, i % 2 ? 'glass' : 'glassWarm');
  }
  v.box(x0, 4 + H, z0 - 1, W, 1, D + 2, 'ironDark');

  /* ---- three furnace mouths on the south wall ---------------- */
  for (let f = 0; f < 3; f++) {
    const fx = x0 + 3 + f * 9;
    v.carveBox(fx, 4, z0 + D - 2, 6, 6, 3);
    archOutline(v, fx, 9, z0 + D - 2, 6, 4, 3, 'ironDark');
    v.box(fx, 4, z0 + D - 1, 6, 1, 1, 'ironLight');
    // glowing coal bed
    for (let i = 0; i < 5; i++)
      for (let k = 0; k < 2; k++)
        v.set(fx + 1 + ((i * 7 + k * 3) % 4), 5 + ((i + k) % 2), z0 + D - 2 + k, i % 2 ? 'ember' : 'lampRed');
    // soot stain above
    v.set(fx + 2, 10, z0 + D - 1, 'soot');
    v.set(fx + 3, 10, z0 + D - 1, 'soot');
  }

  /* ---- big sliding door on the east wall --------------------- */
  v.carveBox(x0 + W - 2, 4, z0 + 6, 3, 8, 9);
  v.box(x0 + W - 2, 4, z0 + 6, 2, 8, 9, 'wood');
  v.box(x0 + W - 2, 7, z0 + 6, 2, 1, 9, 'iron');
  v.box(x0 + W - 2, 10, z0 + 6, 2, 1, 9, 'iron');
  v.cylX(x0 + W - 3, 6, z0 + 6, 1.2, 9, 'ironDark');

  /* ---- chimney stack ----------------------------------------- */
  chimney(v, x0 + W - 7, 4 + H, z0 + 5, 3, 18, 'soot');
  chimney(v, x0 + W - 12, 4 + H, z0 + 8, 2, 13, 'soot');
  // guy wires
  v.line(x0 + W - 7, 4 + H + 20, z0 + 5, x0 + W - 13, 4 + H, z0 + 2, 'ironDark');
  v.line(x0 + W - 7, 4 + H + 20, z0 + 5, x0 + W - 1, 4 + H, z0 + 8, 'ironDark');

  /* ---- external steam & fuel pipes --------------------------- */
  pipe(v, x0 + 2, 6, z0 + D + 1, x0 + 2, 6, z0 + D + 8, 1.4, 'copper', 'iron');
  pipe(v, x0 + 2, 6, z0 + D + 8, x0 + 14, 6, z0 + D + 8, 1.4, 'copper', 'iron');
  pipe(v, x0 + 14, 6, z0 + D + 8, x0 + 14, 4 + H, z0 + 8, 1.4, 'iron', 'brass');
  for (const px of [x0 + 2, x0 + 8, x0 + 14]) v.sphere(px, 6, z0 + D + 8, 2, 'brass');

  /* ---- crane rail + travelling hoist ------------------------- */
  v.box(x0 + 1, 4 + H + 9, z0 + D + 2, W - 2, 1, 2, 'iron');
  for (let i = x0 + 2; i < x0 + W - 2; i += 4) v.box(i, 4 + H + 10, z0 + D + 2, 1, 2, 2, 'ironDark');
  anim.hoist = { x: x0 + 9, y: 4 + H + 8, z: z0 + D + 3 };
  v.box(x0 + 8, 4 + H + 7, z0 + D + 2, 5, 2, 3, 'iron');
  v.line(x0 + 10, 4 + H + 7, z0 + D + 3, x0 + 10, 4 + H + 1, z0 + D + 3, 'ironDark');

  /* ---- the mechanical trip-hammer (animated head) ------------- */
  anim.hammer = { x: x0 + 22, y: 4 + H + 1, z: z0 + 6 };
  v.box(x0 + 21, 4, z0 + 4, 3, 6, 5, 'stoneDark');
  v.box(x0 + 20, 10, z0 + 4, 5, 2, 5, 'iron');
  v.box(x0 + 19, 12, z0 + 5, 7, 1, 3, 'ironDark');
  // anvil
  v.box(x0 + 19, 4, z0 + 5, 7, 3, 4, 'ironDark');
  v.box(x0 + 20, 7, z0 + 5, 5, 1, 4, 'ironLight');
  v.box(x0 + 21, 8, z0 + 6, 3, 1, 2, 'iron');

  /* ---- gears on the west gable -------------------------------- */
  anim.wallGears = [
    { r: 4.2, teeth: 14, y: 12, z: z0 + 8, mat: 'copper', speed: 0.3 },
    { r: 2.6, teeth: 10, y: 16, z: z0 + 12, mat: 'brass', speed: -0.55 },
  ];
  v.box(x0 - 1, 6, z0 + 4, 2, 16, D - 8, 'ironDark');

  /* ---- yard dressing ----------------------------------------- */
  barrel(v, x0 + W + 2, 0, z0 + 3, 2, 6);
  barrel(v, x0 + W + 3, 0, z0 + 7, 2, 5);
  barrel(v, x0 + W + 1, 0, z0 + 7, 2, 7, 'woodDark');
  crate(v, x0 - 4, 0, z0 + 2, 2);
  crate(v, x0 - 4, 0, z0 + 7, 3, 'woodDark');
  crate(v, x0 - 4, 6, z0 + 7, 2, 'wood', 'iron');
  for (let i = 0; i < 4; i++) v.box(x0 + W + 1, 0, z0 + 12 + i * 2, 6, 1, 1, 'wood');

  return { v, anim };
}

export default buildWorkshop;