/**
 * Static sanity checks for the React layer — no browser required.
 *
 * Catches the classes of bug a plain `vite build` cannot:
 *   • a JSX component used but never imported/declared
 *   • a route in the registry with no page component / no content entry
 *   • duplicate location ids or routes
 *   • a relative import that doesn't resolve on disk
 *
 * Run: node scripts/verify-react.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCATIONS } from '../src/world/locations/registry.js';
import { CONTENT } from '../src/pages/content.js';

let failures = 0;
const fail = (m) => { console.error('  x ' + m); failures++; };
const ok = (m) => console.log('  . ' + m);

// fileURLToPath decodes %20 correctly (the workspace path contains spaces)
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const rel = (f) => relative(SRC, f).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.js', '.jsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

console.log('\nAETHERIA - React layer validation\n');

/* ---------------- 1. registry integrity ----------------------- */
console.log('1) Locations registry');
{
  const ids = new Set();
  const routes = new Set();
  for (const l of LOCATIONS) {
    if (ids.has(l.id)) fail(`duplicate id "${l.id}"`);
    ids.add(l.id);
    if (routes.has(l.route)) fail(`duplicate route "${l.route}"`);
    routes.add(l.route);

    for (const key of ['id', 'name', 'label', 'route', 'position', 'rotation', 'accent', 'build']) {
      if (l[key] === undefined) fail(`${l.id}: missing "${key}"`);
    }
    if (!Array.isArray(l.position) || l.position.length !== 3) fail(`${l.id}: position must be [x,y,z]`);
    if (!Array.isArray(l.rotation) || l.rotation.length !== 3) fail(`${l.id}: rotation must be [x,y,z]`);
    if (!/^#[0-9a-f]{6}$/i.test(l.accent ?? '')) fail(`${l.id}: accent must be a hex colour`);
    if (!CONTENT[l.route]) fail(`${l.id}: route ${l.route} has no entry in content.js`);
    if (l.camera && typeof l.camera.radius !== 'number') fail(`${l.id}: camera.radius must be a number`);
    if (l.pad && typeof l.pad.r !== 'number') fail(`${l.id}: pad.r must be a number`);
  }
  ok(`${LOCATIONS.length} locations: unique ids, valid routes, every route has content`);

  const island = readFileSync(join(SRC, 'world/Island.jsx'), 'utf8');
  const missingMotion = LOCATIONS.filter((l) => !island.includes(`case '${l.id}':`)).map((l) => l.id);
  if (missingMotion.length) fail(`Island.jsx has no animated part for: ${missingMotion.join(', ')}`);
  else ok('every location has its own animated-part dispatcher');
}

/* ---------------- 2. content integrity ------------------------ */
console.log('\n2) Page content');
{
  const routes = Object.keys(CONTENT);
  let blocks = 0;
  for (const route of routes) {
    const page = CONTENT[route];
    if (!Array.isArray(page.blocks)) fail(`${route}: blocks must be an array`);
    for (const [i, b] of (page.blocks ?? []).entries()) {
      blocks++;
      if (!b.type) fail(`${route}[${i}]: block without a "type"`);
    }
  }
  ok(`${routes.length} pages, ${blocks} blocks, all typed`);

  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  const unrouted = routes.filter((r) => !app.includes(`path="${r}"`));
  if (unrouted.length) fail(`content exists but no <Route>: ${unrouted.join(', ')}`);
  else ok('every content route has a matching <Route>');

  // and the reverse: no route without content
  const routed = [...app.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]).filter((r) => r !== '/');
  for (const r of routed) if (!CONTENT[r]) fail(`route ${r} has no entry in content.js`);
  ok('no route is missing its content entry');
}

/* ---------------- 3. unresolved JSX components ---------------- */
console.log('\n3) Component sanity');
{
  const files = walk(SRC).filter((f) => extname(f) === '.jsx');
  const problems = [];

  for (const file of files) {
    // strip comments so JSDoc usage examples don't look like real code
    const raw = readFileSync(file, 'utf8');
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const bound = new Set();

    // default + named imports
    for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)[^;]*?from/g)) bound.add(m[1]);
    // Named specifiers. The optional default-binding in front of `{` matters:
    // `import React, { Suspense } from 'react'` must still bind `Suspense`,
    // otherwise every default+named import reads as an unbound component.
    for (const m of src.matchAll(/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]+)\}\s*from/g))
      for (const part of m[1].split(',')) {
        const name = part.split(' as ').pop().trim();
        if (name) bound.add(name);
      }
    // local declarations
    for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) bound.add(m[1]);
    for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g))
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/[:=]/)[0].replace(/^\{/, '').trim();
        if (/^[A-Z][\w$]*$/.test(name)) bound.add(name);
      }

    const used = new Set();
    for (const m of src.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) used.add(m[1]);

    for (const name of used) {
      if (bound.has(name) || name === 'Fragment') continue;
      problems.push(`${rel(file)}: <${name}> is used but never imported or declared`);
    }

    // Any `THREE.` reference requires a `three` import. This exact bug (a
    // missing namespace import) is invisible to a bundler until runtime.
    const files = [...walk(SRC)];
    if (!/\bimport\s+\*\s+as\s+THREE\b/.test(src) && /\bTHREE\./.test(src)) {
      problems.push(`${rel(file)}: uses "THREE." but never imports * as THREE from 'three'`);
    }
  }

  // duplicate detection for the namespace too
  for (const file of files) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\bTHREE\./.test(src) && !/\bimport\s+\*\s+as\s+THREE\b/.test(src)) {
      const msg = `${rel(file)}: uses "THREE." but never imports * as THREE from 'three'`;
      if (!problems.includes(msg)) problems.push(msg);
    }
  }

  // Namespace check across BOTH .js and .jsx: a missing `* as THREE` import is
  // invisible to the bundler and only throws at runtime.
  const allFiles = walk(SRC);
  for (const file of allFiles) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/\bTHREE\./.test(code) && !/\bimport\s+\*\s+as\s+THREE\b/.test(code)) {
      problems.push(`${rel(file)}: uses "THREE." but never imports * as THREE from 'three'`);
    }
  }

  /**
   * React hook check, across BOTH .js and .jsx.
   *
   * A hook used without being imported is a bare `ReferenceError` at runtime.
   * Vite/esbuild do NOT flag it: a free identifier simply resolves against the
   * module scope and the bundle builds clean. It only surfaces when the
   * component renders, which is exactly how a missing `useEffect` in
   * `world/Island.jsx` shipped past `npm run build`.
   */
  const REACT_HOOKS = [
    'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback',
    'useRef', 'useContext', 'useReducer', 'useId', 'useSyncExternalStore',
    'useTransition', 'useDeferredValue', 'useImperativeHandle', 'useDebugValue',
    'forwardRef', 'memo', 'lazy', 'Suspense', 'StrictMode', 'Fragment',
  ];
  const allFiles2 = walk(SRC);
  for (const file of allFiles2) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // identifiers that are in scope: imports, function/class/const declarations
    const bound = new Set();
    for (const m of code.matchAll(/import\s+([^;]+?)\s+from\s+['"]/g)) {
      for (const part of m[1].replace(/[{}]/g, ',').split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) bound.add(name);
      }
    }
    for (const m of code.matchAll(/(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      bound.add(m[1]);
    }
    for (const hook of REACT_HOOKS) {
      // word-boundary use, but not as a property (obj.useState) or a declaration
      const used = new RegExp(`(?<![.\\w$])${hook}(?![\\w$])`).test(code);
      if (used && !bound.has(hook)) {
        problems.push(`${rel(file)}: uses ${hook}() but never imports it from 'react'`);
      }
    }
  }

  if (problems.length) problems.forEach(fail);
  else ok(`no unimported identifiers across ${files.length} components + ${allFiles.length} modules`);
}

/* ---------------- 4. import hygiene --------------------------- */
console.log('\n4) Import hygiene');
{
  let bad = 0;
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      const base = join(file, '..', m[1]);
      const found = ['', '.js', '.jsx', '/index.js'].some((ext) => existsSync(base + ext));
      if (!found) { fail(`${rel(file)}: cannot resolve "${m[1]}"`); bad++; }
    }
  }
  if (!bad) ok('every relative import resolves on disk');
}

console.log('');
if (failures) { console.error(`${failures} check(s) failed\n`); process.exit(1); }
console.log('all checks passed\n');