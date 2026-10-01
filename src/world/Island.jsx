/**
 * ISLAND
 * ------
 * Composes the whole world into the scene graph:
 *
 *   • terrain + under-island + vegetation as three merged static meshes
 *   • every registered location wrapped in <InteractiveLocation/>
 *   • all the moving parts (gears, propellers, turbines, portals, telescopes…)
 *     as their own groups so they can actually rotate
 *
 * Everything static is merged, so the entire island — hundreds of thousands of
 * voxels — costs roughly a dozen draw calls.
 *
 * COORDINATE SPACES
 * -----------------
 * There are exactly two, and they never mix:
 *
 *   MODEL SPACE  each builder paints its building around the local origin
 *                (footprint centred on x/z = 0, ground floor at y = 0). The
 *                model mesh, the hover outline, every animated part, the pick
 *                volume and the label anchor all live here, untouched.
 *
 *   WORLD SPACE  `<InteractiveLocation>` places the whole model-space group at
 *                `locationOrigin(loc)` (see registry.js). That is the ONLY
 *                place a world coordinate is introduced.
 *
 * A previous version compensated by giving the mesh a `-loc.position` offset
 * inside a group already placed at `+loc.position`. That cancelled the group's
 * translation but NOT its rotation, so every building was drawn at the island
 * centre — rotated by its own heading — while its outline and its animated
 * parts sat correctly on the plateau. The two halves never lined up.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import VoxelMesh from '../voxel/VoxelMesh.jsx';
import { getVoxelMaterials, cloneVoxelMaterials } from '../voxel/materials.js';
import { meshVoxels } from '../voxel/mesher.js';
import { InteractiveLocation } from '../navigation/InteractiveLocation.jsx';
import { LOCATIONS } from './locations/registry.js';
import { buildWorld } from './buildWorld.js';
import { gearXY, gearXZ } from './locations/models/parts.js';
import VoxelCanvas from '../voxel/VoxelCanvas.js';

/** Mesh a small canvas once and reuse the geometry. */
export function useGearGeometry(r, teeth, mat, hub, plane = 'xy') {
  return useMemo(() => {
    const c = new VoxelCanvas('gear');
    if (plane === 'xy') gearXY(c, 0, 0, 0, r, teeth, mat, hub);
    else gearXZ(c, 0, 0, 0, r, teeth, mat, hub);
    return meshVoxels(c, { center: true });
  }, [r, teeth, mat, hub, plane]);
}

export function Island({ quality, interactive = true }) {
  const w = useMemo(
    () => buildWorld({ vegetationDensity: quality?.vegetationDensity ?? 1 }),
    [quality],
  );
  const locMats = useMemo(() => {
    const out = {};
    for (const l of LOCATIONS) out[l.id] = cloneVoxelMaterials();
    return out;
  }, []);

  return (
    <group>
      {/* ---------------- static world ---------------- */}
      <VoxelMesh canvas={w.terrain} castShadow receiveShadow name="terrain" />
      <VoxelMesh canvas={w.under} castShadow receiveShadow name="underisland" />
      <VoxelMesh canvas={w.flora} castShadow receiveShadow name="flora" />

      {/* ---------------- the buildings ---------------- */}
      {LOCATIONS.map((loc) => {
        const b = w.buildings[loc.id];
        if (!b) return null;
        return <Building key={loc.id} location={loc} building={b} materials={locMats[loc.id]} disabled={!interactive} />;
      })}

      <UnderislandMotion anim={w.underAnim} />
      <SkyTraffic airships={w.airships} count={quality?.flyAirships ?? 3} />
    </group>
  );
}
/**
 * One registered place: the shared building geometry, the hover wrapper and the
 * animated machinery. Split out so the geometry can be meshed ONCE and handed
 * to both the visible mesh and the outline shell.
 */
function Building({ location, building, materials, disabled }) {
  const geometry = useMemo(() => meshVoxels(building.canvas), [building.canvas]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <InteractiveLocation
      location={location}
      canvas={building.canvas}
      geometry={geometry}
      materials={materials}
      disabled={disabled}
    >
      <VoxelMesh geometry={geometry} castShadow receiveShadow name={location.id} />
      <AnimatedParts location={location} anim={building.anim} />
    </InteractiveLocation>
  );
}

function AnimatedParts({ location, anim, airshipGeo }) {
  switch (location.id) {
    case 'clocktower': return <ClocktowerMotion anim={anim} />;
    case 'airshipdock': return <DockMotion anim={anim} airshipGeo={airshipGeo} />;
    case 'observatory': return <ObservatoryMotion anim={anim} />;
    case 'laboratory': return <LabMotion anim={anim} />;
    case 'energytower': return <BeaconMotion anim={anim} />;
    case 'portal': return <PortalMotion anim={anim} />;
    case 'workshop': return <WorkshopMotion anim={anim} />;
    case 'library': return <LibraryMotion anim={anim} />;
    default: return null;
  }
}

/* ---------- Clockwork Spire: gear train + hands + weathervane ---- */
function ClocktowerMotion({ anim }) {
  const gears = useRef([]);
  const hands = useRef([]);
  const vane = useRef();

  const gearGeos = useMemo(
    () =>
      (anim.gears ?? []).map((g) => {
        const c = new VoxelCanvas('gear');
        gearXY(c, 0, 0, 0, g.r, g.teeth, g.mat, g.hub);
        return meshVoxels(c, { center: true });
      }),
    [anim.gears],
  );

  const handGeos = useMemo(() => {
    const mk = (len) => {
      const c = new VoxelCanvas('hand');
      for (let i = 0; i < len; i++) c.set(0, i, 0, 'ironDark');
      c.set(0, len, 0, 'lampWarm');
      return meshVoxels(c);
    };
    return { hour: mk(4), minute: mk(6) };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    (anim.gears ?? []).forEach((g, i) => {
      const o = gears.current[i];
      if (o) o.rotation.z = t * g.speed;
    });
    if (hands.current[0]) hands.current[0].rotation.z = -t * 0.09;
    if (hands.current[1]) hands.current[1].rotation.z = -t * 0.9;
    if (vane.current) vane.current.rotation.y = t * 0.12;
  });

  return (
    <group>
      {(anim.gears ?? []).map((g, i) => (
        <mesh key={i} ref={(el) => { gears.current[i] = el; }}
          geometry={gearGeos[i]} material={getVoxelMaterials().array}
          position={[g.x, g.y, 11.7]} castShadow />
      ))}
      <mesh ref={(el) => { hands.current[0] = el; }} geometry={handGeos.hour}
        material={getVoxelMaterials().array} position={[0, 33, 12.5]} />
      <mesh ref={(el) => { hands.current[1] = el; }} geometry={handGeos.minute}
        material={getVoxelMaterials().array} position={[0, 33, 12.9]} />
      {anim.vane && (
        <group ref={vane} position={[0, anim.vane.y - 2, 0]}>
          {/* the arrow itself — an asymmetric silhouette so it reads as a vane */}
          <mesh position={[1, 0, 0]} material={getVoxelMaterials().array} castShadow>
            <boxGeometry args={[7, 1.6, 0.8]} />
            <meshStandardMaterial color="#cba44b" metalness={0.9} roughness={0.3} />
          </mesh>
          {/* the arrow head */}
          <mesh position={[5.4, 0, 0]} material={getVoxelMaterials().array} castShadow>
            <boxGeometry args={[2.4, 3, 0.8]} />
            <meshStandardMaterial color="#b26c3d" metalness={0.9} roughness={0.32} />
          </mesh>
          {/* the tail fin */}
          <mesh position={[-3.2, 0, 0]} material={getVoxelMaterials().array} castShadow>
            <boxGeometry args={[2.2, 2.6, 0.8]} />
            <meshStandardMaterial color="#8a4a34" metalness={0.7} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ---------- Mooring Mast: moored airship + crane + windsock ------ */
function DockMotion({ anim, airshipGeo }) {
  const ship = useRef();
  const crane = useRef();
  const hook = useRef();
  const sock = useRef();

  const propGeo = useGearGeometry(3.4, 6, 'brass', 'ironDark', 'xy');

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ship.current) {
      // the moored airship breathes on its ropes
      ship.current.position.y = (anim.airship?.y ?? 13) + Math.sin(t * 0.5) * 0.55;
      ship.current.rotation.z = Math.sin(t * 0.42) * 0.018;
      ship.current.rotation.y = 0.06 * Math.sin(t * 0.3);
    }
    if (crane.current) crane.current.position.z = Math.sin(t * 0.14) * 6;
    if (hook.current) hook.current.position.y = (anim.hook?.y ?? 18) - 2 - Math.abs(Math.sin(t * 0.5)) * 5;
    if (sock.current) {
      sock.current.rotation.y = -0.9 + Math.sin(t * 1.6) * 0.22;
      sock.current.rotation.z = Math.sin(t * 2.1) * 0.12;
    }
  });

  const a = anim.airship;
  if (!a) return null;

  return (
    <group>
      {/* the moored airship: real voxel geometry, not a smooth primitive —
          anything rounded would read as a different material in the scene */}
      {airshipGeo && (
        <group ref={ship} position={[a.x, a.y, a.z]}>
          <mesh geometry={airshipGeo} material={getVoxelMaterials().array} castShadow />
        </group>
      )}

      {crane.current !== undefined && (
        <group ref={crane} position={[0, anim.crane?.y ?? 22, 0]}>
          <mesh material={getVoxelMaterials().array} castShadow>
            <boxGeometry args={[22, 2, 3]} />
            <meshStandardMaterial color="#70737b" metalness={0.9} roughness={0.34} />
          </mesh>
          <mesh position={[-8, -1.5, 0]} material={getVoxelMaterials().array}>
            <boxGeometry args={[4, 3, 4]} />
            <meshStandardMaterial color="#3f4249" metalness={0.9} roughness={0.4} />
          </mesh>
        </group>
      )}
      <group ref={hook} position={[0, anim.hook?.y ?? 18, 0]}>
        <mesh position={[0, -4, 0]} material={getVoxelMaterials().array}>
          <boxGeometry args={[0.4, 8, 0.4]} />
          <meshStandardMaterial color="#2a2b31" metalness={0.8} roughness={0.5} />
        </mesh>
        <mesh position={[0, -8.6, 0]} material={getVoxelMaterials().array}>
          <boxGeometry args={[2.4, 2.4, 2.4]} />
          <meshStandardMaterial color="#cba44b" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>
      <mesh ref={sock} geometry={propGeo} material={getVoxelMaterials().array}
        position={[anim.windsock?.x ?? 15, anim.windsock?.y ?? 21, anim.windsock?.z ?? -1]} />
    </group>
  );
}

/* ---------- Gilded Eye: the great refractor sweeps the sky -------- */
function ObservatoryMotion({ anim }) {
  const scope = useRef();
  const orrery = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (scope.current) {
      scope.current.rotation.z = Math.sin(t * 0.11) * 0.42;   // declination
      scope.current.rotation.y = Math.sin(t * 0.07) * 1.25;   // right ascension
    }
    if (orrery.current) orrery.current.rotation.y = t * 0.35;
  });

  const base = anim.telescope;
  if (!base) return null;

  return (
    <group>
      {/* The refractor is deliberately SMALL and sits low inside the drum.
          An earlier pass had a full-length smooth cylinder swinging out of the
          dome, which read as a floating blue disc — smooth primitives also
          clash with the voxel language. Kept tight, it reads as machinery. */}
      <group ref={scope} position={[base.x, base.y - 3, base.z]} scale={0.55}>
        <mesh position={[7, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[2.2, 2.7, 20, 8]} />
          <meshStandardMaterial color="#cba44b" metalness={0.92} roughness={0.26} />
        </mesh>
        <mesh position={[17, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[2.9, 2.3, 3.4, 8]} />
          <meshStandardMaterial color="#b26c3d" metalness={0.92} roughness={0.3} />
        </mesh>
        {/* the objective — small, and only faintly emissive */}
        <mesh position={[-3.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[2.3, 2.3, 0.4, 8]} />
          <meshStandardMaterial color="#8fb8d8" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh position={[2, 3.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.6, 0.6, 6, 6]} />
          <meshStandardMaterial color="#70737b" metalness={0.9} roughness={0.34} />
        </mesh>
        <mesh position={[-8, -2.4, 0]}>
          <boxGeometry args={[2.2, 2.2, 2.2]} />
          <meshStandardMaterial color="#3f4249" metalness={0.85} roughness={0.4} />
        </mesh>
      </group>

      <group ref={orrery} position={[-8, anim.orrery?.y ?? 4, 6]}>
        <mesh position={[0, 5, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 6, 6]} />
          <meshStandardMaterial color="#cba44b" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[2.2, 8, 0]} rotation={[0, 0, 0.5]}>
          <torusGeometry args={[2.2, 0.25, 6, 18]} />
          <meshStandardMaterial color="#b26c3d" metalness={0.9} roughness={0.32} />
        </mesh>
        <mesh position={[2.2, 8, 0]}>
          <sphereGeometry args={[0.9, 10, 10]} />
          <meshStandardMaterial color="#e3ba55" metalness={0.95} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Arc Lab: pulsing coils + a crackling crystal --------- */
function LabMotion({ anim }) {
  const coils = useRef([]);
  const arcs = useRef([]);
  const crystal = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    (anim.coils ?? []).forEach((c, i) => {
      const o = coils.current[i];
      if (!o) return;
      const charge = 0.5 + 0.5 * Math.sin(t * 1.5 - c.phase);
      o.scale.setScalar(0.8 + charge * 0.4);
      o.material.emissiveIntensity = 0.6 + charge * 2.4;
    });
    (anim.arcs ?? []).forEach((a, i) => {
      const o = arcs.current[i];
      if (!o) return;
      o.visible = Math.sin(t * 3.1 + i * 2.4) > 0.5;
      o.rotation.y = t * 6 + i;
      o.rotation.z = Math.sin(t * 9 + i) * 0.3;
    });
    if (crystal.current) {
      const p = 0.6 + 0.4 * Math.sin(t * 2.2);
      crystal.current.scale.setScalar(0.9 + p * 0.28);
    }
  });

  return (
    <group>
      {(anim.coils ?? []).map((c, i) => (
        <mesh key={i} ref={(el) => { coils.current[i] = el; }} position={[c.x, c.y + 1.4, c.z]}>
          <sphereGeometry args={[1.1, 8, 8]} />
          <meshStandardMaterial
            color="#7fd8f0"
            emissive="#9be8ff"
            emissiveIntensity={1.1}
            metalness={0.1}
            roughness={0.15}
            toneMapped={false}
          />
        </mesh>
      ))}

      {(anim.arcs ?? []).map((a, i) => (
        <group key={i} ref={(el) => { arcs.current[i] = el; }}
          position={[(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, (a.z0 + a.z1) / 2]}>
          <mesh>
            <boxGeometry args={[0.3, 0.3, Math.abs(a.x1 - a.x0) + 1]} />
            <meshBasicMaterial color="#9be8ff" toneMapped={false} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.2, 0.2, 4]} />
            <meshBasicMaterial color="#e8fbff" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {anim.crystal && (
        <mesh ref={crystal} position={[anim.crystal.x, anim.crystal.y - 0.5, anim.crystal.z]}>
          <octahedronGeometry args={[1.7, 0]} />
          <meshStandardMaterial
            color="#7fd8f0"
            emissive="#9be8ff"
            emissiveIntensity={1.4}
            metalness={0.1}
            roughness={0.1}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ---------- Beacon: rotating fresnel lens ------------------------ */
function BeaconMotion({ anim }) {
  const lens = useRef();

  useFrame((state) => {
    if (lens.current) lens.current.rotation.y = state.clock.elapsedTime * 0.42;
  });

  if (!anim.lens) return null;

  return (
    <group position={[0, anim.lens.y, 0]}>
      <mesh ref={lens} castShadow>
        <cylinderGeometry args={[4.4, 4.4, 8, 10, 1, true]} />
        <meshStandardMaterial
          color="#e8fbff"
          emissive="#9be8ff"
          emissiveIntensity={1.5}
          side={2}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#9be8ff" intensity={90} distance={70} decay={2} />
    </group>
  );
}

/* ---------- Threshold: three counter-rotating rings + field ------ */
function PortalMotion({ anim }) {
  const rings = useRef([]);
  const field = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    (anim.rings ?? []).forEach((r, i) => {
      const o = rings.current[i];
      if (o) o.rotation.z = t * r.speed;
    });
    if (field.current) {
      const p = 0.5 + 0.5 * Math.sin(t * 1.35);
      field.current.material.opacity = 0.3 + p * 0.3;
      field.current.scale.setScalar(0.94 + p * 0.1);
    }
  });

  const ringColors = { gold: '#e3ba55', copper: '#b26c3d', brass: '#cba44b' };

  return (
    <group>
      {(anim.rings ?? []).map((r, i) => (
        <mesh key={i} ref={(el) => { rings.current[i] = el; }}
          position={[0, r.y, 1]} castShadow>
          <torusGeometry args={[r.r, r.thickness * 0.55, 6, 26]} />
          <meshStandardMaterial color={ringColors[r.mat] ?? '#cba44b'} metalness={0.95} roughness={0.24} />
        </mesh>
      ))}

      {anim.field && (
        <>
          <mesh ref={field} position={[0, anim.field.y, 0]}>
            <circleGeometry args={[anim.field.r, 28]} />
            <meshBasicMaterial color="#c08cff" transparent opacity={0.4} side={2}
              depthWrite={false} blending={2} toneMapped={false} />
          </mesh>
          <pointLight position={[0, anim.field.y, 2]} color="#c08cff" intensity={150} distance={60} decay={2} />
        </>
      )}
    </group>
  );
}

/* ---------- Forge: trip-hammer + wall gears + hoist -------------- */
function WorkshopMotion({ anim }) {
  const hammer = useRef();
  const gears = useRef([]);
  const hoist = useRef();

  const wallGeos = useMemo(
    () =>
      (anim.wallGears ?? []).map((g) => {
        const c = new VoxelCanvas('wgear');
        gearXY(c, 0, 0, 0, g.r, g.teeth, g.mat, 'iron');
        return meshVoxels(c, { center: true });
      }),
    [anim.wallGears],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (hammer.current) {
      const beat = (t * 0.62) % 1;
      const strike = beat < 0.12 ? Math.sin((beat / 0.12) * Math.PI) : 0;
      hammer.current.rotation.z = -strike * 0.85;
      hammer.current.position.y = (anim.hammer?.y ?? 20) - strike * 0.8;
    }
    (anim.wallGears ?? []).forEach((g, i) => {
      const o = gears.current[i];
      if (o) o.rotation.z = t * g.speed;
    });
    if (hoist.current) hoist.current.position.x = (anim.hoist?.x ?? 10) + Math.sin(t * 0.2) * 3.5;
  });

  return (
    <group>
      {(anim.wallGears ?? []).map((g, i) => (
        <mesh key={i} ref={(el) => { gears.current[i] = el; }}
          geometry={wallGeos[i]} material={getVoxelMaterials().array}
          position={[-15.6, g.y, g.z]} castShadow />
      ))}

      {anim.hammer && (
        <group ref={hammer} position={[anim.hammer.x, anim.hammer.y, anim.hammer.z]}>
          <mesh castShadow>
            <boxGeometry args={[6, 5, 4]} />
            <meshStandardMaterial color="#3f4249" metalness={0.9} roughness={0.4} />
          </mesh>
          <mesh position={[0, -3.4, 0]} castShadow>
            <boxGeometry args={[7, 2, 4.5]} />
            <meshStandardMaterial color="#70737b" metalness={0.95} roughness={0.28} />
          </mesh>
          <mesh position={[0, -5, 0]}>
            <boxGeometry args={[6, 1, 4]} />
            <meshStandardMaterial color="#9ba3ad" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>
      )}

      {anim.hoist && (
        <group ref={hoist} position={[0, anim.hoist.y, anim.hoist.z]}>
          <mesh castShadow>
            <boxGeometry args={[5, 2, 3]} />
            <meshStandardMaterial color="#42454b" metalness={0.9} roughness={0.4} />
          </mesh>
          <mesh position={[0, -4, 0]}>
            <boxGeometry args={[0.35, 8, 0.35]} />
            <meshStandardMaterial color="#2a2b31" metalness={0.8} roughness={0.5} />
          </mesh>
          <mesh position={[0, -8.4, 0]}>
            <boxGeometry args={[2, 1.6, 2]} />
            <meshStandardMaterial color="#cba44b" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ---------- Athenaeum: the reading lantern breathes --------------- */
function LibraryMotion({ anim }) {
  const lamp = useRef();
  useFrame((state) => {
    if (!lamp.current) return;
    lamp.current.material.emissiveIntensity = 1.2 + Math.sin(state.clock.elapsedTime * 0.8) * 0.2;
  });
  if (!anim.lantern) return null;
  // sits INSIDE the roof lantern the static canvas already builds, so it reads
  // as the glow behind the glazing rather than a floating box
  return (
    <mesh ref={lamp} position={[0, anim.lantern.y + 1.5, 0]}>
      <boxGeometry args={[3.6, 2.2, 2.6]} />
      <meshStandardMaterial
        color="#ffd98a"
        emissive="#ffc76b"
        emissiveIntensity={1.2}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------- Under-island: propellers, turbines, reactor pulses --- */
function UnderislandMotion({ anim }) {
  const props = useRef([]);
  const turbines = useRef([]);
  const reactors = useRef([]);

  const propGeos = useMemo(() => {
    const byKey = {};
    for (const p of anim.propellers ?? []) {
      const key = `${p.r}-${p.blades}`;
      if (byKey[key]) continue;
      const c = new VoxelCanvas('prop');
      c.cylY(0, -1, 0, 1.6, 3, 'brass');
      for (let b = 0; b < p.blades; b++) {
        const ang = (b / p.blades) * Math.PI * 2;
        for (let s = 2; s <= p.r; s++) {
          // a slight rise per blade so they catch the light differently
          c.set(Math.round(Math.cos(ang) * s), Math.round(s * 0.12), Math.round(Math.sin(ang) * s),
            s > p.r - 2 ? 'brass' : 'copper');
          c.set(Math.round(Math.cos(ang) * s) + 1, Math.round(s * 0.12), Math.round(Math.sin(ang) * s), 'copperOx');
        }
      }
      byKey[key] = meshVoxels(c, { center: true });
    }
    return byKey;
  }, [anim.propellers]);

  const turbineGeo = useMemo(() => {
    const c = new VoxelCanvas('turbine');
    c.cylY(0, -1, 0, 1.4, 3, 'iron');
    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2;
      for (let s = 1; s <= 4; s++)
        c.set(Math.round(Math.cos(ang) * s), Math.round(s * 0.2), Math.round(Math.sin(ang) * s), 'ironLight');
    }
    return meshVoxels(c, { center: true });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    (anim.propellers ?? []).forEach((p, i) => {
      const o = props.current[i];
      if (o) o.rotation.y = t * p.speed + p.phase;
    });
    (anim.turbines ?? []).forEach((tb, i) => {
      const o = turbines.current[i];
      if (o) o.rotation.y = t * tb.speed + tb.phase;
    });
    (anim.reactors ?? []).forEach((r, i) => {
      const o = reactors.current[i];
      if (!o) return;
      o.material.emissiveIntensity = 1 + (0.5 + 0.5 * Math.sin(t * 1.1 + i * 2)) * 2.2;
    });
  });

  return (
    <group>
      {(anim.propellers ?? []).map((p, i) => (
        <mesh key={`p${i}`} ref={(el) => { props.current[i] = el; }}
          geometry={propGeos[`${p.r}-${p.blades}`]} material={getVoxelMaterials().array}
          position={[p.x, p.y, p.z]} castShadow />
      ))}
      {(anim.turbines ?? []).map((tb, i) => (
        <mesh key={`t${i}`} ref={(el) => { turbines.current[i] = el; }}
          geometry={turbineGeo} material={getVoxelMaterials().array}
          position={[tb.x, tb.y, tb.z]} castShadow />
      ))}
      {(anim.reactors ?? []).map((r, i) => (
        <mesh key={`r${i}`} ref={(el) => { reactors.current[i] = el; }} position={[r.x, r.y, r.z]}>
          <sphereGeometry args={[4.5, 12, 12]} />
          <meshStandardMaterial color="#ff6a2a" emissive="#ff6a2a" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Airships drifting past the island -------------------- */
function SkyTraffic({ airships, count = 3 }) {
  const groups = useRef([]);
  const geo = useMemo(() => meshVoxels(airships, { center: true }), [airships]);
  const mat = useMemo(() => getVoxelMaterials().array, []);

  const paths = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      radius: 130 + i * 46,
      height: 30 + i * 26,
      speed: (i % 2 === 0 ? 1 : -1) * (0.035 + i * 0.012),
      phase: i * 2.1,
      scale: 0.7 + i * 0.18,
    })),
    [count],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    paths.forEach((p, i) => {
      const o = groups.current[i];
      if (!o) return;
      const a = t * p.speed + p.phase;
      o.position.set(
        Math.cos(a) * p.radius,
        p.height + Math.sin(t * 0.3 + p.phase) * 4,
        Math.sin(a) * p.radius,
      );
      o.rotation.y = -a + (p.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      o.rotation.z = Math.sin(t * 0.4 + p.phase) * 0.05;
    });
  });

  return (
    <group>
      {paths.map((p, i) => (
        <mesh key={i} ref={(el) => { groups.current[i] = el; }}
          geometry={geo} material={mat} scale={p.scale} />
      ))}
    </group>
  );
}

export default Island;