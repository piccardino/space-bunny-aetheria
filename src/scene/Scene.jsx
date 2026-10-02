/**
 * THE SCENE
 * ---------
 * Assembles sky, clouds, lights, the island, particles and post-processing, and
 * hosts the camera rig and the transition director.
 *
 * The intro is a single 0→1 progress value that drives:
 *   • the cloud deck parting
 *   • the camera dolly from far away to its resting framing
 *   • the vignette opening up
 *   • the parallax switching on
 *
 * Because the camera is a rig rather than a tween, the fly-in and the user's own
 * orbit are the same system — the intro simply starts it from a far pose.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { Island } from '../world/Island.jsx';
import { SkyDome } from './SkyDome.jsx';
import { CloudDeck } from './CloudDeck.jsx';
import { Lighting, SUN_DIR } from './Lighting.jsx';
import { PostProcessing } from './PostProcessing.jsx';
import { ContextGuard } from './ContextGuard.jsx';
import { Steam, Sparks } from './Particles.jsx';
import { CameraRig } from '../navigation/CameraRig.jsx';
import { useWorld } from '../core/store.js';
import { SKY } from '../core/palette.js';
import { buildWorld } from '../world/buildWorld.js';
import { setListenerDistance } from '../audio/audio.js';
import { clamp, smoothstep } from '../core/math.js';
import { LOCATION_BY_ID, locationOrigin } from '../world/locations/registry.js';

export function Scene({ world, onArrive }) {
  const { scene, gl, camera } = useThree();
  const tier = useWorld((s) => s.tier);
  const reduced = useWorld((s) => s.reducedMotion);
  const phase = useWorld((s) => s.phase);
  const lastDestination = useWorld((s) => s.lastDestination);

  const w = useMemo(() => buildWorld({ vegetationDensity: tier.vegetationDensity }), [tier]);
  const intro = useRef(0);
  const audioTick = useRef(0);
  const lastLabel = useRef(false);

  /* ---- renderer + scene configuration ------------------------- */
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    // golden hour is a high-key image; ACES needs a fair amount of exposure to
    // land the island's mid-tones in the right place rather than a murky brown
    gl.toneMappingExposure = 1.42;
    gl.shadowMap.enabled = tier.shadows;
    gl.shadowMap.type = tier.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    scene.fog = new THREE.FogExp2(SKY.fog, 0.0016);
    scene.background = new THREE.Color(SKY.horizon);
    return () => { scene.fog = null; };
  }, [gl, scene, tier]);

  /* The pixel ratio is NOT set here. It is owned by the <Canvas> in App.jsx
     (the single `dpr` prop), because R3F re-applies it on every resize and on
     every tier change. Calling `gl.setPixelRatio()` from here as well gave the
     renderer and the EffectComposer two different pixel ratios: the composer
     only re-sizes on a CSS `size` change, so its render targets kept the old
     (larger) resolution and the final blit no longer lined up with the canvas
     — the screen went black. See the note in App.jsx. */

  /* ---- steam emitters come straight from the world builders ---- */
  const vents = useMemo(() => w.underAnim.vents ?? [], [w]);
  const sparkSources = useMemo(
    () => [
      ...(w.underAnim.reactors ?? []),
      { x: 0, y: 13, z: 30, r: 5 },     // the lab crystal
      { x: 30, y: 20, z: 2, r: 7 },      // the portal field
    ],
    [w],
  );

  /* ---- push a framing request to the camera rig -------------- */
  useEffect(() => {
    if (!world?.flyTo) return;
    if (phase !== 'exploring') return;

    if (lastDestination?.id) {
      const loc = LOCATION_BY_ID[lastDestination.id];
      if (loc) {
        world.flyTo({
          target: locationOrigin(loc),
          radius: loc.camera?.radius ?? 34,
          phi: loc.camera?.phi ?? 1.2,
          duration: reduced ? 0.3 : 1.5,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ---- the frame loop for the intro + audio + label projection -- */
  const labelVec = useMemo(() => new THREE.Vector3(), []);
  const labelState = useWorld((s) => s.setLabelScreen);
  const activeLocation = useWorld((s) => s.activeLocation);
  const activeId = activeLocation?.id ?? null;

  useFrame((state, dt) => {
    // intro progress eases toward the target as soon as the user enters
    const target = phase === 'exploring' ? 1 : 0;
    intro.current += (target - intro.current) * Math.min(1, dt * 0.85);
    const p = intro.current;

    // fog thickens during the intro so the reveal feels like emerging from haze
    if (scene.fog) scene.fog.density = 0.0016 + (1 - p) * 0.0055;

    /* ---- project the hovered building's label anchor to screen space.
       Done here (inside the canvas) and published to the DOM layer, because
       HTML cannot be rendered inside the R3F tree. */
    if (activeId && activeLocation) {
      const [ox, oy, oz] = locationOrigin(activeLocation);
      labelVec.set(ox, oy + (activeLocation.camera?.labelHeight ?? 30), oz);
      labelVec.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      labelState({
        x: (labelVec.x * 0.5 + 0.5) * rect.width,
        y: (-labelVec.y * 0.5 + 0.5) * rect.height,
        visible: labelVec.z < 1,
      });
    } else if (lastLabel.current) {
      lastLabel.current = false;
      labelState({ x: 0, y: 0, visible: false });
    }
    if (activeId) lastLabel.current = true;

    // audio follows the camera
    audioTick.current += dt;
    if (audioTick.current > 0.25) {
      audioTick.current = 0;
      setListenerDistance(camera.position.length(), camera.position.y);
    }
  });

  const introProgress = phase === 'exploring' ? 1 : 0;

  return (
    <>
      <SkyDome sunDirection={SUN_DIR} />

      {/* Two cloud decks bracketing the island. Because the default camera sits
          slightly BELOW the plateau and looks up, a deck placed far below would
          never enter frame — so the main deck sits just under the rim (a sea
          the island appears to float above) and the wisps float above it. */}
      <CloudDeck
        count={tier.cloudCount}
        y={-40}
        radius={700}
        spread={26}
        scale={1.15}
        open={1 - introProgress}
        seedOffset={0}
        opacity={1}
      />
      <CloudDeck
        count={Math.round(tier.cloudCount * 0.45)}
        y={64}
        radius={540}
        spread={30}
        scale={0.9}
        open={1 - introProgress}
        seedOffset={3}
        opacity={0.5}
      />

      <Lighting tier={tier} quality={tier} />

      <Island quality={tier} interactive={phase === 'exploring'} />

      <Steam sources={vents} perSource={tier.name === 'low' ? 5 : 8} rise={46} opacity={0.32} />
      <Sparks sources={sparkSources} perSource={tier.name === 'low' ? 8 : 14} />

      <CameraRig
        world={world}
        enabled={phase !== 'loading'}
        introProgress={introProgress}
        reducedMotion={reduced}
        onArrive={onArrive}
      />

      <PostProcessing quality={tier} />

      {/* must be inside the <Canvas> — it needs the renderer to reach the canvas
          element, and it has to be mounted before anything allocates GPU memory */}
      <ContextGuard />
    </>
  );
}

export default Scene;