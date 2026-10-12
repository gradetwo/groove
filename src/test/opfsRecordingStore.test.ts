import { describe, expect, it } from "vitest";
import { createOpfsRecordingStore, type DirectoryHandleLike, type FileHandleLike } from "../audio/opfsRecordingStore";

/**
 * The browser store's rules, tested against a **fake directory handle** rather than a browser.
 *
 * The one line that is genuinely browser-only — `navigator.storage.getDirectory()` — stays outside this module, which is what makes the rest checkable here. What is checked is the part that could be wrong
 * in a way a user would feel: whether a recording survives a round trip, whether a *missing* one is reported rather than thrown, and whether two identical recordings stay two takes.
 */
function fakeDirectory(): DirectoryHandleLike & { names(): string[] } {
  const files = new Map<string, ArrayBuffer>();
  return {
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create) throw new Error(`NotFoundError: ${name}`);
      if (!files.has(name)) files.set(name, new ArrayBuffer(0));
      const handle: FileHandleLike = {
        async getFile() {
          return { arrayBuffer: async () => files.get(name)! };
        },
        async createWritable() {
          let pending = new ArrayBuffer(0);
          return {
            async write(data) {
              pending = data;
            },
            async close() {
              files.set(name, pending);
            },
          };
        },
      };
      return handle;
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new Error(`NotFoundError: ${name}`);
    },
    async *keys() {
      for (const name of files.keys()) yield name;
    },
    names: () => [...files.keys()],
  };
}

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("the OPFS recording store", () => {
  it("writes, reads back and lists a take, under a name a user could find", async () => {
    const root = fakeDirectory();
    const store = createOpfsRecordingStore(root);
    const reference = await store.put(bytes("a take"));
    expect(await new Response(await store.get(reference)).text()).toBe("a take");
    // The extension is deliberate: the recordings are on the user's device, and a bare id would be unidentifiable if they ever look.
    expect(root.names()).toEqual([`${reference}.take`]);
    expect(await store.list()).toEqual([reference]);
  });

  it("reports a missing take as undefined instead of letting the storage error escape", async () => {
    const store = createOpfsRecordingStore(fakeDirectory());
    // `getFileHandle` throws for an absent name; letting that through would push a storage detail into every playback path.
    await expect(store.get("take-42")).resolves.toBeUndefined();
  });

  it("keeps two identical recordings apart and removes each independently", async () => {
    const store = createOpfsRecordingStore(fakeDirectory());
    const first = await store.put(bytes("same"));
    const second = await store.put(bytes("same"));
    expect(first).not.toBe(second);
    await store.remove(first);
    expect(await store.list()).toEqual([second]);
    // Removing something absent is a success: the goal is the absence.
    await expect(store.remove(first)).resolves.toBeUndefined();
  });
});
