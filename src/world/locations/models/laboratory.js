/**
 * ARC & INDUCTION LAB — the experimental wing.
 * A half-open iron-and-glass shed with a slate apron, three induction coils
 * (toroids), capacitor banks, a crystal cage and copper busbars overhead.
 * The arcs and the pulsing crystals are animated children.
 */
import { gearXY, gearXZ, pipe, crate, barrel, lampPost, chain, archOutline } from './parts.js';

export const LAB_HEIGHT = 24;

export function buildLaboratory(v) {
  const anim = {};
  const W = 26, D = 22;
  const x0 = -W / 2, z0 = -D / 2;

  /* ---- concrete apron + kerb -------------------------------- */
  v.box(x0 - 2, 0, z0 - 2, W + 4, 1, D + 4, 'basalt');
  v.box(x0 - 1, 1, z0 - 1, W + 2, 1, D + 2, 'stoneDark');
  // painted hazard stripes
  for (let i = 0; i < W + 2; i += 3) {
    v.box(x0 - 1 + i, 1, z0 - 1, 2, 1, 1, 'lampAmber');
    v.box(x0 - 1 + i, 1, z0 + D, 2, 1, 1, 'lampAmber');
  }

  /* ---- open iron frame structure ---------------------------- */
  const H = 12;
  // corner columns + lattice trusses
  for (const [px, pz] of [[x0, z0], [x0 + W - 2, z0], [x0, z0 + D - 2], [x0 + W - 2, z0 + D - 2]]) {
    v.box(px, 2, pz, 2, H, 2, 'iron');
    v.box(px - 1, 2 + H - 2, pz - 1, 4, 2, 4, 'ironDark');
    v.box(px - 1, 2, pz - 1, 4, 1, 4, 'ironDark');
  }
  for (const z of [z0, z0 + Math.floor(D / 2) - 1, z0 + D - 2]) {
    v.box(x0, 2 + H, z, W, 2, 2, 'iron');
    for (let i = x0; i < x0 + W - 2; i += 4) {
      v.line(i, 2 + H, z, i + 3, 2 + H + 3, z, 'ironDark');
      v.line(i + 3, 2 + H + 3, z, i + 6, 2 + H, z, 'ironDark');
    }
  }
  v.box(x0, 2 + H + 3, z0, W, 1, 2, 'ironDark');
  v.box(x0, 2 + H + 3, z0 + D - 2, W, 1, 2, 'ironDark');

  /* ---- partial roof: glass panels on the north half --------- */
  for (let i = x0 + 1; i < x0 + W - 2; i += 2)
    for (let k = z0 + 1; k < z0 + 10; k += 2) v.box(i, 2 + H + 1, k, 2, 1, 2, 'glass');

  /* ---- back wall of brick + copper -------------------------- */
  v.boxShell(x0, 2, z0, W, H, D, 'brick_dark');
  for (let i = x0; i < x0 + W; i++)
    for (let y = 2; y < 2 + H; y++) {
      if (!(i === x0 || i === x0 + W - 1 || y === 2 || y === 2 + H - 1)) continue;
      v.set(i, y, z0, y % 3 === 0 ? 'copper' : 'brick');
    }

  /* ---- three induction coils (toroids) ---------------------- */
  anim.coils = [];
  for (let c = 0; c < 3; c++) {
    const cx = x0 + 4 + c * 7;
    const cz = z0 + 13;
    // ceramic insulator stack
    for (let j = 0; j < 7; j++) {
      const rr = j % 2 === 0 ? 2.4 : 1.8;
      v.cylY(cx, 2 + j, cz, rr, 1, 'cream', { hollow: true, thickness: 1.4 });
    }
    // the copper toroid
    v.ringY(cx, 11, cz, 3.4, 2, 'copper');
    v.ringY(cx, 11, cz, 3.4, 1.6, 'copperOx');
    v.cylY(cx, 9, cz, 1.2, 2, 'copper');
    v.cylY(cx, 13, cz, 1.2, 1, 'brass');
    // feed-through to the busbar
    pipe(v, cx, 14, cz, cx, 2 + H + 2, cz, 1, 'copper', 'brass');
    anim.coils.push({ x: cx, y: 11, z: cz, phase: c * 2.1 });
    // grounding strap
    v.line(cx - 2, 3, cz, cx - 4, 2, cz, 'ironDark');
  }

  /* ---- capacitor banks -------------------------------------- */
  for (const [bx, bz] of [[x0 + 3, z0 + 5], [x0 + 8, z0 + 5]]) {
    v.box(bx, 2, bz, 4, 6, 2, 'ironDark');
    for (let i = 0; i < 4; i++) {
      v.cylY(bx, 3 + i * 1.4, bz + 3, 1, 1, 'cream');
      v.set(bx + 1, 4 + i * 1.4, bz + 3, 'lampCyan');
    }
    v.box(bx, 8, bz, 4, 1, 2, 'brass');
  }

  /* ---- the crystal cage (the experiment) -------------------- */
  anim.crystal = { x: x0 + W - 7, y: 6, z: z0 + 12 };
  v.box(anim.crystal.x - 4, 2, anim.crystal.z - 4, 9, 1, 9, 'basalt');
  v.cylY(anim.crystal.x, 2, anim.crystal.z, 4.4, 1, 'ironDark');
  // brass cage bars
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = anim.crystal.x + Math.round(Math.cos(ang) * 3.6);
    const pz = anim.crystal.z + Math.round(Math.sin(ang) * 3.6);
    v.box(px, 3, pz, 1, 7, 1, 'brass');
  }
  v.ringY(anim.crystal.x, 10, anim.crystal.z, 3.6, 1.2, 'brass');
  v.ringY(anim.crystal.x, 4, anim.crystal.z, 3.6, 1.2, 'brass');
  v.coneY(anim.crystal.x, 11, anim.crystal.z, 4, 0, 3, 'brass');

  /* ---- overhead copper busbars ------------------------------ */
  for (const bz of [z0 + 6, z0 + 11, z0 + 16]) {
    v.box(x0 + 1, 2 + H + 1, bz, W - 2, 1, 1, 'copper');
    v.box(x0 + 1, 2 + H + 2, bz + 1, W - 2, 1, 1, 'copper');
  }
  for (let i = x0 + 2; i < x0 + W - 2; i += 6) {
    v.box(i, 2 + H, z0 + 6, 1, 2, 11, 'ironDark');
    v.set(i, 2 + H + 2, z0 + 6, 'copper');
  }

  /* ---- switchgear + instrument panel ------------------------ */
  v.box(x0 + W - 6, 2, z0 + 3, 5, 4, 3, 'iron');
  for (let i = 0; i < 3; i++) {
    v.box(x0 + W - 6 + i, 4, z0 + 6, 1, 1, 1, i === 1 ? 'lampRed' : 'lampGreen');
    v.cylY(x0 + W - 6 + i, 3, z0 + 5, 0.8, 1, 'brass');
  }
  v.box(x0 + W - 6, 6, z0 + 3, 5, 1, 3, 'brass');

  /* ---- yard dressing ---------------------------------------- */
  crate(v, x0 - 4, 1, z0 + 4, 2);
  crate(v, x0 - 4, 1, z0 + 9, 3, 'woodDark');
  crate(v, x0 - 4, 7, z0 + 4, 2, 'wood', 'brass');
  barrel(v, x0 + W + 2, 1, z0 + 6, 2, 6, 'iron');
  barrel(v, x0 + W + 3, 1, z0 + 10, 2, 5, 'iron');
  lampPost(v, x0 - 4, 1, z0 + 16, 7, 'ironDark', 'lampCyan');
  lampPost(v, x0 + W + 3, 1, z0 + 2, 7, 'ironDark', 'lampCyan');
  // grounding rods + cable
  chain(v, anim.crystal.x - 4, 2, anim.crystal.z + 4, x0 - 4, 1, z0 + 14, 'copper', 2);

  return { v, anim };
}

export default buildLaboratory;