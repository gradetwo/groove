/**
 * Surface capabilities: what the retired phone shell had, and what every surface has now.
 *
 * ⚠️ **The `phone` column is historical.** The product decision it recorded was that the phone was a functional
 * subset with its own UI and interaction layer — the phone shell stayed, kept its own screens and skins, and
 * simply did not carry the multi-track surface. That shell is **cut** (`docs/OPEN_WORK.md` §十三, preserved on
 * the `mobile-preserved` branch), and a phone browser now renders the `desktop` UI, so nothing is withheld from
 * it any more. The `phone` ids are kept, with the reason each one was withheld, because the *reasons* are still
 * true statements about the layout (`ARRANGEMENT_PLAN.md` and `TRACK_ARRANGEMENT_PLAN.md` cite this table), and
 * because deleting a declaration leaves the next reader unable to tell a decision from an oversight.
 *
 * What is **not** historical is `CAPABILITY_MODULES`: it maps a capability to the module that implements it,
 * which is the piece `surfaceCapabilities.test.ts` uses to check the declaration against the tree.
 */
export type SurfaceId = "phone" | "desktop";

/** The surfaces the product targets. `desktop` means the shared iPad + PC layout, which a phone also gets. */
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

/**
 * The capabilities the **retired phone shell** did not reach for.
 *
 * Historical, like the `phone` column itself: the shell that enforced it is cut, so nothing consumes this at
 * runtime. It is kept as the record of the subset boundary and as the vocabulary a future second surface would
 * start from.
 */
export function desktopOnly(): CapabilityId[] {
  return CAPABILITIES.filter((entry) => !entry.surfaces.includes("phone")).map((entry) => entry.id);
}

/**
 * Where each capability lives, as a module prefix — what the test uses to check the declaration.
 *
 * A capability with no module yet simply has no entry; the test then only asserts the declaration, and adding the
 * module later is what activates the leak check. `arrangement` was in exactly that state until B3 built the view:
 * its entry used to name a planned path, and now names the component that really renders it.
 */
export const CAPABILITY_MODULES: Partial<Record<CapabilityId, readonly string[]>> = {
  arrangement: ["src/components/arrangement/ArrangementPanel"],
  "piano-roll": ["src/components/sequencer/PianoRollLane"],
  "hardware-console": ["src/components/console"],
  "project-hub-multitrack": ["src/components/sequencer/ProjectHubModal"],
};
