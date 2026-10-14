/**
 * **Mastering settings: the values a person sets on the whole mix, as one validated block.**
 *
 * The master chain has had all of this since it was built — a glue compressor on each bus, a true-peak limiter, a
 * loudness trim, a stereo widener — but every one of those values was a **constant read once at build time**
 * (`masterGraph.ts`'s `MASTER_BUS_COMP_*` and `MASTER_MAKEUP_DB`), or an option only `AudioEngine.initAudioContext`
 * passed. Nothing could change them, so nothing exposed them: the settings panel's limiter controls were component
 * state that never reached the engine, and no MCP tool mentioned a limiter at all.
 *
 * This module is the missing half that everything else can agree on: one block of values with their defaults and their
 * bounds, so a settings panel, a project file, an MCP tool and the graph builder all read and write the same fields
 * rather than each inventing a range. It holds no audio node and no React, so it can be tested on its own.
 *
 * ## Why the bounds live here rather than only in `masterGraph`
 *
 * `masterGraph` owns the constants that describe what the DSP *does* (a knee of 8 dB, an attack of 30 ms are shapes,
 * not limits). What is added here is the range a **person** may set: a threshold the compressor can act on, a ratio
 * that is still a compressor. The two are different questions, and a panel that clamped to one while the builder read
 * the other is exactly how a slider and its audio disagree.
 */

/** Compression on the two glue buses (drums and music), which is the "master bus compressor" of a mastering chain. */
export interface MasterBusCompSettings {
  enabled: boolean;
  /** dB; a higher threshold compresses less. */
  thresholdDb: number;
  /** dB of soft knee either side of the threshold. */
  kneeDb: number;
  /** 1 is no compression. */
  ratio: number;
  /** Seconds. */
  releaseSec: number;
  /** dB applied after compression, to put back what the reduction took. */
  makeupDb: number;
}

/** The output ceiling. */
export interface MasterLimiterSettings {
  /** dBTP; the absolute ceiling every render and every playback passes through. */
  ceilingDb: number;
  /** Milliseconds of lookahead the true-peak limiter uses. */
  lookaheadMs: number;
  /** Milliseconds; the two-stage release's fast half. */
  releaseFastMs: number;
  /** Milliseconds; the two-stage release's slow half. */
  releaseSlowMs: number;
}

/**
 * The stereo widener's amount.
 *
 * ⭐ **Per track, not a master setting** — `ChannelStripDsp.ts:445-447` says the stage is "deliberately not wired here
 * yet", and it is fed a track's `width`. It lives in this block so a project has one place to store its mix, and the
 * name says what it is: the wiring that reads it is per channel.
 */
export interface MasterWidthSettings {
  /** 0 is mono, 1 is unchanged, above 1 widens. */
  amount: number;
}

/**
 * Everything a person may set on the whole mix.
 *
 * ⭐ **What is measured, not what would be nice.** Every field here is one `MasterGraphOptions` actually consumes
 * (`masterBusCompEnabled/ThresholdDb/KneeDb/Ratio/ReleaseSec`, `busCompMakeupDb`, `limiterCeilingDb`,
 * `limiterReleaseFastMs/SlowMs`) — checked field by field rather than assumed, and the check found two things that do
 * **not** belong:
 *
 *   - **the bus compressor's attack is not settable.** `masterGraph` hard-codes `MASTER_BUS_COMP_ATTACK_SEC` (30 ms)
 *     and exposes no option for it, so a slider here would be a control that changes nothing;
 *   - **the stereo widener is not a master setting.** `ChannelStripDsp` builds it per track
 *     (`(p.width ?? 0) > 0 ? 1 : 0`), and `MasterGraphOptions` has no `width` at all — so {@link MasterWidthSettings}
 *     is carried here for the per-track wiring that is still to come, and its note says so instead of implying the
 *     master bus already widens.
 *
 * Deliberately **not** here: the per-genre loudness trim. That number is fitted across all 159 genres so they match
 * each other (see `masterGraph.ts`'s note on why the trim sits after the FX rack), so a person editing it would break
 * the one property it exists to provide. It stays what it was: a measurement the app applies.
 */
export interface MasterSettings {
  busComp: MasterBusCompSettings;
  limiter: MasterLimiterSettings;
  width: MasterWidthSettings;
}

/** The bounds a person may set, each a range the DSP can actually honour. */
export const MASTER_LIMITS = {
  /** Below this nothing reaches the threshold on real material; above it the compressor is effectively off. */
  busCompThresholdDb: { min: -60, max: 0 },
  busCompKneeDb: { min: 0, max: 40 },
  busCompRatio: { min: 1, max: 20 },
  busCompReleaseSec: { min: 0.01, max: 2 },
  busCompMakeupDb: { min: -12, max: 12 },
  /** The limiter's ceiling is always at or below 0 dBTP: a ceiling above it would clip. */
  limiterCeilingDb: { min: -12, max: 0 },
  limiterLookaheadMs: { min: 0, max: 20 },
  limiterReleaseFastMs: { min: 0, max: 500 },
  limiterReleaseSlowMs: { min: 0, max: 2000 },
  widthAmount: { min: 0, max: 2 },
} as const;

/**
 * What a project that states nothing hears.
 *
 * These are `masterGraph`'s own defaults, restated here as **data** so a project file, a panel and a tool can read the
 * same numbers without loading the audio layer. `masterSettings.test.ts` pins them against the graph's constants, so
 * the two cannot drift apart quietly.
 */
export const MASTER_DEFAULTS: MasterSettings = {
  busComp: {
    enabled: true,
    thresholdDb: -16,
    kneeDb: 8,
    ratio: 2,
    releaseSec: 0.22,
    makeupDb: 5,
  },
  limiter: { ceilingDb: -1, lookaheadMs: 5, releaseFastMs: 60, releaseSlowMs: 400 },
  width: { amount: 1 },
};

const clamp = (value: number, min: number, max: number): number =>
  !Number.isFinite(value) ? min : Math.min(max, Math.max(min, value));

/**
 * A stored block made safe: every field clamped to the range the DSP honours, and every missing field defaulted.
 *
 * Takes `unknown` on purpose, because its commonest caller is a **file**: a project written by an older build, or
 * edited by hand, must load as something playable rather than throw or carry a NaN into a `AudioParam`.
 */
export function normaliseMasterSettings(input: unknown): MasterSettings {
  const raw = (input ?? {}) as Partial<Record<keyof MasterSettings, unknown>>;
  const busComp = (raw.busComp ?? {}) as Partial<MasterBusCompSettings>;
  const limiter = (raw.limiter ?? {}) as Partial<MasterLimiterSettings>;
  const width = (raw.width ?? {}) as Partial<MasterWidthSettings>;

  return {
    busComp: {
      enabled: busComp.enabled ?? MASTER_DEFAULTS.busComp.enabled,
      thresholdDb: clamp(
        busComp.thresholdDb ?? MASTER_DEFAULTS.busComp.thresholdDb,
        MASTER_LIMITS.busCompThresholdDb.min,
        MASTER_LIMITS.busCompThresholdDb.max
      ),
      kneeDb: clamp(busComp.kneeDb ?? MASTER_DEFAULTS.busComp.kneeDb, MASTER_LIMITS.busCompKneeDb.min, MASTER_LIMITS.busCompKneeDb.max),
      ratio: clamp(busComp.ratio ?? MASTER_DEFAULTS.busComp.ratio, MASTER_LIMITS.busCompRatio.min, MASTER_LIMITS.busCompRatio.max),
      releaseSec: clamp(
        busComp.releaseSec ?? MASTER_DEFAULTS.busComp.releaseSec,
        MASTER_LIMITS.busCompReleaseSec.min,
        MASTER_LIMITS.busCompReleaseSec.max
      ),
      makeupDb: clamp(
        busComp.makeupDb ?? MASTER_DEFAULTS.busComp.makeupDb,
        MASTER_LIMITS.busCompMakeupDb.min,
        MASTER_LIMITS.busCompMakeupDb.max
      ),
    },
    limiter: {
      ceilingDb: clamp(
        limiter.ceilingDb ?? MASTER_DEFAULTS.limiter.ceilingDb,
        MASTER_LIMITS.limiterCeilingDb.min,
        MASTER_LIMITS.limiterCeilingDb.max
      ),
      lookaheadMs: clamp(
        limiter.lookaheadMs ?? MASTER_DEFAULTS.limiter.lookaheadMs,
        MASTER_LIMITS.limiterLookaheadMs.min,
        MASTER_LIMITS.limiterLookaheadMs.max
      ),
      releaseFastMs: clamp(
        limiter.releaseFastMs ?? MASTER_DEFAULTS.limiter.releaseFastMs,
        MASTER_LIMITS.limiterReleaseFastMs.min,
        MASTER_LIMITS.limiterReleaseFastMs.max
      ),
      releaseSlowMs: clamp(
        limiter.releaseSlowMs ?? MASTER_DEFAULTS.limiter.releaseSlowMs,
        MASTER_LIMITS.limiterReleaseSlowMs.min,
        MASTER_LIMITS.limiterReleaseSlowMs.max
      ),
    },
    // 1 is "unchanged", so a project that states nothing is not widened by accident.
    width: {
      amount: clamp(width.amount ?? MASTER_DEFAULTS.width.amount, MASTER_LIMITS.widthAmount.min, MASTER_LIMITS.widthAmount.max),
    },
  };
}

/** Whether a block is exactly the defaults, so a writer can drop it from a file rather than storing noise. */
export function isDefaultMasterSettings(settings: MasterSettings): boolean {
  return JSON.stringify(normaliseMasterSettings(settings)) === JSON.stringify(MASTER_DEFAULTS);
}

/**
 * The subset of `MasterGraphOptions` these settings drive, named one for one.
 *
 * The engine spreads this into `buildMasterGraph`, so **the mapping lives beside the model** rather than as nine lines
 * inside `AudioEngine` — the audio file is at its size cap, and this is also where a reader looking for "which option
 * does `thresholdDb` become" should find the answer. Fields the graph does not consume are absent on purpose, which is
 * the same list the type's own note gives.
 */
export function masterGraphOptions(settings: MasterSettings): {
  masterBusCompEnabled: boolean;
  masterBusCompThresholdDb: number;
  masterBusCompKneeDb: number;
  masterBusCompRatio: number;
  masterBusCompReleaseSec: number;
  busCompMakeupDb: number;
  limiterCeilingDb: number;
  limiterReleaseFastMs: number;
  limiterReleaseSlowMs: number;
} {
  return {
    masterBusCompEnabled: settings.busComp.enabled,
    masterBusCompThresholdDb: settings.busComp.thresholdDb,
    masterBusCompKneeDb: settings.busComp.kneeDb,
    masterBusCompRatio: settings.busComp.ratio,
    masterBusCompReleaseSec: settings.busComp.releaseSec,
    busCompMakeupDb: settings.busComp.makeupDb,
    limiterCeilingDb: settings.limiter.ceilingDb,
    limiterReleaseFastMs: settings.limiter.releaseFastMs,
    limiterReleaseSlowMs: settings.limiter.releaseSlowMs,
  };
}

/**
 * The subset of {@link MasterSettings} a project's file is expected to state.
 *
 * `loudnessTrimDb` is absent for the reason the type's own note gives — it is fitted across the genres rather than
 * chosen — and the widener is per track.
 */
export type MasterSettingsPatch = Omit<MasterSettings, "loudnessTrimDb">;

/**
 * ⭐ **The same block, but only for the fields a project actually stated.**
 *
 * This exists because a block of settings must be **additive**: `renderPatternOffline` already reads nine individual
 * options, and a caller that passes no settings at all has to behave exactly as it did before. Filling the gaps with
 * {@link MASTER_DEFAULTS} would not be additive — it would overwrite options the caller never mentioned, and a criterion
 * caught exactly that (`limiterReleaseOptions.test.ts`: a release time that used to stay `undefined` so the processor
 * kept its own default became the block's 60 ms).
 *
 * So an absent field stays absent. Values that *are* present are clamped, because a file is a file.
 */
export function statedMasterSettings(input: unknown): Partial<MasterSettingsPatch> {
  if (input === null || typeof input !== "object") return {};
  const raw = input as {
    busComp?: Partial<MasterBusCompSettings>;
    limiter?: Partial<MasterLimiterSettings>;
    width?: Partial<MasterWidthSettings>;
  };

  /** One section's stated fields, clamped. A field absent from `bounds` is copied as it is (the booleans). */
  const section = <T extends object>(
    source: unknown,
    bounds: Record<string, { min: number; max: number }>
  ): Partial<T> => {
    const out: Record<string, unknown> = {};
    if (source === null || typeof source !== "object") return out as Partial<T>;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (value === undefined) continue;
      const bound = bounds[key];
      out[key] = typeof value === "number" && bound ? clamp(value, bound.min, bound.max) : value;
    }
    return out as Partial<T>;
  };

  // ⭐ Each section's bounds are keyed by **its own field names**. The first version reused `MASTER_LIMITS`, whose keys
  // are the graph's flat option names (`limiterCeilingDb`), so no field ever matched and nothing was clamped — a
  // criterion caught it (`expected 12 to be +0`).
  const busComp = section<MasterBusCompSettings>(raw.busComp, {
    thresholdDb: MASTER_LIMITS.busCompThresholdDb,
    kneeDb: MASTER_LIMITS.busCompKneeDb,
    ratio: MASTER_LIMITS.busCompRatio,
    releaseSec: MASTER_LIMITS.busCompReleaseSec,
    makeupDb: MASTER_LIMITS.busCompMakeupDb,
  });
  const limiter = section<MasterLimiterSettings>(raw.limiter, {
    ceilingDb: MASTER_LIMITS.limiterCeilingDb,
    lookaheadMs: MASTER_LIMITS.limiterLookaheadMs,
    releaseFastMs: MASTER_LIMITS.limiterReleaseFastMs,
    releaseSlowMs: MASTER_LIMITS.limiterReleaseSlowMs,
  });
  const width = section<MasterWidthSettings>(raw.width, { amount: MASTER_LIMITS.widthAmount });
  return {
    ...(Object.keys(busComp).length ? { busComp } : {}),
    ...(Object.keys(limiter).length ? { limiter } : {}),
    ...(Object.keys(width).length ? { width } : {}),
  } as Partial<MasterSettingsPatch>;
}
