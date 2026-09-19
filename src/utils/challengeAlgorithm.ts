/**
 * Challenge Elo Rating & SuperMemo-2 (SM-2) Spaced Repetition Engine (P6-04)
 * Supports:
 * - Dynamic Elo Rating calculation with streak bonuses and difficulty scaling
 * - 6 distinct Rank Tiers (Bronze, Silver, Gold, Platinum, Diamond, Master)
 * - SuperMemo-2 (SM-2) spaced repetition interval scheduling for confused genres
 * - Adaptive distractor selection using historical confusion matrices
 */

import { Genre } from "../types/genre";

export type ChallengeDifficulty = "easy" | "medium" | "hard";

export interface RankTier {
  id: "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";
  nameZh: string;
  nameEn: string;
  icon: string;
  minElo: number;
  maxElo: number;
  color: string;
  bgGradient: string;
  borderColor: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  {
    id: "bronze",
    nameZh: "青铜聆听者",
    nameEn: "Bronze Listener",
    icon: "🥉",
    minElo: 800,
    maxElo: 1199,
    color: "#cd7f32",
    bgGradient: "from-amber-900/30 to-amber-950/20",
    borderColor: "#cd7f32",
  },
  {
    id: "silver",
    nameZh: "白银鉴赏家",
    nameEn: "Silver Connoisseur",
    icon: "🥈",
    minElo: 1200,
    maxElo: 1399,
    color: "#c0c0c0",
    bgGradient: "from-slate-700/30 to-slate-900/20",
    borderColor: "#a0aab2",
  },
  {
    id: "gold",
    nameZh: "黄金辨音手",
    nameEn: "Gold Beatmaster",
    icon: "🥇",
    minElo: 1400,
    maxElo: 1599,
    color: "#f5b73d",
    bgGradient: "from-amber-500/20 to-yellow-600/10",
    borderColor: "#f5b73d",
  },
  {
    id: "platinum",
    nameZh: "铂金声学士",
    nameEn: "Platinum Acoustic Scholar",
    icon: "💎",
    minElo: 1600,
    maxElo: 1799,
    color: "#4ad8c8",
    bgGradient: "from-teal-500/20 to-emerald-600/10",
    borderColor: "#4ad8c8",
  },
  {
    id: "diamond",
    nameZh: "钻石律动宗师",
    nameEn: "Diamond Groove Virtuoso",
    icon: "🔮",
    minElo: 1800,
    maxElo: 1999,
    color: "#a78bfa",
    bgGradient: "from-purple-600/20 to-indigo-600/10",
    borderColor: "#a78bfa",
  },
  {
    id: "master",
    nameZh: "传奇怪物律动大师",
    nameEn: "Legendary Ear Maestro",
    icon: "👑",
    minElo: 2000,
    maxElo: 3000,
    color: "#ff4d6d",
    bgGradient: "from-rose-600/30 to-amber-500/20",
    borderColor: "#ff4d6d",
  },
] as const;

export const DEFAULT_INITIAL_ELO = 1200;

export const DIFFICULTY_OPPONENT_ELO: Record<ChallengeDifficulty, number> = {
  easy: 1100,
  medium: 1350,
  hard: 1650,
};

/**
 * Resolves current rank tier and progress to the next tier
 */
export function getRankTier(elo: number): {
  tier: RankTier;
  nextTier: RankTier | null;
  progressPercent: number;
  pointsToNext: number;
} {
  const safeElo = Math.max(800, elo);

  let tier = RANK_TIERS[0];
  let nextTier: RankTier | null = RANK_TIERS[1];

  for (let i = 0; i < RANK_TIERS.length; i++) {
    const t = RANK_TIERS[i];
    if (safeElo >= t.minElo && safeElo <= t.maxElo) {
      tier = t;
      nextTier = i < RANK_TIERS.length - 1 ? RANK_TIERS[i + 1] : null;
      break;
    }
  }

  // Handle above master
  if (safeElo >= 2000) {
    tier = RANK_TIERS[RANK_TIERS.length - 1];
    nextTier = null;
    return {
      tier,
      nextTier: null,
      progressPercent: 100,
      pointsToNext: 0,
    };
  }

  const range = tier.maxElo - tier.minElo + 1;
  const currentInTier = safeElo - tier.minElo;
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentInTier / range) * 100)));
  const pointsToNext = nextTier ? nextTier.minElo - safeElo : 0;

  return {
    tier,
    nextTier,
    progressPercent,
    pointsToNext,
  };
}

/**
 * Calculates Elo rating change for a question outcome
 */
export function calculateEloDelta(options: {
  playerElo: number;
  difficulty: ChallengeDifficulty;
  isCorrect: boolean;
  totalAnswered: number;
  streak: number;
}): { delta: number; newElo: number; bonus: number } {
  const { playerElo, difficulty, isCorrect, totalAnswered, streak } = options;

  // Dynamic K-Factor
  let k = 24;
  if (totalAnswered < 10) {
    k = 32; // Placement rounds
  } else if (playerElo >= 1800) {
    k = 16; // Stable elite rank
  }

  const opponentElo = DIFFICULTY_OPPONENT_ELO[difficulty];
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actualScore = isCorrect ? 1 : 0;

  let delta = Math.round(k * (actualScore - expectedScore));
  let bonus = 0;

  if (isCorrect) {
    // Streak multiplier bonus
    if (streak >= 3) {
      bonus = Math.min(12, Math.floor(streak / 2) * 2);
      delta += bonus;
    }
    delta = Math.max(4, delta); // Minimum win gain
  } else {
    // Loss penalty
    delta = Math.min(-2, delta); // Minimum loss decrement
  }

  const newElo = Math.max(800, playerElo + delta);

  return { delta, newElo, bonus };
}

/**
 * SuperMemo-2 (SM-2) memory item structure for a single genre
 */
export interface SM2GenreMemory {
  genreId: string;
  repetitions: number;
  interval: number; // in quiz rounds
  easinessFactor: number; // standard SM-2 EF: 1.3 to 2.5+
  consecutiveCorrect: number;
  totalAttempts: number;
  totalCorrect: number;
  lastRoundSeen: number;
  confusedWith: Record<string, number>; // otherGenreId -> occurrence count
}

export function createInitialSM2Item(genreId: string, currentRound = 0): SM2GenreMemory {
  return {
    genreId,
    repetitions: 0,
    interval: 1,
    easinessFactor: 2.5,
    consecutiveCorrect: 0,
    totalAttempts: 0,
    totalCorrect: 0,
    lastRoundSeen: currentRound,
    confusedWith: {},
  };
}

/**
 * Updates SM-2 memory state based on user answer quality
 */
export function updateSM2Memory(options: {
  memory: Record<string, SM2GenreMemory>;
  targetGenreId: string;
  isCorrect: boolean;
  currentRound: number;
  pickedGenreId?: string;
  difficulty?: ChallengeDifficulty;
}): Record<string, SM2GenreMemory> {
  const { memory, targetGenreId, isCorrect, currentRound, pickedGenreId, difficulty = "medium" } = options;

  const existing = memory[targetGenreId] || createInitialSM2Item(targetGenreId, currentRound);
  const updated: SM2GenreMemory = {
    ...existing,
    totalAttempts: existing.totalAttempts + 1,
    totalCorrect: existing.totalCorrect + (isCorrect ? 1 : 0),
    lastRoundSeen: currentRound,
    confusedWith: { ...existing.confusedWith },
  };

  // Grade evaluation: 5 = Hard correct, 4 = Medium correct, 3 = Easy correct, 1 = Incorrect
  let grade = 1;
  if (isCorrect) {
    grade = difficulty === "hard" ? 5 : difficulty === "medium" ? 4 : 3;
    updated.consecutiveCorrect += 1;
    updated.repetitions += 1;

    // SM-2 interval scheduling
    if (updated.repetitions === 1) {
      updated.interval = 1;
    } else if (updated.repetitions === 2) {
      updated.interval = 3;
    } else {
      updated.interval = Math.max(1, Math.round(updated.interval * updated.easinessFactor));
    }

    // Easiness factor adjustment
    const efDelta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
    updated.easinessFactor = Math.max(1.3, Number((updated.easinessFactor + efDelta).toFixed(2)));
  } else {
    // Answer incorrect: reset repetitions, schedule review next round
    updated.consecutiveCorrect = 0;
    updated.repetitions = 0;
    updated.interval = 1;
    updated.easinessFactor = Math.max(1.3, Number((updated.easinessFactor - 0.2).toFixed(2)));

    // Track which genre user misidentified it as
    if (pickedGenreId && pickedGenreId !== targetGenreId) {
      updated.confusedWith[pickedGenreId] = (updated.confusedWith[pickedGenreId] || 0) + 1;
    }
  }

  return {
    ...memory,
    [targetGenreId]: updated,
  };
}

/**
 * Selects an adaptive question prioritizing genres due for spaced repetition
 * and distractors the user has historically confused with the target genre
 */
export function selectAdaptiveQuestion(options: {
  allGenres: Genre[];
  difficultyPool: Set<string>;
  difficulty: ChallengeDifficulty;
  currentRound: number;
  sm2Memory: Record<string, SM2GenreMemory>;
  recentTestedIds: string[];
}): {
  correctGenre: Genre;
  options: Genre[];
  dueForReview: boolean;
  confusionTarget?: string;
} {
  const { allGenres, difficultyPool, currentRound, sm2Memory, recentTestedIds } = options;

  const genresMap = new Map(allGenres.map((g) => [g.id, g]));

  // 1. Filter candidates in active difficulty pool excluding recent tested buffer
  const candidateIds = allGenres
    .filter((g) => difficultyPool.has(g.id) && !recentTestedIds.includes(g.id))
    .map((g) => g.id);

  const pool = candidateIds.length > 0 ? candidateIds : allGenres.map((g) => g.id);

  // 2. Score candidate genres: items due for SM-2 repetition get strong priority
  let bestTargetId = pool[0];
  let maxScore = -1;
  let isDue = false;

  pool.forEach((id) => {
    const mem = sm2Memory[id];
    let score = Math.random() * 1.5; // Base exploration noise

    if (mem) {
      const roundsSinceSeen = currentRound - mem.lastRoundSeen;
      if (roundsSinceSeen >= mem.interval) {
        // Due for spaced repetition!
        score += 5.0 + Math.min(4.0, (roundsSinceSeen - mem.interval) * 0.5);
        isDue = true;
      }
      // Low easiness factor (difficult genre for this user) gets extra boost
      if (mem.easinessFactor < 2.0) {
        score += (2.5 - mem.easinessFactor) * 2.0;
      }
      // High error rate
      if (mem.totalAttempts > 0 && mem.totalCorrect / mem.totalAttempts < 0.5) {
        score += 3.0;
      }
    } else {
      // Unseen genre
      score += 2.0;
    }

    if (score > maxScore) {
      maxScore = score;
      bestTargetId = id;
    }
  });

  const correctGenre = genresMap.get(bestTargetId) || allGenres[0];
  const mem = sm2Memory[correctGenre.id];

  // 3. Intelligent Distractor Generation (Confused genres first, then sibling genres)
  const distractors: string[] = [];

  // 3.1 Prioritize historically confused genres
  if (mem && mem.confusedWith) {
    const sortedConfusions = Object.entries(mem.confusedWith)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    for (const confId of sortedConfusions) {
      if (confId !== correctGenre.id && genresMap.has(confId) && !distractors.includes(confId)) {
        distractors.push(confId);
        if (distractors.length >= 2) break;
      }
    }
  }

  // 3.2 Prioritize sibling genres from the same category
  const siblingGenres = allGenres.filter(
    (g) =>
      g.category === correctGenre.category &&
      g.id !== correctGenre.id &&
      !distractors.includes(g.id)
  );
  if (siblingGenres.length > 0 && distractors.length < 3) {
    const shuffledSiblings = [...siblingGenres].sort(() => Math.random() - 0.5);
    for (const s of shuffledSiblings) {
      distractors.push(s.id);
      if (distractors.length >= 3) break;
    }
  }

  // 3.3 Fill remaining slots from difficulty pool
  const remaining = allGenres.filter(
    (g) => g.id !== correctGenre.id && !distractors.includes(g.id)
  );
  const shuffledRemaining = [...remaining].sort(() => Math.random() - 0.5);
  while (distractors.length < 3 && shuffledRemaining.length > 0) {
    const next = shuffledRemaining.pop();
    if (next) distractors.push(next.id);
  }

  // 4. Combine into 4 randomized choices
  const finalChoices = [correctGenre, ...distractors.map((id) => genresMap.get(id)!)].filter(
    Boolean
  );
  const shuffledChoices = finalChoices.sort(() => Math.random() - 0.5);

  const topConfusion =
    mem && Object.keys(mem.confusedWith).length > 0
      ? Object.entries(mem.confusedWith).sort((a, b) => b[1] - a[1])[0][0]
      : undefined;

  return {
    correctGenre,
    options: shuffledChoices,
    dueForReview: isDue,
    confusionTarget: topConfusion,
  };
}
