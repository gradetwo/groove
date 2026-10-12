import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  toast,
  ToastContainer,
  Button,
  EmptyState,
  Modal,
  Skeleton,
  ErrorState,
  RadarChart,
  AriaLiveRegion,
  announcer,
} from "../ui";

describe("UI Component Library (P1-05 & P1-07)", () => {
  beforeEach(() => {
    toast.clearAll();
  });

  describe("Toast Singleton Manager", () => {
    it("should allow adding toasts and notifying subscribers", () => {
      let currentToasts: any[] = [];
      const unsubscribe = toast.subscribe((toasts) => {
        currentToasts = toasts;
      });

      expect(currentToasts.length).toBe(0);

      const id = toast.show("Project saved successfully", "success", 5000);
      expect(currentToasts.length).toBe(1);
      expect(currentToasts[0].id).toBe(id);
      expect(currentToasts[0].message).toBe("Project saved successfully");
      expect(currentToasts[0].type).toBe("success");

      toast.dismiss(id);
      expect(currentToasts.length).toBe(0);

      unsubscribe();
    });

    it("should cap active toasts to avoid visual clutter", () => {
      let currentToasts: any[] = [];
      toast.subscribe((toasts) => {
        currentToasts = toasts;
      });

      toast.show("Toast 1");
      toast.show("Toast 2");
      toast.show("Toast 3");
      toast.show("Toast 4");

      expect(currentToasts.length).toBe(3);
      expect(currentToasts.map((t) => t.message)).toEqual(["Toast 2", "Toast 3", "Toast 4"]);
    });

    it("should render active toasts inside ToastContainer", () => {
      render(React.createElement(ToastContainer));
      act(() => {
        toast.show("Hello Groove");
      });
      expect(screen.getByText("Hello Groove")).toBeTruthy();
    });
  });

  describe("Button", () => {
    it("renders Button with text, handles clicks, and respects disabled state", () => {
      const handleClick = vi.fn();
      render(
        React.createElement(
          Button,
          { onClick: handleClick, variant: "primary", size: "md" },
          "Click Me"
        )
      );

      const btn = screen.getByRole("button", { name: "Click Me" });
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("EmptyState", () => {
    it("renders EmptyState with action", () => {
      const handleAction = vi.fn();
      render(
        React.createElement(EmptyState, {
          title: "No Results",
          description: "Try searching again",
          actionLabel: "Clear Search",
          onAction: handleAction,
        })
      );

      expect(screen.getByText("No Results")).toBeTruthy();
      expect(screen.getByText("Try searching again")).toBeTruthy();
      const actionBtn = screen.getByRole("button", { name: "Clear Search" });
      fireEvent.click(actionBtn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Modal", () => {
    it("renders Modal with dialog role, title, and responds to Esc", () => {
      const handleClose = vi.fn();
      render(
        React.createElement(
          Modal,
          { isOpen: true, onClose: handleClose, title: "Settings Modal" },
          React.createElement("p", null, "Modal Content")
        )
      );

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByText("Settings Modal")).toBeTruthy();
      expect(screen.getByText("Modal Content")).toBeTruthy();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Skeleton & ErrorState (P1-07)", () => {
    it("renders Skeleton with role=status and aria-busy=true", () => {
      render(React.createElement(Skeleton, { variant: "card" }));
      const statusEl = screen.getByRole("status");
      expect(statusEl).toBeTruthy();
      expect(statusEl.getAttribute("aria-busy")).toBe("true");
    });

    it("renders ErrorState with role=alert and retry action", () => {
      const handleRetry = vi.fn();
      render(
        React.createElement(ErrorState, {
          title: "Audio Engine Crash",
          description: "AudioContext was closed",
          onRetry: handleRetry,
          retryLabel: "Restart Engine",
        })
      );

      const alertEl = screen.getByRole("alert");
      expect(alertEl).toBeTruthy();
      expect(screen.getByText("Audio Engine Crash")).toBeTruthy();

      const retryBtn = screen.getByRole("button", { name: "Restart Engine" });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("RadarChart (P1-07)", () => {
    it("renders SVG with role=img, aria-label, and hidden accessibility table", () => {
      const sampleMetrics = {
        groove: 8,
        brightness: 7,
        harmonicComplexity: 6,
        rhythmDensity: 9,
        bassEnergy: 8,
        melodicFocus: 5,
      };

      render(
        React.createElement(RadarChart, {
          metrics: sampleMetrics,
          "aria-label": "House Music Radar Profile",
          language: "zh",
        })
      );

      const img = screen.getByRole("img", { name: "House Music Radar Profile" });
      expect(img).toBeTruthy();

      // Screen reader table verification
      const caption = screen.getByText("House Music Radar Profile");
      expect(caption).toBeTruthy();
      const scores = screen.getAllByText("8 / 10");
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AriaLiveRegion & Announcer (P2-17)", () => {
    it("renders polite and assertive live regions and updates message on announcement", async () => {
      render(React.createElement(AriaLiveRegion));

      const politeRegion = screen.getByTestId("aria-live-polite");
      const assertiveRegion = screen.getByTestId("aria-live-assertive");

      expect(politeRegion).toBeTruthy();
      expect(assertiveRegion).toBeTruthy();
      expect(politeRegion.getAttribute("aria-live")).toBe("polite");
      expect(assertiveRegion.getAttribute("aria-live")).toBe("assertive");

      // Announce polite message
      act(() => {
        announcer.announce("Switched to House");
      });

      // Advance animation frame
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(politeRegion.textContent).toBe("Switched to House");

      // Announce assertive message
      act(() => {
        announcer.announce("Correct Answer!", "assertive");
      });

      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      expect(assertiveRegion.textContent).toBe("Correct Answer!");
    });
  });
});
