/**
 * WORLD CONFIG — the single source of truth for the island's scale and layout.
 *
 * The world is authored directly in VOXEL SPACE: 1 voxel = 1 three.js unit.
 * With a radius of 58 voxels the island reads as a huge diorama while the whole
 * thing still fits comfortably in a merged buffer.
 *
 * Changing RADIUS or DEPTH here automatically rescales the terrain, the
 * vegetation, the cloud deck and the camera framing.
 */
import { fbm2 } from '../core/math.js';

export const WORLD = {
  /** Horizontal radius of the island, in voxels. */
  radius: 58,
  /** Deepest point of the rock mass below the surface. */
  maxDepth: 52,
  /** How many voxels of "dirt" sit under the grass. */
  soilDepth: 3,
  /** Rock thickness at the very bottom of the island. */
  floorDepth: 5,
  seed: 20240617,
  /** Height of the flat plaza around the clock tower. */
  plazaHeight: 0,
};

/** How tall the waterfall/steam column area is, used by props. */
export const CLIFF = {
  /** Radius where grass stops and bare rock begins. */
  grassEdge: 0.86,
  mossEdge: 0.96,
};

/**
 * Deterministic surface height field (before plateaus are applied).
 * Returns an integer voxel Y for the top of the terrain.
 */
export function rawHeight(x, z) {
  // NOTE: fbm2(x, y, octaves, seed) — the seed is the 4th argument.
  // Amplitudes are deliberately large: a 120-unit-wide island with ±9 units of
  // relief reads as a pancake. ±20 gives real hills, ridges and valleys.
  const broad = fbm2(x * 0.026, z * 0.026, 4, WORLD.seed) - 0.5;
  const detail = fbm2(x * 0.075, z * 0.075, 3, WORLD.seed + 137) - 0.5;
  const ridge = fbm2(x * 0.014, z * 0.014, 3, WORLD.seed + 421) - 0.5;
  // a gentle dome under the city so the buildings sit on a rise, not a plane
  const r = Math.hypot(x, z);
  const dome = 9 * Math.max(0, 1 - (r / WORLD.radius) ** 1.4);
  return Math.round(broad * 26 + detail * 7 + ridge * 12 + dome);
}

/** Island outline: a noisy circle so the silhouette never looks stamped. */
export function islandRadius(x, z) {
  const a = Math.atan2(z, x);
  const wob = (fbm2(Math.cos(a) * 1.7 + 8, Math.sin(a) * 1.7 + 8, 3, WORLD.seed + 907) - 0.5) * 0.24;
  const lob = Math.sin(a * 3.1 + 0.7) * 0.045;
  return WORLD.radius * (1 + wob + lob);
}

export function isInside(x, z, shrink = 0) {
  return Math.hypot(x, z) < islandRadius(x, z) - shrink;
}

/** Bottom of the rock mass — a long tapering keel, deepest under the centre. */
export function bottomAt(x, z) {
  const r = Math.hypot(x, z);
  const t = Math.max(0, Math.min(1, 1 - r / WORLD.radius));
  // a long power curve: shallow shoulders, then a spike of rock
  const depth = 12 + 74 * Math.pow(t, 1.6);
  const n = (fbm2(x * 0.045, z * 0.045, 3, WORLD.seed + 303) - 0.5) * 10;
  // vertical striations so the keel isn't a smooth cone
  const flute = Math.sin(Math.atan2(z, x) * 9) * 2.2 * t;
  return -Math.round(depth + n + flute);
}

/* Local import shim so this module stays dependency-light and testable. */
import { fbm2 as fbm2Local } from '../core/math.js';