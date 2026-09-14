/**
 * Privacy-first crash diagnostics (P4-10 / E-08).
 *
 * Scope is deliberately narrow: this module only builds and retains sanitised
 * diagnostic reports for errors the app actually caught. There is no analytics
 * pipeline and no network transmission — the review removed a `trackEvent` API
 * that had zero production callers and no sink, because keeping it implied an
 * observability capability the app does not have.
 *
 * Collected data: sanitised stack, app version, platform string, viewport size.
 * Never collected: user content, projects, patterns or identifiers.
 */

import { APP_VERSION } from "../version";

export { APP_VERSION };

export interface DiagnosticReport {
  version: string;
  timestamp: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  componentStack?: string;
  platform: string;
  screenResolution: string;
}

const errorReports: DiagnosticReport[] = [];

/**
 * Strips personal paths (e.g. /home/username) from stack trace
 */
export function sanitizeStackTrace(stack?: string): string {
  if (!stack) return "";
  return stack.replace(/\/home\/[a-zA-Z0-9_-]+/g, "/home/***");
}

/**
 * Formats a clean diagnostic report from an error
 */
export function createDiagnosticReport(error: Error, componentStack?: string | null): DiagnosticReport {
  const report: DiagnosticReport = {
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    errorName: error.name || "Error",
    errorMessage: error.message || "Unknown error",
    stack: sanitizeStackTrace(error.stack),
    componentStack: sanitizeStackTrace(componentStack || undefined),
    platform: typeof navigator !== "undefined" ? navigator.platform || "Unknown" : "Node",
    screenResolution:
      typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "N/A",
  };
  return report;
}

/**
 * Records an unhandled exception
 */
export function reportException(error: Error, errorInfo?: { componentStack?: string | null }): DiagnosticReport {
  const report = createDiagnosticReport(error, errorInfo?.componentStack);
  errorReports.push(report);
  if (errorReports.length > 20) {
    errorReports.shift();
  }
  return report;
}

export function getRecentErrors(): DiagnosticReport[] {
  return [...errorReports];
}
