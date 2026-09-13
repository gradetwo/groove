import { commonMessages } from "./common";
import { studioMessages } from "./studio";
import { chordsMessages } from "./chords";
import { exploreMessages } from "./explore";
import { updatesMessages } from "./updates";
import { masterclassMessages } from "./masterclasses";

export const DICTIONARY = {
  ...commonMessages,
  ...studioMessages,
  ...chordsMessages,
  ...exploreMessages,
  ...updatesMessages,
  ...masterclassMessages,
} as const;

export type MessageKey = keyof typeof DICTIONARY;
