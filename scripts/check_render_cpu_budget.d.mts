/** Types for the render CPU budget checker (plain ESM, so its shape is declared here). */
export type RenderCpuRow = { scenario: string; wallSec: number; cpuSec: number; percent: number };
export type RenderCpuVerdict = { rows: RenderCpuRow[]; worst: number; over: string[]; ok: boolean };
export declare const MAX_PERCENT: number;
export declare function parseRenderCpu(text: string): RenderCpuRow[];
export declare function judge(rows: RenderCpuRow[], maxPercent?: number): RenderCpuVerdict;
