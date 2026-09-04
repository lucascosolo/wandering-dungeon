import { del, get, set } from 'idb-keyval';

/**
 * Every sound in the game, synthesised on the spot from oscillators and noise.
 * No sample files: the build ships nothing extra, nothing has to load before a
 * hit can be heard, and a phone's tap-to-turn latency is not stacked on top of a
 * decode. Web Audio is a browser built-in, so this is not a dependency either.
 *
 * Nothing here is reachable from `src/core/`. Audio has no bearing on the seed.
 *
 * The context is created lazily on the first user gesture, because every mobile
 * browser refuses to start one earlier — an AudioContext made at boot sits
 * suspended and plays nothing. `unlock` is wired to the shell's pointer and key
 * handlers for that reason.
 */

export type SfxKind =
  | 'hit'
  | 'hurt'
  | 'block'
  | 'kill'
  | 'pickup'
  | 'coin'
  | 'step'
  | 'shift'
  | 'telegraph'
  | 'tick'
  | 'blink'
  | 'potion'
  | 'stairs'
  | 'death';

const STORAGE_KEY = 'sound';

let enabled = true;
let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  set(STORAGE_KEY, on).catch(error => console.error('Could not save the sound setting', error));
}

/** Same storage boundary as the cosmetic: an unreadable store means the default. */
export async function loadSoundSetting(): Promise<void> {
  try {
    const stored = await get(STORAGE_KEY);
    enabled = stored !== false;
  } catch (error) {
    console.error('Could not read the sound setting', error);
    enabled = true;
  }
}

export async function clearSoundSetting(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch (error) {
    console.error('Could not clear the sound setting', error);
  }
  enabled = true;
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch (error) {
    console.error('Could not start audio', error);
    return null;
  }
  return ctx;
}

/**
 * Call from any user gesture. Creates the context if needed and resumes it if
 * the browser suspended it — both are no-ops once done, so it is cheap to call
 * on every tap.
 */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 0.5);
  noiseBuffer = c.createBuffer(1, length, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  // A fixed LCG rather than Math.random: the texture of the noise never needs
  // to vary, and the codebase's rule of no unseeded rolls is easier to keep as
  // "none at all" than "none that matter".
  let seed = 0x2545f491;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return noiseBuffer;
}

interface Tone {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
}

function tone(c: AudioContext, master: GainNode, t: Tone): void {
  const osc = c.createOscillator();
  const env = c.createGain();
  const at = c.currentTime + (t.delay ?? 0);
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.to), at + t.duration);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(t.gain, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + t.duration);
  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + t.duration + 0.02);
}

interface Burst {
  duration: number;
  gain: number;
  /** Low-pass cutoff in Hz; lower is duller, heavier. */
  cutoff: number;
  delay?: number;
}

function burst(c: AudioContext, master: GainNode, b: Burst): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = b.cutoff;
  const env = c.createGain();
  const at = c.currentTime + (b.delay ?? 0);
  env.gain.setValueAtTime(b.gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + b.duration);
  src.connect(filter).connect(env).connect(master);
  src.start(at);
  src.stop(at + b.duration + 0.02);
}

/**
 * The shift-clock tick, pitched by how close the shift is: `urgency` runs from
 * 0 (a long way off) to 1 (next turn). The same click, climbing, is what makes
 * a countdown you are not looking at still felt.
 */
export function playTick(urgency: number): void {
  if (!enabled) return;
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const master = c.createGain();
  master.gain.value = 0.35;
  master.connect(c.destination);
  const u = Math.min(1, Math.max(0, urgency));
  tone(c, master, { type: 'square', from: 520 + u * 900, to: 380 + u * 600, duration: 0.03 + u * 0.02, gain: 0.08 + u * 0.12 });
}

export function playSfx(kind: SfxKind): void {
  if (!enabled) return;
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);

  switch (kind) {
    case 'hit':
      burst(c, master, { duration: 0.08, gain: 0.5, cutoff: 1800 });
      tone(c, master, { type: 'square', from: 220, to: 90, duration: 0.09, gain: 0.35 });
      break;
    case 'hurt':
      burst(c, master, { duration: 0.16, gain: 0.7, cutoff: 900 });
      tone(c, master, { type: 'sawtooth', from: 160, to: 45, duration: 0.2, gain: 0.5 });
      break;
    case 'block':
      tone(c, master, { type: 'triangle', from: 900, to: 700, duration: 0.07, gain: 0.3 });
      burst(c, master, { duration: 0.05, gain: 0.25, cutoff: 4000 });
      break;
    case 'kill':
      burst(c, master, { duration: 0.28, gain: 0.8, cutoff: 700 });
      tone(c, master, { type: 'sawtooth', from: 140, to: 30, duration: 0.32, gain: 0.55 });
      tone(c, master, { type: 'square', from: 660, to: 990, duration: 0.12, gain: 0.18, delay: 0.06 });
      break;
    case 'pickup':
      tone(c, master, { type: 'triangle', from: 660, to: 880, duration: 0.07, gain: 0.3 });
      tone(c, master, { type: 'triangle', from: 880, to: 1320, duration: 0.1, gain: 0.3, delay: 0.07 });
      break;
    case 'coin':
      tone(c, master, { type: 'square', from: 1320, to: 1760, duration: 0.05, gain: 0.18 });
      tone(c, master, { type: 'square', from: 1760, to: 2200, duration: 0.09, gain: 0.18, delay: 0.05 });
      break;
    case 'step':
      burst(c, master, { duration: 0.03, gain: 0.12, cutoff: 600 });
      break;
    case 'shift':
      burst(c, master, { duration: 0.6, gain: 0.9, cutoff: 300 });
      tone(c, master, { type: 'sawtooth', from: 70, to: 28, duration: 0.7, gain: 0.6 });
      tone(c, master, { type: 'sine', from: 440, to: 55, duration: 0.5, gain: 0.25, delay: 0.05 });
      break;
    case 'telegraph':
      tone(c, master, { type: 'sine', from: 240, to: 180, duration: 0.35, gain: 0.35 });
      tone(c, master, { type: 'sine', from: 240, to: 180, duration: 0.35, gain: 0.35, delay: 0.4 });
      break;
    case 'blink':
      tone(c, master, { type: 'sine', from: 300, to: 2400, duration: 0.18, gain: 0.35 });
      burst(c, master, { duration: 0.2, gain: 0.35, cutoff: 5000 });
      break;
    case 'potion':
      tone(c, master, { type: 'sine', from: 392, to: 523, duration: 0.12, gain: 0.3 });
      tone(c, master, { type: 'sine', from: 523, to: 784, duration: 0.18, gain: 0.3, delay: 0.1 });
      break;
    case 'stairs':
      tone(c, master, { type: 'triangle', from: 330, to: 165, duration: 0.25, gain: 0.35 });
      tone(c, master, { type: 'triangle', from: 220, to: 110, duration: 0.3, gain: 0.3, delay: 0.18 });
      break;
    case 'death':
      burst(c, master, { duration: 0.9, gain: 0.9, cutoff: 400 });
      tone(c, master, { type: 'sawtooth', from: 200, to: 20, duration: 1.1, gain: 0.6 });
      break;
    case 'tick':
      playTick(0);
      break;
  }
}
