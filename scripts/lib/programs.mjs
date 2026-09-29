/**
 * The programs a library offers, from the SFZ files it holds.
 *
 * One rule, in one place, because two steps need it: the manifest builder, which enumerates a pinned tree, and the uploader, which unpacks a release archive. Both had their own idea of which program to name — the builder wrote a single
 * `sfz`, the uploader picked a top-level file or the shortest path — and a library's SFZ files are not its instruments anyway: VCSL's four families hold 155 SFZ files across 88 instruments, a harmonica alone having six variants.
 *
 * Group by directory and base name (dropping the ` - <articulation>` suffix) and keep one program per group, preferring `- Keyswitch`, because those files switch articulation by key range and so cover the others. Listing every variant would
 * turn an instrument list into an articulation list; listing none would leave the library unplayable.
 */
export function programsFrom(sfzPaths) {
  const groups = new Map();
  for (const path of sfzPaths) {
    const base = path.replace(/\.sfz$/i, "").replace(/\s+-\s+.*$/, "");
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(path);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, variants]) => ({
      sfz: variants.find((variant) => / - Keyswitch\.sfz$/i.test(variant)) ?? [...variants].sort()[0],
      /**
       * The name a person reads in a list of instruments, not the file's own tail. VCSL names its programs in words ("Baroque Alto Recorder", "Ball Whistle") and those pass through; Karoryfer numbers its files ("01_arco_modwheel"), so a leading
       * index and the separators are dropped. Case is left alone: title-casing is a locale question, and a truthful "arco modwheel" beats a confident "Arco Modwheel".
       */
      name: (base.split("/").pop() ?? base).replace(/^\d+\s*[-_ ]\s*/, "").replace(/[-_]+/g, " ").trim(),
    }));
}
