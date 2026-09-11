import { commonMessages } from "./common";
import { studioMessages } from "./studio";
import { chordsMessages } from "./chords";
import { exploreMessages } from "./explore";
import { updatesMessages } from "./updates";

export const DICTIONARY = {
  ...commonMessages,
  ...studioMessages,
  ...chordsMessages,
  ...exploreMessages,
  ...updatesMessages,
} as const;

export type MessageKey = keyof typeof DICTIONARY;
