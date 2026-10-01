/**
 * CLOCKWORK SPIRE — the heart of Aetheria.
 * ---------------------------------------------------------------
 * Stone-and-brass tower: stepped plinth, banded buttressed shaft, four
 * illuminated dials, an exposed gear train, a copper dome and a lantern crown.
 *
 * Painted in LOCAL space: base at y=0, centred on x/z = 0.
 * Moving parts (gear train, hands, weathervane) are returned in `anim` so
 * ClockTower.jsx can parent them to their own animated groups.
 */
import { gearXY, clockDial, archedWindowZ, pipe, lampPost } from './parts.js';

export const CLOCKTOWER_HEIGHT = 60;

/**
 * @param {import('../../../voxel/VoxelCanvas').default} v
 * @returns {{ anim: object }} handles for the animated child objects
 */
export function buildClockTower(v) {
  const anim = {};

  /* ---- stepped stone plinth --------------------------------- */
  v.box(-13, 0, -13, 27, 2, 27, 'stoneDark');
  v.box(-12, 2, -12, 25, 2, 25, 'stone');
  v.box(-11, 4, -11, 23, 1, 23, 'stoneLight');
  v.boxFrame(-13, 0, -13, 27, 6, 27, 'ironDark', 1);
  for (const [sx, sz] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
    v.cylY(sx, 1, sz, 1.7, 4, 'iron');
    v.set(sx, 5, sz, 'brass');
  }

  /* ---- main shaft ------------------------------------------- */
  const SB = 5;  // shaft base
  const SH = 26; // shaft height
  v.boxShell(-9, SB, -9, 19, SH, 19, 'stone');
  for (let y = SB; y < SB + SH; y++)
    for (let i = -9; i <= 9; i++)
      for (let k = -9; k <= 9; k++) {
        if (!(i === -9 || i === 9 || k === -9 || k === 9)) continue;
        const corner = (i === -9 || i === 9) && (k === -9 || k === 9);
        v.set(i, y, k, corner ? 'stoneDark' : y % 4 === 0 ? 'stoneLight' : 'stone');
      }
  for (let y = SB + 3; y < SB + SH; y += 5) v.boxFrame(-10, y, -10, 21, 1, 21, 'stoneLight', 1);

  // corner buttresses with angled braces
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    v.box(sx * 10 - 1, SB, sz * 10 - 1, 3, SH, 3, 'stoneDark');
    for (const by of [SB + 6, SB + 14]) v.box(sx * 10 - 1, by, sz * 10 - 1, 3, 1, 3, 'stoneLight');
    for (let s = 0; s < 4; s++) v.set(sx * (10 + s), SB + 9 + s, sz * 10, 'stoneDark');
  }

  /* ---- arched windows, all four faces ------------------------ */
  for (const wy of [SB + 4, SB + 12, SB + 20]) {
    archedWindowZ(v, -2, wy, 9, 5, 7, 'glassWarm', 'brass');
    archedWindowZ(v, -2, wy, -10, 5, 7, 'glassWarm', 'brass');
    for (let i = -2; i < 3; i++)
      for (let j = 0; j < 7; j++) {
        if (j >= 4) {
          const dy = j - 3;
          if (i * i + dy * dy > 4.8) continue;
        }
        const border = i === -2 || i === 2 || j === 0;
        v.set(9, wy + j, i, border ? 'brass' : 'glassWarm');
        v.set(-10, wy + j, i, border ? 'brass' : 'glassWarm');
      }
  }

  /* ---- the clock stage (upper section) ----------------------- */
  const DB = SB + SH;      // 31 — dial stage base
  v.boxShell(-11, DB, -11, 23, 10, 23, 'stone');
  for (let y = DB; y < DB + 10; y++)
    for (let i = -11; i <= 11; i++)
      for (let k = -11; k <= 11; k++) {
        if (!(i === -11 || i === 11 || k === -11 || k === 11)) continue;
        v.set(i, y, k, (i === -11 || i === 11) && (k === -11 || k === 11) ? 'stoneDark' : y % 3 === 0 ? 'stoneLight' : 'stone');
      }
  v.boxFrame(-11, DB, -11, 23, 10, 23, 'brass', 1);

  // cornice
  v.box(-13, DB + 10, -13, 27, 2, 27, 'stoneLight');
  v.boxFrame(-13, DB + 10, -13, 27, 2, 27, 'brass', 1);
  v.box(-12, DB + 12, -12, 25, 2, 25, 'stone');

  /* ---- four illuminated dials -------------------------------- */
  const dialY = DB + 5;
  const R = 7;
  clockDial(v, 0, dialY, 11, R);              // south (+Z) — faces the plaza
  clockDial(v, 0, dialY, -12, R);             // north
  clockDial(v, 11, dialY, 0, R);              // east
  clockDial(v, -12, dialY, 0, R);             // west
  // pediment above each dial
  for (const [px, pz] of [[0, 12], [0, -12], [12, 0], [-12, 0]])
    v.box(px - 3, dialY + R + 2, pz - 1, 7, 2, 3, 'brass');

  /* ---- the great gear train on the south face ---------------- */
  // The static mounting plate + shafts live in the static canvas; the three
  // rotating wheels are separate animated objects (see anim below).
  v.box(-11, DB + 1, 11, 23, 8, 1, 'ironDark');      // backing plate
  v.boxFrame(-11, DB + 1, 11, 23, 8, 1, 'brass', 1);
  anim.gears = [
    { r: 5.6, teeth: 18, x: -5, y: dialY, mat: 'brass', hub: 'iron', speed: 0.16 },
    { r: 3.6, teeth: 12, x: 4, y: dialY + 2, mat: 'copper', hub: 'ironDark', speed: -0.34 },
    { r: 2.4, teeth: 9, x: 6, y: dialY - 4, mat: 'gold', hub: 'iron', speed: 0.62 },
  ];

  /* ---- exposed pipework climbing the shaft ------------------ */
  pipe(v, -8, SB, 10, -8, DB + 2, 10, 1, 'copper', 'iron');
  pipe(v, -7, SB + 1, 10, -7, DB + 3, 10, 1, 'iron', 'brass');
  pipe(v, 8, SB, -10, 8, DB + 1, -10, 1, 'copper', 'iron');
  for (const py of [SB + 4, SB + 12, SB + 20]) {
    v.sphere(-8, py, 10, 2.2, 'brass');
    v.set(-8, py + 3, 10, 'iron');
  }
  // pressure gauges
  for (const gy of [SB + 8, SB + 16]) {
    v.box(-9, gy, 10, 3, 3, 2, 'iron');
    v.set(-8, gy + 1, 11, 'lampCyan');
  }

  /* ---- copper dome + lantern crown --------------------------- */
  const domeY0 = DB + 14;
  v.cylY(0, domeY0, 0, 10, 1, 'copper', { hollow: false });
  v.domeY(0, domeY0, 0, 10, 'copper');
  // dome ribs
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    for (let s = 0; s < 11; s++) {
      const rr = Math.cos((s / 11) * (Math.PI / 2)) * 10;
      const hh = Math.sin((s / 11) * (Math.PI / 2)) * 10;
      v.set(Math.round(Math.cos(ang) * rr), domeY0 + Math.round(hh), Math.round(Math.sin(ang) * rr), 'copperOx');
    }
  }
  v.ringY(0, domeY0, 0, 10, 1.4, 'brass');
  // lantern gallery
  v.ringY(0, domeY0 + 10, 0, 4, 1.2, 'brass');
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    v.set(Math.round(Math.cos(ang) * 4), domeY0 + 10, Math.round(Math.sin(ang) * 4), 'brass');
  }
  v.box(-3, domeY0 + 9, -3, 7, 3, 7, 'lampWarm');
  v.boxFrame(-4, domeY0 + 9, -4, 9, 4, 9, 'brass', 1);
  v.coneY(0, domeY0 + 12, 0, 4, 0, 5, 'copper');

  /* ---- weathervane (animated) -------------------------------- */
  anim.vane = { y: domeY0 + 18 };
  v.cylY(0, domeY0 + 17, 0, 0.9, 4, 'ironDark');
  v.set(0, domeY0 + 21, 0, 'gold');

  /* ---- ground dressing: two lamp posts on the plinth --------- */
  lampPost(v, -16, 5, 10, 7, 'ironDark', 'lampWarm');
  lampPost(v, 16, 5, 10, 7, 'ironDark', 'lampWarm');

  return { v, anim };
}

export default buildClockTower;