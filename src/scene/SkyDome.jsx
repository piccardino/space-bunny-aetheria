/**
 * SKY DOME
 * --------
 * A single inverted sphere with a hand-written gradient shader: deep indigo
 * zenith → violet mid → hot amber horizon, plus a low sun disc with a wide
 * atmospheric halo and a faint band of distant cirrus. Cheap (one draw call,
 * no textures) and it gives the whole scene its golden-hour identity.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY } from '../core/palette.js';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;

  uniform vec3  uZenith;
  uniform vec3  uMid;
  uniform vec3  uHorizon;
  uniform vec3  uGround;
  uniform vec3  uSunColor;
  uniform vec3  uSunDir;
  uniform float uTime;
  uniform float uIntensity;

  // cheap value noise for the cirrus banding
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = dir.y;

    // ---- vertical gradient
    vec3 col;
    if (h > 0.0) {
      float t = pow(clamp(h, 0.0, 1.0), 0.42);
      col = mix(uHorizon, uMid, smoothstep(0.0, 0.42, t));
      col = mix(col, uZenith, smoothstep(0.34, 1.0, t));
    } else {
      // below the horizon fades to a deep, warm underlight
      col = mix(uHorizon, uGround, pow(clamp(-h * 2.2, 0.0, 1.0), 0.6));
    }

    // ---- sun disc + halo
    // The disc is deliberately modest: a blown-out white ball reads as a bug,
    // not as a sun. The wide scatter does most of the work.
    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 3400.0) * 2.2;                // the disc
    col += uSunColor * pow(sd, 90.0)  * 0.30;                // tight halo
    col += uSunColor * pow(sd, 9.0)   * 0.14;                // mid halo
    col += uSunColor * pow(sd, 2.2)   * 0.07;                // broad scatter

    // ---- cirrus streaks, only above the horizon and lit from the sun side
    float band = smoothstep(0.02, 0.30, h) * (1.0 - smoothstep(0.42, 0.95, h));
    vec2 cp = dir.xz / max(h + 0.22, 0.06);
    float c = fbm(cp * 1.5 + vec2(uTime * 0.006, uTime * 0.0032));
    c = smoothstep(0.52, 0.94, c) * band;
    vec3 cloudLit = mix(vec3(0.42, 0.30, 0.40), uSunColor * 1.15, pow(sd, 1.6));
    col = mix(col, cloudLit, c * 0.72);

    // ---- subtle dithering kills banding in the big smooth gradient
    float dither = (hash(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);
    gl_FragColor = vec4(col * uIntensity + dither, 1.0);
  }
`;

export function SkyDome({ sunDirection = [-0.55, 0.34, -0.76], intensity = 1 }) {
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color(SKY.zenith).convertSRGBToLinear() },
      uMid: { value: new THREE.Color(SKY.mid).convertSRGBToLinear() },
      uHorizon: { value: new THREE.Color(SKY.horizon).convertSRGBToLinear() },
      uGround: { value: new THREE.Color(SKY.ground).convertSRGBToLinear() },
      uSunColor: { value: new THREE.Color(SKY.sun).convertSRGBToLinear() },
      uSunDir: { value: new THREE.Vector3(...sunDirection).normalize() },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[900, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export default SkyDome;