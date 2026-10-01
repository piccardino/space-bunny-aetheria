import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { asset } from './core/asset.js';
import './styles/global.css';

/**
 * The site is published under a subpath (/space-bunny-aetheria/), and
 * BrowserRouter matches routes against the FULL pathname. Left at its default
 * it would look for '/projects' in '/space-bunny-aetheria/projects', find
 * nothing, and fall through to the catch-all route — so every deep link and
 * every refresh landed on the wrong page.
 *
 * BASE_URL is the same value passed to vite as `base`, so this stays correct
 * whether the app is served from the domain root (local) or a subpath (Pages).
 */
const BASENAME = asset('/').replace(/\/+$/, '') || '/';

/**
 * SPA deep-link restore.
 *
 * GitHub Pages has no rewrite rules, so hitting /space-bunny-aetheria/projects
 * directly is a server-side 404. The generated 404.html (see the spaFallback
 * plugin in vite.config.js) stashes the intended path in sessionStorage and
 * redirects to the base. Put it back BEFORE React Router mounts, otherwise the
 * router would initialise on '/' and the deep link would silently resolve to
 * the island.
 *
 * Wrapped in try/catch: sessionStorage throws outright in Safari private mode
 * and when storage is disabled, and a missing redirect must never stop the app
 * from booting.
 */
try {
  const stored = sessionStorage.getItem('aetheria:redirect');
  if (stored) {
    sessionStorage.removeItem('aetheria:redirect');
    // only same-origin paths — never let a stored value navigate off-site
    if (stored.startsWith('/') && !stored.startsWith('//')) {
      window.history.replaceState(null, '', stored);
    }
  }
} catch {
  /* storage unavailable: the app still works, deep links just won't restore */
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={BASENAME}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);