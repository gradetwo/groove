import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NewUserOnboardingModal,
  ONBOARDING_COMPLETED_KEY,
} from "../components/help/NewUserOnboardingModal";
import { LanguageProvider } from "../i18n/LanguageContext";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("groove_language", "zh");
});

function renderOnboarding(props: Partial<React.ComponentProps<typeof NewUserOnboardingModal>> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onStartLesson1: vi.fn(),
    onStartStudio: vi.fn(),
    ...props,
  };

  const utils = render(
    <LanguageProvider>
      <NewUserOnboardingModal {...defaultProps} />
    </LanguageProvider>
  );

  return { ...utils, ...defaultProps };
}

describe("NewUserOnboardingModal · Interactive Walkthrough", () => {
  it("renders modal header and first milestone", () => {
    renderOnboarding();

    expect(screen.getByText("Groove 新手全景交互引导")).toBeInTheDocument();
    expect(screen.getByText("1 / 7")).toBeInTheDocument();
    expect(screen.getByText("1. 零采样纯物理声音合成")).toBeInTheDocument();
    expect(screen.getByText(/0 采样依赖 · 纯 DSP 实时运算/)).toBeInTheDocument();
  });

  it("navigates through all 7 milestones and shows action launches on last slide", () => {
    const handleStartLesson1 = vi.fn();
    const handleStartStudio = vi.fn();

    renderOnboarding({
      onStartLesson1: handleStartLesson1,
      onStartStudio: handleStartStudio,
    });

    // Step through milestones 1 -> 7
    for (let i = 1; i <= 6; i++) {
      const nextBtn = screen.getByTestId("onboarding-next-btn");
      fireEvent.click(nextBtn);
    }

    // Now at milestone 7
    expect(screen.getByText("7 / 7")).toBeInTheDocument();
    expect(screen.getByText("7. 一切就绪！开始您的音乐创作")).toBeInTheDocument();

    // Check actions
    const lessonBtn = screen.getByTestId("onboarding-start-lesson-btn");
    const studioBtn = screen.getByTestId("onboarding-start-studio-btn");
    expect(lessonBtn).toBeInTheDocument();
    expect(studioBtn).toBeInTheDocument();

    // Click start lesson 1
    fireEvent.click(lessonBtn);
    expect(handleStartLesson1).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe("true");
  });

  it("saves completion flag when skipping tour", () => {
    const handleClose = vi.fn();
    renderOnboarding({ onClose: handleClose });

    const skipBtn = screen.getByTestId("onboarding-skip-btn");
    fireEvent.click(skipBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe("true");
  });

  /**
   * U2: **dismissing the overlay is not finishing the guide.**
   *
   * `Modal`'s `onClose` fires for Escape and for a click on the mask, and it used to be wired
   * straight to the "completed" flag — so one stray click outside the card made the first-run guide
   * disappear permanently, for exactly the users who had not read it. Only the explicit Skip button
   * and the last slide's actions may record completion now.
   */
  it("does not record completion when the overlay is dismissed", () => {
    const handleClose = vi.fn();
    renderOnboarding({ onClose: handleClose });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();

    fireEvent.click(screen.getByLabelText("Close modal"));
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
  });

  it("offers its single action on the first slide, without recording completion", () => {
    // The point of U2: one click from the first screen to a sound, instead of seven slides of list.
    const handleAudition = vi.fn();
    const handleClose = vi.fn();
    renderOnboarding({ onAudition: handleAudition, onClose: handleClose });

    expect(screen.getByText("1 / 7")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("onboarding-listen-btn"));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleAudition).toHaveBeenCalledTimes(1);
    // Hearing the groove is not finishing the guide: it comes back, and Settings can replay it.
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
  });

  it("is wired from App into the studio's auto-play and the settings replay entry", () => {
    // Wiring, not behaviour: the hook's own suite covers what happens once the request arrives, and a
    // correct hook wired to nothing is indistinguishable from no feature at all (the argument
    // `genreInsertWiring.test.ts` makes for its own call sites).
    const app = read("App.tsx");
    expect(app).toMatch(/onAudition=\{\(\) => \{[\s\S]*?setInitialAutoPlay\(true\)/);
    expect(app).toContain("initialAutoPlay={initialAutoPlay}");
    expect(app).toContain("onClearInitialAutoPlay={() => setInitialAutoPlay(false)}");
    expect(app).toMatch(/onReplayOnboarding=\{\(\) => \{/);
    expect(app).toContain("localStorage.removeItem(ONBOARDING_COMPLETED_KEY)");

    const studio = read("views/StudioView.tsx");
    expect(studio).toContain("useInitialAutoPlay({");
    expect(studio).toContain("ready: engineReady");
  });
});
