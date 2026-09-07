import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const rootDir = path.resolve(__dirname, '..');
export const outDir = path.join(rootDir, 'src', 'data', 'genres');

export function createGenreObject(raw) {
  const kickSteps = raw.kickSteps || [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const snareSteps = raw.snareSteps || [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const hihatSteps = raw.hihatSteps || [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  const percSteps = raw.percSteps || [0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0];
  const bassSteps = raw.bassSteps || [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
  const bassPitch = raw.bassPitch || [36, null, null, 36, null, null, 38, null, 36, null, null, 41, null, 43, null, null];
  const chordSteps = raw.chordSteps || [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  const chordPitch = raw.chordPitch || [60, null, null, null, null, null, 63, null, null, null, 65, null, null, null, null, null];
  const leadSteps = raw.leadSteps || [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0];
  const leadPitch = raw.leadPitch || [null, null, 72, null, 75, null, null, 74, null, null, 72, null, 79, 77, null, null];
  const fxSteps = raw.fxSteps || [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  return {
    id: raw.id,
    name: raw.name,
    aliases: raw.aliases || [],
    category: raw.category,
    parent_genres: raw.parents || [],
    subgenres: raw.subgenres || [],
    related_genres: raw.related || [],
    origin_year: raw.year,
    origin_decade: raw.decade || parseInt(raw.year.slice(0, 3) + '0', 10),
    origin_place: raw.place,
    cultural_context: raw.context,
    bpm_range: raw.bpm,
    default_bpm: raw.defaultBpm,
    time_signature: raw.timeSig || "4/4",
    key_characteristics: raw.keyChar || {
      en: "Rooted in minor pentatonic and modern minor/modal harmonies.",
      zh: "植根于小调五声与现代自然小调/调式和声体系。"
    },
    common_chords: raw.chords || ["i–VI–III–VII", "i–v–VI–VII"],
    chord_inversions: raw.chordInversions || {
      en: "Root position on strong beats with open voiced extensions on syncopated stabs.",
      zh: "强拍以根音声部夯实，切分切片处使用开放式转位与丰富扩展音。"
    },
    instrumentation: raw.instrumentation || ["Synthesizer", "Drum Machine", "Bass Synth", "Vocal Chops", "Samplers"],
    sound_design: raw.soundDesign,
    rhythm_features: raw.rhythmFeatures,
    drum_pattern: {
      kick: raw.drumPattern?.kick || {
        en: "Punchy transient with tight decay, anchored on key pulses.",
        zh: "瞬态利落、衰减紧凑的底鼓，锁定核心重拍。"
      },
      snare_clap: raw.drumPattern?.snare_clap || {
        en: "Crisp layered clap/snare hitting on beats 2 and 4 with subtle stereo spread.",
        zh: "在第 2、4 拍击打的清脆叠层拍手/军鼓，带有细腻的立体声展宽。"
      },
      hihats: raw.drumPattern?.hihats || {
        en: "Syncopated 16th closed hats and bright offbeat open hats.",
        zh: "切分的十六分闭镲与明亮的反拍开镲交织。"
      },
      percussion: raw.drumPattern?.percussion || {
        en: "Woodblocks, shakers, and metallic rim clicks filling rhythmic pockets.",
        zh: "木鱼、沙锤与金属边击点缀节奏律动空隙。"
      },
      swing: raw.drumPattern?.swing || {
        en: "Slight 16th groove swing between 52% and 58%.",
        zh: "轻微的十六分音符律动摇摆（52%–58%）。"
      },
      tempo: raw.bpm
    },
    bass_pattern: raw.bassPattern,
    structure: raw.structure || ["Intro", "Verse / Groove A", "Build", "Drop / Chorus", "Breakdown", "Drop 2", "Outro"],
    production_tips: raw.productionTips,
    representative_tracks: raw.tracks.map((t, idx) => ({
      title: t.title,
      artist: t.artist,
      year: t.year,
      link: t.link || `https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist + ' ' + t.title)}`
    })),
    representative_artists: raw.artists,
    sources: raw.sources || ["Sound on Sound", "Ishkur's Guide to Electronic Music", "AllMusic"],
    radar_metrics: raw.radar,
    sequencer_pattern: {
      genre_id: raw.id,
      bpm: raw.defaultBpm,
      scale: raw.scale || "C minor",
      swing: raw.swing || 15,
      tracks: [
        {
          track_id: "kick",
          name: "Kick Drum",
          instrument: raw.kickInst || "punchy_kick",
          steps: kickSteps,
          velocity: kickSteps.map(v => v ? 115 : 0),
          volume: 0.9,
          pan: 0
        },
        {
          track_id: "snare",
          name: "Snare / Clap",
          instrument: raw.snareInst || "tight_snare",
          steps: snareSteps,
          velocity: snareSteps.map(v => v ? 100 : 0),
          volume: 0.85,
          pan: 0
        },
        {
          track_id: "hihat",
          name: "Hi-Hats",
          instrument: "closed_hat",
          steps: hihatSteps,
          velocity: hihatSteps.map(v => v ? 80 : 0),
          volume: 0.7,
          pan: -0.2
        },
        {
          track_id: "percussion",
          name: "Percussion",
          instrument: "rim_shaker",
          steps: percSteps,
          velocity: percSteps.map(v => v ? 70 : 0),
          volume: 0.65,
          pan: 0.25
        },
        {
          track_id: "bass",
          name: "Bassline",
          instrument: "sub_bass",
          steps: bassSteps,
          pitch: bassPitch,
          volume: 0.9,
          pan: 0
        },
        {
          track_id: "chords",
          name: "Chords / Pad",
          instrument: "warm_pad",
          steps: chordSteps,
          pitch: chordPitch,
          volume: 0.75,
          pan: 0
        },
        {
          track_id: "lead",
          name: "Lead Synth",
          instrument: "saw_lead",
          steps: leadSteps,
          pitch: leadPitch,
          volume: 0.8,
          pan: 0.1
        },
        {
          track_id: "fx",
          name: "FX / Sweep",
          instrument: "noise_sweep",
          steps: fxSteps,
          volume: 0.6,
          pan: 0
        }
      ]
    }
  };
}

export function writeGenreModule(filename, varName, genresList) {
  const fullPath = path.join(outDir, filename);
  const objects = genresList.map(g => createGenreObject(g));
  const fileContent = `import { Genre } from '../../types/genre';\n\nexport const ${varName}: Genre[] = ${JSON.stringify(objects, null, 2)};\n`;
  fs.writeFileSync(fullPath, fileContent, 'utf-8');
  console.log(`Wrote ${objects.length} genres to ${filename}`);
  return objects;
}
