/**
 * REUSABLE VOXEL PARTS
 * --------------------
 * Small builders shared by several buildings. Each paints into a VoxelCanvas.
 * Convention: parts are painted facing +Z (or flat on XZ where noted) and are
 * positioned by their CENTRE, so they can be dropped anywhere with one call.
 */

/**
 * A cog wheel in the XY plane (facing +Z).
 * Teeth are real voxels, so the silhouette reads clearly from any distance.
 */
export function gearXY(v, cx, cy, cz, rBody, teeth, mat = 'brass', matHub = 'iron') {
  const inner = Math.max(1.2, rBody - 2.2);
  for (let i = -rBody - 1; i <= rBody + 1; i++) {
    for (let j = -rBody - 1; j <= rBody + 1; j++) {
      const d = Math.sqrt(i * i + j * j);
      if (d > rBody + 0.4 || (d > inner && d < inner + 0.9)) continue;
      // spokes: cut windows so the wheel looks engineered, not solid
      const ang = Math.atan2(j, i);
      const band = (((ang / (Math.PI * 2)) * teeth * 2 + teeth) % 4 + 4) % 4;
      const isSpoke = band < 1.1 || band > 2.9;
      if (d < inner && !isSpoke) continue;
      v.set(cx + i, cy + j, cz, d < 2.4 ? matHub : mat);
    }
  }
  const toothDepth = Math.max(1, Math.round(rBody * 0.26));
  for (let t = 0; t < teeth; t++) {
    const a = (t / teeth) * Math.PI * 2;
    for (let s = 0; s < toothDepth; s++) {
      const rr = rBody + 1 + s;
      v.set(cx + Math.round(Math.cos(a) * rr), cy + Math.round(Math.sin(a) * rr), cz, mat);
    }
  }
  v.cylZ(cx, cy, cz - 1, Math.max(1.4, rBody * 0.22), 3, matHub);
  return v;
}

/** A gear in the XZ plane (flat, facing +Y) — turbines and flywheels. */
export function gearXZ(v, cx, cy, cz, rBody, teeth, mat = 'iron', matHub = 'brass') {
  const inner = Math.max(1.2, rBody - 2.4);
  for (let i = -rBody - 1; i <= rBody + 1; i++) {
    for (let k = -rBody - 1; k <= rBody + 1; k++) {
      const d = Math.sqrt(i * i + k * k);
      if (d > rBody + 0.4 || (d > inner && d < inner + 0.9)) continue;
      const ang = Math.atan2(k, i);
      const band = (((ang / (Math.PI * 2)) * teeth * 2 + teeth) % 4 + 4) % 4;
      if (d < inner && (band < 1.1 || band > 2.9)) continue;
      v.set(cx + i, cy, cz + k, d < 2.4 ? matHub : mat);
    }
  }
  for (let t = 0; t < teeth; t++) {
    const a = (t / teeth) * Math.PI * 2;
    for (let s = 0; s <= 1; s++)
      v.set(cx + Math.round(Math.cos(a) * (rBody + 1 + s)), cy, cz + Math.round(Math.sin(a) * (rBody + 1 + s)), mat);
  }
  v.cylY(cx, cy - 1, cz, Math.max(1.4, rBody * 0.2), 3, matHub);
  return v;
}

/** A clock dial facing +Z: bezel, pale face, hour marks, glowing centre. */
export function clockDial(v, cx, cy, cz, r, opts = {}) {
  const { face = 'cream', bezel = 'gold', marks = 'ironDark', glow = 'lampWarm' } = opts;
  for (let i = -r - 1; i <= r + 1; i++)
    for (let j = -r - 1; j <= r + 1; j++) {
      const d = Math.sqrt(i * i + j * j);
      if (d > r + 1) continue;
      if (d >= r - 0.2) v.set(cx + i, cy + j, cz, bezel);
      else if (d <= 1.4) v.set(cx + i, cy + j, cz + 1, glow);
      else v.set(cx + i, cy + j, cz, face);
    }
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    for (const rr of [r - 1.2, r - 2.4]) {
      v.set(cx + Math.round(Math.cos(a) * rr), cy + Math.round(Math.sin(a) * rr), cz + 1, marks);
    }
  }
  return v;
}

/** An arched window (rounded top) on a Z-facing wall. */
export function archedWindowZ(v, x, y, z, w, h, glassMat = 'glassWarm', frame = 'brass') {
  const r = Math.floor(w / 2);
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++) {
      const dx = i - r;
      if (j >= h - r) {
        const dy = j - (h - r - 1);
        if (dx * dx + dy * dy > (r - 0.2) * (r - 0.2)) continue;
      }
      const border = i === 0 || i === w - 1 || j === 0 || j === h - 1;
      v.set(x + i, y + j, z, border ? frame : glassMat);
    }
  return v;
}

/** A barrel: staves + two iron hoops. */
export function barrel(v, cx, y, cz, r = 2, h = 5, mat = 'wood', hoop = 'iron') {
  for (let j = 0; j < h; j++) {
    const bulge = r * (1 - Math.abs(((j + 0.5) / h) * 2 - 1) * 0.16);
    for (let i = -r; i <= r; i++)
      for (let k = -r; k <= r; k++)
        if (Math.sqrt(i * i + k * k) <= bulge) v.set(cx + i, y + j, cz + k, j % 2 ? mat : 'woodDark');
  }
  v.ringY(cx, y + 1, cz, r + 0.2, 1, hoop);
  v.ringY(cx, y + h - 2, cz, r + 0.2, 1, hoop);
  return v;
}

/** A crate with plank lines and corner brackets. */
export function crate(v, cx, y, cz, s = 3, mat = 'wood', band = 'ironDark') {
  v.box(cx - s, y, cz - s, s * 2 + 1, s * 2, s * 2 + 1, mat);
  v.boxFrame(cx - s, y, cz - s, s * 2 + 1, s * 2, s * 2 + 1, band, 1);
  v.box(cx - s, y + s - 1, cz - s, s * 2 + 1, 1, s * 2 + 1, 'woodDark');
  return v;
}

/** A riveted pipe run between two points, with flange collars. */
export function pipe(v, x0, y0, z0, x1, y1, z1, r = 1, mat = 'copper', collar = 'iron') {
  v.line(x0, y0, z0, x1, y1, z1, mat);
  if (r <= 1) return v;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  for (let s = 6; s < steps; s += 6) {
    const t = s / steps;
    v.sphere(
      Math.round(x0 + (x1 - x0) * t),
      Math.round(y0 + (y1 - y0) * t),
      Math.round(z0 + (z1 - z0) * t),
      r,
      collar,
    );
  }
  return v;
}

/** A hanging chain of alternating links — reads better than a solid line. */
export function chain(v, x0, y0, z0, x1, y1, z1, mat = 'ironDark', every = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  for (let s = 0; s <= steps; s++) {
    if (s % every !== 0) continue;
    const t = steps === 0 ? 0 : s / steps;
    const px = Math.round(x0 + (x1 - x0) * t);
    const py = Math.round(y0 + (y1 - y0) * t);
    const pz = Math.round(z0 + (z1 - z0) * t);
    v.set(px, py, pz, s % (every * 2) === 0 ? mat : 'ironLight');
    if (s % (every * 2) === 0 && s !== steps) v.set(px, py - 1, pz, mat);
  }
  return v;
}

/** A lamp post with a glowing lantern on top. */
export function lampPost(v, cx, y, cz, h = 7, mat = 'ironDark', glow = 'lampWarm') {
  v.cylY(cx, y, cz, 1, h, mat, { capTop: false });
  v.box(cx - 1, y, cz - 1, 3, 1, 3, mat);
  v.box(cx - 1, y + h - 2, cz - 1, 3, 2, 3, glow);
  v.boxFrame(cx - 2, y + h - 3, cz - 2, 5, 4, 5, mat, 1);
  v.coneY(cx, y + h + 1, cz, 2.2, 0, 2, mat);
  v.set(cx, y + h + 3, cz, glow);
  return v;
}

/** A chimney with a corbelled cap. */
export function chimney(v, cx, y, cz, w = 4, h = 10, mat = 'stoneDark') {
  v.box(cx - w, y, cz - w, w * 2 + 1, h, w * 2 + 1, mat);
  v.box(cx - w - 1, y + h - 1, cz - w - 1, w * 2 + 3, 2, w * 2 + 3, 'ironDark');
  v.boxShell(cx - w, y + h, cz - w, w * 2 + 1, 2, w * 2 + 1, mat);
  return v;
}

/** A pointed arch outline — doorways, bridges, window pediments. */
export function archOutline(v, x, y, z, w, h, d, mat = 'stoneLight') {
  const r = Math.floor(w / 2);
  for (let i = 0; i < w; i++) {
    v.set(x + i, y, z, mat);
    v.set(x + i, y, z + d - 1, mat);
  }
  for (let j = 1; j <= r; j++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r * r - (r - j) * (r - j))));
    v.set(x + r - span, y + j, z, mat);
    v.set(x + r + span, y + j, z, mat);
    v.set(x + r - span, y + j, z + d - 1, mat);
    v.set(x + r + span, y + j, z + d - 1, mat);
  }
  return v;
}

/** A flat copper roof slab with a raised seam pattern. */
export function copperRoof(v, x, y, z, w, d, mat = 'copper', seam = 'copperOx') {
  v.box(x, y, z, w, 1, d, mat);
  for (let i = 0; i < w; i += 4) v.box(x + i, y, z, 1, 1, d, seam);
  for (let k = 0; k < d; k += 4) v.box(x, y + 1, z + k, w, 1, 1, seam);
  return v;
}

export default {
  gearXY, gearXZ, clockDial, archedWindowZ, barrel, crate,
  pipe, chain, lampPost, chimney, archOutline, copperRoof,
};