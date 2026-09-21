/**
 * The one piece of Markdown the changelog uses.
 *
 * `public/changelog.json` has always written its highlights with `**bold**` around the sentence that
 * matters, and the updates panel has always printed it literally — so the first thing a reader saw was
 * a wall of asterisks. That became obvious the moment the panel started opening on the phone (it had
 * been mounted only on the desktop), and it is fixed here rather than by rewriting 192 changelog entries:
 * the entries are a release record and are not to be edited to suit a renderer.
 *
 * Deliberately not a Markdown parser. It handles `**bold**`, it never throws, and anything it does not
 * understand is returned as literal text — an unclosed `**` stays visible, which is the honest outcome
 * for a typo in a changelog, and it keeps this a pure function with no surprise markup.
 */
export interface TextRun {
  text: string;
  bold: boolean;
}

/** Split a line into plain and bold runs. `**like this**` becomes a bold run. */
export function splitBoldRuns(input: string): TextRun[] {
  if (!input) return [];
  const runs: TextRun[] = [];
  let rest = input;
  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) break;
    const close = rest.indexOf("**", open + 2);
    if (close === -1) break; // an unclosed marker is literal text, not a swallowed tail
    if (open > 0) runs.push({ text: rest.slice(0, open), bold: false });
    const inner = rest.slice(open + 2, close);
    // `****` and `** **` mark up nothing (or only whitespace): keep them visible rather than rendering
    // an invisible bold space where the author meant to type something.
    if (inner.trim().length === 0) runs.push({ text: `**${inner}**`, bold: false });
    else runs.push({ text: inner, bold: true });
    rest = rest.slice(close + 2);
  }
  if (rest.length > 0) runs.push({ text: rest, bold: false });
  return runs;
}
