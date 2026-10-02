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
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import { useThree } from '@react-three/fiber';
import { useWorld } from '../core/store.js';

export function PostProcessing({ quality }) {
  const bloom = quality?.bloom ?? true;
  const smaa = quality?.smaa ?? true;
  const vignette = quality?.vignette ?? true;

  /*
   * Keep the composer's buffers on the canvas's resolution, and on the current
   * GPU context.
   *
   * EffectComposer sizes its render targets from the CSS `size` and the
   * renderer's pixel ratio, but it only RE-SIZES when the CSS size changes.
   * A pixel-ratio change with a stationary CSS box — a pinch-zoom on mobile, a
   * browser zoom, the Low-res button — reallocates the canvas drawing buffer
   * and leaves the composer rendering at the old resolution. The final blit
   * then samples a region that no longer lines up and the output goes black.
   *
   * The second half of the key is the GPU context generation. After a context
   * loss every render target this chain allocated is dead — it points into a
   * context that was thrown away — and nothing rebuilds it, because from
   * React's point of view nothing changed. The composer keeps blitting dead
   * textures: a black canvas that never recovers. See ContextGuard.jsx.
   *
   * Remounting is the blunt but reliable way to force a rebuild. It costs a
   * handful of render targets on a change that happens a few times per
   * session, which is nothing next to being stuck on a black screen.
   */
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const glGeneration = useWorld((s) => s.glGeneration);

  // the product is what actually has to match the drawing buffer
  const key = `${Math.round(size.width * dpr)}x${Math.round(size.height * dpr)}#${glGeneration}`;

  return (
    <EffectComposer key={key} multisampling={0} enableNormalPass={false}>
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
    </EffectComposer>
  );
}

export default PostProcessing;