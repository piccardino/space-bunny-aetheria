/**
 * The repo is published to GitHub Pages at
 *   https://piccardino.github.io/space-bunny-aetheria/
 * so the production build is rooted at /<repo>/ rather than at /.
 *
 * Every other URL in the app is derived from import.meta.env.BASE_URL, so the
 * subpath is declared in exactly ONE place: the BASE passed to vite build.
 * Locally it stays "/" (dev server + `npm run preview` on a custom path), and
 * the deploy workflow sets BASE_PATH automatically from the repo name.
 */
const BASE_PATH = process.env.BASE_PATH ?? '/';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GitHub Pages has no rewrite rules: a deep link such as
 * /space-bunny-aetheria/projects is a real 404 on the server, so a refresh or
 * a shared URL would dead-end even though the router could route it.
 *
 * The fix is the standard one — ship a 404.html that is a COPY of the built
 * index.html plus a script which stashes the requested path in sessionStorage
 * and bounces to the base. main.jsx reads the stash back and restores the URL
 * before React Router mounts, so the deep link works and the address bar keeps
 * showing the real path.
 *
 * Generating it from the real index.html (rather than hand-writing one) means
 * the hashed asset URLs are always the ones that were just built.
 *
 * `.nojekyll` is written alongside it: without it Jekyll strips files and
 * directories beginning with an underscore out of the published site.
 */
function spaFallback() {
  let base = '/';
  let outDir = 'dist';

  return {
    name: 'aetheria:spa-fallback',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const dir = resolve(process.cwd(), outDir);
      const index = resolve(dir, 'index.html');
      if (!existsSync(index)) return;

      const redirect = [
        '<script>',
        '(function () {',
        '  var target = location.pathname + location.search + location.hash;',
        '  try { sessionStorage.setItem("aetheria:redirect", target); } catch (e) {}',
        `  location.replace(${JSON.stringify(base)});`,
        '})();',
        '</script>',
      ].join('\n');

      const html = readFileSync(index, 'utf8');
      writeFileSync(resolve(dir, '404.html'), html.replace('</body>', `${redirect}\n</body>`));
      writeFileSync(resolve(dir, '.nojekyll'), '');
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback()],
  base: BASE_PATH,
  server: { port: 5173, host: true },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('postprocessing')) return 'three';
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) return 'react';
          }
        },
      },
    },
  },
});
