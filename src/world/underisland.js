/**
 * THE UNDERSTRUCTURE
 * ------------------
 * Everything that keeps Aetheria in the air. This is the part of the island
 * people never see until they orbit underneath, so it is built to reward that:
 * a keel of dark rock housing four aetherial drive rings, a lattice of pipes
 * and cable runs, cooling stacks, reactor cores and hanging chains.
 *
 * The rotating parts (propellers, turbines, flywheels) are returned in `anim`
 * and rendered as separate meshes so they can actually spin.
 */
import { gearXY, gearXZ, pipe, chain, barrel, crate } from './locations/models/parts.js';
import { makeRng } from '../core/math.js';
import { WORLD, bottomAt, isInside } from './config.js';

export function buildUnderstructure(heightAt) {
  const v = new (class extends Map {})(); // placeholder, replaced below
  return v;
}

/**
/**
 * Builds the whole under-island machinery into `canvas`.
 *
 * @param {import('../voxel/VoxelCanvas.js').default} canvas
 * @param {(x:number,z:number)=>number} heightAt
 * @returns {{ anim: object }} handles for the rotating/emissive children
 */
export function buildUnderisland(canvas, heightAt) {
  const anim = { propellers: [], turbines: [], gears: [], reactors: [], chains: [], vents: [] };
  const rng = makeRng(8821);
  const R = WORLD.radius;

  /* ================================================================ *
   * 1. ROCK SPURS — the keel fanning out under the island
   * ================================================================ */
  for (let a = 0; a < 22; a++) {
    const ang = (a / 22) * Math.PI * 2 + rng() * 0.2;
    const rad = R * (0.22 + rng() * 0.5);
    const x0 = Math.round(Math.cos(ang) * rad);
    const z0 = Math.round(Math.sin(ang) * rad);
    if (!isInside(x0, z0)) continue;
    const top = heightAt(x0, z0);
    const bot = bottomAt(x0, z0);
    const len = Math.max(3, Math.round(rng() * 7));
    for (let s = 0; s < len; s++) {
      const y = bot - s;
      const shrink = s / len;
      const rr = Math.max(1.5, 5 * (1 - shrink));
      const mat = shrink > 0.7 ? 'basalt' : shrink > 0.4 ? 'stoneDark' : 'stone';
      for (let i = -6; i <= 6; i++)
        for (let k = -6; k <= 6; k++) {
          if (Math.sqrt(i * i + k * k) > rr) continue;
          canvas.setIfEmpty(x0 + i, y, z0 + k, mat);
        }
    }
  }

  /* ================================================================ *
   * 2. THE FOUR AETHERIAL DRIVES
   *    Huge propellers in brass cowlings, mounted on pylons beneath the
   *    widest part of the island. These are the silhouette read from below.
   * ================================================================ */
  const driveAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (let d = 0; d < driveAngles.length; d++) {
    const ang = driveAngles[d];
    const px = Math.round(Math.cos(ang) * R * 0.52);
    const pz = Math.round(Math.sin(ang) * R * 0.52);
    const surf = heightAt(px, pz);
    const anchorY = bottomAt(px, pz) - 4;

    // pylon: a thick riveted column running up into the rock
    canvas.cylY(px, anchorY - 2, pz, 5, Math.max(6, surf - anchorY - 2), 'ironDark', { capTop: false, capBot: false });
    for (let y = anchorY; y < surf - 2; y += 4) {
      canvas.ringY(px, y, pz, 5.6, 1.2, 'iron');
      for (let a2 = 0; a2 < 6; a2++) {
        const aa = (a2 / 6) * Math.PI * 2;
        canvas.set(px + Math.round(Math.cos(aa) * 5.4), y + 2, pz + Math.round(Math.sin(aa) * 5.4), 'brass');
      }
    }

    // gearbox housing at the base of the pylon
    canvas.cylY(px, anchorY - 6, pz, 8, 5, 'iron', { capTop: false });
    canvas.ringY(px, anchorY - 6, pz, 8, 1.4, 'brass');
    canvas.cylY(px, anchorY - 9, pz, 6.4, 4, 'ironDark', { capTop: false });
    for (let a2 = 0; a2 < 8; a2++) {
      const aa = (a2 / 8) * Math.PI * 2;
      canvas.set(px + Math.round(Math.cos(aa) * 6.6), anchorY - 8, pz + Math.round(Math.sin(aa) * 6.6), 'copper');
    }

    // the exhaust throat the propeller sits in
    canvas.cylY(px, anchorY - 14, pz, 9, 6, 'iron', { hollow: true, thickness: 1.6, capTop: false, capBot: false });
    canvas.ringY(px, anchorY - 14, pz, 9.4, 1.4, 'brass');
    // stator vanes inside the throat
    for (let a2 = 0; a2 < 10; a2++) {
      const aa = (a2 / 10) * Math.PI * 2;
      canvas.line(
        px, anchorY - 13, pz,
        px + Math.round(Math.cos(aa) * 8), anchorY - 9, pz + Math.round(Math.sin(aa) * 8),
        'ironLight',
      );
    }
    // glowing throat interior
    canvas.discY(px, anchorY - 9, pz, 7, 'energy');

    // the spinning propeller (separate mesh, see anim)
    anim.propellers.push({
      x: px,
      y: anchorY - 12,
      z: pz,
      r: 10,
      blades: 4,
      speed: 0.55 + d * 0.09,
      phase: d * 0.7,
    });

    // feed pipes running up the pylon
    for (let a2 = 0; a2 < 3; a2++) {
      const aa = (a2 / 3) * Math.PI * 2 + 0.4;
      pipe(
        canvas,
        px + Math.round(Math.cos(aa) * 6), anchorY - 4, pz + Math.round(Math.sin(aa) * 6),
        px + Math.round(Math.cos(aa) * 4), surf - 6, pz + Math.round(Math.sin(aa) * 4),
        1, a2 === 0 ? 'copper' : 'iron', 'brass',
      );
    }
  }

  /* ================================================================ *
   * 3. REACTOR CORES — three glowing furnaces bolted to the keel
   * ================================================================ */
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.9;
    const rx = Math.round(Math.cos(ang) * R * 0.3);
    const rz = Math.round(Math.sin(ang) * R * 0.3);
    const bot = bottomAt(rx, rz);

    canvas.cylY(rx, bot - 9, rz, 8, 10, 'ironDark');
    canvas.ringY(rx, bot - 9, rz, 8.4, 1.4, 'brass');
    canvas.ringY(rx, bot - 1, rz, 8.4, 1.4, 'brass');
    canvas.coneY(rx, bot, rz, 8, 3, 4, 'iron');
    for (let f = 0; f < 12; f++) {
      const fa = (f / 12) * Math.PI * 2;
      for (let y = bot - 8; y < bot - 2; y += 2)
        canvas.box(rx + Math.round(Math.cos(fa) * 8), y, rz + Math.round(Math.sin(fa) * 8), 2, 1, 2, 'copper');
    }
    for (let f = 0; f < 6; f++) {
      const fa = (f / 6) * Math.PI * 2 + 0.5;
      canvas.set(rx + Math.round(Math.cos(fa) * 8), bot - 5, rz + Math.round(Math.sin(fa) * 8), 'ember');
    }
    anim.reactors.push({ x: rx, y: bot - 5, z: rz, r: 6 });
    anim.vents.push({ x: rx, y: bot + 1, z: rz, strength: 1.3, kind: 'heat' });

    // feeder pipe to the nearest drive pylon
    let best = { d: 1e9, idx: 0 };
    for (let k = 0; k < driveAngles.length; k++) {
      const dd = Math.abs(((driveAngles[k] - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (dd < best.d) best = { d: dd, idx: k };
    }
    const dAng = driveAngles[best.idx];
    const dxp = Math.round(Math.cos(dAng) * R * 0.52);
    const dzp = Math.round(Math.sin(dAng) * R * 0.52);
    pipe(canvas, rx, bot - 6, rz, dxp, bottomAt(dxp, dzp) - 4, dzp, 1.4, 'copper', 'iron');
  }

  /* ================================================================ *
   * 4. TURBINE BANKS under the rim
   * ================================================================ */
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.3;
    const rad = R * (0.62 + rng() * 0.2);
    const tx = Math.round(Math.cos(ang) * rad);
    const tz = Math.round(Math.sin(ang) * rad);
    if (!isInside(tx, tz, 4)) continue;
    const bot = bottomAt(tx, tz);

    canvas.cylY(tx, bot - 6, tz, 6, 7, 'ironDark', { hollow: true, thickness: 1.4, capTop: false, capBot: false });
    canvas.ringY(tx, bot - 6, tz, 6.4, 1.4, 'brass');
    canvas.discY(tx, bot - 6, tz, 5, 'ironDark');
    for (let b = 0; b < 12; b++) {
      const ba = (b / 12) * Math.PI * 2;
      canvas.line(tx, bot - 5, tz, tx + Math.round(Math.cos(ba) * 5), bot - 2, tz + Math.round(Math.sin(ba) * 5), 'ironLight');
    }
    anim.turbines.push({ x: tx, y: bot - 4, z: tz, r: 4.6, blades: 8, speed: 0.9 + rng() * 0.5, phase: rng() * 6 });
  }

  /* ================================================================ *
   * 5. PIPE LATTICE — the connective tissue of the underside
   * ================================================================ */
  for (let i = 0; i < 5; i++) {
    const a1 = (i / 5) * Math.PI * 2;
    const a2 = ((i + 1) / 5) * Math.PI * 2;
    const r1 = R * 0.52, r2 = R * 0.3;
    const p1 = [Math.round(Math.cos(a1) * r1), Math.round(Math.sin(a1) * r1)];
    const p2 = [Math.round(Math.cos(a2) * r1), Math.round(Math.sin(a2) * r2)];
    const y1 = bottomAt(p1[0], p1[1]) - 6;
    const y2 = bottomAt(p2[0], p2[1]) - 6;
    for (let p = 0; p < 3; p++)
      pipe(canvas, p1[0], y1 + p * 2, p1[1], p2[0], y2 + p * 2, p2[1], 1,
        p === 0 ? 'copper' : p === 1 ? 'iron' : 'brass', p === 0 ? 'iron' : 'copper');
  }

  /* ================================================================ *
   * 6. HANGING CHAINS + SLUNG CATWALKS
   * ================================================================ */
  for (let i = 0; i < 26; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = R * (0.2 + rng() * 0.72);
    const cx = Math.round(Math.cos(ang) * rad);
    const cz = Math.round(Math.sin(ang) * rad);
    if (!isInside(cx, cz, 3)) continue;
    const bot = bottomAt(cx, cz);
    const len = 4 + Math.floor(rng() * 14);
    const sway = rng() < 0.5 ? 1 : -1;
    chain(canvas, cx, bot, cz,
      cx + sway * Math.round(len * 0.12), bot - len, cz + Math.round(len * 0.06), 'ironDark', 1);
    anim.chains.push({ x: cx, y: bot, z: cz, len, phase: rng() * 6.28, amp: 0.012 + rng() * 0.02 });
  }

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.6;
    const rad = R * 0.36;
    const wx = Math.round(Math.cos(ang) * rad);
    const wz = Math.round(Math.sin(ang) * rad);
    const wy = bottomAt(wx, wz) - 12;
    canvas.box(wx - 7, wy, wz - 4, 15, 1, 9, 'ironDark');
    for (let k = 0; k < 9; k += 2) canvas.box(wx - 7, wy + 1, wz - 4 + k, 15, 1, 1, 'iron');
    for (const sx of [-7, 7]) {
      canvas.cylY(wx + sx, wy - 5, wz, 0.8, 5, 'iron', { capTop: false });
      canvas.cylY(wx + sx, wy - 5, wz + 4, 0.8, 5, 'iron', { capTop: false });
      chain(canvas, wx + sx, wy - 5, wz, wx + sx, wy - 12, wz, 'ironDark', 2);
    }
    canvas.box(wx - 6, wy + 2, wz - 1, 2, 2, 2, 'lampAmber');
    canvas.box(wx + 5, wy + 2, wz - 1, 2, 2, 2, 'lampAmber');
    barrel(canvas, wx - 3, wy + 1, wz + 2, 2, 5, 'iron');
    crate(canvas, wx + 2, wy + 1, wz + 2, 2, 'wood', 'iron');
  }

  /* ================================================================ *
   * 7. STEAM / HEAT VENTS (positions only; particles live in effects/)
   * ================================================================ */
  for (let i = 0; i < 10; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = R * (0.35 + rng() * 0.5);
    const vx = Math.round(Math.cos(ang) * rad);
    const vz = Math.round(Math.sin(ang) * rad);
    if (!isInside(vx, vz, 4)) continue;
    const bot = bottomAt(vx, vz);
    canvas.cylY(vx, bot - 3, vz, 2.2, 4, 'ironDark');
    canvas.ringY(vx, bot + 1, vz, 2.4, 1, 'iron');
    anim.vents.push({ x: vx, y: bot + 1, z: vz, strength: 0.7 + rng() * 0.6, kind: 'steam' });
  }

  /* ================================================================ *
   * 8. WEATHERING — rust and soot so it doesn't look factory-fresh
   * ================================================================ */
  const Rceil = Math.ceil(R) + 4;
  canvas.scatter(-Rceil, -70, -Rceil, Rceil, 14, Rceil, 'rust', rng, { chance: 0.02, onlyExposed: true });
  canvas.scatter(-Rceil, -70, -Rceil, Rceil, 14, Rceil, 'soot', rng, { chance: 0.025, onlyExposed: true });

  return { v: canvas, anim };
}

export default buildUnderisland;