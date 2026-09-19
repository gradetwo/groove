import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NewUserOnboardingModal,
  ONBOARDING_COMPLETED_KEY,
} from "../components/help/NewUserOnboardingModal";
import { LanguageProvider } from "../i18n/LanguageContext";

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
});
