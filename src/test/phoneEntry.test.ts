import { describe, it, expect } from "vitest";
import { shouldEnterPhoneShell } from "../app/phoneEntry";

/**
 * ⭐ The rule is a whitelist of one: `/m` is where a phone belongs, and every other address is the desktop's — including
 * the ones a phone reaches without typing anything (a share link, a bookmark, the back button). The interesting cases are
 * still the refusals, because a redirect that guesses wrong is worse than none.
 */
describe("handing a phone to the phone shell", () => {
  it("⭐ sends a phone to /m from the root and from every other desktop address", () => {
    for (const pathname of ["/", "/new", "/arrangement/abc", "/maker", "/settings"]) {
      expect(shouldEnterPhoneShell({ pathname, isPhone: true }), pathname).toBe(true);
    }
  });
  it("⭐ does not redirect a phone that is already in the shell (that would loop)", () => {
    expect(shouldEnterPhoneShell({ pathname: "/m", isPhone: true })).toBe(false);
    expect(shouldEnterPhoneShell({ pathname: "/m/", isPhone: true }), "a trailing slash is still /m").toBe(false);
  });
  it("⭐ leaves a desktop alone, wherever it is", () => {
    for (const pathname of ["/", "/new", "/arrangement/abc"]) {
      expect(shouldEnterPhoneShell({ pathname, isPhone: false }), pathname).toBe(false);
    }
  });
  it("⭐ honours the opt-out link and the stored preference", () => {
    expect(shouldEnterPhoneShell({ pathname: "/new", search: "?desktop=1", isPhone: true })).toBe(false);
    expect(shouldEnterPhoneShell({ pathname: "/new", search: "?shell=desktop", isPhone: true })).toBe(false);
    expect(shouldEnterPhoneShell({ pathname: "/new", isPhone: true, prefersDesktop: true })).toBe(false);
  });
  it("⭐ still redirects when the query is about something else", () => {
    expect(shouldEnterPhoneShell({ pathname: "/", search: "?utm_source=x", isPhone: true })).toBe(true);
  });
});
