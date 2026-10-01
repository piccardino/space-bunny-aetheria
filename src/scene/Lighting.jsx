/**
 * LIGHTING
 * --------
 * Golden-hour steampunk. Four layers:
 *   1. HemisphereLight  — warm sky / cool violet ground bounce
 *   2. Key Directional  — low, warm, the only shadow caster, tightly framed
 *   3. Fill Directional — cold blue from the opposite side, no shadows
 *   4. PointLights      — a handful of coloured practicals on the island
 *
 * The shadow camera is fitted tightly to the island so a 1024/2048 map still
 * gives crisp voxel shadows.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHT } from '../core/palette.js';
import { WORLD } from '../world/config.js';

/**
 * The sun direction (a unit vector, shared by the sky shader and the key light).
 *
 * Two constraints fought each other here:
 *
 *  1. The camera rests at azimuth ~0.62 rad, looking toward the −X/−Z quadrant,
 *     so the sun has to sit roughly in that hemisphere to stay in frame.
 *  2. A *very* low sun (y ≈ 0.3) only meets horizontal ground at a grazing 17°,
 *     which leaves the plateau and the whole keel in shadow — the island reads
 *     as a black silhouette against a bright sky.
 *
 * y ≈ 0.52 is the compromise: still a low, warm, late-afternoon sun that keeps
 * long raking shadows and rim light, but high enough to actually land on the
 * terrain and light the underside's ledges.
 */
export const SUN_DIR = [-0.69, 0.52, -0.30];

/** Practical lights: coloured accents that make the machinery feel powered. */
export const PRACTICALS = [
  { position: [0, 46, 12], color: 0xffb04a, intensity: 220, distance: 90, label: 'clocktower' },
  { position: [30, 6, 2], color: 0xa86bff, intensity: 160, distance: 62, label: 'portal' },
  { position: [7, 14, 30], color: 0x54e8ff, intensity: 120, distance: 54, label: 'lab' },
  { position: [-8, 44, -34], color: 0xff5ad0, intensity: 180, distance: 80, label: 'beacon' },
  { position: [-27, 12, -14], color: 0xff5a22, intensity: 130, distance: 52, label: 'forge' },
  { position: [26, 14, 17], color: 0x7fd8ff, intensity: 110, distance: 52, label: 'dock' },
];

export function Lighting({ tier, quality }) {
  const keyRef = useRef();
  const hemiRef = useRef();
  const practicals = useRef([]);
  const pulse = useRef(0);

  const shadows = quality?.shadows ?? true;
  const size = quality?.shadowMapSize ?? 2048;

  const target = useMemo(() => new THREE.Object3D(), []);
  const R = WORLD.radius;

  useFrame((state, dt) => {
    pulse.current += dt;
    // a very slow global breath so the scene is never perfectly static
    const p = 1 + Math.sin(pulse.current * 0.35) * 0.03;
    for (const l of practicals.current) {
      if (!l) continue;
      l.intensity = l.userData.base * p;
    }
    if (hemiRef.current) hemiRef.current.intensity = 0.62 * p;
  });

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        args={[LIGHT.hemiSky, LIGHT.hemiGround, 1.05]}
        position={[0, 60, 0]}
      />

      {/* key light — the sunset. The only shadow caster. */}
      <primitive object={target} position={[0, 0, 0]} />
      <directionalLight
        ref={keyRef}
        color={LIGHT.key}
        intensity={3.8}
        position={[SUN_DIR[0] * 200, SUN_DIR[1] * 200, SUN_DIR[2] * 200]}
        target={target}
        castShadow={shadows}
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
        shadow-camera-near={40}
        shadow-camera-far={520}
        shadow-camera-left={-R * 1.35}
        shadow-camera-right={R * 1.35}
        shadow-camera-top={R * 1.35}
        shadow-camera-bottom={-R * 1.35}
        shadow-bias={-0.0007}
        shadow-normalBias={0.05}
      />

      {/* cool fill from the shadow side — separates the island from the sky */}
      <directionalLight color={LIGHT.fill} intensity={1.5} position={[110, 60, 120]} />
      {/* warm bounce from the cloud sea below, which is what actually stops the
          keel from reading as a black mass */}
      <directionalLight color={LIGHT.bounce} intensity={1.1} position={[20, -90, -30]} />
      {/* a soft ambient lift so nothing is ever pure black */}
      <ambientLight color="#6a5566" intensity={0.5} />

      {/* practicals */}
      {PRACTICALS.map((p, i) => (
        <pointLight
          key={p.label}
          ref={(el) => {
            practicals.current[i] = el;
            if (el) el.userData.base = p.intensity;
          }}
          color={p.color}
          intensity={p.intensity}
          distance={p.distance}
          decay={2}
          position={p.position}
        />
      ))}
    </>
  );
}

export default Lighting;