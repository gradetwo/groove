/**
 * The recording store on the device's own filesystem — OPFS, behind the same interface the tests already exercise.
 *
 * **It takes the directory handle rather than looking one up.** `navigator.storage.getDirectory()` is a browser call with a permission and a lifetime, and a store that reaches for it internally can only be
 * tested in a browser. Taking the handle keeps the *rules* — naming, listing, a missing file answering `undefined` — testable with a fake handle, while the one line that is genuinely browser-only stays at
 * the edge where it belongs.
 *
 * **A missing take is not an error.** `getFileHandle` throws when a name is absent, which is exactly the "bytes are gone" case the interface promises to report as `undefined`; letting the exception escape
 * would push a storage detail into every playback path.
 */
import type { RecordingStore } from "./recordingStore";

/** The subset of the OPFS handle API this store uses — narrow on purpose, so a fake is honest rather than a reimplementation. */
export interface DirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterable<string>;
}

export interface FileHandleLike {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<{ write(data: ArrayBuffer): Promise<void>; close(): Promise<void> }>;
}

/** The extension is part of the name, so a user can find their recordings if they ever look at the storage. */
const NAME = (reference: string) => `${reference}.take`;

export function createOpfsRecordingStore(root: DirectoryHandleLike): RecordingStore {
  let next = 1;

  return {
    async put(bytes) {
      // Generated, like the in-memory store: two identical recordings are two takes, and a content-derived name would merge them.
      const reference = `take-${next++}`;
      const handle = await root.getFileHandle(NAME(reference), { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return reference;
    },

    async get(reference) {
      try {
        const handle = await root.getFileHandle(NAME(reference));
        return await (await handle.getFile()).arrayBuffer();
      } catch {
        // ⭐ The state the interface promises to report, not an exception to unwind: the take exists in the arrangement and its bytes do not exist here.
        return undefined;
      }
    },

    async remove(reference) {
      // Removing something absent is a success, because the goal is the absence.
      await root.removeEntry(NAME(reference)).catch(() => undefined);
    },

    async list() {
      const references: string[] = [];
      for await (const name of root.keys()) {
        if (name.endsWith(".take")) references.push(name.slice(0, -".take".length));
      }
      return references;
    },
  };
}
