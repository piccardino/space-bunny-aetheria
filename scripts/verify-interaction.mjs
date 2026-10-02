/**
 * INTERACTION REGRESSION TEST
 * ============================
 * Guards the two defects that made the island unusable:
 *
 *   1. DRAGGING THE CAMERA BLANKED THE VIEW AND LEFT THE ISLAND.
 *      A drag that started on a building still counted as a click, which fired
 *      `beginFlyTo()`. The scene-transition veil then bloomed over the canvas
 *      — and its `.veil__ring` is a 40px circle scaled by `1 + opacity * 16`,
 *      i.e. a 680px hoop framing the whole viewport. That cyan ring *was* the
 *      "broken frame"; there was never a malformed mesh. Navigation then
 *      swapped in a text page, so the 3D scene disappeared entirely.
 *
 *   2. BUILDINGS WERE DRAWN IN THE WRONG PLACE.
 *      Each building mesh carried a `-loc.position` offset inside a group
 *      already placed at `+loc.position`. That cancelled the group's
 *      TRANSLATION but not its ROTATION, so all eight buildings were drawn
 *      stacked at the island centre while their hover outlines, animated parts
 *      and pick volumes sat correctly out on the plateaus.
 *
 * These checks read the live R3F scene graph — NOT the WebGL framebuffer, which
 * cannot be sampled because the drawing buffer is not preserved between frames
 * (that is what made the original reproduction report a permanently black
 * canvas no matter what was really on screen).
 *
 * Usage: node scripts/verify-interaction.mjs [url]
 */
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBrowser, describeBrowser } from './_browser.mjs';

const URL = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.error('  FAIL  ' + m); failures++; };


const BROWSER = resolveBrowser();
console.log(`  browser: ${describeBrowser()}`);

const browser = await puppeteer.launch({
  headless: BROWSER.headless,
  executablePath: BROWSER.executablePath,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message ?? e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/* WebGL context loss is THE classic cause of a black screen that appears on
   interaction, so watch for it explicitly. */
await page.evaluateOnNewDocument(() => {
  window.__ctxLost = [];
  const origGet = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const ctx = origGet.apply(this, args);
    if (ctx && !ctx.__watched && typeof WebGLRenderingContext !== 'undefined' && ctx instanceof WebGLRenderingContext) {
      ctx.__watched = true;
      this.addEventListener('webglcontextlost', () => {
        window.__ctxLost.push({ type: 'lost', w: this.width, h: this.height, t: Date.now() });
      }, true);
      this.addEventListener('webglcontextrestored', () => {
        window.__ctxLost.push({ type: 'restored', t: Date.now() });
      }, true);
    }
    return ctx;
  };
});

/**
 * three.js broadcasts the objects it constructs to `window.__THREE_DEVTOOLS__`
 * via an `observe` CustomEvent — the integration point the official devtools
 * extension uses. Registering our own listener is therefore a supported way to
 * reach the live scene from a test, with no debug global added to the app.
 *
 * Two wrinkles make a naive hook useless on its own:
 *
 *  1. Only `Scene` and `WebGLRenderer` are broadcast, and R3F never parents its
 *     camera into the scene, so both are captured by wrapping the observed
 *     renderer's `render(scene, camera)`.
 *  2. `EffectComposer` (from @react-three/postprocessing) drives the real
 *     render loop, and each of its passes calls `render()` again with its OWN
 *     throwaway scene and an orthographic fullscreen camera. Those all sit at
 *     the origin. So the captured pair must be filtered to the camera the app
 *     actually drives — the R3F default camera, which is a non-orthographic
 *     camera living outside any composer's internal buffer.
 *
 * R3F itself is not inspectable: it keeps its root in a module-level Map, and
 * the `useRef` holding `{ configure, render, unmount }` never exposes the
 * zustand store, so nothing lands on the canvas element.
 */
await page.evaluateOnNewDocument(() => {
  const target = new EventTarget();
  target.addEventListener('observe', (e) => {
    const o = e.detail;
    if (!o) return;
    if (o.isScene && !window.__scene) window.__scene = o;
    if (o.isWebGLRenderer && !o.__wrapped) {
      o.__wrapped = true;
      const render = o.render.bind(o);
      o.render = (scene, camera) => {
        // The composer's passes use an orthographic camera at the origin for
        // fullscreen blits; the app's own camera is the perspective one R3F
        // created and CameraRig drives. Only the latter is interesting.
        if (camera && !camera.isOrthographicCamera) {
          window.__scene = scene;
          window.__camera = camera;
        }
        return render(scene, camera);
      };
    }
  });
  window.__THREE_DEVTOOLS__ = target;
});

/**
 * Read the live scene graph.
 *
 * A building is recognised by the `name` its VoxelMesh was given; a hover
 * outline by its material signature (flat / unlit / back faces / no depth
 * write), which is exactly how `LocationOutline` builds it.
 */
const sceneDump = () =>
  page.evaluate(() => {
    /* Monotone-chain convex hull of 2D points, counter-clockwise. */
    const convexHull = (pts) => {
      if (pts.length < 3) return pts;
      const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const q of p) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
        lower.push(q);
      }
      const upper = [];
      for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
        upper.push(q);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    };

    const scene = window.__scene;
    const camera = window.__camera;
    if (!scene) return { error: 'no THREE.Scene was observed (devtools hook did not fire)' };
    if (!camera) return { error: 'no camera was observed' };

    const BACKSIDE = 1; // THREE.BackSide

    const buildings = [];
    const outlines = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.updateWorldMatrix(true, false);
      const g = o.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const box = {
        min: bb.min.toArray().map((n) => +n.toFixed(1)),
        max: bb.max.toArray().map((n) => +n.toFixed(1)),
      };
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;

      if (o.name && !['terrain', 'underisland', 'flora'].includes(o.name)) {
        // Buildings are ROTATED about Y and are not solid boxes — an airship
        // dock spans far more than its platform, a clocktower's weathervane
        // sticks out above the parapet. So an axis-aligned box (or even the
        // box's rotated corners) hugely overstates the footprint and makes
        // every neighbouring pair "collide".
        //
        // Project the real vertices onto the XZ plane and take the convex
        // hull. For an orthogonal voxel model extruded in Y that hull is the
        // exact silhouette, which is what a placement test needs.
        const pos = g.getAttribute('position');
        const pts = [];
        if (pos) {
          const v = new (o.position.constructor)();
          const step = Math.max(1, Math.floor(pos.count / 4000));
          for (let i = 0; i < pos.count; i += step) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            pts.push([+v.x.toFixed(2), +v.z.toFixed(2)]);
          }
        }
        buildings.push({
          id: o.name,
          visible: o.visible,
          box,
          footprint: convexHull(pts),
          yMin: +box.min[1].toFixed(1),
          yMax: +box.max[1].toFixed(1),
        });
      }
      if (mat && mat.isMeshBasicMaterial && mat.side === BACKSIDE && mat.depthWrite === false && o.visible) {
        outlines.push({
          color: '#' + mat.color.getHexString(),
          opacity: +mat.opacity.toFixed(2),
          box,
        });
      }
    });

    return {
      camera: camera.position.toArray().map((n) => +n.toFixed(1)),
      buildings,
      outlines,
      ctxLost: window.__ctxLost.length,
      route: location.pathname,
      veilOn: document.querySelector('.veil')?.classList.contains('veil--on') ?? false,
    };
  });

// How well does this lit outline match a building's silhouette?
//
// The outline is built from the building's OWN geometry (LocationOutline inflates
// it along its normals and scales it ~1.4% about the group origin), so the two
// occupy the same box to within that inflation. Comparing axis-aligned boxes is
// therefore exact — and unlike a centroid or hull comparison it is immune to
// shape skew (the dock's long mooring arm shifts a centroid but not a box).
// The original bug is caught emphatically: the outline sat on the plateau while
// the mesh sat at the island centre, tens of units apart.
function outlineMatch(outline, building) {
  const c = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const oc = c(outline.box);
  const bc = c(building.box);
  const centre = Math.hypot(oc[0] - bc[0], oc[1] - bc[1], oc[2] - bc[2]);
  const extent = Math.max(
    Math.abs((outline.box.max[0] - outline.box.min[0]) - (building.box.max[0] - building.box.min[0])),
    Math.abs((outline.box.max[1] - outline.box.min[1]) - (building.box.max[1] - building.box.min[1])),
    Math.abs((outline.box.max[2] - outline.box.min[2]) - (building.box.max[2] - building.box.min[2])),
  );
  return { id: building.id, centre, extent, score: centre + extent };
}

const centreXZ = (box) => [
  (box.min[0] + box.max[0]) / 2,
  (box.min[2] + box.max[2]) / 2,
];
const sizeXZ = (box) => [box.max[0] - box.min[0], box.max[2] - box.min[2]];

/** Average of a footprint quad's corners. */
const quadCentre = (q) => [
  q.reduce((a, p) => a + p[0], 0) / q.length,
  q.reduce((a, p) => a + p[1], 0) / q.length,
];

console.log('\n=== ' + URL + ' ===');
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await wait(6000);

const enter = await page.$('.intro__enter');
if (enter) { await enter.click(); console.log('entered the island'); }
else fail('no .intro__enter button');
await wait(9000);

/* Registry ground truth, mirroring src/world/locations/registry.js. */
const REGISTRY = [
  ['clocktower', 0, 0], ['workshop', -37, -23], ['airshipdock', 35, 27],
  ['observatory', -31, 35], ['library', 31, -33], ['laboratory', 13, 41],
  ['energytower', -17, -43], ['portal', 43, 7],
];

/* ---------------- A. placement --------------------------------- */
console.log('\n--- A. building placement ---');
const before = await sceneDump();
if (before.error) {
  fail('cannot inspect the scene: ' + before.error);
} else {
  for (const [id, rx, rz] of REGISTRY) {
    const b = before.buildings.find((x) => x.id === id);
    if (!b) { fail(`${id}: no mesh named "${id}" in the scene`); continue; }
    const [cx, cz] = quadCentre(b.footprint);
    // a building must straddle its own plateau. Compare against the footprint,
    // not the axis-aligned box, so a rotated building is measured by its own
    // extent rather than by the inflated AABB of its rotation.
    const [w, d] = sizeXZ(b.box);
    const offX = Math.abs(cx - rx);
    const offZ = Math.abs(cz - rz);
    console.log(
      `    ${id.padEnd(13)} centre[${cx.toFixed(1)}, ${cz.toFixed(1)}]  registry[${rx}, ${rz}]` +
      `  offset ${offX.toFixed(1)} / ${offZ.toFixed(1)}  aabb ${w.toFixed(0)}x${d.toFixed(0)}`,
    );
    // tolerance: half the AABB extent is generous but still tight enough to
    // catch the old "everything piled at the origin" failure by a wide margin
    if (offX > w / 2 + 2 || offZ > d / 2 + 2) {
      fail(`${id}: centre is ${offX.toFixed(1)}/${offZ.toFixed(1)} from its plateau (tolerance ${(w / 2 + 2).toFixed(1)}/${(d / 2 + 2).toFixed(1)})`);
    }
  }

  // the old bug drew every non-central building at the island origin
  const piled = before.buildings.filter((b) => {
    if (b.id === 'clocktower') return false;
    const [cx, cz] = quadCentre(b.footprint);
    return Math.hypot(cx, cz) < 14;
  });
  if (piled.length) {
    fail(`${piled.length} building(s) stacked at the island centre: ${piled.map((b) => b.id).join(', ')}`);
  } else {
    pass('every building stands on its own plateau');
  }

  /**
   * Distinctness: no two buildings may share a centre. This is the browser-side
   * version of the placement check and is deliberately centroid-based.
   *
   * A geometric overlap test is NOT repeated here: these are large structures
   * on neighbouring plateaus whose convex silhouettes legitimately share
   * ground (the dock's apron meets the portal's court), and silhouette overlap
   * says nothing about whether placement is correct. Collision between
   * PLATEAUS is asserted authoritatively in verify-world.mjs, which reads the
   * height field directly. What only the live scene can catch is the original
   * regression — buildings collapsing onto one shared point — so that is what
   * this asserts.
   */
  let tooClose = 0;
  for (let i = 0; i < before.buildings.length; i++) {
    for (let j = i + 1; j < before.buildings.length; j++) {
      const A = before.buildings[i];
      const B = before.buildings[j];
      const ac = quadCentre(A.footprint);
      const bc = quadCentre(B.footprint);
      const apart = Math.hypot(ac[0] - bc[0], ac[1] - bc[1]);
      // every pair of registry positions is >= 22 apart, so anything much
      // closer than that means two buildings landed on top of each other
      if (apart < 14) {
        fail(`${A.id} and ${B.id} are only ${apart.toFixed(1)} units apart — they occupy the same spot`);
        tooClose++;
      }
    }
  }
  if (!tooClose) {
    const pairs = before.buildings.length * (before.buildings.length - 1) / 2;
    let minSep = Infinity;
    for (let i = 0; i < before.buildings.length; i++) {
      for (let j = i + 1; j < before.buildings.length; j++) {
        const ac = quadCentre(before.buildings[i].footprint);
        const bc = quadCentre(before.buildings[j].footprint);
        minSep = Math.min(minSep, Math.hypot(ac[0] - bc[0], ac[1] - bc[1]));
      }
    }
    pass(`all ${pairs} building pairs are distinct (closest ${minSep.toFixed(1)} units apart)`);
  }
}
await page.screenshot({ path: 'verify-island.png' });

/* ---------------- B. dragging ---------------------------------- */
console.log('\n--- B. camera drag ---');
const routeBefore = before.route ?? '/';
await page.mouse.move(640, 400);
await page.mouse.down();
let veilDuringDrag = false;
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(640 - i * 18, 400 - i * 4);
  await wait(90);
  if (i === 6) veilDuringDrag = (await sceneDump()).veilOn;
}
await page.mouse.up();
await wait(1200);

const afterDrag = await sceneDump();
if (afterDrag.error) fail('scene vanished after the drag: ' + afterDrag.error);
else {
  const moved = Math.hypot(
    afterDrag.camera[0] - before.camera[0],
    afterDrag.camera[2] - before.camera[2],
  );
  console.log(`    camera ${JSON.stringify(before.camera)} -> ${JSON.stringify(afterDrag.camera)} (moved ${moved.toFixed(1)} units)`);
  if (moved < 2) fail('the camera did not orbit — dragging is dead');
  else pass(`the camera orbits while dragging (${moved.toFixed(1)} units)`);

  if (afterDrag.buildings.length !== before.buildings.length) {
    fail(`buildings changed count across the drag: ${before.buildings.length} -> ${afterDrag.buildings.length}`);
  } else {
    pass('the scene stays intact across the drag');
  }
}
if ((afterDrag.route ?? '/') !== routeBefore) fail(`dragging navigated away: ${routeBefore} -> ${afterDrag.route}`);
else pass('dragging does not navigate away');
if (veilDuringDrag || afterDrag.veilOn) fail('the transition veil fired during a drag');
else pass('no transition veil during a drag');
await page.screenshot({ path: 'verify-drag.png' });

/* ---------------- C. hover ------------------------------------ */
console.log('\n--- C. hover highlight ---');
let hovered = null;
outer: for (let y = 200; y <= 580 && !hovered; y += 30) {
  for (let x = 300; x <= 1000; x += 30) {
    await page.mouse.move(x, y);
    await wait(70);
    const el = await page.$('.voxel-label[data-visible="true"] .voxel-label__title');
    if (el) { hovered = { x, y, text: (await el.evaluate((e) => e.textContent)).trim() }; break outer; }
  }
}

if (!hovered) {
  fail('nothing on the island could be hovered');
} else {
  console.log(`    hovered "${hovered.text}" at ${hovered.x},${hovered.y}`);
  await wait(600); // the outline fades in on a damped curve
  const hovering = await sceneDump();
  const lit = hovering.outlines.filter((o) => o.opacity > 0.05);
  console.log(`    lit outlines: ${lit.length} ${JSON.stringify(lit.map((o) => ({ c: o.color, o: o.opacity })))}`);

  if (!lit.length) {
    fail('hovering produced no visible outline');
  } else {
    const o = lit[0];
    // Exactly one building may claim the pointer, so the lit outline must match
    // that building far better than any other.
    const ranked = hovering.buildings
      .map((b) => outlineMatch(o, b))
      .sort((x, y) => x.score - y.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    console.log(`    outline matches "${best.id}" (centre ${best.centre.toFixed(1)}, extent ${best.extent.toFixed(1)}); next "${runnerUp.id}" at ${runnerUp.score.toFixed(1)}`);

    // the outline is a slightly inflated copy, so allow a couple of units
    if (best.centre > 3) {
      fail(`the lit outline sits ${best.centre.toFixed(1)} units from "${best.id}" — it is detached from every building`);
    } else if (runnerUp && runnerUp.score < best.score + 6) {
      fail(`the outline matches "${best.id}" and "${runnerUp.id}" almost equally — the hover target is ambiguous`);
    } else {
      pass(`the outline is exactly on the building under the pointer ("${best.id}")`);
    }
    await page.screenshot({ path: 'verify-hover.png' });
  }

  /* ---- pointer exit must clear the highlight ---------------------- */
  // Park the pointer in a corner and wait for the fade to actually finish.
  // The label's `data-visible` attribute is driven by an effect, and the
  // outline by a damped curve, so a fixed sleep races both.
  await page.mouse.move(8, 8);
  let cleared = null;
  for (let i = 0; i < 20; i++) {
    await wait(200);
    cleared = await sceneDump();
    const stillLit = cleared.outlines.filter((o) => o.opacity > 0.05);
    const labelUp = await page.$('.voxel-label[data-visible="true"]');
    if (!stillLit.length && !labelUp) break;
  }
  const stillLit = cleared.outlines.filter((o) => o.opacity > 0.05);
  if (stillLit.length) {
    fail(`${stillLit.length} outline(s) stayed lit after the pointer left (opacity ${stillLit.map((o) => o.opacity).join(', ')})`);
  } else {
    pass('moving off the building clears the outline');
  }
}

/* ---------------- D. a real click still enters ------------------ */
console.log('\n--- D. click still navigates ---');
if (!hovered) {
  console.log('    skipped (nothing was hoverable)');
} else {
  // The pointer was parked in a corner by the clear-on-exit check, so move back
  // onto the building and WAIT for the hover to register before pressing. A
  // click without a preceding hover is not a scenario the guard cares about,
  // and pressing early here would test the wrong thing.
  await page.mouse.move(hovered.x, hovered.y);
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await wait(150);
    if (await page.$('.voxel-label[data-visible="true"]')) { ready = true; break; }
  }
  if (!ready) {
    fail('could not re-acquire the hover before clicking');
  } else {
    // press and release at the SAME pixel: delta stays 0, so this must navigate
    await page.mouse.down();
    await wait(80);
    await page.mouse.up();
    let route = '/';
    for (let i = 0; i < 25; i++) {
      await wait(200);
      route = await page.evaluate(() => location.pathname);
      if (route !== '/') break;
    }
    if (route === '/') {
      fail('a deliberate click did not navigate — the drag guard is too aggressive');
    } else {
      pass(`a deliberate click entered ${route}`);
    }
  }
}

/* ---------------- wrap up -------------------------------------- */
const lost = await page.evaluate(() => window.__ctxLost);
if (lost.length) fail('WebGL context was lost: ' + JSON.stringify(lost));
else pass('no WebGL context loss');

const real = errors.filter((e) => !/ERR_CERT_AUTHORITY_INVALID|favicon|fonts\.(googleapis|gstatic)|404/.test(e));
if (real.length) {
  console.log(`\n--- console errors (${real.length}) ---`);
  real.slice(0, 10).forEach((e) => console.log('  ' + e.slice(0, 200)));
  fail(`${real.length} console error(s)`);
}

console.log('');
await browser.close();
if (failures) { console.error(`${failures} check(s) failed\n`); process.exit(1); }
console.log('all interaction checks passed\n');