/**
 * The arrangement's track kinds, as the interface names them.
 *
 * **One table rather than three copies.** The new-project panel, the add-track menu and the track list's kind chooser
 * all list the same kinds, and three hand-written arrays are how one of them keeps saying "Instrument" after the model
 * has moved on — which is exactly the confusion this rename exists to end: the kind is a **built-in synthesiser**, and
 * a sampled piano lives on `sampler`.
 *
 * The labels are i18n keys (`kind_*` in `src/i18n/locales/common.ts`) rather than English strings, so the Chinese
 * menu says 合成器 and not "Synth".
 */
import type { TrackKindV2 } from "../../types/arrangementV2";

/** The dictionary key for each kind's display name. */
export const KIND_LABEL_KEY: Record<TrackKindV2, string> = {
  synth: "kind_synth",
  sampler: "kind_sampler",
  drumkit: "kind_drumkit",
  fx: "kind_fx",
  folder: "kind_folder",
};

/**
 * Every kind, in the order the menus offer them.
 *
 * `synth` first because it is the model's own default kind, and `folder` last because it makes no sound and belongs
 * after the kinds that do.
 */
export const TRACK_KIND_ORDER: readonly TrackKindV2[] = ["synth", "sampler", "drumkit", "fx", "folder"];
