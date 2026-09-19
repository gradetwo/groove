/**
 * N-01 / P8-02 Hardware Console — per-track visual identity.
 *
 * The studio view's `DEMO_TRACKS_CONFIG` lives inside the lazy `StudioView`
 * chunk; importing it here would pull that whole chunk (and its genre imports)
 * into the console route, so the console keeps its own small colour map keyed by
 * the pattern's stable `track_id`.
 */

export interface ConsoleTrackVisual {
  color: string;
  label: string;
}

const TRACK_VISUALS: Record<string, ConsoleTrackVisual> = {
  kick: { color: "#ff5964", label: "KICK" },
  snare: { color: "#ffb65c", label: "SNARE" },
  hihat: { color: "#45e0c9", label: "HI-HAT" },
  percussion: { color: "#c8e06a", label: "PERC" },
  bass: { color: "#ff8a5c", label: "BASS" },
  chords: { color: "#f06ec4", label: "CHORD" },
  lead: { color: "#7ee787", label: "LEAD" },
  fx: { color: "#9aa5ce", label: "FX" },
};

const FALLBACK_COLORS = [
  "#f5b73d",
  "#45e0c9",
  "#ff5964",
  "#c8e06a",
  "#f06ec4",
  "#7ee787",
  "#ff8a5c",
  "#9aa5ce",
];

export function getTrackVisual(trackId: string | undefined, index: number): ConsoleTrackVisual {
  const key = (trackId || "").toLowerCase();
  const known = TRACK_VISUALS[key];
  if (known) return known;
  return {
    color: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    label: (trackId || `TRK ${index + 1}`).toUpperCase(),
  };
}
