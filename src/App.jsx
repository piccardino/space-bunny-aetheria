/**
 * APP
 * ---
 * Routes, the persistent WebGL canvas and the chrome around it.
 *
 * The canvas is deliberately NEVER unmounted when you navigate to a page: it
 * stays alive behind the content so returning to the island is instant and the
 * idle orbit keeps running in the background. The page overlay simply slides
 * over it.
 */
import { Suspense, lazy, useCallback, useRef, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';

import { Scene } from './scene/Scene.jsx';
import { HUD } from './ui/HUD.jsx';
import { Intro } from './ui/Intro.jsx';
import { HoverLabel } from './ui/HoverLabel.jsx';
import { useSceneTransition, TransitionVeil } from './navigation/SceneTransition.jsx';
import { useWorld } from './core/store.js';
import { supportsWebGL } from './core/quality.js';
import { asset } from './core/asset.js';
import { playSfx } from './audio/audio.js';

const PlacePage = lazy(() => import('./pages/PlacePage.jsx').then((m) => ({ default: m.PlacePage })));
const NotFound = lazy(() => import('./pages/PlacePage.jsx').then((m) => ({ default: m.PlacePage })));

export default function App() {
  const world = useRef({});
  const router = useLocation();
  const navigate = useNavigate();
  const veil = useSceneTransition();
  const phase = useWorld((s) => s.phase);
  const hoveredId = useWorld((s) => s.hoveredId);
  const tier = useWorld((s) => s.tier);
  const renderScale = useWorld((s) => s.renderScale);

  const onArrive = useCallback(() => {
    useWorld.getState().arriveAt();
  }, []);

  // a soft tick whenever the hovered building changes
  useEffect(() => {
    if (hoveredId) playSfx('hover');
  }, [hoveredId]);

  // restore the phase when returning to the island from a deep link
  useEffect(() => {
    if (router.pathname === '/' && phase === 'loading') {
      // let the intro own the first load; nothing to do here
    }
  }, [router.pathname, phase]);

  if (!supportsWebGL()) return <WebGLFallback />;

  return (
    <div className="app">
      {/* ---------- the persistent world ---------- */}
      <div className="app__canvas" id="scene-layer">
        <Canvas
          /*
           * The pixel ratio is owned HERE, by R3F, and nowhere else.
           *
           * It used to be declared as the range `dpr={[1, 2]}` while Scene.jsx
           * ALSO called `gl.setPixelRatio(min(devicePixelRatio, tier.dpr))`
           * directly on the renderer. Two owners, two different answers: R3F
           * resolved the range to 2, the tier clamped it to 1.6, and the canvas
           * drawing buffer ended up 1280x1.6 = 2048 wide.
           *
           * The EffectComposer, though, only re-sizes itself when the CSS
           * `size` changes (see @react-three/postprocessing: its effect depends
           * on `[composer, size]` and nothing else). It read the drawing buffer
           * size once, while R3F's ratio of 2 was still in effect, so its
           * render targets stayed 1280x2 = 2560 wide.
           *
           * Result: the composer rendered into a buffer 1.25x larger than the
           * canvas, and the final blit sampled a region that no longer lined up
           * with it — the screen went black. It looked intermittent because
           * whether the two disagreed depended on the device pixel ratio and
           * the detected tier, so it hit some machines and some moments and
           * not others.
           *
           * A single number, owned by R3F, keeps the canvas and the composer
           * in lockstep: R3F re-applies it on every resize and on every tier
           * change, and the composer follows through `size`.
           *
           * `renderScale` is the Low-res button: it multiplies that ratio, so
           * 0.6 draws the island into 36% of the pixels. It goes through the
           * same single owner rather than touching the renderer directly, which
           * is what keeps the composer in step when it changes.
           */
          dpr={
            Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, tier.dpr)
            * renderScale
          }
          shadows
          gl={{
            antialias: false,
            powerPreference: 'high-performance',
            alpha: false,
            stencil: false,
          }}
          camera={{ fov: 42, near: 0.5, far: 1400, position: [0, 60, 150] }}
          onCreated={({ gl }) => {
            gl.setClearColor('#0b0708');
            document.body.dataset.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'true'
              : 'false';
          }}
        >
          <Suspense fallback={null}>
            <Scene world={world.current} onArrive={onArrive} />
          </Suspense>
        </Canvas>
      </div>

      {/* ---------- content layer ---------- */}
      <div className={`app__content ${router.pathname === '/' ? 'is-hidden' : 'is-visible'}`}>
        <Suspense fallback={<div className="page-loading">Opening the archive…</div>}>
          <Routes>
            <Route path="/" element={null} />
            <Route path="/projects" element={<PlacePage route="/projects" />} />
            <Route path="/experiments" element={<PlacePage route="/experiments" />} />
            <Route path="/gallery" element={<PlacePage route="/gallery" />} />
            <Route path="/about" element={<PlacePage route="/about" />} />
            <Route path="/archive" element={<PlacePage route="/archive" />} />
            <Route path="/lab" element={<PlacePage route="/lab" />} />
            <Route path="/chronicle" element={<PlacePage route="/chronicle" />} />
            <Route path="/contact" element={<PlacePage route="/contact" />} />
            <Route path="*" element={<NotFound route="/projects" />} />
          </Routes>
        </Suspense>
      </div>

      {/* ---------- chrome ---------- */}
      <HUD world={world.current} />
      <HoverLabel />
      <TransitionVeil veil={veil} />
      <Intro />
    </div>
  );
}

function WebGLFallback() {
  return (
    <div className="fallback">
      <div className="fallback__inner">
        <h1>AETHERIA</h1>
        <p>
          This world is rendered live with WebGL, and this browser can&rsquo;t run it.
          <br />
          Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.
        </p>
        <a className="btn btn--primary" href={asset('/projects')}>Browse the archive instead →</a>
      </div>
    </div>
  );
}