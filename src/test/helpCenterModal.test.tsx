import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { HelpCenterModal } from "../components/help/HelpCenterModal";
import { LanguageProvider } from "../i18n/LanguageContext";

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

function renderWithLanguage(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("HelpCenterModal · user manual, interactive tutorials & search", () => {
  it("renders modal header, search bar, and default quickstart tab", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("用户手册与交互式教学中心")).toBeInTheDocument();
    expect(screen.getByTestId("help-center-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("help-category-quickstart")).toBeInTheDocument();
    expect(screen.getByTestId("help-category-tutorials")).toBeInTheDocument();
    expect(screen.getByText("欢迎来到 Groove 纯物理合成编曲工作站")).toBeInTheDocument();
  });

  it("switches across documentation categories", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Switch to Sequencer Manual
    fireEvent.click(screen.getByTestId("help-category-sequencer"));
    expect(screen.getByText("编曲工作台与专业钢琴卷帘深度手册")).toBeInTheDocument();
    expect(screen.getByText("高对比度专业钢琴卷帘 (Piano Roll)")).toBeInTheDocument();

    // Switch to Mixing & Labs
    fireEvent.click(screen.getByTestId("help-category-mixing"));
    expect(screen.getByText("混音台、效果器总线与声学实验室")).toBeInTheDocument();
    expect(screen.getByText("独立硬件调音台 (Console)")).toBeInTheDocument();

    // Switch to Harmony & Theory
    fireEvent.click(screen.getByTestId("help-category-theory"));
    expect(screen.getByText("和弦工坊、调式音阶与现代和声学")).toBeInTheDocument();

    // Switch to Export
    fireEvent.click(screen.getByTestId("help-category-export"));
    expect(screen.getByText("工程导出、跨平台联动与标准格式")).toBeInTheDocument();

    // Switch to FAQ
    fireEvent.click(screen.getByTestId("help-category-faq"));
    expect(screen.getByText("常见问题与疑难排障 (FAQ)")).toBeInTheDocument();
    expect(screen.getByText("Q: 手机 Safari 或微信内置浏览器点击没有声音？")).toBeInTheDocument();

    // Switch to Shortcuts
    fireEvent.click(screen.getByTestId("help-category-shortcuts"));
    expect(screen.getByText("键盘快捷键完整索引")).toBeInTheDocument();
  });

  it("runs interactive tutorial steps and triggers direct navigation", () => {
    const handleSelectTab = vi.fn();
    const handleClose = vi.fn();

    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={handleClose}
        onSelectTab={handleSelectTab}
      />
    );

    // Switch to Tutorials
    fireEvent.click(screen.getByTestId("help-category-tutorials"));

    // Check Lesson 1
    const drumCard = screen.getByTestId("tutorial-card-drum");
    expect(drumCard).toBeInTheDocument();
    expect(within(drumCard).getByText("步骤 1 / 4")).toBeInTheDocument();

    // Next step
    const nextBtn = within(drumCard).getByTitle("下一步");
    fireEvent.click(nextBtn);
    expect(within(drumCard).getByText("步骤 2 / 4")).toBeInTheDocument();

    // Launch action
    const launchBtn = within(drumCard).getByTestId("launch-tutorial-drum");
    fireEvent.click(launchBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleSelectTab).toHaveBeenCalledWith("studio");
  });

  it("dynamically searches and filters documentation across tutorials and shortcuts", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId("help-center-search-input");
    fireEvent.change(searchInput, { target: { value: "底鼓" } });

    expect(screen.getByText(/搜索结果: "底鼓"/)).toBeInTheDocument();
    expect(screen.getByText("第 4 课: 底鼓谐振解剖与全景声谱示波器")).toBeInTheDocument();

    // Clear filter
    fireEvent.click(screen.getByText("清除筛选"));
    expect(searchInput).toHaveValue("");
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    fireEvent.click(screen.getByTestId("help-center-close-button"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("directly opens to specified initialCategory", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="sequencer"
      />
    );

    expect(screen.getByText("编曲工作台与专业钢琴卷帘深度手册")).toBeInTheDocument();
  });
});

