/**
 * THE GILDED EYE — the observatory.
 * A pale limestone rotunda on a stepped drum, crowned by a ribbed copper dome
 * that opens on a slit, with a huge brass refractor telescope inside
 * (the telescope tube is an animated child object).
 */
import { gearXY, gearXZ, archedWindowZ, archOutline, pipe, lampPost } from './parts.js';

export const OBSERVATORY_HEIGHT = 34;

export function buildObservatory(v) {
  const anim = {};

  /* ---- terrace + steps -------------------------------------- */
  v.discY(0, 0, 0, 15, 'stoneDark');
  v.discY(0, 1, 0, 14, 'stone');
  v.discY(0, 2, 0, 13, 'stoneLight');
  // radial paving lines
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    for (let s = 3; s < 13; s++)
      v.set(Math.round(Math.cos(ang) * s), 2, Math.round(Math.sin(ang) * s), a % 2 ? 'stone' : 'stoneLight');
  }
  // stair flight on the south side
  for (let s = 0; s < 4; s++) v.box(-4, 2 - s, 13 + s, 9, 1, 1, 'stoneLight');
  v.cylY(0, -1, 0, 12, 3, 'stoneDark');

  /* ---- the drum --------------------------------------------- */
  const R = 11;
  const H = 13;
  v.cylY(0, 3, 0, R, H, 'cream', { hollow: true, thickness: 2 });
  // fluting + banding
  for (let y = 3; y < 3 + H; y++)
    for (let i = -R; i <= R; i++)
      for (let k = -R; k <= R; k++) {
        const d = Math.sqrt(i * i + k * k);
        if (d > R || d < R - 1.6) continue;
        const fluting = Math.abs(((Math.atan2(k, i) / (Math.PI * 2)) * 24) % 2 - 1) < 0.35;
        v.set(i, y, k, fluting ? 'stoneLight' : y % 4 === 0 ? 'stoneLight' : 'cream');
      }
  v.ringY(0, 3, 0, R, 1.4, 'stoneLight');
  v.ringY(0, 3 + H - 2, 0, R, 1.4, 'stoneLight');

  // pilasters with capitals
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2;
    const px = Math.round(Math.cos(ang) * (R + 0.6));
    const pz = Math.round(Math.sin(ang) * (R + 0.6));
    v.box(px - 1, 3, pz - 1, 3, H, 3, 'stoneLight');
    v.box(px - 2, 3 + H - 3, pz - 2, 5, 2, 5, 'stone');
    v.box(px - 2, 3, pz - 2, 5, 1, 5, 'stoneLight');
  }

  /* ---- windows: tall arched lights between the pilasters ----- */
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2 + Math.PI / 8;
    const px = Math.round(Math.cos(ang) * (R - 0.5));
    const pz = Math.round(Math.sin(ang) * (R - 0.5));
    // carve an opening then fill with glass
    for (let i = -2; i <= 2; i++)
      for (let j = 0; j < 8; j++) {
        if (j >= 5) {
          const dy = j - 4;
          if (i * i + dy * dy > 6) continue;
        }
        v.set(px + i, 6 + j, pz, i === -2 || i === 2 || j === 0 ? 'brass' : 'glassWarm');
      }
  }

  /* ---- cornice + dome drum ---------------------------------- */
  const corniceY = 3 + H;
  v.cylY(0, corniceY, 0, R + 2, 2, 'stoneLight');
  v.ringY(0, corniceY, 0, R + 2, 1.4, 'brass');
  v.cylY(0, corniceY + 2, 0, 9, 3, 'cream');
  /* The dome is stepped one INTEGER course at a time. Walking the shell by
     parameter (t = y/N) and rounding the height skipped whole courses — y=23
     came out empty all the way round, which read as a horizontal see-through
     band under the ribs. Stepping over y guarantees a closed shell.
     Each course is painted as a radial BAND (outer edge -> inner edge) rather
     than two separate rings, so the layers always overlap and can never leave
     a detached voxel floating between courses. */
  const DOME_R = 9, DOME_H = 9, DOME_Y0 = corniceY + 5, DOME_T = 1.8;
  const domeR = (j) => Math.cos((j / DOME_H) * Math.PI * 0.5) * DOME_R;
  const domeDeg = (i, k) => (((Math.atan2(k, i) * 180) / Math.PI) + 360) % 360;
  const inSlit = (deg) => deg > 38 && deg < 74; // the observing slit
  const RING = Math.ceil(DOME_R);
  /** true when cell (i,k) belongs to course j's shell band */
  const shell = (i, k, j) => {
    const rr = domeR(j);
    const d = Math.hypot(i, k);
    return d <= rr + 0.5 && d >= rr - DOME_T;
  };

  // copper shell — closed band on every course, slit carved out of all of them
  for (let j = 0; j <= DOME_H; j++)
    for (let i = -RING; i <= RING; i++)
      for (let k = -RING; k <= RING; k++) {
        if (!shell(i, k, j) || inSlit(domeDeg(i, k))) continue;
        v.set(i, DOME_Y0 + j, k, 'copper');
      }

  // ribs on top of the shell, skipped across the slit so it stays open
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const deg = ((ang * 180) / Math.PI + 360) % 360;
    if (deg > 34 && deg < 78) continue;
    for (let j = 0; j <= DOME_H; j++) {
      const rr = domeR(j);
      v.set(Math.round(Math.cos(ang) * rr), DOME_Y0 + j, Math.round(Math.sin(ang) * rr), 'copperOx');
    }
  }

  // brass oculus: a solid cap over the top courses, then the finial
  for (let j = DOME_H - 2; j <= DOME_H; j++)
    for (let i = -RING; i <= RING; i++)
      for (let k = -RING; k <= RING; k++)
        if (Math.hypot(i, k) <= domeR(j) + 0.5)
          v.set(i, DOME_Y0 + j, k, 'brass');
  anim.domeY = DOME_Y0;
  v.set(0, DOME_Y0 + DOME_H + 1, 0, 'gold');

  /* ---- the great refractor (animated tube) ------------------- */
  anim.telescope = { x: 0, y: corniceY + 1, z: 0 };
  // mount, pier and equatorial head (static)
  v.cylY(0, 4, 0, 3.4, 8, 'stoneLight');
  v.cylY(0, 12, 0, 2.6, 2, 'brass');
  v.box(-2, 14, -2, 5, 3, 5, 'brass');
  // declination axis stub
  v.cylX(-5, 15, 0, 1.6, 11, 'iron');
  v.sphere(5, 15, 0, 2, 'brass');

  /* ---- orrery / gear works on the terrace -------------------- */
  anim.orrery = { y: 4 };
  v.cylY(-8, 2, 6, 3, 1, 'stoneDark');
  v.cylY(-8, 3, 6, 1, 5, 'brass');
  v.sphere(-8, 8, 6, 1.6, 'gold');
  gearXY(v, -4, 4, 12, 3.2, 12, 'copper', 'iron');

  /* ---- dressing --------------------------------------------- */
  pipe(v, 11, 3, 0, 11, corniceY, 0, 1.2, 'copper', 'iron');
  pipe(v, 11, 3, 0, 6, 3, 6, 1.2, 'copper', 'iron');
  lampPost(v, -13, 2, 6, 7, 'ironDark', 'lampAmber');
  lampPost(v, 13, 2, -6, 7, 'ironDark', 'lampAmber');
  lampPost(v, 0, 2, 14, 7, 'ironDark', 'lampAmber');

  return { v, anim };
}

export default buildObservatory;