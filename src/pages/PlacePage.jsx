/**
 * A single "place" page. Every route in the registry renders one of these with
 * its content from `content.js`.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageShell } from './blocks.jsx';
import { getContent } from './content.js';
import { LOCATION_BY_ID } from '../world/locations/registry.js';
import { useWorld } from '../core/store.js';
import { playSfx } from '../audio/audio.js';

export function PlacePage({ route }) {
  const page = getContent(route);
  const router = useLocation();
  const navigate = useNavigate();
  const setHovered = useWorld((s) => s.setHovered);

  // scroll to the top on entry, and refresh the document title
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = `${page.title} — Aetheria`;
    return () => { document.title = 'Aetheria — The Steampunk Sky-City'; };
  }, [page.title, router.pathname]);

  const loc = Object.values(LOCATION_BY_ID).find((l) => l.route === route);

  return (
    <div className="page-wrap">
      <button
        className="backlink"
        type="button"
        onClick={() => {
          playSfx('back');
          setHovered(null);
          navigate('/');
        }}
      >
        <span className="backlink__arrow">←</span>
        <span className="backlink__text">
          <em>Back to the island</em>
          <small>{loc ? `from ${loc.name}` : ''}</small>
        </span>
      </button>

      <PageShell page={page} />
    </div>
  );
}

export default PlacePage;