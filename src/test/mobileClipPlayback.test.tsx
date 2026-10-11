import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileClipPlayer } from "../mobile/MobileClipPlayer";

/**
 * ⭐ **The phone's own path to the pre-cut clip, pinned.** The owner's report ("播放听着不像是 mp3") is true of the
 * *default* path — the bar and the full player run the live engine — while the clip player does point at the rendered MP3
 * and does start it when its own button is pressed (measured on the built app: `readyState 4`, `currentTime` advancing).
 * A fact measured once on a build rots silently, so this holds both halves: the source, and the press.
 *
 * The data module is mocked rather than `fetch`, because the manifest reader is deliberately strict — feeding it a stub
 * that is one field short tests the reader, not the player.
 */
const CLIP = "https://r2mirror.groove.wangda.today/clips/chicago-house.mp3";
const hoisted = vi.hoisted(() => ({
  clip: {
    genreId: "chicago-house",
    url: "https://r2mirror.groove.wangda.today/clips/chicago-house.mp3",
    seconds: 16.6,
    bytes: 400030,
    engineVersion: "2.36.3",
    recordedLanes: 6,
    warnings: [],
  },
}));
vi.mock("../data/genreClips", () => ({
  readClipManifest: () => ({ bars: 8, clips: [] }),
  clipForGenre: () => hoisted.clip,
  staleClips: () => [],
}));

const playMock = vi.fn(async () => undefined);
beforeEach(() => {
  cleanup();
  playMock.mockClear();
  // ⭐ The component fetches the manifest itself before reading it; the *reader* is mocked, but the request still has to
  // settle, or the player stays on its loading branch forever and no button ever exists to press.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ bars: 8, clips: [] }) })));
  HTMLMediaElement.prototype.play = playMock as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
});

const renderPlayer = () =>
  render(
    <LanguageProvider>
      <MobileClipPlayer genreId="chicago-house" />
    </LanguageProvider>,
  );

describe("the phone clip player", () => {
  it("⭐ points its audio element at the genre's rendered clip", async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(container.querySelector("[data-testid='mobile-clip-play']")).toBeTruthy(), { timeout: 6000 });
    const audio = container.querySelector("[data-testid='mobile-clip-player'] audio");
    expect(audio?.getAttribute("src")).toBe(CLIP);
  });

  it("⭐ and its own play button is what starts that element", async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(container.querySelector("[data-testid='mobile-clip-play']")).toBeTruthy(), { timeout: 6000 });
    (container.querySelector("[data-testid='mobile-clip-play']") as HTMLElement).click();
    await waitFor(() => expect(playMock).toHaveBeenCalled(), { timeout: 6000 });
  });
});
