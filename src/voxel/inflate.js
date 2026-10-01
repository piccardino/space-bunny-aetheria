/**
 * Build an inflated copy of a geometry, pushing every vertex along its face
 * normal. Used for the hover outline: rendering the result with BackSide and a
 * flat accent colour gives a clean inverted-hull silhouette with zero cost on
 * the main pass.
 */
import * as THREE from 'three';

export function inflateGeometry(geometry, amount = 0.35) {
  const src = geometry;
  const pos = src.getAttribute('position');
  const nrm = src.getAttribute('normal');
  if (!pos || !nrm) return src.clone();

  const out = new THREE.BufferGeometry();
  const p = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    p[i * 3] = pos.getX(i) + nrm.getX(i) * amount;
    p[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * amount;
    p[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * amount;
  }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm.array), 3));
  out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  if (src.index) out.setIndex(src.index.clone());
  out.computeBoundingSphere();
  return out;
}

export default inflateGeometry;