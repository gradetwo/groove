import { commonMessages } from "./common";
import { studioMessages } from "./studio";
import { chordsMessages } from "./chords";
import { exploreMessages } from "./explore";
import { updatesMessages } from "./updates";
import { masterclassMessages } from "./masterclasses";
import { analyzerMessages } from "./analyzer";
import { projectsMessages } from "./projects";
import { makerMessages } from "./maker";

export const DICTIONARY = {
  ...commonMessages,
  ...studioMessages,
  ...chordsMessages,
  ...exploreMessages,
  ...updatesMessages,
  ...masterclassMessages,
  ...analyzerMessages,
  ...projectsMessages,
  ...makerMessages,
} as const;

export type MessageKey = keyof typeof DICTIONARY;
