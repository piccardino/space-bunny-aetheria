/**
 * Voxel material sets.
 * ---------------------
 * The mesher groups geometry into 4 buckets (matte / metal / glow / glass), so a
 * whole voxel object only ever needs these 4 materials. They are created once and
 * shared by every object in the scene, which keeps the material count tiny and
 * lets three.js batch aggressively.
 *
 * All of them use `vertexColors`: the per-voxel tint and the baked AO already live
 * in the colour attribute, so a single material serves ~90 different palette entries.
 */
import * as THREE from 'three';
import { KIND_SLOTS } from './mesher.js';

let cached = null;

/** Build (once) the canonical shared material set. */
export function getVoxelMaterials() {
  if (cached) return cached;

  const matte = new THREE.MeshStandardMaterial({
    name: 'voxel-matte',
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: 0.55,
    dithering: true,
  });

  const metal = new THREE.MeshStandardMaterial({
    name: 'voxel-metal',
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.92,
    envMapIntensity: 1.15,
    dithering: true,
  });

  // Emissive voxels. toneMapped=false lets them clip into the bloom pass and
  // read as genuine light sources rather than bright paint.
  const glow = new THREE.MeshStandardMaterial({
    name: 'voxel-glow',
    vertexColors: true,
    roughness: 0.4,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 1.35,
    toneMapped: false,
    dithering: true,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    name: 'voxel-glass',
    vertexColors: true,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    transmission: 0,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const byKind = { matte, metal, glow, glass };
  cached = byKind;
  cached.array = KIND_SLOTS.map((k) => byKind[k]);
  return cached;
}

/**
 * Clone the shared set so a single object can animate its own emissive
 * (used for the hover "glow" feedback on interactive locations).
 */
export function cloneVoxelMaterials() {
  const src = getVoxelMaterials();
  const clone = (m) => {
    const c = m.clone();
    c.userData.baseEmissive = c.emissiveIntensity ?? 1;
    return c;
  };
  const matte = clone(src.matte);
  const metal = clone(src.metal);
  const glow = clone(src.glow);
  const glass = clone(src.glass);
  const byKind = { matte, metal, glow, glass };
  byKind.array = KIND_SLOTS.map((k) => byKind[k]);
  return byKind;
}

/** Attach the scene environment map to every voxel material. */
export function applyEnvironment(env, intensity = 1) {
  const mats = getVoxelMaterials();
  for (const k of ['matte', 'metal', 'glass']) {
    mats[k].envMap = env ?? null;
    mats[k].needsUpdate = true;
    if (env) mats[k].envMapIntensity = (k === 'metal' ? 1.15 : 0.55) * intensity;
  }
}