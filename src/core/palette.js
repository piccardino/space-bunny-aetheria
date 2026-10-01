/**
 * THE PALETTE — Steampunk Voxel Floating World
 * ----------------------------------------------------
 * Every voxel in the world references one of these materials.
 * `k` (kind) decides the shader bucket: only 4 buckets exist, so the whole
 * island renders in ~4 draw calls while still looking richly varied.
 *
 *   matte : rough dielectric (stone, wood, soil, foliage, fabric)
 *   metal : polished metal (iron, copper, brass, gold, bronze)
 *   glass : translucent windows / lenses
 *   glow  : emissive voxels (lamps, crystals, energy) — never tone-mapped
 *
 * Add new materials freely: just give them a colour and a kind.
 */

export const MAT = {
  /* ---- rock & soil ------------------------------------------------ */
  stone: { c: 0x8a8073, k: 'matte' },
  stoneDark: { c: 0x5b544c, k: 'matte' },
  stoneLight: { c: 0xa9a091, k: 'matte' },
  slate: { c: 0x4b4753, k: 'matte' },
  basalt: { c: 0x33313a, k: 'matte' },
  dirt: { c: 0x6d4a33, k: 'matte' },
  dirtDark: { c: 0x4a3223, k: 'matte' },
  clay: { c: 0x9a6a45, k: 'matte' },
  sand: { c: 0xc7ab79, k: 'matte' },
  moss: { c: 0x5d7a3c, k: 'matte' },
  grass: { c: 0x71914a, k: 'matte' },
  grassDark: { c: 0x4f6f37, k: 'matte' },
  grassDry: { c: 0x9aa14e, k: 'matte' },
  coal: { c: 0x241f24, k: 'matte' },

  /* ---- ore veins (the island pays for its own machinery) ----------- */
  oreCopper: { c: 0xb0693a, k: 'metal' },
  oreBrass: { c: 0xb79346, k: 'metal' },
  oreIron: { c: 0x6a6d74, k: 'metal' },
  crystal: { c: 0x7fd8f0, k: 'glass' },
  emberRock: { c: 0x6b3121, k: 'matte' },

  /* ---- brick & soot (the workshop's skin) ------------------- */
  brick: { c: 0x8a4a34, k: 'matte' },
  brick_light: { c: 0xa4603f, k: 'matte' },
  brick_dark: { c: 0x5e3226, k: 'matte' },
  soot: { c: 0x2e2a2c, k: 'matte' },

  /* ---- wood -------------------------------------------------------- */
  wood: { c: 0x7c5334, k: 'matte' },
  woodDark: { c: 0x50331f, k: 'matte' },
  woodLight: { c: 0x9d7046, k: 'matte' },
  woodPale: { c: 0xc0a077, k: 'matte' },

  /* ---- metals ------------------------------------------------------ */
  iron: { c: 0x70737b, k: 'metal' },
  ironDark: { c: 0x3f4249, k: 'metal' },
  ironLight: { c: 0x9ba3ad, k: 'metal' },
  steel: { c: 0x8e99a5, k: 'metal' },
  copper: { c: 0xb26c3d, k: 'metal' },
  copperOx: { c: 0x4f9179, k: 'matte' },
  brass: { c: 0xcba44b, k: 'metal' },
  brassDark: { c: 0x8d6f2e, k: 'metal' },
  gold: { c: 0xe3ba55, k: 'metal' },
  bronze: { c: 0x8d6a3c, k: 'metal' },
  rust: { c: 0x8b4a2b, k: 'matte' },
  blackIron: { c: 0x2a2b31, k: 'metal' },

  /* ---- soft / organic ---------------------------------------------- */
  leaf: { c: 0x4f7c3a, k: 'matte' },
  leafDark: { c: 0x33582a, k: 'matte' },
  leafGold: { c: 0x9c8f36, k: 'matte' },
  flowerA: { c: 0xd9536b, k: 'matte' },
  flowerB: { c: 0xe8a33d, k: 'matte' },
  flowerC: { c: 0xb98ad6, k: 'matte' },
  fabric: { c: 0x8c3b3b, k: 'matte' },
  fabricDark: { c: 0x5e2626, k: 'matte' },
  cream: { c: 0xd9ccb1, k: 'matte' },
  paper: { c: 0xe4d7bb, k: 'matte' },
  canvasCloth: { c: 0xcbb68c, k: 'matte' },
  skin: { c: 0xd0a184, k: 'matte' },

  /* ---- glass ------------------------------------------------------- */
  glass: { c: 0x9fd4e8, k: 'glass' },
  glassWarm: { c: 0xffd9a0, k: 'glass' },
  glassGreen: { c: 0x8fe0b0, k: 'glass' },

  /* ---- water ------------------------------------------------------- */
  water: { c: 0x2c6c8a, k: 'matte' },
  waterDeep: { c: 0x1d4a63, k: 'matte' },

  /* ---- emissive (accent palette) ----------------------------------- */
  lampWarm: { c: 0xffc97e, k: 'glow' },
  lampAmber: { c: 0xff9433, k: 'glow' },
  lampCyan: { c: 0x63efff, k: 'glow' },
  lampBlue: { c: 0x59a6ff, k: 'glow' },
  lampGreen: { c: 0x76ff9c, k: 'glow' },
  lampRed: { c: 0xff5a48, k: 'glow' },
  energy: { c: 0x9be8ff, k: 'glow' },
  energyCore: { c: 0xe8fbff, k: 'glow' },
  ember: { c: 0xff6a2a, k: 'glow' },
  portalCore: { c: 0xc08cff, k: 'glow' },
  neonPink: { c: 0xff6ad5, k: 'glow' },
};

/** Resolve a hex + kind into linear-ish sRGB triple used by the mesher. */
export function matColor(name) {
  const m = MAT[name];
  if (!m) throw new Error(`[palette] unknown voxel material "${name}"`);
  return m.c;
}
export function matKind(name) {
  const m = MAT[name];
  if (!m) throw new Error(`[palette] unknown voxel material "${name}"`);
  return m.k;
}
export const MAT_NAMES = Object.keys(MAT);

/* ------------------------------------------------------------------ *
 * Scene-wide colour identity (sky, fog, lights, UI)
 * ------------------------------------------------------------------ */
export const SKY = {
  zenith: 0x2a3a63,
  mid: 0x8f6a86,
  horizon: 0xffb469,
  ground: 0x3a2434,
  sun: 0xfff0cf,
  fog: 0xb4795f,
};

export const LIGHT = {
  hemiSky: 0xffb877,
  hemiGround: 0x2c1f33,
  key: 0xffc389,
  fill: 0x5f8fd0,
  bounce: 0xff7a4d,
};
