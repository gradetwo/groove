/**
 * SFZ's `default_path` — the second half of what a file like Salamander Grand Piano needs before it can sound.
 *
 * Reading that file showed both halves. It writes `default_path=Samples/` in its `<control>` block, and its regions name their samples relative to that: without honouring it, every `sample=` resolves one directory too high
 * and the instrument is silent with nothing visibly wrong.
 *
 * **It is a join, not a replacement.** A region's `sample=` is relative to `default_path`, and `default_path` is relative to the program — so the two compose in that order, and a `sample=` that is already absolute (or a
 * full URL) must be left alone rather than joined to something that does not apply to it. That is the same rule the include resolution learned: path arithmetic applied to something that is not a relative path is how a
 * working address gets broken.
 */

/**
 * Join a region's `sample` with the file's `default_path`.
 *
 * Returns the path as written when either part is absent, because "no default path" means the sample is already relative to the program and adding anything would be an invention.
 */
export function resolveSamplePath(sample: string, defaultPath: string | undefined): string {
  if (sample === "") return sample;
  // ⭐ Absolute and URL forms are not relative to a default path, and joining them would corrupt an address that already works.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(sample) || sample.startsWith("/")) return sample;
  if (defaultPath === undefined || defaultPath === "") return sample;

  /**
   * ⭐ Trailing and leading separators are normalised rather than assumed. `default_path=Samples/` with `sample=kick.flac` is the common case, but a `default_path` written without its trailing slash is just as valid, and
   * `Samples` + `/` + `kick.flac` must not become `Samples//kick.flac`.
   */
  const base = defaultPath.endsWith("/") ? defaultPath : `${defaultPath}/`;
  const leaf = sample.startsWith("/") ? sample.slice(1) : sample;
  return `${base}${leaf}`;
}

/** The `default_path` a parsed file declared, from whichever block carried it — `<control>` in modern files, `<global>` in older ones. */
export function defaultPathFrom(opcodes: Readonly<Record<string, string | undefined>>): string | undefined {
  const value = opcodes.default_path?.trim();
  return value === undefined || value === "" ? undefined : value;
}
