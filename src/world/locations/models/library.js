/**
 * THE AMBER ATHENAEUM — the archive.
 * The most elegant building on the island: a two-storey colonnaded hall of
 * warm wood and brass, with a tall illuminated doorway, an oriel window,
 * a rooftop reading lantern and stacked book-cart stacks by the entrance.
 */
import { archedWindowZ, archOutline, barrel, crate, lampPost, pipe, chain } from './parts.js';

export const LIBRARY_HEIGHT = 30;

export function buildLibrary(v) {
  const anim = {};
  const W = 28, D = 20, H = 16;
  const x0 = -W / 2, z0 = -D / 2;
  /** First course of the hipped roof. The hall walls only reach FB + H - 1, so
   *  the band in between has to be closed by the attic storey further down. */
  const RY = 30;

  /* ---- stylobate + steps ------------------------------------ */
  v.box(x0 - 2, 0, z0 - 2, W + 4, 2, D + 4, 'stoneDark');
  v.box(x0 - 1, 2, z0 - 1, W + 2, 1, D + 2, 'stoneLight');
  for (let s = 0; s < 5; s++) v.box(-6, 2 - s, z0 + D + 1 + s, 13, 1, 1, 'stoneLight');
  v.box(-W, 3, z0, W, 2, D, 'woodDark');   // raised timber floor

  /* ---- main hall -------------------------------------------- */
  const FB = 5;
  v.box(x0, FB, z0, W, 2, D, 'wood');
  v.boxShell(x0, FB, z0, W, H, D, 'woodPale');
  // timber framing on the walls
  for (let y = FB; y < FB + H; y++)
    for (let i = x0; i < x0 + W; i++)
      for (let k = z0; k < z0 + D; k++) {
        if (!(i === x0 || i === x0 + W - 1 || k === z0 || k === z0 + D - 1)) continue;
        const post = (i === x0 || i === x0 + W - 1) && ((y - FB) % 4 === 0);
        const rail = k === z0 && (y - FB) % 4 === 0;
        v.set(i, y, k, post || rail ? 'woodDark' : (y - FB) % 2 ? 'woodPale' : 'woodLight');
      }
  // stone quoins
  for (const [qx, qz] of [[x0, z0], [x0 + W - 2, z0], [x0, z0 + D - 2], [x0 + W - 2, z0 + D - 2]])
    for (let s = 0; s < 5; s++) {
      v.box(qx, FB + s * 3, qz, 2, 3, 2, 'stoneLight');
      v.box(qx === x0 ? x0 + W - 2 : x0, FB + s * 3 + 1, qz === z0 ? z0 + D - 2 : z0, 2, 3, 2, 'stoneLight');
    }

  /* ---- colonnade on the south face -------------------------- */
  for (let c = 0; c < 6; c++) {
    const cxp = x0 + 2 + c * 4.6;
    v.cylY(Math.round(cxp), FB + 2, z0 + D + 1, 1.3, H - 3, 'stoneLight');
    v.box(Math.round(cxp) - 2, FB + 2, z0 + D, 4, 1, 3, 'stoneLight');
    v.box(Math.round(cxp) - 2, FB + H - 1, z0 + D, 4, 2, 3, 'stoneLight');
  }
  v.box(x0, FB + H - 1, z0 + D, W, 3, 3, 'stoneLight');
  v.box(x0, FB + H + 2, z0 + D - 1, W, 1, 5, 'stoneLight');
  // pediment
  for (let s = 0; s < 6; s++) v.box(x0 + 2 + s, FB + H + 3 + s, z0 + D - 1, W - 4 - s * 2, 1, 5, 'stoneLight');
  for (let s = 0; s < 6; s++) v.box(x0 + 2 + s, FB + H + 3 + s, z0 + D - 1, 1, 1, 5, 'stone');
  v.box(x0 + W / 2 - 3, FB + H + 9, z0 + D - 1, 7, 3, 3, 'brass');

  /* ---- grand entrance --------------------------------------- */
  v.carveBox(-5, FB + 2, z0 + D - 2, 11, 11, 4);
  archOutline(v, -5, FB + 2, z0 + D - 2, 11, 7, 4, 'brass');
  // recessed doors with warm light behind
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 10; j++) {
      const isLeaf = (i < 4 && (j % 4 !== 3)) || (i > 4 && (j % 4 !== 3));
      const centreGap = i === 4;
      if (centreGap && j < 8) continue;
      v.set(-5 + i, FB + 2 + j, z0 + D - 1, isLeaf ? 'woodDark' : 'wood');
    }
  v.set(-5, FB + 12, z0 + D - 1, 'lampWarm');
  v.set(4, FB + 12, z0 + D - 1, 'lampWarm');
  // fanlight above the door
  for (let i = 0; i < 11; i++) v.set(-5 + i, FB + 13, z0 + D - 2, 'lampWarm');
  v.boxFrame(-6, FB + 13, z0 + D - 2, 13, 2, 1, 'brass', 1);
  // steps up to the door
  for (let s = 0; s < 3; s++) v.box(-7, 4 - s, z0 + D - 1 + s, 15, 1, 1, 'stoneLight');

  /* ---- tall arched windows, both storeys -------------------- */
  for (const fy of [FB + 3, FB + 10]) {
    for (let w = 0; w < 4; w++) {
      const wx = x0 + 3 + w * 6;
      if (wx > x0 + W - 5) continue;
      if (fy === FB + 3 && wx > -6 && wx < 6) continue; // keep the doorway clear
      archedWindowZ(v, wx, fy, z0 + D - 1, 4, 6, 'glassWarm', 'brass');
      archedWindowZ(v, wx, fy, z0, 4, 6, 'glassWarm', 'brass');
    }
    for (let w = 0; w < 3; w++) {
      const wz = z0 + 3 + w * 6;
      if (wz > z0 + D - 5) continue;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 6; j++) {
          if (j >= 4) {
            const dy = j - 3;
            const dx = i - 1;
            if (dx * dx + dy * dy > 3.4) continue;
          }
          const border = i === 0 || i === 3 || j === 0;
          v.set(x0, fy + j, wz + i, border ? 'brass' : 'glassWarm');
          v.set(x0 + W - 1, fy + j, wz + i, border ? 'brass' : 'glassWarm');
        }
    }
  }

  /* ---- attic storey: carries the roof ------------------------- */
  /* The hall walls stop at FB + H - 1 = 20, but the hipped roof springs from
     RY = FB + H + 9 = 30. Without this storey, courses 21..28 had no perimeter
     at all: the roof floated in mid air and the north/east/west elevations
     were open sky. The attic is a real shell with a floor and dormer lights,
     so it closes the band and still reads as a room rather than a plug. */
  const AT = FB + H;              // 21 — first attic course
  const AH = RY - 1 - AT;         // up to the underside of the roof slab
  v.box(x0, AT - 1, z0, W, 1, D, 'woodDark');            // attic floor
  v.boxShell(x0, AT, z0, W, AH, D, 'woodPale');          // attic walls
  for (let y = AT; y < AT + AH; y++)                       // timber framing
    for (let i = x0; i < x0 + W; i++)
      for (let k = z0; k < z0 + D; k++) {
        if (!(i === x0 || i === x0 + W - 1 || k === z0 || k === z0 + D - 1)) continue;
        const post = (i === x0 || i === x0 + W - 1) && (y - AT) % 3 === 0;
        const rail = k === z0 && (y - AT) % 3 === 0;
        v.set(i, y, k, post || rail ? 'woodDark' : (y - AT) % 2 ? 'woodPale' : 'woodLight');
      }
  // dormer lights on the north, east and west attic walls
  for (const dy of [2, 5]) {
    for (const wx of [x0 + 5, x0 + 11, x0 + 17, x0 + 23])
      if (wx < x0 + W - 1) {
        v.set(wx, AT + dy, z0, 'brass');
        v.set(wx + 1, AT + dy, z0, 'glassWarm');
        v.set(wx + 1, AT + dy, z0 + D - 1, 'glassWarm');
        v.set(wx, AT + dy, z0 + D - 1, 'brass');
      }
    for (const wz of [z0 + 4, z0 + 10, z0 + 15]) {
      v.set(x0, AT + dy, wz, 'glassWarm');
      v.set(x0, AT + dy, wz + 1, 'brass');
      v.set(x0 + W - 1, AT + dy, wz, 'glassWarm');
      v.set(x0 + W - 1, AT + dy, wz + 1, 'brass');
    }
  }
  // cornice band closing the attic against the roof slab
  v.box(x0 - 1, RY - 2, z0 - 1, W + 2, 1, D + 2, 'woodDark');

  /* ---- hipped roof + rooftop lantern ----------------------- */
  for (let s = 0; s < 7; s++) v.box(x0 + s, RY + s, z0 + s, W - s * 2, 1, D - s * 2, 'slate');
  v.box(x0 - 2, RY - 1, z0 - 2, W + 4, 1, D + 4, 'ironDark');
  v.box(-4, RY + 7, -3, 9, 1, 7, 'ironDark');
  v.box(-3, RY + 8, -2, 7, 4, 5, 'lampWarm');
  v.boxFrame(-4, RY + 8, -3, 9, 5, 7, 'brass', 1);
  /* Taper to r=1, not r=0: a cone that closes on a single voxel leaves that
     tip touching the course below only at a corner, and the finial then hangs
     in mid-air above the roof. */
  v.coneY(0, RY + 12, 0, 5, 1, 4, 'copper');
  v.set(0, RY + 16, 0, 'gold');
  anim.lantern = { y: RY + 8 };

  /* ---- signage: a lit brass nameplate over the door --------- */
  v.box(-6, FB + 15, z0 + D, 13, 2, 1, 'brass');
  for (let i = 0; i < 11; i += 2) v.set(-5 + i, FB + 16, z0 + D, 'lampWarm');

  /* ---- dressing: book carts, ladders, lamps ----------------- */
  for (const [bx, bz] of [[-17, 12], [17, 12], [-18, -8]]) {
    v.box(bx - 2, 4, bz - 1, 5, 1, 3, 'wood');
    v.box(bx - 2, 8, bz - 1, 5, 1, 3, 'wood');
    v.box(bx - 2, 5, bz - 1, 5, 3, 1, 'woodDark');
    v.box(bx - 2, 9, bz - 1, 5, 3, 1, 'woodDark');
    for (const [ox, mat] of [[-1, 'flowerA'], [0, 'flowerB'], [1, 'cream']])
      v.box(bx + ox, 6, bz, 1, 2, 1, mat);
    v.box(bx - 2, 4, bz - 1, 1, 1, 1, 'iron');
    v.box(bx + 2, 4, bz + 1, 1, 1, 1, 'iron');
  }
  lampPost(v, -11, 3, z0 + D + 3, 8, 'ironDark', 'lampWarm');
  lampPost(v, 11, 3, z0 + D + 3, 8, 'ironDark', 'lampWarm');
  barrel(v, -20, 3, 8, 2, 5, 'woodDark');
  chain(v, 16, 20, z0 + 2, 16, 8, z0 + 2, 'ironDark', 1);

  return { v, anim };
}

export default buildLibrary;