/**
 * Ableton Live Project (.als) Direct Exporter (P7-01)
 *
 * Generates valid, native Gzip-compressed Ableton Live Set XML Schema:
 * - Compatible with Ableton Live 10, 11, and 12
 * - 8 dedicated MIDI tracks (Kick, Snare, Hi-Hat, Percussion, Bass, Chords, Lead, FX)
 * - 2 Return tracks (A-Reverb, B-Delay) and 1 Master track with global tempo & time signature
 * - Complete MIDI clip and KeyTracks note events with swing, polymeter, ratchets, velocity & gate
 * - Track names, 70-color palette assignment, volume gain, stereo pan, mute/solo, and send levels
 */

import { MAX_NOTE_GATE_STEPS, SequencerPattern, SequencerTrack } from "../types/genre";
import { patternSeed, probabilityPasses } from "./noteEvents";
import { chordNotesForStep } from "./chordVoicing";

export interface ExportAlsOptions {
  bpm: number;
  /**
   * The clip the export is built from. Still required, so every existing caller and every existing test is unaffected.
   *
   * When `clips` is given this is the one the **track list** is taken from — the lanes are the song's, not each section's — and
   * the clips are what get placed on the timeline.
   */
  pattern: SequencerPattern;
  /**
   * One clip per arrangement section: where each starts, in beats from the top of the set.
   *
   * `pattern` alone produces a single session clip, which is what an exported **song** was reduced to until now. A DAW-native
   * version of a song is one clip per section at its own position, and that is what this list is for
   * (`docs/DAW_MCP_REFACTOR.md`, stage 5's ALS item). Omitted or empty, the builder behaves exactly as it always has.
   */
  clips?: Array<{ pattern: SequencerPattern; startBeats: number; name?: string }>;
  genreName?: string;
  scaleName?: string;
}

export interface ExportedAls {
  xml: string;
  data: Uint8Array;
  blob: Blob;
  filename: string;
}

// 70-color palette mapping for Ableton Live
// Tracks use shifted index (140 + P), Clips use raw index (0..69)
export const TRACK_COLOR_PALETTES = [
  { track: 154, clip: 14 }, // Red (Kick 808/909)
  { track: 157, clip: 17 }, // Amber Yellow (Snare)
  { track: 161, clip: 21 }, // Cyan (Hi-Hat)
  { track: 159, clip: 19 }, // Lime Green (Percussion)
  { track: 163, clip: 23 }, // Deep Blue (Sub Bass)
  { track: 164, clip: 24 }, // Royal Purple (Chords / Pad)
  { track: 166, clip: 26 }, // Hot Pink (Lead Synth)
  { track: 151, clip: 11 }, // Violet (FX / Riser)
];

// MIDI standard mapping for 8 tracks
export const TRACK_MIDI_MAPPINGS = [
  { isDrum: true, channel: 9, baseNote: 36, defaultName: "Kick" },        // C1
  { isDrum: true, channel: 9, baseNote: 38, defaultName: "Snare" },       // D1
  { isDrum: true, channel: 9, baseNote: 42, defaultName: "Hi-Hat" },      // F#1
  { isDrum: true, channel: 9, baseNote: 39, defaultName: "Percussion" },  // D#1 (Clap)
  { isDrum: false, channel: 0, baseNote: 36, defaultName: "Bass" },       // C1
  { isDrum: false, channel: 1, baseNote: 48, defaultName: "Chords" },     // C2
  { isDrum: false, channel: 2, baseNote: 60, defaultName: "Lead" },       // C3
  { isDrum: false, channel: 3, baseNote: 72, defaultName: "FX" },         // C4
];

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface NoteEventData {
  time: number;
  duration: number;
  velocity: number;
  noteId: number;
}

/**
 * Builds standard Ableton Live Set XML Schema string (MajorVersion 5, MinorVersion 10.0_377)
 * Directly openable by Ableton Live 10, 11, and 12.
 */
export function buildAbletonLiveSetXml(options: ExportAlsOptions): string {
  const { bpm = 120, pattern, genreName = "Groove" } = options;
  const resolution = pattern.resolution || "1/16";
  const stepBeats = resolution === "1/8" ? 0.5 : resolution === "1/32" ? 0.125 : 0.25;
  const totalSteps = pattern.totalSteps || (pattern.tracks[0]?.steps?.length || 16);
  const loopLengthBeats = totalSteps * stepBeats;
  const globalSwing = pattern.swing !== undefined ? pattern.swing / 100 : 0;
  const exportSeed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });

  // Parse time signature (default: 4/4)
  const [numStr, denStr] = (pattern.timeSignature || "4/4").split("/");
  const numerator = parseInt(numStr, 10) || 4;
  const denominator = parseInt(denStr, 10) || 4;

  let currentId = 1;
  const nextId = () => currentId++;

  const sceneCount = 8;
  const trackXmlChunks: string[] = [];

  // Ensure 8 tracks
  const tracksToExport: SequencerTrack[] = [];
  for (let i = 0; i < 8; i++) {
    if (pattern.tracks && pattern.tracks[i]) {
      tracksToExport.push(pattern.tracks[i]);
    } else {
      const defaultMap = TRACK_MIDI_MAPPINGS[i] || TRACK_MIDI_MAPPINGS[0];
      tracksToExport.push({
        track_id: defaultMap.defaultName.toLowerCase() as any,
        name: defaultMap.defaultName,
        instrument: defaultMap.defaultName.toLowerCase(),
        steps: new Array(totalSteps).fill(0),
      });
    }
  }

  tracksToExport.forEach((track, trackIdx) => {
    const trackId = nextId();
    const defaultMap = TRACK_MIDI_MAPPINGS[trackIdx] || TRACK_MIDI_MAPPINGS[0];
    const trackName = escapeXml(track.name || defaultMap.defaultName);
    const palette = TRACK_COLOR_PALETTES[trackIdx % TRACK_COLOR_PALETTES.length];

    // Volume & Pan mappings
    const volLinear = track.volume !== undefined ? track.volume : 0.8;
    const gain = Math.max(0.0003162, Math.min(1.995, volLinear));
    const pan = Math.max(-1.0, Math.min(1.0, track.pan !== undefined ? track.pan : 0.0));
    const isMuted = !!track.mute;
    const isSolo = !!track.solo;
    const sendA = Math.max(0.0003162, Math.min(1.0, track.sendA !== undefined ? track.sendA : 0.0003162));
    const sendB = Math.max(0.0003162, Math.min(1.0, track.sendB !== undefined ? track.sendB : 0.0003162));

    // Automation & Modulation Target IDs
    const spkId = nextId();
    const volTargetId = nextId();
    const volModId = nextId();
    const panTargetId = nextId();
    const panModId = nextId();
    const sendATargetId = nextId();
    const sendAModId = nextId();
    const sendBTargetId = nextId();
    const sendBModId = nextId();

    /**
     * One clip slot's XML, for one pattern and one scene.
     *
     * The parameter is named `pattern` deliberately: the body below refers to `pattern` throughout, so shadowing means this
     * extraction needs **no** edits inside it. A section is a **scene** in Ableton's session matrix, which is what an
     * arrangement already is (`docs/DAW_MCP_REFACTOR.md`, stage 5's ALS item).
     */
    const buildClipSlot = (pattern: SequencerPattern, sceneId: number): string => {
    // Notes collection: map of midiKey -> array of events
    const keyMap = new Map<number, NoteEventData[]>();
    const steps = track.steps || [];
    const velocities = track.velocity || [];
    const pitches = track.pitch || [];
    const gates = track.gate || [];
    const ratchets = track.ratchet || [];
    const probabilities = track.probability || [];
    const trackSwing = track.swing !== undefined ? track.swing / 100 : 0;
    const effSwing = Math.max(0, Math.min(0.75, globalSwing + trackSwing));

    const isHat = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");
    const trackLen = track.trackLength && track.trackLength > 0 ? track.trackLength : steps.length || 16;

    let noteIdCounter = 1;

    for (let step = 0; step < totalSteps; step++) {
      const stepIdx = trackLen > 0 ? step % trackLen : step;
      const stepVal = steps[stepIdx] || 0;
      if (stepVal <= 0) continue;

      // N-04: deterministic probability so the .als clip matches the MIDI and WAV exports.
      if (!probabilityPasses(probabilities[stepIdx], exportSeed, trackIdx, stepIdx)) continue;

      let stepTimeBeats = step * stepBeats;
      if (step % 2 === 1 && effSwing > 0) {
        stepTimeBeats += effSwing * 0.5 * stepBeats;
      }

      const vel = Math.max(1, Math.min(127, velocities[stepIdx] !== undefined ? velocities[stepIdx] : 100));
      const gateVal = gates[stepIdx] !== undefined ? Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, gates[stepIdx])) : 0.8;

      let pitchOffset =
        pitches[stepIdx] !== undefined && pitches[stepIdx] !== null
          ? pitches[stepIdx]!
          : defaultMap.baseNote;

      if (isHat) {
        if (stepVal === 2) pitchOffset = 46; // Open Hi-Hat
        else if (stepVal === 3) pitchOffset = 44; // Pedal Hi-Hat
        else pitchOffset = 42; // Closed Hi-Hat
      } else if (!defaultMap.isDrum && pitchOffset <= 24 && pitchOffset > 0) {
        pitchOffset = defaultMap.baseNote + pitchOffset;
      }

      const noteNumber = Math.max(0, Math.min(127, pitchOffset));
      const isHatTriplet = isHat && stepVal === 3;
      const ratchet = ratchets[stepIdx] && ratchets[stepIdx] > 1 ? ratchets[stepIdx] : isHatTriplet ? 3 : 1;

      const stack = track.pitches?.[stepIdx];
      const hasStack = Array.isArray(stack) && stack.length > 0;
      const isChords = track.track_id === "chords" || track.name.toLowerCase().includes("chord");
      const notesToAdd = hasStack
        ? stack!.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
        : isChords
          ? (chordNotesForStep(track, stepIdx, noteNumber, pattern.scale) || [noteNumber, noteNumber + 3, noteNumber + 7])
          : [noteNumber];

      if (ratchet > 1) {
        const subStepBeats = stepBeats / ratchet;
        const subNoteDur = Math.max(0.02, subStepBeats * gateVal);
        for (let r = 0; r < ratchet; r++) {
          const subStart = stepTimeBeats + r * subStepBeats;
          const subVel = Math.min(127, Math.round(vel * (0.85 + (r / ratchet) * 0.15)));

          notesToAdd.forEach((n) => {
            const safeNote = Math.min(127, Math.max(0, Math.round(n)));
            if (!keyMap.has(safeNote)) keyMap.set(safeNote, []);
            keyMap.get(safeNote)!.push({
              time: subStart,
              duration: subNoteDur,
              velocity: subVel,
              noteId: noteIdCounter++,
            });
          });
        }
      } else {
        const noteDur = Math.max(0.04, stepBeats * gateVal);

        notesToAdd.forEach((n) => {
          const safeNote = Math.min(127, Math.max(0, Math.round(n)));
          if (!keyMap.has(safeNote)) keyMap.set(safeNote, []);
          keyMap.get(safeNote)!.push({
            time: stepTimeBeats,
            duration: noteDur,
            velocity: vel,
            noteId: noteIdCounter++,
          });
        });
      }
    }

    // Format KeyTracks XML
    const sortedKeys = Array.from(keyMap.keys()).sort((a, b) => a - b);
    const keyTracksXml = sortedKeys
      .map((k) => {
        const ktId = nextId();
        const events = keyMap.get(k) || [];
        const eventsXml = events
          .map(
            (ev) =>
              `<MidiNoteEvent Time="${ev.time.toFixed(6)}" Duration="${ev.duration.toFixed(6)}" Velocity="${ev.velocity}" OffVelocity="64" IsEnabled="true" NoteId="${ev.noteId}" />`
          )
          .join("\n\t\t\t\t\t\t\t\t\t");
        return `<KeyTrack Id="${ktId}">
\t\t\t\t\t\t\t\t\t<MidiKey Value="${k}" />
\t\t\t\t\t\t\t\t\t<Notes>
\t\t\t\t\t\t\t\t\t${eventsXml}
\t\t\t\t\t\t\t\t\t</Notes>
\t\t\t\t\t\t\t\t</KeyTrack>`;
      })
      .join("\n\t\t\t\t\t\t\t\t");

    // Clip Slot 0 contains MidiClip
    const clipId = nextId();
    const clipTimeSigId = nextId();

    const clipSlot0 = `<ClipSlot Id="${sceneId}">
\t\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t\t<ClipSlot>
\t\t\t\t\t\t\t\t\t<Value>
\t\t\t\t\t\t\t\t\t\t<MidiClip Id="${clipId}" Time="0">
\t\t\t\t\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<CurrentStart Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<CurrentEnd Value="${loopLengthBeats}" />
\t\t\t\t\t\t\t\t\t\t\t<Loop>
\t\t\t\t\t\t\t\t\t\t\t\t<LoopStart Value="0" />
\t\t\t\t\t\t\t\t\t\t\t\t<LoopEnd Value="${loopLengthBeats}" />
\t\t\t\t\t\t\t\t\t\t\t\t<StartRelative Value="0" />
\t\t\t\t\t\t\t\t\t\t\t\t<LoopOn Value="true" />
\t\t\t\t\t\t\t\t\t\t\t\t<OutMarker Value="${loopLengthBeats}" />
\t\t\t\t\t\t\t\t\t\t\t\t<HiddenLoopStart Value="0" />
\t\t\t\t\t\t\t\t\t\t\t\t<HiddenLoopEnd Value="${loopLengthBeats}" />
\t\t\t\t\t\t\t\t\t\t\t</Loop>
\t\t\t\t\t\t\t\t\t\t\t<Name Value="${trackName} Pattern" />
\t\t\t\t\t\t\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t\t\t\t\t\t\t<ColorIndex Value="${palette.clip}" />
\t\t\t\t\t\t\t\t\t\t\t<LaunchMode Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<LaunchQuantisation Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<TimeSignature>
\t\t\t\t\t\t\t\t\t\t\t\t<TimeSignatures>
\t\t\t\t\t\t\t\t\t\t\t\t\t<RemoteableTimeSignature Id="${clipTimeSigId}">
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<Numerator Value="${numerator}" />
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<Denominator Value="${denominator}" />
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<Time Value="0" />
\t\t\t\t\t\t\t\t\t\t\t\t\t</RemoteableTimeSignature>
\t\t\t\t\t\t\t\t\t\t\t\t</TimeSignatures>
\t\t\t\t\t\t\t\t\t\t\t</TimeSignature>
\t\t\t\t\t\t\t\t\t\t\t<Envelopes><Envelopes /></Envelopes>
\t\t\t\t\t\t\t\t\t\t\t<Disabled Value="false" />
\t\t\t\t\t\t\t\t\t\t\t<VelocityAmount Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<FollowTime Value="${loopLengthBeats}" /><FollowActionA Value="0" /><FollowActionB Value="0" /><FollowChanceA Value="1" /><FollowChanceB Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<Grid>
\t\t\t\t\t\t\t\t\t\t\t\t<FixedNumerator Value="1" />
\t\t\t\t\t\t\t\t\t\t\t\t<FixedDenominator Value="16" />
\t\t\t\t\t\t\t\t\t\t\t\t<GridIntervalPixel Value="20" />
\t\t\t\t\t\t\t\t\t\t\t\t<Ntoles Value="2" />
\t\t\t\t\t\t\t\t\t\t\t\t<SnapToGrid Value="true" />
\t\t\t\t\t\t\t\t\t\t\t\t<Fixed Value="true" />
\t\t\t\t\t\t\t\t\t\t\t</Grid>
\t\t\t\t\t\t\t\t\t\t\t<FreezeStart Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<FreezeEnd Value="0" />
\t\t\t\t\t\t\t\t\t\t\t<IsWarped Value="true" />
\t\t\t\t\t\t\t\t\t\t\t<Notes>
\t\t\t\t\t\t\t\t\t\t\t\t<KeyTracks>
\t\t\t\t\t\t\t\t\t\t\t\t${keyTracksXml}
\t\t\t\t\t\t\t\t\t\t\t\t</KeyTracks>
\t\t\t\t\t\t\t\t\t\t\t\t<PerNoteEventStore><EventLists /></PerNoteEventStore>
\t\t\t\t\t\t\t\t\t\t\t\t<NoteIdGenerator><NextId Value="${noteIdCounter}" /></NoteIdGenerator>
\t\t\t\t\t\t\t\t\t\t\t</Notes>
\t\t\t\t\t\t\t\t\t\t</MidiClip>
\t\t\t\t\t\t\t\t\t</Value>
\t\t\t\t\t\t\t\t</ClipSlot>
\t\t\t\t\t\t\t\t<HasStop Value="true" />
\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />
\t\t\t\t\t\t\t</ClipSlot>`;
    return clipSlot0;
  };

  /**
   * The clip slots for this track: one per section, in scene order.
   *
   * Omitted, `options.clips` is the single pattern in scene 0 — which is what this exporter has always produced, byte for byte.
   */
  const clipsForExport = options.clips?.length ? options.clips : [{ pattern, name: undefined }];
  const clipSlotsXml = clipsForExport.map((clip, index) => buildClipSlot(clip.pattern, index)).join("\n\t\t\t\t\t\t");

    const otherSlots: string[] = [];
    for (let s = clipsForExport.length; s < sceneCount; s++) {
      otherSlots.push(`<ClipSlot Id="${s}">
\t\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t\t<ClipSlot><Value /></ClipSlot>
\t\t\t\t\t\t\t\t<HasStop Value="true" />
\t\t\t\t\t\t\t\t<NeedRefreeze Value="true" />
\t\t\t\t\t\t\t</ClipSlot>`);
    }

    const freezeSlots: string[] = [];
    for (let s = 0; s < sceneCount; s++) {
      freezeSlots.push(`<ClipSlot Id="${s}" />`);
    }

    const trackXml = `<MidiTrack Id="${trackId}">
\t\t\t<LomId Value="0" />
\t\t\t<LomIdView Value="0" />
\t\t\t<IsContentSelected Value="false" />
\t\t\t<EnvelopeModePreferred Value="false" />
\t\t\t<TrackDelay><Value Value="0" /><IsValueSampleBased Value="false" /></TrackDelay>
\t\t\t<Name>
\t\t\t\t<EffectiveName Value="${trackName}" />
\t\t\t\t<UserName Value="${trackName}" />
\t\t\t\t<Annotation Value="" />
\t\t\t\t<MemorizedFirstClipName Value="" />
\t\t\t</Name>
\t\t\t<ColorIndex Value="${palette.track}" />
\t\t\t<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>
\t\t\t<TrackGroupId Value="-1" />
\t\t\t<TrackUnfolded Value="true" />
\t\t\t<DevicesListWrapper LomId="0" />
\t\t\t<ClipSlotsListWrapper LomId="0" />
\t\t\t<ViewData Value="{}" />
\t\t\t<SavedPlayingSlot Value="-1" />
\t\t\t<SavedPlayingOffset Value="0" />
\t\t\t<Freeze Value="false" />
\t\t\t<VelocityDetail Value="0" />
\t\t\t<NeedArrangerRefreeze Value="true" />
\t\t\t<PostProcessFreezeClips Value="0" />
\t\t\t<ReWireSlaveMidiTargetId Value="0" />
\t\t\t<DeviceChain>
\t\t\t\t<AutomationLanes><AutomationLanes /></AutomationLanes>
\t\t\t\t<ClipEnvelopeChooserViewState />
\t\t\t\t<AudioInputRouting>
\t\t\t\t\t<Target Value="AudioIn/External/S0" />
\t\t\t\t\t<UpperDisplayString Value="Ext. In" />
\t\t\t\t\t<LowerDisplayString Value="1/2" />
\t\t\t\t</AudioInputRouting>
\t\t\t\t<MidiInputRouting>
\t\t\t\t\t<Target Value="MidiIn/External.All/-1" />
\t\t\t\t\t<UpperDisplayString Value="All Ins" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</MidiInputRouting>
\t\t\t\t<AudioOutputRouting>
\t\t\t\t\t<Target Value="AudioOut/Master" />
\t\t\t\t\t<UpperDisplayString Value="Master" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</AudioOutputRouting>
\t\t\t\t<MidiOutputRouting>
\t\t\t\t\t<Target Value="MidiOut/None" />
\t\t\t\t\t<UpperDisplayString Value="None" />
\t\t\t\t\t<LowerDisplayString Value="" />
\t\t\t\t</MidiOutputRouting>
\t\t\t\t<Mixer>
\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t<LomIdView Value="0" />
\t\t\t\t\t<IsExpanded Value="true" />
\t\t\t\t\t<On />
\t\t\t\t\t<ParametersListWrapper LomId="0" />
\t\t\t\t\t<LastSelectedTimeableIndex Value="0" />
\t\t\t\t\t<LastSelectedClipEnvelopeIndex Value="0" />
\t\t\t\t\t<LastPresetRef />
\t\t\t\t\t<LockedScripts />
\t\t\t\t\t<IsFolded Value="false" />
\t\t\t\t\t<ShouldShowPresetName Value="false" />
\t\t\t\t\t<UserName Value="" />
\t\t\t\t\t<Annotation Value="" />
\t\t\t\t\t<SourceContext />
\t\t\t\t\t<Sends>
\t\t\t\t\t\t<TrackSendHolder Id="0">
\t\t\t\t\t\t\t<Send>
\t\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t\t<Manual Value="${sendA}" />
\t\t\t\t\t\t\t\t<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t\t\t<AutomationTarget Id="${sendATargetId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t\t<ModulationTarget Id="${sendAModId}"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t\t</Send>
\t\t\t\t\t\t\t<Active Value="true" />
\t\t\t\t\t\t</TrackSendHolder>
\t\t\t\t\t\t<TrackSendHolder Id="1">
\t\t\t\t\t\t\t<Send>
\t\t\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t\t\t<Manual Value="${sendB}" />
\t\t\t\t\t\t\t\t<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t\t\t<AutomationTarget Id="${sendBTargetId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t\t\t<ModulationTarget Id="${sendBModId}"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t\t\t</Send>
\t\t\t\t\t\t\t<Active Value="true" />
\t\t\t\t\t\t</TrackSendHolder>
\t\t\t\t\t</Sends>
\t\t\t\t\t<Speaker>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="${!isMuted}" />
\t\t\t\t\t\t<AutomationTarget Id="${spkId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<MidiCCOnOffThresholds><Min Value="64" /><Max Value="127" /></MidiCCOnOffThresholds>
\t\t\t\t\t</Speaker>
\t\t\t\t\t<SoloSink Value="${isSolo}" />
\t\t\t\t\t<PanMode Value="0" />
\t\t\t\t\t<Pan>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="${pan}" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="${panTargetId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="${panModId}"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</Pan>
\t\t\t\t\t<Volume>
\t\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t\t<Manual Value="${gain}" />
\t\t\t\t\t\t<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238" /></MidiControllerRange>
\t\t\t\t\t\t<AutomationTarget Id="${volTargetId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t\t\t<ModulationTarget Id="${volModId}"><LockEnvelope Value="0" /></ModulationTarget>
\t\t\t\t\t</Volume>
\t\t\t\t\t<ViewStateSesstionTrackWidth Value="55" />
\t\t\t\t\t<SendsListWrapper LomId="0" />
\t\t\t\t</Mixer>
\t\t\t\t<MainSequencer>
\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t<ClipSlotList>
\t\t\t\t\t\t${clipSlotsXml}
\t\t\t\t\t\t${otherSlots.join("\n\t\t\t\t\t\t")}
\t\t\t\t\t</ClipSlotList>
\t\t\t\t\t<MonitoringEnum Value="1" />
\t\t\t\t\t<ClipTimeable />
\t\t\t\t</MainSequencer>
\t\t\t\t<FreezeSequencer>
\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t<ClipSlotList>
\t\t\t\t\t\t${freezeSlots.join("\n\t\t\t\t\t\t")}
\t\t\t\t\t</ClipSlotList>
\t\t\t\t</FreezeSequencer>
\t\t\t\t<DeviceChain><Devices /></DeviceChain>
\t\t\t</DeviceChain>
\t\t</MidiTrack>`;

    trackXmlChunks.push(trackXml);
  });

  // Return Tracks (A - Reverb, B - Delay)
  const returnTracks = [
    { id: nextId(), name: "A-Reverb", color: 178 },
    { id: nextId(), name: "B-Delay", color: 188 },
  ].map((rt) => {
    const spkId = nextId();
    const panId = nextId();
    const volId = nextId();
    const freezeSlots = Array.from({ length: sceneCount }, (_, i) => `<ClipSlot Id="${i}" />`).join("\n\t\t\t\t\t\t");
    return `<ReturnTrack Id="${rt.id}">
\t\t\t<LomId Value="0" />
\t\t\t<Name><EffectiveName Value="${rt.name}" /><UserName Value="" /></Name>
\t\t\t<ColorIndex Value="${rt.color}" />
\t\t\t<DeviceChain>
\t\t\t\t<Mixer>
\t\t\t\t\t<Speaker><Manual Value="true" /><AutomationTarget Id="${spkId}"><LockEnvelope Value="0" /></AutomationTarget></Speaker>
\t\t\t\t\t<Pan><Manual Value="0" /><AutomationTarget Id="${panId}"><LockEnvelope Value="0" /></AutomationTarget></Pan>
\t\t\t\t\t<Volume><Manual Value="1" /><AutomationTarget Id="${volId}"><LockEnvelope Value="0" /></AutomationTarget></Volume>
\t\t\t\t</Mixer>
\t\t\t\t<MainSequencer><ClipSlotList /></MainSequencer>
\t\t\t\t<FreezeSequencer><ClipSlotList>${freezeSlots}</ClipSlotList></FreezeSequencer>
\t\t\t\t<DeviceChain><Devices /></DeviceChain>
\t\t\t</DeviceChain>
\t\t</ReturnTrack>`;
  });

  // Master Track
  const masterId = nextId();
  const masterSpkId = nextId();
  const masterVolId = nextId();
  const masterPanId = nextId();
  const masterTempoId = nextId();
  const masterTimeSigId = nextId();

  const masterTrack = `<MasterTrack Id="${masterId}">
\t\t<LomId Value="0" />
\t\t<Name><EffectiveName Value="Master" /></Name>
\t\t<ColorIndex Value="140" />
\t\t<DeviceChain>
\t\t\t<Mixer>
\t\t\t\t<Speaker><Manual Value="true" /><AutomationTarget Id="${masterSpkId}"><LockEnvelope Value="0" /></AutomationTarget></Speaker>
\t\t\t\t<Pan><Manual Value="0" /><AutomationTarget Id="${masterPanId}"><LockEnvelope Value="0" /></AutomationTarget></Pan>
\t\t\t\t<Volume><Manual Value="1" /><AutomationTarget Id="${masterVolId}"><LockEnvelope Value="0" /></AutomationTarget></Volume>
\t\t\t\t<Tempo>
\t\t\t\t\t<LomId Value="0" />
\t\t\t\t\t<Manual Value="${bpm}" />
\t\t\t\t\t<AutomationTarget Id="${masterTempoId}"><LockEnvelope Value="0" /></AutomationTarget>
\t\t\t\t</Tempo>
\t\t\t\t<TimeSignature>
\t\t\t\t\t<TimeSignatures>
\t\t\t\t\t\t<RemoteableTimeSignature Id="${masterTimeSigId}">
\t\t\t\t\t\t\t<Numerator Value="${numerator}" />
\t\t\t\t\t\t\t<Denominator Value="${denominator}" />
\t\t\t\t\t\t\t<Time Value="0" />
\t\t\t\t\t\t</RemoteableTimeSignature>
\t\t\t\t\t</TimeSignatures>
\t\t\t\t</TimeSignature>
\t\t\t</Mixer>
\t\t\t<MainSequencer><ClipSlotList /></MainSequencer>
\t\t\t<DeviceChain><Devices /></DeviceChain>
\t\t</DeviceChain>
\t</MasterTrack>`;

  // Scenes
  const scenesXml = Array.from({ length: sceneCount }, (_, idx) => {
    const sId = idx;
    const sName = idx === 0 ? escapeXml(`${genreName} Groove`) : `Scene ${idx + 1}`;
    return `<Scene Id="${sId}" Value="${sName}" />`;
  }).join("\n\t\t");

  const nextPointeeId = currentId + 1000;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="10.0_377" SchemaChangeCount="6" Creator="Ableton Live 10.1.43" Revision="0e617fc8048569557b05b35c5dcc68f74fed435a">
\t<LiveSet>
\t\t<NextPointeeId Value="${nextPointeeId}" />
\t\t<OverwriteProtectionNumber Value="2561" />
\t\t<LomId Value="0" />
\t\t<LomIdView Value="0" />
\t\t<Tracks>
\t\t${trackXmlChunks.join("\n\t\t")}
\t\t${returnTracks.join("\n\t\t")}
\t\t</Tracks>
\t\t${masterTrack}
\t\t<SceneNames>
\t\t${scenesXml}
\t\t</SceneNames>
\t\t<Transport>
\t\t\t<PhaseNudgeTempo Value="10" />
\t\t\t<LoopOn Value="true" />
\t\t\t<LoopStart Value="0" />
\t\t\t<LoopLength Value="${loopLengthBeats}" />
\t\t\t<CurrentTime Value="0" />
\t\t</Transport>
\t</LiveSet>
</Ableton>`;
}

/**
 * Gzip-compresses an XML string using standard web CompressionStream or Node zlib.
 */
export async function gzipCompressXml(xml: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(xml);

  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(inputBytes);
    writer.close();
    const arrayBuf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(arrayBuf);
  }

  // Node fallback
  try {
    const modName = "node:zlib";
    const zlib = await import(/* @vite-ignore */ modName);
    return new Uint8Array(zlib.gzipSync(Buffer.from(inputBytes)));
  } catch (err) {
    throw new Error("Gzip compression unavailable in environment: " + String(err));
  }
}

/**
 * Exports complete Ableton Live Set (.als) project package.
 */
export async function exportAbletonLiveSet(options: ExportAlsOptions): Promise<ExportedAls> {
  const xml = buildAbletonLiveSetXml(options);
  const data = await gzipCompressXml(xml);
  const blob = new Blob([data as unknown as BlobPart], { type: "application/x-ableton-live-set" });
  const rawName = (options.genreName || "Groove").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "_");
  const filename = `${rawName}.als`;

  return {
    xml,
    data,
    blob,
    filename,
  };
}

/**
 * Browser file download trigger for `.als` files.
 */
export function triggerAlsDownload(blob: Blob, filename: string): void {
  const safeFilename = filename.endsWith(".als") ? filename : `${filename}.als`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * End-to-end download helper for StudioView toolbar.
 */
export async function downloadAbletonProject(
  options: ExportAlsOptions,
  customFilename?: string
): Promise<ExportedAls> {
  const result = await exportAbletonLiveSet(options);
  const targetFilename = customFilename ? (customFilename.endsWith(".als") ? customFilename : `${customFilename}.als`) : result.filename;
  triggerAlsDownload(result.blob, targetFilename);
  return { ...result, filename: targetFilename };
}
