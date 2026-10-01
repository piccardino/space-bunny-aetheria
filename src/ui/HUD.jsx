/**
 * HUD — deliberately minimal.
 *
 * The island IS the navigation, so there is no navbar. Just:
 *   top-left     the mark + the place you are looking at
 *   top-right    sound, reset view, and a compact places index
 *   bottom       the initial hint, which retires itself
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorld } from '../core/store.js';
import { LOCATIONS } from '../world/locations/registry.js';
import { enableAudio, disableAudio, playSfx } from '../audio/audio.js';

export function HUD({ world }) {
  const audioOn = useWorld((s) => s.audioOn);
  const toggleAudio = useWorld((s) => s.toggleAudio);
  const menuOpen = useWorld((s) => s.menuOpen);
  const toggleMenu = useWorld((s) => s.toggleMenu);
  const setMenu = useWorld((s) => s.setMenu);
  const hoveredId = useWorld((s) => s.hoveredId);
  const phase = useWorld((s) => s.phase);
  const hintVisible = useWorld((s) => s.hintVisible);
  const dismissHint = useWorld((s) => s.dismissHint);
  const renderScale = useWorld((s) => s.renderScale);
  const toggleLowRes = useWorld((s) => s.toggleLowRes);

  const navigate = useNavigate();
  const router = useLocation();
  const timer = useRef(null);

  useEffect(() => {
    if (phase !== 'exploring' || !hintVisible) return undefined;
    timer.current = setTimeout(dismissHint, 9000);
    return () => clearTimeout(timer.current);
  }, [phase, hintVisible, dismissHint]);

  // hovering a building reveals which place you would be entering
  const hovered = hoveredId ? LOCATIONS.find((l) => l.id === hoveredId) : null;
  const isIsland = router.pathname === '/';

  const onAudio = () => {
    if (audioOn) disableAudio();
    else enableAudio();
    toggleAudio();
    playSfx('ui');
  };

  const onNavigate = (loc) => {
    playSfx('click');
    setMenu(false);
    useWorld.getState().beginFlyTo(loc);
  };

  /**
   * Low-res toggle.
   *
   * It only changes the pixel ratio the canvas is drawn into, so the island
   * keeps every voxel and every effect — it is a resolution drop, not a
   * content drop. `tier` still governs shadows/bloom/vegetation separately.
   */
  const onLowRes = () => {
    playSfx('ui');
    toggleLowRes();
  };

  const lowRes = renderScale < 1;

  return (
    <>
      <header className="hud hud--top">
        <button
          className="hud__brand"
          onClick={() => navigate('/')}
          type="button"
          aria-label="Aetheria — back to the island"
        >
          <span className="hud__brand-mark" aria-hidden />
          <span className="hud__brand-text">
            <strong>AETHERIA</strong>
            <em>{hovered ? hovered.name : isIsland ? 'Steampunk Sky-City' : 'A Place'}</em>
          </span>
        </button>

        <div className="hud__actions">
          <button
            className={`hud__icon ${lowRes ? 'is-on' : ''}`}
            onClick={onLowRes}
            type="button"
            aria-pressed={lowRes}
            aria-label={lowRes ? 'Render at full resolution' : 'Render at low resolution'}
            title={lowRes
              ? `Low-res on — ${Math.round(renderScale * 100)}% (click for full)`
              : 'Low-res: draw at a lower resolution'}
          >
            <LowResGlyph low={lowRes} />
          </button>

          <button
            className={`hud__icon ${audioOn ? 'is-on' : ''}`}
            onClick={onAudio}
            type="button"
            aria-pressed={audioOn}
            aria-label={audioOn ? 'Mute ambience' : 'Enable ambience'}
            title={audioOn ? 'Mute ambience' : 'Enable ambience'}
          >
            <SoundGlyph on={audioOn} />
          </button>

          {isIsland && (
            <button
              className="hud__icon"
              onClick={() => { world?.reset?.(); playSfx('back'); }}
              type="button"
              title="Reset the view"
              aria-label="Reset the view"
            >
              <ResetGlyph />
            </button>
          )}

          <button
            className={`hud__icon ${menuOpen ? 'is-on' : ''}`}
            onClick={toggleMenu}
            type="button"
            aria-expanded={menuOpen}
            aria-label="Places index"
            title="Places index"
          >
            <MenuGlyph open={menuOpen} />
          </button>
        </div>
      </header>

      <nav className={`index ${menuOpen ? 'index--open' : ''}`} aria-hidden={!menuOpen}>
        <p className="index__eyebrow">Places on the island</p>
        <ul className="index__list">
          {LOCATIONS.map((loc, i) => (
            <li key={loc.id}>
              <button
                type="button"
                onClick={() => onNavigate(loc)}
                disabled={!isIsland}
                style={{ '--accent': loc.accent }}
              >
                <span className="index__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="index__body">
                  <span className="index__name">{loc.name}</span>
                  <span className="index__route">{loc.label}</span>
                </span>
                <span className="index__arrow">→</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="index__foot">Drag to orbit · scroll to zoom · click a building to enter</p>
      </nav>

      {isIsland && phase === 'exploring' && hintVisible && (
        <div className="hint" onClick={dismissHint}>
          <span className="hint__kicker">Explore the island</span>
          <span className="hint__main">Drag to explore · Click a location</span>
          <span className="hint__bar" />
        </div>
      )}

      {menuOpen && <div className="index__scrim" onClick={() => setMenu(false)} />}
    </>
  );
}

/* ---- tiny inline glyphs (no icon dependency) ------------------ */
const SoundGlyph = ({ on }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" strokeLinejoin="round" />
    {on ? (
      <>
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" strokeLinecap="round" />
        <path d="M18 7a7 7 0 0 1 0 10" strokeLinecap="round" opacity="0.6" />
      </>
    ) : (
      <path d="M16 9.5l4 5m0-5l-4 5" strokeLinecap="round" />
    )}
  </svg>
);

const ResetGlyph = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
    <path d="M20 4v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MenuGlyph = ({ open }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    {open ? (
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    ) : (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      </>
    )}
  </svg>
);

/**
 * Low-res glyph: a full frame with a shrunken one inside it, so the button
 * reads as "draw smaller" rather than as a generic settings cog.
 */
const LowResGlyph = ({ low }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="4.5" width="18" height="15" rx="1.6" strokeLinejoin="round" />
    {low ? (
      <rect x="7.5" y="8" width="9" height="8" rx="1" fill="currentColor" fillOpacity="0.35" />
    ) : (
      <>
        <path d="M3 9h18M3 15h18M9 4.5v15M15 4.5v15" strokeOpacity="0.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

export default HUD;