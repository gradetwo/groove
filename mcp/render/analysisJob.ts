/**
 * ⭐ **The analysis as its own process** (third evaluation, F07's second half).
 *
 * Measured before this existed: a two-minute analysis held the server's event loop for **10.5 s** with a 20 ms timer
 * getting **zero** ticks — every other request, progress notification and cancel check waited that long. The mechanism is
 * the one this repository already uses for long renders (`GROOVE_SPAN_JOB` in `mcp/server.ts`, spawned by
 * `mcp/render/spanHosts.ts`): the **same bundle** runs as a child process, because the bundle is what can import the app's
 * own code outside the dev server — and a child process can be **killed**, which is the cancellation the evaluation asked
 * for and which a synchronous call can never offer.
 *
 * The child reads a small job file (the WAV path and the request), writes the reply's JSON to stdout and exits. Nothing
 * about the analysis itself changes: the same `analyseWavFile`, so the readings are the same to the bit.
 */
import { readFileSync } from "node:fs";
import { analyseWavFile } from "./analysis";

export interface AnalysisJob {
  /** The `.wav` this server produced. */
  path: string;
  /** The caller's request, so a light read stays light in the child too. */
  only?: { discontinuities?: boolean };
}

export function readAnalysisJob(): AnalysisJob {
  const jobPath = process.env.GROOVE_ANALYSIS_JOB;
  if (!jobPath) throw new Error("GROOVE_ANALYSIS_JOB is not set, so there is no analysis to run");
  const parsed = JSON.parse(readFileSync(jobPath, "utf8")) as Partial<AnalysisJob>;
  if (typeof parsed.path !== "string" || parsed.path.length === 0) {
    throw new Error("the analysis job carries no path");
  }
  return { path: parsed.path, ...(parsed.only === undefined ? {} : { only: parsed.only }) };
}

/** ⭐ Runs one job and writes the reply **as JSON on stdout**, which is the whole protocol between host and child. */
export async function runAnalysisJob(): Promise<void> {
  const job = readAnalysisJob();
  const result = await analyseWavFile(job.path, job.only);
  process.stdout.write(JSON.stringify(result));
}
