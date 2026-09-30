/**
 * The custom-genre store, and the two places it can live.
 *
 * The feature used to open `window.indexedDB` itself, which is the whole reason an MCP agent could not save a genre:
 * the server is a Node process and Node has no `indexedDB`. The store now sits behind `CustomGenreStore`, and this
 * file holds both implementations to **one** contract, so "usable from Node" means the same five operations behaving
 * the same way rather than a second implementation that agrees by accident.
 *
 * `fake-indexeddb/auto` is imported before the feature, so when the feature module asks its environment whether
 * IndexedDB exists the answer is yes — which is the browser-like case the selection below is checked against.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import {
  IndexedDbCustomGenreStore,
  createBlankCustomGenre,
  createCustomGenreStore,
  customGenreStore,
  deleteCustomGenre,
  getAllCustomGenres,
  saveCustomGenre,
} from "../features/customGenre/customGenreDb";
import { InMemoryCustomGenreStore, type CustomGenreStore } from "../features/customGenre/customGenreStore";

/**
 * The contract every store keeps, run once per implementation.
 *
 * `reset` is how the IndexedDB case gets an empty database per test: `fake-indexeddb` keeps its data on the factory,
 * so replacing the factory is the equivalent of a fresh browser profile. The in-memory store needs no reset because
 * the factory below builds a new one for each test.
 */
function satisfiesTheStoreContract(label: string, make: () => CustomGenreStore, reset: () => void = () => {}): void {
  describe(`${label} satisfies the custom-genre store contract`, () => {
    let store: CustomGenreStore;

    beforeEach(() => {
      reset();
      store = make();
    });

    it("saves a genre and reads it back by id", async () => {
      const genre = createBlankCustomGenre("Store Readback", "Electronic");
      await store.save(genre);

      const read = await store.get(genre.id);
      expect(read?.name).toBe("Store Readback");
      expect(read?.isCustom).toBe(true);
      expect(read?.sequencer_pattern.tracks).toHaveLength(8);
      // The store owns the timestamp, so a record read back was stamped no earlier than the object handed in.
      expect(read?.updatedAt).toBeGreaterThanOrEqual(genre.updatedAt);
    });

    it("saving the same id twice replaces rather than duplicates", async () => {
      const genre = createBlankCustomGenre("Store Replace", "Electronic");
      await store.save(genre);
      await store.save({ ...genre, name: "Store Replace Renamed", default_bpm: 150 });

      const all = await store.list();
      expect(all.filter((row) => row.id === genre.id)).toHaveLength(1);
      expect((await store.get(genre.id))?.name).toBe("Store Replace Renamed");
      expect((await store.get(genre.id))?.default_bpm).toBe(150);
    });

    it("lists newest first, which is the order the maker shows", async () => {
      const older = createBlankCustomGenre("Store Older", "Electronic");
      await store.save(older);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = createBlankCustomGenre("Store Newer", "Electronic");
      await store.save(newer);

      const ids = (await store.list()).map((row) => row.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    });

    it("answers null for an id that was never saved, rather than throwing", async () => {
      expect(await store.get("custom-never-saved-0000")).toBeNull();
    });

    it("deletes a genre, and reading it afterwards answers null", async () => {
      const doomed = createBlankCustomGenre("Store Doomed", "Electronic");
      await store.save(doomed);
      await store.remove(doomed.id);
      expect(await store.get(doomed.id)).toBeNull();
      expect((await store.list()).some((row) => row.id === doomed.id)).toBe(false);
    });

    it("duplicates under a new id and name, leaving the original in place", async () => {
      const original = createBlankCustomGenre("Store Original", "Electronic");
      await store.save(original);

      const copy = await store.duplicate(original.id);
      expect(copy).not.toBeNull();
      expect(copy?.id).not.toBe(original.id);
      expect(copy?.name).toBe("Store Original (Copy)");
      expect(copy?.sequencer_pattern.tracks).toHaveLength(8);
      // The original survives, which is the point of duplicating rather than renaming.
      expect((await store.get(original.id))?.name).toBe("Store Original");
      expect(await store.duplicate("custom-never-saved-0000")).toBeNull();
    });
  });
}

satisfiesTheStoreContract("the in-memory store", () => new InMemoryCustomGenreStore());
satisfiesTheStoreContract(
  "the IndexedDB store",
  () => new IndexedDbCustomGenreStore(),
  () => {
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  }
);

describe("choosing the implementation for the environment", () => {
  beforeEach(() => {
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("selects IndexedDB when the environment has it, which is the browser case", () => {
    expect(createCustomGenreStore(true)).toBeInstanceOf(IndexedDbCustomGenreStore);
    // The module's own store is that one, because this file installed a fake IndexedDB before importing the feature.
    expect(customGenreStore()).toBeInstanceOf(IndexedDbCustomGenreStore);
  });

  it("selects the in-memory store when the environment has no indexedDB, which is the Node case", () => {
    expect(createCustomGenreStore(false)).toBeInstanceOf(InMemoryCustomGenreStore);
  });

  it("keeps the feature's own functions working through the browser store", async () => {
    // The UI did not change: `useCustomGenres` still calls these five functions, and under a fake IndexedDB they
    // still round-trip through the real IndexedDB implementation rather than the in-memory fallback.
    const genre = createBlankCustomGenre("Wrapper Round Trip", "Electronic");
    await saveCustomGenre(genre);
    expect((await getAllCustomGenres()).some((row) => row.id === genre.id)).toBe(true);
    await deleteCustomGenre(genre.id);
    expect((await getAllCustomGenres()).some((row) => row.id === genre.id)).toBe(false);
  });
});
