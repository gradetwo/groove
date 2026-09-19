import type { TrackMetaConfig } from "./TrackRow";

/**
 * A-02: the 8-track demo colour/name mapping used by the matrix, the velocity
 * drawer, the Euclidean modal and the pitch picker. Moved out of `StudioView.tsx`
 * so the extracted subcomponents can share it without importing the view.
 */
export const DEMO_TRACKS_CONFIG: TrackMetaConfig[] = [
  { id: "kick", name: "KICK", sub: { zh: "底鼓", en: "Kick" }, color: "#ff5964" },
  { id: "snare", name: "SNARE", sub: { zh: "军鼓/拍手", en: "Snare/Clap" }, color: "#ffb65c" },
  { id: "hat", name: "HI-HAT", sub: { zh: "踩镲", en: "Hi-Hat" }, color: "#45e0c9" },
  { id: "perc", name: "PERC", sub: { zh: "打击乐", en: "Percussion" }, color: "#c8e06a" },
  { id: "bass", name: "808 BASS", sub: { zh: "贝斯", en: "Bass" }, color: "#ff8a5c" },
  { id: "chord", name: "CHORD", sub: { zh: "和弦", en: "Chords" }, color: "#f06ec4" },
  { id: "lead", name: "LEAD", sub: { zh: "主音", en: "Lead" }, color: "#7ee787" },
  { id: "fx", name: "FX", sub: { zh: "效果", en: "FX" }, color: "#9aa5ce" },
];
