import { commonMessages } from "./common";
import { studioMessages } from "./studio";
import { chordsMessages } from "./chords";
import { exploreMessages } from "./explore";
import { updatesMessages } from "./updates";
import { masterclassMessages } from "./masterclasses";
import { analyzerMessages } from "./analyzer";
import { projectsMessages } from "./projects";
import { makerMessages } from "./maker";
import { hapticsMessages } from "./haptics";
import { helpMessages } from "./help";

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
  ...hapticsMessages,
  ...helpMessages,
} as const;

export type MessageKey = keyof typeof DICTIONARY;
