import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SampleLibrariesPanel } from "../components/settings/SampleLibrariesPanel";
import type { LibraryStorage } from "../data/userLibraryStore";

/**
 * ⭐ **The panel the owner asked for on the web side, and the four things it must not get wrong.**
 *
 * The MCP surface already registers libraries, and this panel shares the validation and the merge with it — so
 * what these criteria are for is the part only the UI has: whether a person can see what they registered,
 * whether the licence they stated is the one recorded, whether a refusal is shown rather than swallowed, and
 * whether a library that cannot be played says so instead of quietly missing from the instrument list.
 *
 * Storage is a stub in every case. The first live probe of the registration tool wrote a junk entry to the
 * real default path, which is exactly the kind of thing a test must never do.
 */
const stub = (): LibraryStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
};

let storage: ReturnType<typeof stub>;

beforeEach(() => {
  storage = stub();
});

/** Fill the form the way a person would, then press Register. */
const register = (fields: Record<string, string>) => {
  for (const [testId, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByTestId(`sample-library-${testId}`), { target: { value } });
  }
  fireEvent.click(screen.getByTestId("sample-library-add"));
};

const panel = (reservedIds: string[] = []) =>
  render(<SampleLibrariesPanel reservedIds={reservedIds} storage={storage} />);

describe("the sound-library panel", () => {
  it("starts empty, and says so rather than showing a blank space", () => {
    panel();
    expect(screen.getByTestId("sample-libraries-empty")).toBeDefined();
    expect(screen.queryByTestId("sample-libraries-list")).toBeNull();
  });

  it("⭐ registers one and shows it with the licence that was stated", () => {
    panel();
    register({ id: "my-strings", name: "My Strings", sfz: "Strings/My.sfz", repo: "me/strings", pin: "abc", duration: "12" });

    const row = screen.getByTestId("sample-library-my-strings");
    // The licence defaults to `unknown` and stays `unknown`: it is an answer, not a gap to be filled.
    expect(within(row).getByText(/licence unknown/)).toBeDefined();
    expect(within(row).getByText(/12s/)).toBeDefined();
    // And it really reached storage, so a reload would find it.
    expect(storage.map.size).toBe(1);
  });

  it("⭐ refuses an id the project already ships, shows why, and stores nothing", () => {
    panel(["vsco2ce"]);
    register({ id: "vsco2ce", name: "Fake strings", sfz: "x.sfz", duration: "3" });

    const problems = screen.getByTestId("sample-library-problems");
    expect(problems.textContent).toContain("vsco2ce");
    expect(problems.textContent).toContain("existing projects");
    expect(screen.queryByTestId("sample-library-vsco2ce")).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("says a library with no measured duration is registered but not yet playable", () => {
    panel();
    register({ id: "no-dur", name: "No Duration", sfz: "a.sfz" });

    const row = screen.getByTestId("sample-library-no-dur");
    // The catalogue refuses an entry with no duration, so the panel says that here rather than leaving the
    // person to find their library missing from the instruments.
    expect(within(row).getByText(/not yet in the catalogue/)).toBeDefined();
  });

  it("removes one, so registering is not a one-way door", () => {
    panel();
    register({ id: "my-strings", name: "My Strings", sfz: "Strings/My.sfz", duration: "12" });
    expect(screen.getByTestId("sample-library-my-strings")).toBeDefined();

    fireEvent.click(screen.getByTestId("sample-library-remove-my-strings"));
    expect(screen.queryByTestId("sample-library-my-strings")).toBeNull();
    expect(screen.getByTestId("sample-libraries-empty")).toBeDefined();
  });

  it("shows a problem when the browser cannot store anything, rather than looking like it worked", () => {
    render(<SampleLibrariesPanel storage={null} />);
    expect(screen.getByTestId("sample-library-problems").textContent).toContain("cannot store");
  });
});
