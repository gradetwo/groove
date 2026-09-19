/**
 * Acoustic & DSP Analysis Utilities (P6-05)
 *
 * Provides high-performance, unit-testable mathematical functions for:
 * 1. Pearson Phase Correlation Coefficient (-1.0 to +1.0)
 * 2. Mid/Side Stereo Width & Balance calculation
 * 3. Logarithmic frequency-to-coordinate mapping (20Hz - 20kHz)
 * 4. Frequency-to-Musical-Note pitch detection
 * 5. Audio frequency bands taxonomy
 * 6. Oscilloscope zero-crossing synchronization
 */

export interface FrequencyBandInfo {
  bandId: string;
  nameZh: string;
  nameEn: string;
  rangeZh: string;
  rangeEn: string;
  minFreq: number;
  maxFreq: number;
  color: string;
  descriptionZh: string;
  descriptionEn: string;
}

export const FREQUENCY_BANDS: FrequencyBandInfo[] = [
  {
    bandId: "sub_bass",
    nameZh: "极低频 (Sub-Bass)",
    nameEn: "Sub-Bass",
    rangeZh: "20 - 60 Hz",
    rangeEn: "20 - 60 Hz",
    minFreq: 20,
    maxFreq: 60,
    color: "#ef4444",
    descriptionZh: "主要为身体感官震颤区（如 808 极深底频），通常保持单声道居中以防相位抵消。",
    descriptionEn: "Physical vibration zone (e.g. 808 sub-bass), usually kept in mono center to avoid phase cancellation.",
  },
  {
    bandId: "bass",
    nameZh: "低频 (Bass)",
    nameEn: "Bass",
    rangeZh: "60 - 250 Hz",
    rangeEn: "60 - 250 Hz",
    minFreq: 60,
    maxFreq: 250,
    color: "#f59e0b",
    descriptionZh: "节奏骨架与底鼓击打核心（Kick Thump & Bassline 根音），决定律动的厚度与冲击力。",
    descriptionEn: "Rhythmic foundation and kick thump core, dictating groove weight and punch.",
  },
  {
    bandId: "low_mid",
    nameZh: "中低频 (Low-Mids)",
    nameEn: "Low-Mids",
    rangeZh: "250 - 500 Hz",
    rangeEn: "250 - 500 Hz",
    minFreq: 250,
    maxFreq: 500,
    color: "#eab308",
    descriptionZh: "军鼓箱体共鸣、贝斯泛音与垫乐厚度，过多容易导致混音浑浊（Muddy）。",
    descriptionEn: "Snare body resonance, bass harmonics and pad warmth; excessive energy causes muddiness.",
  },
  {
    bandId: "mid",
    nameZh: "中频 (Mids)",
    nameEn: "Mids",
    rangeZh: "500 - 2000 Hz",
    rangeEn: "500 - 2000 Hz",
    minFreq: 500,
    maxFreq: 2000,
    color: "#10b981",
    descriptionZh: "人耳听觉最敏锐区域，和弦铺底、主音旋律与打击乐击打质感的核心投射区。",
    descriptionEn: "Human hearing sweet spot; core projection for chord textures, lead lines, and percussion snap.",
  },
  {
    bandId: "high_mid",
    nameZh: "中高频 (High-Mids)",
    nameEn: "High-Mids",
    rangeZh: "2 - 4 kHz",
    rangeEn: "2 - 4 kHz",
    minFreq: 2000,
    maxFreq: 4000,
    color: "#06b6d4",
    descriptionZh: "镲片开裂声、军鼓 Crack 敲击感与吉他扫弦清晰度，赋予音轨穿透力（Attack）。",
    descriptionEn: "Cymbal attack, snare crack, and guitar pick transient clarity; provides bite and presence.",
  },
  {
    bandId: "presence",
    nameZh: "临场频 (Presence)",
    nameEn: "Presence",
    rangeZh: "4 - 6 kHz",
    rangeEn: "4 - 6 kHz",
    minFreq: 4000,
    maxFreq: 6000,
    color: "#3b82f6",
    descriptionZh: "声音清晰度与近距离亲密感，立体声边缘轮廓感的重要来源。",
    descriptionEn: "Acoustic definition and intimacy; key to stereo separation and edge definition.",
  },
  {
    bandId: "air",
    nameZh: "超高空气感 (Air / Brilliance)",
    nameEn: "Air / Brilliance",
    rangeZh: "6 - 20 kHz",
    rangeEn: "6 - 20 kHz",
    minFreq: 6000,
    maxFreq: 20000,
    color: "#a855f7",
    descriptionZh: "踩镲泛音、混响气流尾音与开阔开阔度，赋予现代舞曲顶级呼吸感与光泽度。",
    descriptionEn: "Hi-hat sizzle, reverb tail sheen and wide acoustic breath; brings modern sparkle and open air.",
  },
];

/**
 * Calculates Pearson Phase Correlation Coefficient between Left and Right channels:
 * r = Sum(L * R) / sqrt(Sum(L^2) * Sum(R^2))
 * Returns value in range [-1.0, 1.0].
 * - +1.0: Pure Mono (completely in-phase)
 * - 0.0: Uncorrelated stereo
 * - -1.0: Out of phase (180 deg anti-phase, complete mono cancellation!)
 */
export function calculatePhaseCorrelation(
  leftData: Float32Array | Uint8Array,
  rightData: Float32Array | Uint8Array
): number {
  const len = Math.min(leftData.length, rightData.length);
  if (len === 0) return 1.0;

  let sumLR = 0;
  let sumL2 = 0;
  let sumR2 = 0;

  const isByteL = leftData instanceof Uint8Array;
  const isByteR = rightData instanceof Uint8Array;

  for (let i = 0; i < len; i++) {
    const l = isByteL ? (leftData[i] - 128) / 128 : leftData[i];
    const r = isByteR ? (rightData[i] - 128) / 128 : rightData[i];

    sumLR += l * r;
    sumL2 += l * l;
    sumR2 += r * r;
  }

  const denominator = Math.sqrt(sumL2 * sumR2);
  if (denominator < 1e-6) {
    return 1.0;
  }

  const r = sumLR / denominator;
  return Math.max(-1.0, Math.min(1.0, r));
}

/**
 * Calculates Stereo Mid/Side Width and Balance:
 * Mid = (L + R) / sqrt(2)
 * Side = (L - R) / sqrt(2)
 * Stereo Width = Side_RMS / (Mid_RMS + Side_RMS) * 100%
 */
export function calculateStereoWidth(
  leftData: Float32Array | Uint8Array,
  rightData: Float32Array | Uint8Array
): {
  width: number;       // 0 (pure mono) to 100% (pure side)
  balance: number;     // -1 (full left) to +1 (full right)
  rmsL: number;
  rmsR: number;
  midRms: number;
  sideRms: number;
} {
  const len = Math.min(leftData.length, rightData.length);
  if (len === 0) {
    return { width: 0, balance: 0, rmsL: 0, rmsR: 0, midRms: 0, sideRms: 0 };
  }

  const isByteL = leftData instanceof Uint8Array;
  const isByteR = rightData instanceof Uint8Array;

  let sumL2 = 0;
  let sumR2 = 0;
  let sumMid2 = 0;
  let sumSide2 = 0;

  const sqrt2 = Math.SQRT2;

  for (let i = 0; i < len; i++) {
    const l = isByteL ? (leftData[i] - 128) / 128 : leftData[i];
    const r = isByteR ? (rightData[i] - 128) / 128 : rightData[i];

    sumL2 += l * l;
    sumR2 += r * r;

    const mid = (l + r) / sqrt2;
    const side = (l - r) / sqrt2;

    sumMid2 += mid * mid;
    sumSide2 += side * side;
  }

  const rmsL = Math.sqrt(sumL2 / len);
  const rmsR = Math.sqrt(sumR2 / len);
  const midRms = Math.sqrt(sumMid2 / len);
  const sideRms = Math.sqrt(sumSide2 / len);

  const total = midRms + sideRms;
  const width = total > 1e-5 ? (sideRms / total) * 100 : 0;

  const totalLR = rmsL + rmsR;
  const balance = totalLR > 1e-5 ? (rmsR - rmsL) / totalLR : 0;

  return {
    width: Math.round(width * 10) / 10,
    balance: Math.round(balance * 100) / 100,
    rmsL,
    rmsR,
    midRms,
    sideRms,
  };
}

/**
 * Logarithmic mapping from frequency (Hz) to screen X coordinate (pixels)
 */
export function frequencyToX(
  freq: number,
  minFreq = 20,
  maxFreq = 20000,
  width = 800
): number {
  const clamped = Math.max(minFreq, Math.min(maxFreq, freq));
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const fraction = (Math.log10(clamped) - logMin) / (logMax - logMin);
  return fraction * width;
}

/**
 * Inverse mapping from screen X coordinate to frequency (Hz)
 */
export function xToFrequency(
  x: number,
  minFreq = 20,
  maxFreq = 20000,
  width = 800
): number {
  const fraction = Math.max(0, Math.min(1, x / width));
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logFreq = logMin + fraction * (logMax - logMin);
  return Math.pow(10, logFreq);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Converts frequency in Hz to musical note name, octave, and cents deviation
 * Based on standard equal temperament A4 = 440Hz
 */
export function frequencyToNoteName(freq: number): {
  note: string;
  octave: number;
  cents: number;
  fullNote: string;
} {
  if (freq <= 0 || isNaN(freq)) {
    return { note: "-", octave: 0, cents: 0, fullNote: "-" };
  }

  const midiExact = 69 + 12 * (Math.log(freq / 440) / Math.LN2);
  const midiRounded = Math.round(midiExact);
  const cents = Math.round((midiExact - midiRounded) * 100);

  const noteIdx = ((midiRounded % 12) + 12) % 12;
  const octave = Math.floor(midiRounded / 12) - 1;
  const note = NOTE_NAMES[noteIdx];
  const centsSign = cents > 0 ? `+${cents}¢` : cents < 0 ? `${cents}¢` : "0¢";
  const fullNote = `${note}${octave} (${centsSign})`;

  return {
    note,
    octave,
    cents,
    fullNote,
  };
}

/**
 * Identifies which frequency band a given frequency falls into
 */
export function getFrequencyBandInfo(freq: number): FrequencyBandInfo {
  for (const band of FREQUENCY_BANDS) {
    if (freq >= band.minFreq && freq <= band.maxFreq) {
      return band;
    }
  }
  if (freq < FREQUENCY_BANDS[0].minFreq) {
    return FREQUENCY_BANDS[0];
  }
  return FREQUENCY_BANDS[FREQUENCY_BANDS.length - 1];
}

/**
 * Finds the index of the first upward zero-crossing in a time-domain buffer
 * Used for rock-steady oscilloscope waveform synchronization
 */
export function findZeroCrossing(buffer: Float32Array | Uint8Array): number {
  const len = buffer.length;
  if (len < 2) return 0;

  const isByte = buffer instanceof Uint8Array;
  const threshold = isByte ? 128 : 0;
  const searchLimit = Math.min(len - 1, 256);

  for (let i = 1; i < searchLimit; i++) {
    const prev = buffer[i - 1];
    const curr = buffer[i];

    if (prev <= threshold && curr > threshold) {
      return i;
    }
  }

  return 0;
}
