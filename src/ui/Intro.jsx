/**
 * LANDING INTRO
 * -------------
 * Black screen → the Aetheria mark assembles → "Enter the Island".
 *
 * Clicking it plays the cinematic: the veil clears, the cloud deck parts and the
 * camera advances. It is skippable (button, Enter, Space or Escape) and it never
 * plays twice.
 *
 * The whole thing is pure CSS animation driven by a single `--intro` progress
 * variable, so it costs nothing per frame and never blocks the main thread.
 */
import { useEffect, useState, useCallback } from 'react';
import { useWorld } from '../core/store.js';

export function Intro() {
  const phase = useWorld((s) => s.phase);
  const enterWorld = useWorld((s) => s.enterWorld);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const enter = useCallback(() => {
    if (phase === 'exploring' || leaving) return;
    setLeaving(true);
    enterWorld();
    // keep the veil mounted long enough for the exit transition to finish
    setTimeout(() => setGone(true), 1500);
  }, [phase, leaving, enterWorld]);

  /* keyboard skip */
  useEffect(() => {
    if (phase === 'exploring') return undefined;
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, enter]);

  if (gone || phase === 'exploring' && !leaving) return null;

  return (
    <div className={`intro ${leaving ? 'intro--leaving' : ''}`}>
      <div className="intro__grain" />
      <div className="intro__vignette" />

      <div className="intro__stage">
        {/* the mark: a small brass cog over the wordmark */}
        <div className="intro__mark">
          <svg viewBox="0 0 120 120" className="intro__cog" aria-hidden>
            <g fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="60" cy="60" r="34" />
              <circle cx="60" cy="60" r="25" strokeDasharray="3 4" opacity="0.55" />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={60 + Math.cos(a) * 34} y1={60 + Math.sin(a) * 34}
                    x2={60 + Math.cos(a) * 42} y2={60 + Math.sin(a) * 42}
                  />
                );
              })}
              {Array.from({ length: 6 }).map((_, i) => {
                const a = (i / 6) * Math.PI * 2;
                return (
                  <line
                    key={`s${i}`}
                    x1={60} y1={60}
                    x2={60 + Math.cos(a) * 25} y2={60 + Math.sin(a) * 25}
                    opacity="0.7"
                  />
                );
              })}
            </g>
          </svg>
          <span className="intro__ring" />
        </div>

        <h1 className="intro__title">
          <span className="intro__title-line">AETHERIA</span>
          <span className="intro__sub">The Steampunk Sky-City</span>
        </h1>

        <p className="intro__blurb">
          A floating island that never stops working.
          <br />
          Eight places. One world. Choose a door.
        </p>

        <button className="intro__enter" onClick={enter} type="button">
          <span className="intro__enter-label">Enter the Island</span>
          <span className="intro__enter-hint">press ↵</span>
        </button>

        <div className="intro__loading" aria-live="polite">
          <span className="intro__loading-bar" />
        </div>
      </div>
    </div>
  );
}

export default Intro;