/**
 * Standalone Genre Database Integrity & Schema Linter
 * Can be run in CI or pre-commit hooks
 */
import { ALL_GENRES } from "../src/data/genres";
import { validateGenresDatabase } from "../src/data/schema";
import { GENRE_RELATIONS } from "../src/data/relations";
import { TIMELINE_STORIES } from "../src/data/timeline_stories";

console.log(`[Genre Linter] Auditing ${ALL_GENRES.length} music genres...`);

const dbResult = validateGenresDatabase(ALL_GENRES);

let failed = false;

if (dbResult.duplicateIds.length > 0) {
  console.error(`❌ Duplicate genre IDs found:`, dbResult.duplicateIds);
  failed = true;
}

const errorCount = Object.keys(dbResult.genreErrors).length;
if (errorCount > 0) {
  console.error(`❌ ${errorCount} genres failed schema validation:`);
  Object.entries(dbResult.genreErrors).forEach(([genreId, errs]) => {
    console.error(`  - ${genreId}:`);
    errs.forEach((err) => console.error(`      * ${err}`));
  });
  failed = true;
}

// Validate relations
const genreIdSet = new Set(ALL_GENRES.map((g) => g.id));
let relationErrors = 0;
GENRE_RELATIONS.forEach((rel, idx) => {
  if (!genreIdSet.has(rel.source)) {
    console.error(`❌ Relation[${idx}] references unknown source: "${rel.source}"`);
    relationErrors++;
    failed = true;
  }
  if (!genreIdSet.has(rel.target)) {
    console.error(`❌ Relation[${idx}] references unknown target: "${rel.target}"`);
    relationErrors++;
    failed = true;
  }
});

// Validate timeline stories
let storyErrors = 0;
TIMELINE_STORIES.forEach((story, idx) => {
  story.genre_ids.forEach((gid) => {
    if (!genreIdSet.has(gid)) {
      console.error(`❌ Story[${idx}] ("${story.title.en}") references unknown genre: "${gid}"`);
      storyErrors++;
      failed = true;
    }
  });
});

if (failed) {
  console.error(`\n❌ Genre database audit FAILED.`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${ALL_GENRES.length} genres, ${GENRE_RELATIONS.length} relations, and ${TIMELINE_STORIES.length} timeline stories passed audit cleanly!`);
  process.exit(0);
}
