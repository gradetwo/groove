/**
 * Turning a survey into a **manifest entry** — the last link of the mirror chain, and the only one whose output is committed.
 *
 * The chain is `plan → fetch → verify → measure → entry`, and everything before this produces side effects on a disk while this produces the one artifact that goes into the
 * repository. So it is pure, and it is where the two facts a real library taught are enforced rather than remembered:
 *
 *   * **`*`-prefixed names are SFZ built-ins, not files.** `sample=*silence` means "play nothing", so it must not appear in a manifest's file list — a list that named it would
 *     send a mirror looking for a URL that cannot exist;
 *   * **the entry's duration is the longest sample's**, because that is what a catalogue wants to state: how long the instrument can sound.
 */
const BUILT_IN = /^\*|[*?[\]]/;

/**
 * @param {{ id: string, name: string, licence: string, attribution?: string, prefix?: string, sfz?: string, needs?: string[] }} identity
 * @param {Array<{ path: string, bytes?: number, sha256?: string, seconds?: number }>} files — what the survey measured, one entry per planned file.
 */
export function manifestEntryFromSurvey(identity, files) {
  const real = files.filter((file) => !BUILT_IN.test(file.path));
  const builtIns = files.filter((file) => BUILT_IN.test(file.path));

  const measured = real.filter((file) => typeof file.seconds === "number" && Number.isFinite(file.seconds) && file.seconds > 0);
  // No sample measured means no duration to state, and the manifest says so by leaving the field out rather than by writing a zero the bridge would have to distrust.
  const durationSeconds = measured.length > 0 ? Math.max(...measured.map((file) => file.seconds)) : undefined;

  return {
    entry: {
      id: identity.id,
      name: identity.name,
      licence: identity.licence,
      ...(identity.attribution ? { attribution: identity.attribution } : {}),
      ...(identity.prefix ? { prefix: identity.prefix } : {}),
      ...(identity.repo ? { repo: identity.repo } : {}),
      ...(identity.pin ? { pin: identity.pin } : {}),
      ...(identity.sfz ? { sfz: identity.sfz } : {}),
      ...(identity.needs ? { needs: identity.needs } : {}),
      files: real.map((file) => ({
        path: file.path,
        ...(typeof file.bytes === "number" ? { bytes: file.bytes } : {}),
        ...(file.sha256 ? { sha256: file.sha256 } : {}),
      })),
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
    },
    /** Reported rather than dropped: a reviewer should see that the library references built-ins and that they were left out deliberately. */
    builtIns: builtIns.map((file) => file.path),
  };
}
