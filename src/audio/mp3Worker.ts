/**
 * Dedicated Web Worker for MP3 encoding.
 *
 * Runs the compute-intensive LAME encoder in a separate background thread:
 * - Completely frees the browser main thread (0% CPU impact on UI/animations)
 * - Eliminates event loop yield delays (no setTimeout clamping overhead)
 * - Reports non-blocking progress every 32 blocks (~830ms of audio)
 */

self.onmessage = async (e: MessageEvent) => {
  const { leftBuffer, rightBuffer, sampleRate, bitrateKbps } = e.data;
  const left = new Int16Array(leftBuffer);
  const right = new Int16Array(rightBuffer);

  try {
    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const encoder = new Mp3Encoder(2, sampleRate, bitrateKbps);
    const BLOCK_SIZE = 1152;
    const chunks: ArrayBuffer[] = [];
    const totalBlocks = Math.ceil(left.length / BLOCK_SIZE);
    let blockIndex = 0;

    for (let offset = 0; offset < left.length; offset += BLOCK_SIZE) {
      const encoded = encoder.encodeBuffer(
        left.subarray(offset, offset + BLOCK_SIZE),
        right.subarray(offset, offset + BLOCK_SIZE)
      );
      if (encoded.length > 0) {
        const u8 = new Uint8Array(encoded);
        chunks.push(u8.buffer);
      }
      blockIndex++;
      if (blockIndex % 32 === 0 || blockIndex === totalBlocks) {
        self.postMessage({
          type: "PROGRESS",
          fraction: Math.min(1, (offset + BLOCK_SIZE) / left.length),
        });
      }
    }

    const tail = encoder.flush();
    if (tail.length > 0) {
      const u8 = new Uint8Array(tail);
      chunks.push(u8.buffer);
    }

    (self as any).postMessage({ type: "DONE", chunks }, chunks);
  } catch (err: any) {
    self.postMessage({ type: "ERROR", error: String(err?.message || err) });
  }
};
