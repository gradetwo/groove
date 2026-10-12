/**
 * ⭐ **When the first-run tour may open itself** (production defect, measured on live 2026-10-09).
 *
 * Reported as "the live new-project page is broken — clicking does nothing", and reproduced in a browser: the tour's
 * overlay (`fixed inset-0 z-50 … bg-black/75`) covered `/new`, so the element under the Create button was the tour, and
 * pressing Create did nothing at all. Skipping the tour made the same button work instantly — the button was never broken,
 * it was **behind a modal**.
 *
 * The tour opens itself 700 ms after load for anyone without `ONBOARDING_COMPLETED_KEY`, on every route. On `/new` that is
 * wrong on its own terms: that route is a chooser whose whole job is one action, and the tour's steps are about the studio
 * — so it covers the thing the person came to do and then explains something else. It stays available from Help, and it
 * still opens itself on the routes whose work it describes.
 */
export interface OnboardingAutoLaunchInput {
  /** True on the `/new` route, which exists only to create a project. */
  newProject: boolean;
  /** Whether this browser has already completed (or skipped) the tour. */
  completed: boolean;
}

export function shouldAutoLaunchTour({ newProject, completed }: OnboardingAutoLaunchInput): boolean {
  if (completed) return false;
  if (newProject) return false;
  return true;
}
