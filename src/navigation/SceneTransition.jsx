/**
 * SCENE TRANSITION
 * ----------------
 * Turns a click on a building into a page change without ever feeling abrupt:
 *
 *   t=0      click → the camera begins its cinematic fly-to (handled by CameraRig)
 *   t≈0.62   a portal veil (radial + blur) blooms over the destination building
 *   t=0.95   the veil is fully opaque and we navigate
 *   t≈1.05   the new page fades in; the veil lifts
 *
 * On the way back the same timeline plays in reverse from the page's header.
 *
 * Total: ~1.05s out, ~0.75s back — fast enough to feel responsive, slow enough
 * to feel like a cut in a film.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorld } from '../core/store.js';
import { LOCATION_BY_ID } from '../world/locations/registry.js';
import { playSfx } from '../audio/audio.js';

const FLY_MS = 780;    // camera flight
const VEIL_IN = 260;   // veil bloom after arrival at the building
const VEIL_HOLD = 120;
const OUT_MS = 1160;   // total outgoing

export function useSceneTransition() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const flying = useWorld((s) => s.flying);
  const focusId = useWorld((s) => s.focusId);
  const clearFocus = useWorld((s) => s.clearFocus);

  const [veil, setVeil] = useState({ on: false, opacity: 0, color: '#0b0708', label: '', sub: '' });
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /* ---- outgoing: focus → veil → navigate ---------------------- */
  useEffect(() => {
    if (!flying || !focusId) return undefined;
    const loc = LOCATION_BY_ID[focusId];
    if (!loc) return undefined;

    playSfx('portal');
    clearTimers();

    timers.current.push(
      setTimeout(() => {
        setVeil({
          on: true,
          opacity: 1,
          color: '#0b0708',
          label: loc.label,
          sub: loc.name,
          accent: loc.accent,
        });
      }, FLY_MS),
      setTimeout(() => navigate(loc.route), FLY_MS + VEIL_IN + VEIL_HOLD),
      setTimeout(() => setVeil((v) => ({ ...v, on: false, opacity: 0 })), FLY_MS + VEIL_IN + VEIL_HOLD + 60),
      setTimeout(() => clearFocus(), OUT_MS),
    );

    return clearTimers;
  }, [flying, focusId, navigate, clearFocus, clearTimers]);

  /* ---- incoming: lift the veil once the page has mounted ------ */
  useEffect(() => {
    if (routerLocation.pathname !== '/') {
      setVeil({ on: false, opacity: 0 });
    }
  }, [routerLocation.pathname]);

  return veil;
}

/**
 * The veil itself. Rendered above the canvas, driven purely by inline styles so
 * the fade never waits on React's render cycle.
 */
export function TransitionVeil({ veil }) {
  return (
    <div
      className={`veil ${veil.on ? 'veil--on' : ''}`}
      style={{
        '--veil-opacity': veil.opacity,
        '--veil-accent': veil.accent ?? '#ffc76b',
      }}
      aria-hidden
    >
      <div className="veil__wash" />
      <div className="veil__ring" />
      {veil.label && (
        <div className="veil__caption">
          <span className="veil__eyebrow">{veil.label}</span>
          <span className="veil__title">{veil.sub}</span>
        </div>
      )}
    </div>
  );
}

export default useSceneTransition;