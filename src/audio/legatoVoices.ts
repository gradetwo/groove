/**
 * ⭐ **Carrying a sounding voice into the next note — the voice layer's half of "overlap is not legato".**
 *
 * `src/audio/legatoJoin.ts` decides *when* a join is legato; `src/audio/samplerVoice.ts` knows *how* a single voice is
 * carried. This module is the state between them: which voice is still sounding on which line of which lane, how much
 * of its **recording** it has already played, and therefore whether the recording can reach the end of the note it is
 * being handed.
 *
 * ## Why the measurement lives here and not in the plan
 *
 * The plan can see that the previous note has not released and that the pitch moves. It cannot see the recording: a
 * `.wav`'s length arrives with the decoded buffer, at load time, and the plan runs before anything is loaded. So the
 * one refusal the rule cannot make has to be made here — and it must be a **refusal, not a silence**, because a voice
 * carried past the end of a one-shot recording stops sounding and the note disappears.
 *
 * That is not a hypothetical. The owner's strings are `VlnEns_susVib_*.wav`, 8.988–13.120 s one-shot recordings with
 * **no loop points at all** (`docs/STRING_TECHNIQUES.md` §3: 75 programs, 0 `loop` opcodes, 0 `smpl` chunks), on
 * chords every 4 s. A voice carried from the first chord and never restarted would run out of recording after about
 * three chord changes and go quiet. So the carry is allowed **only while the recording still has sound at the moment
 * the carried note ends**, and the note that would overrun is started as a fresh attack instead — which is exactly
 * what the renderer did before this existed. The reading below says how many of each there were.
 *
 * ## The interval is the whole of the pitch change
 *
 * The carried voice plays the *previous* note's recording, so its rate for the new note is
 * `held.ratio × 2^((newPitch − heldPitch)/12)` — one region's tuning is unchanged and only the distance moved
 * matters (`sfz/regionPlayback.ts` owns that exponential). The honest cost of this, said here rather than discovered
 * later: the join has the **previous** note's timbre, because the library ships no legato transition samples
 * (`sw_previous` intervals) to hand over to. SFZ's own tutorial is the honest scale for that: transposing a
 * neighbouring transition "can be convincing… as long as the interval is no more than a third or fourth"
 * (<https://sfzformat.com/tutorials/legato/>) — which is a statement about *transition* samples, and this is not one.
 * `docs/LEGATO_OVERLAP.md` §7 says what is therefore missing and what the next step is.
 */
import type { SamplerVoice } from "./samplerVoice";
import { DEFAULT_SAMPLER_RELEASE_SECONDS } from "./samplerVoice";
import { shiftedRatio } from "./sfz/regionPlayback";
import type { LegatoJoinMark } from "./legatoJoin";

/** Why a handover the rule allowed was not performed at the voice layer. */
export type LegatoVoiceRefusal = "recording-would-run-out" | "voice-cannot-be-extended" | "no-sounding-voice";

/** One refused handover, named so a reader can act on it. */
export interface LegatoVoiceRefusalEntry {
  reason: LegatoVoiceRefusal;
  trackIndex: number;
  name: string;
  atSeconds: number;
  pitch: number;
  /** The pitch the voice it would have carried is sounding, when there was one. */
  fromPitch?: number;
  because: string;
}

/** What the voice layer did with the plan's handovers. Reported rather than assumed. */
export interface LegatoVoiceReading {
  /** Notes that carried the voice already sounding instead of starting their own recording — no new attack. */
  joins: number;
  /** Notes that asked for a handover and did not get one. Each is a fresh attack, and the reason is here. */
  refusals: LegatoVoiceRefusalEntry[];
}

/** One event to play, as the sink sees it. */
export interface LegatoVoiceRequest {
  /** Which lane — a voice is never carried across lanes, and this is the plan's own `trackIndex`. */
  trackIndex: number;
  name: string;
  /** Which line of its onset this note is, from the plan (`OfflineAudioLaneEvent.voiceRank`). */
  rank: number;
  pitch: number;
  atSeconds: number;
  /** How long the note sounds. Absent means the recording's own remaining length, the same reading the sink gives a plain sample. */
  seconds?: number;
  /** The rate this event's own region resolved to — what a fresh attack would play at. */
  ratio: number;
  /** The recording's own length in seconds, at rate 1. From the decoded buffer. */
  recordingSeconds: number;
  /** The plan's handover request, when the rule allowed one. */
  join?: LegatoJoinMark;
  /** Start a fresh voice. Called when there is no handover to perform, and for every note when there is none. */
  start: () => SamplerVoice;
}

export interface LegatoVoiceLedger {
  /**
   * Play this event: carry the sounding voice when the plan asked and the recording allows, start a fresh one otherwise.
   *
   * Returns the voice that is now responsible for the note — the carried one or a new one. A caller that needs to know
   * *which* it was reads `reading()`, because the difference is a count of attacks rather than a different object.
   */
  play(request: LegatoVoiceRequest): SamplerVoice;
  /** What was carried and what was refused, over every event played so far. */
  reading(): LegatoVoiceReading;
}

/** A voice that is still sounding, with the arithmetic its carry needs. */
interface HeldVoice {
  voice: SamplerVoice;
  pitch: number;
  /** The rate it is playing at now — the carry's base, because the next interval is measured from this pitch. */
  ratio: number;
  /** When it started playing at `ratio`. */
  sinceSeconds: number;
  /** Recording-seconds already consumed **before** `sinceSeconds`, so a voice carried twice is still measured once. */
  consumedSeconds: number;
}

/** A handover may overrun the recording by less than this and still be counted as fitting — a frame of float noise, not a musical allowance. */
const CARRY_EPSILON_SECONDS = 1e-6;

export interface LegatoVoiceLedgerOptions {
  /**
   * The release a carried voice is given when its recording still has sound at the carried note's end — the same
   * `DEFAULT_SAMPLER_RELEASE_SECONDS` the sink gives a fresh note under the same condition, so a note's ending does
   * not depend on whether its beginning was carried.
   */
  releaseSeconds?: number;
}

/**
 * **The ledger.** One per render (or per playback session): it holds what is sounding right now, which is a fact
 * about a performance rather than about a pattern.
 */
export function createLegatoVoiceLedger(options: LegatoVoiceLedgerOptions = {}): LegatoVoiceLedger {
  const releaseSeconds = options.releaseSeconds ?? DEFAULT_SAMPLER_RELEASE_SECONDS;
  const held = new Map<string, HeldVoice>();
  const reading: LegatoVoiceReading = { joins: 0, refusals: [] };
  const keyOf = (request: Pick<LegatoVoiceRequest, "trackIndex" | "rank">) => `${request.trackIndex}:${request.rank}`;

  const refuse = (
    request: LegatoVoiceRequest,
    reason: LegatoVoiceRefusal,
    because: string,
    sounding: HeldVoice | undefined
  ): void => {
    reading.refusals.push({
      reason,
      trackIndex: request.trackIndex,
      name: request.name,
      atSeconds: request.atSeconds,
      pitch: request.pitch,
      ...(sounding ? { fromPitch: sounding.pitch } : {}),
      because,
    });
  };

  return {
    play(request) {
      const key = keyOf(request);
      const sounding = held.get(key);
      const join = request.join;
      /**
       * ⭐ **The plan asked for a handover: try to make it, and refuse out loud when it cannot be made.**
       *
       * Four ways it can fail, and each one is a fresh attack rather than a shorter or a silent note: the voice is
       * gone (it was never started, or it has ended), the voice is not sounding the pitch the plan named (so this
       * rank's line has moved on), the recording would run out before the carried note ends, or the voice's own end
       * is baked into the node and cannot be moved.
       */
      if (join !== undefined) {
        if (!sounding || sounding.voice.ended) {
          refuse(request, "no-sounding-voice", "the voice this note would have been handed is not sounding", sounding);
        } else if (sounding.pitch !== join.fromPitch) {
          refuse(
            request,
            "no-sounding-voice",
            `the voice on this line is sounding ${sounding.pitch}, not ${join.fromPitch}, so the handover would carry the wrong note`,
            sounding
          );
        } else {
          const consumed = sounding.consumedSeconds + (request.atSeconds - sounding.sinceSeconds) * sounding.ratio;
          const ratio = shiftedRatio(sounding.ratio, request.pitch - sounding.pitch);
          /**
           * ⭐⭐ **A voice whose recording loops cannot run out, so the recording-length refusal does not apply to it.**
           *
           * ## The ruling, and why it is this side
           *
           * `recording-would-run-out` asks *"does the recording still have sound at the instant the carried note ends?"*
           * For a one-shot recording that is a question about **time**: 4.25 s of note against 1.861 s of bytes left, and
           * the answer is no. For a **looping** recording it is not a question about time at all — the playhead wraps and
           * the sounding material is unbounded — so applying the bound anyway would refuse the one case the loop exists
           * to make possible. The owner's strings are the other case and are unchanged: `VlnEns_susVib_*` declare no loop
           * and carry no `smpl`, so their 25 refusals are still 25 refusals.
           *
           * ## Why the *voice's own* `looping` is the flag, rather than a field on the request
           *
           * Because it is the fact itself. `request.recordingSeconds` is the buffer's length; whether that length is a
           * wall is a property of the node that was started, and `SamplerVoice` already reports it (`voice.looping`,
           * set from the region's `loop_mode` **or** the recording's `smpl` chunk — see `src/audio/sampleLoader.ts`).
           * A second copy on the request could disagree with the voice it describes, and "the ledger thinks it loops and
           * the voice does not" is a note that goes silent after all.
           *
           * ## What the industry says (the same sentence the fallback itself rests on)
           *
           * `loop_continuous`'s own definition is *"once the player reaches sample loop point, the loop will play until
           * note expiration"* — a bound that is note expiration, not the recording's end
           * (<https://sfzformat.com/opcodes/loopmode/>). A handover to a sounding voice is exactly "the note continues";
           * there is nothing left for the recording to run out of.
           */
          const remainingWallSeconds = sounding.voice.looping
            ? Number.POSITIVE_INFINITY
            : Math.max(0, (request.recordingSeconds - consumed) / ratio);
          /**
           * **An unstated length means the recording's remaining length**, which is the rule the sink already uses for
           * a plain sample (its bytes are the whole event). It therefore always fits, and is carried. A looping voice
           * never reaches this branch with an unstated length in practice — every instrument event carries its `gate` —
           * and `rawRemaining` is finite even when the bound above is not, so the fallback stays a real number rather
           * than an infinity the node would refuse.
           */
          const rawRemaining = Math.max(0, (request.recordingSeconds - consumed) / ratio);
          const length = Number.isFinite(request.seconds) ? (request.seconds as number) : rawRemaining;
          if (length > remainingWallSeconds + CARRY_EPSILON_SECONDS) {
            refuse(
              request,
              "recording-would-run-out",
              `carrying this voice to ${request.pitch} would need ${round3(length)} s of "${request.name}"'s recording and only ${round3(remainingWallSeconds)} s is left, so the note would go silent instead of joining`,
              sounding
            );
          } else {
            const carried = sounding.voice.takeOver({
              ratio,
              atSeconds: request.atSeconds,
              endsAtSeconds: request.atSeconds + length,
              releaseSeconds: length < remainingWallSeconds ? releaseSeconds : undefined,
            });
            if (carried) {
              reading.joins += 1;
              held.set(key, {
                voice: sounding.voice,
                pitch: request.pitch,
                ratio,
                sinceSeconds: request.atSeconds,
                consumedSeconds: consumed,
              });
              return sounding.voice;
            }
            refuse(
              request,
              "voice-cannot-be-extended",
              "the sounding voice's end is fixed inside its node (it was started with a scheduled length), so it cannot be carried on",
              sounding
            );
          }
        }
      }
      /**
       * **A fresh attack.** It registers under the same lane and rank, which is what lets the *next* change carry this
       * voice — including after a refusal, where the voice being replaced keeps sounding to its own written end and is
       * simply no longer the one a join would continue.
       */
      const voice = request.start();
      held.set(key, {
        voice,
        pitch: request.pitch,
        ratio: Number.isFinite(request.ratio) && request.ratio > 0 ? request.ratio : 1,
        sinceSeconds: request.atSeconds,
        consumedSeconds: 0,
      });
      return voice;
    },
    reading() {
      return { joins: reading.joins, refusals: [...reading.refusals] };
    },
  };
}

/** Three decimals, so a seconds figure in a refusal reads as a measurement rather than a float tail. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
