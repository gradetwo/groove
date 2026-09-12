import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AnatomyKickEngine,
  DEFAULT_SOMATIC_PARAMS,
  KICK_PRESETS,
} from "../audio/AnatomyKickEngine";
import { ecosystemBus, WangdaAudioMessage } from "../audio/ecosystemBus";
import { parseUrlToRoute, formatRouteToUrl } from "../app/router";

describe("The Anatomy Kick Engine & Ecosystem Bus (P-NEXT)", () => {
  let engine: AnatomyKickEngine;

  beforeEach(() => {
    engine = new AnatomyKickEngine();
  });

  describe("Somatic Parameter Management", () => {
    it("initializes with default somatic parameters", () => {
      const params = engine.getParams();
      expect(params.softness).toBe(DEFAULT_SOMATIC_PARAMS.softness);
      expect(params.clickAmount).toBe(DEFAULT_SOMATIC_PARAMS.clickAmount);
      expect(params.tameHighs).toBe(DEFAULT_SOMATIC_PARAMS.tameHighs);
      expect(params.grit).toBe(DEFAULT_SOMATIC_PARAMS.grit);
      expect(params.boomToWhere).toBe(DEFAULT_SOMATIC_PARAMS.boomToWhere);
      expect(params.hitSkin).toBe(DEFAULT_SOMATIC_PARAMS.hitSkin);
      expect(params.rumble).toBe(DEFAULT_SOMATIC_PARAMS.rumble);
      expect(params.basePitch).toBe(DEFAULT_SOMATIC_PARAMS.basePitch);
    });

    it("updates parameters accurately", () => {
      engine.setParams({
        basePitch: 52,
        softness: 0.1,
        clickAmount: 0.95,
        grit: 0.8,
      });

      const updated = engine.getParams();
      expect(updated.basePitch).toBe(52);
      expect(updated.softness).toBe(0.1);
      expect(updated.clickAmount).toBe(0.95);
      expect(updated.grit).toBe(0.8);
    });

    it("calculates neural Phase-Locking Value (PLV) within valid range [0.4, 0.99]", () => {
      // Razor sharp click should yield high PLV
      engine.setParams({ clickAmount: 0.98, softness: 0.05, tameHighs: 0.05 });
      const highPlv = engine.calculatePLV();
      expect(highPlv).toBeGreaterThan(0.85);
      expect(highPlv).toBeLessThanOrEqual(0.99);

      // Muted click should yield lower PLV
      engine.setParams({ clickAmount: 0.05, softness: 0.9, tameHighs: 0.9 });
      const lowPlv = engine.calculatePLV();
      expect(lowPlv).toBeLessThan(0.7);
      expect(lowPlv).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe("Somatic Curated Presets", () => {
    it("contains all 6 curated presets with philosophical foundations", () => {
      expect(KICK_PRESETS.length).toBe(6);
      const ids = KICK_PRESETS.map((p) => p.id);
      expect(ids).toContain("berlin-orphic");
      expect(ids).toContain("detroit-mechanical");
      expect(ids).toContain("somatic-808-gravity");
      expect(ids).toContain("industrial-revolt");
      expect(ids).toContain("acoustic-beater-skin");
      expect(ids).toContain("neural-click-clock");

      KICK_PRESETS.forEach((preset) => {
        expect(preset.philosophy.zh).toBeTruthy();
        expect(preset.philosophy.en).toBeTruthy();
        expect(preset.params).toBeDefined();
      });
    });

    it("applies Berlin Orphic Pillar preset parameters correctly", () => {
      const orphic = KICK_PRESETS.find((p) => p.id === "berlin-orphic")!;
      engine.setParams(orphic.params);
      const p = engine.getParams();
      expect(p.basePitch).toBe(42);
      expect(p.boomToWhere).toBe(0.8);
      expect(p.rumble).toBe(0.7);
    });
  });

  describe("Wangda Audio Ecosystem Bus", () => {
    it("notifies local subscribers on published messages", () => {
      const received: WangdaAudioMessage[] = [];
      const unsub = ecosystemBus.subscribe((msg) => received.push(msg));

      ecosystemBus.publishClockStart(130);
      ecosystemBus.publishTransientHit("master", 0.9, 48, 0.95);
      ecosystemBus.publishClockStop();

      expect(received.length).toBe(3);
      expect(received[0].type).toBe("CLOCK_START");
      expect((received[0] as { bpm: number }).bpm).toBe(130);
      expect(received[1].type).toBe("TRANSIENT_HIT");
      expect(received[2].type).toBe("CLOCK_STOP");

      unsub();
    });

    it("publishes transient hit callback from engine", () => {
      const hitFn = vi.fn();
      const unsub = engine.onTransientHit(hitFn);

      // Trigger should notify listeners
      engine.trigger(0, 0.85);

      unsub();
    });
  });

  describe("Router & Deep Linking Integration for Kick View", () => {
    it("parses /kick to tab 'kick'", () => {
      const route = parseUrlToRoute("/kick", "");
      expect(route.tab).toBe("kick");
    });

    it("parses /anatomy to tab 'kick'", () => {
      const route = parseUrlToRoute("/anatomy", "");
      expect(route.tab).toBe("kick");
    });

    it("parses ?tab=kick to tab 'kick'", () => {
      const route = parseUrlToRoute("/", "?tab=kick");
      expect(route.tab).toBe("kick");
    });

    it("formats route { tab: 'kick' } to /kick", () => {
      const url = formatRouteToUrl({ tab: "kick" });
      expect(url).toBe("/kick");
    });
  });
});
