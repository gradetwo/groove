/**
 * The frozen left column and the phone track header (item 6).
 *
 * Two measured defects are pinned here, because both are the kind that come back silently:
 *
 * 1. **The column widths disagreed.** The ruler label was 138 px, every track header 142 px and
 *    the velocity lane 126 px, with two different gaps. The ruler's column is `z-30` and the track
 *    headers are `z-20`, so on a phone the ruler painted 4 px over the chords header — and the
 *    step badges started 4 px away from the cells they label. They now share `--trk-head-w` and
 *    `--trk-head-gap`, and a media query inside a component cannot reintroduce a second value.
 *
 * 2. **The header overflowed its own column.** It held eleven controls and needed 241 px on a
 *    390 px-wide phone, inside a `sticky` box that is `overflow: hidden`: mute, solo and the
 *    sliders button all landed on top of step cells, so tapping them toggled steps instead. The
 *    measured numbers are in `scripts/diagnose_track_header.mjs`.
 *
 * The behavioural half (which control opens the inspector, and that auditioning did not move with
 * it) lives in `trackRowHeader.test.tsx`. This file owns the layout invariants, which a jsdom
 * render cannot observe because jsdom applies no stylesheet at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const read = (relative: string) => readFileSync(path.join(SRC_DIR, relative), "utf8");

const css = read("index.css");
const ruler = read("components/sequencer/Ruler.tsx");
const trackRow = read("components/sequencer/TrackRow.tsx");
const velocityLane = read("components/sequencer/VelocityLane.tsx");

/** The phone value and the desktop value, read out of the stylesheet rather than duplicated. */
function declaredWidths(): { base: string; sm: string } {
  const base = css.match(/--trk-head-w:\s*([^;]+);/);
  expect(base, "--trk-head-w is not declared in index.css").toBeTruthy();
  const sm = css.match(/@media \(min-width: 640px\)\s*\{[^}]*:root\s*\{[^}]*--trk-head-w:\s*([^;]+);/);
  expect(sm, "--trk-head-w has no sm: override").toBeTruthy();
  return { base: base![1].trim(), sm: sm![1].trim() };
}

describe("the frozen left column has exactly one width", () => {
  it("declares the width and the gap once, as variables", () => {
    const { base, sm } = declaredWidths();
    expect(base).toBe("142px");
    expect(sm).toBe("176px");
    expect(css).toMatch(/--trk-head-gap:\s*[^;]+;/);
  });

  it("gives the ruler label, the track header and the velocity lane that same variable", () => {
    for (const [name, source] of [
      ["Ruler.tsx", ruler],
      ["TrackRow.tsx", trackRow],
      ["VelocityLane.tsx", velocityLane],
    ] as const) {
      expect(source, `${name} does not use --trk-head-w`).toContain("w-[var(--trk-head-w)]");
    }
  });

  it("keeps no second hardcoded width for that column", () => {
    for (const [name, source] of [
      ["Ruler.tsx", ruler],
      ["TrackRow.tsx", trackRow],
      ["VelocityLane.tsx", velocityLane],
    ] as const) {
      // The historical values. Any of them reappearing means a fourth source of truth exists.
      for (const stale of ["w-[138px]", "w-[142px]", "w-[126px]", "w-[172px]", "w-[176px]"]) {
        expect(source, `${name} reintroduced a hardcoded column width (${stale})`).not.toContain(stale);
      }
    }
    // Including the scrollbar gutter, which had a fourth value of its own.
    expect(css).toContain("margin-left: var(--trk-head-w)");
    expect(css).not.toMatch(/margin-left:\s*126px/);
    expect(css).not.toMatch(/margin-left:\s*172px/);
  });

  it("uses one gap between the column and the first step, in the ruler and in the rows", () => {
    expect(ruler).toContain("gap-[var(--trk-head-gap)]");
    expect(trackRow).toContain("gap-[var(--trk-head-gap)]");
    /**
     * The outer row of each must carry **exactly one** gap class, and it must be the variable one —
     * a second Tailwind gap is what put the ruler 4 px out of step with the cells it labels.
     *
     * Written against the row's class list rather than anchored at the start of it: the guard used to
     * require the row to be the first `className="flex …` in the file, which broke when the row gained
     * `relative z-20` in front (the stacking context the frozen column needs — see
     * `frozenColumnLayering.test.ts`). Intent unchanged, and it now counts the gaps instead of
     * checking one position.
     */
    const rowClassList = (source: string) => {
      const marker = "flex items-center gap-[var(--trk-head-gap)]";
      const at = source.indexOf(marker);
      if (at < 0) return "";
      const before = source.slice(0, at);
      const start = Math.max(before.lastIndexOf("`"), before.lastIndexOf('"')) + 1;
      const after = at + marker.length;
      const rest = source.slice(after);
      const end = Math.min(
        ...["`", '"'].map((quote) => (rest.indexOf(quote) >= 0 ? rest.indexOf(quote) : Infinity))
      );
      return source.slice(start, after + end);
    };
    for (const [name, source] of [
      ["ruler", ruler],
      ["rows", trackRow],
    ] as const) {
      const gaps = rowClassList(source).match(/\bgap-[^ "'`]+/g) ?? [];
      expect(gaps, `${name}: the outer row must carry exactly the variable gap`).toEqual([
        "gap-[var(--trk-head-gap)]",
      ]);
    }
  });
});

describe("the phone track header fits its column", () => {
  it("marks every control that does not fit as desktop-only", () => {
    // Each of these needs 36 px at the phone touch size, and the column offers 128 px of content
    // width — five of them plus the row identity is 241 px. They are reachable from the per-track
    // inspector instead (which is also where mute and solo already were).
    for (const testId of [
      "track-audition-",
      "track-inspector-open-",
      "chord-duration-button-",
    ]) {
      const marker = trackRow.indexOf(testId);
      expect(marker, `${testId} is gone from TrackRow`).toBeGreaterThan(-1);
    }
    const desktopOnlyMarkers = trackRow.match(/trk-head-desktop-only/g) ?? [];
    // type badge, audition, chord duration, inspector sliders button = 4
    expect(desktopOnlyMarkers.length).toBeGreaterThanOrEqual(4);
    const desktopGroupMarkers = trackRow.match(/trk-head-desktop-group/g) ?? [];
    // volume/pan group and the quick-actions cluster = 2
    expect(desktopGroupMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it("hides those controls with a media query that beats their own display class", () => {
    /**
     * A Tailwind `hidden sm:flex` cannot win here: the element's own `flex` is in the same class
     * list and both rules have the same specificity, so whichever Tailwind emits later decides.
     * Two of these buttons already carried `hidden md:flex` while still overflowing, which is
     * exactly how the bug survived. The class has to be a real `display: none !important`.
     */
    expect(css).toMatch(
      /@media \(max-width: 639px\)\s*\{[\s\S]*?\.trk-head-desktop-only\s*\{\s*display:\s*none\s*!important;/
    );
    expect(css).toMatch(/\.trk-head-desktop-group\s*\{\s*display:\s*none\s*!important;/);
  });

  it("keeps mute and solo in the phone column, so they stay one tap from the row", () => {
    for (const testId of ["track-audition-", "chord-duration-button-"]) {
      const idx = trackRow.indexOf(testId);
      const classAt = trackRow.indexOf("className=", idx);
      const cls = trackRow.slice(classAt, classAt + 160);
      expect(cls, `${testId} should be desktop-only`).toContain("trk-head-desktop-only");
    }
    // The mute and solo buttons are the two whose accessible names are the only ones left inline.
    const muteIdx = trackRow.indexOf('aria-label={isMute ? t("track_unmute_aria")');
    expect(muteIdx).toBeGreaterThan(-1);
    for (const idx of [muteIdx, trackRow.indexOf('aria-label={isSolo ? t("track_unsolo_aria")')]) {
      const classAt = trackRow.lastIndexOf("className=", idx);
      const cls = trackRow.slice(classAt, classAt + 160);
      expect(cls).not.toContain("trk-head-desktop-only");
    }
  });

  it("offers the desktop-only audition gesture from the inspector on phones", () => {
    const inspector = read("components/console/TrackInspector.tsx");
    expect(inspector).toContain("track-inspector-audition");
    expect(inspector).toContain("onAudition");
    // And the studio actually supplies it, or the button silently never renders.
    const studio = read("views/StudioView.tsx");
    expect(studio).toContain("onAudition={handleAuditionInspectorTrack}");
  });
});
