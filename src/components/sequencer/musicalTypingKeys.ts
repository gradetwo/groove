/**
 * Logic's QWERTY Musical Typing layout, in one place.
 *
 * It lived inside the v1 studio's musical-typing modal, and the v2 arrangement needs the same layout — but **the layout is the knowledge**, not the surface: two copies of a key map drift the moment one of them gains a key, and a person who learned `a`–`;`
 * in one place would find it moved in the other.
 */
export interface KeyDef {
  key: string;
  offset: number; // semitone offset from baseMidi
  isBlack: boolean;
}

export const WHITE_KEYS: KeyDef[] = [
  { key: "a", offset: 0, isBlack: false },
  { key: "s", offset: 2, isBlack: false },
  { key: "d", offset: 4, isBlack: false },
  { key: "f", offset: 5, isBlack: false },
  { key: "g", offset: 7, isBlack: false },
  { key: "h", offset: 9, isBlack: false },
  { key: "j", offset: 11, isBlack: false },
  { key: "k", offset: 12, isBlack: false },
  { key: "l", offset: 14, isBlack: false },
  { key: ";", offset: 16, isBlack: false },
  { key: "'", offset: 17, isBlack: false },
  { key: "", offset: 19, isBlack: false },
  { key: "", offset: 21, isBlack: false },
  { key: "", offset: 23, isBlack: false },
  { key: "", offset: 24, isBlack: false },
];

export const BLACK_KEYS: Array<KeyDef & { boundaryIndex: number; leftPercent: number }> = [
  { key: "w", offset: 1, isBlack: true, boundaryIndex: 1, leftPercent: (1 / 15) * 100 },
  { key: "e", offset: 3, isBlack: true, boundaryIndex: 2, leftPercent: (2 / 15) * 100 },
  // no key between E and F (boundary 3)
  { key: "t", offset: 6, isBlack: true, boundaryIndex: 4, leftPercent: (4 / 15) * 100 },
  { key: "y", offset: 8, isBlack: true, boundaryIndex: 5, leftPercent: (5 / 15) * 100 },
  { key: "u", offset: 10, isBlack: true, boundaryIndex: 6, leftPercent: (6 / 15) * 100 },
  // no key between B and C (boundary 7)
  { key: "o", offset: 13, isBlack: true, boundaryIndex: 8, leftPercent: (8 / 15) * 100 },
  { key: "p", offset: 15, isBlack: true, boundaryIndex: 9, leftPercent: (9 / 15) * 100 },
  // no key between E and F (boundary 10)
  { key: "", offset: 18, isBlack: true, boundaryIndex: 11, leftPercent: (11 / 15) * 100 },
  { key: "", offset: 20, isBlack: true, boundaryIndex: 12, leftPercent: (12 / 15) * 100 },
  { key: "", offset: 22, isBlack: true, boundaryIndex: 13, leftPercent: (13 / 15) * 100 },
];
