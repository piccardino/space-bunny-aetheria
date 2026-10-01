/**
 * VoxelMesh — turns a VoxelCanvas (or a factory returning one) into a single
 * `<mesh>` in the scene.
 *
 * Meshing happens inside `useMemo`, so it runs once per canvas and never again.
 * For big objects pass `defer` to move the work off the first paint.
 */
import { forwardRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { meshVoxels } from './mesher.js';
import { getVoxelMaterials } from './materials.js';

/**
 * @param {object}   props
 * @param {import('./VoxelCanvas').VoxelCanvas | (() => import('./VoxelCanvas').VoxelCanvas)} props.canvas
 * @param {[number,number,number]} [props.offset]  world shift applied to the voxels
 * @param {number[]} [props.position]                group position
 * @param {number[]} [props.rotation]                group rotation (euler radians)
 * @param {number}   [props.scale=1]
 * @param {object}   [props.meshOptions]             per-mesh options (aoStrength, jitter, castShadow…)
 * @param {boolean}  [props.castShadow=true]
 * @param {boolean}  [props.receiveShadow=true]
 * @param {THREE.Material[]} [props.materials]        override the shared set
 * @param {THREE.BufferGeometry} [props.geometry]    pre-built geometry (skips meshing)
 * @param {string}   [props.name]
 */
export const VoxelMesh = forwardRef(function VoxelMesh(
  {
    canvas,
    geometry: providedGeometry,
    offset = [0, 0, 0],
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    meshOptions,
    castShadow = true,
    receiveShadow = true,
    materials,
    name,
    children,
    onPointerOver,
    onPointerOut,
    onPointerDown,
    onPointerMove,
    onClick,
    renderOrder,
    visible = true,
    frustumCulled = true,
  },
  ref,
) {
  // A caller that already built the geometry (a building shares it with its
  // hover outline) passes it in, so the canvas is never meshed twice.
  const owned = useMemo(() => {
    if (providedGeometry) return null;
    const c = typeof canvas === 'function' ? canvas() : canvas;
    return meshVoxels(c, { offset, ...meshOptions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providedGeometry, canvas, offset[0], offset[1], offset[2], meshOptions]);

  const geometry = providedGeometry ?? owned;

  useEffect(() => () => owned?.dispose(), [owned]);

  const mats = materials ?? getVoxelMaterials().array;

  return (
    <group position={position} rotation={rotation} scale={scale} visible={visible}>
      <mesh
        ref={ref}
        name={name}
        geometry={geometry}
        material={mats}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        frustumCulled={frustumCulled}
        renderOrder={renderOrder}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClick}
      />
      {children}
    </group>
  );
});

export default VoxelMesh;