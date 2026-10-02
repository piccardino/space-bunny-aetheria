/**
 * Global world store (zustand).
 * Holds ONLY low-frequency UI state — nothing that changes per frame.
 * Per-frame camera motion lives in refs (see navigation/CameraRig.jsx) so the
 * React tree never re-renders while you orbit the island.
 */
import { create } from 'zustand';
import { detectTier, prefersReducedMotion, TIERS } from './quality.js';

const initialTier = typeof window !== 'undefined' ? detectTier() : TIERS.high;

export const useWorld = create((set, get) => ({
  /* ---------------- lifecycle ---------------- */
  phase: 'loading', // loading → intro → exploring
  ready: false,
  setReady: () => set({ ready: true }),

  enterWorld: () => set({ phase: 'exploring' }),

  /* ---------------- interaction ---------------- */
  hoveredId: null,
  setHovered: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },

  /**
   * The location currently under the pointer. The DOM label layer lives OUTSIDE
   * the <Canvas> (HTML cannot be rendered inside it), so the scene and the DOM
   * communicate the hover through this single shared value.
   */
  activeLocation: null,
  setActive: (loc) => {
    const cur = get().activeLocation;
    if (cur === loc || (cur && loc && cur.id === loc.id)) return;
    set({ activeLocation: loc });
  },

  /** Screen-space position of the active location's label, in CSS pixels. */
  labelScreen: { x: 0, y: 0, visible: false },
  setLabelScreen: (p) => {
    const s = get().labelScreen;
    if (s.x === p.x && s.y === p.y && s.visible === p.visible) return;
    set({ labelScreen: p });
  },

  /* ---------------- navigation / cinematic ---------------- */
  /** id of the location the camera is currently flying to */
  focusId: null,
  /** { id, route, label, name, accent } snapshot taken when the fly-to starts */
  lastDestination: null,
  flying: false,

  beginFlyTo: (location) =>
    set({
      flying: true,
      focusId: location.id,
      lastDestination: {
        id: location.id,
        route: location.route,
        label: location.label,
        name: location.name,
        accent: location.accent,
      },
    }),

  arriveAt: () => set({ flying: false }),
  clearFocus: () => set({ focusId: null, flying: false }),

  /* ---------------- intro cinematic ---------------- */
  introProgress: 0,
  setIntroProgress: (v) => set({ introProgress: v }),

  /* ---------------- UI ---------------- */
  audioOn: false,
  toggleAudio: () => set((s) => ({ audioOn: !s.audioOn })),
  menuOpen: false,
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  setMenu: (v) => set({ menuOpen: v }),
  hintVisible: true,
  dismissHint: () => set({ hintVisible: false }),

  /* ---------------- quality ---------------- */
  tier: initialTier,

  /**
   * Render scale applied on top of the tier.
   *
   * The tier decides how MUCH is drawn (shadows, bloom, vegetation, particle
   * counts); this decides how many pixels those are drawn into. They are
   * independent: a strong GPU can afford every effect but the user may still
   * want a smaller buffer, and a weak GPU benefits from both.
   *
   * 1 is native, 0.5 is half resolution in each axis (a quarter of the pixels).
   * Kept as a separate value from the tier so toggling it never rebuilds the
   * world — only the drawing buffer is re-allocated.
   */
  renderScale: 1,
  setRenderScale: (v) => set({ renderScale: Math.min(1, Math.max(0.4, v)) }),
  toggleLowRes: () => set((s) => ({ renderScale: s.renderScale < 1 ? 1 : 0.6 })),

  reducedMotion: typeof window !== 'undefined' ? prefersReducedMotion() : false,

  /** Move to an explicit tier (used by the quality button). */
  setTier: (name) => set({ tier: TIERS[name] ?? initialTier }),

  downgrade: () =>
    set((s) => {
      const idx = ['low', 'medium', 'high'].indexOf(s.tier.name);
      if (idx <= 0) return {};
      return { tier: ['low', 'medium', 'high'][idx - 1] };
    }),

  /* ---------------- WebGL context lifecycle ---------------- */
  /**
   * Bumped every time the browser hands back a live WebGL context.
   *
   * Everything downstream that allocated GPU resources against the OLD context
   * is holding dead handles: the postprocessing render targets above all.
   * They are not reallocated on their own, because nothing about the viewport
   * changed, so without this counter the composer would keep blitting from
   * textures that no longer exist: a permanently black canvas.
   */
  glGeneration: 0,
  bumpGlGeneration: () => set((s) => ({ glGeneration: s.glGeneration + 1 })),
  /** Set when the GPU context drops, cleared on restore - for diagnostics. */
  glLost: false,
  setGlLost: (v) => set({ glLost: v }),

}));

/** Convenience: imperative access outside React (audio, transitions, ...). */
export const world = {
  get: () => useWorld.getState(),
  set: (p) => useWorld.setState(p),
};
