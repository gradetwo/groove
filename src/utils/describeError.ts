/**
 * 🗣 **Anything that can be thrown, as one sentence a person can read.**
 *
 * Three modules had grown this same function — the arrangement file route and the two sequencer action hooks — so it
 * lives once. Two properties matter and both have been wrong somewhere in the family:
 *
 *   * **It never returns a non-string.** `JSON.stringify(undefined)` answers `undefined`, not `"undefined"`, so a
 *     version that ends `return JSON.stringify(error)` hands `undefined` to an i18n call that deliberately preserves
 *     unknown placeholders (`formatMessage`), and the user is shown a literal `{error}`. That is the failure the
 *     original comment described while the code still had it.
 *   * **A plain object does not become `[object Object]`.** A rejected non-Error is common enough (a rejected plain
 *     object, a DOM-ish shape), and `String({})` is unreadable, so JSON comes first and `String` is only the last
 *     resort for something JSON refuses (a cycle, a BigInt).
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  /** Nothing to say: still say something, because the caller is going to put this on screen. */
  if (error === undefined || error === null) return "an unrecognised failure with no message";
  try {
    const text = JSON.stringify(error);
    return typeof text === "string" && text.length > 0 ? text : String(error);
  } catch {
    return String(error);
  }
}
