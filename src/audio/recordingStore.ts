/**
 * Where a recorded take's bytes live — **on the device, behind an interface**, because the owner chose local-only storage.
 *
 * Three decisions, each with a reason that outlives the current implementation:
 *
 *   * **the mechanism is injected.** A memory store makes every rule testable without a browser, and the OPFS/IndexedDB implementation becomes replaceable rather than load-bearing — the same seam the
 *     decoder, the SFZ reader and the catalogue runtime already use;
 *   * **a take's reference is a local id, not a manifest `assetId`.** Those are different kinds of thing: an `assetId` names content that a manifest can verify byte for byte, while this names a user's
 *     recording that exists on one device and nowhere else. Conflating them would invite a code path that tries to fetch a user's take from a CDN;
 *   * **`get` answers `undefined` for an unknown reference rather than throwing.** A take whose bytes are gone — evicted storage, a cleared browser — is a state a session has to survive and report, not
 *     an exception to unwind through a playback path.
 */
export interface RecordingStore {
  /** Store bytes and return the reference to put on the take. */
  put(bytes: ArrayBuffer): Promise<string>;
  get(reference: string): Promise<ArrayBuffer | undefined>;
  remove(reference: string): Promise<void>;
  /** Every reference currently held, so a session can tell "this take's bytes are missing" before it tries to play it. */
  list(): Promise<string[]>;
}

/** The in-memory implementation: what tests use, and a working fallback where persistent storage is unavailable. */
export function createMemoryRecordingStore(): RecordingStore {
  const held = new Map<string, ArrayBuffer>();
  let next = 1;
  return {
    async put(bytes) {
      // Ids are generated rather than derived from content: two identical recordings are two takes, and a content hash would silently merge them.
      const reference = `take-${next++}`;
      held.set(reference, bytes);
      return reference;
    },
    async get(reference) {
      return held.get(reference);
    },
    async remove(reference) {
      held.delete(reference);
    },
    async list() {
      return [...held.keys()];
    },
  };
}
