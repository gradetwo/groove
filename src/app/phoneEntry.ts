/**
 * ⭐ **Whether a phone should be handed to the phone shell — from *any* desktop address, not just the root.**
 *
 * The owner's rule (2026-10-11): a phone goes through `/m`, and coming back from anything else lands there too. So the
 * rule is a **whitelist of one**: `/m` is the destination, and every other path belongs to the phone shell as far as a
 * phone is concerned. The first version only fired on the root, which left a phone arriving from a share link, a
 * bookmark or the browser's own back button sitting in the desktop layout — precisely the case the owner named.
 *
 * Two things it still refuses to overrule, because an automatic redirect that guesses wrong is worse than none:
 *
 *   · `?desktop=1` / `?shell=desktop` — a deliberate "give me the desktop page", which the shell can offer as a link;
 *   · the stored preference (`DESKTOP_PREFERENCE_KEY`), so that choice survives the next navigation.
 */
export const DESKTOP_PREFERENCE_KEY = "groove:prefer-desktop-shell";

export function shouldEnterPhoneShell(input: {
  pathname: string;
  search?: string;
  isPhone: boolean;
  prefersDesktop?: boolean;
}): boolean {
  const { pathname, search = "", isPhone, prefersDesktop = false } = input;
  if (!isPhone || prefersDesktop) return false;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/m") return false; // already there — redirecting would loop
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("desktop") === "1" || params.get("shell") === "desktop") return false;
  return true;
}
