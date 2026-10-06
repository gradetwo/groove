import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DebugBundleRow } from "../components/settings/DebugBundleRow";

/**
 * ⭐ **The press downloads one file, and the file is named by the rule.**
 *
 * The collector and the name are each measured on their own; what this covers is the join between them — that pressing the button
 * builds a blob, hands it a URL and clicks an anchor whose `download` is the name. A criterion that only checked the collector had
 * been called would stay green if the button stopped downloading anything at all.
 *
 * `settingsModal.test.tsx` records why no provider is needed here: `useLanguage` falls back to Chinese when none is present, so
 * the wording of the label is not what this case is about.
 */
describe("the debug entry in the settings panel", () => {
  it("⭐ hands one blob to a URL and clicks an anchor named by the rule", () => {
    const blobs: Blob[] = [];
    const names: string[] = [];
    // ⚠️ jsdom does not implement either method, so they are assigned rather than spied: a browser has both, and the test
    // environment is what is missing them.
    const created = vi.fn((value: Blob) => {
      blobs.push(value);
      return "blob:debug";
    });
    const revoked = vi.fn(() => undefined);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = created;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoked;
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    render(<DebugBundleRow />);
    fireEvent.click(screen.getByTestId("settings-download-debug"));

    expect(blobs.length, "no blob was handed to a URL").toBe(1);
    expect(names.length, "no anchor was clicked").toBe(1);
    expect(names[0]).toMatch(/^groove-debug-.*\.json$/);
    // ⭐ And the URL is released, so a second press cannot leak the first.
    expect(revoked).toHaveBeenCalledWith("blob:debug");

    clicked.mockRestore();
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  });
});
