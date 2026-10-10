import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { NavTab } from "./navigation";

export interface RouteState {
  tab: NavTab;
  /**
   * ⭐ **The phone shell's own entry point** (owner's decision 2026-10-10: `/m`). The preserved shell used to mount on a
   * capability check plus a route flag; the owner chose an explicit path instead, which is why this is a route of its own —
   * the same precedent `/new` and `/console` already set.
   */
  mobile?: boolean;
  /**
   * ⭐ **A new project rather than a place to browse** — and this route is the one that must **not** get a genre.
   *
   * Every other route in this file may fall back to the studio's default genre, because a missing genre there means "the user did not say". Here it means "the user asked for a blank project", which is why the
   * owner could not reach the new arrangement at all: `App.tsx` resolves `route.genreId || "chicago-house"`, and a genre was therefore always present. Its own route rather than a fourteenth nav word follows the
   * precedent set for `/console`.
   */
  newProject?: boolean;
  /**
   * ⭐ **Which stored arrangement project the new-project route should open.**
   *
   * `newProject: true` says "the arrangement editor"; this says *which arrangement*. It exists because the project
   * list the Hub now shows had no way to act on a row: opening an arrangement is a route with a project in it, so the
   * project has to be sayable in a URL — otherwise the Hub could display a saved arrangement and do nothing with it,
   * which is the same defect one step further along. Absent means "reopen what I last had open".
   */
  arrangementId?: string;
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

  /**
   * ⭐ **`/m` is the phone shell** — the prefix is stripped and the rest parsed by the same code, the way the hash branch
   * above already recurses. Doing it here rather than in `App.tsx` means every consumer of a route sees the same answer.
   */
  if (pathname === "/m" || pathname === "/m/") {
    /**
     * ⚠️ **Only the bare `/m`.** A criterion in `router.test.ts` pins that the *retired* `/m/<module>` shape must **not**
     * parse into a route of its own — that rule was a deliberate removal, and reviving it by accepting a prefix would
     * break it. The phone shell switches modules in its own state (`mobileModules.ts`), not in the URL.
     */
    return { ...parseUrlToRoute("/", search, hash), mobile: true };
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

  // Check a new project: /new — ⭐ **before the studio fallback**, because that fallback is what always supplied a genre.
  if (cleanPath === "/new" || cleanPath.startsWith("/new/")) {
    // ⭐ Deliberately **no `genreId`**, not even `undefined` from a missing parameter: this route means "blank", and a genre here would be the default leaking back in.
    const project = params.get("project");
    return {
      tab: "studio",
      newProject: true,
      ...(project ? { arrangementId: decodeURIComponent(project) } : {}),
    };
  }

  // Check studio: /studio?genre=
  if (cleanPath === "/studio" || cleanPath.startsWith("/studio/")) {
    const gParam = params.get("genre");
    const project = params.get("project");
    return {
      tab: "studio",
      genreId: gParam || undefined,
      ...(project ? { arrangementId: decodeURIComponent(project) } : {}),
    };
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
  /**
   * ⭐ **`/m` round-trips** (owner's decision 2026-10-10). An early return rather than surgery on the body below: the phone
   * shell keeps its module in its own state (`mobileModules.ts`) and its genre in query params that `parseUrlToRoute` already
   * carried over, so "the phone shell, as it is" is exactly `/m`. Parsing and formatting stay a closed pair, which is how
   * `router.test.ts` uses them.
   */
  if (route.mobile) return "/m";
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
      /**
       * ⭐ The new-project route is a path of its own, and a named arrangement rides on it — **asked before the
       * genre fallback**, so a URL that names a project can never be answered with the studio's default genre.
       */
      if (route.newProject) {
        return route.arrangementId ? `/new?project=${encodeURIComponent(route.arrangementId)}` : "/new";
      }
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
