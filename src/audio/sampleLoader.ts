/**
 * Loading the samples an audio lane names — the part of the graph where the defects actually live.
 *
 * Scheduling a buffer source is a handful of lines; what goes wrong is the bookkeeping around it. Two rules, both learned the hard way by every audio codebase that
 * ever cached a decode:
 *
 *   1. **one decode per asset**, even when two lanes ask at the same instant — so the cache holds the **promise**, not the result, and a second caller awaits the
 *      first one's work rather than starting it again;
 *   2. **a failed decode is not cached** — because a cache that remembers failure turns one transient problem into a permanent one, and the retry that would have
 *      worked never happens.
 *
 * The decoder is injected rather than called directly, which is what lets both rules be tested without an audio context: `decodeAudioData` needs a browser, and the
 * bookkeeping around it does not.
 */
import { findSampleAsset, sampleAssetIds } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";
import { resolveInstrumentNote } from "./sfz/instrument";
import type { KeyswitchState } from "./sfz/keyswitch";
import { expandRemoteIncludes } from "./sfz/remoteIncludes";
import { sampleAssetForPath } from "./sfz/instrument";
import { parseSfz } from "./sfz/parse";
import { resolveSamplePath } from "./sfz/defaultPath";
import { noCorsProbe, transportNote } from "./transportDiagnostic";
import { createWaveLoopReader, type WaveLoopPoints } from "./wavLoop";

/**
 * ⭐ **A decoded asset, and the loop its own bytes carry.**
 *
 * The bytes are in the decoder's hands and nowhere else — `decodeAudioData` **detaches** the `ArrayBuffer` it is given —
 * so a decoder that has them can answer both questions at once, for free. That is the shape a browser adapter wants to
 * return; a decoder that only ever returns an `AudioBuffer` stays valid, and `createSampleLoader`'s fifth parameter
 * ({@link SampleWaveLoopReader}) is the seam for a caller whose decoder cannot say.
 */
export interface DecodedSample {
  buffer: AudioBuffer;
  /** The recording's own embedded sustain loop, when it has one — see `src/audio/wavLoop.ts`. */
  waveLoop?: WaveLoopPoints;
}

/** Decodes one asset. In the browser this wraps `decodeAudioData`; in a test it is a plain function. */
export type SampleDecoder = (asset: SampleAsset) => Promise<AudioBuffer | DecodedSample>;

/**
 * ⭐ **How a recording's own loop is obtained when the decoder did not report one.**
 *
 * The default is **undefined, deliberately**: a caller that never wired this keeps the behaviour it had, byte for byte,
 * including a criterion's fake decoder which must not be made to touch a network. `WavExporter` passes
 * `createWaveLoopReader()`, which reads the `smpl` chunk over HTTP `Range` requests without downloading the audio.
 */
export type SampleWaveLoopReader = (asset: SampleAsset) => Promise<WaveLoopPoints | undefined>;

/** Whether a decoder answered with the richer shape. */
function isDecodedSample(value: AudioBuffer | DecodedSample): value is DecodedSample {
  return typeof value === "object" && value !== null && "buffer" in value && (value as DecodedSample).buffer !== undefined;
}

export interface SampleLoader {
  /** Resolves to the decoded buffer, or rejects with a reason a composer can act on. */
  load(assetId: string): Promise<AudioBuffer>;
  /**
   * The buffer for **one note** of an entry that is an instrument: resolve the note through the SFZ, then load the sample it names.
   *
   * This is a separate entry point rather than an overload of `load`, because they answer different questions: `load` is "one id, one buffer", while an instrument is
   * one id and **many** buffers, chosen per note. Folding the second into the first would make `load` mean two things, which is how a caller ends up with the wrong
   * sample and no error to show for it.
   *
   * Rejects with a reason when the entry is not an instrument, when its SFZ cannot be fetched, when the note is covered by no region, or when the named sample cannot
   * be decoded — never a silent default, which is the standard the ninth track kind was held to.
   */
  /**
   * One note, resolved and decoded: **the buffer and the rate it must be played at.**
   *
   * It used to return the buffer alone, and the ratio `resolveInstrumentNote` had just computed was discarded — so the sampler path had no pitch at all and nothing in the application called this method. Returning both is what makes a
   * sampler play the note rather than the recording.
   */
  loadNote(
    assetId: string,
    note: number,
    options?: { velocity?: number; nth?: number; technique?: string; keyswitch?: KeyswitchState }
  ): Promise<LoadedNote>;
  /** How many decodes have actually run — for a test, and for a probe that wants to prove rule 1 rather than trust it. */
  decodes(): number;
}

export interface LoadedNote {
  buffer: AudioBuffer;
  /** The playback rate this sample needs to sound at the requested note: `2^((note − root)/12) × 2^(cents/1200)`. */
  ratio: number;
  /** The sample the note resolved to, relative to the library root — so a diagnostic can name the file rather than the buffer. */
  samplePath: string;
  /**
   * ⭐ **Which articulation answered, when a keyswitch decided it** — the value in force and the file's own `sw_label` for it.
   *
   * Carried for the same reason the choke group is: only the resolver saw the region that answered, and "the wrong articulation
   * played" and "no keyswitch support" are indistinguishable from a buffer. Absent means the note was not gated by a keyswitch at all.
   */
  switchState?: number;
  switchLabel?: string;
  /** The region's key centre, absent when the file sets none — which means "no transposition" rather than 60. */
  rootKey?: number;
  /**
   * The region's choke group and what it silences, passed through from the resolver.
   *
   * Carried here rather than looked up again by the player, because **the player never sees the SFZ text**: it gets a decoded buffer, and the file's opinion about which hat silences which is not recoverable from a buffer.
   */
  group?: number;
  offBy?: number;
  /**
   * Whether the sample ignores a key release — SFZ's `loop_mode=one_shot`.
   *
   * Measured with sfizz rather than inferred from the opcode's name: the same 0.1-second note on a one-second sample renders **2.091 s** with `one_shot` and **0.341 s** without, and the energy 0.2–0.6 s after the note-off is nonzero only in the first case.
   */
  oneShot?: boolean;
  /**
   * ⭐ **What the note's loop is** — `loop_continuous` or `loop_sustain`, from whichever layer declared it.
   *
   * Two layers can declare a loop and the priority between them is the SFZ specification's own, not this project's
   * invention (`https://sfzformat.com/opcodes/loopmode/`: *"If `loop_mode` is not specified, each sample will play
   * according to its predefined loop mode according to the loop metadata in the audio file… the player will play the
   * sample looped using the first defined loop, if available"*):
   *
   *   1. **The region's own `loop_*` opcodes win, always** — `loop_continuous`/`loop_sustain` are carried through
   *      unchanged, and `loop_start`/`loop_end` alone (with no `loop_mode`) suppress the recording's loop exactly as
   *      they did before this existed, because SFZ's default for a file that writes neither is `no_loop`.
   *   2. **An explicit refusal wins too** — `loop_mode=one_shot` (which also arrives as `oneShot`) and `loop_mode=no_loop`
   *      both mean "do not loop", and neither is overridden by a `smpl` chunk. For `no_loop` this is read off the SFZ
   *      text rather than the resolver, because the resolver deliberately drops that value into "absent"; see
   *      `sfzSpeaksAboutLoops` below for the one conservative consequence of that.
   *   3. **Only when the SFZ says nothing** does the recording's own `smpl` chunk decide, and then the mode is
   *      **`loop_continuous`** — the specification's stated default for "samples with defined loop(s)".
   *
   * Absent still means "do not loop", which is SFZ's own default for a file that declares nothing and a recording that
   * carries nothing. The player holds a decoded buffer, and a buffer does not say whether the region that named it
   * wanted the recording to repeat; see `samplerVoice` for what is done with this field.
   */
  loopMode?: "loop_continuous" | "loop_sustain";
  /** The loop's bounds in **frames of the source sample**. Absent `loopEndFrames` means the sample's last frame. `endFrame` is inclusive, as both SFZ and the `smpl` chunk write it. */
  loopStartFrames?: number;
  loopEndFrames?: number;
  /**
   * ⭐ **Which layer declared the loop**, so a report can say where a note's sustain came from rather than implying the
   * SFZ wrote it. `"sfz"` is a region opcode; `"recording"` is the WAV's own `smpl` chunk. **Present exactly when
   * `loopMode` is** — a region that writes only `loop_start`/`loop_end` has declared frames without asking for a loop,
   * and reporting that as a loop's source would name a loop that does not happen.
   */
  loopSource?: "sfz" | "recording";
  /** The file's `note_polyphony`: a cap on how many voices of this note may sound at once. Measured — see the resolver, where the numbers are. */
  notePolyphony?: number;
  /** The controller-driven level scale the region asked for (`amplitude_onccN`), applied when the note is started. */
  gainScale?: number;
}

export function createSampleLoader(
  decode: SampleDecoder,
  catalogue: readonly SampleAsset[] = [],
  /**
   * How an instrument's SFZ text is obtained. Injected for the same reason the decoder is: fetching is I/O, and the decisions worth testing are not.
   *
   * It defaults to a fetch of the entry's `sfz.url`, so a browser caller needs to pass nothing.
   */
  fetchSfzText: (url: string) => Promise<string> = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SFZ "${url}" could not be fetched (${response.status})`);
    return response.text();
  },
  /**
   * A second attempt at the same URL, made **only to explain a transport failure** — see `transportNote`.
   *
   * It is injected for the same reason the decoder is: a criterion can then prove what the note says without a network. It defaults to a
   * `no-cors` fetch of the same address, which is the cheapest way to separate "this host does not answer" from "this host answers but does not
   * admit this origin".
   */
  probeTransport: (url: string) => Promise<unknown> = noCorsProbe,
  /**
   * ⭐ **The recording's own loop, when the decoder did not report one** — see {@link SampleWaveLoopReader}.
   *
   * It is the last parameter and it defaults to nothing, so every existing caller is unchanged down to the network
   * traffic it causes.
   */
  readWaveLoop?: SampleWaveLoopReader
): SampleLoader {
  const cache = new Map<string, Promise<DecodedSample>>();
  let decodes = 0;

  /**
   * Decode an **asset**, with the single-flight rule in one place.
   *
   * Extracted so a region's sample can be decoded without a catalogue lookup: the catalogue holds instruments while a region names a file, so the sample path becomes an address
   * (`sampleAssetForPath`) and must still share this cache — a sample used by several notes is decoded once whichever route reached it.
   */
  const decodeAsset = (asset: SampleAsset): Promise<DecodedSample> => {
    const cached = cache.get(asset.assetId);
    if (cached) return cached;
    decodes += 1;
    const pending = decode(asset)
      .then((result) => (isDecodedSample(result) ? result : { buffer: result }))
      .catch((error: unknown) => {
        // Rule 2: a failure leaves the cache as it was, so the next caller gets a real attempt rather than yesterday's error.
        cache.delete(asset.assetId);
        throw error;
      });
    cache.set(asset.assetId, pending);
    return pending;
  };

  /**
   * ⭐ **One header read per sample, not one per note.**
   *
   * A chord of three notes on one recording would otherwise ask for the same `smpl` chunk three times, and a lane of
   * sixty notes on five recordings thirty times over. The two rules are the decode cache's own, because the reason for
   * them is the same: the cache holds the **promise** (so two notes asking at once share one read), and a **failure is
   * not cached** (a transient 502 must not become a permanently one-shot instrument).
   *
   * A reader that throws is answered with "no loop" rather than an exception: this is instrument resolution, and a
   * recording whose header cannot be read is the one-shot it was before this existed.
   */
  const waveLoops = new Map<string, Promise<WaveLoopPoints | undefined>>();
  const waveLoopFor = (asset: SampleAsset): Promise<WaveLoopPoints | undefined> => {
    if (!readWaveLoop || !asset.url) return Promise.resolve(undefined);
    const cached = waveLoops.get(asset.assetId);
    if (cached) return cached;
    const pending = readWaveLoop(asset).catch(() => {
      waveLoops.delete(asset.assetId);
      return undefined;
    });
    waveLoops.set(asset.assetId, pending);
    return pending;
  };

  /**
   * ⭐ **Which samples this program speaks about looping** — read from the SFZ text, because the resolver cannot say.
   *
   * `no_loop` is the value the resolver drops on purpose (its `loopMode` field only ever carries the two looping
   * values), so "the region wrote `no_loop`" and "the region wrote nothing" arrive here identically. The difference
   * matters: the first is an explicit refusal that must beat a `smpl` chunk, the second defers to it. So the text is
   * consulted, once per program, for **any** `loop_*` opcode on **any** region naming the sample that answered.
   *
   * The consequence, stated rather than discovered later: that test is per **sample**, not per region. If two regions
   * name the same file and only one writes a loop opcode, the recording's own loop is suppressed for both. That is the
   * conservative direction — it can only ever leave a note playing exactly as it does today — and no library the mirror
   * serves needs it to be finer (the measured programs either write a loop for every region or for none).
   */
  const loopDeclarations = new Map<string, Set<string>>();
  const declaredSamples = (assetId: string, text: string): Set<string> => {
    const cached = loopDeclarations.get(assetId);
    if (cached) return cached;
    const declared = new Set<string>();
    for (const region of parseSfz(text)) {
      if (region.opcodes.loop_mode === undefined && region.opcodes.loop_start === undefined && region.opcodes.loop_end === undefined) continue;
      declared.add(region.sample);
    }
    loopDeclarations.set(assetId, declared);
    return declared;
  };

  /**
   * ⭐ **The expanded program, fetched once per asset rather than once per note.**
   *
   * `loadNote` used to fetch the SFZ, follow every `#include` and expand the file **on every call**, so an instrument
   * was re-downloaded for each note it played. Measured on `render_audio {genreId:"bebop"}` — one bar, sixteen notes,
   * three instruments — that was **99 of 106 requests** (17 program/include files and 82 library data files) and
   * **21 of the 26.6 seconds** the render spent waiting on the network; the actual audio was seven `.wav` fetches
   * totalling 7.67 MB. `karoryfer-meatbass:pizz-basic`'s program alone was fetched four times for four bass notes.
   *
   * The decode cache never covered this: it is keyed by **sample**, and a program is not a sample. So this is the
   * second cache, keyed by **asset**, and it follows the same two rules the decode cache states — single-flight (the
   * cache holds the *promise*, so two notes asking at once share one fetch) and **a failure is not cached** (a cache
   * that remembers a transient 502 turns it into a permanent silent instrument).
   *
   * What it does not cache is `parseSfz`, which still runs per note on the same text. That is CPU rather than network
   * and it is not the measured cost; caching parsed instruments would be a third thing, and this one is the one the
   * number names.
   */
  const programs = new Map<string, Promise<{ text: string }>>();
  const expandedProgram = (asset: SampleAsset & { sfz: NonNullable<SampleAsset["sfz"]> }): Promise<{ text: string }> => {
    const cached = programs.get(asset.assetId);
    if (cached) return cached;
    const pending = (async () => {
      let sfzText: string;
      try {
        sfzText = await fetchSfzText(asset.sfz.url);
      } catch (primaryError) {
        const fallback = asset.sfz.fallbackUrl;
        if (!fallback) throw primaryError;
        try {
          sfzText = await fetchSfzText(fallback);
        } catch (fallbackError) {
          const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
          const notes = [await transportNote(asset.sfz.url, probeTransport), await transportNote(fallback, probeTransport)];
          throw new Error(
            `${asset.assetId}: neither address served the SFZ — source ${asset.sfz.url}: ${reason(primaryError)}${notes[0] ?? ""}; ` +
              `mirror ${fallback}: ${reason(fallbackError)}${notes[1] ?? ""}`
          );
        }
      }
      const programPath = asset.sfz.path;
      const baseUrl = programPath ? asset.sfz.url.slice(0, asset.sfz.url.length - programPath.length) : asset.sfz.url;
      return expandRemoteIncludes(sfzText, { fetchText: fetchSfzText, programUrl: programPath || asset.sfz.url, baseUrl });
    })();
    pending.catch(() => programs.delete(asset.assetId));
    programs.set(asset.assetId, pending);
    return pending;
  };

  const api: SampleLoader = {
    load(assetId: string): Promise<AudioBuffer> {
      const cached = cache.get(assetId);
      if (cached) return cached.then((decoded) => decoded.buffer);

      const asset = findSampleAsset(assetId, catalogue);
      if (!asset) {
        // Rejected, and deliberately **not** cached: nothing about this attempt can be remembered as a fact about the asset.
        const known = sampleAssetIds(catalogue);
        return Promise.reject(
          new Error(
            known.length
              ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}`
              : `no sample "${assetId}" — no samples ship with the app yet, so every sample reference is an error until they do`
          )
        );
      }

      return decodeAsset(asset).then((decoded) => decoded.buffer);
    },
    async loadNote(assetId, note, options = {}) {
      const asset = findSampleAsset(assetId, catalogue);
      if (!asset) {
        const known = sampleAssetIds(catalogue);
        throw new Error(known.length ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}` : `no sample "${assetId}" — no samples ship with the app yet`);
      }
      if (!asset.sfz) throw new Error(`sample "${assetId}" is not an instrument (it has no sfz), so a note cannot select a sample from it`);

      /**
       * ⭐ **The program is fetched and expanded once per asset, through `expandedProgram` above** — this used to be
       * inline here, which is what made every note re-download its instrument. The two-address rule, the include
       * expansion and the diagnostics that name both hosts on failure all live there unchanged; what changed is that
       * the second note of a piano chord no longer pays for them again.
       */
      const expanded = await expandedProgram(asset as SampleAsset & { sfz: NonNullable<SampleAsset["sfz"]> });
      const resolution = resolveInstrumentNote(asset, expanded.text, note, options);
      if (!resolution.ok || !resolution.note) throw new Error(resolution.reason ?? `note ${note} could not be resolved for "${assetId}"`);

      // Through `load`, so a sample shared by several notes is decoded once — the single-flight rule applies to the sample, not to the note.
      /**
       * **A region names a file; the catalogue holds instruments** — so a miss here is expected, not an error. When the catalogue does have it, the id route is still used (it is what the app's own
       * bundled samples rely on); otherwise the path becomes an address, source-first with the mirror as fallback, and goes through the **same** decode cache.
       */
      /**
       * The `default_path` joins the region's `sample` before anything resolves it, and it is **the one the region itself answers to** rather than a file-level first
       * value. Salamander declares `default_path=Samples/` and names its samples `harmLA0.flac`, so without a join the address is one directory too high — not an error, a
       * missing file, and an instrument that simply does not sound.
       *
       * Reading a single value for the whole file is what the pinned library's keyswitch programs defeat: `CelloEns-KS.sfz` declares four different paths, one per folded
       * articulation, and only the section's own path names directories its samples exist in. The path now travels with the region from the parser, which is the only place
       * that saw where in the file the region was written.
       */
      if (resolution.note.defaultPathProblem) throw new Error(`${asset.assetId}: ${resolution.note.defaultPathProblem}`);
      const samplePath = resolveSamplePath(resolution.note.samplePath, resolution.note.defaultPath);
      /**
       * ⭐ **The sample, as an asset, before either question about it is asked.** The address is resolved once and then
       * used twice: once to decode the bytes, once to read the `smpl` chunk out of them. Building it twice is how the
       * two come to disagree (a `default_path` joined in one place and not the other), so it is built once.
       */
      const knownAsset = findSampleAsset(samplePath, catalogue);
      const sampleAsset = knownAsset ?? sampleAssetForPath(samplePath, { programUrl: asset.sfz.url, programFallbackUrl: asset.sfz.fallbackUrl });
      const decoded = await decodeAsset(sampleAsset);
      const buffer = decoded.buffer;

      /**
       * ⭐ **SFZ first, recording second, and that order is the specification's** — see `LoadedNote.loopMode`.
       *
       * `sfzSpoke` is true when the resolver carried **any** loop fact (`loop_continuous`, `loop_sustain`,
       * `loop_start`, `loop_end`, `one_shot`) **or** when the program's own text writes a loop opcode against the
       * sample that answered. The text half exists for one value the resolver drops on purpose — `loop_mode=no_loop`
       * — and it is deliberately the conservative test: it can only ever *withhold* the recording's loop, never
       * invent one, so a file this reading is wrong about still plays exactly as it does today.
       */
      const sfzSpokeAboutLoops =
        resolution.note.loopMode !== undefined ||
        resolution.note.loopStartFrames !== undefined ||
        resolution.note.loopEndFrames !== undefined ||
        resolution.note.oneShot === true ||
        declaredSamples(asset.assetId, expanded.text).has(resolution.note.samplePath);
      const recordingLoop = sfzSpokeAboutLoops ? undefined : decoded.waveLoop ?? (await waveLoopFor(sampleAsset));
      /**
       * The mode the recording's own loop plays as: **`loop_continuous`**, which is `loop_mode`'s stated default for
       * *"samples with defined loop(s)"* (<https://sfzformat.com/opcodes/loopmode/>). Nothing here invents a
       * `loop_sustain` reading the file did not ask for.
       */
      const loopMode = sfzSpokeAboutLoops ? resolution.note.loopMode : recordingLoop ? "loop_continuous" : undefined;
      const loopStartFrames = resolution.note.loopStartFrames ?? recordingLoop?.startFrame;
      const loopEndFrames = resolution.note.loopEndFrames ?? recordingLoop?.endFrame;
      const loopSource =
        loopMode === undefined ? undefined : resolution.note.loopMode !== undefined ? ("sfz" as const) : ("recording" as const);
      const noteInfo = {
        ratio: resolution.note.ratio,
        samplePath,
        // Which articulation answered, when a keyswitch decided it — only the resolver saw the region.
        ...(resolution.note.switchState === undefined ? {} : { switchState: resolution.note.switchState }),
        ...(resolution.note.switchLabel === undefined ? {} : { switchLabel: resolution.note.switchLabel }),
        ...(resolution.note.rootKey === undefined ? {} : { rootKey: resolution.note.rootKey }),
        // The choke group travels with the note, because only the resolver knew which region answered it.
        ...(resolution.note.group === undefined ? {} : { group: resolution.note.group }),
        ...(resolution.note.offBy === undefined ? {} : { offBy: resolution.note.offBy }),
        // The release behaviour travels with the note for the same reason the choke group does: only the resolver saw the region that answered.
        ...(resolution.note.oneShot === undefined ? {} : { oneShot: resolution.note.oneShot }),
        /**
         * And so does the loop's — now from **either** layer, with the SFZ's declaration having already won the
         * argument above. `loopSource` names which one it was, because a report that says "this note loops" without
         * saying where the loop came from cannot distinguish a file that asked for one from a recording that carries one.
         */
        ...(loopMode === undefined ? {} : { loopMode }),
        ...(loopStartFrames === undefined ? {} : { loopStartFrames }),
        ...(loopEndFrames === undefined ? {} : { loopEndFrames }),
        ...(loopSource === undefined ? {} : { loopSource }),
        ...(resolution.note.notePolyphony === undefined ? {} : { notePolyphony: resolution.note.notePolyphony }),
        ...(resolution.note.gainScale === undefined ? {} : { gainScale: resolution.note.gainScale }),
      };
      return { buffer, ...noteInfo };
    },
    decodes: () => decodes,
  };
  return api;
}
