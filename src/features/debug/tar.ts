/**
 * ⭐ **A tar writer, because both surfaces need one and neither should gain a dependency for it.**
 *
 * The archive format is `tar` compressed with gzip: one file, compressed, many entries, and reachable from node with its
 * own compressor and from a browser with `CompressionStream`. This module is the half both sides share — it is pure, so it
 * runs in either — and the compression is left to the caller, which is where the two environments differ.
 *
 * The format written is **ustar**, which every archiver reads. Names are limited to the hundred bytes ustar allows; a
 * caller with a longer name gets an error rather than a file that silently unpacks wrong.
 */
export interface TarEntry {
  /** ⭐ A relative path, with forward slashes; a leading slash is refused rather than quietly stripped. */
  name: string;
  bytes: Uint8Array;
  /** ⭐ Seconds since the epoch; the archive records when each entry was collected. */
  mtimeSeconds?: number;
}

const BLOCK = 512;
const NAME_LIMIT = 100;

const octal = (value: number, width: number): string => value.toString(8).padStart(width - 1, "0").slice(0, width - 1) + "\0";

const writeString = (block: Uint8Array, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i += 1) block[offset + i] = text.charCodeAt(i) & 0xff;
};

function header(entry: TarEntry): Uint8Array {
  if (!entry.name || entry.name.startsWith("/")) {
    throw new Error(`tar: the entry name must be relative, got ${JSON.stringify(entry.name)}`);
  }
  if (entry.name.length > NAME_LIMIT) {
    throw new Error(`tar: the entry name is longer than ${NAME_LIMIT} bytes: ${entry.name}`);
  }
  const block = new Uint8Array(BLOCK);
  writeString(block, 0, entry.name);
  writeString(block, 100, octal(0o644, 8));
  writeString(block, 108, octal(0, 8));
  writeString(block, 116, octal(0, 8));
  writeString(block, 124, octal(entry.bytes.length, 12));
  writeString(block, 136, octal(entry.mtimeSeconds ?? Math.floor(Date.now() / 1000), 12));
  // The checksum field is read as eight spaces while the sum is taken, then written in its place.
  writeString(block, 148, " ".repeat(8));
  block[156] = "0".charCodeAt(0);
  writeString(block, 257, "ustar\0");
  writeString(block, 263, "00");
  let sum = 0;
  for (const byte of block) sum += byte;
  writeString(block, 148, octal(sum, 7) + " ");
  return block;
}

const padded = (length: number): number => (length % BLOCK === 0 ? 0 : BLOCK - (length % BLOCK));

export function buildTar(entries: readonly TarEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(header(entry), entry.bytes);
    const pad = padded(entry.bytes.length);
    if (pad) parts.push(new Uint8Array(pad));
  }
  // Two empty blocks mark the end, and the whole archive is padded to a block.
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  parts.push(new Uint8Array(BLOCK * 2 + padded(BLOCK * 2)));
  parts.push(new Uint8Array(padded(total)));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** ⭐ Read back what was written, so a criterion can prove the archive is not just bytes. */
export function readTar(archive: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let at = 0;
  while (at + BLOCK <= archive.length) {
    const block = archive.subarray(at, at + BLOCK);
    if (block.every((byte) => byte === 0)) break;
    const name = new TextDecoder().decode(block.subarray(0, NAME_LIMIT)).replace(/\0.*$/, "");
    const size = parseInt(new TextDecoder().decode(block.subarray(124, 136)).replace(/\0.*$/, "").trim(), 8);
    if (!name || Number.isNaN(size)) throw new Error("tar: the header at this offset is not a ustar header");
    const from = at + BLOCK;
    entries.push({ name, bytes: archive.subarray(from, from + size) });
    at = from + size + padded(size);
  }
  return entries;
}
