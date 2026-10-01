/**
 * ============================================================================
 *  PAGE CONTENT — everything you are going to edit lives here.
 * ============================================================================
 *
 *  Each page is `{ title, subtitle, blocks: [...] }`. Everything below is a
 *  PLACEHOLDER: the copy is written to show structure and tone, and the blocks
 *  demonstrate every component the system supports.
 *
 *  TO FILL THESE IN:
 *    • text     → edit the strings
 *    • images   → add `src: '/your-image.jpg'` to any image block
 *    • video    → add `src: '/clip.mp4'` or a YouTube/Vimeo URL
 *    • embed    → paste any iframe URL
 *    • 3D model → add `src: '/models/model.glb'` to a `model` block
 *    • contact  → add `action: 'https://formspree.io/f/xxxx'` (or `email:`)
 *
 *  Add a block by appending an object to `blocks` — the renderer already knows
 *  how to place it. See `src/pages/blocks.jsx` for the full list.
 */

export const CONTENT = {
  '/projects': {
    label: 'Projects',
    eyebrow: 'The Clockwork Spire',
    title: 'Projects',
    subtitle:
      'Every hour on this island is wound by hand. Here are the things that came out of the workshop.',
    accent: '#ffc76b',
    blocks: [
      { type: 'lead', text: 'Selected works, 2019 — present. Replace this block with your own intro.' },
      {
        type: 'projects',
        items: [
          {
            title: 'Your project one',
            year: '2025',
            role: 'Creative direction',
            summary: 'A short description of what it is, why it exists, and what you actually did.',
            tags: ['WebGL', 'Three.js', 'Art direction'],
            accent: '#ffc76b',
            // image: '/images/project-1.jpg',
            // href: 'https://…',
          },
          {
            title: 'Your project two',
            year: '2024',
            role: 'Design + development',
            summary: 'One paragraph. What was the problem, and what did you change about it?',
            tags: ['Product', 'Interaction'],
            accent: '#ff8a4c',
          },
          {
            title: 'Your project three',
            year: '2023',
            role: 'Motion',
            summary: 'Another entry. Add as many or as few as you like — the grid handles any count.',
            tags: ['Motion', 'Brand'],
            accent: '#7fe0ff',
          },
        ],
      },
      { type: 'heading', kicker: 'Process', text: 'How the work gets made' },
      {
        type: 'columns',
        columns: [
          { title: '01 — Observe', body: 'Every Aetheria building started as a question about a real machine. Go and look at the thing before you model it.' },
          { title: '02 — Build', body: 'Voxels are forgiving. You can push a form around for an hour and it still reads as deliberate.' },
          { title: '03 — Tune', body: 'The last ten per cent is lighting. The model is never the image; the light is.' },
        ],
      },
      {
        type: 'imageGrid',
        cols: 3,
        images: [
          { alt: 'process 01', ratio: '1 / 1' },
          { alt: 'process 02', ratio: '1 / 1' },
          { alt: 'process 03', ratio: '1 / 1' },
        ],
      },
      { type: 'video', caption: 'A two-minute cut — drop a file or an embed URL' },
    ],
  },

  '/experiments': {
    label: 'Experiments',
    eyebrow: 'Forge & Anvil Works',
    title: 'Experiments',
    subtitle: 'The forge never cools. Most of these have no business existing.',
    accent: '#ff8a4c',
    blocks: [
      { type: 'lead', text: 'Sketches, shaders, half-broken machines. Not everything here ships.' },
      {
        type: 'gallery',
        items: [
          { title: 'Voxel AO study' },
          { title: 'Copper shader' },
          { title: 'Cloud deck v3' },
          { title: 'Gear train' },
          { title: 'Portal field' },
          { title: 'Steam particles' },
        ],
      },
      { type: 'divider' },
      { type: 'heading', kicker: 'Log', text: 'Notes from the bench' },
      {
        type: 'articles',
        items: [
          { date: '2025.04', title: 'Why I baked ambient occlusion into the mesher', tag: 'technique' },
          { date: '2025.02', title: 'Shell optimisation: 630k voxels down to 85k', tag: 'performance' },
          { date: '2024.11', title: 'Making voxel gears read as gears', tag: 'form' },
          { date: '2024.08', title: 'A sunset is a lighting problem, not a colour problem', tag: 'lighting' },
        ],
      },
      { type: 'model', src: '/models/aether-cog.glb', caption: 'The mainspring cog — 12 teeth, one continuous mesh, spinning on its axis.' },
    ],
  },

  '/gallery': {
    label: 'Gallery',
    eyebrow: 'The Mooring Mast',
    title: 'Gallery',
    subtitle: 'What the island looks like from a little further away.',
    accent: '#7fe0ff',
    blocks: [
      { type: 'lead', text: 'Stills, captures and the occasional frame that surprised me.' },
      {
        type: 'gallery',
        items: [
          { title: 'Golden hour' }, { title: 'Under the keel' }, { title: 'The dock at dusk' },
          { title: 'Portal field' }, { title: 'Beacon sweep' }, { title: 'From the airship' },
        ],
      },
      { type: 'heading', text: 'A single frame, large' },
      { type: 'image', ratio: '21 / 9', alt: 'hero capture', caption: 'The shot this whole project was built around.' },
    ],
  },

  '/about': {
    label: 'About',
    eyebrow: 'The Gilded Eye',
    title: 'About',
    subtitle: 'Who keeps the clock wound, and why.',
    accent: '#a8d8ff',
    blocks: [
      { type: 'lead', text: 'Replace this with your biography. Two or three paragraphs is plenty.' },
      {
        type: 'text',
        paragraphs: [
          'Aetheria began as a study in how much story a single silhouette can carry. The island is small enough to hold in one glance and dense enough to reward ten minutes of orbiting.',
          'I work across creative development, 3D and motion. The through-line is usually the same: find the one idea that makes a thing memorable, then build everything else in service of it.',
        ],
      },
      {
        type: 'stats',
        items: [
          { value: '9', label: 'years building for the web' },
          { value: '40+', label: 'shipped projects' },
          { value: '60', label: 'fps, always' },
          { value: '1', label: 'floating island' },
        ],
      },
      { type: 'heading', kicker: 'Practice', text: 'What I actually do' },
      {
        type: 'columns',
        columns: [
          { title: 'Creative development', body: 'WebGL, shaders, real-time graphics that survive contact with a real budget.' },
          { title: '3D & motion', body: 'Asset pipelines, voxel systems, procedural worlds, and the tools to build them faster.' },
          { title: 'Art direction', body: 'Palette, lighting and composition — deciding what the image is before building it.' },
        ],
      },
      { type: 'heading', kicker: 'Chronicle', text: 'How the island got built' },
      {
        type: 'timeline',
        items: [
          { year: '2019', title: 'First island', body: 'A grey block and a lamp. It floated. That was enough to keep going.' },
          { year: '2022', title: 'The voxel engine', body: 'Replaced the library with a mesher that culls hidden faces and bakes AO per vertex.' },
          { year: '2024', title: 'Aetheria', body: 'The whole island, the steampunk pass, and the decision to make the world the navigation.' },
          { year: '2025', title: 'Open water', body: 'Everything you are looking at, documented so you can rebuild or replace it.' },
        ],
      },
      { type: 'quote', text: 'If you can see the whole thing at once, people will believe it is a place.', author: '— a note pinned above the observatory' },
    ],
  },

  '/archive': {
    label: 'Archive',
    eyebrow: 'The Amber Athenaeum',
    title: 'Archive',
    subtitle: 'Everything worth keeping, indexed.',
    accent: '#ffd98a',
    blocks: [
      { type: 'lead', text: 'Notes, references, reading lists and the occasional unfinished thought.' },
      {
        type: 'articles',
        items: [
          { date: '2025.06', title: 'The twelve volumes that shaped this', tag: 'reading' },
          { date: '2025.03', title: 'A taxonomy of brass', tag: 'reference' },
          { date: '2024.12', title: 'Colour systems for impossible light', tag: 'colour' },
          { date: '2024.07', title: 'Notes on kinetic typography', tag: 'motion' },
          { date: '2023.10', title: 'Why dioramas outperform scenes', tag: 'essay' },
        ],
      },
      { type: 'heading', text: 'Specifications' },
      {
        type: 'specs',
        items: [
          { k: 'Stack', v: 'React · Three.js · React Three Fiber · Vite' },
          { k: 'Voxel size', v: '1 world unit ≈ 30 cm at island scale' },
          { k: 'Triangle budget', v: '~480k, all merged into ~14 draw calls' },
          { k: 'Target', v: '60 fps desktop · 30–60 fps mobile' },
        ],
      },
      { type: 'iframe', title: 'Embedded reference', ratio: '16 / 9' },
    ],
  },

  '/lab': {
    label: 'Lab',
    eyebrow: 'Arc & Induction Lab',
    title: 'Lab',
    subtitle: 'Experiments in progress. Mind the arcs.',
    accent: '#8affe0',
    blocks: [
      { type: 'lead', text: 'A playground for anything that is not ready to be a building yet.' },
      {
        type: 'projects',
        items: [
          { title: 'Volumetric light shafts', summary: 'Ray-marched god rays without a depth prepass. Works, mostly.', tags: ['shader'], accent: '#8affe0' },
          { title: 'Signed-distance voxels', summary: 'What happens if the voxel is a distance field instead of a cube?', tags: ['R&D'], accent: '#63efff' },
          { title: 'Wind that knows where you are', summary: 'A cheap curl-noise field that biases toward the camera.', tags: ['simulation'], accent: '#76ff9c' },
        ],
      },
      { type: 'heading', text: 'Live viewport' },
      { type: 'model', src: '/models/brass-nut.glb', caption: 'A hex nut cut voxel by voxel. Regenerate the .glb files with `npm run models`.' },
    ],
  },

  '/chronicle': {
    label: 'Chronicle',
    eyebrow: 'The Beacon of Aether',
    title: 'Chronicle',
    subtitle: 'Forty-seven years of measurements nobody has explained.',
    accent: '#ff6ad5',
    blocks: [
      { type: 'lead', text: 'A record of what the beacon has been doing since it was lit.' },
      {
        type: 'stats',
        items: [
          { value: '47y', label: 'continuous operation' },
          { value: '1.4M', label: 'rotations logged' },
          { value: '0', label: 'explanations' },
        ],
      },
      {
        type: 'timeline',
        items: [
          { year: '1978', title: 'First light', body: 'The beacon is lit at dusk by eleven people. Two of them are crying.' },
          { year: '1986', title: 'The first anomaly', body: 'The sweep stops for eleven seconds. The log records no cause. It never happens again.' },
          { year: '2003', title: 'Automated', body: 'Manual winding is retired. The clockwork is replaced with the clockwork.' },
          { year: 'Today', title: 'Still going', body: 'The readings continue. Someone keeps filing them.' },
        ],
      },
      { type: 'divider' },
      { type: 'quote', text: 'It is not a lighthouse. There is no sea. It points anyway.', author: '— caretaker, 2003' },
    ],
  },

  '/contact': {
    label: 'Contact',
    eyebrow: 'The Threshold',
    title: 'Contact',
    subtitle: 'The portal is open. It has been open all along.',
    accent: '#c08cff',
    blocks: [
      { type: 'lead', text: 'Available for commissions, collaborations and unreasonable questions.' },
      // Add `action` to make the form live, or `email` for a simple mailto.
      { type: 'contact', email: 'hello@aetheria.studio' },
      { type: 'heading', text: 'Elsewhere' },
      {
        type: 'specs',
        items: [
          { k: 'Email', v: 'hello@aetheria.studio' },
          { k: 'Response time', v: 'Usually within two days' },
          { k: 'Timezone', v: 'CET / UTC+1' },
          { k: 'Open to', v: 'Commissions · Collaborations · Talks' },
        ],
      },
    ],
  },
};

export const getContent = (route) => CONTENT[route] ?? CONTENT['/projects'];
export default CONTENT;