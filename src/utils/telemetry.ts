/**
 * Privacy-First Telemetry & Error Reporting (P4-10)
 * Collects zero PII. Records only sanitized crash stack, app version, and OS platform.
 */

export const APP_VERSION = "1.13.0";

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

export interface TelemetryEvent {
  category: string;
  action: string;
  label?: string;
  timestamp: number;
}

const errorReports: DiagnosticReport[] = [];
const eventQueue: TelemetryEvent[] = [];

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

/**
 * Opt-in anonymous action tracking
 */
export function trackEvent(category: string, action: string, label?: string): void {
  eventQueue.push({
    category,
    action,
    label,
    timestamp: Date.now(),
  });
  if (eventQueue.length > 50) {
    eventQueue.shift();
  }
}

export function getRecentErrors(): DiagnosticReport[] {
  return [...errorReports];
}

export function getRecentEvents(): TelemetryEvent[] {
  return [...eventQueue];
}
