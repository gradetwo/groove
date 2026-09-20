import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { NavTab } from "./navigation";
import { normaliseMobileModule, type MobileModule } from "../mobile/mobileModules";

export interface RouteState {
  tab: NavTab;
  /**
   * Phone-shell module (`/m/<module>`), when the phone UI is what should render.
   *
   * The phone redesign is a separate surface during the rebuild (see `src/mobile/MobileApp.tsx`), so
   * it gets its own route rather than a new `NavTab`: the desktop vocabulary stays thirteen entries
   * and the phone's five modules stay out of it.
   */
  mobile?: MobileModule;
  /** Full-screen phone player (`/m/home?player=1&genre=`), versus the list or a detail page. */
  mobilePlayer?: boolean;
  genreId?: string;
  compareIds?: string[];
  difficulty?: "easy" | "medium" | "hard";
  timelineDecade?: number;
  timelineCategory?: string;
  chordProgression?: string;
  chordKey?: string;
  sequencerPayload?: string;
  masterclassId?: string;
  customGenreShare?: string;
  customGenreFork?: string;
}

export function parseUrlToRoute(pathname: string, search: string, hash: string = ""): RouteState {
  // Support hash routing (e.g. #/maker?share=... or #/studio?genre=...)
  if (hash && hash.startsWith("#/")) {
    const rawHash = hash.slice(1);
    const [hPath, hSearch] = rawHash.split("?");
    return parseUrlToRoute(hPath || "/", hSearch ? `?${hSearch}` : "", "");
  }

  const params = new URLSearchParams(search);
  const cleanPath = pathname.replace(/\/+$/, "") || "/";

  // Check shared sequencer payload: /s/:payload or ?groove=:payload
  const sMatch = cleanPath.match(/^\/s\/([^/]+)/);
  if (sMatch) {
    return { tab: "studio", sequencerPayload: decodeURIComponent(sMatch[1]) };
  }
  if (params.get("groove")) {
    return { tab: "studio", sequencerPayload: params.get("groove")! };
  }

  // Phone shell: /m/<module>, or ?m=<module>. Parsed first so `/m/home` cannot be mistaken for a
  // genre path, and so the shell is reachable by URL on any device (that is how it is tested).
  const mobileMatch = cleanPath.match(/^\/m(?:\/([a-z-]+))?$/);
  const mobileParam = mobileMatch ? mobileMatch[1] ?? "" : params.get("m");
  if (mobileMatch || params.has("m")) {
    return {
      tab: "studio",
      mobile: normaliseMobileModule(mobileParam),
      mobilePlayer: params.get("player") === "1",
      genreId: params.get("genre") || undefined,
    };
  }

  // Check genre detail: /genre/:id or ?tab=detail&genre=:id
  const genreMatch = cleanPath.match(/^\/genre\/([^/]+)/);
  if (genreMatch) {
    return { tab: "detail", genreId: decodeURIComponent(genreMatch[1]) };
  }

  // Check explore sub-routes
  if (cleanPath === "/explore/galaxy" || cleanPath.startsWith("/explore/galaxy/")) {
    const gParam = params.get("genre") || cleanPath.split("/")[3];
    return { tab: "galaxy", genreId: gParam ? decodeURIComponent(gParam) : undefined };
  }
  if (cleanPath === "/explore/timeline" || cleanPath.startsWith("/explore/timeline/")) {
    const decade = params.get("decade") ? parseInt(params.get("decade")!, 10) : undefined;
    const category = params.get("category") || undefined;
    return { tab: "horizontal-timeline", timelineDecade: decade, timelineCategory: category };
  }
  if (cleanPath === "/explore/stories" || cleanPath.startsWith("/explore/stories/")) {
    return { tab: "vertical-timeline" };
  }

  // Check compare: /compare?ids=
  if (cleanPath === "/compare" || cleanPath.startsWith("/compare/")) {
    const ids = params.get("ids") ? params.get("ids")!.split(",") : undefined;
    return { tab: "compare", compareIds: ids };
  }

  // Check challenge: /challenge?difficulty=
  if (cleanPath === "/challenge" || cleanPath.startsWith("/challenge/")) {
    const diff = params.get("difficulty") as "easy" | "medium" | "hard" | null;
    return { tab: "challenge", difficulty: diff || "medium" };
  }

  // Check chords: /chords?progression=&key=
  if (cleanPath === "/chords" || cleanPath.startsWith("/chords/")) {
    return {
      tab: "chords",
      chordProgression: params.get("progression") || undefined,
      chordKey: params.get("key") || undefined,
    };
  }

  // Check masterclass: /masterclass, /rhythm, /explore/masterclass
  if (
    cleanPath === "/masterclass" ||
    cleanPath.startsWith("/masterclass/") ||
    cleanPath === "/rhythm" ||
    cleanPath.startsWith("/rhythm/") ||
    cleanPath === "/explore/masterclass" ||
    cleanPath.startsWith("/explore/masterclass/")
  ) {
    const parts = cleanPath.split("/");
    const mId = params.get("lesson") || (parts.length > 2 ? parts[2] : undefined);
    return { tab: "masterclass", masterclassId: mId };
  }

  // Check kick anatomy: /kick or /anatomy
  if (cleanPath === "/kick" || cleanPath.startsWith("/kick/") || cleanPath === "/anatomy" || cleanPath.startsWith("/anatomy/")) {
    return { tab: "kick" };
  }

  // Check analyzer: /analyzer, /scope, /explore/analyzer
  if (
    cleanPath === "/analyzer" ||
    cleanPath.startsWith("/analyzer/") ||
    cleanPath === "/scope" ||
    cleanPath.startsWith("/scope/") ||
    cleanPath === "/explore/analyzer" ||
    cleanPath.startsWith("/explore/analyzer/")
  ) {
    return { tab: "analyzer" };
  }

  // Check custom genre maker (P7-03): /maker, /create, /explore/maker
  if (
    cleanPath === "/maker" ||
    cleanPath.startsWith("/maker/") ||
    cleanPath === "/create" ||
    cleanPath.startsWith("/create/") ||
    cleanPath === "/explore/maker" ||
    cleanPath.startsWith("/explore/maker/")
  ) {
    const parts = cleanPath.split("/");
    const forkId = params.get("fork") || (parts.length > 2 && parts[1] === "maker" ? parts[2] : undefined);
    return {
      tab: "maker",
      customGenreShare: params.get("share") || params.get("share_genre") || undefined,
      customGenreFork: forkId,
    };
  }

  // Check console (N-01 / P8-02): /console?genre=
  if (cleanPath === "/console" || cleanPath.startsWith("/console/")) {
    const gParam = params.get("genre");
    return { tab: "console", genreId: gParam || undefined };
  }

  // Check studio: /studio?genre=
  if (cleanPath === "/studio" || cleanPath.startsWith("/studio/")) {
    const gParam = params.get("genre");
    return { tab: "studio", genreId: gParam || undefined };
  }

  // Fallback to query-param tab matching (compatible with root /?tab=...)
  const tabParam = params.get("tab") as NavTab | null;
  const genreParam = params.get("genre") || undefined;

  if (tabParam) {
    if (tabParam === "maker") {
      return {
        tab: "maker",
        customGenreShare: params.get("share") || undefined,
        customGenreFork: params.get("fork") || undefined,
      };
    }
    if (tabParam === "detail") {
      return { tab: "detail", genreId: genreParam };
    }
    if (tabParam === "galaxy") {
      return { tab: "galaxy", genreId: genreParam };
    }
    if (tabParam === "horizontal-timeline") {
      const decade = params.get("decade") ? parseInt(params.get("decade")!, 10) : undefined;
      return { tab: "horizontal-timeline", timelineDecade: decade, timelineCategory: params.get("category") || undefined };
    }
    if (tabParam === "vertical-timeline") {
      return { tab: "vertical-timeline" };
    }
    if (tabParam === "compare") {
      const ids = params.get("ids") ? params.get("ids")!.split(",") : undefined;
      return { tab: "compare", compareIds: ids };
    }
    if (tabParam === "challenge") {
      const diff = params.get("difficulty") as "easy" | "medium" | "hard" | null;
      return { tab: "challenge", difficulty: diff || "medium" };
    }
    if (tabParam === "chords") {
      return {
        tab: "chords",
        chordProgression: params.get("progression") || undefined,
        chordKey: params.get("key") || undefined,
      };
    }
    if (tabParam === "masterclass") {
      return {
        tab: "masterclass",
        masterclassId: params.get("lesson") || undefined,
      };
    }
    return { tab: tabParam, genreId: genreParam };
  }

  // Default if genre is provided at root: go to detail or studio
  if (genreParam) {
    return { tab: "detail", genreId: genreParam };
  }

  return { tab: "studio" };
}

export function formatRouteToUrl(route: RouteState): string {
  // The phone shell owns its own path space; nothing else may render at `/m/...`.
  if (route.mobile) {
    const params = new URLSearchParams();
    if (route.genreId) params.set("genre", route.genreId);
    if (route.mobilePlayer) params.set("player", "1");
    const q = params.toString();
    return `/m/${route.mobile}${q ? `?${q}` : ""}`;
  }
  // Use clean paths where possible, with fallback query params
  switch (route.tab) {
    case "detail":
      return route.genreId ? `/genre/${encodeURIComponent(route.genreId)}` : `/?tab=detail`;
    case "galaxy":
      return route.genreId ? `/explore/galaxy?genre=${encodeURIComponent(route.genreId)}` : `/explore/galaxy`;
    case "horizontal-timeline": {
      const params = new URLSearchParams();
      if (route.timelineDecade) params.set("decade", String(route.timelineDecade));
      if (route.timelineCategory) params.set("category", route.timelineCategory);
      const q = params.toString();
      return `/explore/timeline${q ? `?${q}` : ""}`;
    }
    case "vertical-timeline":
      return `/explore/stories`;
    case "compare": {
      const q = route.compareIds?.length ? `?ids=${route.compareIds.join(",")}` : "";
      return `/compare${q}`;
    }
    case "challenge": {
      const q = route.difficulty ? `?difficulty=${route.difficulty}` : "";
      return `/challenge${q}`;
    }
    case "chords": {
      const params = new URLSearchParams();
      if (route.chordProgression) params.set("progression", route.chordProgression);
      if (route.chordKey) params.set("key", route.chordKey);
      const q = params.toString();
      return `/chords${q ? `?${q}` : ""}`;
    }
    case "kick":
      return `/kick`;
    case "analyzer":
      return `/analyzer`;
    case "console":
      return route.genreId ? `/console?genre=${encodeURIComponent(route.genreId)}` : `/console`;
    case "masterclass": {
      return route.masterclassId ? `/masterclass/${encodeURIComponent(route.masterclassId)}` : `/masterclass`;
    }
    case "maker": {
      const params = new URLSearchParams();
      if (route.customGenreShare) params.set("share", route.customGenreShare);
      if (route.customGenreFork) params.set("fork", route.customGenreFork);
      const q = params.toString();
      return `/maker${q ? `?${q}` : ""}`;
    }
    case "studio":
    default: {
      if (route.sequencerPayload) {
        return `/s/${encodeURIComponent(route.sequencerPayload)}`;
      }
      if (route.genreId) {
        return `/studio?genre=${encodeURIComponent(route.genreId)}`;
      }
      return "/";
    }
  }
}

interface RouterContextType {
  route: RouteState;
  navigate: (newRoute: Partial<RouteState>, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterContextType | null>(null);

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteState>(() => {
    if (typeof window !== "undefined") {
      return parseUrlToRoute(window.location.pathname, window.location.search, window.location.hash);
    }
    return { tab: "studio" };
  });

  // Listen to browser popstate (back/forward history) and hashchange
  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = parseUrlToRoute(window.location.pathname, window.location.search, window.location.hash);
      setRoute(nextRoute);
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  const navigate = useCallback(
    (newRoute: Partial<RouteState>, options?: { replace?: boolean }) => {
      setRoute((prev) => {
        const merged: RouteState = { ...prev, ...newRoute };
        const url = formatRouteToUrl(merged);

        try {
          if (options?.replace) {
            window.history.replaceState(merged, "", url);
          } else {
            window.history.pushState(merged, "", url);
          }
        } catch {
          // Ignore history state errors in restricted sandboxes
        }

        return merged;
      });
    },
    []
  );

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export function useRouter(): RouterContextType {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used within a RouterProvider");
  }
  return ctx;
}
