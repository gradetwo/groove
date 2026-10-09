/**
 * One sampler note, sounded at the rate the file asks for.
 *
 * **This is the link that was missing.** `createSampleLoader.loadNote` resolved a note to a sample *and a ratio* — with nine criteria behind it — and then returned the buffer alone, so the ratio was discarded; nothing in the application called the
 * method at all. A sampler could therefore be parsed, chosen, compiled and scheduled, and still never sound at the note that was played.
 *
 * What makes a sampler a sampler is exactly this: one recording, played at a different rate for each note. `startSamplerNote` is the smallest thing that does that, and it takes the pieces it needs rather than an engine, so a criterion can judge it with a
 * fake context — the same seam `browserSampleGraph` uses.
 */
export interface SamplerVoiceInput {
  context: BaseAudioContext;
  destination: AudioNode;
  buffer: AudioBuffer;
  /** The playback rate: 1 plays the recording as recorded, 2 is an octave up. */
  ratio: number;
  /** When to start, in context time. Defaults to now, which is what a key press means. */
  whenSeconds?: number;
  /** The track's level, so an audition is heard the way the track is mixed rather than dry. */
  gainDb?: number;
  /**
   * The track's position, −1…1. Absent or `0` is centre, and the graph is **the same as before in that case**: a stereo panner is created only when a lane
   * actually states a position, so nothing that did not pan before can start panning because a parameter was added.
   */
  pan?: number;
  /** How long to let it ring, in seconds. Absent means the whole sample — a held key on a piano. */
  seconds?: number;
  /**
   * ⭐ **What SFZ said about looping**, from the region that answered the note.
   *
   * Absent means what this project has always done: the recording plays once and stops at its own end. `loop_continuous`
   * and `loop_sustain` are the two values SFZ writes to ask for the recording to repeat, and they differ only at the key
   * release — see `SamplerVoice.stop` below.
   */
  loopMode?: "loop_continuous" | "loop_sustain";
  /**
   * The loop's bounds **in frames of the source sample**, exactly as SFZ's `loop_start`/`loop_end` write them.
   *
   * They are frames here and seconds on the node, and the conversion needs the buffer, which is why it happens inside
   * this function rather than in the resolver: `loopStart`/`loopEnd` are read in the **buffer's** time, so dividing by
   * the buffer's own sample rate is what makes them agree. A decoded buffer's rate is not always the context's — the
   * libraries this project mirrors are 44.1 kHz and the graphs are too, but nothing enforces that, and a loop that is
   * silently half a bar out is worse than no loop.
   */
  loopStartFrames?: number;
  loopEndFrames?: number;
  /**
   * ⭐ **How long the note takes to fall silent at its end, in seconds — a release, not a cut.**
   *
   * ## What this is for
   *
   * `seconds` schedules `source.start(when, 0, seconds)`, and the Web Audio specification ends playback **at that
   * instant**: the waveform is truncated mid-cycle, which is a step, and a step is a click. Measured on a sustaining
   * violin recording that is the difference between a note that ends and a note that is cut off — and when two
   * chords dovetail (the previous one still sounding as the next begins) the cut is heard as the sustained bed
   * **breaking**, which is the defect this was written for.
   *
   * A non-zero value instead starts the recording with no scheduled length and ramps the voice's gain down over
   * exactly this long, ending at the same instant `seconds` names. So the note is still the length the composer
   * wrote; it just arrives at silence through a ramp. The SFZ sources for the shape are `ampeg_release` under
   * `off_mode=normal` (the specification's own account of a stolen voice "dropping off extremely quickly … an
   * audible drop in levels during the transition") and `off_mode=time` + `off_time`.
   *
   * ## Why it defaults to the old behaviour
   *
   * Absent — or zero, or a note with no finite `seconds` — keeps `start(when, 0, seconds)` exactly as it was, because
   * the right release is a property of the **instrument**: a plucked or percussive sample wants a hard end and a
   * sustaining one does not, and this layer does not know which it was handed. The caller that resolves the region
   * is the one that knows, and it passes the number in.
   *
   * ## ⭐ It is wired to the export path — since 2026-10-02, by the owner's decision
   *
   * `WavExporter`'s sampler sink passes it for exactly one case, measured rather than chosen:
   * **a voice whose written length stops before the recording would**. `recordingSeconds =
   * buffer.duration / ratio`, so `seconds < recordingSeconds` is "this note is cut off while the
   * recording still had sound in it", and that note is started with no scheduled length and ramped to
   * silence over `DEFAULT_SAMPLER_RELEASE_SECONDS`. A percussive hit whose own bytes end before the
   * written gate is left alone — its decay is its ending — and a plain sample lane has
   * `seconds === buffer.duration`, so it takes the old path by construction.
   *
   * The owner's ruling is the reason it is on at all: *"采样的'给终点而不是硬切'"* (rider 1,
   * 2026-10-02), after this mechanism's own measurement on the owner's material (the largest
   * sample-to-sample step in a note's last 60 ms fell from **3.4× the signal's own median step to
   * 0.7×**, with the note's length unchanged). Wiring it changes what every exported sampled tail
   * sounds like — measured on a real Chromium export of the owner's shape (`VlnEns_susVib`, three-note
   * chords every 8 beats, 4.25 s each): lane energy **−0.54 dB**, integrated loudness **−0.22 dB**,
   * true peak **unchanged at −1.30 dBTP** (the limiter holds the ceiling, reducing 1.83 dB either
   * way), and the seam discontinuity at the chord change **1.40× → 0.60×** the signal's own median
   * step. `docs/STRING_TECHNIQUES.md` §10.2 carries the table and `docs/DISABLED_GATES.md` the
   * gates that were switched off beside it.
   */
  releaseSeconds?: number;
}

/**
 * ⭐ **When a sampled note ends through a release rather than a cut** — one rule, shared by every path.
 *
 * Reported by the owner (2026-10-09): playing the virtual keyboard, **every note clicked** at the moment the key came up.
 * The cause was a divergence, not a missing feature: the offline sink already released a note whose gate ended before its
 * recording (`seconds < recordingSeconds`), while the two **live** paths asked for the same release **only when the note
 * had been handed on by a legato join** — so a plain pressed-and-released note was cut at its gate on the live path and
 * rendered cleanly offline. That is exactly why the exported WAV sounded fine while the keyboard clicked.
 *
 * A release is asked for when the written length ends the note **before the recording would have**: the tail is still at
 * full level there, and stopping it is a step to zero — a click. When the recording has already fallen silent, the stop
 * costs nothing and the sample's own ending is kept.
 */
export function samplerReleaseSeconds(seconds: number | undefined, recordingSeconds: number): number | undefined {
  if (seconds === undefined) return undefined;
  if (!(seconds < recordingSeconds)) return undefined;
  return DEFAULT_SAMPLER_RELEASE_SECONDS;
}

/** The measured fade: about fifty milliseconds from full level to one percent. */
const CHOKE_FADE_SECONDS = 0.05;
/** A hair of extra time, so the scheduled stop lands after the ramp rather than through it. */
const CHOKE_FADE_TAIL_SECONDS = 0.005;
/**
 * ⭐ **The floor under a note-off release, and why a release may not be shorter than this.**
 *
 * `ampeg_release` is **not** the right number for this and the pinned library says so: it is the instrument's recorded
 * decay, and VSCO's values are 0.7–1 s on the sustained strings but **3–5 s on the pizzicati** and 12 s on the
 * timpani — using it would fade a plucked note across the next three chords. A release here is not a decay: it is the
 * window in which one voice gets out of the way of the next.
 *
 * Measured on the owner's project, consecutive chords overlap by **0.5 beat**, which is 0.250 s at 120 bpm — so a
 * release shorter than that leaves the old note still at full level when the next attack lands. This is the SFZ
 * specification's own account of the defect: a stolen voice without `off_mode`/`ampeg_release`
 * *"drops off extremely quickly, which will probably leave an audible drop in levels during the transition"*.
 */
export const MIN_RELEASE_SECONDS = 0.25;

/** How long a sampled note takes to fall silent at its end when the caller asks for a release. See `MIN_RELEASE_SECONDS`. */
export const DEFAULT_SAMPLER_RELEASE_SECONDS = MIN_RELEASE_SECONDS;

export interface SamplerVoice {
  /** The node that was started, so a caller can stop it — a key release on a sustaining sample. */
  stop(whenSeconds?: number): void;
  /**
   * ⭐ **Carry this voice on to the next note instead of starting that note's own recording.**
   *
   * ## What it is for, and where the shape comes from
   *
   * This is the voice half of "overlap is not legato" (`src/audio/legatoJoin.ts` decides *when*; this decides
   * *what*). When a sustained chord is still sounding and the next chord's note is the same voice a finger's width
   * away, a player does not draw a new attack — the bow keeps going and the pitch changes. Kontakt's own manual
   * describes the mechanism in the same terms: with Time Machine **Legato** on, "Kontakt will carry its current
   * playback position over to each following note, rather than playing each Sample from the beginning", and the
   * Melody engine's version is explicit about the alternative — "if a previous sample is still playing the playback
   * will not start from the sample's start marker, but instead it will follow the play position of the previous
   * sample. If no other sample is playing, the playback will start as usual from the sample's start marker."
   *
   * So the recording **keeps playing** (the playback position is carried, nothing restarts) and the playback rate
   * moves to the new note. The recording's own attack — the part the owner heard as the strings breaking — already
   * happened, once, when this voice began, and it does not happen again.
   *
   * ## The three things it must not get wrong
   *
   *   · **A voice that cannot be extended is refused, not half-changed.** A note started with
   *     `start(when, 0, seconds)` has its end *inside* the node: the specification's `duration` is "the duration of
   *     sound to be played, expressed as seconds of total buffer content", so a later `stop()` cannot move it (the
   *     specification's own rule is that the last `stop()` wins, "stop times set by previous calls will not be
   *     applied" — but a `duration` bound is not a `stop()` time). Refusing is what keeps a "join" from shortening
   *     a voice it was supposed to carry.
   *   · **The gain must not jump.** The voice is at its own level when the join happens — which is also exactly
   *     where the *previous* note's release ramp begins, because the measured overlap and the release window are
   *     the same 0.25 s (`MIN_RELEASE_SECONDS`). The scheduled release is cancelled and the level is restored to
   *     what the ramp had actually reached, which is the voice's own level again — zero jump in the measured case
   *     and a continuous value in every other.
   *   · **The pitch is a step, not a slide.** `glideSeconds` defaults to 0: SFZ's legato tutorial's own account of
   *     a pitch glide is that "with the portamento time at zero, this is effectively the same as non-portamento
   *     legato" (<https://sfzformat.com/tutorials/legato/>), and a finger change is not a slide. A caller that
   *     wants the portamento can ask for one.
   *
   * Returns **whether the voice was carried**: `false` means nothing was changed and the caller must start the note
   * as a fresh attack. The one case this layer cannot judge is whether the recording has enough left in it to reach
   * `endsAtSeconds`; `src/audio/legatoVoices.ts` measures that before asking.
   */
  takeOver(input: SamplerVoiceTakeOverInput): boolean;
  /**
   * **A choke is a fade, not a cut.** Measured with sfizz: when a hi-hat is choked by a note in the group its `off_by` names, the level goes 0.0500 → 0.0088 → 0.0038 → 0.0022 → 0.0007 over the fifty milliseconds after the choke — about a twentieth of a second to fall to one percent, and **not** an instantaneous stop. Stopping a voice dead is what makes a choked open hat click.
   *
   * `off_mode` was measured too, and made **no difference at all** in this build: `fast`, `normal` and absent produced identical readings in all eight windows, so there is nothing to implement for it beyond this one shape.
   */
  fadeOut(seconds?: number): void;
  /** The rate it was started at, reported back so a criterion can check the pitch rather than the code path. */
  ratio: number;
  /**
   * **The rate it is playing at now** — the rate it was started at, until a take-over moves it. Reported separately
   * from `ratio` so "which sample is this" and "what pitch is it at" stay two answers; a criterion that only read
   * `ratio` would see a carried voice still claiming the pitch it began on.
   */
  currentRatio: number;
  /**
   * **Whether the sample was in fact repeating.** Reported rather than assumed, because it is the difference between
   * "the file asked for a loop" and "the loop the file asked for was usable": a `loop_end` that is not beyond the
   * `loop_start` is not a span, and this voice plays the recording straight through instead of going silent.
   */
  looping: boolean;
  /**
   * **Whether this voice has finished sounding.**
   *
   * `note_polyphony` is a cap on *sounding* voices, so counting them means knowing when one has ended — and a one-short drum hit ends by itself, long before anyone releases a key. The node says so through `onended`; without this, a caller counting voices would count hits that finished a minute ago and start refusing new ones.
   */
  ended: boolean;
}

/** What a take-over needs: the new pitch's rate, the instant it moves, and where the carried note now ends. */
export interface SamplerVoiceTakeOverInput {
  /** The playback rate for the note being moved to, on **this** voice's recording. */
  ratio: number;
  /** When the pitch moves, in context time. */
  atSeconds: number;
  /** When the carried note ends, in context time — the new note's own written end. */
  endsAtSeconds: number;
  /** A release for the new end, in seconds, when the recording still has sound at that end. Absent means the recording itself ends first. */
  releaseSeconds?: number;
  /** How long the pitch takes to move. Defaults to 0 — a step, not a slide (see `takeOver`). */
  glideSeconds?: number;
}

export function startSamplerNote({
  context,
  destination,
  buffer,
  ratio,
  whenSeconds,
  gainDb = 0,
  pan = 0,
  seconds,
  loopMode,
  loopStartFrames,
  loopEndFrames,
  releaseSeconds,
}: SamplerVoiceInput): SamplerVoice {
  const source = context.createBufferSource();
  source.buffer = buffer;
  /**
   * **The rate is the note.** A guard rather than a silent default: a ratio of zero or a negative one is not a pitch, and letting it through would produce a source that either never advances or plays backwards — a bug that sounds like a broken
   * sample rather than like arithmetic.
   */
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  source.playbackRate.value = safeRatio;
  /**
   * ⭐ **The loop the region declared, applied here because this is the only layer that can.**
   *
   * `AudioBufferSourceNode` had `loop`/`loopStart`/`loopEnd` from the start and this function set none of them, so every
   * region's `loop_mode` reached the resolver, was read, and then stopped: the recording played once and ended. That is
   * invisible on a hit and fatal on a sustain, which is how `karoryfer-meatbass`'s `loop_mode=loop_sustain` regions came
   * to play like one-shots.
   *
   * Three deliberate refusals, each with the measurement behind it:
   *
   *   · **A loop end that is not past its start is not a loop.** sfizz renders `loop_start=0 loop_end=0` as **silence**
   *     (measured: RMS 0.000 for the whole render), which is clearly not what the file's author asked for. This voice
   *     plays the recording through instead — the behaviour that existed before any of this — because a wrong-but-audible
   *     note is recoverable and a silent one reads as a broken instrument.
   *   · **An absent `loop_end` means the last frame**, which is SFZ's own default and is resolved here rather than in the
   *     resolver because it takes the decoded buffer to know. Measured to agree with sfizz: `loop_mode=loop_continuous`
   *     with no `loop_start`/`loop_end` at all loops the whole recording (RMS flat at 0.057 for a 5-second render of a
   *     0.6-second sample).
   *   · **A region that declares no loop is not looped.** `no_loop` is SFZ's default and the pinned `VSCO-2-CE` relies on
   *     it: none of its 75 programs writes any loop opcode, and its sustained strings are 11.7-second recordings that
   *     simply end. This field cannot make them sustain, and a player that looped every sample would turn each of those
   *     strings into a stutter.
   */
  const loopStartSeconds = Math.max(0, (loopStartFrames ?? 0) / buffer.sampleRate);
  const loopEndSeconds = Math.max(0, (loopEndFrames ?? buffer.length) / buffer.sampleRate);
  const looping =
    (loopMode === "loop_continuous" || loopMode === "loop_sustain") &&
    Number.isFinite(loopStartSeconds) &&
    Number.isFinite(loopEndSeconds) &&
    loopEndSeconds > loopStartSeconds;
  if (looping) {
    source.loop = true;
    source.loopStart = loopStartSeconds;
    source.loopEnd = loopEndSeconds;
  }
  const gain = context.createGain();
  const levelGain = Math.pow(10, gainDb / 20);
  gain.gain.value = levelGain;
  /**
   * A position of exactly zero is **not** wired through a panner: the graph a centred lane builds has to stay the one it built before this parameter existed, so
   * the only change is for a lane that asked for a side.
   */
  const panned = Number.isFinite(pan) && pan !== 0;
  if (panned) {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain).connect(panner).connect(destination);
  } else {
    source.connect(gain).connect(destination);
  }
  const startedAt = whenSeconds ?? context.currentTime;
  /**
   * ⭐ **The release the caller asked for, or `undefined` when it did not ask.**
   *
   * Absent, zero and negative all mean "the old behaviour" — `start(when, 0, seconds)` — because a release is a
   * property of the instrument and this layer was not told what it is holding. A note with no finite end has nothing
   * to release *to*: it is stopped by a key release or by the render ending, and both of those have their own path.
   */
  const release =
    releaseSeconds !== undefined && Number.isFinite(releaseSeconds) && releaseSeconds > 0 && seconds !== undefined && Number.isFinite(seconds)
      ? releaseSeconds
      : undefined;
  /**
   * ⭐ **A release may never be a large fraction of the note it releases.**
   *
   * Measured on this repository's own VSCO lane fixture: its notes are **0.125 s** long, and an unclamped 0.25 s
   * release made the whole note a fade — the criterion that measures that lane's energy came back byte-identical to
   * the cut it replaced, which is how the clamp was found. The shape wanted is "full level, then a quick fall"; a
   * release that begins before the attack has finished is a different sound, not a longer fade.
   *
   * So the window is at most **40% of the note**, which leaves 60% at level even for the shortest note. On the owner's
   * project the note is 4.25 s, so the full 0.25 s applies and the note keeps all of its length.
   */
  const releaseWindow = release !== undefined && seconds !== undefined ? Math.min(release, seconds * 0.4) : undefined;
  /** Whether this note's end — gain ramp and `stop` together — is already scheduled, so `stop()` must not cut into it. */
  let releaseScheduled = false;
  /**
   * ⭐ **The release ramp this voice is on, so a take-over can put the level exactly where the ramp had reached.**
   *
   * `cancelScheduledValues` removes the ramp but cannot say what value it had got to, and `gain.gain.value` answers
   * "the value now" rather than "the value at the join" — which are different questions the moment a ramp is in
   * flight. A linear ramp is arithmetic, so the value at any instant inside it is written here instead of guessed:
   * `level` at `start`, falling straight to 0 at `end`.
   */
  let releaseShape: { start: number; end: number; level: number } | undefined;
  /** The rate the voice is playing at now — the starting rate until a take-over moves it. */
  let currentRatio = safeRatio;
  /** **Whether this voice's end can still be moved.** A length scheduled inside the node is a bound a later `stop()` cannot pass. */
  const extendable = looping || releaseWindow !== undefined || seconds === undefined;
  /**
   * **A looping source is given no scheduled length; it is given an end.** Measured, because the two are not the same
   * request: with `loop` set, `start(when, 0, duration)` still stops the source at `when + duration` — the Web Audio
   * specification says the loop attributes apply only while the playhead is inside `[loopStart, loopEnd)`, and a
   * scheduled stop ends playback regardless. So passing the lane's duration to a looped note would cut the loop at
   * exactly the second the loop was supposed to save, and the fix would be a no-op on the one path that has a note end
   * to pass (`WavExporter` schedules every sampled note with one).
   *
   * The note keeps that end as a **stop at the same instant**, which is the same silence at the same second with the
   * loop left on — and that is what makes `loop_mode` audible at all.
   *
   * ⭐ **And a release turns the same end into a ramp.** The recording is started with **no** scheduled length and the
   * gain comes down over `release`, reaching silence at exactly `startedAt + seconds` — the note is the length the
   * composer wrote, and it arrives there through a ramp rather than a step. The ramp must start no earlier than
   * `startedAt`, which is what the `as long as the note` bound below enforces: a release longer than the note itself
   * would otherwise ask the ramp to begin before the recording does, and Web Audio would clamp it to the start and
   * shorten the note.
   */
  if (looping && seconds !== undefined) {
    source.start(startedAt);
    source.stop(startedAt + seconds);
  } else if (releaseWindow !== undefined && seconds !== undefined) {
    source.start(startedAt);
    const rampStart = Math.max(startedAt, startedAt + seconds - releaseWindow);
    gain.gain.setValueAtTime(levelGain, rampStart);
    gain.gain.linearRampToValueAtTime(0, startedAt + seconds);
    source.stop(startedAt + seconds + CHOKE_FADE_TAIL_SECONDS);
    releaseShape = { start: rampStart, end: startedAt + seconds, level: levelGain };
    releaseScheduled = true;
  } else if (seconds === undefined) source.start(startedAt);
  else source.start(startedAt, 0, seconds);
  /**
   * **The level this voice is at, at a given instant** — its own level, or the point a release ramp had reached.
   *
   * Written as arithmetic rather than read from the parameter because the two questions are different: the parameter
   * answers "what is the value now", and a join asks "what will it be at the instant the next note begins", which for
   * a ramp in flight is somewhere between the level and silence.
   */
  const levelAt = (time: number): number => {
    const shape = releaseShape;
    if (!shape || time <= shape.start) return levelGain;
    if (time >= shape.end) return 0;
    return shape.level * ((shape.end - time) / (shape.end - shape.start));
  };
  const voice: SamplerVoice = {
    ratio: safeRatio,
    get currentRatio() {
      return currentRatio;
    },
    looping,
    ended: false,
    /**
     * ⭐ **The join: the recording stays where it is and the rate moves to the new note.**
     *
     * Written in the order the three mistakes would happen: refuse first (nothing may be half-changed), then move the
     * rate, then put the level where the ramp had reached, then move the end — and only then claim the end was
     * scheduled, so a caller's `stop()` still cannot cut inside the new ramp.
     */
    takeOver({ ratio: nextRatio, atSeconds, endsAtSeconds, releaseSeconds: takeOverRelease, glideSeconds = 0 }): boolean {
      if (!extendable || voice.ended) return false;
      if (!Number.isFinite(atSeconds) || !Number.isFinite(endsAtSeconds) || endsAtSeconds <= atSeconds) return false;
      const at = Math.max(0, atSeconds);
      try {
        const safe = Number.isFinite(nextRatio) && nextRatio > 0 ? nextRatio : currentRatio;
        /**
         * **The rate is held at what it is, then moved.** `cancelScheduledValues(at)` removes a ramp still in flight
         * (there is none today, and holding it costs one event), and a rate that is written twice at the same instant
         * is the later write — so this is "the rate it had" followed by "the rate it now has".
         */
        source.playbackRate.cancelScheduledValues(at);
        source.playbackRate.setValueAtTime(currentRatio, at);
        if (glideSeconds > 0) source.playbackRate.linearRampToValueAtTime(safe, at + glideSeconds);
        else source.playbackRate.setValueAtTime(safe, at);
        currentRatio = safe;
        /** **The level is restored, not reset**: see `releaseShape` for why the ramped value is arithmetic rather than a read. */
        const held = levelAt(at);
        gain.gain.cancelScheduledValues(at);
        gain.gain.setValueAtTime(held, at);
        releaseShape = undefined;
        releaseScheduled = false;
        if (takeOverRelease !== undefined && Number.isFinite(takeOverRelease) && takeOverRelease > 0) {
          const window = Math.min(takeOverRelease, (endsAtSeconds - at) * 0.4);
          if (window > 0) {
            const rampStart = Math.max(at, endsAtSeconds - window);
            gain.gain.setValueAtTime(held, rampStart);
            gain.gain.linearRampToValueAtTime(0, endsAtSeconds);
            releaseShape = { start: rampStart, end: endsAtSeconds, level: held };
            releaseScheduled = true;
          }
        }
        /** The last `stop()` wins (Web Audio specification, `AudioScheduledSourceNode.stop`), so this moves the end rather than adding a second one. */
        source.stop(endsAtSeconds + CHOKE_FADE_TAIL_SECONDS);
        voice.ended = false;
        return true;
      } catch {
        /** A closed context, or a voice that never started: refusing is the only safe answer, and the caller starts the note as a fresh attack. */
        return false;
      }
    },
    /**
     * The fade a choke uses, and why it exists rather than just calling `stop`: a hard stop on a sounding voice is a step in the waveform, and a step is a click. The measurement above says sfizz spends about fifty milliseconds getting to one percent, so the ramp ends there and `stop` is scheduled a hair after it — scheduling the stop **before** the ramp finishes would cut off the very fade it was asked for.
     */
    fadeOut(seconds = CHOKE_FADE_SECONDS) {
      try {
        const now = context.currentTime;
        const value = gain.gain.value;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(value, now);
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        source.stop(now + seconds + CHOKE_FADE_TAIL_SECONDS);
        voice.ended = true;
      } catch {
        // A closed context, or a source that never started: a choke must never be able to throw into the caller that is starting the next note.
      }
    },
    stop(when) {
      try {
        /**
         * ⭐ **A note whose end is already scheduled has already been stopped.**
         *
         * When the caller asked for a release, `startSamplerNote` scheduled both the gain ramp and the `stop` at the
         * note's own end. Calling `source.stop(when)` again here would **hard-cut inside that ramp** — the exact click
         * the release was added to remove — so the second stop is a no-op rather than a re-schedule. `voice.ended` is
         * still set, because from the caller's point of view the voice is on its way out and a later `stop` must not
         * resurrect it.
         */
        if (releaseScheduled) {
          voice.ended = true;
          return;
        }
        /**
         * **`loop_sustain` means the key release ends the loop, and sfizz agrees about the timing even though it does
         * not play the tail.** Measured with a two-part fixture (a loud body to 1.0 s and a quieter tail to 1.5 s,
         * `loop_mode=loop_sustain` over the body, note-off at 1.0 s): sfizz renders **1.115 s** — the release envelope
         * comes down and the render ends there — so the audible difference between exiting the loop and just stopping is
         * inside the release ramp. Exiting is the behaviour the specification describes and it costs one assignment, so
         * that is what happens; nothing is claimed about a tail that neither engine can hear.
         */
        if (looping && loopMode === "loop_sustain") source.loop = false;
        source.stop(when);
        voice.ended = true;
      } catch {
        // A source that never started, or one already stopped: both are states a caller may reach by pressing and releasing fast, and neither is worth an exception in a key handler.
      }
    },
  };
  /**
   * **The node is the authority on when a voice ends**, and a `loop_mode=one_shot` hit ends by itself — nobody presses a key to stop a cymbal. Not every source exposes the event (the test double does not need to), so this is attached only when it is there.
   */
  if ("onended" in source) {
    (source as AudioBufferSourceNode).onended = () => {
      voice.ended = true;
    };
  }
  return voice;
}
