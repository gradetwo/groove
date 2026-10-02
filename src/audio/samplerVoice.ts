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
   * ## ⚠️ And it is deliberately **not** wired to the export path yet
   *
   * `WavExporter`'s sampler sink does not pass this, so every exported sampled note still hard-cuts at its gate. That
   * is a decision held for the owner rather than an oversight, because turning it on **changes the loudness of every
   * exported sampler render** and the owner has reserved that class of change.
   *
   * Measured on this repository's own `vscoSamplerLane` fixture, whose three notes are 0.125 s each, with that test's
   * own reported figures and nothing else changed:
   *
   * ```
   *   no release   laneEnergy=1.3227e+4   lanePeakDb=-2.16 dB
   *   release 0.25 laneEnergy=5.9296e+3   lanePeakDb=-1.30 dB
   * ```
   *
   * So the mechanism is here, proved by its own criterion, and **which instrument gets it is a decision to take
   * deliberately** — see `docs/STRING_TECHNIQUES.md` §11.
   */
  releaseSeconds?: number;
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
   * **A choke is a fade, not a cut.** Measured with sfizz: when a hi-hat is choked by a note in the group its `off_by` names, the level goes 0.0500 → 0.0088 → 0.0038 → 0.0022 → 0.0007 over the fifty milliseconds after the choke — about a twentieth of a second to fall to one percent, and **not** an instantaneous stop. Stopping a voice dead is what makes a choked open hat click.
   *
   * `off_mode` was measured too, and made **no difference at all** in this build: `fast`, `normal` and absent produced identical readings in all eight windows, so there is nothing to implement for it beyond this one shape.
   */
  fadeOut(seconds?: number): void;
  /** The rate it was started at, reported back so a criterion can check the pitch rather than the code path. */
  ratio: number;
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
  gain.gain.value = Math.pow(10, gainDb / 20);
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
    gain.gain.setValueAtTime(gain.gain.value, Math.max(startedAt, startedAt + seconds - releaseWindow));
    gain.gain.linearRampToValueAtTime(0, startedAt + seconds);
    source.stop(startedAt + seconds + CHOKE_FADE_TAIL_SECONDS);
    releaseScheduled = true;
  } else if (seconds === undefined) source.start(startedAt);
  else source.start(startedAt, 0, seconds);
  const voice: SamplerVoice = {
    ratio: safeRatio,
    looping,
    ended: false,
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
