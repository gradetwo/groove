# The `.groove` package format

This is the **specification** for the file the app and the MCP server both write and read: `GrooveProjectPackage`
(`src/types/project.ts`), validated by `validateGroovePackage` (`src/features/sequencer/projectDb.ts`) and produced by
`exportProjectPackage`. It exists because two AIs wrote their own project files by hand rather than trusting a format that was only
described in code, and because a format with an owner is a format that can be kept compatible on purpose.

## Shape

```jsonc
{
  "format": "groove-project",     // required, exact
  "version": 1 | 2,               // required
  "exportedAt": 1759000000000,    // ms since epoch
  "appVersion": "2.34.3",
  "project": {
    "id": "…", "name": "…", "genreId": "chicago-house", "genreName": "Chicago House",
    "bpm": 124, "swing": 0, "timeSignature": "4/4", "resolution": "1/16",
    "stepCount": 16,
    "patterns": { "A": { /* SequencerPattern */ }, "B": { /* SequencerPattern */ } },
    "activeSlot": "A", "songMode": false
  },
  "arrangement": {                // version 2 only, and only when the export is a *song*
    "clips": { "A": { /* SequencerPattern */ }, "B": { … } },
    "sections": [ { "id": "…", "slot": "A", "bars": 8, "label": "verse", "overrides": { … } } ],
    "activeSlot": "A"
  }
}
```

`project.patterns` is the **two-pattern editor shape**, and it is required at every version. `arrangement` is the **song**: the clip
library keyed by slot plus the ordered sections. A DAW-shaped composition is the second; the first is what the step editor shows
when there is no arrangement. Both travel in one file so that either view of the same work is complete.

An `arrangement` is stored **opaquely** by this format: the package's job is to carry the song's shape, not to interpret it. The
shape itself belongs to `src/types/song.ts`, and that is deliberate — the format does not get a second copy of the song model that
could drift from the first.

## Validation rules (`validateGroovePackage`)

A package is rejected — at import and, for our own exports, **before** anything is written to disk — when:

1. it is not an object;
2. `format` is not exactly `"groove-project"`;
3. `version` is not a number;
4. `project` is missing, or has no `genreId`, no `patterns`, or no `patterns.A`;
5. **v2 only**: `arrangement`, when present, is not an object;
6. **v2 only**: `arrangement.clips` is missing or not an object;
7. **v2 only**: `arrangement.sections` is not an array;
8. **v2 only**: `arrangement` carries **no clips at all** — a package that promises a song and has none fails rather than
   importing as silence.

## Version history and the compatibility commitment

* **version 1** — a two-pattern project. Every field is required as described above.
* **version 2** — the same, plus an optional `arrangement`. `exportProjectPackage` stamps `2` **only** when an arrangement is
  supplied; without one it writes the version 1 shape **byte for byte**, so nothing that exports a plain project changed.

**What we commit to:** a reader of this format must keep accepting every version it has ever accepted. Concretely, **version 1
packages stay readable forever** and mean "one clip, no sections" — which is exactly what a two-pattern project is — and no field
that exists in a released version may change meaning or become required. New information arrives as new **optional** fields with a
version bump, and a reader that does not know a field must carry it through untouched rather than dropping it.

**What we do not commit to:** the values inside `project.patterns` and `arrangement.clips` beyond the `SequencerPattern` type
itself. Track ids, lanes and step encodings are the sequencer's business and evolve with it; a package is a container for them, not
a promise that a given lane always exists.

## Why v1 stays valid rather than being migrated

There is no migration step, on purpose. A v1 package is **not** a broken v2 package: it is a complete two-pattern project, and "no
arrangement" already has a meaning in the reader (the `sections` field of a song may be empty). A migration would invent sections
that the author never wrote, which is a worse outcome than reading the file as what it is.

`import_groove` (MCP) refuses a v1 package **with an explanation** rather than guessing: it says the package is a project rather
than a song and points at `get_pattern` + `create_song`. That is the same principle as rule 8 — refuse and explain, never import
silence.
