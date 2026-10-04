/**
 * ⭐ **The genre and library tools, split out of the arrangement module when it grew too large.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import { CustomGenre } from "../src/types/customGenre";
import { deleteMcpCustomGenre, getMcpCustomGenre, listMcpCustomGenres, saveMcpCustomGenre } from "./customGenres";
import { listSampleLibraries } from "./instruments";
import { getGenre, getGenreRelations, listCategories, listGenres, searchGenres } from "./library";
import { ToolDefinition, customGenreSchema, failure } from "./toolKit";
import { z } from "zod";

export const LIBRARY_TOOLS: ToolDefinition[] = [
  {
    name: "list_sample_libraries",
    title: "List sample libraries, their licences and what is missing",
    description:
      "The libraries this project has pinned. **With the licence and the provenance of each**. The question to ask before publishing anything made with them. Attribution-required licences are named in the reply, with the `sourceUrl` (and the `repo`/`pin` for a byte-for-byte reference) to point at. A library with no measured duration says so rather than reporting a zero. Durations are written by the mirroring step after the bytes are downloaded. Until then the honest answer is that nobody measured one.",
    readOnly: true,
    inputSchema: {},
    handler: () => {
      try {
        return listSampleLibraries();
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "list_genres",
    title: "List genres",
    description:
      "The genre library, filtered by category and paged. Returns the compact row (bpm, key, era, track/step counts, swing) for each genre, not the full document.",
    readOnly: true,
    inputSchema: {
      category: z.string().optional().describe("one of the categories from list_categories, case-insensitive"),
      limit: z.number().int().min(1).max(200).optional().describe("default 50"),
      offset: z.number().int().min(0).optional(),
    },
    handler: (args) => listGenres(args as { category?: string; limit?: number; offset?: number }),
  },
  {
    name: "get_genre",
    title: "Get a genre",
    description:
      "One genre in full: recorded metadata (era, origin, cultural context, key characteristics, sound design, rhythm features, production tips, representative tracks). Its instrumentation, radar metrics, mix, loudness trim and lineage siblings.",
    readOnly: true,
    inputSchema: { id: z.string().describe("genre id, e.g. chicago-house") },
    handler: (args) => {
      const result = getGenre(String(args.id));
      return result ?? failure(`unknown genre "${String(args.id)}" — use list_genres or search_genres`);
    },
  },
  {
    name: "search_genres",
    title: "Search genres",
    description: "Fuzzy search over id, name, aliases, subgenres, category, era/origin and description, with the matched fields reported.",
    readOnly: true,
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional().describe("default 10"),
    },
    handler: (args) => searchGenres({ query: String(args.query), limit: args.limit as number | undefined }),
  },
  {
    name: "list_categories",
    title: "List categories",
    description: "The genre categories and how many genres each holds.",
    readOnly: true,
    inputSchema: {},
    handler: () => listCategories(),
  },
  {
    name: "get_genre_relations",
    title: "Get genre relations",
    description: "The recorded influences/derivations for a genre (from the app's relation graph), plus its declared parents, subgenres and related genres.",
    readOnly: true,
    inputSchema: { id: z.string() },
    handler: (args) => {
      const result = getGenreRelations(String(args.id));
      return result ?? failure(`unknown genre "${String(args.id)}"`);
    },
  },
  {
    name: "list_custom_genres",
    title: "List saved custom genres",
    description:
      "The custom genres saved in this MCP session, newest first: id, name, category, tempo, track count and the genre each was forked from. This is the server session's own store, separate from the browser's IndexedDB library, so it lists what an agent saved here rather than what a person made in the app.",
    readOnly: true,
    inputSchema: {},
    handler: () => listMcpCustomGenres(),
  },
  {
    name: "get_custom_genre",
    title: "Get a custom genre",
    description:
      "One custom genre in full: every recorded field and its eight-track pattern, exactly as save_custom_genre stored it. The pattern's genre_id is the genre's own id, so the pattern can be passed straight to get_pattern, apply_pattern_ops or render_audio.",
    readOnly: true,
    inputSchema: { id: z.string().describe("a custom genre id, as list_custom_genres returns") },
    handler: async (args) => {
      const genre = await getMcpCustomGenre(String(args.id));
      return genre ?? failure(`unknown custom genre "${String(args.id)}" — list_custom_genres returns the genres saved in this session`);
    },
  },
  {
    name: "save_custom_genre",
    title: "Save a custom genre",
    description:
      "Save a custom genre, or fork a library genre and save the fork. Give forkFromGenreId (an id list_genres returns) and the fork copies that genre's metadata, pattern and lineage with the same forkGenre the app's Fork button calls. Give genre to save a document you already have, such as one from get_custom_genre. Saving the same id twice replaces the first rather than adding a second. The store is process-local: the genre lives for this session and is separate from the browser's library.",
    readOnly: false,
    inputSchema: {
      forkFromGenreId: z.string().optional().describe("an id to fork, from list_genres or from an earlier save in this session"),
      genre: customGenreSchema.optional().describe("or a full custom genre document to save as given"),
      name: z.string().optional().describe('the name to save under; for a fork it replaces the generated "<name> (Variation)"'),
    },
    handler: async (args) => {
      try {
        return await saveMcpCustomGenre({
          ...(args.forkFromGenreId === undefined ? {} : { forkFromGenreId: String(args.forkFromGenreId) }),
          ...(args.genre === undefined ? {} : { genre: args.genre as CustomGenre }),
          ...(args.name === undefined ? {} : { name: String(args.name) }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "delete_custom_genre",
    title: "Delete a custom genre",
    description:
      "Remove a custom genre from this session's store and report the ids that remain. A genre that is not there is refused with the ids that are, rather than reported as deleted.",
    readOnly: false,
    inputSchema: { id: z.string().describe("a custom genre id, as list_custom_genres returns") },
    handler: async (args) => {
      try {
        return await deleteMcpCustomGenre(String(args.id));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
