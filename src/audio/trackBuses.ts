/**
 * Role → group bus mapping (E-11).
 *
 * One decision, in one place, because *both* engines have to make it identically for the
 * exporter to match playback. The engine's own role detection lives inline in its scheduler
 * (`playKick`/`playChord`/... chosen from `track_id` plus name heuristics); this module does the
 * same job for the *routing* question only, and it is deliberately total: an unknown role or a
 * custom track name still gets a bus, because a track that reaches no bus would be silent.
 *
 * The split is the conventional one:
 *
 *   drum bus  — kick, snare, hihat, percussion. Voices with a transient: they want glue that
 *               grips the body without flattening the attack, and they benefit from parallel
 *               compression.
 *   music bus — bass, chords, lead, fx. Sustained or melodic: they want slow glue so a pad, a
 *               bass and a lead stop each claiming their own peak.
 *
 * `metronome` is intentionally *not* here: the click is a monitoring aid and, like a real
 * console's talkback, it goes straight to the fader rather than through a mix bus.
 */
export type GroupBus = "drum" | "music";

/** Roles that belong on the drum bus, by the same identifiers the genre data uses. */
const DRUM_ROLES = new Set(["kick", "snare", "hihat", "percussion"]);

/** Name fragments that mean "drums" for tracks whose `track_id` is missing or non-standard. */
const DRUM_NAME_HINTS = ["kick", "snr", "snare", "hat", "shaker", "clap", "perc", "tom", "ride", "crash", "cymbal"];

/**
 * Which bus a track belongs on.
 *
 * `track_id` wins when it is one of the eight known roles; otherwise the name is consulted, and
 * anything unrecognised goes to the music bus (the safer default: the drum bus is the one with
 * parallel compression, so a stray melodic track must not land there).
 */
export function resolveGroupBus(
  role: string | null | undefined,
  name?: string | null
): GroupBus {
  const id = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (DRUM_ROLES.has(id)) return "drum";
  if (id === "bass" || id === "chords" || id === "lead" || id === "fx") return "music";

  const lower = typeof name === "string" ? name.toLowerCase() : "";
  if (lower && DRUM_NAME_HINTS.some((hint) => lower.includes(hint))) return "drum";
  return "music";
}

/** The eight roles a bus decision covers, for gates and documentation. */
export const GROUP_BUS_ROLES: readonly { role: string; bus: GroupBus }[] = [
  { role: "kick", bus: "drum" },
  { role: "snare", bus: "drum" },
  { role: "hihat", bus: "drum" },
  { role: "percussion", bus: "drum" },
  { role: "bass", bus: "music" },
  { role: "chords", bus: "music" },
  { role: "lead", bus: "music" },
  { role: "fx", bus: "music" },
];
