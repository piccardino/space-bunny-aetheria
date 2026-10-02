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

export function PostProcessing({ quality }) {
  const bloom = quality?.bloom ?? true;
  const smaa = quality?.smaa ?? true;
  const vignette = quality?.vignette ?? true;

  /*
   * Keep the composer's buffers on the canvas's resolution.
   *
   * EffectComposer sizes its render targets from the CSS `size` and the
   * renderer's pixel ratio, but it only RE-SIZES when the CSS size changes.
   * A pixel-ratio change with a stationary CSS box — a pinch-zoom on mobile, a
   * browser zoom, the Low-res button — reallocates the canvas drawing buffer
   * and leaves the composer rendering at the old resolution. The final blit
   * then samples a region that no longer lines up and the output goes black.
   *
   * This was reported as "pinch with two fingers and the screen turns black",
   * and it is why the symptom looked random: whether it happened depended on
   * whether the gesture moved the CSS box at all.
   *
   * The fix is to make the size the composer sees depend on the ratio too, by
   * handing it a `size` that R3F re-derives whenever the viewport state
   * changes. Remounting on the buffer dimensions is the blunt but reliable
   * version of that: a fresh composer is built at the correct size, which costs
   * a couple of render targets on a change that happens a handful of times.
   */
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // the product is what actually has to match the drawing buffer
  const key = `${Math.round(size.width * dpr)}x${Math.round(size.height * dpr)}`;

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