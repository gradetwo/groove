/**
 * Turning an engine into the player a v2 arrangement needs — the seam between "the application has an `AudioEngine`" and "a view can play an arrangement".
 *
 * The engine lives in the studio's world as a ref, while `/new` is a route outside it. Rather than reaching into that ref — which would tie a new project's lifetime to a view it was built to be independent of —
 * this takes the things the player actually needs and nothing else: **a context and a destination** for the audition and the sampler steps, and **the engine's own transport** for the notes.
 *
 * **The transport is here because the first version of this seam could not play a note.** It exposed only `audioContext` and `musicDestination`, so `play` went to `playAudioLanes`, which starts one sample per
 * lane per bar and only for a lane whose `track_id` is `"audio"` — a drumkit or instrument lane compiled with four steps on produced zero events and play was silent. The engine's sequencer (`setPattern` +
 * `play`, which is how the studio plays a real pattern) was not reachable at all. Widening the seam is the whole fix; the player's job is then to hand it a pattern.
 *
 * **A catalogue that fails to load is reported, not thrown.** The sampler lane needs it to resolve an instrument; a lane with no instrument is a stated refusal rather than an exception in a click handler,
 * which would show the user nothing at all.
 */
import type { ArrangementPlayer, ArrangementTransport, ArrangementTransportState } from "./playArrangementV2";
import type { SampleAsset } from "../data/sampleCatalogue";
import { browserSampleDecoder } from "./browserSampleGraph";
import { createSampleLoader, type SampleDecoder } from "./sampleLoader";
import { startSamplerNote, type SamplerVoice } from "./samplerVoice";
import { KeyswitchState } from "./sfz/keyswitch";
import {
  createSamplerLanePlayback,
  type SamplerLaneEngine,
  type SamplerLanePlayback,
} from "./samplerLanePlayback";
import type { AudioEngine } from "./AudioEngine";
import type { SequencerPattern } from "../types/genre";

/**
 * What an engine has to offer — the getters `AudioEngine` already exposes, named so a fake is honest rather than a reimplementation.
 *
 * ⭐ **It extends {@link SamplerLaneEngine}**, because the arrangement's sampler lanes are sounded by
 * `createSamplerLanePlayback` — the one entry point — and the merge is only honest if both surfaces are still describing
 * the same engine. The extra fields below are what is genuinely the *player's* half: the tempo, the transport, and the
 * observation callbacks.
 *
 * `setPattern`/`play`/`stop`/`setBpm` are **optional**, because an engine-shaped object without them still supports the audition, and a caller that hands one over should hear why the transport half does not
 * work rather than see a `TypeError`. The signatures are `AudioEngine`'s own, so the two cannot drift.
 */
export interface EngineAudioTap extends SamplerLaneEngine {
  /** The pattern the sequencer plays. Absent means "this engine cannot play notes", which `play` reports rather than assumes. */
  setPattern?: (pattern: SequencerPattern, resetStates?: boolean) => void;
  play?: AudioEngine["play"];
  stop?: AudioEngine["stop"];
  /**
   * ⭐ **The other half of the transport toggle, and the one the owner's report is about.**
   *
   * `stop` returns to the top and `pause` holds the place; the arrangement's Play button is labelled Pause while it is
   * running, so it is `pause` it has to reach. Optional like the rest of the transport half, because an engine-shaped
   * object can still play and stop without one — and the player says what it does when the answer is "stop" (see
   * `pauseTransport`) rather than pretending a position survived.
   */
  pause?: AudioEngine["pause"];
  /**
   * ⭐ **Whether a stop would return the transport somewhere** — the question `stopTransport` has to ask, because
   * "not playing" is also what a paused engine says and a paused engine is exactly what a stop must clear. Optional:
   * an engine that cannot answer falls back to its playing state (see `stopTransport`).
   */
  canReturnToStart?: AudioEngine["canReturnToStart"];
  /** The arrangement's tempo, so a note's beat is the length the arrangement says rather than the studio's last. */
  setBpm?: AudioEngine["setBpm"];
  /**
   * ⭐ **The observation half of the transport, so the arrangement can draw where playback is and light its buttons.**
   *
   * Named as `AudioEngine`'s own methods so the two cannot drift, and optional because an engine-shaped object that only plays still answers the question the play button asks; it just cannot answer the playhead's.
   */
  getCurrentStep?: AudioEngine["getCurrentStep"];
  getIsPlaying?: AudioEngine["getIsPlaying"];
  setOnStep?: AudioEngine["setOnStep"];
  setOnPlay?: AudioEngine["setOnPlay"];
  setOnStop?: AudioEngine["setOnStop"];
}

export interface PlayerDependencies {
  engine: EngineAudioTap;
  /** Loading the catalogue; in the application `appCatalogueRuntime.load`, in a criterion a promise that resolves or rejects. */
  loadCatalogue: () => Promise<{ assets: readonly SampleAsset[] }>;
  /**
   * The two I/O seams `createSampleLoader` already takes, injected here for the same reason it takes them: an audition is a network fetch and a decode, and a criterion that had to provide both would be judging the browser rather than the pitch.
   */
  decode?: SampleDecoder;
  fetchSfzText?: (url: string) => Promise<string>;
}

export function createArrangementPlayer({ engine, loadCatalogue, decode, fetchSfzText }: PlayerDependencies): ArrangementPlayer {
  /**
   * The voices a preview has started, so a key release can stop them and a fast player cannot leave a pile of sources running. Bounded: a keyboard cannot press more keys at once than a person has fingers, but a stuck key or a repeated `keydown` with
   * `event.repeat` ignored is exactly how an unbounded list happens.
   */
  const voices = new Map<number, SamplerVoice[]>();
  const MAX_VOICES_PER_NOTE = 8;
  /**
   * ⭐ **The keys whose voices ignore a release**, because the region says `loop_mode=one_shot`.
   *
   * A drum hit rings out however briefly the key is held, so releasing it must not stop anything — measured with sfizz: the same 0.1-second note on a one-second sample lasts 2.091 s with `one_shot` and 0.341 s without. **A choke still stops these**: `one_shot` governs the key release and `off_by` governs the choke, and they answer different questions.
   */
  const oneShotKeys = new Set<number>();
  /**
   * ⭐ **One keyswitch state per track — the live, sticky/non-sticky articulation machine (`src/audio/sfz/keyswitch.ts`).**
   *
   * ## Why this layer, and why keyed by track
   *
   * It cannot live in the loader: `audition` builds a fresh `createSampleLoader` on **every key press**, so loader-held state would be forgotten between two
   * notes of one performance. It cannot live in `regionsForNote`, which is pure and re-entered per note. What has to own it is the layer that owns a
   * *sequence* of key presses for one instrument — this one, which is the only path in the repository with both a press (`audition`) and a release
   * (`releaseNote`), and which is what the arrangement keyboard in `ArrangementViewV2` actually calls.
   *
   * Keyed by **track**, not by track-and-note, because the state is per instrument instance: the reference engine keeps one `currentSwitch_` per loaded
   * instrument (`SynthPrivate.h:292`) rather than one per key or per channel, and one track here is one instrument instance. Keying it by note would give every
   * key its own state; keying it globally would let two tracks cross switches, which is the owner's explicit "多轨不能串".
   */
  const keyswitches = new Map<string, KeyswitchState>();
  /**
   * The same states, indexed by the **voice key** a release names (`keyFor(trackId, midi)`) — because `releaseNote` gets a track and a note and no asset, so it cannot
   * rebuild the track-or-asset key above on its own.
   */
  const keyswitchByVoiceKey = new Map<number, KeyswitchState>();
  /** The state one track's keyboard is driving — created on first use and kept, so a sticky switch survives between notes. */
  const keyswitchFor = (trackId: string | undefined, assetId: string): KeyswitchState => {
    // A track with no id still gets its own state rather than sharing one: the asset is the best identity left, and two id-less tracks either differ by asset or are the same instrument.
    const key = trackId ?? `asset:${assetId}`;
    const existing = keyswitches.get(key);
    if (existing) return existing;
    const created = new KeyswitchState();
    keyswitches.set(key, created);
    return created;
  };
  /**
   * ⭐ **The recorded lanes' notes, owned by the one controller that places them.**
   *
   * This used to be a local `scheduled: SamplerVoice[]` plus a local `engine.onLoopWrap` handler and a local
   * `planSamplerSteps` call — the same three pieces `src/audio/samplerLanePlayback.ts` owns, written twice. The player
   * now hands that controller the three facts only it has (the catalogue's lanes, its own loader seams, and the
   * stand-down call) and stops owning the voices itself; `stopScheduled` is the whole of "silence the sampler half"
   * again, and it is the controller's `stop` rather than a second list that could fall out of step with it.
   */
  let recorded: SamplerLanePlayback | null = null;

  /**
   * The step a `pause` left the transport on, so the next `play` continues instead of restarting.
   *
   * `null` is "there is no position to continue from" — nothing has been paused, or a stop has happened since (see
   * `stopTransport`). It is read and cleared by `play`, so one pause can only ever produce one resume.
   */
  let pausedAtStep: number | null = null;

  /**
   * ⭐ **The voices that are sounding, with the choke group each belongs to.**
   *
   * SFZ's `off_by=N` means "starting me stops whatever is sounding in group N", which is how a closed hi-hat silences an open one. The group is on the note because the resolver read it off the region that answered — the player only has buffers, and a buffer does not say which hat it is.
   *
   * Keyed by the note rather than kept in one list so a key release still stops exactly what it started, and the choke runs over all of them because the file's groups are not per key.
   */
  const soundingByGroup = new Map<number, Set<SamplerVoice>>();
  const rememberGroup = (group: number | undefined, voice: SamplerVoice) => {
    if (group === undefined) return;
    const set = soundingByGroup.get(group) ?? new Set<SamplerVoice>();
    set.add(voice);
    soundingByGroup.set(group, set);
  };
  /** Stop every voice in one group, and say how many were stopped so the caller can report it rather than guess. */
  const choke = (group: number | undefined): number => {
    if (group === undefined) return 0;
    const set = soundingByGroup.get(group);
    if (!set) return 0;
    let stopped = 0;
    for (const voice of set) {
      try {
        // A fade and not a cut: measured with sfizz, a choke takes about fifty milliseconds to reach one percent, and stopping dead is what a click is.
        voice.fadeOut();
        stopped += 1;
      } catch {
        // A voice that has already ended is not an error: `stop()` is idempotent in intent, and a choke that throws would silence the note that caused it.
      }
    }
    set.clear();
    return stopped;
  };

  const audition = async ({ assetId, midi, trackId, gainDb }: { assetId: string; midi: number; trackId?: string; gainDb?: number }) => {
    /**
     * ⭐ **The key press is recorded before anything can await**, because the order of presses is what `sw_previous` means and what the sticky switch is.
     *
     * `loadNote` is a fetch and a decode, so two quick presses can interleave; recording here, synchronously, keeps the state in the order the keys were actually
     * pressed. And the press is recorded even when the audio engine is not ready, because a keyboard's key press happened either way — the reference engine updates
     * its switch state in `noteOnDispatch`, before any voice is started, and refuses the *voice*, not the switch.
     */
    const keyswitch = keyswitchFor(trackId, assetId);
    keyswitchByVoiceKey.set(keyFor(trackId, midi), keyswitch);
    keyswitch.noteOn(midi, DEFAULT_AUDITION_VELOCITY);
    if (engine.audioContext === null || engine.musicDestination == null) {
      // Reported rather than thrown, the same way `play` reports a missing engine: a key press that throws is worse than one that is silent for a stated reason.
      return { ok: false as const, reason: "audio engine is not ready" };
    }
    /**
     * ⭐ **Held in a local, because the seam's destination is optional and an `await` below resets the narrowing.**
     *
     * `EngineAudioTap` extends `SamplerLaneEngine`, whose `musicDestination` is `AudioNode | null | undefined` (the
     * controller tolerates an engine-shaped double that has no destination yet). Narrowing the *property* survives until
     * the first `await`; a `const` does not have that problem, and this is also the value the voice is actually started
     * on, so the two cannot disagree.
     */
    const destination = engine.musicDestination;
    /**
     * ⭐ **A key press is a gesture, so it is where a suspended context has to be resumed — and this path never did.**
     *
     * The engine resumes its own context inside `play()`, which covers the transport. **Auditioning is a separate path** that starts a voice directly, so on any visit where the audio-start gate did not appear (it shows once, remembered in `localStorage`) there was no gesture in the session at all and the browser kept the context suspended: pressing a key produced **silence and no message**, because the caller discarded the result. That is a bug report with no evidence in it, which is the worst kind.
     *
     * `resume()` is called here rather than left to the caller because this is the moment a gesture exists and the note is about to be started — and if the browser still refuses, the reason travels back so the screen can say it instead of staying quiet.
     */
    const context = engine.audioContext;
    if (context.state !== "running") {
      /**
       * **Asked as a capability, because the seam's type is `BaseAudioContext` and an offline context has no `resume`.**
       *
       * The first version called `context.resume()` directly and the type check refused it — correctly, since the seam exists so an `OfflineAudioContext` can stand in. A context that cannot resume is reported like one that refused, which is the honest answer for both.
       */
      const resumable = context as BaseAudioContext & { resume?: () => Promise<void> };
      if (typeof resumable.resume === "function") {
        try {
          await resumable.resume();
        } catch {
          // The refusal is reported below, by reading the state rather than by trusting the exception.
        }
      }
      // Read **fresh, into a wider type**: after the check above TypeScript narrows `state` to the value it just matched, so comparing it with `"running"` again reads as a mistake.
      const stateAfterResume: string = context.state;
      if (stateAfterResume !== "running") {
        return { ok: false as const, reason: "the browser has not allowed audio to start — tap the screen or press play once, then play a key" };
      }
    }
    const { assets } = await loadCatalogue();
    const loader = createSampleLoader(
      decode ?? browserSampleDecoder(engine.audioContext),
      assets,
      // The default fetches; a criterion passes its own so the note resolution is what is judged.
      fetchSfzText
    );
    try {
      const note = await loader.loadNote(assetId, midi, { keyswitch });
      /**
       * ⭐ **The new note asks about its own `group`, and each voice registered what silences it.** The choke still happens before the new voice starts, so the cut is heard as the new note rather than as a gap after it.
       *
       * That is the opposite of what this code did first, and the difference was **measured with sfizz** rather than argued. A frequency-selective measurement — 440 Hz for the note that should be silenced, 1500 Hz for the note that triggers it — over two spellings of the same pair:
       *
       *   · `off_by=2` on the 440 Hz region, `group=2` on the 1500 Hz one → **440 Hz falls from 0.0502 to 0.0002** while 1500 Hz keeps sounding: silenced.
       *   · `off_by=1` on the 1500 Hz region, `group=1` on the 440 Hz one → **440 Hz stays at 0.0502**: nothing is silenced at all.
       *
       * So SFZ's `off_by=N` means "**stop me** when a voice in group N starts" — the victim names its killer — and this project had it backwards, with criteria that encoded the wrong reading and therefore stayed green.
       */
      choke(note.group);
      const key = keyFor(trackId, midi);
      /**
       * ⭐ **`note_polyphony` is a cap that refuses the new note, and the count is of voices still sounding.**
       *
       * Measured with sfizz on four hits of one note: absent → the level of 4.04 voices, `note_polyphony=1` → 1.01, `=2` → 2.02, `=3` → 3.03. And with a loud first hit followed by three quiet ones at `note_polyphony=1`, the level stays at the loud one's (0.0831 against a 0.0811 reference) — so the note that arrives while the cap is reached is **refused**, not swapped in for the oldest.
       *
       * The check is here, **before the voice is started**, because the alternative is a note that does not sound and was started anyway. The count has to ignore voices that have finished: a one-shot drum hit ends by itself, and counting those would start refusing notes a minute after the kit was last touched. And what this replaces was worse than it looks — the list was trimmed to eight **without stopping the trimmed voices**, so beyond eight hits a note kept sounding with nothing left able to release it.
       */
      const cap = note.notePolyphony ?? MAX_VOICES_PER_NOTE;
      const sounding = (voices.get(key) ?? []).filter((voice) => !voice.ended);
      if (sounding.length >= cap) {
        return { ok: false as const, reason: `note_polyphony=${cap} is already sounding for this note` };
      }
      /**
       * The controller-driven level, in decibels, because that is what the voice takes: `amplitude_onccN` measured as a **linear** scale of `(CC ÷ 127) × (N ÷ 100)`, so a region at CC 64 with `N=100` is about −6 dB. A note with no such opcode has no scale and is started exactly as it was before.
       */
      const controllerGainDb = note.gainScale === undefined ? 0 : 20 * Math.log10(Math.max(note.gainScale, 1e-6));
      const startGainDb = (gainDb ?? 0) + controllerGainDb;
      const voice = startSamplerNote({
        context: engine.audioContext,
        destination,
        buffer: note.buffer,
        ratio: note.ratio,
        ...(startGainDb === 0 ? {} : { gainDb: startGainDb }),
      });
      // Registered under **what silences it** (`off_by`), because that is what a later note looks up: a new note asks "does my group stop anything?", not "who declared that they stop me?".
      rememberGroup(note.offBy, voice);
      // A one-shot key is remembered as such, so the release that follows knows there is nothing to stop.
      if (note.oneShot) oneShotKeys.add(key);
      else oneShotKeys.delete(key);
      sounding.push(voice);
      voices.set(key, sounding);
      return {
        ok: true as const,
        ratio: note.ratio,
        samplePath: note.samplePath,
        // Which articulation answered, when a keyswitch decided it — the caller can print the file's own name for it rather than guess from a sample path.
        ...(note.switchState === undefined ? {} : { switchState: note.switchState }),
        ...(note.switchLabel === undefined ? {} : { switchLabel: note.switchLabel }),
      };
    } catch (error) {
      // A refusal from the loader is a result here too: the key press is answered with why, and the instrument's own gaps are named rather than turned into silence.
      return { ok: false as const, reason: error instanceof Error ? error.message : String(error) };
    }
  };

  /**
   * Stop every sampler voice `play` started, and report how many.
   *
   * ⭐ **This is the sampler half only, and it used to be the whole of `stop` — which is why the Stop button was silent while the engine's own lanes kept playing.** The engine's transport is stopped by `stopTransport` below; the two
   * halves are kept apart because `play` needs the sampler half on its own before the engine starts (see there), and nothing else does.
   *
   * ⭐ **The loop handler leaves with the voices**, and that is the controller's own guarantee now rather than a line
   * here: `createSamplerLanePlayback` installs the handler, restores whatever owned it before on `stop`, and drops
   * every voice it placed. A stopped transport therefore cannot plan a pass nobody will hear, and this function cannot
   * forget to do it.
   */
  const stopScheduled = (): number => {
    const stopped = recorded?.stop() ?? 0;
    recorded = null;
    return stopped;
  };

  /**
   * ⭐ **A stop, over both halves of what `play` started.**
   *
   * The arrangement is sounded by two things at once: the engine's own sequencer (the compiled pattern's lanes) and this player's sampler voices, which are started on the audio clock because the engine has no SFZ loader. The
   * first version of `stop` only spliced the voices, so `AudioEngine.stop()` was never called, no `CLOCK_STOP` was ever published, and the lane voices kept sounding — the owner's "the stop button does nothing", measured.
   *
   * ⭐ And the transport half is skipped only when the engine **says** it is stopped: "cannot answer" is not "nothing to
   * stop", and an engine that cannot be asked must still be stopped rather than leaving the original bug in place for
   * a differently shaped engine. Asking first is what keeps a fresh play from publishing a `CLOCK_STOP` on a
   * transport that was never running.
   *
   * ⭐ It is also what `play` calls first, which is what makes pressing play twice **one** transport rather than two layered ones: `AudioEngine.play()` returns early when it is already playing, so without a stop here a second
   * press left the engine where it was and re-scheduled every sampler voice over the top of the first pass.
   *
   * ⭐ **And a stop is the end of the position as well as of the sound**, so any resume this player was holding is
   * dropped here. `stopScheduled` below silences the voices; this is the other half, and keeping them together is what
   * stops a later `play` from resuming a pass the user has since stopped.
   */
  const stopTransport = (): number => {
    pausedAtStep = null;
    const stopped = stopScheduled();
    /**
     * ⭐ **Asked as "is there anything to stop?", not "is it playing?" — and the difference is a paused transport.**
     *
     * This guard exists so a first play does not publish a `CLOCK_STOP` on a transport that never ran, and
     * `getIsPlaying() !== false` answered that. But `false` is also what a **paused** engine says, and a paused engine
     * is holding the very position Stop exists to clear: pressing Stop after a pause silenced the sampler and left the
     * engine where it was, so the playhead stayed put and the button looked broken. The engine's own
     * `canReturnToStart()` answers both cases (running *or* holding a position), and the old reading is kept as the
     * fallback for an engine-shaped object that cannot be asked.
     */
    const canStop = engine.canReturnToStart?.() ?? (engine.getIsPlaying?.() !== false);
    if (canStop) engine.stop?.();
    return stopped;
  };

  /**
   * ⭐ **A pause: silence what `play` started and hold the transport's place.**
   *
   * The engine's own `pause()` keeps its step and the next `play()` continues from it; that pair is the whole of the
   * behaviour the button promises. The sampler voices this player scheduled are stopped, because a note already on the
   * audio clock cannot be un-scheduled — and they are *re-planned from the held step* on resume (see `play`).
   *
   * ⭐ **An engine with no `pause` gets the honest fallback rather than a fake one.** A stop is the only silence such
   * an object has, and `pausedAtStep` stays `null` so the next `play` does not claim to resume from a position nothing
   * kept. The real `AudioEngine` has `pause`, so this is the path for a hand-built double, not for the app.
   */
  const pauseTransport = (): number => {
    const stopped = stopScheduled();
    if (engine.pause) {
      pausedAtStep = engine.getCurrentStep?.() ?? 0;
      engine.pause();
    } else {
      pausedAtStep = null;
      if (engine.getIsPlaying?.() !== false) engine.stop?.();
    }
    return stopped;
  };

  /**
   * ⭐ **A fan-out, because the engine's `setOnStep` is one slot.**
   *
   * A subscriber installed straight onto the engine would silently take the place of whoever subscribed before it, and its unsubscribe would take the *next* one's place right back — so the second playhead on a page is the one that
   * moves and the first is the one that freezes, with nothing to say why. `playheadBus.ts` exists for the studio for the same reason; the listeners live here and the engine is wired once.
   *
   * ⭐ The unwire **clears the callbacks rather than restoring captured ones**: `EngineAudioTap` exposes setters and no getters, and the route's engine is built by `useAudioEngineInstance` with no callbacks at all — so there is nothing
   * to restore, and a no-op is the honest replacement for "this player is gone". Leaving the callbacks pointing at an unmounted view's nodes would be the worse failure.
   */
  const transportListeners = new Set<(state: ArrangementTransportState) => void>();
  let transportWired = false;
  const reportTransport = (state: ArrangementTransportState): void => {
    for (const listener of transportListeners) {
      try {
        listener(state);
      } catch {
        // A listener must never be able to stop the transport's step callback — the same rule `playheadBus` states.
      }
    }
  };
  const wireTransport = (): void => {
    if (transportWired) return;
    transportWired = true;
    engine.setOnStep?.((info) => reportTransport({ step: info.step, playing: true }));
    engine.setOnPlay?.(() => reportTransport({ step: engine.getCurrentStep?.() ?? 0, playing: true }));
    /**
     * ⭐ **Read back rather than assumed to be zero.** `stop()` resets the engine's step, so this is what returns the
     * playhead to the top — and `pause()` keeps it, so the same line is also what *holds* the playhead where it was.
     * The report is the engine's own answer either way, which is why the view's picture and its buttons cannot
     * disagree with the transport about which of the two just happened.
     */
    engine.setOnStop?.(() => reportTransport({ step: engine.getCurrentStep?.() ?? 0, playing: false }));
  };
  const unwireTransport = (): void => {
    if (!transportWired) return;
    transportWired = false;
    engine.setOnStep?.(() => undefined);
    engine.setOnPlay?.(() => undefined);
    engine.setOnStop?.(() => undefined);
  };

  const transport: ArrangementTransport = {
    read: () => ({ step: engine.getCurrentStep?.() ?? 0, playing: engine.getIsPlaying?.() ?? false }),
    subscribe: (listener) => {
      transportListeners.add(listener);
      wireTransport();
      return () => {
        transportListeners.delete(listener);
        // Only the last one out unwires: an earlier unsubscribe must not deafen a subscriber that is still mounted.
        if (transportListeners.size === 0) unwireTransport();
      };
    },
  };

  return {
    async play({ pattern, samplerLanes, bpm }) {
      // ⭐ Nothing to play into yet, or nothing that can sequence. Reported rather than thrown, because a throw inside a click handler shows the user nothing at all.
      if (engine.audioContext === null || engine.musicDestination === null) {
        // eslint-disable-next-line no-console -- the same shape the transport uses when the engine is not ready
        console.warn("audio engine is not ready; nothing was played");
        return { planned: 0, reason: "audio engine is not ready" };
      }
      if (!engine.setPattern || !engine.play) {
        // The audition half of this seam needs neither, so a caller can hand over an engine-shaped object without a transport. Saying so is better than the `TypeError` that would otherwise reach the click handler.
        // eslint-disable-next-line no-console -- the same shape the transport uses when the engine is not ready
        console.warn("audio engine has no transport; the arrangement was not played");
        return { planned: 0, reason: "audio engine has no transport" };
      }

      /**
       * The tempo first, then the pattern: `setPattern` derives nothing about tempo unless it is asked to reset state, and the arrangement's own `bpm` is the length of a beat that every step time is computed from.
       */
      engine.setBpm?.(bpm);
      engine.setPattern(pattern);

      /**
       * ⭐ **A resume is not a restart, and the difference is one flag.**
       *
       * `pausedAtStep` is what this player was told to hold by `pause()`. When it is set, the press is a *continue*:
       * the sampler voices left over from the paused pass are silenced (they are already on the audio clock and cannot
       * be un-scheduled), but the engine is **not** stopped — `AudioEngine.play()` picks up the step its own `pause()`
       * kept, and the sampler lanes are re-planned from that same step a few lines below.
       *
       * Without this branch every press went through `stopTransport`, which resets the engine's step to zero: that is
       * the owner's report, "the button says Pause and it goes back to the top", at the seam where it happened.
       */
      const resumeFrom = pausedAtStep;
      pausedAtStep = null;
      if (resumeFrom === null) {
        /**
         * Nothing from a previous play survives this one: a scheduled note cannot be unscheduled once it is on the
         * audio clock, so pressing play again silences the old arrangement rather than layering the two. Done
         * **before** the catalogue is awaited, so a second press has already taken effect by the time the first
         * press's load resolves.
         *
         * ⭐ **Both halves**, so this is a real restart rather than a re-schedule: the engine's `play()` returns early
         * while it is already playing, so a stop that only spliced the sampler voices left the lanes running from
         * wherever they were while the sampler started over from the top. One press, one transport.
         */
        stopTransport();
      } else {
        // The silenced half only. The engine's own voices are released by its `pause()` already, and stopping it here
        // is exactly the rewind this change removes.
        stopScheduled();
      }

      /**
       * **The transport starts before the samples are resolved.** `AudioEngine.play` marks the first step a fixed lead ahead of `currentTime`, and every sampler note is placed from `currentTime` afterwards —
       * so starting first is what puts the two on one grid. Starting after would offset the whole sampler lane by however long the catalogue took to answer, which is the kind of skew that sounds like a
       * performance problem rather than a scheduling one.
       */
      await engine.play();

      /**
       * What the caller is told about the sampler half: `problem` is the answer this press returns, and `servedProblem`
       * is the lanes the catalogue could not serve, held apart from the schedule's own failures because the two have
       * different fixes and are joined only once both are known.
       */
      let problem: string | undefined;
      let servedProblem: string | undefined;

      /**
       * ⭐ **The recorded lanes are sounded by the one controller that owns them.**
       *
       * This block used to hold its own copy of `planSamplerSteps` + `scheduleSamplerSteps` + a wrap handler + a voice
       * list — the same three decisions `src/audio/samplerLanePlayback.ts` owns, and the copy that had to be fixed twice
       * (the resume offset, the retained loader). What is genuinely the player's is handed over instead: the lanes
       * `playArrangementV2` already resolved and filtered, a loader built from this player's own decode/fetch seams, and
       * the stand-down call, which must run **before** the first note is placed so a recorded lane is never doubled.
       *
       * The tempo goes into the plan because the overlap rule measures in seconds: "was the previous voice still
       * sounding when this note began?" is a question about seconds, and a step is only seconds once a tempo says so —
       * the same call `planOfflineAudioLanes` makes for a render (`src/audio/legatoJoin.ts`).
       */
      if (samplerLanes.length > 0) {
        let assets: readonly SampleAsset[] = [];
        try {
          assets = (await loadCatalogue()).assets;
        } catch (error) {
          // The engine can still play the lanes that need no catalogue; the sampler steps are what cannot, and that is the reported reason.
          problem = `sampler notes were not resolved: catalogue unavailable (${error instanceof Error ? error.message : String(error)})`;
          // eslint-disable-next-line no-console -- the same shape the transport uses when the catalogue is unavailable
          console.warn("catalogue unavailable; the arrangement's sampler steps are silent", error);
        }
        if (assets.length > 0) {
          const playback = createSamplerLanePlayback({
            engine,
            pattern,
            catalogue: assets,
            bpm,
            /**
             * ⭐ **The lanes the arrangement already chose, not a second resolution of them.** `playArrangementV2`
             * applied `deriveTrackStates`' audibility rule to the *compiled* arrangement, whose lane order is the
             * engine pattern's — asking the engine's own track states here would answer about a different pattern, and
             * re-running the resolver would be the second mapping this module exists to prevent.
             */
            lanes: samplerLanes,
            /**
             * This player's own decode/fetch seams, so a criterion judges the note rather than the browser; built once
             * and reused by every wrap, because a loader that went out of scope with the first pass is exactly how a
             * looping lane goes silent on the second.
             */
            loaderFor: (catalogue, context) =>
              createSampleLoader(decode ?? browserSampleDecoder(context), catalogue, fetchSfzText),
            /**
             * ⭐ **The engine stands its own synthesiser down for exactly the lanes this catalogue can sound.**
             *
             * The pattern reached the engine before the catalogue answered — deliberately, because the transport has to
             * start on the gesture — so this is where the two facts meet: the engine knows which lanes are recorded
             * instruments (the written table, read off its own pattern) and the catalogue knows which recordings it
             * holds. The call is made **before** the steps are scheduled, so the only window in which a lane could be
             * doubled is the engine's own lookahead rather than a whole pass. A lane whose recording this mirror does
             * not serve is absent from the set and keeps the synthesiser it has today, and its sentence is composed into
             * this play's report below.
             */
            speak: (catalogue) => {
              const prepared = engine.prepareSampledLanes?.(catalogue) ?? { stoodDown: [], problems: [] };
              servedProblem = prepared.problems.length > 0 ? prepared.problems.join("; ") : undefined;
            },
            /**
             * **The first pass's report is what the caller is answered with.** A resolution that failed names itself, and
             * the lanes this catalogue could not serve are added to it — a different failure with a different fix. Later
             * passes are not reported: a problem on pass seven must not change what pass one said.
             */
            onFirstPassProblems: (problems) => {
              // Assigned, not appended: a catalogue warning from an earlier attempt is no longer true once a load has succeeded and a pass has been placed.
              const reasons = [...problems, ...(servedProblem === undefined ? [] : [servedProblem])];
              problem = reasons.length > 0 ? reasons.join("; ") : undefined;
            },
            warn: (message) => {
              // eslint-disable-next-line no-console -- the same prefix and shape `useTransportActions` reports sampler problems with
              console.warn(message);
            },
          });
          recorded = playback;
          /**
           * ⭐ **On a resume, the lanes rejoin the engine's grid at the step the engine resumed on.** The events before
           * it belong to the part of the pass that was already played and are skipped, and the grid offset puts the
           * resumed step at now — so the held position sounds like one pass with a gap in it rather than like a second
           * pass laid over the first.
           */
          await playback.play(bpm, resumeFrom === null ? {} : { fromStep: resumeFrom });
          // A stop that landed while the catalogue resolved owns the lane now, not this pass.
          if (recorded !== playback) playback.stop();
        }
      }

      // What was planned is the steps the engine was handed: the pattern is the arrangement, and zero is the honest answer when every lane is empty.
      const planned = pattern.tracks.reduce((total, lane) => total + lane.steps.filter((value) => value !== 0).length, 0);
      return problem === undefined ? { planned } : { planned, problem };
    },
    stop: stopTransport,
    pause: pauseTransport,
    transport,
    audition,
    releaseNote({ trackId, midi }) {
      /**
       * ⭐ **The release moves the switch state as well as the voices**, and it does so **before** the one-shot early return below: a `sw_up` region's whole condition
       * is *"the key … is not depressed"* (<https://sfzformat.com/opcodes/sw_down/>), so a release that never reached the state would leave an ornamentation switch
       * stuck down for the rest of the session.
       */
      keyswitchByVoiceKey.get(keyFor(trackId, midi))?.noteOff(midi);
      const key = keyFor(trackId, midi);
      /**
       * ⭐ **A one-shot voice is not stopped by a release, and the count says zero.** Returning the number of voices actually stopped is what makes this visible to a criterion: a file that asks for a ringing drum hit answers `0` here, and one that does not answers the number it stopped.
       */
      if (oneShotKeys.has(key)) return 0;
      const list = voices.get(key);
      if (!list) return 0;
      voices.delete(key);
      for (const voice of list) voice.stop();
      return list.length;
    },
  };
}

/**
 * The velocity a hand-played key carries when the caller names none.
 *
 * It is the same 100 the loader has always defaulted to (`playbackForNote`'s `velocity = 100`), written down here because the keyswitch state now needs it at the moment
 * of the press — before the loader is reached — so that `sw_vel=previous` and a velocity-selected articulation see the same number the note will be resolved with.
 */
const DEFAULT_AUDITION_VELOCITY = 100;

/**
 * A voice is keyed by **track and note**, which is what a key release names. Without the track, two sampler tracks playing the same note would stop each other — and with only the note, a piano's sustain would be cut by the next track's key press.
 */
function keyFor(trackId: string | undefined, midi: number): number {
  // A caller that does not name a track still gets its own key space: a keyboard preview on "the selected track" should not collide with one on another.
  const track = trackId ?? "";
  let hash = midi;
  for (let index = 0; index < track.length; index += 1) hash = (hash * 31 + track.charCodeAt(index)) % 2 ** 31;
  return hash;
}
