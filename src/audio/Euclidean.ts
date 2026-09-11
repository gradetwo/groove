/**
 * Euclidean Rhythm Generator based on the Bjorklund Algorithm
 * Uniformly distributes K pulses across N steps to generate classic world/electronic rhythms.
 */

export function generateEuclidean(totalSteps: number, pulses: number, rotation: number = 0): number[] {
  const n = Math.max(1, Math.floor(totalSteps));
  const k = Math.max(0, Math.min(n, Math.floor(pulses)));

  if (k === 0) return new Array(n).fill(0);
  if (k === n) return new Array(n).fill(1);

  // Initialize groups of 1s and remainders of 0s
  let groups: number[][] = Array.from({ length: k }, () => [1]);
  let remainders: number[][] = Array.from({ length: n - k }, () => [0]);

  // Iteratively distribute remainders into groups
  while (remainders.length > 1) {
    const minLen = Math.min(groups.length, remainders.length);
    const newGroups: number[][] = [];

    for (let i = 0; i < minLen; i++) {
      newGroups.push([...groups[i], ...remainders[i]]);
    }

    const newRemainders: number[][] = [];
    if (groups.length > remainders.length) {
      for (let i = minLen; i < groups.length; i++) {
        newRemainders.push(groups[i]);
      }
    } else {
      for (let i = minLen; i < remainders.length; i++) {
        newRemainders.push(remainders[i]);
      }
    }

    groups = newGroups;
    remainders = newRemainders;
  }

  // Flatten the result: combine remaining groups and remainders
  const pattern = [...groups, ...remainders].flat();

  // Apply rotation
  if (rotation !== 0) {
    const rot = ((rotation % n) + n) % n;
    const rotated = new Array(n);
    for (let i = 0; i < n; i++) {
      rotated[(i + rot) % n] = pattern[i];
    }
    return rotated;
  }

  return pattern;
}

/**
 * Common notable Euclidean musical rhythms
 */
export const EUCLIDEAN_PRESETS = [
  { name: { zh: "Tresillo (3/8 古巴经典)", en: "Tresillo (3 in 8)" }, n: 8, k: 3, rot: 0 },
  { name: { zh: "Cinquillo (5/8 爵士/伦巴)", en: "Cinquillo (5 in 8)" }, n: 8, k: 5, rot: 0 },
  { name: { zh: "Bossa Nova (5/16 波萨诺瓦)", en: "Bossa Nova (5 in 16)" }, n: 16, k: 5, rot: 0 },
  { name: { zh: "Samba (7/16 桑巴)", en: "Samba (7 in 16)" }, n: 16, k: 7, rot: 0 },
  { name: { zh: "Four-on-Floor (4/16 正拍底鼓)", en: "Four on Floor (4 in 16)" }, n: 16, k: 4, rot: 0 },
  { name: { zh: "Offbeat Hat (8/16 反拍踩镲)", en: "Offbeat Hat (8 in 16)" }, n: 16, k: 8, rot: 1 },
  { name: { zh: "Afrobeat (9/16 非洲律动)", en: "Afrobeat (9 in 16)" }, n: 16, k: 9, rot: 0 },
  { name: { zh: "DnB Break (11/16 鼓打贝斯)", en: "DnB Break (11 in 16)" }, n: 16, k: 11, rot: 2 },
];
