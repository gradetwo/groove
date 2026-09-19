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
    expect(screen.getByText("工作台与专业钢琴卷帘深度手册")).toBeInTheDocument();
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

    // Switch to UI Manual
    fireEvent.click(screen.getByTestId("help-category-interface"));
    expect(screen.getByText("工作站区域划分与功能按钮全景手册")).toBeInTheDocument();
    expect(screen.getByText("顶部导航与全局控制栏")).toBeInTheDocument();
    expect(screen.getByText("工作台与音轨点音区")).toBeInTheDocument();
    expect(screen.getByText("专业黑白键钢琴卷帘区")).toBeInTheDocument();
    expect(screen.getByText("独立硬件调音台与空间总线")).toBeInTheDocument();
    expect(screen.getByText("全景声谱分析仪与声学实验室")).toBeInTheDocument();
    expect(screen.getByText("和弦工坊与全球曲风星系")).toBeInTheDocument();

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

    // Check all 8 lessons exist
    expect(screen.getByTestId("tutorial-card-drum")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-piano")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-mixer")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-acoustics")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-maker")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-chords")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-masterclass")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-card-galaxy")).toBeInTheDocument();

    // Check Lesson 1
    const drumCard = screen.getByTestId("tutorial-card-drum");
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

    // Launch Chords lesson
    const chordsCard = screen.getByTestId("tutorial-card-chords");
    const launchChordsBtn = within(chordsCard).getByTestId("launch-tutorial-chords");
    fireEvent.click(launchChordsBtn);
    expect(handleSelectTab).toHaveBeenCalledWith("chords");

    // Launch Acoustics secondary action (Kick lab)
    const acousticsCard = screen.getByTestId("tutorial-card-acoustics");
    const launchKickBtn = within(acousticsCard).getByTestId("launch-secondary-tutorial-acoustics");
    fireEvent.click(launchKickBtn);
    expect(handleSelectTab).toHaveBeenCalledWith("kick");
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

    expect(screen.getByText("工作台与专业钢琴卷帘深度手册")).toBeInTheDocument();
  });

  it("triggers acoustic audition on tutorial cards and supports toggling", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Switch to tutorials
    fireEvent.click(screen.getByTestId("help-category-tutorials"));

    // Check audition button on Lesson 1 (Drum)
    const auditionDrumBtn = screen.getByTestId("audition-tutorial-drum");
    expect(auditionDrumBtn).toBeInTheDocument();
    expect(auditionDrumBtn).toHaveTextContent("声学试听");

    // Click to start audition
    fireEvent.click(auditionDrumBtn);
    expect(auditionDrumBtn).toHaveTextContent("停止试听");

    // Click again to toggle stop
    fireEvent.click(auditionDrumBtn);
    expect(auditionDrumBtn).toHaveTextContent("声学试听");
  });

  it("invokes onStartTutorial with courseId and step index", () => {
    const handleStartTutorial = vi.fn();
    const handleClose = vi.fn();

    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={handleClose}
        onStartTutorial={handleStartTutorial}
      />
    );

    fireEvent.click(screen.getByTestId("help-category-tutorials"));

    // Click launch drum tutorial
    const launchDrumBtn = screen.getByTestId("launch-tutorial-drum");
    expect(launchDrumBtn).toHaveTextContent("进入实操教学");
    fireEvent.click(launchDrumBtn);

    expect(handleStartTutorial).toHaveBeenCalledWith("drum", 0);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("launches onboarding tour from quickstart banner", () => {
    const handleOpenOnboarding = vi.fn();
    const handleClose = vi.fn();

    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={handleClose}
        onOpenOnboarding={handleOpenOnboarding}
      />
    );

    const startTourBtn = screen.getByTestId("help-start-onboarding-btn");
    expect(startTourBtn).toHaveTextContent("开启全景引导漫游");
    fireEvent.click(startTourBtn);

    expect(handleOpenOnboarding).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders comprehensive visual dictionary of controls and icons with category filtering", () => {
    renderWithLanguage(
      <HelpCenterModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="interface"
      />
    );

    expect(screen.getByTestId("ui-manual-dictionary-section")).toBeInTheDocument();
    expect(screen.getByText("全界面图标与功能按键图解词典")).toBeInTheDocument();

    // Verify all 5 category filter buttons exist
    expect(screen.getByTestId("ui-manual-cat-all")).toBeInTheDocument();
    expect(screen.getByTestId("ui-manual-cat-transport")).toBeInTheDocument();
    expect(screen.getByTestId("ui-manual-cat-track")).toBeInTheDocument();
    expect(screen.getByTestId("ui-manual-cat-piano")).toBeInTheDocument();
    expect(screen.getByTestId("ui-manual-cat-fx")).toBeInTheDocument();
    expect(screen.getByTestId("ui-manual-cat-nav")).toBeInTheDocument();

    const grid = screen.getByTestId("ui-manual-grid");

    // In 'all' category, key controls from different areas should be present in the dictionary
    expect(within(grid).getByText("播放 / 暂停")).toBeInTheDocument();
    expect(within(grid).getByText("力度动态通道 (V)")).toBeInTheDocument();
    expect(within(grid).getByText("丰富和弦印章库 (Chord Stamps)")).toBeInTheDocument();
    expect(within(grid).getByText("多模式总线滤波器 (Filter)")).toBeInTheDocument();
    expect(within(grid).getByText("全屏虚拟音乐键盘 (⌥K)")).toBeInTheDocument();

    // Filter to 'transport'
    fireEvent.click(screen.getByTestId("ui-manual-cat-transport"));
    expect(within(grid).getByText("播放 / 暂停")).toBeInTheDocument();
    expect(within(grid).getByText("速度 BPM 与微调")).toBeInTheDocument();
    expect(within(grid).queryByText("力度动态通道 (V)")).not.toBeInTheDocument();

    // Filter to 'piano'
    fireEvent.click(screen.getByTestId("ui-manual-cat-piano"));
    expect(within(grid).getByText("铅笔绘制与涂抹工具 (Pencil Tool)")).toBeInTheDocument();
    expect(within(grid).getByText("丰富和弦印章库 (Chord Stamps)")).toBeInTheDocument();
    expect(within(grid).queryByText("播放 / 暂停")).not.toBeInTheDocument();

    // Filter to 'fx'
    fireEvent.click(screen.getByTestId("ui-manual-cat-fx"));
    expect(within(grid).getByText("多模式总线滤波器 (Filter)")).toBeInTheDocument();
    expect(within(grid).getByText("暖色模拟管饱和度 (Warm Tube Drive)")).toBeInTheDocument();
  });
});

