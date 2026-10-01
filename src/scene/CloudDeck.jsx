/**
 * CLOUD DECK
 * ----------
 * The island floats far above a cloud sea. Implemented as a single THREE.Points
 * with a GPU shader: every puff's position, size and opacity are derived from a
 * per-particle seed and `uTime` on the vertex side, so 4000 puffs cost one draw
 * call and zero CPU work per frame.
 *
 * `open` (0→1) drives the intro reveal: the deck parts down the middle and the
 * puffs fade out, as if the camera is descending through them.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  precision highp float;
  attribute vec3  aSeed;      // x: phase 0..1, y: radius offset, z: size jitter
  attribute float aLayer;     // 0 = main deck, 1 = high wisps

  uniform float uTime;
  uniform float uOpen;        // 0..1 reveal
  uniform float uPixelRatio;
  uniform float uScale;

  varying float vAlpha;
  varying float vTint;
  varying float vLayer;

  void main() {
    vec3 p = position;

    // slow drift + gentle vertical breathing
    p.x += sin(uTime * 0.05 + aSeed.x * 6.2831) * 3.0;
    p.z += cos(uTime * 0.041 + aSeed.x * 6.2831) * 3.0;
    p.y += sin(uTime * 0.12 + aSeed.x * 12.0) * 1.4;

    // the reveal: puffs near the centre are pushed outward and thinned out
    float radial = length(p.xz);
    float centre = 1.0 - smoothstep(0.0, 130.0, radial);
    p.xz *= 1.0 + uOpen * centre * 2.4;
    p.y  += uOpen * centre * 26.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = (1.0 + aSeed.z * 2.4) * uScale * (aLayer > 0.5 ? 0.7 : 1.0);
    gl_PointSize = size * uPixelRatio * (320.0 / max(-mv.z, 1.0));

    // fade with distance and with the reveal
    float distFade = 1.0 - smoothstep(320.0, 900.0, -mv.z);
    vAlpha = distFade * (1.0 - uOpen * centre) * (0.55 + aSeed.z * 0.45);
    vTint = aSeed.x;
    vLayer = aLayer;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vTint;
  varying float vLayer;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // soft round falloff — several lobes so the puff isn't a perfect circle
    float lobes = 0.5 + 0.5 * sin(atan(uv.y, uv.x) * 5.0 + vTint * 9.0);
    float core = smoothstep(0.5, 0.02, d);
    float alpha = core * (0.72 + lobes * 0.28) * vAlpha;
    if (alpha < 0.004) discard;

    // warm underside → cool top, matching the sun direction
    vec3 warm = vec3(1.00, 0.76, 0.58);
    vec3 cool = vec3(0.72, 0.72, 0.86);
    vec3 col = mix(warm, cool, smoothstep(0.0, 0.55, 0.5 - uv.y));
    col = mix(col, vec3(1.0, 0.93, 0.84), vTint * 0.25);

    gl_FragColor = vec4(col, alpha * (vLayer > 0.5 ? 0.5 : 0.85));
  }
`;

/**
 * @param {object} props
 * @param {number} [props.count=900]
 * @param {[number,number,number]} [props.y=-42]  deck height
 * @param {number} [props.radius=620]               disc radius
 * @param {number} [props.spread=26]                 vertical spread
 * @param {number} [props.open]                      0..1 reveal progress
 */
export function CloudDeck({
  count = 900,
  y = -46,
  radius = 640,
  spread = 30,
  scale = 1,
  open = 0,
  seedOffset = 0,
  opacity = 1,
}) {
  const matRef = useRef();
  const pointsRef = useRef();

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const layers = new Float32Array(count);

    // deterministic PRNG so the deck is identical every load
    let s = 1337 + seedOffset * 977;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      // cluster the puffs into ~14 cumulus masses rather than a uniform mat
      const cluster = Math.floor(rnd() * 14);
      const cAng = (cluster / 14) * Math.PI * 2 + rnd() * 0.6;
      const cRad = 90 + rnd() * (radius - 120);
      const spreadX = 26 + rnd() * 52;
      const spreadY = 5 + rnd() * 11;

      const ang = cAng + (rnd() - 0.5) * (spreadX / Math.max(30, cRad)) * 2.2;
      const rad = cRad + (rnd() - 0.5) * spreadX * 2.2;

      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (rnd() - 0.5) * spreadY + (rad < 200 ? 8 : 0);
      pos[i * 3 + 2] = Math.sin(ang) * rad;

      seeds[i * 3] = rnd();
      seeds[i * 3 + 1] = rnd();
      seeds[i * 3 + 2] = rnd();
      // a few high wisps above the deck for depth
      layers[i] = rnd() < 0.12 ? 1 : 0;
      if (layers[i] === 1) pos[i * 3 + 1] += 40 + rnd() * 70;
    }

    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    g.computeBoundingSphere();
    return g;
  }, [count, radius, seedOffset]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uPixelRatio: { value: 1 },
      uScale: { value: scale },
    }),
    [scale],
  );

  useFrame((state, dt) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    u.uTime.value += dt;
    u.uOpen.value += (open - u.uOpen.value) * Math.min(1, dt * 2.2);
    u.uPixelRatio.value = state.gl.getPixelRatio();
    if (pointsRef.current) pointsRef.current.visible = opacity > 0.01;
  });

  return (
    <points ref={pointsRef} geometry={geometry} position={[0, y, 0]} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export default CloudDeck;