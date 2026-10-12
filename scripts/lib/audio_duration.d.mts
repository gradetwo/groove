export declare class DurationError extends Error {}
export interface DurationRunner {
  run(command: string, args: string[]): string;
}
export declare function audioDurationSeconds(
  path: string,
  options: { run: (command: string, args: string[]) => string }
): { seconds: number; sampleRate: number | null; samples: number | null };
export declare function longestDuration(
  paths: string[],
  options: { run: (command: string, args: string[]) => string }
): ({ path: string } & { seconds: number; sampleRate: number | null; samples: number | null }) | null;
