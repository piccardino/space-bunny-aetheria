/**
 * WEBGL CONTEXT GUARD
 * ===================
 * A lost GPU context is the mobile failure that looks exactly like "the site
 * went black and never came back".
 *
 * What happens, per the WebGL spec:
 *
 *   1. The browser fires `webglcontextlost` on the canvas.
 *   2. The application is REQUIRED to call `preventDefault()` on that event.
 *      Without it the browser assumes the app cannot cope and NEVER restores
 *      the context — the canvas stays dead for the rest of the page's life.
 *   3. The browser then fires `webglcontextrestored` with a fresh context.
 *
 * three.js does call preventDefault, so step 2 is usually covered. What is NOT
 * covered is step 3: every WebGLRenderTarget allocated before the loss —
 * the whole postprocessing chain, the bloom mip pyramid, SMAA's lookup
 * textures — still holds handles into a context that no longer exists. Nothing
 * reallocates them, because from React's point of view nothing changed: same
 * canvas, same size, same props. The composer dutifully blits from dead
 * textures, and the result is a canvas that renders, at the right resolution,
 * pure black. Forever.
 *
 * This component closes that gap. It bumps a generation counter on restore, and
 * the EffectComposer keys off that counter, so the composer is rebuilt against
 * the live context. That is the whole fix.
 *
 * Why this fires on mobile in particular: the GPU has a hard memory ceiling and
 * the browser reclaims contexts under pressure, most often when the page is
 * re-composited — which is exactly what a pinch-zoom does. On a laptop with a
 * discrete GPU that essentially never happens, which is why the bug reads as
 * "only on my phone".
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useWorld } from '../core/store.js';

export function ContextGuard() {
  const gl = useThree((s) => s.gl);
  const setGlLost = useWorld((s) => s.setGlLost);
  const bumpGlGeneration = useWorld((s) => s.bumpGlGeneration);

  useEffect(() => {
    const canvas = gl.domElement;

    const onLost = (event) => {
      // Required by spec, and without it there is no restore to recover from.
      event.preventDefault();
      setGlLost(true);
      if (import.meta.env.DEV) {
        console.warn('[aetheria] WebGL context lost — waiting for the browser to restore it');
      }
    };

    const onRestored = () => {
      setGlLost(false);
      // force every GPU-side consumer to rebuild against the new context
      bumpGlGeneration();
      if (import.meta.env.DEV) {
        console.info('[aetheria] WebGL context restored — rebuilding render targets');
      }
    };

    // Surface the raw event regardless of build mode. This is the single most
    // useful thing to know when a phone renders a black screen after a pinch:
    // if these fire, the cause is a reclaimed GPU context, and if they do not,
    // it is something else entirely.
    window.__aetheriaContextEvents = [];
    const record = (name) => () => {
      window.__aetheriaContextEvents?.push({ name, t: Date.now() });
    };
    canvas.addEventListener('webglcontextlost', record('lost'), true);
    canvas.addEventListener('webglcontextrestored', record('restored'), true);

    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost, false);
      canvas.removeEventListener('webglcontextrestored', onRestored, false);
    };
  }, [gl, setGlLost, bumpGlGeneration]);

  return null;
}

export default ContextGuard;
