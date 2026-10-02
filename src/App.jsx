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
import { Suspense, lazy, useCallback, useRef, useEffect, useState } from 'react';
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

  /**
   * Keep the canvas in step with the display, not just with mount time.
   *
   * Reading `window.devicePixelRatio` during render is only correct for as long
   * as the ratio holds still. On a phone it does not:
   *
   *   • a browser UI bar sliding in/out (address bar collapsing on scroll)
   *     fires a resize without changing the CSS size;
   *   • pinch-zoom on any region that is NOT `touch-action: none` — the page
   *     overlay, the HUD — scales the visual viewport, so devicePixelRatio moves
   *     while the canvas box stays put.
   *
   * The EffectComposer resizes its render targets only when the CSS `size`
   * changes, never when the pixel ratio changes. So a ratio that moves on its
   * own leaves the composer rendering at the old resolution and the final blit
   * samples a region that no longer lines up with the canvas — the screen goes
   * black. It looks intermittent because it depends on whether the gesture
   * landed on the canvas or on the chrome above it.
   *
   * Subscribing to the ratio makes it an explicit input: the whole Canvas tree
   * re-renders, R3F re-applies `dpr`, and the composer follows on the next
   * layout pass instead of being left behind.
   */
  const dpr = useViewportDpr(tier.dpr) * renderScale;

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
          dpr={dpr}
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

/**
 * The device pixel ratio, as a value that UPDATES.
 *
 * Three things move it at runtime, and none of them is a React render:
 *   • pinch-zooming part of the page (the visual viewport scales);
 *   • the browser's own zoom / display change;
 *   • dragging a window between a Retina and a non-Retina screen.
 *
 * Detection is deliberately belt-and-braces, because each signal alone misses
 * cases:
 *
 *   • a matchMedia `(resolution: Ndppx)` query is the standard way to be told
 *     about a ratio change, but a browser only re-evaluates it when the query
 *     is re-created at the new value, so it has to be rebuilt each time it
 *     fires — a query created once goes stale and silent;
 *   • `resize` covers the cases where the layout viewport changes (a mobile
 *     address bar collapsing) which may not re-evaluate the query;
 *   • a ResizeObserver on the canvas is the backstop: R3F re-allocates the
 *     drawing buffer when the ratio changes, so the canvas element itself is a
 *     reliable witness that something moved, even on the engines where the
 *     matchMedia query silently stops firing.
 *
 * @param {number} maxDpr  the tier ceiling to clamp against
 */
function useViewportDpr(maxDpr) {
  const read = () =>
    typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr);

  const [dpr, setDpr] = useState(read);

  useEffect(() => {
    const update = () =>
      setDpr((prev) => {
        const next = read();
        // bail when nothing moved, so a chatty resize cannot re-render forever
        return Math.abs(prev - next) < 0.001 ? prev : next;
      });

    // A ratio change and a viewport change are told apart by whether the ratio
    // itself differs; either way the canvas has to be told to re-measure.
    let mq = null;
    const armQuery = () => {
      mq?.removeEventListener?.('change', onMediaChange);
      if (typeof window.matchMedia !== 'function') return;
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener?.('change', onMediaChange);
    };

    function onMediaChange() {
      update();
      // re-arm at the new ratio so the next change is caught too
      armQuery();
    }

    const onResize = () => update();
    const onOrientation = () => setTimeout(update, 120);

    update();
    armQuery();

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);

    // Backstop: the canvas element changing size means the drawing buffer was
    // reallocated, which only happens when the effective ratio moved.
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      const el = document.querySelector('.app__canvas canvas');
      if (el) {
        ro = new ResizeObserver(() => update());
        ro.observe(el);
      }
    }

    return () => {
      mq?.removeEventListener?.('change', onMediaChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      ro?.disconnect();
    };
  }, [maxDpr]);

  return dpr;
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