/**
 * How to cut a song into renderable pieces (fifth report, P0).
 *
 * `render_song` cannot report progress because a song reaches Node as **one** flattened pattern and the wall time is spent inside the page's
 * `OfflineAudioContext.startRendering()`, which offers no callback. The only way to see the middle of a render is to ask for **smaller renders**, and that needs
 * one thing to be exactly right — the bar ranges must cover the song **once**, in order, with no gap and no overlap, because a missing bar is silence and a
 * repeated bar is a stutter that neither the exporter nor the listener can attribute to anything.
 *
 * Two preferences shape the cuts. Chunks stay **at or under** the cap the exporter accepts (`WavExporter.ts:296`, 64 bars), and they prefer to end where a
 * **section** ends, so a chunk is usually whole sections rather than a slice through one. A section longer than the cap is split at the cap, because the cap is
 * a hard limit and the boundary is a preference.
 *
 * This plans; it does not render, so it can be proved without a browser — which is the only reason the off-by-one errors live here rather than in a probe that
 * takes twenty minutes to tell you about them.
 */
export interface RenderChunk {
  /** Inclusive. */
  fromBar: number;
  /** Exclusive, so `toBar - fromBar` is the chunk's length. */
  toBar: number;
}

export function planRenderChunks(totalBars: number, boundaries: readonly number[] = [], maxBars = 64): RenderChunk[] {
  const total = Math.max(0, Math.floor(totalBars));
  if (total === 0) return [];
  const cap = Math.max(1, Math.floor(maxBars));

  // Section starts strictly inside the song: 0 and `total` are the song's own edges and are added as cuts below.
  const inside = [...new Set(boundaries.map((bar) => Math.floor(bar)).filter((bar) => bar > 0 && bar < total))].sort((a, b) => a - b);

  const chunks: RenderChunk[] = [];
  let from = 0;
  for (const cut of [...inside, total]) {
    // A section longer than the cap is cut at the cap; the boundary stays a preference rather than a constraint.
    while (cut - from > cap) {
      chunks.push({ fromBar: from, toBar: from + cap });
      from += cap;
    }
    if (cut > from) {
      chunks.push({ fromBar: from, toBar: cut });
      from = cut;
    }
  }
  return chunks;
}
