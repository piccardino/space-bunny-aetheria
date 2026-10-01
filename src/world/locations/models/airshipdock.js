/**
 * THE MOORING MAST — airship dock.
 * A cantilevered stone-and-iron jetty with four mooring pylons, a gantry crane,
 * a control cabin, festoon lighting and a voxel dirigible tied alongside
 * (the airship hull itself is an animated child object).
 */
import { chain, barrel, crate, lampPost, pipe, chimney } from './parts.js';

export const DOCK_HEIGHT = 24;

export function buildAirshipDock(v) {
  const anim = {};

  /* ---- stone jetty platform ---------------------------------- */
  v.box(-10, 0, -12, 22, 3, 26, 'stoneDark');
  v.box(-10, 3, -12, 22, 1, 26, 'stone');
  // plank decking
  for (let k = -12; k < 14; k += 2) v.box(-9, 4, k, 20, 1, 1, 'wood');
  v.boxFrame(-10, 0, -12, 22, 4, 26, 'ironDark', 1);
  // support legs descending into the void
  for (const [lx, lz] of [[-8, -10], [8, -10], [-8, 10], [8, 10]]) {
    v.box(lx, -14, lz, 2, 14, 2, 'stoneDark');
    v.box(lx - 1, -15, lz - 1, 4, 1, 4, 'iron');
    v.box(lx - 1, -8, lz - 1, 4, 1, 4, 'ironDark');
  }
  // cross bracing
  v.line(-8, -12, -10, 8, -6, -10, 'ironDark');
  v.line(8, -12, -10, -8, -6, -10, 'ironDark');
  v.line(-8, -12, 10, 8, -6, 10, 'ironDark');
  v.line(8, -12, 10, -8, -6, 10, 'ironDark');

  /* ---- four mooring pylons ----------------------------------- */
  anim.pylons = [];
  for (const [px, pz] of [[-7, -8], [7, -8], [-7, 8], [7, 8]]) {
    v.box(px - 1, 5, pz - 1, 3, 16, 3, 'iron');
    v.box(px - 1, 5, pz - 1, 3, 1, 3, 'ironLight');
    v.boxFrame(px - 2, 6, pz - 2, 5, 15, 5, 'ironDark', 1);
    // brass cap + lamp
    v.box(px - 2, 21, pz - 2, 5, 2, 5, 'brass');
    v.box(px - 1, 23, pz - 1, 3, 2, 3, 'lampCyan');
    v.coneY(px, 25, pz, 2.4, 0, 3, 'copper');
    v.set(px, 28, pz, 'gold');
    // mooring horn
    v.cylZ(px, 17, pz + (pz > 0 ? 3 : -3), 1.6, 4, 'brass');
    v.sphere(px, 17, pz + (pz > 0 ? 5 : -3), 1.6, 'brass');
    anim.pylons.push({ x: px, y: 17, z: pz + (pz > 0 ? 5 : -3) });
  }

  /* ---- gantry crane ------------------------------------------ */
  anim.crane = { y: 22 };
  // rails along the dock
  v.box(-9, 5, -11, 2, 1, 24, 'ironLight');
  v.box(7, 5, -11, 2, 1, 24, 'ironLight');
  // the travelling bridge (animated along Z)
  v.box(-10, 20, -1, 21, 2, 3, 'iron');
  v.boxFrame(-10, 20, -1, 21, 2, 3, 'brass', 1);
  v.box(-9, 18, -1, 3, 2, 3, 'ironDark');   // winch housing
  v.cylX(-8, 18, 0, 1.6, 6, 'brass');        // cable drum
  v.line(0, 18, 0, 0, 8, 0, 'ironDark');     // hoist cable (animated tip)
  anim.hook = { x: 0, y: 18, z: 0 };
  // lattice
  for (let i = -9; i <= 9; i += 3) {
    v.line(i, 20, -1, i + 2, 22, 1, 'ironDark');
    v.line(i + 2, 22, 1, i + 3, 20, -1, 'ironDark');
  }

  /* ---- control cabin on the landward side ------------------- */
  v.box(11, 4, -6, 9, 8, 9, 'wood');
  v.box(11, 4, -6, 9, 1, 9, 'woodDark');
  v.boxFrame(11, 4, -6, 9, 8, 9, 'ironDark', 1);
  v.windowZ(12, 7, 2, 7, 4, 'glassWarm', 'brass');
  v.windowZ(12, 7, -6, 7, 4, 'glassWarm', 'brass');
  v.windowX(19, 7, -5, 7, 4, 'glassWarm', 'brass');
  // pitched roof + chimney
  v.coneY(15, 12, -1, 7, 0, 5, 'copper');
  chimney(v, 18, 12, -4, 1, 5, 'brick');
  // antenna & windsock
  v.cylY(15, 17, -1, 0.8, 6, 'ironDark');
  v.set(15, 23, -1, 'lampRed');
  anim.windsock = { x: 15, y: 21, z: -1 };

  /* ---- festoon lighting across the dock --------------------- */
  anim.festoons = [
    { a: [-8, 8, -8], b: [8, 8, 8] },
    { a: [-8, 8, 8], b: [8, 8, -8] },
  ];
  for (const f of anim.festoons) {
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sag = Math.sin(t * Math.PI) * 3.2;
      const px = Math.round(f.a[0] + (f.b[0] - f.a[0]) * t);
      const pz = Math.round(f.a[2] + (f.b[2] - f.a[2]) * t);
      const py = Math.round(f.a[1] + (f.b[1] - f.a[1]) * t - sag);
      v.set(px, py, pz, s % 3 === 0 ? 'lampWarm' : 'ironDark');
    }
  }

  /* ---- mooring ropes from the pylon tips (animated sway) ----- */
  anim.ropes = anim.pylons.map((p) => ({ from: [p.x, p.y, p.z], to: [0, 12, 2] }));
  for (const r of anim.ropes) chain(v, r.from[0], r.from[1], r.from[2], r.to[0], r.to[1], r.to[2], 'canvasCloth', 2);

  /* ---- deck dressing ----------------------------------------- */
  barrel(v, -8, 5, -11, 2, 5);
  barrel(v, -6, 5, -11, 2, 6, 'woodDark');
  crate(v, 9, 5, -4, 2);
  crate(v, 9, 5, 1, 3, 'woodDark');
  pipe(v, -9, 6, 12, -9, 14, 12, 1.2, 'copper', 'iron');
  pipe(v, -9, 14, 12, 9, 14, 12, 1.2, 'copper', 'iron');
  lampPost(v, -9, 5, -13, 7, 'ironDark', 'lampWarm');
  lampPost(v, 9, 5, -13, 7, 'ironDark', 'lampWarm');
  // fuel bowsers
  for (const fz of [-6, 4]) {
    v.cylX(-6, 7, fz, 2, 7, 'iron');
    v.box(-6, 9, fz - 2, 7, 1, 4, 'ironDark');
    v.set(-3, 9, fz, 'lampAmber');
    v.box(-7, 5, fz - 2, 1, 2, 1, 'ironLight');
    v.box(-1, 5, fz - 2, 1, 2, 1, 'ironLight');
  }

  /* ---- airship envelope is NOT in this canvas --------------- */
  // Built separately (see airship.js) so it can drift and bob independently.
  anim.airship = { x: 0, y: 13, z: 2, heading: 0 };

  return { v, anim };
}

export default buildAirshipDock;