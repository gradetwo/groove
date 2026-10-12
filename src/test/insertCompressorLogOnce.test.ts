import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ensureInsertCompressorWorklet } from "../audio/InsertCompressor";

/**
 * ⭐ **The fallback is said once per distinct reason** (MCP deep test of v2.35.9: a render farm's log filled with
 * `[InsertCompressor] … the worklet module did not load` — the report filed it as noise).
 *
 * The line is right and stays: a strip that cannot load the project's worklet keeps the host compressor, and silence about
 * that would be worse. Repetition was the problem — a headless render builds a fresh context every time, so the same
 * sentence arrived again and again. A **new** reason must still be heard.
 */
const context = (error: Error): BaseAudioContext =>
  ({ audioWorklet: { addModule: () => Promise.reject(error) } }) as unknown as BaseAudioContext;

describe("the insert compressor's fallback message", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    /**
     * ⭐ `audioWorkletAvailable` asks for the constructor before it asks the context — there is no `AudioWorkletNode` in
     * jsdom, so without this stub the module returns early and the fallback this file is about never runs (the first
     * version of this test proved exactly that, quietly).
     */
    (globalThis as unknown as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {};
  });
  afterEach(() => {
    delete (globalThis as unknown as { AudioWorkletNode?: unknown }).AudioWorkletNode;
    vi.restoreAllMocks();
  });

  it("⭐ speaks once for repeated contexts with the same reason", async () => {
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>;
    warn.mockClear();
    for (let index = 0; index < 3; index += 1) {
      // A fresh context each time, exactly as a headless render builds them.
      // eslint-disable-next-line no-await-in-loop
      await ensureInsertCompressorWorklet(context(new Error("the same failure")));
    }
    expect(warn.mock.calls.length, "one line for one known reason").toBe(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("keeps the host compressor");
  });

  it("⭐ and still speaks when the reason is new", async () => {
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>;
    warn.mockClear();
    await ensureInsertCompressorWorklet(context(new Error("a second, different failure")));
    expect(warn.mock.calls.length, "a new failure is not silenced by the old one").toBe(1);
  });
});
