/**
 * MODEL BLOCK — a self-contained, lazily-loaded 3D viewport for any page.
 *
 * Rendered inside its own <Canvas> so it only costs GPU time while it is on
 * screen, and it never competes with the island's frame budget while you browse
 * a page.
 *
 *   { type: 'model', src: '/models/thing.glb', caption: '…' }
 *   { type: 'model', src: '/models/thing.glb', voxel: true }   // voxel mode
 *
 * Without a src it shows a content slot, so you can see where it will go.
 */
import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Placeholder } from './blocks.jsx';
import { asset } from '../core/asset.js';

/**
 * Spins the model about its OWN facing axis (Z).
 *
 * Spinning about Y — the obvious first choice — turns a flat, disc-shaped
 * model edge-on twice per revolution, so it reads as a disappearing sliver
 * for half of every loop. Rotating in-plane keeps a cog looking like a cog.
 */
function Rig({ children, autoRotate = true, speed = 0.6 }) {
  const group = useRef();
  useFrame((state, dt) => {
    if (!group.current || !autoRotate) return;
    group.current.rotation.z += dt * speed * 0.35;
  });
  return <group ref={group}>{children}</group>;
}

/**
 * Catches a missing / malformed .glb so a bad path degrades to a readable
 * message instead of tearing down the whole page (an error thrown inside
 * <Canvas> has nowhere to bubble up to otherwise).
 */
class GLTFBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Capitalised on purpose: a lowercase JSX tag (`<glTFModel/>`) is treated as a
 * DOM element by both React and R3F, which then throws
 * "GlTFModel is not part of the THREE namespace" and the model never renders.
 */
function GLTFModel({ src }) {
  // resolved here rather than in blocks.jsx so ANY caller of <ModelBlock> gets
  // a correctly-prefixed URL, not just the content-driven page route
  const url = asset(src);
  const { scene } = useGLTF(url);
  const clone = useRef();
  if (!clone.current) {
    clone.current = scene.clone(true);
    clone.current.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return <primitive object={clone.current} />;
}

/** Frames the camera on whatever was loaded, so every model fills the shot. */
function FrameOnLoad({ children }) {
  const { camera, scene } = useThree();
  useEffect(() => {
    // runs once the glTF has been added to the scene
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    // pull back far enough that the bounding sphere fits the 42° vertical fov
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.25;
    camera.position.set(center.x, center.y + radius * 0.35, center.z + dist);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, scene]);
  return children;
}

export function ModelBlock({ src, caption, autoRotate = true }) {
  if (!src) {
    return (
      <figure className="shot shot--model shot--empty">
        <Placeholder
          label="3D model"
          hint="add `src: '/models/your-model.glb'` — DRACO-compressed files work best"
        />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="shot shot--model">
      {/* An <ErrorBoundary> cannot sit INSIDE <Canvas> (R3F's reconciler owns
          that subtree), so the boundary wraps the whole Canvas instead. */}
      <GLTFBoundary
        fallback={
          <Placeholder label="3D model" hint={`could not load ${src}`} />
        }
      >
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [0, 1.4, 4.2], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#100c10']} />
          {/* Lights are local on purpose. <Environment preset="city"/> fetches an
              HDRI from a CDN at runtime, which makes the block hang forever on a
              restricted/offline network — and it shares this Suspense boundary,
              so the model never appears either. */}
          <hemisphereLight args={['#ffd9a8', '#2a1c2e', 0.75]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 6, 5]} intensity={2.6} color="#ffc389" castShadow />
          <directionalLight position={[-5, 2, -4]} intensity={0.8} color="#5f8fd0" />
          <directionalLight position={[0, -3, -6]} intensity={0.4} color="#ff9ad5" />
          <Suspense fallback={null}>
            <FrameOnLoad>
              <Rig autoRotate={autoRotate}>
                <GLTFModel src={src} />
              </Rig>
              <ContactShadows position={[0, -1.2, 0]} opacity={0.55} scale={8} blur={2.4} far={4} />
            </FrameOnLoad>
          </Suspense>
        </Canvas>
      </GLTFBoundary>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export default ModelBlock;