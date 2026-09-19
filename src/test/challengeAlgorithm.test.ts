import { describe, it, expect } from "vitest";
import {
  getRankTier,
  calculateEloDelta,
  updateSM2Memory,
  createInitialSM2Item,
  selectAdaptiveQuestion,
  DEFAULT_INITIAL_ELO,
  RANK_TIERS,
  SM2GenreMemory,
} from "../utils/challengeAlgorithm";
import { ALL_GENRES } from "../data/genres";

describe("Challenge Elo Rating & SM-2 Spaced Repetition Engine (P6-04)", () => {
  describe("Elo Rating & Rank Tiers", () => {
    it("maps Elo scores to correct rank tiers", () => {
      const bronze = getRankTier(1150);
      expect(bronze.tier.id).toBe("bronze");
      expect(bronze.tier.nameZh).toBe("青铜聆听者");
      expect(bronze.pointsToNext).toBe(50); // 1200 - 1150

      const silver = getRankTier(1200);
      expect(silver.tier.id).toBe("silver");
      expect(silver.tier.nameZh).toBe("白银鉴赏家");

      const gold = getRankTier(1500);
      expect(gold.tier.id).toBe("gold");

      const platinum = getRankTier(1700);
      expect(platinum.tier.id).toBe("platinum");

      const diamond = getRankTier(1900);
      expect(diamond.tier.id).toBe("diamond");

      const master = getRankTier(2200);
      expect(master.tier.id).toBe("master");
      expect(master.nextTier).toBeNull();
      expect(master.progressPercent).toBe(100);
      expect(master.pointsToNext).toBe(0);
    });

    it("calculates Elo deltas with placement multiplier and streak bonuses", () => {
      // New user (< 10 matches) -> K = 32
      const placementWin = calculateEloDelta({
        playerElo: 1200,
        difficulty: "medium", // 1350 opponent
        isCorrect: true,
        totalAnswered: 3,
        streak: 1,
      });
      expect(placementWin.delta).toBeGreaterThan(15);
      expect(placementWin.newElo).toBe(1200 + placementWin.delta);

      // Streak bonus (streak >= 3)
      const streakWin = calculateEloDelta({
        playerElo: 1400,
        difficulty: "medium",
        isCorrect: true,
        totalAnswered: 20,
        streak: 5,
      });
      expect(streakWin.bonus).toBeGreaterThan(0);

      // Loss deduction
      const loss = calculateEloDelta({
        playerElo: 1500,
        difficulty: "hard", // 1650 opponent
        isCorrect: false,
        totalAnswered: 25,
        streak: 0,
      });
      expect(loss.delta).toBeLessThan(0);
      expect(loss.newElo).toBeLessThan(1500);
    });
  });

  describe("SuperMemo-2 (SM-2) Spaced Repetition", () => {
    it("updates intervals and EF progressively on correct answers", () => {
      let memory: Record<string, SM2GenreMemory> = {};
      const genreId = "berlin-techno";

      // 1st correct answer: interval = 1
      memory = updateSM2Memory({
        memory,
        targetGenreId: genreId,
        isCorrect: true,
        currentRound: 1,
        difficulty: "medium",
      });
      expect(memory[genreId].repetitions).toBe(1);
      expect(memory[genreId].interval).toBe(1);
      expect(memory[genreId].easinessFactor).toBeGreaterThanOrEqual(2.5);

      // 2nd correct answer: interval = 3
      memory = updateSM2Memory({
        memory,
        targetGenreId: genreId,
        isCorrect: true,
        currentRound: 2,
        difficulty: "medium",
      });
      expect(memory[genreId].repetitions).toBe(2);
      expect(memory[genreId].interval).toBe(3);

      // 3rd correct answer: interval = Math.round(3 * EF) >= 7
      memory = updateSM2Memory({
        memory,
        targetGenreId: genreId,
        isCorrect: true,
        currentRound: 5,
        difficulty: "hard",
      });
      expect(memory[genreId].repetitions).toBe(3);
      expect(memory[genreId].interval).toBeGreaterThanOrEqual(7);
    });

    it("resets repetition and tracks confusion matrix on incorrect answers", () => {
      let memory: Record<string, SM2GenreMemory> = {};
      const correctGenre = "deep-house";
      const mistakenGenre = "tech-house";

      // User wrongly picks tech-house
      memory = updateSM2Memory({
        memory,
        targetGenreId: correctGenre,
        isCorrect: false,
        currentRound: 1,
        pickedGenreId: mistakenGenre,
        difficulty: "medium",
      });

      const item = memory[correctGenre];
      expect(item.repetitions).toBe(0);
      expect(item.interval).toBe(1);
      expect(item.consecutiveCorrect).toBe(0);
      expect(item.confusedWith[mistakenGenre]).toBe(1);

      // Second mistake on same pair
      memory = updateSM2Memory({
        memory,
        targetGenreId: correctGenre,
        isCorrect: false,
        currentRound: 2,
        pickedGenreId: mistakenGenre,
        difficulty: "medium",
      });
      expect(memory[correctGenre].confusedWith[mistakenGenre]).toBe(2);
    });
  });

  describe("Adaptive Question Generation", () => {
    it("generates 4 unique options including the correct genre and respects difficulty pool", () => {
      const difficultyPool = new Set(["chicago-house", "berlin-techno", "trap", "reggaeton", "disco"]);
      const result = selectAdaptiveQuestion({
        allGenres: ALL_GENRES,
        difficultyPool,
        difficulty: "easy",
        currentRound: 10,
        sm2Memory: {},
        recentTestedIds: ["disco"],
      });

      expect(result.correctGenre).toBeDefined();
      expect(difficultyPool.has(result.correctGenre.id)).toBe(true);
      expect(result.correctGenre.id).not.toBe("disco"); // Excluded by recentTestedIds
      expect(result.options.length).toBe(4);

      // Option uniqueness
      const ids = result.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids.includes(result.correctGenre.id)).toBe(true);
    });

    it("prioritizes historically confused distractors in options", () => {
      const targetId = "liquid-dnb";
      const confusedId = "neurofunk";
      const sm2Memory = {
        [targetId]: {
          genreId: targetId,
          repetitions: 0,
          interval: 1,
          easinessFactor: 2.1,
          consecutiveCorrect: 0,
          totalAttempts: 3,
          totalCorrect: 1,
          lastRoundSeen: 5,
          confusedWith: { [confusedId]: 3 },
        },
      };

      const result = selectAdaptiveQuestion({
        allGenres: ALL_GENRES,
        difficultyPool: new Set([targetId]),
        difficulty: "medium",
        currentRound: 10,
        sm2Memory,
        recentTestedIds: [],
      });

      expect(result.correctGenre.id).toBe(targetId);
      const optionIds = result.options.map((o) => o.id);
      expect(optionIds.includes(confusedId)).toBe(true);
      expect(result.confusionTarget).toBe(confusedId);
    });
  });
});
