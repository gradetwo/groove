import { describe, it, expect, vi } from "vitest";
import React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

function createBoundaryInstance(props: any) {
  const boundary = new ErrorBoundary(props);
  // Attach updater so setState works synchronously in Node unit tests
  (boundary as any).updater = {
    enqueueSetState: (_inst: any, partial: any) => {
      const next = typeof partial === "function" ? partial(boundary.state) : partial;
      boundary.state = { ...boundary.state, ...next };
    },
  };
  return boundary;
}

describe("ErrorBoundary Component", () => {
  it("initializes with hasError = false", () => {
    const boundary = createBoundaryInstance({ children: "Normal content" });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(boundary.state.errorInfo).toBeNull();
  });

  it("getDerivedStateFromError captures error object and sets hasError to true", () => {
    const testError = new Error("WebGL context creation failure");
    const derived = ErrorBoundary.getDerivedStateFromError(testError);
    expect(derived.hasError).toBe(true);
    expect(derived.error).toBe(testError);
  });

  it("componentDidCatch logs error and updates errorInfo state", () => {
    const boundary = createBoundaryInstance({ children: "Normal content" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const testError = new Error("Audio buffer overflow");
    const testInfo = { componentStack: "\n    in FaultyComponent" };

    boundary.componentDidCatch(testError, testInfo as any);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ErrorBoundary caught unhandled exception]:",
      testError,
      testInfo
    );
    expect(boundary.state.errorInfo).toBe(testInfo);
    consoleSpy.mockRestore();
  });

  it("resets state and triggers onReset when handleReset is called", () => {
    const onReset = vi.fn();
    const boundary = createBoundaryInstance({ children: "Normal content", onReset });

    // Set error state
    boundary.state = {
      hasError: true,
      error: new Error("Crash"),
      errorInfo: null,
    };

    (boundary as any).handleReset();
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("executes onNavigateHome and resets state on home navigation", () => {
    const onNavigateHome = vi.fn();
    const boundary = createBoundaryInstance({ children: "Content", onNavigateHome });

    boundary.state = {
      hasError: true,
      error: new Error("Three.js crashed"),
      errorInfo: null,
    };

    (boundary as any).handleNavigateHome();
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("executes onNavigateAlternative and resets state on alternative view navigation", () => {
    const onNavigateAlternative = vi.fn();
    const boundary = createBoundaryInstance({ children: "Content", onNavigateAlternative });

    boundary.state = {
      hasError: true,
      error: new Error("Shader compile error"),
      errorInfo: null,
    };

    (boundary as any).handleNavigateAlternative();
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(onNavigateAlternative).toHaveBeenCalledTimes(1);
  });

  it("renders children when hasError is false", () => {
    const childNode = React.createElement("div", null, "Safe Groove View");
    const boundary = createBoundaryInstance({ children: childNode });
    const rendered = boundary.render();
    expect(rendered).toBe(childNode);
  });

  it("supports customFallback render function when hasError is true", () => {
    const customFallback = vi.fn((err: Error, reset: () => void) => {
      return React.createElement("div", null, `Custom: ${err.message}`);
    });

    const testError = new Error("Custom fatal issue");
    const boundary = createBoundaryInstance({
      children: "Normal content",
      customFallback,
    });
    boundary.state = {
      hasError: true,
      error: testError,
      errorInfo: null,
    };

    const rendered = boundary.render();
    expect(customFallback).toHaveBeenCalledWith(testError, expect.any(Function));
    expect(React.isValidElement(rendered)).toBe(true);
  });
});
