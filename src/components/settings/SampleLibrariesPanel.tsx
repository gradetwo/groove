import { useCallback, useEffect, useMemo, useState } from "react";
import { parseManifest } from "../../data/sampleManifest";
import {
  changeStoredUserLibraries,
  readStoredUserLibraries,
  type LibraryStorage,
} from "../../data/userLibraryStore";
import type { UserSoundLibrary } from "../../data/userLibraries";

/** The manifest the app itself loads by default, so the ids below are the ones the catalogue will really use. */
const MANIFEST_URL = "/samples/manifest.json";

/**
 * ⭐ **Adding your own sound source, in the app — the web half of `add_sample_library`.**
 *
 * The owner asked for this on both surfaces, and the two share everything that decides what a library *is*:
 * `parseUserLibraries` validates an entry and `mergeUserLibraries` puts it into the catalogue before asset ids
 * are made. So this component owns only what a browser adds — a form, a list, and the two things a person has
 * to be able to see: **whose library it is** and **whether it is actually reachable**.
 *
 * Three decisions worth stating, because each is a place this could have been quietly wrong:
 *
 *   * **The licence is required and `unknown` is offered as an answer.** A guessed licence would be believed,
 *     so the form says "unknown" in as many words rather than leaving the field blank and defaulting it.
 *   * **`durationSeconds` is optional and its absence is explained where it matters.** The catalogue refuses an
 *     entry with no measured duration — "a duration nobody measured is not a duration" — so a library without
 *     one is registered *and* reported as not yet playable, instead of being accepted and then missing.
 *   * **A library that would take a built-in's id is refused with the reason.** `reservedIds` comes from the
 *     catalogue the caller already has; without it the library would be stored and then dropped at merge time,
 *     looking to the person like it worked.
 */
export interface SampleLibrariesPanelProps {
  /** Ids the project already ships, so a collision can be refused here rather than silently later. */
  reservedIds?: string[];
  /** Injectable for tests; defaults to the browser's own storage. */
  storage?: LibraryStorage | null;
}

/** The empty form, so "add" starts from a stated blank rather than from whatever was typed last. */
const EMPTY_FORM = {
  id: "",
  name: "",
  licence: "unknown",
  sfz: "",
  repo: "",
  pin: "",
  sourceUrl: "",
  durationSeconds: "",
};

export function SampleLibrariesPanel({ reservedIds = [], storage }: SampleLibrariesPanelProps) {
  const [libraries, setLibraries] = useState<UserSoundLibrary[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [message, setMessage] = useState<string | undefined>(undefined);
  /**
   * ⭐ **The ids the project already ships, read from the manifest the app itself loads.**
   *
   * Without these, a library taking a built-in's id is accepted here — and then dropped at catalogue merge,
   * which is the failure that looks to a person like it worked. `mergeUserLibraries` refuses it too, and must,
   * because that is where the catalogue is built; this refusal exists so the message arrives at the moment of
   * typing rather than as an instrument that never appears.
   *
   * Parsed with `parseManifest`, the same parser the catalogue uses, rather than a second reader of the same
   * file. If the fetch fails the list is empty and the merge's own refusal still holds — the failure mode is a
   * worse message, not a hole.
   */
  const [shippedIds, setShippedIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) return;
        const parsed = parseManifest(await response.text());
        if (!cancelled && parsed.ok && parsed.manifest) {
          setShippedIds(parsed.manifest.entries.map((entry) => entry.id));
        }
      } catch {
        /* No manifest reachable: the merge's own refusal is the backstop, so this is not fatal. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    const read = readStoredUserLibraries(storage);
    setLibraries(read.libraries);
    setProblems(read.problems);
  }, [storage]);

  useEffect(refresh, [refresh]);

  /**
   * The union of what the caller passed and what the shipped manifest states. A caller that already knows the
   * catalogue can pass it; one that does not is covered by the fetch above.
   */
  const reserved = useMemo(() => new Set([...reservedIds, ...shippedIds]), [reservedIds, shippedIds]);

  const submit = () => {
    /**
     * The form is turned into a candidate and handed to the shared validator unchanged: no field is coerced
     * here, so what this panel accepts is exactly what the MCP surface accepts.
     */
    const candidate = {
      id: form.id.trim(),
      name: form.name.trim(),
      licence: form.licence,
      ...(form.sfz.trim() === "" ? {} : { sfz: form.sfz.trim() }),
      ...(form.repo.trim() === "" ? {} : { repo: form.repo.trim() }),
      ...(form.pin.trim() === "" ? {} : { pin: form.pin.trim() }),
      ...(form.sourceUrl.trim() === "" ? {} : { sourceUrl: form.sourceUrl.trim() }),
      ...(form.durationSeconds.trim() === "" ? {} : { durationSeconds: Number(form.durationSeconds) }),
    };
    const result = changeStoredUserLibraries({ library: candidate, reservedIds: reserved }, storage);
    setLibraries(result.libraries);
    setProblems(result.problems);
    if (result.changed === "added") {
      setForm({ ...EMPTY_FORM });
      setMessage(`Registered "${candidate.name}". Reload the catalogue to play it.`);
    } else {
      setMessage(undefined);
    }
  };

  const remove = (id: string) => {
    const result = changeStoredUserLibraries({ remove: id, reservedIds: reserved }, storage);
    setLibraries(result.libraries);
    setProblems(result.problems);
    setMessage(result.changed === "removed" ? `Removed "${id}".` : undefined);
  };

  return (
    <section data-testid="sample-libraries-panel" className="flex flex-col gap-4 text-text">
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Your sound libraries</h3>
        {/* ⭐ The sentence says what happens, not what the feature is called: this is where someone finds out
            that their own orchestral library can be played by the same engine as everything else. */}
        <p className="text-xs opacity-80">
          Point the app at an SFZ library you already have — a pinned repository, or a mirror you host — and its
          instruments join the catalogue. It is validated by the same rules the MCP tool uses, and its licence is
          recorded as you state it.
        </p>
      </header>

      {problems.length > 0 && (
        <ul data-testid="sample-library-problems" className="flex flex-col gap-1 text-xs text-[rgb(var(--d-danger))]">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {libraries.length === 0 ? (
        <p data-testid="sample-libraries-empty" className="text-xs opacity-70">
          No libraries of your own are registered yet.
        </p>
      ) : (
        <ul data-testid="sample-libraries-list" className="flex flex-col gap-2">
          {libraries.map((library) => (
            <li
              key={library.id}
              data-testid={`sample-library-${library.id}`}
              className="flex flex-col gap-1 rounded border border-[rgb(var(--d-line))] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{library.name}</strong>
                <button
                  type="button"
                  data-testid={`sample-library-remove-${library.id}`}
                  className="rounded border border-[rgb(var(--d-line))] px-2 py-1 text-xs"
                  onClick={() => remove(library.id)}
                >
                  Remove
                </button>
              </div>
              <span className="text-xs opacity-80">
                {library.id} · licence {library.licence}
                {library.durationSeconds === undefined
                  ? " · no duration measured, so it is registered but not yet in the catalogue"
                  : ` · ${library.durationSeconds}s`}
              </span>
              {library.sourceUrl && <span className="text-xs opacity-60">{library.sourceUrl}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded border border-[rgb(var(--d-line))] p-3">
        <h4 className="text-xs font-semibold">Register a library</h4>
        <label className="flex flex-col gap-1 text-xs">
          Id
          <input
            data-testid="sample-library-id"
            className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
            value={form.id}
            onChange={(event) => setForm((f) => ({ ...f, id: event.target.value }))}
            placeholder="my-orchestra"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            data-testid="sample-library-name"
            className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
            value={form.name}
            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="My Orchestra"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Licence
          <select
            data-testid="sample-library-licence"
            className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
            value={form.licence}
            onChange={(event) => setForm((f) => ({ ...f, licence: event.target.value }))}
          >
            {/* ⭐ `unknown` is first and is the default: it is a real answer, and guessing would be believed. */}
            <option value="unknown">unknown — I would rather say so than guess</option>
            <option value="CC0">CC0</option>
            <option value="CC-BY">CC-BY</option>
            <option value="CC-BY-SA">CC-BY-SA</option>
            <option value="CC-Sampling-Plus">CC-Sampling-Plus</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          SFZ path
          <input
            data-testid="sample-library-sfz"
            className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
            value={form.sfz}
            onChange={(event) => setForm((f) => ({ ...f, sfz: event.target.value }))}
            placeholder="Strings/SusVib/MyEns.sfz"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs">
            Repository
            <input
              data-testid="sample-library-repo"
              className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
              value={form.repo}
              onChange={(event) => setForm((f) => ({ ...f, repo: event.target.value }))}
              placeholder="owner/repo"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs">
            Pinned commit
            <input
              data-testid="sample-library-pin"
              className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
              value={form.pin}
              onChange={(event) => setForm((f) => ({ ...f, pin: event.target.value }))}
              placeholder="40-character sha"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs">
            Where you found it
            <input
              data-testid="sample-library-source-url"
              className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
              value={form.sourceUrl}
              onChange={(event) => setForm((f) => ({ ...f, sourceUrl: event.target.value }))}
              placeholder="https://…"
            />
          </label>
          <label className="flex w-32 flex-col gap-1 text-xs">
            Duration (s)
            <input
              data-testid="sample-library-duration"
              className="rounded border border-[rgb(var(--d-line))] bg-transparent px-2 py-1"
              value={form.durationSeconds}
              onChange={(event) => setForm((f) => ({ ...f, durationSeconds: event.target.value }))}
              placeholder="optional"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="sample-library-add"
            className="rounded bg-[rgb(var(--d-accent))] px-3 py-1 text-sm text-[rgb(var(--d-on-accent))]"
            onClick={submit}
          >
            Register
          </button>
          {message && (
            <span data-testid="sample-library-message" className="text-xs opacity-80">
              {message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
