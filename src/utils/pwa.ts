/**
 * PWA Service Worker Registration & Lifecycle Manager (P4-07)
 * Handles:
 * - Versioned Service Worker registration
 * - App Shell caching & offline availability
 * - Update notification & skipWaiting execution
 * - Install prompt capture & trigger
 */

export interface PwaStatus {
  isInstalled: boolean;
  canInstall: boolean;
  isUpdateAvailable: boolean;
  offlineReady: boolean;
}

let deferredPrompt: any = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<(status: PwaStatus) => void>();

const currentStatus: PwaStatus = {
  isInstalled: typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  canInstall: false,
  isUpdateAvailable: false,
  offlineReady: false,
};

function notifyListeners(): void {
  listeners.forEach((fn) => fn({ ...currentStatus }));
}

export function subscribePwaStatus(fn: (status: PwaStatus) => void): () => void {
  listeners.add(fn);
  fn({ ...currentStatus });
  return () => listeners.delete(fn);
}

export async function promptInstallApp(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choiceResult = await deferredPrompt.userChoice;
  if (choiceResult.outcome === "accepted") {
    currentStatus.canInstall = false;
    currentStatus.isInstalled = true;
    deferredPrompt = null;
    notifyListeners();
    return true;
  }
  return false;
}

export function applyUpdate(): void {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }
  window.location.reload();
}

export function initPwa(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  // In automated test environments (Playwright/Puppeteer/WebDriver), skip SW to avoid navigation disruptions
  if (navigator.webdriver) {
    return;
  }

  // Check display-mode standalone
  window.matchMedia("(display-mode: standalone)").addEventListener("change", (e) => {
    currentStatus.isInstalled = e.matches;
    notifyListeners();
  });

  // Capture install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    currentStatus.canInstall = true;
    notifyListeners();
  });

  window.addEventListener("appinstalled", () => {
    currentStatus.canInstall = false;
    currentStatus.isInstalled = true;
    deferredPrompt = null;
    notifyListeners();
  });

  // Register versioned Service Worker
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // If there's an active worker and no waiting worker, offline is ready
        if (reg.active) {
          currentStatus.offlineReady = true;
          notifyListeners();
        }

        // If a worker is already waiting to activate
        if (reg.waiting) {
          waitingWorker = reg.waiting;
          currentStatus.isUpdateAvailable = true;
          notifyListeners();
        }

        // Listen for new updates discovered
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New content available
              waitingWorker = newWorker;
              currentStatus.isUpdateAvailable = true;
              notifyListeners();
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] ServiceWorker registration failed:", err);
      });

    // Guard against unwanted reload on initial SW install
    let hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // First installation should not trigger an unexpected page reload
      if (!hadController) {
        hadController = true;
        return;
      }
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
