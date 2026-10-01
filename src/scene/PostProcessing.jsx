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

export function PostProcessing({ quality }) {
  const bloom = quality?.bloom ?? true;
  const smaa = quality?.smaa ?? true;
  const vignette = quality?.vignette ?? true;

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
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