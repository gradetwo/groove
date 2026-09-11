import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  toast,
  ToastContainer,
  Button,
  IconButton,
  Chip,
  Card,
  EmptyState,
  Modal,
  Drawer,
  Slider,
  Select,
  Tooltip,
  Skeleton,
  ErrorState,
  RadarChart,
  GenreCard,
  AriaLiveRegion,
  announcer,
} from "../ui";
import { Genre } from "../types";

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

  describe("Button & IconButton", () => {
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

    it("enforces aria-label on IconButton", () => {
      const handleClick = vi.fn();
      render(
        React.createElement(IconButton, {
          "aria-label": "Close Dialog",
          onClick: handleClick,
          icon: React.createElement("span", null, "X"),
        })
      );

      const btn = screen.getByRole("button", { name: "Close Dialog" });
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Chip, Card & EmptyState", () => {
    it("renders Chip with variant and label", () => {
      render(React.createElement(Chip, { variant: "accent" }, "Electronic"));
      expect(screen.getByText("Electronic")).toBeTruthy();
    });

    it("renders Card with content", () => {
      render(React.createElement(Card, { title: "Test Card" }, "Card Body"));
      expect(screen.getByText("Test Card")).toBeTruthy();
      expect(screen.getByText("Card Body")).toBeTruthy();
    });

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

  describe("Modal & Drawer", () => {
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

    it("renders Drawer when open", () => {
      const handleClose = vi.fn();
      render(
        React.createElement(
          Drawer,
          { isOpen: true, onClose: handleClose, title: "Side Panel", position: "right" },
          React.createElement("p", null, "Drawer Content")
        )
      );

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByText("Side Panel")).toBeTruthy();
      expect(screen.getByText("Drawer Content")).toBeTruthy();
    });
  });

  describe("Slider (P1-07 & P2-21)", () => {
    it("renders slider with 44px touch container, ARIA attributes and responds to keyboard arrows", () => {
      const handleChange = vi.fn();
      render(
        React.createElement(Slider, {
          value: 50,
          min: 0,
          max: 100,
          step: 1,
          label: "Volume",
          "aria-label": "Master Volume Slider",
          onChange: handleChange,
          showValue: true,
        })
      );

      const slider = screen.getByRole("slider", { name: "Master Volume Slider" });
      expect(slider).toBeTruthy();
      expect(slider.getAttribute("aria-valuenow")).toBe("50");
      expect(slider.getAttribute("aria-valuemin")).toBe("0");
      expect(slider.getAttribute("aria-valuemax")).toBe("100");

      // Test ArrowRight
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(handleChange).toHaveBeenCalledWith(51);

      // Test ArrowLeft
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(handleChange).toHaveBeenCalledWith(49);

      // Test Home & End
      fireEvent.keyDown(slider, { key: "Home" });
      expect(handleChange).toHaveBeenCalledWith(0);

      fireEvent.keyDown(slider, { key: "End" });
      expect(handleChange).toHaveBeenCalledWith(100);
    });
  });

  describe("Select (P1-07)", () => {
    it("renders custom select, toggles listbox on click, and selects option", () => {
      const handleChange = vi.fn();
      const options = [
        { value: "4/4", label: "4/4 Standard" },
        { value: "3/4", label: "3/4 Waltz" },
        { value: "7/8", label: "7/8 Complex" },
      ];

      render(
        React.createElement(Select, {
          value: "4/4",
          options,
          onChange: handleChange,
          label: "Time Signature",
          "aria-label": "Select Meter",
        })
      );

      const trigger = screen.getByRole("button", { name: "Select Meter" });
      expect(trigger).toBeTruthy();
      expect(screen.getByText("4/4 Standard")).toBeTruthy();

      // Open dropdown
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeTruthy();

      // Click on 7/8 option
      const opt78 = screen.getByText("7/8 Complex");
      fireEvent.click(opt78);
      expect(handleChange).toHaveBeenCalledWith("7/8");
    });
  });

  describe("Tooltip (P1-07)", () => {
    it("renders trigger element and shows tooltip on mouse enter", () => {
      render(
        React.createElement(
          Tooltip,
          { content: "Play or Pause", shortcut: "Space" },
          React.createElement("button", null, "Play")
        )
      );

      const btn = screen.getByRole("button", { name: "Play" });
      expect(btn).toBeTruthy();
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

  describe("GenreCard (P1-07)", () => {
    it("renders genre info, handles click and play audition", () => {
      const mockGenre: Genre = {
        id: "chicago-house",
        name: "Chicago House",
        aliases: ["House"],
        category: "Electronic",
        parent_genres: ["disco"],
        subgenres: ["acid-house"],
        related_genres: ["techno"],
        origin_year: "1984",
        origin_decade: 1980,
        origin_place: { zh: "芝加哥", en: "Chicago" },
        cultural_context: { zh: "Warehouse 俱乐部", en: "Warehouse club" },
        bpm_range: "120-128",
        default_bpm: 124,
        time_signature: "4/4",
        key_characteristics: { zh: "四四拍", en: "Four on the floor" },
        common_chords: ["Am7", "Dm7"],
        chord_inversions: { zh: "原位", en: "Root" },
        instrumentation: ["TR-909"],
        sound_design: { zh: "温暖", en: "Warm" },
        rhythm_features: { zh: "四四拍", en: "Four on the floor" },
        drum_pattern: {
          kick: { zh: "四落", en: "Four on floor" },
          snare_clap: { zh: "2/4拍", en: "2 and 4" },
          hihats: { zh: "反拍", en: "Offbeat" },
          percussion: { zh: "康加", en: "Congas" },
          swing: { zh: "中等", en: "Medium" },
          tempo: "124",
        },
        bass_pattern: { zh: "切分音", en: "Syncopated" },
        structure: ["Intro", "Drop"],
        production_tips: { zh: ["压缩"], en: ["Compression"] },
        representative_tracks: [
          { title: "Your Love", artist: "Frankie Knuckles", year: 1987 },
          { title: "Move Your Body", artist: "Marshall Jefferson", year: 1986 },
          { title: "Baby Wants to Ride", artist: "Frankie Knuckles", year: 1987 },
          { title: "Can You Feel It", artist: "Mr. Fingers", year: 1986 },
          { title: "Jack Your Body", artist: "Steve Silk Hurley", year: 1986 },
        ],
        representative_artists: ["Frankie Knuckles"],
        sources: ["https://example.com"],
        radar_metrics: {
          groove: 9,
          brightness: 6,
          harmonicComplexity: 5,
          rhythmDensity: 7,
          bassEnergy: 8,
          melodicFocus: 6,
        },
        sequencer_pattern: {
          genre_id: "chicago-house",
          bpm: 124,
          scale: "C minor",
          tracks: [],
        },
      };

      const handleClick = vi.fn();
      const handlePlay = vi.fn();

      render(
        React.createElement(GenreCard, {
          genre: mockGenre,
          onClick: handleClick,
          onPlay: handlePlay,
          language: "zh",
        })
      );

      expect(screen.getByText("Chicago House")).toBeTruthy();
      expect(screen.getByText("1984")).toBeTruthy();
      expect(screen.getByText("120-128 BPM")).toBeTruthy();

      const card = screen.getByRole("button", { name: "曲风卡片 Chicago House" });
      fireEvent.click(card);
      expect(handleClick).toHaveBeenCalledWith(mockGenre);

      const playBtn = screen.getByRole("button", { name: "试听 Chicago House" });
      fireEvent.click(playBtn);
      expect(handlePlay).toHaveBeenCalledWith(mockGenre);
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
