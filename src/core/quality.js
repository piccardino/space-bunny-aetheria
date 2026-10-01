/**
 * Adaptive quality system.
 * Detects a sensible starting tier, then the runtime monitor can downgrade
 * (never upgrade, to avoid oscillation) if the measured frame time is bad.
 */

export const TIERS = {
  high: {
    name: 'high',
    dpr: 2,
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    bloom: true,
    smaa: true,
    vignette: true,
    cloudCount: 190,
    steamVents: 9,
    birds: 14,
    distantIslands: 4,
    flyAirships: 3,
    vegetationDensity: 1,
    anisotropy: 4,
  },
  medium: {
    name: 'medium',
    dpr: 1.6,
    shadows: true,
    shadowMapSize: 1024,
    softShadows: false,
    bloom: true,
    smaa: false,
    vignette: true,
    cloudCount: 120,
    steamVents: 6,
    birds: 10,
    distantIslands: 3,
    flyAirships: 2,
    vegetationDensity: 0.7,
    anisotropy: 2,
  },
  low: {
    name: 'low',
    dpr: 1.15,
    shadows: false,
    shadowMapSize: 512,
    softShadows: false,
    bloom: false,
    smaa: false,
    vignette: true,
    cloudCount: 60,
    steamVents: 3,
    birds: 6,
    distantIslands: 2,
    flyAirships: 1,
    vegetationDensity: 0.42,
    anisotropy: 1,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high'];

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function detectTier() {
  if (typeof window === 'undefined') return TIERS.high;

  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 4;
  const touch = isTouchDevice();
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
  score += !touch ? 1 : 0;
  score += !small ? 1 : 0;

  // Known-renderer heuristics for mobile GPUs.
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch {
    /* renderer detection is best-effort only */
  }

  const weak = /(adreno [1-5]\d\d|mali-[tg]?[1-6]\d\d|powervr|apple a[789]|swiftshader|llvmpipe)/i.test(
    renderer,
  );
  if (weak) score -= 3;
  if (/(rtx|radeon rx|geforce (gtx 1[6-9]|rtx)|apple m[1-9])/i.test(renderer)) score += 2;

  if (touch && coarse && cores <= 6) score -= 1;

  if (score >= 5) return TIERS.high;
  if (score >= 2) return TIERS.medium;
  return TIERS.low;
}

export function supportsWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
