/**
 * POST PROCESSING
 * ---------------
 * Deliberately restrained. The voxel art and the baked AO already carry the
 * image, so the job here is only to:
 *   • let the emissive voxels bloom (lamps, coils, portal, beacon)
 *   • add a light vignette to focus the eye on the island
 *   • optionally smooth edges on desktop
 *
 * Bloom is kept low-threshold and low-intensity so the scene stays readable —
 * a blown-out image is worse than no glow.
 */
import { useEffect, useRef } from 'react';
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { useThree } from '@react-three/fiber';
import { useWorld } from '../core/store.js';

/*
 * ONE composer instance for the life of the page.
 * --------------------------------------------
 * `EffectComposer` derives its render targets from the renderer's drawing
 * buffer, but it only re-measures them when the CSS `size` changes:
 *
 *   useEffect(() => composer?.setSize(size.width, size.height), [composer, size])
 *
 * A pixel-ratio change with a stationary CSS box — a pinch-zoom, a browser zoom,
 * the Low-res button, an address bar collapsing on mobile — reallocates the
 * drawing buffer without changing `size`. The composer's targets then stay at
 * the old resolution while the final blit samples a region that no longer lines
 * up, and the output goes black.
 *
 * The previous fix keyed the composer on the buffer dimensions, so every ratio
 * change remounted it. That did put the buffers back in sync, but each remount
 * abandoned the old composer's render targets without disposing them — the
 * bloom mip pyramid and the SMAA lookup textures all stayed resident. The
 * measured cost was two textures leaked per remount, so a rapid pinch (which
 * moves the ratio many times a second) exhausted GPU memory, the browser
 * reclaimed the context, and the canvas went black for good.
 *
 * So: remounting is not the answer. Keep a single composer, and simply tell it
 * to re-measure whenever EITHER the CSS size or the pixel ratio moves. That
 * covers the resize and the ratio change with no remount at all.
 *
 * The one remount that is still required is the GPU context generation. After a
 * context loss every render target this chain allocated points into a context
 * that was thrown away, and nothing rebuilds it because from React's point of
 * view nothing changed — see ContextGuard.jsx. That event is rare, and it is
 * the only thing that gets a fresh composer, which is now disposed properly on
 * the way out instead of leaking.
 */
function ComposerInstance({ children }) {
  const ref = useRef(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // Re-measure on a ratio change as well as a size change. `setSize` reads the
  // renderer's CURRENT drawing buffer, so this picks up the new pixel ratio.
  useEffect(() => {
    ref.current?.setSize(size.width, size.height);
  }, [ref, size, dpr]);

  /*
   * Dispose on unmount — but NOT when the unmount was caused by a GPU context
   * loss.
   *
   * A normal remount (the page going away, the chain being rebuilt) must free its
   * render targets, or they stay resident for the life of the document.
   *
   * A context-loss remount is different. The old targets were allocated in the
   * context that the browser just threw away, so they are already gone. Calling
   * dispose() on them now issues `deleteTexture`/`deleteFramebuffer` against the
   * RESTORED context, using handle numbers that the new context has already
   * handed out to live objects — which frees textures and framebuffers that the
   * freshly built composer is actively using. The symptom is the worst kind:
   * everything reports as correctly sized and wired, and the canvas renders pure
   * black forever.
   *
   * So the generation is captured at mount and compared in the cleanup: if it
   * moved, the resources died with the context and there is nothing to free.
   */
  const mountedGeneration = useRef(useWorld.getState().glGeneration);
  useEffect(() => {
    const composer = ref.current;
    const generation = mountedGeneration.current;
    return () => {
      if (useWorld.getState().glGeneration !== generation) return; // context was replaced
      composer?.dispose();
    };
  }, []);

  return (
    <EffectComposer ref={ref} multisampling={0} enableNormalPass={false}>
      {children}
    </EffectComposer>
  );
}

export function PostProcessing({ quality }) {
  const bloom = quality?.bloom ?? true;
  const smaa = quality?.smaa ?? true;
  const vignette = quality?.vignette ?? true;
  const glGeneration = useWorld((s) => s.glGeneration);

  return (
    <ComposerInstance key={glGeneration}>
      {bloom ? (
        <Bloom
          intensity={0.62}
          luminanceThreshold={0.62}
          luminanceSmoothing={0.28}
          kernelSize={KernelSize.MEDIUM}
          mipmapBlur
        />
      ) : (
        <></>
      )}
      {vignette ? (
        <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
      ) : (
        <></>
      )}
      {smaa ? <SMAA /> : <></>}
    </ComposerInstance>
  );
}

export default PostProcessing;