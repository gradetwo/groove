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
}

/** The measured fade: about fifty milliseconds from full level to one percent. */
const CHOKE_FADE_SECONDS = 0.05;
/** A hair of extra time, so the scheduled stop lands after the ramp rather than through it. */
const CHOKE_FADE_TAIL_SECONDS = 0.005;

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
}: SamplerVoiceInput): SamplerVoice {
  const source = context.createBufferSource();
  source.buffer = buffer;
  /**
   * **The rate is the note.** A guard rather than a silent default: a ratio of zero or a negative one is not a pitch, and letting it through would produce a source that either never advances or plays backwards — a bug that sounds like a broken
   * sample rather than like arithmetic.
   */
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  source.playbackRate.value = safeRatio;
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
  if (seconds === undefined) source.start(startedAt);
  else source.start(startedAt, 0, seconds);
  const voice: SamplerVoice = {
    ratio: safeRatio,
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
