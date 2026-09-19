/**
 * Standalone Genre Database Integrity & Schema Linter
 * Can be run in CI or pre-commit hooks
 */
import { ALL_GENRES } from "../src/data/genres";
import { auditGenreContent, MIN_GENRE_SOURCES, validateGenresDatabase } from "../src/data/schema";
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

// Content audit (E-11b): empty taxonomy arrays, templated copy, thin citations.
// Hard vs report-only is decided inside auditGenreContent:
//   - fewer than MIN_GENRE_SOURCES sources  => HARD failure (exits non-zero)
//   - empty taxonomy arrays                 => warning count only (known baseline)
//   - templated placeholder copy            => warning count only
const contentAudit = auditGenreContent(ALL_GENRES);

console.log(`\n[Genre Linter] Content audit summary:`);
console.log(
  `  · taxonomy arrays all empty: ${contentAudit.emptyTaxonomy.count}/${contentAudit.totalGenres}` +
    ` (warning; not a failure)`
);
console.log(
  `  · templated / placeholder copy: ${contentAudit.templatedText.count}/${contentAudit.totalGenres}` +
    ` (warning; not a failure)`
);
console.log(
  `  · fewer than ${MIN_GENRE_SOURCES} sources: ${contentAudit.insufficientSources.count}/${contentAudit.totalGenres}` +
    ` (hard rule)`
);

contentAudit.warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));
contentAudit.hardViolations.forEach((violation) => {
  console.error(`❌ ${violation}`);
  failed = true;
});

if (contentAudit.insufficientSources.count > 0) {
  const sample = contentAudit.insufficientSources.genreIds.slice(0, 20).join(", ");
  const suffix = contentAudit.insufficientSources.genreIds.length > 20 ? ", …" : "";
  console.error(`   offending genres: ${sample}${suffix}`);
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
  console.error(`\n❌ Genre database audit FAILED (hard threshold exceeded).`);
  process.exit(1);
} else {
  console.log(
    `\n✅ All ${ALL_GENRES.length} genres, ${GENRE_RELATIONS.length} relations, and ` +
      `${TIMELINE_STORIES.length} timeline stories passed the hard audit. ` +
      `${contentAudit.warnings.length} report-only warning(s) above.`
  );
  process.exit(0);
}
