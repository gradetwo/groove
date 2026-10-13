/**
 * ⭐ **Changing records must not blank the label for as long as a cover takes to load.**
 *
 * `useLabelArt` used to `setArt(null)` the moment the genre changed and only then start loading the replacement, so the
 * artwork in the middle of the disc went empty while a network image decoded — on a phone that reads as the screen
 * flashing black between tracks, which is what was reported (owner, 2026-10-13).
 *
 * Two facts have to hold, and the second is why this is not simply "never clear it":
 *
 *   1. **a genre change keeps the previous picture up** until the new one has decoded; and
 *   2. **a genre with no cover at all goes blank** rather than leaving the *last* genre's artwork on the disc, because a
 *      wrong record label is a lie where plain paper is not.
 *
 * `Image` is stubbed with a loader the test resolves by hand, so "while the cover is still loading" is a state it can
 * actually stand in rather than a race it has to win.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLabelArt } from "../hooks/useLabelArt";

/** Every `Image` the hook constructs, so a test can finish a load when it wants to. */
const pending: Array<{ url: string; image: { onload: (() => void) | null; onerror: (() => void) | null } }> = [];
const realImage = globalThis.Image;

function installImageStub(): void {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = "";
    #src = "";
    set src(value: string) {
      this.#src = value;
      pending.push({ url: value, image: this as unknown as { onload: (() => void) | null; onerror: (() => void) | null } });
    }
    get src(): string {
      return this.#src;
    }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: StubImage });
}

/** Finish the load for one URL, which is the moment the label may change. */
function resolve(url: string): void {
  const entry = pending.find((candidate) => candidate.url === url);
  if (!entry) throw new Error(`nothing is loading ${url}; pending: ${pending.map((p) => p.url).join(", ")}`);
  act(() => entry.image.onload?.());
}

/**
 * The URL the hook actually reached for this genre.
 *
 * Matched by the genre's filename rather than against `genreCoverCandidates`, because the candidate list is
 * **skin-prefixed** when a skin is active (`/covers/default/…`) and the no-skin helper only returns the shared list.
 */
function loadingFor(genreId: string): string {
  const entry = pending.find(
    (candidate) => candidate.url.startsWith("/covers/") && candidate.url.endsWith(`/${genreId}.jpg`)
  );
  if (!entry) throw new Error(`nothing is loading for ${genreId}; pending: ${pending.map((p) => p.url).join(", ")}`);
  return entry.url;
}

/**
 * Fail every candidate for this genre — the "no cover at all" path.
 *
 * Drained rather than swept once: the hook's fallback chain starts the *shared* candidate only after the skin's has
 * failed, so a single pass over what is pending would leave the second attempt in flight and the disc would still be
 * showing the previous label.
 */
function failAllFor(genreId: string): void {
  let failedSomething = true;
  while (failedSomething) {
    failedSomething = false;
    for (const entry of pending.filter((candidate) => candidate.url.endsWith(`/${genreId}.jpg`))) {
      if (!entry.image.onerror) continue;
      const onerror = entry.image.onerror;
      entry.image.onerror = null;
      act(() => onerror());
      failedSomething = true;
    }
  }
}

/**
 * Each case uses its own genre ids: the decoded-cover cache is module-level (that is the point of it), so sharing an id
 * between cases would make one case's warm cache answer another's and the assertions would stop meaning anything.
 */
beforeEach(() => {
  pending.length = 0;
  installImageStub();
});
afterEach(() => {
  Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: realImage });
});

describe("the record's label while a cover loads", () => {
  it("⭐ keeps the previous artwork up until the new genre's cover has decoded", () => {
    const { result, rerender } = renderHook(({ genreId }) => useLabelArt(genreId), {
      initialProps: { genreId: "label-a-first" },
    });

    expect(result.current, "nothing has decoded yet").toBeNull();
    const first = loadingFor("label-a-first");
    resolve(first);
    expect(result.current?.key, "the first record's label is on the disc").toBe(first);

    // Change records: a fresh load starts, and the disc must not go blank while it runs.
    rerender({ genreId: "label-a-second" });
    expect(result.current?.key, "the previous label stays up rather than clearing").toBe(first);

    const second = loadingFor("label-a-second");
    resolve(second);
    expect(result.current?.key, "and the new cover takes over once it has decoded").toBe(second);
  });

  it("⭐ a genre with no cover at all goes blank rather than keeping the last genre's artwork", () => {
    const { result, rerender } = renderHook(({ genreId }) => useLabelArt(genreId), {
      initialProps: { genreId: "label-b-first" },
    });
    resolve(loadingFor("label-b-first"));
    expect(result.current).not.toBeNull();

    rerender({ genreId: "label-b-nocover" });
    failAllFor("label-b-nocover");
    expect(result.current, "a wrong label is worse than plain paper").toBeNull();
  });

  it("⭐ a cover already decoded is handed back without a second load", () => {
    const { result, rerender } = renderHook(({ genreId }) => useLabelArt(genreId), {
      initialProps: { genreId: "label-c-first" },
    });
    const first = loadingFor("label-c-first");
    resolve(first);
    expect(result.current?.key).toBe(first);

    rerender({ genreId: "label-c-second" });
    const second = loadingFor("label-c-second");
    resolve(second);

    // Back to the first record: its image is already decoded, so no new load may be started for it.
    pending.length = 0;
    rerender({ genreId: "label-c-first" });
    expect(result.current?.key, "the cached picture is shown immediately").toBe(first);
    expect(pending, "and nothing is re-fetched").toHaveLength(0);
  });
});
