import { describe, it, expect, beforeEach } from "vitest";
import { toast } from "../ui/Toast";

describe("UI Component Library (P1-05)", () => {
  beforeEach(() => {
    toast.clearAll();
  });

  describe("Toast Singleton Manager", () => {
    it("should allow adding toasts and notifying subscribers", () => {
      let currentToasts: any[] = [];
      const unsubscribe = toast.subscribe((toasts) => {
        currentToasts = toasts;
      });

      expect(currentToasts.length).toBe(0);

      const id = toast.show("Project saved successfully", "success", 5000);
      expect(currentToasts.length).toBe(1);
      expect(currentToasts[0].id).toBe(id);
      expect(currentToasts[0].message).toBe("Project saved successfully");
      expect(currentToasts[0].type).toBe("success");

      toast.dismiss(id);
      expect(currentToasts.length).toBe(0);

      unsubscribe();
    });

    it("should cap active toasts to avoid visual clutter", () => {
      let currentToasts: any[] = [];
      toast.subscribe((toasts) => {
        currentToasts = toasts;
      });

      toast.show("Toast 1");
      toast.show("Toast 2");
      toast.show("Toast 3");
      toast.show("Toast 4");

      expect(currentToasts.length).toBe(3);
      expect(currentToasts.map((t) => t.message)).toEqual(["Toast 2", "Toast 3", "Toast 4"]);
    });

    it("should support clearing all toasts at once", () => {
      let currentToasts: any[] = [];
      toast.subscribe((toasts) => {
        currentToasts = toasts;
      });

      toast.show("A");
      toast.show("B");
      expect(currentToasts.length).toBe(2);

      toast.clearAll();
      expect(currentToasts.length).toBe(0);
    });
  });
});
