/**
 * ASSET PATHS
 * -----------
 * A project site on GitHub Pages is served from
 *   https://<user>.github.io/<repo>/
 * and NOT from the domain root. A bare absolute path like '/models/cog.glb' is
 * resolved by the browser against the ORIGIN, so it would request
 *   https://<user>.github.io/models/cog.glb
 * — one directory too high, 404, and the loader never gets its file. Pointing it
 * at the right place requires the deployment prefix, which Vite exposes as
 * import.meta.env.BASE_URL (it mirrors `base` in vite.config.js).
 *
 * Resolution order:
 *   1. absolute URL ('https://…', '//cdn…')  -> untouched
 *   2. data: URI / fragment                   -> untouched
 *   3. bare path ('/models/cog.glb')          -> prefixed with BASE_URL
 *
 * Step 3 is the only one that has to change. Content authors keep writing plain
 * '/models/thing.glb' in content.js, so no data file needs to know where the
 * site happens to be deployed.
 */
const RAW_BASE = import.meta.env.BASE_URL || '/';

/** Prefix a site-relative path with the deployment base. See notes above. */
export function asset(path) {
  if (!path) return path;
  const p = String(path);
  if (/^([a-z]+:)?\/\//i.test(p) || p.startsWith('data:') || p.startsWith('#')) return p;
  return `${RAW_BASE}${p.replace(/^\/+/, '')}`;
}

/** The deployment base, always with a trailing slash ('/space-bunny-aetheria/'). */
export const BASE = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`;

export default asset;
