import { commonMessages } from "./common";
import { studioMessages } from "./studio";
import { chordsMessages } from "./chords";
import { exploreMessages } from "./explore";
import { updatesMessages } from "./updates";
import { masterclassMessages } from "./masterclasses";
import { analyzerMessages } from "./analyzer";

export const DICTIONARY = {
  ...commonMessages,
  ...studioMessages,
  ...chordsMessages,
  ...exploreMessages,
  ...updatesMessages,
  ...masterclassMessages,
  ...analyzerMessages,
} as const;

export type MessageKey = keyof typeof DICTIONARY;
