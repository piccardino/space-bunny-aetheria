/**
 * CAMERA RIG
 * ==========
 * A bespoke orbit controller, written by hand rather than using OrbitControls,
 * because the experience needs behaviour stock controls cannot express:
 *
 *   • critically-damped motion on every axis (no spring overshoot)
 *   • mouse parallax layered on top of the orbit
 *   • one-finger drag + pinch on touch, drag/wheel on desktop
 *   • slow automatic orbit that resumes only after genuine inactivity
 *   • cinematic fly-to with an eased path and an automatic arrival callback
 *   • framing that adapts to the viewport (phones get closer)
 *
 * Per-frame state lives in refs; React never re-renders while you orbit.
 *
 * The component publishes an imperative API on the `world` object it receives:
 *   world.flyTo({ target, radius, phi, theta, duration })
 *   world.reset()
 *   world.cancelFly()
 */
import { useEffect, useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { clamp, damp, lerp, lerpAngle, easeInOutCubic, smoothstep } from '../core/math.js';

export const CAMERA_DEFAULTS = {
  /*
   * The island's surface sits at y≈0 and its keel plunges to y≈-87. A floating
   * island only reads as *floating* if you see the underside, so the default
   * pose puts the camera just BELOW the plateau (phi > π/2 → camera y < 0) and
   * looks slightly upward: sky above, keel hanging into the lower frame.
   * phi is the polar angle from +Y, so π/2 is exactly level with the surface.
   */
  radius: 178,
  phi: 1.66,
  theta: 0.62, // three-quarter view — the most flattering azimuth
  height: 2,   // the point we orbit around
};

const IDLE_DELAY = 4200;   // ms of no input before the auto-orbit resumes
const AUTO_SPEED = 0.026;  // rad/s — deliberately almost imperceptible

export function CameraRig({ world, enabled = true, introProgress = 1, onArrive, reducedMotion = false }) {
  const { camera, gl, size } = useThree();

  const state = useRef({
    theta: CAMERA_DEFAULTS.theta,
    phi: CAMERA_DEFAULTS.phi,
    radius: CAMERA_DEFAULTS.radius,
    height: CAMERA_DEFAULTS.height,
    dTheta: CAMERA_DEFAULTS.theta,
    dPhi: CAMERA_DEFAULTS.phi,
    dRadius: CAMERA_DEFAULTS.radius,
    dHeight: CAMERA_DEFAULTS.height,
    px: 0, py: 0, tpx: 0, tpy: 0,
    dragging: false,
    lastX: 0, lastY: 0,
    pinchDist: 0,
    lastInput: 0,
    autoOrbit: false,
    flying: false,
    flyT: 0,
    flyDur: 1.05,
    flyFrom: null,
    flyTo: null,
    flyHeightFrom: 0,
    flyHeightTo: 0,
  });

  /* ---- limits ---- */
  const limits = useRef({ min: 46, max: 320 });
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // The island spans ~120 units, so the near limit must clear the treeline
    // (≈ R*0.75 ≈ 44) or the camera ends up inside the foliage.
    const baseMin = coarse ? 84 : 78;
    const baseMax = coarse ? 300 : 360;
    limits.current.min = aspect < 1.05 ? baseMin * 0.82 : baseMin;
    limits.current.max = aspect > 2.4 ? baseMax * 1.25 : baseMax;
    // A polar angle below π/2 puts the camera above the island looking down;
    // above it puts the camera below, looking up at the underside. Both are
    // useful, so the range spans well past level.
    const PHI_MIN = 0.30;   // near top-down
    const PHI_MAX = 2.15;   // looking up at the keel
    state.current.dPhi = clamp(state.current.dPhi, PHI_MIN, PHI_MAX);
    state.current.dRadius = clamp(state.current.dRadius, limits.current.min, limits.current.max);
  }, [size.width, size.height]);

  /* ---- pointer input ------------------------------------------ */
  const onPointerDown = useCallback((e) => {
    const s = state.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.lastInput = performance.now();
    s.autoOrbit = false;
    s.pinchDist = 0;
    if (gl.domElement.setPointerCapture && e.pointerId != null) {
      try { gl.domElement.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
  }, [gl]);

  const onPointerMove = useCallback((e) => {
    const s = state.current;
    const rect = gl.domElement.getBoundingClientRect();
    s.tpx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s.tpy = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    s.lastInput = performance.now();

    if (!s.dragging || !enabled) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    const speed = 0.0052;
    s.dTheta -= dx * speed;
    s.dPhi = clamp(s.dPhi - dy * speed, 0.30, 2.15);
  }, [enabled, gl]);

  const endDrag = useCallback(() => {
    state.current.dragging = false;
    state.current.lastInput = performance.now();
  }, []);

  const onWheel = useCallback((e) => {
    if (!enabled) return;
    e.preventDefault();
    const s = state.current;
    const { min, max } = limits.current;
    s.dRadius = clamp(s.dRadius * Math.exp(clamp(e.deltaY, -120, 120) * 0.0012), min, max);
    s.lastInput = performance.now();
    s.autoOrbit = false;
  }, [enabled]);

  /* ---- pinch zoom (raw touch events) -------------------------- */
  useEffect(() => {
    const el = gl.domElement;
    const s = state.current;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e) => { if (e.touches.length === 2) s.pinchDist = dist(e.touches); };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && s.pinchDist > 0) {
        e.preventDefault();
        const d = dist(e.touches);
        const { min, max } = limits.current;
        s.dRadius = clamp(s.dRadius * (s.pinchDist / d), min, max);
        s.pinchDist = d;
        s.lastInput = performance.now();
        s.autoOrbit = false;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [gl]);

  /* ---- bind / unbind pointer listeners --------------------------- */
  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, onPointerDown, onPointerMove, endDrag, onWheel]);

  /* ---- imperative API consumed by the navigation layer --------- */
  useEffect(() => {
    const s = state.current;
    if (!world) return undefined;

    world.flyTo = ({ target, radius, phi, theta, duration = 1.05 }) => {
      const { min, max } = limits.current;
      s.flyFrom = { theta: s.dTheta, phi: s.dPhi, radius: s.dRadius };
      s.flyTo = {
        theta: theta ?? s.dTheta,
        phi: clamp(phi ?? s.dPhi, 0.30, 2.15),
        radius: clamp(radius ?? s.dRadius, min * 0.5, max),
      };
      s.flyHeightFrom = s.dHeight;
      s.flyHeightTo = target?.[1] ?? s.dHeight;
      s.flyT = 0;
      s.flyDur = reducedMotion ? 0.35 : duration;
      s.flying = true;
      s.autoOrbit = false;
      s.lastInput = performance.now();
    };

    world.reset = (immediate = false) => {
      s.flyFrom = { theta: s.dTheta, phi: s.dPhi, radius: s.dRadius };
      s.flyTo = {
        theta: CAMERA_DEFAULTS.theta,
        phi: CAMERA_DEFAULTS.phi,
        radius: clamp(CAMERA_DEFAULTS.radius, limits.current.min, limits.current.max),
      };
      s.flyHeightFrom = s.dHeight;
      s.flyHeightTo = CAMERA_DEFAULTS.height;
      s.flyT = 0;
      s.flyDur = immediate || reducedMotion ? 0.2 : 1.4;
      s.flying = true;
    };

    world.cancelFly = () => { s.flying = false; };
    world.isFlying = () => s.flying;
    world.isAutoOrbiting = () => s.autoOrbit;
    return () => { world.flyTo = world.reset = world.cancelFly = null; };
  }, [world, reducedMotion]);

  /* ---- the frame loop ------------------------------------------ */
  useFrame((_, rawDt) => {
    const s = state.current;
    const dt = Math.min(rawDt, 1 / 20); // a stall must never teleport the camera

    /* ---- cinematic fly-to */
    if (s.flying && s.flyTo) {
      s.flyT = Math.min(1, s.flyT + dt / s.flyDur);
      const t = easeInOutCubic(s.flyT);
      s.dTheta = lerpAngle(s.flyFrom.theta, s.flyTo.theta, t);
      s.dPhi = lerp(s.flyFrom.phi, s.flyTo.phi, t);
      s.dRadius = lerp(s.flyFrom.radius, s.flyTo.radius, t);
      s.dHeight = lerp(s.flyHeightFrom, s.flyHeightTo, t);
      if (s.flyT >= 1) {
        s.flying = false;
        onArrive?.();
      }
    }

    /* ---- idle auto-orbit */
    const idleFor = performance.now() - s.lastInput;
    if (!s.flying && !s.dragging && idleFor > IDLE_DELAY) {
      s.autoOrbit = true;
      // ease in over 2.6s so it never starts with a jolt
      s.dTheta += AUTO_SPEED * dt * smoothstep(IDLE_DELAY, IDLE_DELAY + 2600, idleFor);
    } else if (s.dragging || s.flying) {
      s.autoOrbit = false;
    }

    /* ---- smoothing (frame-rate independent) */
    s.theta = lerpAngle(s.theta, s.dTheta, 1 - Math.exp(-6.2 * dt));
    s.phi = damp(s.phi, s.dPhi, 6.2, dt);
    s.radius = damp(s.radius, s.dRadius, 5.4, dt);
    s.height = damp(s.height, s.dHeight, 4.4, dt);
    s.px = damp(s.px, s.tpx, 3.0, dt);
    s.py = damp(s.py, s.tpy, 3.0, dt);

    /* ---- compose the final transform */
    const parallax = 1 - smoothstep(0, 1, introProgress);
    const px = s.px * 3.1 * parallax;
    const py = s.py * 1.9 * parallax;

    const theta = s.theta + px * 0.035;
    const phi = clamp(s.phi + py * 0.022, 0.26, 2.2);
    const sinPhi = Math.sin(phi);

    camera.position.set(
      Math.sin(theta) * sinPhi * s.radius,
      Math.cos(phi) * s.radius + s.height,
      Math.cos(theta) * sinPhi * s.radius,
    );

    /* Aim at a point slightly ABOVE the plateau: the buildings are the subject,
       and the keel below is what sells the "floating". The parallax terms let
       the island drift in frame instead of sitting dead-centre. */
    camera.lookAt(px * 1.6, s.height + 9 - py * 1.2, 0);
  });

  return null;
}