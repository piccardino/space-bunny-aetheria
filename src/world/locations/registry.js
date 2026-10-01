/**
 * ============================================================================
 *  LOCATIONS REGISTRY — this file IS the website navigation.
 * ============================================================================
 *
 *  Adding a new building to the island is a one-object change:
 *
 *    {
 *      id: 'bakery',
 *      name: 'The Steam Bakery',      // shown on hover
 *      label: 'Bakery',               // short tag for menus
 *      route: '/bakery',              // React Router route (create the page too)
 *      position: [18, 0, -26],        // world position (voxels = units)
 *      rotation: [0, -0.4, 0],        // euler radians
 *      scale: 1,
 *      accent: '#ffb347',             // glow / label colour
 *      description: 'Bread, ovens and gossip.',
 *      camera: { radius: 34, phi: 1.14, height: 8, fovBias: -6 },  // fly-to framing
 *      pad: { r: 9, blend: 7 },       // terrain plateau under the building
 *      build: (canvas, ctx) => { ... } // paints the voxel model
 *    }
 *
 *  `InteractiveLocation` picks up hover / outline / label / click / fly-to /
 *  navigation automatically. Nothing else needs to change.
 *
 *  The order of `LOCATIONS` also controls the DOM order of the quick-nav menu.
 */

export const LOCATIONS = [
  {
    id: 'clocktower',
    name: 'The Clockwork Spire',
    label: 'Projects',
    short: 'Projects',
    route: '/projects',
    accent: '#ffc76b',
    description: 'Where every hour of the day is wound, oiled and sold.',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    pad: { r: 15, blend: 10, y: 0 },
    camera: { radius: 54, phi: 1.42, height: 12, labelHeight: 34 },
    build: 'clocktower',
  },
  {
    id: 'workshop',
    name: 'Forge & Anvil Works',
    label: 'Experiments',
    short: 'Lab Notes',
    route: '/experiments',
    accent: '#ff8a4c',
    description: 'Hammers never stop. Something is always being invented.',
    position: [-37, 0, -23],
    rotation: [0, 0.42, 0],
    scale: 1,
    pad: { r: 12, blend: 8, y: 1 },
    camera: { radius: 46, phi: 1.46, height: 8, labelHeight: 22 },
    build: 'workshop',
  },
  {
    id: 'airshipdock',
    name: 'The Mooring Mast',
    label: 'Gallery',
    short: 'Gallery',
    route: '/gallery',
    accent: '#7fe0ff',
    description: 'Dreadnoughts come and go. Chains sing in the wind.',
    position: [35, 0, 27],
    rotation: [0, -0.75, 0],
    scale: 1,
    pad: { r: 12, blend: 9, y: 1 },
    camera: { radius: 48, phi: 1.44, height: 10, labelHeight: 26 },
    build: 'airshipdock',
  },
  {
    id: 'observatory',
    name: 'The Gilded Eye',
    label: 'About',
    short: 'About',
    route: '/about',
    accent: '#a8d8ff',
    description: 'A brass telescope that has not stopped searching since 1889.',
    position: [-31, 0, 35],
    rotation: [0, 0.28, 0],
    scale: 1,
    pad: { r: 11, blend: 8, y: 2 },
    camera: { radius: 44, phi: 1.45, height: 9, labelHeight: 24 },
    build: 'observatory',
  },
  {
    id: 'library',
    name: 'The Amber Athenaeum',
    label: 'Archive',
    short: 'Archive',
    route: '/archive',
    accent: '#ffd98a',
    description: 'Twelve thousand volumes, most of them steam-powered.',
    position: [31, 0, -33],
    rotation: [0, -0.2, 0],
    scale: 1,
    pad: { r: 12, blend: 9, y: 1 },
    camera: { radius: 45, phi: 1.45, height: 8, labelHeight: 24 },
    build: 'library',
  },
  {
    id: 'laboratory',
    name: 'Arc & Induction Lab',
    label: 'Lab',
    short: 'Lab',
    route: '/lab',
    accent: '#8affe0',
    description: 'Please do not touch the coil. Please do not touch the coil.',
    position: [13, 0, 41],
    rotation: [0, -0.1, 0],
    scale: 1,
    pad: { r: 11, blend: 8, y: 2 },
    camera: { radius: 43, phi: 1.45, height: 8, labelHeight: 22 },
    build: 'laboratory',
  },
  {
    id: 'energytower',
    name: 'The Beacon of Aether',
    label: 'Chronicle',
    short: 'Chronicle',
    route: '/chronicle',
    accent: '#ff6ad5',
    description: 'It has been turning for 47 years. Nobody knows what it measures.',
    position: [-17, 0, -43],
    rotation: [0, 0.1, 0],
    scale: 1,
    pad: { r: 10, blend: 9, y: 0 },
    camera: { radius: 52, phi: 1.30, height: 14, labelHeight: 40 },
    build: 'energytower',
  },
  {
    id: 'portal',
    name: 'The Threshold',
    label: 'Contact',
    short: 'Contact',
    route: '/contact',
    accent: '#c08cff',
    description: 'Step through, or do not. Either way, it has already noticed you.',
    position: [43, 0, 7],
    rotation: [0, -Math.PI / 2, 0],
    scale: 1,
    pad: { r: 11, blend: 9, y: 1 },
    camera: { radius: 44, phi: 1.45, height: 9, labelHeight: 26 },
    build: 'portal',
  },
];

/** Fast lookup by id — used by the camera fly-to and the intro choreography. */
export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

/**
 * THE PLACEMENT CONVENTION
 * -----------------------
 * Every location is authored in MODEL SPACE: the builder paints the building
 * around its own local origin, footprint centred on x/z = 0 and the ground
 * floor at y = 0. Nothing in a model file ever mentions a world coordinate.
 *
 * `locationOrigin()` is therefore the ONE place that turns a registry entry
 * into a world transform, and every consumer (the scene group, the camera
 * fly-to target, the hover-label anchor) must go through it. Buildings cannot
 * drift apart from their plateaus, their outlines or their labels.
 *
 *   world.x = position[0]
 *   world.y = pad.y          (the flattened terrain height, not `position[1]`)
 *   world.z = position[2]
 */
export function locationOrigin(location, yOffset = 0) {
  return [
    location.position[0],
    (location.pad?.y ?? 0) + yOffset,
    location.position[2],
  ];
}

/** Terrain plateaus derived from the registry, consumed by the height field. */
export const PADS = LOCATIONS.map((l) => ({
  x: l.position[0],
  z: l.position[2],
  y: l.pad?.y ?? 0,
  r: l.pad?.r ?? 10,
  blend: l.pad?.blend ?? 7,
}));

/** The central plaza around the Clockwork Spire — flat and paved. */
export const PLAZA = { r: 15 };

export const ROUTES = LOCATIONS.map((l) => l.route);