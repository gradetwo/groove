import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InteractiveTutorialCoach } from "../components/help/InteractiveTutorialCoach";
import { LanguageProvider } from "../i18n/LanguageContext";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderCoach(props: Partial<React.ComponentProps<typeof InteractiveTutorialCoach>> = {}) {
  const defaultProps = {
    courseId: "drum",
    stepIndex: 0,
    onStepChange: vi.fn(),
    onClose: vi.fn(),
    onNavigateTab: vi.fn(),
    ...props,
  };

  const utils = render(
    <LanguageProvider>
      <InteractiveTutorialCoach {...defaultProps} />
    </LanguageProvider>
  );

  return { ...utils, ...defaultProps };
}

describe("InteractiveTutorialCoach · Hands-on Step Guidance Dock", () => {
  it("renders course badge, title, current step instruction, and tips", () => {
    renderCoach({ courseId: "drum", stepIndex: 0 });

    expect(screen.getByText("交互式实操教学中")).toBeInTheDocument();
    expect(screen.getByText("第 1 课: 节奏鼓机编排与欧几里得律动")).toBeInTheDocument();
    expect(screen.getByText("步骤 1 / 4")).toBeInTheDocument();
    expect(screen.getByText(/在底鼓轨道（第 1 行）的第 1、5、9、13 步点击网格激活/)).toBeInTheDocument();
    expect(screen.getByText(/四四拍是 House、Techno 和 Funk 的经典基底/)).toBeInTheDocument();
  });

  it("navigates forward and backward between steps", () => {
    const handleStepChange = vi.fn();
    const handleNavigateTab = vi.fn();

    const { rerender } = renderCoach({
      courseId: "drum",
      stepIndex: 0,
      onStepChange: handleStepChange,
      onNavigateTab: handleNavigateTab,
    });

    // Next step button
    const nextBtn = screen.getByTestId("tutorial-coach-next");
    fireEvent.click(nextBtn);
    expect(handleStepChange).toHaveBeenCalledWith(1);
    expect(handleNavigateTab).toHaveBeenCalledWith("studio");

    // Rerender at step 1
    rerender(
      <LanguageProvider>
        <InteractiveTutorialCoach
          courseId="drum"
          stepIndex={1}
          onStepChange={handleStepChange}
          onClose={vi.fn()}
          onNavigateTab={handleNavigateTab}
        />
      </LanguageProvider>
    );

    // Prev step button
    const prevBtn = screen.getByTestId("tutorial-coach-prev");
    fireEvent.click(prevBtn);
    expect(handleStepChange).toHaveBeenCalledWith(0);
  });

  it("triggers live acoustic audition and toggles playing state", () => {
    renderCoach({ courseId: "drum", stepIndex: 0 });

    const auditionBtn = screen.getByTestId("tutorial-coach-audition");
    expect(auditionBtn).toHaveTextContent("声学试听");

    fireEvent.click(auditionBtn);
    expect(auditionBtn).toHaveTextContent("停止试听");

    fireEvent.click(auditionBtn);
    expect(auditionBtn).toHaveTextContent("声学试听");
  });

  it("minimizes and expands docking state", () => {
    renderCoach({ courseId: "drum", stepIndex: 0 });

    // Click minimize
    const minimizeBtn = screen.getByTestId("tutorial-coach-minimize");
    fireEvent.click(minimizeBtn);

    // Should now show expand button
    const expandBtn = screen.getByTestId("tutorial-coach-expand");
    expect(expandBtn).toBeInTheDocument();

    // Click expand
    fireEvent.click(expandBtn);
    expect(screen.getByTestId("tutorial-coach-minimize")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    renderCoach({ courseId: "drum", stepIndex: 0, onClose: handleClose });

    const closeBtn = screen.getByTestId("tutorial-coach-close");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("automatically switches views when cross-tab steps are reached (acoustics lesson)", () => {
    const handleStepChange = vi.fn();
    const handleNavigateTab = vi.fn();

    renderCoach({
      courseId: "acoustics",
      stepIndex: 0,
      onStepChange: handleStepChange,
      onNavigateTab: handleNavigateTab,
    });

    // Step 0 of acoustics is kick lab
    const nextBtn = screen.getByTestId("tutorial-coach-next");
    fireEvent.click(nextBtn);

    // Step 1 of acoustics is analyzer
    expect(handleStepChange).toHaveBeenCalledWith(1);
    expect(handleNavigateTab).toHaveBeenCalledWith("analyzer");
  });
});
