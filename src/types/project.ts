import { SequencerPattern } from "./genre";
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
  songChain: ("A" | "B")[];
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
