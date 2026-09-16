import { SequencerTrack } from "../types/genre";
import { DrumKitType } from "../audio/DrumKitModels";

const DRUM_TRACK_IDS = new Set([
  "kick",
  "snare",
  "hihat",
  "percussion",
  "perc",
  "clap",
  "hat",
  "cymbals",
  "toms",
]);

/**
 * Accurately determines whether a sequencer track is part of the rhythmic drum kit
 * or a melodic/harmonic track (bass, chords, lead, etc.)
 */
export function isDrumTrack(
  track: Partial<SequencerTrack> | { track_id?: string; name?: string; instrument?: string },
  index: number
): boolean {
  const trackId = (track.track_id || "").toLowerCase();
  if (trackId && DRUM_TRACK_IDS.has(trackId)) return true;

  const combined = `${trackId} ${track.name || ""} ${track.instrument || ""}`.toLowerCase();
  const tokens = combined.split(/[\s_\-/,.#:]+/).filter(Boolean);

  const nonDrumKeywords = [
    "bass",
    "sub",
    "subbass",
    "chord",
    "chords",
    "lead",
    "synth",
    "pad",
    "pads",
    "arp",
    "arpeggio",
    "organ",
    "piano",
    "key",
    "keys",
    "fx",
    "vocal",
    "vocals",
    "guitar",
    "brass",
    "string",
    "strings",
    "melody",
  ];
  if (tokens.some((token) => nonDrumKeywords.some((k) => token === k || token.startsWith(k)))) {
    return false;
  }

  const drumKeywords = [
    "kick",
    "snare",
    "clap",
    "hat",
    "hihat",
    "perc",
    "percussion",
    "tom",
    "toms",
    "rim",
    "rimshot",
    "shaker",
    "cymbal",
    "cymbals",
    "ride",
    "crash",
    "conga",
    "bongo",
    "tambourine",
    "cowbell",
    "snap",
    "beat",
    "drum",
    "drums",
  ];
  if (tokens.some((token) => drumKeywords.some((k) => token === k || token.startsWith(k)))) {
    return true;
  }

  // Fallback heuristic: first 4 tracks in standard template are rhythm section
  return index < 4;
}

/**
 * Returns the historically authentic default drum machine model for a given genre
 * (e.g. TR-808, TR-909, Vintage Acoustic, or Cyber Wave)
 */
export function getDefaultDrumKitForGenre(
  genre: {
    id?: string;
    category?: string;
    name?: string;
    default_drum_kit?: string;
  } | null | undefined
): DrumKitType {
  if (!genre) return "808";
  if (genre.default_drum_kit) return genre.default_drum_kit as DrumKitType;

  const id = (genre.id || "").toLowerCase();
  const category = (genre.category || "").toLowerCase();

  // 1. Acoustic Drum Kit: Rock/Metal, Jazz/Blues, Latin/World, Acoustic/Folk/Soul
  if (
    category.includes("rock") ||
    category.includes("metal") ||
    category.includes("jazz") ||
    category.includes("blues") ||
    category.includes("latin") ||
    category.includes("world") ||
    id.includes("rock") ||
    id.includes("metal") ||
    id.includes("jazz") ||
    id.includes("blues") ||
    id.includes("latin") ||
    id.includes("grunge") ||
    id.includes("punk")
  ) {
    return "acoustic";
  }

  // Vintage Funk / Motown / Soul / Live Acoustic Disco
  if (
    id.includes("funk") ||
    id.includes("soul") ||
    id.includes("motown") ||
    id.includes("country") ||
    id.includes("acoustic")
  ) {
    if (!id.includes("electro") && !id.includes("nu-disco") && !id.includes("synth")) {
      return "acoustic";
    }
  }

  // 2. Cyber Wave Drum Kit: Modern Synthwave, Cyberpunk, Hyperpop, Future Bass, Dubstep, Chiptune
  if (
    id.includes("synthwave") ||
    id.includes("retrowave") ||
    id.includes("darksynth") ||
    id.includes("outrun") ||
    id.includes("cyber") ||
    id.includes("hyperpop") ||
    id.includes("future-bass") ||
    id.includes("dubstep") ||
    id.includes("brostep") ||
    id.includes("riddim") ||
    id.includes("glitch") ||
    id.includes("chiptune") ||
    id.includes("complextro") ||
    id.includes("midtempo") ||
    id.includes("color-bass")
  ) {
    return "cyber";
  }

  // 3. TR-808 (Analog Boom & Snappy Crisp): Hip Hop, Trap, Drill, Footwork, Miami Bass, Contemporary R&B, Reggaeton
  if (
    category.includes("hip hop") ||
    id.includes("trap") ||
    id.includes("drill") ||
    id.includes("boom-bap") ||
    id.includes("808") ||
    id.includes("phonk") ||
    id.includes("crunk") ||
    id.includes("lofi") ||
    id.includes("footwork") ||
    id.includes("juke") ||
    id.includes("miami-bass") ||
    id.includes("reggaeton") ||
    id.includes("dancehall") ||
    id.includes("rnb") ||
    id.includes("r&b")
  ) {
    return "808";
  }

  // 4. TR-909 (Punch Attack & Snappy FM Wire): House, Techno, Trance, Drum & Bass, Jungle, UK Garage, Hardcore
  if (
    id.includes("house") ||
    id.includes("techno") ||
    id.includes("trance") ||
    id.includes("dnb") ||
    id.includes("jungle") ||
    id.includes("garage") ||
    id.includes("breakbeat") ||
    id.includes("hardcore") ||
    id.includes("eurodance") ||
    id.includes("hardstyle") ||
    id.includes("rave") ||
    category.includes("electronic")
  ) {
    return "909";
  }

  return "808";
}
