/**
 * Step-parameter vocabulary: which per-step value the drawer is editing.
 *
 * These four names are the reducer's business — `SET_PARAMETER_DIMENSION` stores exactly this union
 * — and the editing hook needs to name them. They used to live in `VelocityLane.tsx`, so the hook
 * imported a React component to spell its own action's argument, which is the coupling the layering
 * gate exists to catch.
 *
 * Kept dependency-free: this is the contract between the editing logic and whichever surface draws
 * the control, so every surface can import it without importing a view.
 */
export type ParameterDimension = "velocity" | "probability" | "ratchet" | "gate";
