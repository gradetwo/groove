import { describe, expect, it } from "vitest";
import { createMemoryRecordingStore } from "../audio/recordingStore";

/**
 * The store's contract, and the one property that matters more than the rest: **a missing take is a state, not an exception.**
 *
 * Recordings live on one device, so bytes can genuinely be gone — evicted storage, a cleared browser. A playback path that throws on that cannot report it, and a session that cannot report it shows a silent
 * track with nothing on screen to explain it.
 */
const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("the recording store", () => {
  it("returns the same bytes it was given, under a reference the take can hold", async () => {
    const store = createMemoryRecordingStore();
    const reference = await store.put(bytes("a take"));
    expect(reference).toMatch(/^take-\d+$/);
    const back = await store.get(reference);
    expect(new TextDecoder().decode(back!)).toBe("a take");
  });

  it("keeps two identical recordings apart, because two takes are two takes", async () => {
    const store = createMemoryRecordingStore();
    const first = await store.put(bytes("same"));
    const second = await store.put(bytes("same"));
    // Content-addressing would merge them, and a musician who recorded the same bar twice would lose one of the two.
    expect(first).not.toBe(second);
    expect(await store.list()).toHaveLength(2);
  });

  it("answers undefined for a reference whose bytes are gone, rather than throwing", async () => {
    const store = createMemoryRecordingStore();
    const reference = await store.put(bytes("gone soon"));
    await store.remove(reference);
    // The state a session must survive and report: the take still exists in the arrangement, its bytes do not.
    await expect(store.get(reference)).resolves.toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it("treats removing something absent as done, because the goal is the absence", async () => {
    const store = createMemoryRecordingStore();
    await expect(store.remove("never-existed")).resolves.toBeUndefined();
  });
});
