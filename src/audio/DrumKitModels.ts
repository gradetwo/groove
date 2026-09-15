/**
 * Hardware Drum Machine Physical Synthesis Models (P5-02)
 *
 * Implements authentic analog & acoustic circuit modeling for:
 * - TR-808: Bridged-T oscillator kick with sub-bass resonance, snappy dual-sine snare,
 *           metallic inharmonic 6-oscillator cluster hi-hats, analog cowbell/congas.
 * - TR-909: Punchy attack-transient kick, snappy tuned FM snare with punch envelope,
 *           multi-burst handclap, sizzling open/closed cymbals.
 * - Vintage Acoustic: Wooden shell body resonance, snare wire buzz, organic hi-hat wash.
 * - Cyber Wave: Modern punchy transient-saturated hyperpop / synthwave kit.
 */

import { synthesizeAnatomyKickVoice } from "./AnatomyKickEngine";

export type DrumKitType = "808" | "909" | "acoustic" | "cyber" | string;
import { safeVelocity } from "./dspGuards";
import { noiseOffsetForHit } from "./noise";

/**
 * E-06: where a noise layer should start reading the shared noise buffer.
 *
 * Every noise layer used to call `start(time)` with no offset, so each hit read the
 * buffer from sample 0 — a 16th-note hi-hat pattern was literally the same few tens of
 * milliseconds of samples repeated byte-for-byte, which is the static "machine-gun"
 * comb character that makes programmed hats sound fake.
 *
 * `position` must be something the live engine and the offline renderer both derive
 * identically (track index, step index, ratchet index), otherwise exporter parity is
 * lost. The offset is deterministic, so a given step always sounds the same.
 */
function noiseStartOffset(
  ctx: BaseAudioContext,
  buffer: AudioBuffer | null,
  position: number
): number {
  if (!buffer) return 0;
  // Leave half a second of buffer after the offset: far longer than any noise layer
  // here, and it keeps `start(when, offset)` valid on every engine.
  const headroom = Math.ceil(ctx.sampleRate * 0.5);
  return noiseOffsetForHit(position, buffer.length, headroom);
}

export function getBaseDrumKit(kit: DrumKitType): "808" | "909" | "acoustic" | "cyber" {
  if (kit === "808" || kit === "909" || kit === "acoustic" || kit === "cyber") return kit;
  const lower = kit.toLowerCase();
  if (lower.includes("808") || lower.includes("orphic")) return "808";
  if (lower.includes("acoustic") || lower.includes("skin")) return "acoustic";
  if (lower.includes("neural") || lower.includes("cyber")) return "cyber";
  return "909";
}

export interface DrumVoiceCleanup {
  sources: AudioScheduledSourceNode[];
  gains: GainNode[];
  stopTime: number;
}

/**
 * Synthesizes a Kick Drum based on the selected drum machine model
 */
export function synthesizeKick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  if (kit.startsWith("kick:")) {
    const presetId = kit.slice(5);
    return synthesizeAnatomyKickVoice(ctx, dest, time, vel, presetId, noiseBuffer);
  }

  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const basePitch = pitchOffset > 24 ? pitchOffset - 36 : pitchOffset;
  const pitchMultiplier = Math.pow(2, basePitch / 12);

  if (kit === "808") {
    // TR-808 Kick: Bridged-T network simulation with deep sub-bass resonance & long exponential decay
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 160 * pitchMultiplier;
    const endFreq = 42;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    // 808 signature exponential drop: initial steep pitch dip then deep ringing tail
    osc.frequency.exponentialRampToValueAtTime(endFreq + 15, time + 0.045);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.28);

    const kickVol = vel * 1.35;
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(kickVol * 0.7, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.65);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.7);
    sources.push(osc);
    gains.push(gain);

    // 808 Attack Click: high-passed transient spike
    if (noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2400;
      filter.Q.value = 4;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(vel * 0.6, time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(dest);
      click.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + 0.02);
      sources.push(click);
      gains.push(clickGain);
    }

    return { sources, gains, stopTime: time + 0.7 };
  } else if (kit === "909") {
    // TR-909 Kick: Punchy attack transient with high-mid beater slap and driven saturation
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 260 * pitchMultiplier;
    const endFreq = 48;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    // Faster pitch drop for tighter punch
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.05);

    const kickVol = vel * 1.25;
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(kickVol * 0.5, time + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
    sources.push(osc);
    gains.push(gain);

    // 909 Click: dual transient burst (mid-beater slap)
    if (noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1100;
      filter.Q.value = 2.5;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(vel * 0.8, time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(dest);
      click.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + 0.03);
      sources.push(click);
      gains.push(clickGain);
    }

    return { sources, gains, stopTime: time + 0.4 };
  } else if (kit === "acoustic") {
    // Vintage Acoustic: Shell body resonance + soft beater contact
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 120 * pitchMultiplier;
    const endFreq = 54;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.07);

    const kickVol = vel * 1.1;
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.38);
    sources.push(osc);
    gains.push(gain);

    return { sources, gains, stopTime: time + 0.38 };
  } else {
    // Cyber Wave: Saturated square-sub hybrid with hyper-punch
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    const startFreq = 220 * pitchMultiplier;
    const endFreq = 40;

    osc1.type = "sine";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(startFreq, time);
    osc2.frequency.setValueAtTime(startFreq * 0.5, time);
    osc1.frequency.exponentialRampToValueAtTime(endFreq, time + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(endFreq, time + 0.06);

    gain.gain.setValueAtTime(vel * 1.3, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.48);
    osc2.stop(time + 0.48);
    sources.push(osc1, osc2);
    gains.push(gain);

    return { sources, gains, stopTime: time + 0.48 };
  }
}

/**
 * Synthesizes a Snare Drum based on the selected drum machine model
 */
export function synthesizeSnare(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const basePitch = pitchOffset > 24 ? pitchOffset - 60 : pitchOffset;
  const pitchMultiplier = Math.pow(2, basePitch / 12);
  const effectiveKit = getBaseDrumKit(kit);

  if (effectiveKit === "808") {
    // 808 Snare: Two tuned sine oscillators (180Hz & 330Hz) + soft bandpassed white noise
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(180 * pitchMultiplier, time);
    osc2.frequency.setValueAtTime(332 * pitchMultiplier, time);
    osc1.frequency.exponentialRampToValueAtTime(140, time + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(260, time + 0.08);

    oscGain.gain.setValueAtTime(vel * 0.65, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(dest);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.15);
    osc2.stop(time + 0.15);
    sources.push(osc1, osc2);
    gains.push(oscGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 1.0;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vel * 0.85, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + 0.24);
      sources.push(noise);
      gains.push(noiseGain);
    }

    return { sources, gains, stopTime: time + 0.24 };
  } else if (effectiveKit === "909") {
    // 909 Snare: Distinct body tone with sharper punch + rich snappy high-end sizzle
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220 * pitchMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(95, time + 0.07);

    oscGain.gain.setValueAtTime(vel * 0.8, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.16);
    sources.push(osc);
    gains.push(oscGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1200;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vel * 0.95, time);
      noiseGain.gain.exponentialRampToValueAtTime(vel * 0.3, time + 0.08);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + 0.3);
      sources.push(noise);
      gains.push(noiseGain);
    }

    return { sources, gains, stopTime: time + 0.3 };
  } else {
    // Acoustic / Cyber Snare: Rimshot body + wide acoustic buzz
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(190 * pitchMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.06);

    toneGain.gain.setValueAtTime(vel * 0.75, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(toneGain);
    toneGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.15);
    sources.push(osc);
    gains.push(toneGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      filter.Q.value = 1.4;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vel * 0.9, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + 0.22);
      sources.push(noise);
      gains.push(noiseGain);
    }

    return { sources, gains, stopTime: time + 0.22 };
  }
}

/**
 * Synthesizes a Hi-Hat (Closed / Open) with metallic inharmonic frequency clusters
 */
export function synthesizeHiHat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  stepVal = 1,
  stepDur = 0.125,
  gateVal = 0.8,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];

  const isOpen = stepVal === 2;
  const isRatchet = stepVal === 3;
  const baseDecay = isOpen ? Math.min(stepDur * 3.5, 0.45) : isRatchet ? Math.min(stepDur * 0.45, 0.06) : 0.065;
  const decayTime = Math.max(0.02, baseDecay * gateVal);
  const effectiveKit = getBaseDrumKit(kit);

  if (effectiveKit === "808") {
    // 808 Hi-Hat: 6 inharmonic square wave oscillators clustered together
    // Frequencies modeled from Roland TR-808 service manual:
    const inharmonicFreqs = [245, 306, 368, 412, 538, 845];
    const pitchMult = Math.pow(2, (pitchOffset > 24 ? pitchOffset - 48 : pitchOffset) / 12);

    const clusterGain = ctx.createGain();
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 7500;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 9800;
    bandpass.Q.value = 1.6;

    const envGain = ctx.createGain();
    const hatVol = vel * (isOpen ? 0.75 : 0.6);
    envGain.gain.setValueAtTime(hatVol, time);
    envGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    inharmonicFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq * pitchMult, time);
      osc.connect(clusterGain);
      osc.start(time);
      osc.stop(time + decayTime + 0.02);
      sources.push(osc);
    });

    clusterGain.gain.value = 1 / inharmonicFreqs.length;
    clusterGain.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(envGain);
    envGain.connect(dest);
    gains.push(envGain);

    return { sources, gains, stopTime: time + decayTime + 0.02 };
  } else {
    // 909 / Acoustic / Cyber: High-passed white noise with sizzle resonance
    if (!noiseBuffer) return { sources, gains, stopTime: time + 0.05 };

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = "highpass";
    hpFilter.frequency.value = effectiveKit === "909" ? 8200 : 7000;

    const peakFilter = ctx.createBiquadFilter();
    peakFilter.type = "peaking";
    peakFilter.frequency.value = 11500;
    peakFilter.Q.value = 2.0;
    peakFilter.gain.value = 5.0;

    const gain = ctx.createGain();
    const hatVol = vel * (isOpen ? 0.8 : 0.65);
    gain.gain.setValueAtTime(hatVol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    noise.connect(hpFilter);
    hpFilter.connect(peakFilter);
    peakFilter.connect(gain);
    gain.connect(dest);

    noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    noise.stop(time + decayTime + 0.02);
    sources.push(noise);
    gains.push(gain);

    return { sources, gains, stopTime: time + decayTime + 0.02 };
  }
}

/**
 * Synthesizes Percussion / Clap based on selected model
 */
export function synthesizePercussion(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const effectiveKit = getBaseDrumKit(kit);

  if (effectiveKit === "808") {
    // 808 Cowbell / Conga
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    const basePitch = pitchOffset > 24 ? pitchOffset - 48 : pitchOffset;
    const mult = Math.pow(2, basePitch / 12);
    osc1.type = "square";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(540 * mult, time);
    osc2.frequency.setValueAtTime(800 * mult, time);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 850 * mult;
    filter.Q.value = 5.0;

    gain.gain.setValueAtTime(vel * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.25);
    osc2.stop(time + 0.25);
    sources.push(osc1, osc2);
    gains.push(gain);

    return { sources, gains, stopTime: time + 0.25 };
  } else {
    // 909 Multi-burst Handclap: 3 micro-transient claps (11ms apart) followed by filtered noise reverb tail
    if (!noiseBuffer) return { sources, gains, stopTime: time + 0.05 };

    const burstDelays = [0, 0.011, 0.022];
    burstDelays.forEach((delay) => {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 2.0;

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(vel * 0.7, time + delay);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + delay + 0.012);

      click.connect(bp);
      bp.connect(clickGain);
      clickGain.connect(dest);
      click.start(time + delay, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + delay + 0.015);
      sources.push(click);
      gains.push(clickGain);
    });

    // Main clap reverb body
    const mainNoise = ctx.createBufferSource();
    mainNoise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 1.5;

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.001, time + 0.03);
    mainGain.gain.linearRampToValueAtTime(vel * 0.9, time + 0.035);
    mainGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);

    mainNoise.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(dest);
    mainNoise.start(time + 0.03, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    mainNoise.stop(time + 0.35);
    sources.push(mainNoise);
    gains.push(mainGain);

    return { sources, gains, stopTime: time + 0.35 };
  }
}
