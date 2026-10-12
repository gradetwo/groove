export interface SurveyFile {
  path: string;
  bytes?: number;
  sha256?: string;
  seconds?: number;
}
export declare function manifestEntryFromSurvey(
  identity: {
    id: string;
    name: string;
    licence: string;
    attribution?: string;
    prefix?: string;
    repo?: string;
    pin?: string;
    sfz?: string;
    needs?: string[];
  },
  files: SurveyFile[]
): { entry: Record<string, unknown>; builtIns: string[] };
