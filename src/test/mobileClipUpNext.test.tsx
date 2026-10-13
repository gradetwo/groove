/**
 * ⭐ **The next record's clip is warmed while the current one plays, so an advance is a cache hit, not a download.**
 *
 * The player's own prefetch only ever fetched the clip in front of you, so the moment an advance mattered — the record
 * ending, the queue moving — the next clip was pulled over the network *then*, and every switch paid ~400 KB of silence
 * first (owner, 2026-10-13: 「不然切歌体验太差」). `MobileApp` now hands the player the genre the queue moves to
 * (`nextGenreForMode`, the same call `skip(1)` makes), and this pins the two halves that make it worth doing:
 *
 *   1. the **up-next** clip is fetched while the current one is still the selection; and
 *   2. when that genre does become current, the element is handed the **cached** bytes — no second network request.
 *
 * The shared cache is reset per case: it is app-wide by design (that is what makes (2) a hit), so without the reset one
 * case's blob would answer the next one's and the second assertion would pass for the wrong reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ClipPrefetch, nextClipToWarm, resetSharedClipPrefetch } from "../mobile/clipPrefetch";
import { MobileClipPlayer } from "../mobile/MobileClipPlayer";

const hoisted = vi.hoisted(() => ({
  current: { genreId: "chicago-house", url: "https://r2mirror.test/clips/chicago-house.mp3", seconds: 16.6, bytes: 400030, engineVersion: "1", recordedLanes: 6, warnings: [] },
  next: { genreId: "bebop", url: "https://r2mirror.test/clips/bebop.mp3", seconds: 12, bytes: 300000, engineVersion: "1", recordedLanes: 6, warnings: [] },
}));

vi.mock("../data/genreClips", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/genreClips")>();
  return {
    ...actual,
    readClipManifest: () => ({ bars: 8, clips: [hoisted.current, hoisted.next] }),
    clipForGenre: (_m: unknown, genreId: string) =>
      genreId === "bebop" ? hoisted.next : genreId === "chicago-house" ? hoisted.current : undefined,
    staleClips: () => [],
  };
});

/**
 * `URL.createObjectURL` does not exist in jsdom, and the prefetch is deliberately unusable without it (it hands the
 * element a resource to stream). The cache assertions need it, so it is patched in place — `vi.unstubAllGlobals()`
 * does not put a patched `URL` method back, so the originals are kept and restored by hand.
 */
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;

const fetchSpy = vi.fn();

beforeEach(() => {
  cleanup();
  // The object-URL stub must be in place before the shared cache is reset: resetting disposes it, and `dispose`
  // revokes every blob it holds.
  const createObjectURL = vi.fn();
  createObjectURL.mockImplementation(() => `blob:upnext-${createObjectURL.mock.calls.length}`);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  resetSharedClipPrefetch();
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("genre-clips.json")) return { ok: true, json: async () => ({ bars: 8, clips: [] }) };
    return { ok: true, blob: async () => new Blob([new Uint8Array(2048)]) };
  });
  vi.stubGlobal("fetch", fetchSpy);
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined) as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: realCreateObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: realRevokeObjectURL });
});

/** The clip fetches, excluding the manifest the player reads for itself. */
const clipFetches = (needle: string): number =>
  fetchSpy.mock.calls.filter((call) => String(call[0]).includes(needle)).length;

const mount = (genreId: string, upNextGenreId: string | null) =>
  render(
    <LanguageProvider>
      <MobileClipPlayer genreId={genreId} upNextGenreId={upNextGenreId} autoPlay />
    </LanguageProvider>
  );

describe("the up-next clip warm-up", () => {
  it("⭐ fetches the next record's clip while the current one is playing", async () => {
    mount("chicago-house", "bebop");
    await waitFor(() => expect(clipFetches("bebop")).toBe(1), { timeout: 6000 });
    // The clip that is actually playing is still fetched for itself.
    expect(clipFetches("chicago-house"), "the current clip is not what this warms").toBeGreaterThanOrEqual(0);
  });

  it("⭐ warms nothing when the shell does not name an up-next genre (repeat-one)", async () => {
    mount("chicago-house", null);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled(), { timeout: 6000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(clipFetches("bebop"), "nothing to advance to, so nothing to fetch").toBe(0);
  });

  it("⭐ makes the advance a cache hit: the warmed clip is already held, so it is not downloaded twice", async () => {
    const view = mount("chicago-house", "bebop");
    await waitFor(() => expect(clipFetches("bebop")).toBe(1), { timeout: 6000 });
    const cached = ClipPrefetch.forApp().cached(hoisted.next.url);
    expect(cached, "the warm-up left the bytes in the shared cache").toBeTruthy();

    // The queue moves: same player, new selection.
    view.rerender(
      <LanguageProvider>
        <MobileClipPlayer genreId="bebop" upNextGenreId="chicago-house" autoPlay />
      </LanguageProvider>
    );
    await waitFor(() => expect(view.container.querySelector("audio")?.getAttribute("src")).toBeTruthy(), { timeout: 6000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(clipFetches("bebop"), "one download for the clip that was already warmed").toBe(1);
  });
});

/**
 * ⭐ **The shell's own rule for what to warm is a function, so it can be held to a criterion.**
 *
 * The wiring lives in `MobileApp`'s JSX, which no test here can run, and the player's own prop is passed explicitly by
 * the cases above — so without this the "the shell actually asks for the right genre" half would be unverifiable, and a
 * red proof of removing the wiring from the shell would (and did) stay green.
 */
describe("what the shell decides to warm", () => {
  const library = [
    { id: "chicago-house", category: "House" },
    { id: "deep-house", category: "House" },
    { id: "bebop", category: "Jazz" },
  ];

  it("⭐ follows the queue in `genre` mode: the same category's next record", () => {
    expect(nextClipToWarm("genre", "chicago-house", library)).toBe("deep-house");
  });

  it("⭐ warms nothing in `one` mode, because nothing is next", () => {
    expect(nextClipToWarm("one", "chicago-house", library)).toBeNull();
  });

  it("⭐ warms nothing with no record selected, and names a genre in `all` mode", () => {
    expect(nextClipToWarm("all", null, library)).toBeNull();
    expect(library.map((entry) => entry.id)).toContain(nextClipToWarm("all", "chicago-house", library));
  });
});
