/**
 * VOXEL AIRSHIP — a rigid dirigible built as a separate canvas so it can
 * drift, bob and be instanced into the sky independently of the dock.
 *
 * The envelope is a lathed hull: fat in the middle, tapered at both ends, with
 * longitudinal batten seams, rib bands and a copper tail fin assembly.
 *
 * @param {import('../../../voxel/VoxelCanvas').default} v
 * @param {object} [opts]
 * @param {number} [opts.len=34]   overall length along X
 * @param {number} [opts.r=7]      hull radius
 * @param {string} [opts.hull]     envelope material
 */
export function buildAirship(v, opts = {}) {
  const { len = 34, r = 7, hull = 'canvasCloth', rib = 'ironDark' } = opts;
  const half = Math.floor(len / 2);

  for (let x = -half; x <= half; x++) {
    // ellipsoidal profile, slightly nose-heavy
    const t = x / half;
    const profile = Math.sqrt(Math.max(0, 1 - t * t * 0.96));
    const rr = Math.max(1, r * profile);
    const isNose = x > half - 5;
    for (let j = -Math.ceil(rr); j <= Math.ceil(rr); j++)
      for (let k = -Math.ceil(rr); k <= Math.ceil(rr); k++) {
        const d = Math.sqrt(j * j + k * k);
        if (d > rr) continue;
        // only the shell
        if (d < rr - 1.1) continue;
        // nose cone is metal, the rest is fabric with ribs
        let mat = hull;
        if (d > rr - 1.6) mat = rib;
        if (isNose && d > rr - 1.4) mat = 'copper';
        // vertical batten seams every 4 voxels
        if (Math.abs(k) > rr - 1.4 && x % 4 === 0) mat = rib;
        v.set(x, j, k, mat);
        // lower hull is a slightly deeper tone
        if (j < -rr * 0.35 && d > rr - 1.1) v.set(x, j, k, 'canvasCloth');
      }
  }

  /* ---- tail fins --------------------------------------------- */
  const tx = -half;
  // horizontal stabilisers
  for (let s = 1; s <= r + 2; s++) {
    for (let t = 0; t < 5; t++)
      for (let th = -1; th <= 1; th++) {
        v.set(tx + t, 0, s, 'copper');
        v.set(tx + t, 0, -s, 'copper');
        v.set(tx + t, s, 0, 'copper');
        v.set(tx + t, -s, 0, 'copper');
        void th;
      }
  }
  // vertical fin rising from the tail
  for (let t = 0; t < 6; t++)
    for (let s = 1; s <= r + 3; s++) v.set(tx + t, s, 0, 'copper');
  // rudder + elevator detail
  v.box(tx - 1, 0, -1, 1, r + 3, 3, 'brassDark');

  /* ---- gondola ----------------------------------------------- */
  const gy = -r - 2;
  v.box(-6, gy, -3, 13, 3, 7, 'wood');
  v.box(-6, gy, -3, 13, 1, 7, 'woodDark');
  v.boxFrame(-6, gy, -3, 13, 3, 7, 'brass', 1);
  for (let i = -4; i <= 4; i += 2) {
    v.set(i, gy - 1, -3, 'glassWarm');
    v.set(i, gy - 1, 3, 'glassWarm');
  }
  v.box(-6, gy - 1, -4, 13, 1, 1, 'brass');
  v.box(-6, gy - 1, 3, 13, 1, 1, 'brass');
  // suspension cables
  for (const cx of [-5, 5]) {
    v.line(cx, gy + 3, -2, cx, -r + 1, 0, 'ironDark');
    v.line(cx, gy + 3, 2, cx, -r + 1, 0, 'ironDark');
  }
  // nose lamp + tail lamp
  v.set(half + 1, 0, 0, 'lampWarm');
  v.set(tx - 1, 0, 0, 'lampRed');

  /* ---- engine nacelles --------------------------------------- */
  for (const [nx, side] of [[-2, -1], [4, -1], [-2, 1], [4, 1]]) {
    const nz = side * (r + 1);
    v.box(nx - 2, -3, nz - 1, 5, 4, 3, 'iron');
    v.box(nx - 2, -3, nz - 1, 5, 1, 3, 'ironLight');
    // propeller cage (blades are an animated child)
    v.set(nx, -1, nz + side * 2, 'brass');
    v.set(nx, -1, nz + side * 3, 'brass');
  }

  return v;
}

/** A small single-prop scout airship — used for distant background traffic. */
export function buildScoutAirship(v, opts = {}) {
  const { len = 14, r = 3 } = opts;
  const half = Math.floor(len / 2);
  for (let x = -half; x <= half; x++) {
    const t = x / half;
    const rr = Math.max(1, r * Math.sqrt(Math.max(0, 1 - t * t * 0.94)));
    for (let j = -r; j <= r; j++)
      for (let k = -r; k <= r; k++) {
        const d = Math.sqrt(j * j + k * k);
        if (d > rr || d < rr - 1) continue;
        v.set(x, j, k, d > rr - 1.6 ? 'ironDark' : 'canvasCloth');
      }
  }
  v.box(-2, -r - 1, -1, 5, 1, 3, 'wood');
  for (let s = 1; s <= r + 1; s++) {
    v.set(-half, 0, s, 'copper');
    v.set(-half, 0, -s, 'copper');
    v.set(-half, s, 0, 'copper');
  }
  v.set(half + 1, 0, 0, 'lampWarm');
  v.box(-1, -r - 1, r, 2, 1, 1, 'iron');
  return v;
}

export default buildAirship;