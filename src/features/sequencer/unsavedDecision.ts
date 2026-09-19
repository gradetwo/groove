/**
 * What the user chose when told their changes will be lost.
 *
 * The guard hook resolves a promise with one of these, so it is the hook's contract; the dialog is
 * only one way to produce it. Defining it in the dialog made a logic hook depend on a component's
 * shape, which would have forced any other surface's prompt to edit the same file.
 *
 * `cancel` is the safe choice and belongs last in any ordering derived from this — see the dialog's
 * note about which option a hurried tap should not hit.
 */
export type UnsavedDecision = "save" | "discard" | "cancel";
