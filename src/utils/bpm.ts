/**
 * BPM Range Parser & Matching Utility
 * Handles diverse real-world BPM annotations:
 * - Unicode en-dash '120–128 BPM', em-dash '120—128', hyphen '120-128', tilde '120~128'
 * - Single values '140 BPM'
 * - Extended annotations '65–85 BPM (130-170)'
 * - Free/variable tempo descriptions (e.g. ambient, free jazz)
 */

export interface ParsedBpmRange {
  min: number;
  max: number;
  average: number;
  isValid: boolean;
  raw: string;
}

/**
 * Parses any BPM range string into structured min, max, and average numbers
 */
export function parseBpmRange(rangeStr?: string | null): ParsedBpmRange {
  if (!rangeStr || typeof rangeStr !== "string") {
    return { min: 120, max: 120, average: 120, isValid: false, raw: "" };
  }

  const raw = rangeStr.trim();

  // Match standard numbers in the string
  const matches = raw.match(/\d+/g);

  if (!matches || matches.length === 0) {
    // Non-numeric or free tempo
    return { min: 120, max: 120, average: 120, isValid: false, raw };
  }

  const numbers = matches.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n) && n > 0 && n < 1000);

  if (numbers.length === 0) {
    return { min: 120, max: 120, average: 120, isValid: false, raw };
  }

  if (numbers.length === 1) {
    const val = numbers[0];
    return { min: val, max: val, average: val, isValid: true, raw };
  }

  // First two numbers usually represent [min, max] of the primary range
  const min = Math.min(numbers[0], numbers[1]);
  const max = Math.max(numbers[0], numbers[1]);
  const average = Math.round((min + max) / 2);

  return { min, max, average, isValid: true, raw };
}

/**
 * Checks if a specific BPM number matches or falls inside a genre's BPM range
 */
export function isBpmInRange(targetBpm: number, rangeStr: string, tolerance = 3): boolean {
  if (isNaN(targetBpm) || targetBpm <= 0) return false;

  const parsed = parseBpmRange(rangeStr);
  if (!parsed.isValid) return false;

  if (parsed.min === parsed.max) {
    return Math.abs(targetBpm - parsed.min) <= tolerance;
  }

  return targetBpm >= (parsed.min - tolerance) && targetBpm <= (parsed.max + tolerance);
}

/**
 * Calculates overlap between two BPM range strings
 */
export function getBpmOverlap(
  rangeA: string,
  rangeB: string
): { overlaps: boolean; min: number; max: number } {
  const pA = parseBpmRange(rangeA);
  const pB = parseBpmRange(rangeB);

  const overlapMin = Math.max(pA.min, pB.min);
  const overlapMax = Math.min(pA.max, pB.max);
  const overlaps = overlapMin <= overlapMax;

  return {
    overlaps,
    min: overlaps ? overlapMin : 0,
    max: overlaps ? overlapMax : 0,
  };
}
