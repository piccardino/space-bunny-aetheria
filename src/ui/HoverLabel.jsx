/**
 * HOVER LABEL — lives OUTSIDE the <Canvas>.
 *
 * React Three Fiber reconciles its whole subtree as three.js objects, so plain
 * HTML (<div>, <span>) rendered inside it throws. The label therefore lives in
 * the DOM layer, and the scene publishes its screen position into the store.
 */
import { useEffect, useRef } from 'react';
import { useWorld } from '../core/store.js';

export function HoverLabel() {
  const loc = useWorld((s) => s.activeLocation);
  const screen = useWorld((s) => s.labelScreen);
  const phase = useWorld((s) => s.phase);
  const ref = useRef(null);

  // fade the element in/out through CSS so we don't remount it every frame
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.visible = screen.visible && loc ? 'true' : 'false';
  }, [screen.visible, loc, screen.x, screen.y]);

  if (phase !== 'exploring') return null;

  return (
    <div
      ref={ref}
      className="voxel-label"
      data-visible="false"
      style={{
        '--accent': loc?.accent ?? '#ffc76b',
        transform: `translate(-50%, -100%) translate3d(${screen.x}px, ${screen.y}px, 0)`,
      }}
      aria-hidden
    >
      {loc && (
        <div className="voxel-label__inner">
          <span className="voxel-label__eyebrow">{loc.label}</span>
          <span className="voxel-label__title">{loc.name}</span>
          {loc.description && <span className="voxel-label__desc">{loc.description}</span>}
          <span className="voxel-label__cta">Enter →</span>
        </div>
      )}
      <div className="voxel-label__stem" />
    </div>
  );
}

export default HoverLabel;