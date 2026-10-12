import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Header } from "../components/Header";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **"New Project" changes the route without reloading the document, and only on a plain left click.**
 *
 * The link is an anchor because "new project" is a route of its own, and an anchor click is a native navigation:
 * a full document load that destroys the `AudioContext`, stops whatever is playing, and on iOS leaves the fresh
 * context suspended until another gesture. `docs/AUDIT_2026-10-02_TRIAGE.md` section 6 records the measurement and
 * why the capability arrives as a prop: a `useRouter` call inside the header needed a provider its criteria do not
 * wrap, and took a batch of them down when it was tried.
 *
 * So this file renders the header with a `LanguageProvider` and nothing else. That it works at all is the point —
 * the component gained no context dependency — and the two directions are that a plain click routes while a
 * modified one is left to the browser, because "open in a new tab" is the half an unconditional handler loses.
 */
function renderHeader(onNewProject?: () => void) {
  return render(
    <LanguageProvider>
      <Header
        currentTab={"studio" as never}
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        {...(onNewProject === undefined ? {} : { onNewProject })}
      />
    </LanguageProvider>
  );
}

const newProjectLink = (container: HTMLElement): HTMLElement => {
  const link = container.querySelector('a[href="/new"]');
  expect(link, "the New Project link must stay a real link").toBeTruthy();
  return link as HTMLElement;
};

describe("the header's New Project link", () => {
  it("⭐ asks the caller to route on a plain left click, instead of letting the document reload", () => {
    const onNewProject = vi.fn();
    const { container } = renderHeader(onNewProject);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    newProjectLink(container).dispatchEvent(event);

    expect(onNewProject, "the plain click must be routed").toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented, "and the native navigation must be prevented").toBe(true);
  });

  it("⭐ leaves a modified or middle click to the browser, so a new tab still opens", () => {
    const onNewProject = vi.fn();
    const { container } = renderHeader(onNewProject);

    // Cmd/Ctrl/Shift/Alt and any non-primary button are the cases a bare `onClick` would have swallowed.
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
      newProjectLink(container).dispatchEvent(event);
      expect(event.defaultPrevented, `a click with ${JSON.stringify(init)} must not be intercepted`).toBe(false);
    }
    expect(onNewProject).not.toHaveBeenCalled();
  });

  it("keeps the native link when the caller cannot route, so nothing is lost by not wiring it", () => {
    const { container } = renderHeader();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    newProjectLink(container).dispatchEvent(event);
    // No handler was installed, so the browser is free to follow the href exactly as before.
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole("link", { name: /./ })).toBeTruthy();
  });
});
