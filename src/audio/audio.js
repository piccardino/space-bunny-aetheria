/**
 * AUDIO — fully synthesised with the Web Audio API.
 * ---------------------------------------------------
 * There are no audio files in this project: every sound is generated at runtime
 * from oscillators and noise buffers. That keeps the bundle tiny, avoids CORS
 * and licensing entirely, and lets the ambience react continuously to what the
 * camera is doing.
 *
 * The ambience is a layered bed:
 *   • wind      — brown noise through a slowly wandering band-pass
 *   • engines   — detuned low saws with a slow tremolo (the island's drives)
 *   • machinery — a periodic metallic click train (the gear train)
 *
 * One-shots (hover tick, select clank, portal whoosh) are short envelopes.
 *
 * POLICY: no AudioContext is created until the user explicitly enables audio,
 * and it is only resumed inside that user gesture.
 */

let ctx = null;
let master = null;
let bed = null;
let enabled = false;

function makeNoiseBuffer(context, seconds = 3) {
  const len = Math.floor(context.sampleRate * seconds);
  const buf = context.createBuffer(1, len, context.sampleRate);
  const data = buf.getChannelData(0);
  // brown-ish noise: softer than white, and reads convincingly as wind
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buf;
}

/** Build the ambience graph. Called once, only after a user gesture. */
function buildBed() {
  if (!ctx || bed) return;
  const now = ctx.currentTime;

  // master chain with a gentle compressor so one-shots never clip the bed
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const noiseBuf = makeNoiseBuffer(ctx);

  // ---- WIND: brown noise → wandering band-pass
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noiseBuf;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.12;
  windSrc.connect(windFilter).connect(windGain).connect(master);
  windSrc.start(now);

  const windLfo = ctx.createOscillator();
  windLfo.frequency.value = 0.05;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 260;
  windLfo.connect(windLfoGain).connect(windFilter.frequency);
  windLfo.start(now);

  // ---- ENGINES: three detuned saws, filtered and tremolo'd
  const engGain = ctx.createGain();
  engGain.gain.value = 0.05;
  const engFilter = ctx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 220;
  engGain.connect(engFilter).connect(master);

  for (const [freq, detune] of [[41.2, -6], [61.7, 7], [82.4, 0]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(engGain);
    o.start(now);
  }
  const trem = ctx.createOscillator();
  trem.frequency.value = 0.22;
  const tremGain = ctx.createGain();
  tremGain.gain.value = 0.022;
  trem.connect(tremGain).connect(engGain.gain);
  trem.start(now);

  bed = { windSrc, windFilter, engGain, engFilter, noiseBuf, windLfo, trem };
  scheduleTick();
}

/** A periodic metallic click — the sound of the gear train turning. */
let tickTimer = null;
function scheduleTick() {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(() => {
    if (enabled && ctx) playTick();
    scheduleTick();
  }, 1400 + Math.random() * 2600);
}

function playTick() {
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = bed.noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + Math.random() * 1400;
  bp.Q.value = 9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.06, now + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + 0.14);
}

/** Short synthesised one-shot. */
function blip({ freq = 440, type = 'sine', dur = 0.12, gain = 0.08, sweep = 0, delay = 0 }) {
  if (!ctx || !enabled || !master) return;
  const now = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

function whoosh() {
  if (!ctx || !enabled || !master) return;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = bed.noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(220, now);
  bp.frequency.exponentialRampToValueAtTime(2600, now + 0.55);
  bp.frequency.exponentialRampToValueAtTime(180, now + 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.16, now + 0.16);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + 1.25);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export function enableAudio() {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  if (!ctx) {
    ctx = new AudioCtx();
    buildBed();
  }
  if (ctx.state === 'suspended') ctx.resume();

  enabled = true;
  if (master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.6);
  }
}

export function disableAudio() {
  enabled = false;
  clearTimeout(tickTimer);
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  }
}

export const isAudioReady = () => !!ctx;

/**
 * React to what the camera is doing: zooming in makes the island louder and
 * brighter, pulling back pushes it into the distance. Called from the scene.
 */
export function setListenerDistance(distance, height) {
  if (!ctx || !bed || !enabled) return;
  const t = ctx.currentTime;
  const near = Math.max(0, 1 - (distance - 60) / 180);
  bed.engFilter.frequency.setTargetAtTime(160 + near * 420, t, 0.4);
  bed.engGain.gain.setTargetAtTime(0.03 + near * 0.06, t, 0.5);
  bed.windFilter.frequency.setTargetAtTime(320 + Math.max(0, height) * 2.4, t, 0.6);
}

export function playSfx(kind) {
  if (!enabled || !ctx) return;
  switch (kind) {
    case 'hover':
      blip({ freq: 1180, type: 'triangle', dur: 0.06, gain: 0.035, sweep: 260 });
      break;
    case 'click':
      blip({ freq: 320, type: 'square', dur: 0.05, gain: 0.05, sweep: -140 });
      blip({ freq: 880, type: 'triangle', dur: 0.16, gain: 0.05, delay: 0.03, sweep: 400 });
      blip({ freq: 1760, type: 'sine', dur: 0.22, gain: 0.03, delay: 0.05 });
      break;
    case 'portal':
      whoosh();
      blip({ freq: 220, type: 'sine', dur: 0.9, gain: 0.06, sweep: 660 });
      blip({ freq: 330, type: 'sine', dur: 1.1, gain: 0.04, sweep: 990, delay: 0.06 });
      break;
    case 'back':
      blip({ freq: 520, type: 'triangle', dur: 0.22, gain: 0.05, sweep: -260 });
      break;
    case 'ui':
      blip({ freq: 1320, type: 'sine', dur: 0.05, gain: 0.03 });
      break;
    default:
      break;
  }
}

export default { enableAudio, disableAudio, playSfx, setListenerDistance, isAudioReady };