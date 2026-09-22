/**
 * Surface capabilities: what the phone has, and what only the big surfaces have.
 *
 * The product decision (recorded here because it is a decision, not an accident): **the phone is a functional
 * subset of the iPad and PC version, with its own UI and interaction layer** — the phone shell stays, keeps its own
 * screens and skins, and simply does not carry the multi-track surface. Professional multi-track work — the
 * arrangement/timeline surface, the piano roll's inspector, the hardware console — simply does not exist on the
 * phone; the phone is a groove player and a quick editor, and it is better at that for not carrying them.
 *
 * That is a *contract*, not a comment: `surfaceCapabilities.test.ts` asserts both directions — every declared
 * capability is reachable on at least one surface, and nothing under `src/mobile/**` references a capability the
 * phone does not have. Without it, the next feature added to the desktop shell leaks into the phone by default,
 * and the phone stops being a subset and becomes a second, unmaintained copy of the app.
 */
export type SurfaceId = "phone" | "desktop";

/** The surfaces the product targets. `desktop` means the shared iPad + PC layout. */
export const SURFACES: readonly SurfaceId[] = ["phone", "desktop"];

export type CapabilityId =
  | "library"
  | "step-sequencer"
  | "pattern-slots"
  | "mixer"
  | "piano-roll"
  | "keyboard"
  | "euclidean"
  | "export"
  | "share"
  | "challenge"
  | "compare"
  | "analyzer"
  | "kick-lab"
  | "genre-maker"
  | "masterclasses"
  | "timeline-stories"
  | "hardware-console"
  | "audio-settings"
  | "skins"
  // Desktop/iPad only — the multi-track and inspection surface.
  | "arrangement"
  | "project-hub-multitrack"
  | "arrangement-export";

export interface Capability {
  id: CapabilityId;
  /** One line for a human reading the table. */
  label: string;
  surfaces: readonly SurfaceId[];
  /** Why the phone does not have it, when it does not. */
  reason?: string;
}

const BOTH: readonly SurfaceId[] = ["phone", "desktop"];
const DESKTOP: readonly SurfaceId[] = ["desktop"];

/**
 * The table.
 *
 * Adding a capability here is cheap; the point is that the phone's list is *explicit*, so a feature that should
 * not reach the phone is caught by a test rather than by a user on a train.
 */
export const CAPABILITIES: readonly Capability[] = [
  { id: "library", label: "Browse the genre library", surfaces: BOTH },
  { id: "step-sequencer", label: "Edit one pattern step by step", surfaces: BOTH },
  { id: "pattern-slots", label: "Two pattern slots (A/B)", surfaces: BOTH },
  { id: "mixer", label: "Per-track level, pan and sends", surfaces: BOTH },
  { id: "euclidean", label: "Euclidean rhythm generator", surfaces: BOTH },
  { id: "export", label: "Export the current pattern (WAV/MP3/MIDI/ALS)", surfaces: BOTH },
  { id: "share", label: "Share a groove by link", surfaces: BOTH },
  { id: "challenge", label: "The listening challenge", surfaces: BOTH },
  { id: "compare", label: "Genre comparison", surfaces: BOTH },
  { id: "analyzer", label: "Spectrum / oscilloscope analysis", surfaces: BOTH },
  { id: "kick-lab", label: "Kick design lab", surfaces: BOTH },
  { id: "genre-maker", label: "Custom genre maker", surfaces: BOTH },
  { id: "masterclasses", label: "Masterclass lessons", surfaces: BOTH },
  { id: "timeline-stories", label: "Genre timeline stories", surfaces: BOTH },
  { id: "skins", label: "Choose a visual skin", surfaces: BOTH },
  { id: "audio-settings", label: "Engine settings (latency, voices, protection)", surfaces: BOTH },
  { id: "keyboard", label: "MIDI keyboard play mode", surfaces: BOTH },
  {
    id: "piano-roll",
    label: "Piano-roll editing with the note inspector",
    surfaces: DESKTOP,
    reason: "it needs the width the phone layout does not have; the phone edits patterns on the step grid",
  },
  {
    id: "hardware-console",
    label: "Hardware-style console view",
    surfaces: DESKTOP,
    reason: "an inspection surface for a large screen, with no phone equivalent by design",
  },
  {
    id: "project-hub-multitrack",
    label: "Project hub with multi-clip projects",
    surfaces: DESKTOP,
    reason: "the phone keeps the single-pattern project it ships with today",
  },
  {
    id: "arrangement",
    label: "Arrangement view: clips on a timeline",
    surfaces: DESKTOP,
    reason:
      "the multi-track work surface this plan introduces; the phone is a subset and a groove player, and its " +
      "layout cannot host a timeline without becoming a different product",
  },
  {
    id: "arrangement-export",
    label: "Export the whole arrangement, not one loop",
    surfaces: DESKTOP,
    reason: "it follows `arrangement`: a surface without a timeline has nothing longer than a loop to export",
  },
];

export function capability(id: CapabilityId): Capability | undefined {
  return CAPABILITIES.find((entry) => entry.id === id);
}

export function hasCapability(surface: SurfaceId, id: CapabilityId): boolean {
  return capability(id)?.surfaces.includes(surface) ?? false;
}

export function capabilitiesFor(surface: SurfaceId): CapabilityId[] {
  return CAPABILITIES.filter((entry) => entry.surfaces.includes(surface)).map((entry) => entry.id);
}

/** The capabilities that are desktop-only, i.e. the ones `src/mobile/**` must never reach for. */
export function desktopOnly(): CapabilityId[] {
  return CAPABILITIES.filter((entry) => !entry.surfaces.includes("phone")).map((entry) => entry.id);
}

/**
 * Where each capability lives, as a module prefix — what the test uses to check the phone shell.
 *
 * A capability with no module yet (the arrangement view) simply has no entry; the test then only asserts the
 * declaration, and adding the module later is what activates the leak check.
 */
export const CAPABILITY_MODULES: Partial<Record<CapabilityId, readonly string[]>> = {
  arrangement: ["src/views/ArrangementView", "src/features/arrangement/ArrangementPanel"],
  "piano-roll": ["src/components/sequencer/PianoRollLane"],
  "hardware-console": ["src/components/console"],
  "project-hub-multitrack": ["src/components/sequencer/ProjectHubModal"],
};
