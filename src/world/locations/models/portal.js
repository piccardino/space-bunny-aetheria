/**
 * THE THRESHOLD — the portal.
 * An ancient steampunk arch: two weathered pylons carrying three concentric
 * brass rings (the inner rings counter-rotate), a keystone mechanism and a
 * field of energy at the centre. The rings and the energy disc are animated
 * children, which is what makes the portal feel alive even at a distance.
 *
 * Faces +Z, centred on x/z = 0, base at y = 0.
 */
import { gearXY, archOutline, pipe, lampPost, chain, barrel } from './parts.js';

export const PORTAL_HEIGHT = 34;

export function buildPortal(v) {
  const anim = {};

  /* ---- paved dais ------------------------------------------- */
  v.discY(0, 0, 0, 15, 'stoneDark');
  v.discY(0, 1, 0, 14, 'slate');
  v.discY(0, 2, 0, 12, 'basalt');
  // inlaid brass compass rose
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    for (let s = 3; s < 12; s++)
      v.set(Math.round(Math.cos(ang) * s), 2, Math.round(Math.sin(ang) * s), a % 4 === 0 ? 'gold' : 'brass');
  }
  for (let r = 4; r <= 11; r += 3) v.ringY(0, 2, 0, r, 0.8, 'brassDark');
  // steps
  for (let s = 0; s < 4; s++) v.box(-7, 1 - s, 14 + s, 15, 1, 1, 'stoneDark');

  /* ---- the two pylons --------------------------------------- */
  const PY = 3;
  const PH = 24;
  for (const s of [-1, 1]) {
    const px = s * 11;
    v.box(px - 3, PY, -3, 6, 3, 6, 'stoneLight');       // base
    v.box(px - 2, PY + 3, -2, 5, PH - 4, 5, 'stoneDark');
    v.box(px - 3, PY + PH - 2, -3, 7, 3, 7, 'stoneLight');
    // fluting + glyph bands
    for (let y = PY + 4; y < PY + PH - 3; y++) {
      for (let i = -2; i <= 2; i++)
        for (let k = -2; k <= 2; k++) {
          if (Math.abs(i) !== 2 && Math.abs(k) !== 2) continue;
          if (i === 0 && k === 0) continue;
          const glyph = (y % 7 === 0) && (i === 0 || k === 0);
          v.set(px + i, y, k, glyph ? 'gold' : 'stone');
        }
    }
    // copper conduit up the pylon
    v.box(px - 1, PY + 3, -3, 3, PH - 8, 1, 'copper');
    v.box(px - 1, PY + 3, 2, 3, PH - 8, 1, 'copper');
    v.set(px, PY + 6, 3, 'lampCyan');
    v.set(px, PY + 14, 3, 'lampCyan');
  }

  /* ---- the archway between the pylons ----------------------- */
  // stepped stone arch
  for (let s = 0; s <= 10; s++) {
    const halfW = 9 - s;
    for (const side of [-1, 1]) {
      const px = side * halfW;
      for (let k = -3; k <= 3; k++) {
        v.box(px - 1, PY + PH - 2 + s, k, 2, 1, 7, s % 2 ? 'stoneLight' : 'stone');
      }
    }
    if (s === 10) v.box(-2, PY + PH + 8, -3, 5, 2, 7, 'stoneLight');
  }
  // keystone mechanism: a large gear at the crown
  v.box(-4, PY + PH + 6, -2, 9, 3, 5, 'brass');
  anim.crownGear = { y: PY + PH + 7, z: 3, r: 3.4, teeth: 14, speed: -0.2 };
  v.set(0, PY + PH + 11, 0, 'gold');

  /* ---- the three concentric rings (animated) ---------------- */
  // Static mounting: the ring carriers + counterweight arms.
  for (const s of [-1, 1]) {
    v.box(s * 7 - 1, PY + 14, -1, 3, 6, 3, 'iron');
    v.set(s * 7, PY + 16, 0, 'brass');
    v.box(s * 7 - 1, PY + 20, -1, 3, 4, 3, 'iron');
    v.set(s * 7, PY + 22, 0, 'brass');
  }
  anim.rings = [
    { r: 10, thickness: 1.6, y: PY + 17, speed: 0.11, mat: 'brass' },
    { r: 8, thickness: 1.4, y: PY + 17, speed: -0.19, mat: 'gold' },
    { r: 6, thickness: 1.2, y: PY + 17, speed: 0.31, mat: 'copper' },
  ];

  /* ---- energy field (animated child: a disc + particles) --- */
  anim.field = { y: PY + 17, r: 9 };

  /* ---- rune stones around the dais -------------------------- */
  const runeMats = ['lampCyan', 'portalCore', 'neonPink', 'energy'];
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2 + 0.26;
    const px = Math.round(Math.cos(ang) * 14);
    const pz = Math.round(Math.sin(ang) * 14);
    v.box(px - 1, 2, pz - 1, 3, 5, 3, 'stoneDark');
    v.box(px - 1, 7, pz - 1, 3, 2, 3, 'stoneLight');
    v.set(px, 5, pz, runeMats[a % 4]);
    anim.runeIdx = anim.runeIdx ?? [];
    anim.runeIdx.push({ x: px, y: 5, z: pz, phase: a * 0.5 });
  }

  /* ---- dressing: lanterns, barrels, chains ------------------ */
  lampPost(v, -16, 2, 4, 8, 'ironDark', 'portalCore');
  lampPost(v, 16, 2, 4, 8, 'ironDark', 'portalCore');
  barrel(v, -15, 2, -8, 2, 5, 'iron');
  barrel(v, 15, 2, -8, 2, 6, 'iron');
  pipe(v, -11, 5, 3, -16, 5, 3, 1.4, 'copper', 'iron');
  pipe(v, 11, 5, 3, 16, 5, 3, 1.4, 'copper', 'iron');
  chain(v, -11, PY + PH - 2, 0, -11, PY + 8, 6, 'ironDark', 2);
  chain(v, 11, PY + PH - 2, 0, 11, PY + 8, 6, 'ironDark', 2);

  return { v, anim };
}

export default buildPortal;