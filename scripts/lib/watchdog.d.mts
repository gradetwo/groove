/** ⭐ The declaration exists so `src/test/renderWatchdog.test.ts` can import the watchdog without `any` (TS7016). */
export interface WatchdogResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  killedByWatchdog: boolean;
  elapsedMs: number;
  stdout: string;
  stderr: string;
}
export function runWithWatchdog(
  command: string,
  args?: string[],
  options?: { limitMs?: number; cwd?: string; env?: Record<string, string | undefined>; onOutput?: (text: string) => void },
): Promise<WatchdogResult>;
