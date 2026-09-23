import { SequencerPattern } from "./genre";
import type { SongSection } from "./song";
import { EffectsRackState, DrumKitType } from "../audio/AudioEngine";

export interface ProjectSnapshotSummary {
  trackCount: number;
  activeSteps: number;
  scale?: string;
  notesCount?: number;
}

export interface GrooveProject {
  id: string;
  name: string;
  genreId: string;
  genreName: string;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  patterns: {
    A: SequencerPattern;
    B: SequencerPattern;
  };
  activeSlot: "A" | "B";
  songMode: boolean;
  /**
   * The legacy bar chain, still written so an older build (and the hub's list view) can read the order.
   * `sections` is the source of truth from B1 on; `songChain` is derived from it via `sectionsToSongChain`.
   */
  songChain: ("A" | "B")[];
  /**
   * The arrangement (B1). Optional because projects saved before it exist and `.groove` packages carry whatever
   * the project had: a reader that finds none migrates `songChain` losslessly (`migrateSongChain`).
   */
  sections?: SongSection[];
  loopRange: [number, number] | null;
  effectsRack: EffectsRackState;
  drumKit: DrumKitType;
  isMetronome: boolean;
  isCountIn: boolean;
  tags: string[];
  isFavorite: boolean;
  color?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  snapshotSummary?: ProjectSnapshotSummary;
}

export interface GrooveProjectPackage {
  format: "groove-project";
  version: 1;
  exportedAt: number;
  appVersion: string;
  project: GrooveProject;
}

export type ProjectSortField = "updatedAt" | "name" | "bpm" | "genreName";
export type ProjectSortOrder = "asc" | "desc";
