# AETHERIA — Steampunk Voxel Floating World

> An interactive homepage where **the island is the navigation**.
> A floating voxel sky-city at golden hour. Every building is a page.
> Orbit slowly. Find the robot fishing into the void.

Stack: **Vite · React 18 · Three.js · React Three Fiber · drei · @react-three/postprocessing · zustand · react-router**

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production build
```

### Validation

The project ships with its own checks — run them after any change:

```bash
node scripts/verify-voxel.mjs   # mesher + every building model
node scripts/verify-world.mjs   # full world build, triangle budget
node scripts/verify-react.mjs   # registry, routes, imports, undeclared identifiers
node scripts/smoke.mjs          # real browser: boots, renders, hovers, navigates
node scripts/analyze-shot.mjs shot-island.png   # PNG luma/contrast analysis
```

`smoke.mjs` uses Puppeteer if installed and otherwise falls back to a system
Chrome/Edge. Pass `--shots` to write `shot-island.png` / `shot-page.png`.

---

## The idea

Most portfolio sites put the work in a grid and the 3D in a hero image.
Here the 3D *is* the site: the Clockwork Spire is `/projects`, the Threshold is
`/contact`. Clicking a building flies the camera in, blooms a veil, and opens
that page. Nothing else is a link.

---

## Architecture

```
src/
├── core/
│   ├── math.js         clamp / damp / easing / seeded RNG / value noise + fbm
│   ├── palette.js      ~90 named voxel materials, tagged matte|metal|glass|glow
│   ├── quality.js      device detection → high / medium / low tier presets
│   └── store.js        zustand: phase, hover, focus, audio, tier (low-frequency)
│
├── voxel/              ██ the custom voxel engine — no external voxel library
│   ├── VoxelCanvas.js  sparse voxel volume + 25 sculpting primitives
│   ├── mesher.js       face culling, baked vertex AO, colour jitter, kind groups
│   ├── materials.js    4 shared materials serving all ~90 palette entries
│   ├── inflate.js      inflated copy of a geometry → hover outline shell
│   └── VoxelMesh.jsx   React wrapper (meshes in useMemo, disposes on unmount)
│
├── world/
│   ├── config.js       WORLD constants: radius, depth, seed, height field
│   ├── terrain.js      island generation (shell optimisation, ore veins, roots)
│   ├── underisland.js  the machinery that holds it up (drives, reactors, catwalks)
│   ├── vegetation.js   trees, groves, tufts, flowers, plaza + easter eggs
│   ├── buildWorld.js   assembles every canvas, memoised at module scope
│   ├── Island.jsx      scene graph + every animated part
│   └── locations/
│       ├── registry.js ██ THE NAVIGATION — add a building in one object
│       └── models/     one file per building + shared `parts.js`
│
├── navigation/
│   ├── CameraRig.jsx   bespoke orbit: damping, parallax, pinch, idle drift, flyTo
│   ├── InteractiveLocation.jsx  hover → outline + emissive + label + click
│   └── SceneTransition.jsx      fly-to → veil → navigate → fade back
│
├── scene/              SkyDome · CloudDeck · Lighting · Particles · PostProcessing · Scene
├── ui/                 Intro · HUD · HoverLabel
├── pages/              blocks.jsx (18 content blocks) · content.js (EDIT THIS) · PlacePage
├── audio/audio.js      fully synthesised WebAudio ambience — zero audio files
└── styles/global.css   the entire visual identity, bespoke, no framework
```

---

## The voxel engine

This is the piece that makes the whole thing work. A voxel grid is trivially easy
to generate and surprisingly hard to *render well*. Four decisions carry the look:

**1 · Hidden-face culling.** Interior faces are never emitted. The island is a
solid 630k-voxel volume; the mesher only writes the ~85k voxels you can actually
see, and only the faces of those.

**2 · Per-vertex ambient occlusion, baked.** For every quad corner, the mesher
looks at the three cells touching it and darkens by a soft ramp. Because voxel
geometry is axis-aligned boxes, this is exact — and it is what makes the scene
read as sculpted rather than as a pile of cubes. Cost: zero at runtime.

**3 · Deterministic colour jitter.** Every voxel gets a small hash-based tint
plus a coarse 2³-block tint. That variation is the "hand-placed" texture that
stops large flat areas from looking like plastic.

**4 · Four material buckets.** Geometry is grouped by kind — `matte`, `metal`,
`glow`, `glass` — so ~90 distinct palette entries collapse into **4 materials
and one draw call per object**.

```js
import { VoxelCanvas } from './src/voxel/VoxelCanvas.js';
import { meshVoxels } from './src/voxel/mesher.js';

const v = new VoxelCanvas('thing');
v.box(0, 0, 0, 20, 4, 12, 'stone');      // filled box
v.cylY(10, 4, 6, 5, 14, 'copper');        // vertical cylinder
v.domeY(10, 18, 6, 5, 'copper');          // dome
const geometry = meshVoxels(v);
```

Primitives: `box` `boxShell` `boxFrame` `sphere` `cylX/Y/Z` `discX/Y/Z`
`ringY/Z` `coneY` `domeY` `stairsX/Z` `line` `stamp` `scatter` `carveSphere`
`carveBox` `windowX/Z`, plus `merge` `remap` `dither` `clone`.
`locations/models/parts.js` adds `gearXY` `gearXZ` `clockDial` `barrel` `crate`
`pipe` `chain` `lampPost` `chimney` `archOutline` `copperRoof`.

---

## Adding a building

One object in `src/world/locations/registry.js`:

```js
{
  id: 'bakery',
  name: 'The Steam Bakery',          // hover label
  label: 'Bakery',                   // short tag for menus
  route: '/bakery',                  // add a <Route> in App.jsx + content.js
  accent: '#ff9a4a',                 // outline + label colour
  description: 'Bread, ovens and gossip.',
  position: [18, 0, -26],
  rotation: [0, -0.4, 0],
  scale: 1,
  pad: { r: 9, blend: 7, y: 0 },     // flattens the terrain beneath it
  camera: { radius: 34, phi: 1.14, height: 8, labelHeight: 30 },
  build: 'bakery',                   // key in buildWorld.BUILDERS
}
```

Then write the model in `locations/models/bakery.js`:

```js
export function buildBakery(v) {
  const anim = {};                            // handles for anything that moves
  v.box(-10, 0, -8, 21, 2, 17, 'stoneDark');  // plinth
  v.boxShell(-8, 2, -6, 17, 12, 13, 'brick'); // shell walls
  v.carveBox(-2, 2, 6, 5, 6, 3);              // doorway
  v.domeY(0, 14, 0, 7, 'copper');             // roof
  anim.fan = { x: 0, y: 8, z: 0 };             // ← Island.jsx animates this
  return { v, anim };
}
```

Register it in `buildWorld.js` (`BUILDERS`) and add a `case 'bakery':` to
`AnimatedParts` in `Island.jsx` if it has moving parts.

That is the whole integration. The terrain plateau, the hover feedback, the
label, the camera fly-to, the page transition and the menu entry all follow
automatically.

---

## Filling in the pages

Everything you will edit lives in **`src/pages/content.js`**. Each page is a
declarative list of blocks:

```js
'/projects': {
  title: 'Projects',
  subtitle: '…',
  accent: '#ffc76b',
  blocks: [
    { type: 'lead',  text: 'A sentence that sets the tone.' },
    { type: 'text',  paragraphs: ['Body copy…', 'More…'] },
    { type: 'projects', items: [{ title, year, summary, tags, image, href }] },
    { type: 'imageGrid', cols: 3, images: [{ src: '/x.jpg', alt, ratio }] },
    { type: 'video',  src: '/clip.mp4' },              // or a YouTube URL
    { type: 'iframe', src: 'https://…', ratio: '16/9' },
    { type: 'model',  src: '/models/thing.glb' },      // lazy 3D viewport
    { type: 'contact', action: 'https://formspree.io/f/xxx' },
  ],
}
```

18 block types are available — see the header comment in `pages/blocks.jsx`.
Empty ones render a dashed **content slot** so you can see exactly where content
goes. Anything you drop in renders immediately; nothing else needs wiring.

---

## Performance

Measured on the built bundle:

| | |
|---|---|
| total voxels | ~195,000 |
| triangles | ~478,000 |
| draw calls | ~14 (everything static is merged) |
| terrain build | ~190 ms (once, off the render loop) |
| production bundle | 1.04 MB three.js + 115 KB app (315 KB + 37 KB gzipped) |

Techniques in play:

* **Merged buffers** — terrain, understructure, flora and each building are one
  mesh each; vegetation and props are merged into the flora canvas.
* **Shell-only terrain** — only visible voxels are emitted (~85k instead of 630k).
* **Four material buckets** — one material serves ~90 palette entries.
* **GPU particles** — clouds, steam and sparks animate entirely in the vertex
  shader: one draw call each, zero CPU per frame.
* **No per-frame React** — all camera motion and hover easing live in refs; the
  store only holds low-frequency UI state.
* **Adaptive quality** — `quality.js` detects the device, then a frame-time
  monitor downgrades (never upgrades) the tier. `devicePixelRatio` is clamped
  to the tier max (2 / 1.6 / 1.15).
* **Lazy chunks** — page content and the 3D model block load separately, so the
  homepage doesn't pay for them.

---

## Camera

Hand-written rather than `OrbitControls`, because the feel needed behaviour
stock controls don't provide:

* critically-damped motion on every axis (frame-rate independent)
* mouse parallax layered on top of the orbit
* one-finger drag + pinch on touch; drag + wheel on desktop
* **idle drift** — after ~4 s of no input the camera begins an almost
  imperceptible orbit, eased in over 2.6 s; any input stops it instantly
* `flyTo({ target, radius, phi, theta })` with an eased path
* framing adapts to the viewport: phones get a closer minimum radius

---

## Audio

`src/audio/audio.js` synthesises everything with the Web Audio API. There are
**no audio files**: wind is filtered brown noise with a wandering band-pass, the
engines are detuned saws through a low-pass with tremolo, the machinery is a
scheduled click train, and the one-shots are short oscillator envelopes. The
ambience reacts to camera distance, so zooming in brings the island closer.

Nothing is created until you press the sound button, and the `AudioContext` is
only resumed inside that gesture — compliant with browser autoplay policy.

---

## Accessibility & fallbacks

* `prefers-reduced-motion` shortens the fly-to and disables CSS animation.
* No WebGL → a styled fallback with a link to the archive.
* Keyboard: `Enter` / `Space` / `Esc` skip the intro.
* Visible focus rings; the places index is a real `<nav>` of buttons.
* The canvas is decorative; all content is reachable as DOM.

---

## Extending it

| Goal | Where |
|---|---|
| new building | `registry.js` + `models/*.js` + `buildWorld.js` + `Island.jsx` |
| new page | `App.jsx` route + `content.js` entry |
| new content block | `pages/blocks.jsx` (add a case) |
| new animated part | `Island.jsx` → `AnimatedParts` |
| new island / NPC / quest | `underisland.js` + `Island.jsx`; the `anim` handle pattern already supports it |
| new voxel material | `core/palette.js` (pick a `k` bucket) |
| different palette | `core/palette.js` + the `SKY` / `LIGHT` constants |
| island size | `world/config.js` → `WORLD.radius` (terrain, clouds, camera all follow) |

---

## Credits

Fonts: Cinzel, Space Grotesk, JetBrains Mono (Google Fonts).
Everything else — geometry, textures, sky and audio — is generated at runtime.