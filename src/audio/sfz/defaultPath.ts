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

  /**
   * ⭐ **SFZ writes its separators either way, and VSCO 2 CE writes `\`.** Every one of that library's 75 programs declares a Windows-style path — `default_path=Strings\Violin Section\susVib\` — so a `sample=` joined to it
   * unnormalised produced `Strings\Violin Section\susVib\/Vln….wav`: a backslash on the left, the sample's own separator on the right, and **two separators in the middle**. None of that is an error a caller can see; it is a
   * 404 on every sample of a library that would otherwise sound, which is the failure mode this file exists to prevent. So the separator is read the way SFZ defines it rather than the way it happened to be typed.
   */
  const leaf = sample.replace(/\\/g, "/");
  if (leaf.startsWith("/")) return leaf;
  if (defaultPath === undefined || defaultPath === "") return leaf;

  /**
   * ⭐ Trailing and leading separators are normalised rather than assumed. `default_path=Samples/` with `sample=kick.flac` is the common case, but a `default_path` written without its trailing slash is just as valid, and
   * `Samples` + `/` + `kick.flac` must not become `Samples//kick.flac`. A default path of `\` or `/` alone is the library root, which must join to the bare leaf rather than to `//leaf`.
   */
  const base = defaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return base === "" ? leaf.replace(/^\/+/, "") : `${base}/${leaf.replace(/^\/+/, "")}`;
}

/** The `default_path` a parsed file declared, from whichever block carried it — `<control>` in modern files, `<global>` in older ones. */
export function defaultPathFrom(opcodes: Readonly<Record<string, string | undefined>>): string | undefined {
  const value = opcodes.default_path?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** Whether a path is already an absolute address rather than something relative to a file — the rule `resolveSamplePath` applies, in one place. */
export function isAbsolutePath(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("/") || /^[a-zA-Z]+:/.test(value);
}

/**
 * ⭐ **A sample path declared in an included file, as a path relative to a base the caller names.**
 *
 * The two bases it is asked about are both real questions, and neither is the other's answer:
 *
 * · **The program's directory** — the reference engine's rule, and the one this project uses by default. sfizz resolves every `sample=` against the **main program's**
 *   directory plus the `default_path` in force (`Synth::Impl::buildRegion` hands the Layer only `defaultPath_`; `Region::parseOpcode` builds `defaultPath + sample`;
 *   `FilePool` opens `rootDirectory / filename`), and a render says the same: a fixture whose `Programs/root.sfz` includes `Programs/sub/art.sfz`, and that file writes
 *   `sample=..\Samples\tone.wav`, plays at peak **0.0604** through the root and **0.00003** through `sub/art.sfz` as its own entry point. That rule is what makes
 *   `karoryfer.war-tuba`'s six acoustic roots work, and under it **not one of their 23 232 regions dangles**.
 * · **The declaring file's directory** — what an articulation file "meant" when read as an entry point of its own, which is how the "3 850 of 4 387 dangling" figure was
 *   produced. It is a legitimate reading and it is **not** sfizz's, so a caller asks for it explicitly.
 *
 * `base` is the path of the file whose directory is the answer's origin, given in the same currency as `declaredIn` (a library-relative or URL-joined path). Only a walk
 * that would leave `base`'s own directory above the library is refused — see the two refusals below — and a `base` that cannot be inspected is treated as no constraint
 * rather than as an error.
 *
 * **Refusals, because path arithmetic is where this codebase has lost working addresses:**
 *
 * · an **absolute** sample path (or a URL, or a `C:` form) is returned unchanged — it never meant "relative to the declaring file";
 * · a sample whose own `..` climb cannot be paid for by a directory that exists in the path template is returned unchanged, because then it names a directory that is
 *   not there at all. The caller can see what it asked for; this function refuses to invent a location.
 */
export function samplePathRelativeToProgram(sample: string, declaredIn: string | undefined, programPath: string): string {
  if (sample === "" || declaredIn === undefined || declaredIn === "") return sample;
  if (isAbsolutePath(sample)) return sample;
  const segments = (value: string): string[] => value.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  const directoryOf = (value: string): string[] => (value.includes("/") ? segments(value.slice(0, value.lastIndexOf("/"))) : []);
  /**
   * ⭐ **Both arguments are library-relative paths**, which is the fact the first version of this function got wrong: it resolved one against the other with
   * `new URL("Programs/legato/a.sfz", "/lib/Programs/1.sfz")`, which **throws** (`ERR_INVALID_URL` — a relative reference against a base with no scheme), the `catch`
   * returned the input, and the answer came out `Programs/Samples/…` instead of `../Samples/…`. `sourcePath` is library-relative because that is the currency the include
   * expander trades in, and `sampleAssetForPath` passes the program in the same currency.
   */
  const programDirectory = directoryOf(programPath);
  /**
   * ⭐ **Where the sample stands, counted from the library root** — the one quantity the declaring file and the program can both be measured against.
   *
   * The walk starts on the declaring file's own directory, so `..\Samples\take.wav` from `Programs/legato/` lands on `Samples/take.wav`, which is where the library
   * keeps it. A `..` with nothing left to pop names a place above the library root, and no relative spelling of that resolves where the file meant — so the input comes
   * back unchanged and the caller can see what it asked for.
   */
  const position = [...directoryOf(declaredIn)];
  for (const part of segments(sample)) {
    if (part !== "..") {
      position.push(part);
      continue;
    }
    if (position.length === 0) return sample;
    position.pop();
  }
  /**
   * ⭐ **The answer is that place seen from the program's directory, and it is computed once rather than spelled twice.**
   *
   * The two share a head — `Programs` for a program in `Programs/1-solo.sfz` and a sample at `Programs/Samples/take.wav` — which is dropped; every program directory
   * beyond it becomes one `..`; the rest is the sample's own path. `Programs/legato/art.sfz` naming `..\Samples\take.wav` under `Programs/1-solo.sfz` therefore gives
   * `../Samples/take.wav`. Comparing the paths as strings instead (what the earlier versions of this function did) matched a literal `..` against `"Programs"` and
   * answered `Samples/take.wav`, one directory too high.
   */
  let shared = 0;
  while (shared < programDirectory.length && shared < position.length && programDirectory[shared] === position[shared]) shared += 1;
  return [...Array<string>(programDirectory.length - shared).fill(".."), ...position.slice(shared)].join("/");
}


/**
 * ⭐ **The library-relative path a URL names**, given the library-relative path of one file inside it.
 *
 * `sourcePath` is relative to the library root while a program URL carries a prefix the library knows nothing about (`https://host/owner/repo/<pin>/Programs/x.sfz`)
 * — and the two have to be comparable before any path arithmetic can happen. The marker is the declaring file itself: everything in the URL from the first segment the
 * two share is the library's own path, so the answer is that suffix.
 *
 * The first version used the **last** occurrence, `url.lastIndexOf` over the whole relative path with a fallback of `0`, and for a mirror URL that fallback silently
 * produced the entire URL as a "path" and resolved every sample into nonsense. Using the **program** URL (not the declaring one) and the first common segment is the part
 * that does not depend on a pattern match.
 *
 * When no segment is shared — a script naming `Programs/…` while the URL names `SFZ/Programs/…` — the longest suffix of the library path that occurs in the URL is used,
 * which is the reading every SFZ addressing scheme this project has seen agrees on. Nothing shared at all returns `undefined`, and the caller then treats the declaring
 * path as relative to the program rather than inventing a base.
 */
export function libraryPathOf(programUrl: string, sourcePath: string): string | undefined {
  if (sourcePath === "" || isAbsolutePath(sourcePath)) return sourcePath === "" ? undefined : sourcePath;
  const urlSegments = programUrl.replace(/[?#].*$/, "").split("/").filter((part) => part !== "");
  if (urlSegments.length === 0) return undefined;
  const sourceSegments = sourcePath.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  for (let at = 0; at < sourceSegments.length; at += 1) {
    const marker = sourceSegments[at]!;
    const index = urlSegments.lastIndexOf(marker);
    if (index === -1) continue;
    return [...urlSegments.slice(index), ...sourceSegments.slice(at + 1)].join("/");
  }
  return undefined;
}
