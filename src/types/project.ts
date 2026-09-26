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

/**
 * The arrangement a package may carry — the half of a composition `GrooveProject` cannot hold.
 *
 * `GrooveProject` is `patterns: { A, B }` by construction, while a song has up to four clips and an ordered arrangement. Before
 * this field, exporting a song was **lossy**: the arrangement was dropped and there was nowhere to drop it into, so an agent that
 * composed a song through MCP could not round-trip what it made (`docs/DAW_MCP_REFACTOR.md`, C1).
 *
 * It is the song's own shape (`src/types/song.ts`), stored opaquely: the package's job is to carry it, not to interpret it.
 */
export interface GrooveProjectArrangement {
  clips: Record<string, SequencerPattern>;
  sections: unknown[];
  /** The clip the step editor was showing, if the arrangement names one. */
  activeSlot?: string;
}

export interface GrooveProjectPackage {
  format: "groove-project";
  /** 1 = the two-pattern project; 2 = the same, plus `arrangement` when the composition is a song. */
  version: 1 | 2;
  exportedAt: number;
  appVersion: string;
  project: GrooveProject;
  /**
   * Present when the thing exported is a **song**, and absent for a plain two-pattern project — a v1 package is exactly that.
   *
   * The reader treats a missing arrangement as "one clip, no sections", which is what a v1 package means, so old files keep
   * working and nothing has to be migrated.
   */
  arrangement?: GrooveProjectArrangement;
}

export type ProjectSortField = "updatedAt" | "name" | "bpm" | "genreName";
export type ProjectSortOrder = "asc" | "desc";
