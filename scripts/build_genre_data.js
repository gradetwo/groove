import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'src', 'data', 'genres');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Track generator helper
function createTracks(artistList, genreName, baseYear = 2000) {
  const titles = [
    `${genreName} Anthem`,
    `Midnight ${genreName} Journey`,
    `Echoes of ${genreName}`,
    `Pulse of ${genreName}`,
    `Resonance & Rhythm`,
    `Velocity Drift`,
    `Harmonic Horizon`
  ];
  return artistList.slice(0, 5).map((artist, idx) => ({
    title: titles[idx] || `Essential ${genreName} Vol. ${idx + 1}`,
    artist: artist,
    year: baseYear + (idx * 3) % 25,
    link: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + genreName)}`
  }));
}

// Sequencer generator helper
function createSequencer(genreId, bpm, style = 'four_on_floor') {
  let kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  let snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  let hihat = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  let perc = [0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0];
  let bass = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
  let bassPitch = [36, null, null, 36, null, null, 38, null, 36, null, null, 41, null, 43, null, null];
  let chords = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  let chordPitch = [60, null, null, null, null, null, 63, null, null, null, 65, null, null, null, null, null];
  let lead = [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0];
  let leadPitch = [null, null, 72, null, 75, null, null, 74, null, null, 72, null, 79, 77, null, null];
  let fx = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  if (style === 'breakbeat' || style === 'dnb' || style === 'jungle') {
    kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    hihat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    perc = [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1];
  } else if (style === 'trap' || style === 'drill') {
    kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    snare = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    hihat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    perc = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    bass = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    bassPitch = [33, null, null, null, null, null, 36, null, null, null, null, null, 31, null, null, null];
  } else if (style === 'reggaeton' || style === 'latin') {
    kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    snare = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0];
    hihat = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  } else if (style === 'rock' || style === 'metal') {
    kick = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    hihat = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    perc = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
  } else if (style === 'swing' || style === 'jazz' || style === 'blues') {
    kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    hihat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  }

  return {
    genre_id: genreId,
    bpm: bpm,
    scale: 'C minor',
    swing: style === 'swing' || style === 'trap' ? 45 : 15,
    tracks: [
      {
        track_id: 'kick',
        name: 'Kick Drum',
        instrument: 'punchy_kick',
        steps: kick,
        velocity: kick.map(v => v ? 110 : 0),
        volume: 0.9,
        pan: 0
      },
      {
        track_id: 'snare',
        name: 'Snare / Clap',
        instrument: 'tight_snare',
        steps: snare,
        velocity: snare.map(v => v ? 100 : 0),
        volume: 0.85,
        pan: 0
      },
      {
        track_id: 'hihat',
        name: 'Hi-Hats',
        instrument: 'closed_hat',
        steps: hihat,
        velocity: hihat.map(v => v ? 75 : 0),
        volume: 0.7,
        pan: -0.2
      },
      {
        track_id: 'percussion',
        name: 'Percussion',
        instrument: 'conga_perc',
        steps: perc,
        velocity: perc.map(v => v ? 70 : 0),
        volume: 0.65,
        pan: 0.3
      },
      {
        track_id: 'bass',
        name: 'Bassline',
        instrument: 'sub_bass',
        steps: bass,
        pitch: bassPitch,
        volume: 0.9,
        pan: 0
      },
      {
        track_id: 'chords',
        name: 'Chords / Pad',
        instrument: 'warm_pad',
        steps: chords,
        pitch: chordPitch,
        volume: 0.75,
        pan: 0
      },
      {
        track_id: 'lead',
        name: 'Lead / Hook',
        instrument: 'synth_lead',
        steps: lead,
        pitch: leadPitch,
        volume: 0.8,
        pan: 0.1
      },
      {
        track_id: 'fx',
        name: 'FX / Sweep',
        instrument: 'noise_sweep',
        steps: fx,
        volume: 0.6,
        pan: 0
      }
    ]
  };
}

export { createTracks, createSequencer };
