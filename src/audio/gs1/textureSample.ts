/**
 * The **default texture sample** — a stand-in recording, generated rather than bundled.
 *
 * P2.5 is "sample-based texture (vocal chops, found sound)": the voice, the routing and the import path are code, and
 * the *recording* is content. Content needs a licensing decision (now set aside) and, more practically, actual audio
 * the repository does not have — so the mechanism ships with a **generated** one-shot and a documented hook: a caller
 * (a genre's texture lane, a future sample pack) hands `Gs1Host.importSample` whatever it wants, and this is only what
 * plays when nobody has said otherwise.
 *
 * What it is: a short, deterministic **texture** — filtered noise with a few transient clicks and a gentle decay, the
 * shape of a needle drop or a found-sound rustle. Deterministic because a render has to repeat (the same reason every
 * other generator here is seeded), and short because a texture lane's one-shot should fit inside a bar at any tempo
 * the library uses.
 */
/** Length in seconds: half a second fits a sixteenth note down to 30 BPM and stays a one-shot. */
export const TEXTURE_SAMPLE_SECONDS = 0.5;

/** Where the generated sample's key sits — `SMP_ROOT` in the patch must agree with this. */
export const TEXTURE_SAMPLE_ROOT = 60;

/** A tiny deterministic PRNG (xorshift32), so two calls produce the same bytes. */
function makeRandom(seed: number): () => number {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/**
 * One channel of the default texture, as a `Float32Array` at `sampleRate`.
 *
 * Three ingredients, each doing one job: a decaying noise bed (the "room"), a handful of clicks (the transients that
 * make it read as *found* rather than as noise), and a smooth tail so the end is silent rather than truncated.
 */
export function generateTextureSample(sampleRate: number, seed = 0x9e3779b9): Float32Array {
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.floor(sampleRate) : 44100;
  const frames = Math.max(1, Math.round(TEXTURE_SAMPLE_SECONDS * rate));
  const out = new Float32Array(frames);
  const random = makeRandom(seed);

  // One-pole low-pass on the noise: raw white noise is a hiss, this is a rustle.
  let smoothed = 0;
  const smoothing = 0.35;
  const decay = 6 / frames; // ~ -52 dB by the end, so the tail is silent without a hard cut
  for (let i = 0; i < frames; i += 1) {
    const white = random() * 2 - 1;
    smoothed += (white - smoothed) * smoothing;
    // Slight stereo-free brightness at the start, darkening as it decays — the shape of a physical gesture.
    const brightness = 1 - 0.5 * (i / frames);
    out[i] = smoothed * brightness * Math.exp(-decay * i);
  }

  // Clicks: five unevenly spaced transients, the "found" part.
  const clickPositions = [0.02, 0.09, 0.23, 0.41, 0.68];
  for (const fraction of clickPositions) {
    const at = Math.round(fraction * frames);
    const amplitude = 0.5 + 0.4 * random();
    const clickDecay = 0.004 * rate; // a few milliseconds, so it reads as a tick and not a thump
    for (let i = at; i < frames; i += 1) {
      const t = i - at;
      if (t > clickDecay * 4) break;
      out[i] += amplitude * (random() * 2 - 1) * Math.exp(-t / clickDecay);
    }
  }

  // Normalise to a known peak so the patch's gain means something, then leave a hair of headroom.
  let peak = 0;
  for (let i = 0; i < frames; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < frames; i += 1) out[i] *= scale;
  }
  return out;
}
