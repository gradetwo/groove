/**
 * Custom-genre resolution is injected, not imported.
 *
 * `src/data/index/loader.ts` used to import `getCustomGenre` straight out of
 * `src/features/customGenre`, which made the domain layer name a feature — the layering gate recorded
 * it as debt because the data layer's contract then included how a *feature* stores its records. The
 * dependency is real (custom genres are stored with the feature that creates them); it was simply
 * pointing the wrong way.
 *
 * Inverting it introduces one new way to lose user data quietly: if nobody answers the loader's
 * question, a user's saved custom genre stops resolving and — to them — has vanished. So the
 * behaviour is pinned in both directions: no resolver means no custom genre, and an installed
 * resolver means it resolves.
 */
import { describe, it, expect, afterEach } from "vitest";
import { invalidateGenreCache, loadGenre, setCustomGenreResolver } from "../data/index/loader";
import type { Genre } from "../types/genre";
import type { SequencerPattern } from "../types/genre";

/** The smallest thing the loader will hand back for a custom id. */
const customGenre = (id: string): Genre =>
  ({
    id,
    name: "My Custom Genre",
    category: "electronic",
    sequencer_pattern: {} as SequencerPattern,
  }) as unknown as Genre;

afterEach(() => {
  // Module state outlives a test file otherwise: a leaked resolver or a warm cache would make later
  // assertions depend on ordering, which is exactly what made the first version of the
  // throwing-resolver test read a cached genre from the test before it.
  setCustomGenreResolver(null);
  invalidateGenreCache();
});

describe("custom-genre resolution", () => {
  it("returns nothing for a custom id when nothing has answered the question", async () => {
    setCustomGenreResolver(null);
    // Not an error: a shell that does not offer custom genres simply has none. What must not happen
    // is a *throw*, which would take down the whole genre load.
    await expect(loadGenre("custom-nonexistent-id")).resolves.toBeNull();
  });

  it("resolves a custom id once the app has installed a resolver", async () => {
    setCustomGenreResolver(async (id) => (id === "custom-abc" ? customGenre(id) : null));
    const genre = await loadGenre("custom-abc");
    expect(genre?.id).toBe("custom-abc");
    expect(genre?.name).toBe("My Custom Genre");
  });

  it("never asks the resolver about a built-in genre, which is what keeps the common path free", async () => {
    let asked: string[] = [];
    setCustomGenreResolver(async (id) => {
      asked.push(id);
      return null;
    });
    const genre = await loadGenre("detroit-techno");
    expect(genre, "a built-in genre must still load").toBeTruthy();
    expect(asked).not.toContain("detroit-techno");
  });

  it("re-resolves an edited custom genre instead of serving the cached copy", async () => {
    /**
     * The cache had no eviction, and a custom genre is the one category that changes while the app
     * runs. Saving an edit and reopening it returned the pre-edit object, so the user's change looked
     * unsaved. The save path now invalidates, and this pins the mechanism it relies on.
     */
    let version = "before";
    setCustomGenreResolver(async (id) =>
      id === "custom-edit" ? { ...customGenre(id), name: version } as Genre : null
    );
    expect((await loadGenre("custom-edit"))?.name).toBe("before");

    version = "after";
    // Without invalidation the cache still answers "before".
    expect((await loadGenre("custom-edit"))?.name).toBe("before");

    invalidateGenreCache("custom-edit");
    expect((await loadGenre("custom-edit"))?.name).toBe("after");
  });

  it("survives a resolver that throws, rather than failing every genre load", async () => {
    /**
     * The resolver touches IndexedDB, which can be unavailable or blocked. A failure there must
     * degrade to "this custom genre is absent" — not to "no genre loads at all", which is how a
     * broken store becomes a blank studio.
     */
    setCustomGenreResolver(async () => {
      throw new Error("IndexedDB blocked");
    });
    await expect(loadGenre("custom-abc")).resolves.toBeNull();
    // And the ordinary path still works afterwards.
    await expect(loadGenre("detroit-techno")).resolves.toBeTruthy();
  });
});
