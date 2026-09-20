# Genre cover images

These are **real photographs**, fetched one per genre from [Lorem Picsum](https://picsum.photos/), a
service that serves images from [Unsplash](https://unsplash.com/) under the
[Unsplash License](https://unsplash.com/license) (free to use, including commercially, without
permission or attribution required — attribution is nonetheless recorded here).

- Filename: `<genre-id>.jpg`, one per genre in the library (159 files at the time of writing).
- Source URL: `https://picsum.photos/seed/groove-<genre-id>/320/320` — seeded by the genre id, so a
  genre's image is stable and re-downloadable.
- Size: 320×320 JPEG.

Replacing them with hand-picked artwork is expected: `src/mobile/genreArt.ts` falls back to a
generated aurora cover when a file is missing, so any cover can be swapped for a better one (or
deleted) without touching code.
