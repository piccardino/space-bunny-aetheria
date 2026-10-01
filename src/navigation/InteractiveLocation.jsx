/**
 * INTERACTIVE LOCATION
 * ====================
 * Wrap ANY 3D object to turn it into a page of the website.
 *
 * It owns every piece of feedback the island needs when you point at a building:
 *
 *   • cursor becomes a pointer
 *   • a soft emissive lift (via a per-location material clone)
 *   • an elegant inverted-hull outline in the location's accent colour, built
 *     by inflating the object's own merged geometry along its normals
 *   • a subtle scale "pop"
 *   • a floating HTML label (drawn OUTSIDE the canvas — see HoverLabel)
 *   • on click → beginFlyTo() → the scene transition flies and navigates
 *
 * USAGE
 *   <InteractiveLocation location={loc}>
 *     <VoxelMesh canvas={building.canvas} />
 *   </InteractiveLocation>
 *
 * Adding a new page therefore requires no new interaction code at all.
 */
import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '../core/store.js';
import { cloneVoxelMaterials } from '../voxel/materials.js';
import { meshVoxels } from '../voxel/mesher.js';
import { inflateGeometry } from '../voxel/inflate.js';
import { damp } from '../core/math.js';
import { locationOrigin } from '../world/locations/registry.js';

/**
 * How far the pointer may travel between pointerdown and pointerup and still
 * count as a click. R3F hands us the travelled distance on the click event, so
 * a camera drag that happens to START on a building no longer navigates away
 * from the island the instant the user releases the button.
 */
const CLICK_SLOP = 6;

export function InteractiveLocation({
  location,
  children,
  canvas,
  geometry,
  materials,
  position,
  rotation,
  scale,
  hoverLift = 0.05,
  hoverScale = 0.018,
  outlineColor,
  disabled = false,
}) {
  const setHovered = useWorld((s) => s.setHovered);
  const beginFlyTo = useWorld((s) => s.beginFlyTo);
  const phase = useWorld((s) => s.phase);
  const [hovered, setLocalHovered] = useState(false);
  const groupRef = useRef();
  const lift = useRef(0);

  const mats = useMemo(() => materials ?? cloneVoxelMaterials(), [materials]);

  /* ---- the single world-space placement for this location -------- */
  const origin = useMemo(
    () => position ?? locationOrigin(location),
    [position, location],
  );

  /* ---- pointer handling ---------------------------------------- */
  const onOver = useCallback((e) => {
    if (disabled) return;
    e.stopPropagation();
    setLocalHovered(true);
    setHovered(location.id);
    document.body.style.cursor = 'pointer';
    // The hover label is HTML and therefore cannot live inside <Canvas>, so we
    // publish the location to the store and let <HoverLabel/> draw it outside.
    useWorld.getState().setActive(location);
  }, [disabled, location, setHovered]);

  const onOut = useCallback((e) => {
    if (disabled) return;
    e.stopPropagation();
    setLocalHovered(false);
    setHovered(null);
    useWorld.getState().setActive(null);
    document.body.style.cursor = '';
  }, [disabled, setHovered]);

  const onClick = useCallback((e) => {
    if (disabled || phase !== 'exploring') return;
    // A drag is an orbit, never a navigation. `delta` is the pixel distance
    // the pointer travelled between down and up.
    if (typeof e.delta === 'number' && e.delta > CLICK_SLOP) return;
    e.stopPropagation();
    setLocalHovered(false);
    setHovered(null);
    useWorld.getState().setActive(null);
    document.body.style.cursor = '';
    beginFlyTo(location);
  }, [disabled, phase, location, beginFlyTo, setHovered]);

  useEffect(() => {
    if (phase !== 'exploring') {
      setLocalHovered(false);
      useWorld.getState().setActive(null);
      document.body.style.cursor = '';
    }
  }, [phase]);

  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  /* ---- per-frame feedback ------------------------------------- */
  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const want = hovered && !disabled && phase === 'exploring' ? 1 : 0;
    lift.current = damp(lift.current, want, 9, Math.min(dt, 0.05));
    const l = lift.current;

    // a subtle pop — enough to feel alive, never enough to look like a bounce
    const s = (scale ?? location.scale ?? 1) * (1 + l * hoverScale);
    g.scale.setScalar(s);

    for (const key of ['matte', 'metal']) {
      const m = mats[key];
      if (!m?.emissive) continue;
      m.emissiveIntensity = (m.userData.baseEmissive ?? 0) + l * hoverLift * 16;
    }
    if (mats.glow) {
      mats.glow.emissiveIntensity = (mats.glow.userData.baseEmissive ?? 1.35) * (1 + l * 0.85);
    }
  });

  const labelHeight = location.camera?.labelHeight ?? 30;

  /* ------------------------------------------------------------------ *
 * Outline shell — an inflated, back-facing copy of the building.
 * It is built from the SAME geometry as the visible mesh and lives in the same
 * model space, so it can never drift away from the building it highlights —
 * and the building is only voxel-meshed once, not twice.
 * ------------------------------------------------------------------ */
function LocationOutline({ geometry, location, lift, color }) {
  const ref = useRef();
  const geo = useMemo(
    () => (geometry ? inflateGeometry(geometry, 0.42) : null),
    [geometry],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color ?? location.accent ?? '#ffc76b'),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [color, location.accent],
  );

  useEffect(
    () => () => {
      geo?.dispose();
      material.dispose();
    },
    [geo, material],
  );

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const l = lift.current;
    m.visible = l > 0.015;
    if (m.visible) {
      const s = 1 + l * 0.012;
      m.scale.set(s, s, s);
      material.opacity = l * 0.62;
    }
  });

  if (!geo) return null;
  return (
    <mesh
      ref={ref}
      geometry={geo}
      material={material}
      visible={false}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  );
}

  /**
   * The invisible click volume, sized to the building's ACTUAL model bounds
   * instead of a fixed 30xN box. A hard-coded box either misses the upper
   * storeys of the clocktower or swallows its neighbours' courtyards, which is
   * what made hovering feel arbitrary. Bounds come from the canvas, so they
   * are exact for every building automatically.
   */
  const pick = useMemo(() => {
    if (!canvas || !canvas.voxels?.size) {
      return { size: [30, labelHeight, 30], center: [0, labelHeight / 2, 0] };
    }
    const [x0, y0, z0] = canvas.min;
    const [x1, y1, z1] = canvas.max;
    return {
      // a voxel at (x, y, z) fills the unit cube [x, x+1]
      size: [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1],
      center: [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (z0 + z1 + 1) / 2],
    };
  }, [canvas, labelHeight]);

  /**
   * Mesh the building if the caller did not supply shared geometry.
   * Buildings pass their own geometry in so the canvas is meshed once and the
   * hover outline reuses the result; this fallback is only for one-off props,
   * so whatever it builds here it must also release on unmount.
   */
  const ownGeometry = useMemo(
    () => (geometry || !canvas ? null : meshVoxels(canvas)),
    [geometry, canvas],
  );
  const buildingGeometry = geometry ?? ownGeometry;

  useEffect(() => () => ownGeometry?.dispose(), [ownGeometry]);

  return (
    <group
      ref={groupRef}
      position={origin}
      rotation={rotation ?? location.rotation}
      scale={scale ?? location.scale ?? 1}
    >
      {children}
      {buildingGeometry && (
        <LocationOutline geometry={buildingGeometry} location={location} lift={lift} color={outlineColor} />
      )}

      {/* invisible click volume covering the whole building */}
      <mesh
        visible={false}
        position={pick.center}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <boxGeometry args={pick.size} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

export default InteractiveLocation;

/** Build a merged geometry + a private material set for a one-off prop. */
export function makeStatic(canvas, opts) {
  return { geometry: meshVoxels(canvas, opts), materials: cloneVoxelMaterials() };
}