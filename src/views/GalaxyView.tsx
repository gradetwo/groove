import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Filter, 
  Search, 
  Sliders, 
  ExternalLink, 
  Info,
  X,
  Sparkles
} from "lucide-react";
import { Genre } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { GENRE_RELATIONS } from "../data/relations";
import { useLanguage } from "../i18n/LanguageContext";

interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  genre: Genre;
}

const CATEGORY_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  "House": { fill: "#f43f5e", stroke: "#fb7185", glow: "rgba(244, 63, 94, 0.4)" },
  "Techno": { fill: "#06b6d4", stroke: "#22d3ee", glow: "rgba(6, 182, 212, 0.4)" },
  "Trance": { fill: "#3b82f6", stroke: "#60a5fa", glow: "rgba(59, 130, 246, 0.4)" },
  "Dubstep": { fill: "#a855f7", stroke: "#c084fc", glow: "rgba(168, 85, 247, 0.4)" },
  "Drum & Bass": { fill: "#f97316", stroke: "#fb923c", glow: "rgba(249, 115, 22, 0.4)" },
  "UK Bass": { fill: "#10b981", stroke: "#34d399", glow: "rgba(16, 185, 129, 0.4)" },
  "Trap / Drill": { fill: "#eab308", stroke: "#facc15", glow: "rgba(234, 179, 8, 0.4)" },
  "Future & Downtempo": { fill: "#ec4899", stroke: "#f472b6", glow: "rgba(236, 72, 153, 0.4)" },
  "Hard & Electro": { fill: "#ef4444", stroke: "#f87171", glow: "rgba(239, 68, 68, 0.4)" },
  "Rock/Metal": { fill: "#b91c1c", stroke: "#dc2626", glow: "rgba(185, 28, 28, 0.4)" },
  "Hip Hop": { fill: "#d97706", stroke: "#f59e0b", glow: "rgba(217, 119, 6, 0.4)" },
  "Jazz/Blues": { fill: "#1d4ed8", stroke: "#3b82f6", glow: "rgba(29, 78, 216, 0.4)" },
  "Pop/R&B": { fill: "#db2777", stroke: "#f472b6", glow: "rgba(219, 39, 119, 0.4)" },
  "Latin/World": { fill: "#059669", stroke: "#10b981", glow: "rgba(5, 150, 105, 0.4)" },
  "Electronic": { fill: "#8b5cf6", stroke: "#a78bfa", glow: "rgba(139, 92, 246, 0.4)" },
};

function getCategoryTheme(category: string, genreId: string) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  // Check prefix or sub-category matches
  if (genreId.includes("house")) return CATEGORY_COLORS["House"];
  if (genreId.includes("techno")) return CATEGORY_COLORS["Techno"];
  if (genreId.includes("trance")) return CATEGORY_COLORS["Trance"];
  if (genreId.includes("dubstep")) return CATEGORY_COLORS["Dubstep"];
  if (genreId.includes("dnb") || genreId.includes("drum-and-bass") || genreId.includes("jungle")) return CATEGORY_COLORS["Drum & Bass"];
  return CATEGORY_COLORS["Electronic"];
}

interface GalaxyViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

export const GalaxyView: React.FC<GalaxyViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transforms: pan and zoom
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.85 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Selected & Hovered nodes
  const [selectedNode, setSelectedNode] = useState<Genre | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Genre | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedDecade, setSelectedDecade] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    ALL_GENRES.forEach((g) => set.add(g.category));
    return ["ALL", ...Array.from(set)];
  }, []);

  // Decades list
  const decades = ["ALL", "1900-1960", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

  // Filtered nodes
  const activeGenreIds = useMemo(() => {
    const ids = new Set<string>();
    ALL_GENRES.forEach((g) => {
      // Category filter
      if (selectedCategory !== "ALL" && g.category !== selectedCategory) return;

      // Decade filter
      if (selectedDecade !== "ALL") {
        if (selectedDecade === "1900-1960" && g.origin_decade > 1960) return;
        if (selectedDecade === "1970s" && g.origin_decade !== 1970) return;
        if (selectedDecade === "1980s" && g.origin_decade !== 1980) return;
        if (selectedDecade === "1990s" && g.origin_decade !== 1990) return;
        if (selectedDecade === "2000s" && g.origin_decade !== 2000) return;
        if (selectedDecade === "2010s" && g.origin_decade !== 2010) return;
        if (selectedDecade === "2020s" && g.origin_decade !== 2020) return;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !g.name.toLowerCase().includes(q) &&
          !g.aliases.some((a) => a.toLowerCase().includes(q))
        ) {
          return;
        }
      }

      ids.add(g.id);
    });
    return ids;
  }, [selectedCategory, selectedDecade, searchQuery]);

  // Node position simulation state
  const nodesRef = useRef<NodePosition[]>([]);
  const relationsRef = useRef(GENRE_RELATIONS);

  // Initialize node positions clustered by decade and category
  useEffect(() => {
    const initialNodes: NodePosition[] = ALL_GENRES.map((genre, idx) => {
      // Cluster angle by category, distance by decade
      const catIdx = Math.abs(genre.category.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 14;
      const angle = (catIdx / 14) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const decadeOffset = Math.max(0, (genre.origin_decade - 1920) / 100);
      const distance = 250 + decadeOffset * 650 + (Math.random() * 100 - 50);

      const importance = (genre.subgenres.length * 1.5) + (genre.related_genres.length) + (genre.parent_genres.length);
      const radius = Math.max(7, Math.min(22, 9 + importance * 1.3));

      return {
        id: genre.id,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
        radius,
        genre,
      };
    });

    // Run simple force relaxation for 80 iterations
    for (let iter = 0; iter < 80; iter++) {
      for (let i = 0; i < initialNodes.length; i++) {
        for (let j = i + 1; j < initialNodes.length; j++) {
          const n1 = initialNodes[i];
          const n2 = initialNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = n1.radius + n2.radius + 35;

          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.2;
            n1.x -= dx * force;
            n1.y -= dy * force;
            n2.x += dx * force;
            n2.y += dy * force;
          }
        }
      }
    }

    nodesRef.current = initialNodes;
  }, []);

  // Center view on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setTransform({
        x: canvas.width / 2,
        y: canvas.height / 2,
        scale: 0.65,
      });
    }
  }, []);

  // Canvas drawing loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Deep Space Background
      ctx.fillStyle = "#090a0f";
      ctx.fillRect(0, 0, width, height);

      // Draw subtle space grid
      const t = transformRef.current;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      // Connected nodes set for hover / selection
      const activeHighlightId = (hoveredNode || selectedNode)?.id;
      const connectedIds = new Set<string>();
      if (activeHighlightId) {
        connectedIds.add(activeHighlightId);
        relationsRef.current.forEach((rel) => {
          if (rel.source === activeHighlightId) connectedIds.add(rel.target);
          if (rel.target === activeHighlightId) connectedIds.add(rel.source);
        });
      }

      const nodeMap = new Map<string, NodePosition>();
      nodesRef.current.forEach((n) => nodeMap.set(n.id, n));

      // 2. Draw Relations (Edges)
      relationsRef.current.forEach((rel) => {
        const src = nodeMap.get(rel.source);
        const tgt = nodeMap.get(rel.target);
        if (!src || !tgt) return;

        const isSrcActive = activeGenreIds.has(src.id);
        const isTgtActive = activeGenreIds.has(tgt.id);
        if (!isSrcActive && !isTgtActive) return;

        const isHighlighted = activeHighlightId && (connectedIds.has(src.id) && connectedIds.has(tgt.id));
        const isDimmed = activeHighlightId && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isHighlighted) {
          ctx.strokeStyle = rel.type === "origin_from" ? "#38bdf8" : "#a855f7";
          ctx.lineWidth = 2.5 / t.scale;
          ctx.globalAlpha = 0.9;
        } else if (isDimmed) {
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 0.8 / t.scale;
          ctx.globalAlpha = 0.08;
        } else {
          ctx.strokeStyle = rel.type === "origin_from" ? "rgba(99, 102, 241, 0.35)" : "rgba(168, 85, 247, 0.2)";
          ctx.lineWidth = (rel.type === "origin_from" ? 1.4 : 0.9) / t.scale;
          ctx.globalAlpha = 0.4;
        }

        if (rel.type === "influenced_by" || rel.type === "fusion_with") {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.stroke();
      });

      ctx.setLineDash([]);

      // 3. Draw Nodes
      nodesRef.current.forEach((node) => {
        const isVisible = activeGenreIds.has(node.id);
        const isHighlighted = activeHighlightId ? connectedIds.has(node.id) : true;
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;

        const theme = getCategoryTheme(node.genre.category, node.id);

        ctx.save();
        ctx.globalAlpha = isVisible ? (isHighlighted ? 1.0 : 0.15) : 0.05;

        // Glow ring for hovered or selected
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = theme.glow;
          ctx.fill();
        }

        // Main circle node
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = theme.fill;
        ctx.fill();

        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.strokeStyle = isSelected ? "#ffffff" : theme.stroke;
        ctx.stroke();

        // Node Label
        const showLabel = t.scale > 0.5 || node.radius > 12 || isHighlighted || isSelected;
        if (showLabel && isVisible) {
          ctx.font = `${Math.max(9, Math.round(11 / Math.max(0.6, t.scale)))}px Inter, sans-serif`;
          ctx.fillStyle = isSelected ? "#ffffff" : isHighlighted ? "#f1f5f9" : "#94a3b8";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          // English name
          ctx.fillText(node.genre.name, node.x, node.y + node.radius + 4);
        }

        ctx.restore();
      });

      ctx.restore();
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeGenreIds, hoveredNode, selectedNode]);

  // Pointer drag & zoom logic
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
      return;
    }

    // Check hit test for hover
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    const t = transformRef.current;
    const worldX = (mouseX - t.x) / t.scale;
    const worldY = (mouseY - t.y) / t.scale;

    let found: Genre | null = null;
    for (const node of nodesRef.current) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      if (dx * dx + dy * dy <= (node.radius + 6) * (node.radius + 6)) {
        found = node.genre;
        break;
      }
    }

    setHoveredNode(found);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }

    // If it was a clean click without drag, select node
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const t = transformRef.current;
    const worldX = (mouseX - t.x) / t.scale;
    const worldY = (mouseY - t.y) / t.scale;

    for (const node of nodesRef.current) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      if (dx * dx + dy * dy <= (node.radius + 8) * (node.radius + 8)) {
        setSelectedNode(node.genre);
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newScale = Math.max(0.2, Math.min(3.0, transform.scale * zoomFactor));

    setTransform((prev) => ({
      scale: newScale,
      x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
      y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
    }));
  };

  const handleZoom = (delta: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;
    const newScale = Math.max(0.2, Math.min(3.0, transform.scale * (delta > 0 ? 1.25 : 0.8)));

    setTransform((prev) => ({
      scale: newScale,
      x: centerX - (centerX - prev.x) * (newScale / prev.scale),
      y: centerY - (centerY - prev.y) * (newScale / prev.scale),
    }));
  };

  const handleResetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTransform({
      x: canvas.clientWidth / 2,
      y: canvas.clientHeight / 2,
      scale: 0.7,
    });
  };

  return (
    <div className="relative w-full h-[calc(100vh-4.5rem)] bg-neutral-950 overflow-hidden select-none">
      {/* Canvas Viewport */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Floating Header Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Filter Controls (Category & Decade) */}
        <div className="pointer-events-auto flex items-center space-x-2 bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 shadow-xl overflow-x-auto max-w-full">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-neutral-950 text-neutral-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-neutral-700/80 focus:outline-none"
          >
            <option value="ALL">{t("all_categories")}</option>
            {categories.filter((c) => c !== "ALL").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Decade Dropdown */}
          <select
            value={selectedDecade}
            onChange={(e) => setSelectedDecade(e.target.value)}
            className="bg-neutral-950 text-neutral-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-neutral-700/80 focus:outline-none"
          >
            <option value="ALL">{t("all_decades")}</option>
            {decades.filter((d) => d !== "ALL").map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Quick Search */}
          <div className="relative hidden sm:block">
            <input
              type="text"
              placeholder="Find in Galaxy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 bg-neutral-950 text-xs text-white placeholder-neutral-500 px-2.5 py-1.5 rounded-xl border border-neutral-700/80 focus:outline-none focus:w-48 transition-all"
            />
          </div>
        </div>

        {/* Zoom & View Controls */}
        <div className="pointer-events-auto flex items-center space-x-1.5 bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 shadow-xl">
          <button
            onClick={() => handleZoom(1)}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title={t("zoom_in")}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom(-1)}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title={t("zoom_out")}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
            title={t("reset_view")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend Card */}
      <div className="absolute bottom-4 left-4 z-20 hidden md:block bg-neutral-900/85 backdrop-blur-md border border-neutral-800 p-3 rounded-2xl shadow-xl text-xs space-y-2 pointer-events-none">
        <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
          {t("galaxy_title")}
        </div>
        <div className="space-y-1.5 text-neutral-300">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-0.5 bg-sky-400" />
            <span>{t("legend_direct_origin")}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-5 h-0.5 border-t border-dashed border-purple-400" />
            <span>{t("legend_influence")}</span>
          </div>
        </div>
      </div>

      {/* Selected Genre Floating Info Card */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 z-30 w-full max-w-sm bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl shadow-2xl p-4 animate-slide-up">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
                {selectedNode.category}
              </span>
              <h3 className="font-extrabold text-white text-lg mt-1 tracking-wide">
                {selectedNode.name}
              </h3>
              {selectedNode.aliases.length > 0 && (
                <p className="text-xs text-neutral-400">
                  {selectedNode.aliases[0]}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="my-3 py-2 border-y border-neutral-800 text-xs text-neutral-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("origin_year")}:</span>
              <span className="font-semibold text-neutral-200">{selectedNode.origin_year}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("origin_place")}:</span>
              <span className="font-semibold text-neutral-200">{selectedNode.origin_place[language]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("bpm")}:</span>
              <span className="font-semibold text-neutral-200">{selectedNode.bpm_range} BPM</span>
            </div>
          </div>

          <p className="text-xs text-neutral-400 line-clamp-3 mb-4 leading-relaxed">
            {selectedNode.cultural_context[language]}
          </p>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenStudio(selectedNode)}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-indigo-600/30"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{t("open_in_studio")}</span>
            </button>
            <button
              onClick={() => onSelectGenre(selectedNode)}
              className="flex items-center justify-center space-x-1 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-xs border border-neutral-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t("view_detail")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
