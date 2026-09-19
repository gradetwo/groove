/**
 * U2, second half: the coach points at the control its step is talking about.
 *
 * The coach could already switch to the right *view*, but nothing indicated the button or cell the
 * text described — "click a step cell", with no step cell shown. It now rings the anchored control
 * and dims the rest, leaving the app clickable underneath (`pointer-events: none` on the ring), which
 * is what makes the instruction followable rather than merely readable.
 *
 * Two properties matter more than the visuals:
 *
 *  1. **A missing control is admitted, not faked.** On a surface that does not have the control (a
 *     phone layout, a closed panel) the step says so. A ring drawn around empty space would send the
 *     user hunting for something that is not there.
 *  2. **The anchors cannot rot.** They are attribute pairs in the course data, and a test greps `src/`
 *     for each one — rename or delete a control and the suite fails, instead of the coach quietly
 *     pointing at nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { InteractiveTutorialCoach } from "../components/help/InteractiveTutorialCoach";
import { LanguageProvider } from "../i18n/LanguageContext";
import { TUTORIAL_COURSES } from "../data/tutorialCourses";

const SRC = resolve(__dirname, "..");

/** Every `.ts`/`.tsx` under `src/`, so the anchor gate sees the whole codebase. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function renderCoach(stepIndex: number, courseId = "drum") {
  return render(
    <LanguageProvider>
      <InteractiveTutorialCoach
        courseId={courseId}
        stepIndex={stepIndex}
        onStepChange={vi.fn()}
        onClose={vi.fn()}
        onNavigateTab={vi.fn()}
      />
    </LanguageProvider>
  );
}

/** A control to point at, with a rect jsdom would otherwise report as all zeros. */
function mountTarget(attribute: string, value: string, rect: Partial<DOMRect> = {}) {
  const el = document.createElement("button");
  el.setAttribute(attribute, value);
  el.getBoundingClientRect = () =>
    ({ top: 100, left: 40, width: 120, height: 30, ...rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

let mounted: HTMLElement[] = [];
beforeEach(() => {
  mounted = [];
});
afterEach(() => {
  for (const el of mounted) el.remove();
});

function target(attribute: string, value: string, rect?: Partial<DOMRect>) {
  const el = mountTarget(attribute, value, rect);
  mounted.push(el);
  return el;
}

describe("tutorial coach · anchored steps", () => {
  it("rings the control a step is about, at the control's own rect", () => {
    // Step 1 of the drum course points at the transport's play button.
    target("data-toolbar-id", "play", { top: 100, left: 40, width: 120, height: 30 });
    renderCoach(0);

    const ring = screen.getByTestId("tutorial-coach-anchor");
    // 4 px of padding around the control, so the ring reads as a highlight rather than a border.
    expect(ring.style.top).toBe("96px");
    expect(ring.style.left).toBe("36px");
    expect(ring.style.width).toBe("128px");
    expect(ring.style.height).toBe("38px");
    // The app stays usable underneath: the whole point is that the instruction can be followed.
    expect(ring.className).toContain("pointer-events-none");
  });

  it("admits it cannot show the control instead of ringing empty space", () => {
    // No element with the attribute is mounted: a phone layout, or a panel that is closed.
    renderCoach(0);

    expect(screen.queryByTestId("tutorial-coach-anchor")).toBeNull();
    expect(screen.getByTestId("tutorial-coach-anchor-missing")).toBeTruthy();
  });

  it("shows neither a ring nor a complaint for a step that has no anchor", () => {
    // Piano course, step 2: a tip about in-scale lanes, with no single control to point at.
    renderCoach(1, "piano");

    expect(screen.queryByTestId("tutorial-coach-anchor")).toBeNull();
    expect(screen.queryByTestId("tutorial-coach-anchor-missing")).toBeNull();
  });

  it("re-measures when the step changes", () => {
    // Step 1 → play button; step 2 → a step cell on the grid.
    const play = target("data-toolbar-id", "play", { top: 10, left: 10, width: 20, height: 20 });
    target("data-testid", "step-cell-1-4", { top: 500, left: 300, width: 40, height: 40 });

    const { rerender } = renderCoach(0);
    expect(screen.getByTestId("tutorial-coach-anchor").style.top).toBe("6px");

    act(() => {
      rerender(
        <LanguageProvider>
          <InteractiveTutorialCoach
            courseId="drum"
            stepIndex={1}
            onStepChange={vi.fn()}
            onClose={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        </LanguageProvider>
      );
    });

    expect(screen.getByTestId("tutorial-coach-anchor").style.top).toBe("496px");
    expect(play.getAttribute("data-toolbar-id")).toBe("play");
  });
});

/**
 * Does the source stamp this attribute/value on some element?
 *
 * A static attribute (`data-toolbar-id="play"`) matches literally. Grid cells and channel strips are
 * stamped from templates — ``data-testid={`step-cell-${trackIdx}-${stepIdx}`}`` — so those are matched
 * on the template's literal prefix instead. Still a real check: rename the cell's testid shape and the
 * anchor stops resolving.
 */
function anchorExists(sources: string, attribute: string, value: string): boolean {
  if (sources.includes(`${attribute}="${value}"`)) return true;
  const parts = value.split("-");
  for (let end = parts.length - 1; end >= 1; end--) {
    const prefix = parts.slice(0, end).join("-");
    if (sources.includes(`${attribute}={\`${prefix}-`)) return true;
  }
  return false;
}

describe("tutorial coach · anchor gate", () => {
  it("every anchored step names a control that exists in the source", () => {
    const sources = sourceFiles(SRC)
      .filter((file) => !file.includes("/test/"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const anchors = TUTORIAL_COURSES.flatMap((course) =>
      course.steps.flatMap((step) => (step.anchor ? [{ course: course.id, ...step.anchor }] : []))
    );

    // Non-empty, or this gate would pass by having nothing to check.
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (const anchor of anchors) {
      expect(
        anchorExists(sources, anchor.attribute, anchor.value),
        `${anchor.course}: no element carries ${anchor.attribute}="${anchor.value}"`
      ).toBe(true);
    }
  });

  it("would notice a control that no longer exists", () => {
    // The gate has to be able to fail, or it is decoration.
    const sources = sourceFiles(SRC)
      .filter((file) => !file.includes("/test/"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(anchorExists(sources, "data-toolbar-id", "play")).toBe(true);
    expect(anchorExists(sources, "data-toolbar-id", "this-control-does-not-exist")).toBe(false);
    expect(anchorExists(sources, "data-testid", "console-fader-99")).toBe(true); // template prefix
    expect(anchorExists(sources, "data-testid", "no-such-widget-3")).toBe(false);
  });
});
