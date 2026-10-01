/**
 * THE BEACON OF AETHER — the energy tower / lighthouse.
 * The tallest silhouette on the island: a tapered iron lattice mast on a
 * stone bastion, wrapped with copper conductors, topped by a rotating
 * fresnel lens housing and four buttress arms. The lens and the arc
 * filaments are animated children.
 */
import { gearXZ, pipe, chain, lampPost, archOutline, barrel } from './parts.js';

export const ENERGYTOWER_HEIGHT = 58;

export function buildEnergyTower(v) {
  const anim = {};

  /* ---- stone bastion ---------------------------------------- */
  v.cylY(0, 0, 0, 11, 3, 'stoneDark');
  v.cylY(0, 3, 0, 10, 3, 'stone');
  v.cylY(0, 6, 0, 8.6, 1, 'stoneLight');
  // machicolated parapet
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const px = Math.round(Math.cos(ang) * 8.6);
    const pz = Math.round(Math.sin(ang) * 8.6);
    v.box(px, 7, pz, 2, 2, 2, 'stoneLight');
    v.set(px + 1, 7, pz + 1, 'stoneDark');
  }
  v.ringY(0, 7, 0, 9.4, 1.4, 'stoneLight');
  // arched openings around the bastion
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.4;
    const px = Math.round(Math.cos(ang) * 8);
    const pz = Math.round(Math.sin(ang) * 8);
    archOutline(v, px - 1, 2, pz - 1, 4, 5, 2, 'stoneLight');
    v.set(px, 2, pz, 'lampAmber');
  }

  /* ---- tapered lattice mast --------------------------------- */
  const BASE = 9;
  const H = 34;
  const legs = 4;
  const legPos = (t) => 7 - t * 5.2; // radius shrinks upward

  for (let s = 0; s < H; s++) {
    const y0 = BASE + s;
    const r0 = legPos(s / H);
    const r1 = legPos((s + 1) / H);
    if (s % 4 === 0) {
      // horizontal ring
      for (let l = 0; l < legs; l++) {
        const a0 = (l / legs) * Math.PI * 2 + Math.PI / 4;
        const a1 = ((l + 1) / legs) * Math.PI * 2 + Math.PI / 4;
        v.line(
          Math.cos(a0) * r0, y0, Math.sin(a0) * r0,
          Math.cos(a1) * r0, y0, Math.sin(a1) * r0,
          'iron',
        );
      }
    }
    // diagonal braces
    const a0 = (0 / legs) * Math.PI * 2 + Math.PI / 4;
    const a1 = (1 / legs) * Math.PI * 2 + Math.PI / 4;
    v.line(
      Math.cos(a0) * r0, y0, Math.sin(a0) * r0,
      Math.cos(a1) * r1, y0 + 1, Math.sin(a1) * r1,
      'ironDark',
    );
  }
  // the four main legs
  for (let l = 0; l < legs; l++) {
    const ang = (l / legs) * Math.PI * 2 + Math.PI / 4;
    for (let s = 0; s < H; s++) {
      const r = legPos(s / H);
      v.set(Math.round(Math.cos(ang) * r), BASE + s, Math.round(Math.sin(ang) * r), s % 8 === 0 ? 'ironLight' : 'iron');
    }
  }

  /* ---- copper conductors spiralling up the mast ------------ */
  for (let s = 0; s < H; s++) {
    const t = s / H;
    const r = legPos(t) + 0.9;
    const a = t * Math.PI * 3.4;
    v.set(Math.round(Math.cos(a) * r), BASE + s, Math.round(Math.sin(a) * r), 'copper');
  }
  // service ladder
  for (let s = 0; s < H; s += 1) {
    const r = legPos(s / H) - 1;
    v.set(Math.round(r), BASE + s, 0, 'ironLight');
    v.set(Math.round(-r), BASE + s, 0, 'ironLight');
    if (s % 3 === 0) v.box(Math.round(-r), BASE + s, 0, Math.round(r * 2) + 1, 1, 1, 'ironDark');
  }

  /* ---- mid platform ----------------------------------------- */
  const MID = BASE + 18;
  v.cylY(0, MID, 0, 5.6, 1, 'iron');
  v.ringY(0, MID, 0, 5.6, 1.2, 'brass');
  for (let l = 0; l < 8; l++) {
    const a = (l / 8) * Math.PI * 2;
    v.box(Math.round(Math.cos(a) * 5) - 1, MID + 1, Math.round(Math.sin(a) * 5) - 1, 2, 2, 2, 'brass');
  }
  // equipment shed on the platform
  v.box(-3, MID + 1, -3, 6, 4, 6, 'ironDark');
  v.box(-4, MID + 5, -4, 8, 1, 8, 'copper');
  v.set(0, MID + 3, 3, 'lampCyan');
  anim.platform = MID;

  /* ---- upper lantern house ---------------------------------- */
  const LAN = BASE + H - 4;
  v.cylY(0, LAN, 0, 6, 1, 'brass');
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    v.box(Math.round(Math.cos(ang) * 5) - 1, LAN + 1, Math.round(Math.sin(ang) * 5) - 1, 2, 9, 2, 'brass');
  }
  // lens housing (the rotating part is a child object)
  anim.lens = { y: LAN + 2 };
  v.ringY(0, LAN + 1, 0, 5.6, 1.4, 'brass');
  v.ringY(0, LAN + 10, 0, 5.6, 1.4, 'brass');
  v.cylY(0, LAN + 11, 0, 6.4, 2, 'copper');
  v.coneY(0, LAN + 13, 0, 6.4, 0, 5, 'copper');
  v.set(0, LAN + 18, 0, 'gold');
  v.cylY(0, LAN + 18, 0, 0.8, 3, 'ironDark');

  /* ---- buttress arms reaching down to the bastion ---------- */
  for (let l = 0; l < 4; l++) {
    const ang = (l / 4) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    v.line(ca * 6, LAN, sa * 6, ca * 11, BASE - 2, sa * 11, 'iron');
    v.line(ca * 6, LAN + 4, sa * 6, ca * 11, BASE + 4, sa * 11, 'ironDark');
  }

  /* ---- arc filaments (the "lightning" that powers it) ------ */
  anim.arcs = [];
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2;
    anim.arcs.push({
      x0: Math.cos(ang) * 4, z0: Math.sin(ang) * 4, y0: LAN + 6,
      x1: Math.cos(ang) * 1.5, z1: Math.sin(ang) * 1.5, y1: LAN + 6,
    });
  }

  /* ---- base dressing ---------------------------------------- */
  lampPost(v, -14, 6, 6, 7, 'ironDark', 'lampAmber');
  lampPost(v, 14, 6, -6, 7, 'ironDark', 'lampAmber');
  barrel(v, -13, 6, -3, 2, 5, 'iron');
  pipe(v, 9, 8, 3, 9, 8, 12, 1.4, 'copper', 'iron');
  pipe(v, 9, 8, 12, -6, 8, 14, 1.4, 'copper', 'iron');
  chain(v, -6, 8, 8, -12, 6, 10, 'ironDark', 2);

  return { v, anim };
}

export default buildEnergyTower;