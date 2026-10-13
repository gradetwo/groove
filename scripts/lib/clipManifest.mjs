/**
 * **Do the phone shell's clip addresses point at the mirror that actually serves them?**
 *
 * ## Why this exists
 *
 * `public/genre-clips.json` is generated: the shard manifests under `dist-clips/` hold **relative** filenames
 * (`chicago-house.mp3`) and the `--base` passed to `scripts/build_genre_clips.mjs --merge` supplies the host. Release
 * `v2.37.6` (`68b6407`, 2026-10-12) re-stamped all 159 entries with the base `https://r2mirror.wangda.today` — the
 * correct host is `https://r2mirror.groove.wangda.today`, and the wrong one does not resolve at all. Every release
 * step passed: the version matched, the budget held, the remote matrix was green, and `deploy.mjs`'s existing sample
 * check looked at `public/samples/manifest.json` (whose bytes come from upstream source repositories, so it never
 * mentions this mirror). The phone shell shipped with **159 dead clip URLs** and the only symptom was silence.
 *
 * ## The rule
 *
 * Every `url` in the shipped clip manifest must live at the **configured mirror root** — the same `VITE_SAMPLE_ROOT`
 * the built app inlines. A manifest generated with a different base is refused before anything is uploaded, and the
 * failure names the host it found and the host it wanted, because "the URLs are wrong" is not a repair.
 *
 * ⚠️ **Only the origin is compared.** A clip is served from `<root>/clips/<genre>.mp3`, and the path beneath the root
 * is the manifest's business; comparing whole URLs would make this refuse a correct release the first time a clip
 * moves to another prefix.
 */

/** The origin of an absolute URL, or null when the value is not one. */
function originOf(url) {
  try {
    return new URL(String(url)).origin;
  } catch {
    return null;
  }
}

/**
 * The verdict, as data rather than as a process exit, so a criterion can drive it with a fixture.
 *
 * @param {{manifestText?: string, root?: string}} input `manifestText` is the shipped clip manifest; `root` is the
 *   configured mirror (empty means "not configured", which is a failure for this manifest — unlike the sampler's,
 *   these bytes are served only by the mirror).
 * @returns {{ok: boolean, reason?: string, checked?: number, hosts?: string[]}}
 */
export function clipManifestVerdict({ manifestText, root }) {
  const configured = (root ?? "").trim().replace(/\/+$/, "");
  const wanted = originOf(configured);
  if (!wanted) {
    return {
      ok: false,
      reason:
        "no mirror root is configured, so the shipped clip manifest cannot be checked against one.\n" +
        "   Set VITE_SAMPLE_ROOT (gitignored .env.local), or pass --root=, and build again.",
    };
  }

  let clips;
  try {
    clips = JSON.parse(manifestText ?? "")?.clips;
  } catch (error) {
    return { ok: false, reason: `the clip manifest is not valid JSON: ${String(error?.message ?? error)}` };
  }
  if (!Array.isArray(clips) || clips.length === 0) {
    return { ok: false, reason: "the clip manifest lists no clips, so the phone shell has nothing to play." };
  }

  const wrong = new Map();
  for (const clip of clips) {
    const origin = originOf(clip?.url);
    if (origin === wanted) continue;
    const key = origin ?? "(not absolute)";
    wrong.set(key, (wrong.get(key) ?? 0) + 1);
  }

  const hosts = [...new Set(clips.map((clip) => originOf(clip?.url)).filter(Boolean))];
  if (wrong.size === 0) return { ok: true, checked: clips.length, hosts };

  const found = [...wrong.entries()].map(([host, count]) => `${host} (${count} clip${count === 1 ? "" : "s"})`).join(", ");
  return {
    ok: false,
    checked: clips.length,
    hosts,
    reason:
      `${wrong.size === 1 ? "a host" : "hosts"} other than the configured mirror serve these clips: ${found}.\n` +
      `   The configured mirror is ${configured}, and the app inlines it — a clip at another host is silence.\n` +
      "   Re-point the manifest from the shard manifests rather than editing 159 lines by hand:\n" +
      `   node scripts/build_genre_clips.mjs --merge --base ${configured}`,
  };
}
