/**
 * Expanding a program's includes **over the network**, in waves, using the one synchronous expander.
 *
 * The include resolver takes a **synchronous** reader — `(path) => string | undefined` — which is free in Node and impossible in a browser. The wrong fix is a second, asynchronous copy of the include
 * semantics; the right one is to let the existing implementation say **what it could not read** and fetch exactly that, then run it again. That is what this does, and the loop terminates on
 * "`missing` stopped changing" rather than a fixed number of rounds, because the expander already has its own cycle and depth guards and this must not invent a second opinion about them.
 *
 * A path that never resolves is reported by the expander, so a genuinely broken library ends as a **named problem** rather than an infinite fetch loop.
 */
import { expandIncludes, type ExpandIncludesResult } from "./includes";

export interface RemoteIncludeOptions {
  /** Fetches one file, already source-first with the mirror as fallback. */
  fetchText: (url: string) => Promise<string>;
  /** The address the program was fetched from. */
  programUrl: string;
  /**
   * The address include paths resolve against — normally the **library root**, not the program's directory.
   *
   * Recorded because the first version used `new URL(path, programUrl)`, and the paths the expander reports are relative to the **library root** (they look like `Programs/keymaps/x.sfz`): resolving
   * those against the program's own directory produced `…/Programs/Programs/…` and every include came back 404. Two layouts again — the program is one path, its includes are another.
   */
  baseUrl?: string;
  maxDepth?: number;
}

export async function expandRemoteIncludes(text: string, options: RemoteIncludeOptions): Promise<ExpandIncludesResult> {
  const files = new Map<string, string>([[options.programUrl, text]]);
  const attempted = new Set<string>();
  const failures: string[] = [];

  // The synchronous reader answers from what has been fetched so far; anything else returns `undefined`, which is precisely how the expander reports it back as `missing`.
  const read = (path: string) => files.get(path);

  let result = expandIncludes(text, read, { path: options.programUrl, maxDepth: options.maxDepth });
  for (;;) {
    const wanted = result.missing.filter((path) => !attempted.has(path));
    if (wanted.length === 0) break;

    for (const path of wanted) {
      attempted.add(path);
      try {
        // Resolved against the program's own address, so a relative include becomes a real URL without a second implementation of the resolver's rules.
        /**
         * **A path that is already absolute must not be resolved again.** The expander reports the candidate it wanted, and once a wave has stored an absolute URL the next wave sees that absolute
         * URL as "missing" — re-resolving it against the base turned `https://host/…` into `https:/host/…`, one slash, and every include came back 404 with a message that looked like the file was
         * genuinely absent.
         */
        const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(path);
        files.set(path, await options.fetchText(absolute ? path : new URL(path, options.baseUrl ?? options.programUrl).toString()));
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    result = expandIncludes(text, read, { path: options.programUrl, maxDepth: options.maxDepth });
  }

  // Both failures are kept: what the expander could not resolve, and what the network could not deliver.
  return failures.length === 0 ? result : { ...result, problems: [...result.problems, ...failures] };
}
