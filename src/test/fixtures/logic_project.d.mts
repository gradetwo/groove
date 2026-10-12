/**
 * The types for `logic_project.mjs`, which is plain JavaScript so `scripts/check_mcp.mjs` can import the same bytes
 * the criteria use — one fixture, both callers, no drift between what the tests prove and what the MCP gate checks.
 */

export interface LogicFixtureNote {
  /** The note's position within its region, in 960-PPQ ticks. */
  startTicks: number;
  pitch: number;
  velocity?: number;
  lengthTicks?: number;
}

export interface LogicFixtureRegion {
  /** The region's name, written as UTF-8. */
  name?: string;
  /** A name in bytes that are not UTF-8, for the decoding case. */
  nameBytes?: number[];
  /** The record cluster index; allocated automatically when absent. */
  cluster?: number;
  notes?: LogicFixtureNote[];
  /** Adds the `lFuA`/`gRuA` pair that is what an audio region is. */
  audioName?: string;
  /** Adds an `rpyH` record, which is what an automation lane is. */
  automation?: boolean;
}

export function buildLogicProjectData(options?: {
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  regions?: LogicFixtureRegion[];
  /** How many tempo points the tempo-track sequence holds. */
  tempoPoints?: number;
}): Uint8Array;

export function buildMetaDataPlist(options?: { bpm?: number; numerator?: number; denominator?: number }): Uint8Array;

export function buildBinaryPlist(values: Record<string, string>): Uint8Array;

/** Bytes that are not valid UTF-8, taken from the decoding case rather than invented. */
export function invalidUtf8RegionName(): number[];

export function emptyNoteRecord(cluster: number): number[];

export const NOTE_ORIGIN_TICKS: number;
export const TICKS_PER_QUARTER: number;
