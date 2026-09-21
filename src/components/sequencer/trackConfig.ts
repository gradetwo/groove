import type { TrackMetaConfig } from "./TrackRow";
import type { TrackColourRole } from "../../utils/trackColours";

/**
 * A-02: the 8-track demo colour/name mapping used by the matrix, the velocity
 * drawer, the Euclidean modal and the pitch picker. Moved out of `StudioView.tsx`
 * so the extracted subcomponents can share it without importing the view.
 */
export const DEMO_TRACKS_CONFIG: TrackMetaConfig[] = [
  { id: "kick", name: "KICK", sub: { zh: "底鼓", en: "Kick" }, colourRole: "kick" },
  { id: "snare", name: "SNARE", sub: { zh: "军鼓/拍手", en: "Snare/Clap" }, colourRole: "snare" },
  { id: "hat", name: "HI-HAT", sub: { zh: "踩镲", en: "Hi-Hat" }, colourRole: "hat" },
  { id: "perc", name: "PERC", sub: { zh: "打击乐", en: "Percussion" }, colourRole: "perc" },
  { id: "bass", name: "808 BASS", sub: { zh: "贝斯", en: "Bass" }, colourRole: "bass" },
  { id: "chord", name: "CHORD", sub: { zh: "和弦", en: "Chords" }, colourRole: "chord" },
  { id: "lead", name: "LEAD", sub: { zh: "主音", en: "Lead" }, colourRole: "lead" },
  { id: "fx", name: "FX", sub: { zh: "效果", en: "FX" }, colourRole: "fx" },
];
