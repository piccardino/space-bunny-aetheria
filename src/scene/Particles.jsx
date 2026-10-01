/**
 * PARTICLES
 * ---------
 * Two GPU-driven systems, both single-draw-call:
 *
 *   <Steam/>   — vents under the island and chimneys on top. Puffs rise,
 *                expand, drift and fade. All motion is computed in the vertex
 *                shader, so 300 puffs cost one draw call and zero CPU time.
 *   <Sparks/>  — ember / arc drift from the reactors and coils.
 *
 * Both consume emitter lists produced by the world builders, so adding a new
 * chimney automatically starts smoking with no extra wiring.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const steamVert = /* glsl */ `
  precision highp float;
  attribute vec3  aSeed;      // x: phase, y: speed, z: size
  attribute float aStrength;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uRise;

  varying float vLife;
  varying float vSeed;

  void main() {
    float life = fract(uTime * (0.055 + aSeed.y * 0.05) + aSeed.x);
    vLife = life;
    vSeed = aSeed.x;

    vec3 p = position;
    p.y += life * uRise * (0.6 + aStrength);
    float spread = life * life * 7.0;
    p.x += sin(aSeed.x * 25.0 + life * 5.0) * spread;
    p.z += cos(aSeed.x * 18.0 + life * 4.0) * spread;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float grow = 1.0 + life * 4.0;
    gl_PointSize = (1.0 + aSeed.z * 1.6) * grow * uPixelRatio * (200.0 / max(-mv.z, 1.0));
  }
`;

const steamFrag = /* glsl */ `
  precision highp float;
  varying float vLife;
  varying float vSeed;
  uniform float uOpacity;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.05, d);
    // fade in quickly, out slowly — the way real steam dissipates
    float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
    vec3 col = mix(vec3(1.0, 0.90, 0.80), vec3(0.78, 0.74, 0.82), vSeed * 0.7 + vLife * 0.3);
    gl_FragColor = vec4(col, core * fade * uOpacity);
  }
`;

/**
 * @param {{x:number,y:number,z:number,strength?:number}[]} sources
 */
export function Steam({ sources = [], perSource = 12, rise = 40, opacity = 0.55 }) {
  const matRef = useRef();

  const geometry = useMemo(() => {
    const count = Math.max(1, sources.length * perSource);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const strength = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const s = sources[i % sources.length] ?? { x: 0, y: 0, z: 0, strength: 1 };
      pos[i * 3] = s.x + (((i * 37) % 17) / 17 - 0.5) * 3.2;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z + (((i * 53) % 19) / 19 - 0.5) * 3.2;
      seed[i * 3] = ((i * 7919) % 1000) / 1000;
      seed[i * 3 + 1] = ((i * 104729) % 1000) / 1000;
      seed[i * 3 + 2] = ((i * 15485863) % 1000) / 1000;
      strength[i] = s.strength ?? 1;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aStrength', new THREE.BufferAttribute(strength, 1));
    g.computeBoundingSphere();
    return g;
  }, [sources, perSource]);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 }, uRise: { value: rise }, uOpacity: { value: opacity } }),
    [rise, opacity],
  );

  useFrame((state, dt) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uTime.value += dt;
    u.uPixelRatio.value = state.gl.getPixelRatio();
  });

  if (!sources.length) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={steamVert}
        fragmentShader={steamFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ *
 * SPARKS / EMBERS
 * ------------------------------------------------------------------ */
const sparkVert = /* glsl */ `
  precision highp float;
  attribute vec3 aSeed;
  attribute float aRange;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vHot;

  void main() {
    float life = fract(uTime * (0.18 + aSeed.y * 0.2) + aSeed.x);
    vAlpha = sin(life * 3.14159) * 0.9;
    vHot = aSeed.z;

    vec3 p = position;
    float a = aSeed.x * 6.2831 + life * 3.0;
    float r = life * aRange;
    p.x += cos(a) * r;
    p.z += sin(a) * r;
    p.y += life * aRange * 0.7 * (aSeed.y - 0.3);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.4 + aSeed.z * 2.4) * uPixelRatio * (200.0 / max(-mv.z, 1.0));
  }
`;

const sparkFrag = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.95, 0.75), vHot * core);
    gl_FragColor = vec4(col, core * vAlpha);
  }
`;

export function Sparks({ sources = [], perSource = 16 }) {
  const matRef = useRef();

  const geometry = useMemo(() => {
    const count = Math.max(1, sources.length * perSource);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const range = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const s = sources[i % sources.length] ?? { x: 0, y: 0, z: 0, r: 6 };
      pos[i * 3] = s.x;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z;
      seed[i * 3] = ((i * 7907) % 997) / 997;
      seed[i * 3 + 1] = ((i * 1543) % 991) / 991;
      seed[i * 3 + 2] = ((i * 3253) % 983) / 983;
      range[i] = (s.r ?? 6) * (0.6 + seed[i * 3 + 2] * 0.8);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aRange', new THREE.BufferAttribute(range, 1));
    g.computeBoundingSphere();
    return g;
  }, [sources, perSource]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), []);

  useFrame((state, dt) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uTime.value += dt;
    u.uPixelRatio.value = state.gl.getPixelRatio();
  });

  if (!sources.length) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={sparkVert}
        fragmentShader={sparkFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default Steam;