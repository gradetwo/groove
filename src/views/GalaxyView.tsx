import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  X, 
  Music, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  Layers,
  List,
  Sparkles, 
  Compass, 
  Search, 
  Grid, 
  SlidersHorizontal,
  RefreshCw,
  BookOpen
} from "lucide-react";
import { Genre } from "../types/genre";
import { 
  MAJOR_CLUSTERS, 
  buildNebulaGraph, 
  samplePt, 
  MajorCluster, 
  NebulaNode 
} from "../data/nebulaClusters";
import { useLanguage } from "../i18n/LanguageContext";
import { ExploreListView } from "./ExploreListView";

interface GalaxyViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onOpenHelp?: () => void;
}

// Mathematical and curve helpers
function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Shader definitions
const VSH = `
attribute vec3 aColor;
attribute float aSize, aSeed, aYear, aGrow, aNode, aCluster, aMode, aStar;
uniform float uTime, uYear, uScale, uHoverNode, uHoverCluster, uSelectedCluster, uSelectedNode;
varying vec3 vColor;
varying float vAlpha;
varying float vStar;

void main(){
  vec3 p = position;
  float t = uTime * 0.30;
  
  // Harmonic multi-octave cosmic breathing undulation
  float wave1 = sin(t * 0.60 + aSeed) * 1.6;
  float wave2 = sin(t * 0.42 + aSeed * 1.7) * 1.2;
  float wave3 = cos(t * 0.52 + aSeed * 2.3) * 1.6;
  float field = sin(dot(position, vec3(0.0025, 0.002, 0.003)) + t * 0.32) * 1.1;
  p.x += wave1 + field * 0.45;
  p.y += wave2 + field * 0.3;
  p.z += wave3 + field * 0.45;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dz = -mv.z;
  float born = aYear + aGrow * 8.0;
  float yr = smoothstep(born, born + 6.0, uYear);
  float pulse = yr * (1.0 - yr) * 4.0;
  float alpha = yr;
  float sz = aSize;
  vec3 col = aColor;

  float bg = (aNode < -0.5) ? 1.0 : 0.0;
  float isSm = (aSize <= 6.0) ? 1.0 : 0.0;
  float twA = 0.16 + 0.30 * bg * isSm;
  alpha *= (1.0 - twA) + twA * (0.5 + 0.5 * sin(uTime * (0.65 + fract(aSeed * 0.31) * 2.2) + aSeed * 9.0));

  // Chiaroscuro interstellar lighting gradient (宇宙明暗光影对比)
  vec3 lightDir = normalize(vec3(0.42, 0.72, 0.50));
  vec3 normP = normalize(p + vec3(15.0, 10.0, 20.0));
  float chiaroscuro = dot(normP, lightDir) * 0.22 + 0.88;

  // Cosmic breathing: slow multi-octave harmonic pulsation across galaxies
  float breathPhase = uTime * 0.48 + aSeed * 2.4 + (aCluster >= 0.0 ? aCluster * 0.85 : 0.0);
  float breathSize = 1.0 + 0.065 * sin(breathPhase * 0.65) + 0.035 * sin(uTime * 0.22);
  float breathAlpha = 1.0 + 0.12 * sin(breathPhase) + 0.06 * sin(uTime * 0.28 + aSeed * 1.3);

  // Traveling cosmic light wave sweeping through deep space (星际光潮与以太流风)
  float lightSweep = sin(dot(p, vec3(0.0025, 0.0018, 0.0028)) - uTime * 0.30) * 0.14 + 0.90;

  // Macro Cosmic Density Web: high contrast between dense filamental streams and transparent void pockets (疏密大开大合)
  vec3 pF = p * 0.0022;
  float macroWave1 = sin(pF.x * 2.2 + pF.z * 1.6 + uTime * 0.06);
  float macroWave2 = cos(pF.y * 2.4 - pF.x * 1.4 - uTime * 0.05);
  float macroWave3 = sin(dot(pF, vec3(1.4, 1.1, 1.6)));
  float macroField = macroWave1 * macroWave2 + macroWave3 * 0.42;
  float spatialDensity = smoothstep(-0.65, 0.65, macroField) * 0.35 + 0.75;

  alpha *= breathAlpha * chiaroscuro * lightSweep * spatialDensity;
  sz *= breathSize;

  // Selected cluster highlighting: focused cluster remains crisp, rich in color and legible;
  // background clusters and ambient deep space are gently dimmed
  // Selected cluster highlighting: focused cluster remains luminous, rich in color and legible;
  // background clusters and ambient deep space are gently dimmed
  if (uSelectedCluster >= -0.5) {
    if (abs(aCluster - uSelectedCluster) < 0.5) {
      if (aNode < 14.5 && aStar > 0.5) {
        // Parent cluster core star: soften just enough so it does not wash out into an opaque white flare
        alpha *= 0.40;
        sz *= 0.65;
      } else if (aStar < 0.5) {
        // Ambient nebular dust & connecting filaments within cluster: luminous, colorful, rich gas veil
        alpha *= 0.88;
        sz *= 1.05;
      } else {
        // Subgenre stars: crisp, bright, colorful gems
        alpha *= 1.25;
        sz *= 1.20;
      }
    } else if (aCluster >= -0.5) {
      // Outside clusters in the background: dim down to quiet cosmic dark
      alpha *= 0.08;
      sz *= 0.55;
    } else {
      // Deep space ambient particles: gently dimmed
      alpha *= 0.25;
      sz *= 0.70;
    }
  }

  // Node selection highlighting modes (lineage chain)
  if (aMode > 2.5) {
    col = mix(col, vec3(1.0, 0.92, 0.78), 0.20);
    alpha = min(1.0, alpha * 1.3);
    sz *= 1.20;
  } else if (aMode > 1.5) {
    col = mix(col, vec3(1.0, 0.95, 0.85), 0.25);
    alpha = min(1.0, alpha * 1.5);
    sz *= 1.35;
  }

  // Node hover / selection focus:
  // "只要当前选中或者hover的比其它的亮一些就好"
  float activeFocusNode = (uHoverNode >= -0.5) ? uHoverNode : uSelectedNode;
  if (activeFocusNode >= -0.5) {
    if (abs(aNode - activeFocusNode) < 0.5) {
      if (aStar > 0.5) {
        // Currently hovered or selected subgenre star: brilliant golden core and radiant aura
        alpha = min(1.0, alpha * 2.0 + 0.30);
        sz *= 1.50;
        col = mix(col, vec3(1.0, 0.96, 0.88), 0.35);
      } else {
        // Connected incoming branch/filament: clear and luminous
        alpha = min(1.0, alpha * 1.6 + 0.20);
        sz *= 1.35;
      }
    } else if (aStar > 0.5 && aNode >= 14.5) {
      // Other subgenre stars: comfortably luminous so they remain clear and colorful
      alpha *= 0.75;
      sz *= 0.95;
    } else {
      // Ambient nebular background dust
      alpha *= 0.80;
      sz *= 0.95;
    }
  }

  if (uHoverCluster > -0.5 && abs(aCluster - uHoverCluster) < 0.5) {
    alpha *= 1.20;
    sz *= 1.12;
  }

  alpha *= (1.0 + pulse * 1.4);
  sz *= (1.0 + pulse * 1.1);
  alpha *= clamp(1.65 - dz / 2600.0, 0.40, 1.0);

  gl_PointSize = clamp(sz * uScale / dz, 0.0, 240.0);
  gl_Position = projectionMatrix * mv;
  vColor = col;
  vAlpha = alpha;
  vStar = aStar;
}
`;

const FSH = `
varying vec3 vColor;
varying float vAlpha;
varying float vStar;

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float a;
  
  if (vStar > 0.5) {
    // Star nodes: crystalline diamond core + soft chromatic corona + delicate cross diffraction
    float starCore = exp(-d * d * 28.0) * 1.45;
    float starHalo = exp(-d * 2.8) * 0.65;
    float rx = max(0.0, 1.0 - abs(uv.y) * 9.0) * max(0.0, 1.0 - abs(uv.x) * 2.0);
    float ry = max(0.0, 1.0 - abs(uv.x) * 9.0) * max(0.0, 1.0 - abs(uv.y) * 2.0);
    float flare = (rx + ry) * 0.35 * exp(-d * 2.4);
    a = (starCore + starHalo + flare) * vAlpha;
  } else {
    // Nebular dust & planetary halos: velvet-smooth continuous halo gradient (光晕渐变，避免生硬色块与大团过曝)
    // Multi-tier exponential decay: luminous core, velvety gradient, ethereal feather edge
    float innerGlow = exp(-d * d * 4.2) * 0.95;
    float smoothHalo = exp(-d * 2.2) * 0.70;
    float outerVeil = exp(-d * 1.0) * 0.32;
    a = (innerGlow + smoothHalo + outerVeil) * vAlpha;
  }
  
  if (a < 0.002) discard;

  vec3 col = vColor;
  if (vStar > 0.5) {
    // Specular warm highlight only at the absolute pinpoint center
    col = mix(col, vec3(1.0, 0.98, 0.95), clamp(exp(-d * d * 24.0) * 0.75, 0.0, 0.80));
  } else {
    // Ethereal chromatic preservation: keep rich vibrant hue without white wash
    col = mix(col, vec3(1.0, 0.98, 0.94), clamp(exp(-d * d * 16.0) * 0.20, 0.0, 0.25));
  }
  
  gl_FragColor = vec4(col * a, a);
}
`;

const RET_V = `
attribute float aSize;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 1.0), 0.0, 90.0);
  gl_Position = projectionMatrix * mv;
}
`;

const RET_F = `
uniform vec3 uColor;
uniform float uOpacity;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float a = exp(-d * d * 9.0) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

// Pre-allocated scratch vectors and objects to eliminate per-frame allocations (P2-07)
const _scratchPv = new THREE.Vector3();
const _scratchProj = new THREE.Vector3();
const _scratchScreenPt = { x: 0, y: 0 };

export const GalaxyView: React.FC<GalaxyViewProps> = ({
  onSelectGenre,
  onOpenStudio,
  onOpenHelp,
}) => {
  const { language, isZh, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsContainerRef = useRef<HTMLDivElement | null>(null);
  const tagRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);

  // Graph data initialized once
  const graphData = useMemo(() => buildNebulaGraph(), []);

  // UI state
  const [selectedCluster, setSelectedCluster] = useState<MajorCluster | null>(null);
  const [selectedNode, setSelectedNode] = useState<NebulaNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NebulaNode | null>(null);
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [subgenreFilter, setSubgenreFilter] = useState("");
  const [viewMode, setViewMode] = useState<"rail" | "grid">("rail");
  const [isSubgenresPanelOpen, setIsSubgenresPanelOpen] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"3d" | "list">("3d");

  // Timeline state (P2-07: currentYear removed from React state to eliminate 60fps re-renders)
  const Y_MIN = 1850;
  const Y_MAX = 2025;
  const currentYearRef = useRef<number>(Y_MAX);
  const yearBadgeRef = useRef<HTMLDivElement | null>(null);
  const yearSliderRef = useRef<HTMLInputElement | null>(null);
  const lastHoveredIdRef = useRef<string | null>(null);
  const coreElementsMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const subElementsMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const slowFrameCountRef = useRef<number>(0);
  const hasDowngradedRef = useRef<boolean>(false);

  const [isPlayingYear, setIsPlayingYear] = useState<boolean>(false);
  const yearPlayRef = useRef<{ from: number; to: number; t: number; dur: number } | null>(null);

  // References for render loop to access without recreating WebGL context
  const selectedClusterRef = useRef<MajorCluster | null>(null);
  selectedClusterRef.current = selectedCluster;
  const selectedNodeRef = useRef<NebulaNode | null>(null);
  selectedNodeRef.current = selectedNode;
  const hoveredNodeRef = useRef<NebulaNode | null>(null);
  hoveredNodeRef.current = hoveredNode;

  // Subgenres of currently selected cluster
  const clusterSubgenres = useMemo(() => {
    if (!selectedCluster) return [];
    return graphData.nodes.filter(
      (n) => n.type === "sub" && n.cluster === selectedCluster.id
    );
  }, [selectedCluster, graphData]);

  // Filtered subgenres for bottom showcase panel
  const filteredSubgenres = useMemo(() => {
    if (!subgenreFilter.trim()) return clusterSubgenres;
    const q = subgenreFilter.toLowerCase();
    return clusterSubgenres.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.zhName.toLowerCase().includes(q) ||
        (s.genre?.origin_year && s.genre.origin_year.includes(q))
    );
  }, [clusterSubgenres, subgenreFilter]);

  // Three.js internal references
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    uniforms: Record<string, { value: any }>;
    modeAttr: THREE.BufferAttribute;
    points: THREE.Points;
    geo: THREE.BufferGeometry;
    ringPts: THREE.Points;
    ringPos: Float32Array;
    ringAng: Float32Array;
    ringGeo: THREE.BufferGeometry;
    ringMat: THREE.ShaderMaterial;
    shockPts: THREE.Points;
    shockPos: Float32Array;
    shockAng: Float32Array;
    shockGeo: THREE.BufferGeometry;
    shockMat: THREE.ShaderMaterial;
    orbit: { theta: number; phi: number; radius: number; target: THREE.Vector3 };
    vel: { t: number; p: number };
    fly: {
      t: number;
      dur: number;
      ease: (t: number) => number;
      fr: number;
      ft: number;
      ff: number;
      toR: number;
      toT: number | null;
      fromTg: THREE.Vector3;
      toTg: THREE.Vector3;
    } | null;
    selectTime: number;
    lastInteract: number;
    idleRamp: number;
    ranges: Array<{ node: number; s: number; e: number }>;
    pointers: Map<number, { x: number; y: number }>;
    down: { x: number; y: number; moved: boolean } | null;
    pinch: { d: number; r: number } | null;
    mx: number;
    my: number;
    animId: number;
    flowStartIndex: number;
    flowCount: number;
    pendingPick: boolean;
  } | null>(null);

  // Screen space projection (P2-07: zero-allocation screen space projection)
  const project = useCallback((p: THREE.Vector3, out?: { x: number; y: number }) => {
    const th = threeRef.current;
    if (!th) return null;
    _scratchPv.copy(p).applyMatrix4(th.camera.matrixWorldInverse);
    if (_scratchPv.z > -4) return null;
    _scratchProj.copy(p).project(th.camera);
    const canvas = th.renderer.domElement;
    const w = canvas ? canvas.clientWidth : window.innerWidth;
    const h = canvas ? canvas.clientHeight : (window.innerHeight - 64);
    const res = out || _scratchScreenPt;
    res.x = (_scratchProj.x * 0.5 + 0.5) * w;
    res.y = (-_scratchProj.y * 0.5 + 0.5) * h;
    return res;
  }, []);

  // Smooth flyTo camera helper (P2-19: reduced-motion support)
  const flyTo = useCallback((target: THREE.Vector3, radius: number, dur = 1.25, theta?: number) => {
    const th = threeRef.current;
    if (!th) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const actualDur = prefersReducedMotion ? 0.05 : (dur || 1.15);
    th.fly = {
      t: 0,
      dur: actualDur,
      ease: smooth,
      fr: th.orbit.radius,
      ft: th.orbit.theta,
      ff: th.orbit.phi,
      toR: radius,
      toT: theta === undefined ? null : theta,
      fromTg: th.orbit.target.clone(),
      toTg: target.clone(),
    };
  }, []);

  // Lineage calculation for a node
  const lineageOf = useCallback((n: NebulaNode) => {
    const chain = new Set<NebulaNode>();
    chain.add(n);
    let p = n.parent && graphData.byId[n.parent] ? graphData.byId[n.parent] : null;
    while (p) {
      if (p.type !== "core" && p.type !== "origin") chain.add(p);
      p = p.type === "core" ? null : p.parent && graphData.byId[p.parent] ? graphData.byId[p.parent] : null;
    }
    const down = (x: NebulaNode) => {
      x.children.forEach((c) => {
        if (chain.has(c) || c.type === "core" || c.type === "origin") return;
        chain.add(c);
        down(c);
      });
    };
    down(n);

    const eIds: number[] = [];
    graphData.edges.forEach((e) => {
      if (chain.has(e.from) || chain.has(e.to)) eIds.push(e.i);
    });
    return { self: n, chain, edges: eIds, edgeSet: new Set(eIds) };
  }, [graphData]);

  // Select a specific node (subgenre or core)
  const selectNode = useCallback((n: NebulaNode, openCard = true) => {
    setSelectedNode(n);
    setLiveAnnouncement(t("galaxy_announce_selected", { name: isZh ? (n.zhName || n.name) : (n.en || n.name) }));
    const th = threeRef.current;
    if (!th) return;

    th.selectTime = performance.now();
    th.lastInteract = performance.now();
    th.uniforms.uSelectedNode.value = n.idx;

    // If subgenre belongs to a cluster and that cluster isn't active, activate cluster view
    if (n.cluster && n.cluster !== "origin") {
      const cluster = graphData.clusters.find((c) => c.id === n.cluster);
      if (cluster && (!selectedClusterRef.current || selectedClusterRef.current.id !== cluster.id)) {
        setSelectedCluster(cluster);
        th.uniforms.uSelectedCluster.value = graphData.clusters.findIndex((c) => c.id === cluster.id);
      }
    }

    // Apply shader mode highlights
    const lin = lineageOf(n);
    const modeArr = th.modeAttr.array as Float32Array;
    modeArr.fill(0);
    
    // Fill self
    const fillRanges = (id: number, val: number) => {
      th.ranges.forEach((r) => {
        if (r.node === id) {
          for (let i = r.s; i < r.e; i++) modeArr[i] = val;
        }
      });
    };

    fillRanges(n.idx, 2);
    lin.chain.forEach((c) => {
      if (c !== n) fillRanges(c.idx, 3);
    });
    lin.edges.forEach((eIdx) => {
      fillRanges(1000 + eIdx, 3);
    });
    th.modeAttr.needsUpdate = true;

    if (openCard) {
      setIsCardOpen(true);
    }

    // Center camera on node
    const radius = n.type === "sub" ? 210 : n.type === "core" ? 420 : 260;
    flyTo(n.pos.clone(), radius, 1.2);
  }, [flyTo, graphData, isZh, lineageOf]);

  // Select Major Genre Nebula (移动到屏幕中心，清晰美观呈现大曲风下的各种子曲风)
  const selectMajorCluster = useCallback((cluster: MajorCluster | null) => {
    setSelectedCluster(cluster);
    setSubgenreFilter("");
    setIsSubgenresPanelOpen(false);
    const th = threeRef.current;
    if (!th) return;

    if (!cluster) {
      setLiveAnnouncement(t("galaxy_announce_overview"));
      // Reset to whole galaxy overview
      th.uniforms.uSelectedCluster.value = -1;
      th.uniforms.uSelectedNode.value = -1;
      const modeArr = th.modeAttr.array as Float32Array;
      modeArr.fill(0);
      th.modeAttr.needsUpdate = true;
      setSelectedNode(null);
      setIsCardOpen(false);
      flyTo(new THREE.Vector3(0, 0, 0), 1250, 1.3);
      return;
    }

    setLiveAnnouncement(t("galaxy_announce_entered_category", { name: isZh ? cluster.name : cluster.en }));

    // Set shader uniform to highlight this cluster and softly dim the rest
    const clusterIdx = graphData.clusters.findIndex((c) => c.id === cluster.id);
    th.uniforms.uSelectedCluster.value = clusterIdx;
    th.uniforms.uSelectedNode.value = -1;

    // Reset mode buffer to normal, so entire cluster shines cleanly
    const modeArr = th.modeAttr.array as Float32Array;
    modeArr.fill(0);
    th.modeAttr.needsUpdate = true;

    // Target is the cluster core anchor
    const coreNode = graphData.byId[`${cluster.id}-core`];
    const targetPos = coreNode ? coreNode.pos.clone() : new THREE.Vector3(...cluster.anchor);

    // Smoothly fly camera to center of this cluster at distance ~420
    flyTo(targetPos, 420, 1.25);
    th.lastInteract = performance.now();
  }, [flyTo, graphData]);

  // Setup WebGL Scene ONCE on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl2") ||
        testCanvas.getContext("webgl") ||
        testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setWebglError(t("galaxy_webgl_unsupported"));
        return;
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch (err: any) {
      console.error("[GalaxyView] Failed to initialize WebGLRenderer:", err);
      setWebglError(
        err?.message || t("galaxy_webgl_init_failed")
      );
      return;
    }

    renderer.setClearColor(0x04060a, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 5000);

    const isMobile =
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(pointer:coarse)").matches) ||
      (typeof window !== "undefined" && window.innerWidth < 768);
    // Mobile particle count <= 50% of desktop (P2-09)
    const Q = isMobile ? 0.45 : 1.0;
    const WHITE = new THREE.Color(1, 1, 1);
    const _tint = new THREE.Color();
    const _hsl = { h: 0, s: 0, l: 0 };
    function tint(hex: number, white: number, bright: number, hueJit = 0): [number, number, number] {
      _tint.setHex(hex);
      if (hueJit) {
        _tint.getHSL(_hsl);
        _tint.setHSL(_hsl.h + hueJit, _hsl.s, _hsl.l);
      }
      if (white > 0) _tint.lerp(WHITE, white);
      return [_tint.r * bright, _tint.g * bright, _tint.b * bright];
    }

    // Particle buffers
    const EDGE_BASE = 1000;
    const B = {
      pos: [] as number[],
      col: [] as number[],
      size: [] as number[],
      seed: [] as number[],
      year: [] as number[],
      grow: [] as number[],
      node: [] as number[],
      cl: [] as number[],
      mode: [] as number[],
      star: [] as number[],
      n: 0,
      ranges: [] as Array<{ node: number; s: number; e: number }>,
    };

    function push(
      x: number, y: number, z: number,
      r: number, g: number, b: number,
      s: number, seed: number, year: number, grow: number,
      node: number, cl: number, star = 0
    ) {
      B.pos.push(x, y, z);
      B.col.push(r, g, b);
      B.size.push(s);
      B.seed.push(seed);
      B.year.push(year);
      B.grow.push(grow);
      B.node.push(node);
      B.cl.push(cl);
      B.mode.push(0);
      B.star.push(star);
      B.n++;
    }

    function span(id: number, fn: () => void) {
      const s = B.n;
      fn();
      B.ranges.push({ node: id, s, e: B.n });
    }

    const UPV = new THREE.Vector3(0, 1, 0);
    const V = new THREE.Vector3();
    const W = new THREE.Vector3();
    const mixA = new THREE.Color();
    const mixB = new THREE.Color();

    // 1. Generate particles for 14 major genre nebulae cores & dust clouds
    graphData.clusters.forEach((c, ci) => {
      const core = graphData.byId[`${c.id}-core`];
      if (!core) return;
      const R = c.spiral ? 92 : 78;

      span(core.idx, () => {
        // Radiant luminous cluster heart aura
        push(core.pos.x, core.pos.y, core.pos.z, 1.0, 0.98, 0.92, 26, Math.random() * 100, core.year, 0, core.idx, ci, 1);
        const coreAuraColor = tint(c.color, 0.15, 1.25, 0);
        push(core.pos.x, core.pos.y, core.pos.z, coreAuraColor[0], coreAuraColor[1], coreAuraColor[2], 48, Math.random() * 100, core.year, 0, core.idx, ci, 0);

        // High-density stellar nursery: organic ring / eye distribution rather than a single solid clump (空心气眼与有机流光)
        const nurseryN = Math.round(85 * Q);
        for (let i = 0; i < nurseryN; i++) {
          // Hollow central eye: distribution peaks at r = 8 ~ 26, avoiding an opaque solid clump in the center
          const rn = 7.5 + Math.pow(Math.random(), 1.25) * (R * 0.32);
          const an = Math.random() * Math.PI * 2;
          const yn = gauss() * (R * 0.10);
          V.set(Math.cos(an) * rn, yn, Math.sin(an) * rn).add(core.pos);
          const tcCore = tint(c.color, 0.25, 0.95, (Math.random() - 0.5) * 0.05);
          push(V.x, V.y, V.z, tcCore[0], tcCore[1], tcCore[2], 2.8 + Math.random() * 2.6, Math.random() * 100, core.year, 0, core.idx, ci, Math.random() < 0.35 ? 1 : 0);
        }

        // Main cluster dust envelope with dramatic density waves and dark void spaces (疏密悬殊的气态星际网络)
        const nd = Math.round(720 * Q);
        for (let i = 0; i < nd; i++) {
          const tArm = Math.random();
          const armIdx = i % 3;
          const armAngle = armIdx * (Math.PI * 2 / 3) + tArm * 3.8 + ci * 1.1;
          const r = 8 + Math.pow(tArm, 1.15) * (R * 1.25) + gauss() * 6.0;
          
          // Density wave void filtering: produces organic filaments with balanced transparency
          const densityRidge = Math.sin(armAngle * 2.2 + r * 0.048);
          if (densityRidge < -0.55 && Math.random() < 0.45) {
            continue;
          }

          const yv = gauss() * (R * 0.26) * (1.0 + densityRidge * 0.25);
          V.set(Math.cos(armAngle) * r, yv, Math.sin(armAngle) * r).add(core.pos);
          const rr = Math.random();
          const tc = tint(c.color, clamp(1 - rr, 0.05, 0.55), 0.72 + Math.random() * 0.55, (Math.random() - 0.5) * 0.08);
          push(V.x, V.y, V.z, tc[0], tc[1], tc[2], 2.2 + Math.random() * 3.2, Math.random() * 100, core.year, 0, core.idx, ci);
        }

        // Outlying faint stellar halo
        const nh = Math.round(220 * Q);
        for (let i = 0; i < nh; i++) {
          V.set(gauss(), gauss() * 0.4, gauss()).multiplyScalar(R * 1.65).add(core.pos);
          const tcH = tint(c.color, 0.35, 0.65, 0);
          push(V.x, V.y, V.z, tcH[0], tcH[1], tcH[2], 1.6 + Math.random() * 2.2, Math.random() * 100, core.year, 0, core.idx, ci);
        }
      });
    });

    // 2. Generate particles for individual Subgenre Stars & Micro-nebulae
    graphData.nodes.forEach((n) => {
      if (n.type !== "sub") return;
      const c = graphData.clusters.find((cl) => cl.id === n.cluster);
      if (!c) return;
      const ci = graphData.clusters.indexOf(c);
      const isHero = n.idx % 5 === 0;
      const prominence = isHero ? 1.0 : 0.65;

      span(n.idx, () => {
        // Bright primary subgenre star
        push(
          n.pos.x, n.pos.y, n.pos.z,
          1, 0.98, 0.90,
          isHero ? 11.0 : 7.0,
          Math.random() * 100, n.year, 0, n.idx, ci, 1
        );

        // Core star aura halo
        const haloColor = tint(c.color, 0.15, 1.10, 0);
        push(
          n.pos.x, n.pos.y, n.pos.z,
          haloColor[0], haloColor[1], haloColor[2],
          isHero ? 26 : 16,
          Math.random() * 100, n.year, 0, n.idx, ci, 1
        );

        // Hero subgenre spangle sparks
        if (isHero) {
          const spangleCount = Math.round(6 * Q);
          for (let k = 0; k < spangleCount; k++) {
            W.set(gauss(), gauss(), gauss()).multiplyScalar(2.8 + prominence * 0.8).add(n.pos);
            const spkCol = tint(c.color, 0.50, 0.85, (Math.random() - 0.5) * 0.05);
            push(W.x, W.y, W.z, spkCol[0], spkCol[1], spkCol[2], 2.2 + Math.random() * 1.4, Math.random() * 100, n.year, 0, n.idx, ci, 1);
          }
        }

        // Surrounding micro-nebula stardust
        const nd = Math.round(45 * Q);
        for (let i = 0; i < nd; i++) {
          V.set(gauss(), gauss(), gauss()).multiplyScalar(13 * prominence).add(n.pos);
          const tc2 = tint(c.color, 0.15, 0.80, (Math.random() - 0.5) * 0.05);
          push(V.x, V.y, V.z, tc2[0], tc2[1], tc2[2], 2.2 + Math.random() * 2.8, Math.random() * 100, n.year, 0, n.idx, ci);
        }
      });
    });

    // 3. Origin Singularity particles
    const originNode = graphData.byId["origin"];
    span(originNode.idx, () => {
      push(0, 0, 0, 1, 0.95, 0.85, 28, 0, 0, 0, originNode.idx, -1, 1);
      for (let i = 0; i < Math.round(90 * Q); i++) {
        V.set(gauss(), gauss(), gauss()).multiplyScalar(22);
        const tc = tint(0xD8B988, 0.3, 0.95, (Math.random() - 0.5) * 0.06);
        push(V.x, V.y, V.z, tc[0], tc[1], tc[2], 2.8 + Math.random() * 3.2, Math.random() * 100, 0, 0, originNode.idx, -1);
      }
      for (let k = 0; k < 6; k++) {
        push(gauss() * 30, gauss() * 30, gauss() * 30, 0.65, 0.55, 0.38, 52, Math.random() * 100, 0, 0, originNode.idx, -1);
      }
    });

    // 4. Gravitational filaments static dust
    graphData.edges.forEach((e) => {
      const fromCluster = graphData.clusters.find((cl) => cl.id === e.from.cluster);
      const toCluster = graphData.clusters.find((cl) => cl.id === e.to.cluster);
      const cf = fromCluster ? fromCluster.color : 0xD8B988;
      const ct = toCluster ? toCluster.color : 0xD8B988;
      const target = e.to;
      const clI = toCluster ? graphData.clusters.indexOf(toCluster) : -1;
      const bright = e.note ? 1.45 : e.kind === "inner" ? 0.95 : 1.15;
      const bornAttr = e.born - 8;

      span(EDGE_BASE + e.i, () => {
        const nPts = e.pts.length;
        for (let k = 0; k < nPts; k++) {
          const t = k / (nPts - 1);
          V.copy(e.pts[k]);
          V.x += gauss() * 1.3; V.y += gauss() * 1.3; V.z += gauss() * 1.3;
          mixA.setHex(cf);
          mixB.setHex(ct);
          mixA.lerp(mixB, t);
          push(
            V.x, V.y, V.z,
            mixA.r * bright, mixA.g * bright, mixA.b * bright,
            e.kind === "inner" ? 2.4 + Math.random() * 1.4 : 3.4 + Math.random() * 2.2,
            Math.random() * 100, bornAttr, t, target.idx, clI
          );
        }
      });
    });

    // 5. Deep space background stars, Milky Way River, Island Galaxies, and Vast Nebular Fogs
    const heroCols = [
      [0.85, 0.92, 1.0],
      [1.0, 0.94, 0.8],
      [1.0, 0.86, 0.84],
      [0.82, 0.95, 1.0],
    ];
    const nb = Math.round(2600 * Q);
    for (let i = 0; i < nb; i++) {
      V.set(gauss(), gauss(), gauss()).normalize().multiplyScalar(700 + Math.random() * 850);
      if (Math.random() < 0.04) {
        const hc = heroCols[(Math.random() * heroCols.length) | 0];
        push(V.x, V.y, V.z, hc[0], hc[1], hc[2], 5.5 + Math.random() * 4.0, Math.random() * 100, 0, 0, -1, -1, 1);
      } else {
        const w = Math.random();
        push(V.x, V.y, V.z, 0.78 + w * 0.2, 0.83 + w * 0.13, 0.96, 0.7 + Math.random() * 1.7, Math.random() * 100, 0, 0, -1, -1, 0);
      }
    }

    // Grand Milky Way River (银河主轴星带)
    const ax = new THREE.Vector3(0.62, 0.3, -0.72).normalize();
    const c0 = new THREE.Vector3(-430, 190, 320);
    const p1 = new THREE.Vector3().crossVectors(ax, UPV).normalize();
    const p2 = new THREE.Vector3().crossVectors(ax, p1).normalize();
    const nm = Math.round(2100 * Q);
    for (let i = 0; i < nm; i++) {
      const t = (Math.random() * 2 - 1) * 820;
      V.copy(c0).addScaledVector(ax, t).addScaledVector(p1, gauss() * 72).addScaledVector(p2, gauss() * 26);
      if (Math.random() < 0.018) {
        const hc2 = heroCols[(Math.random() * heroCols.length) | 0];
        push(V.x, V.y, V.z, hc2[0], hc2[1], hc2[2], 5.0 + Math.random() * 3.0, Math.random() * 100, 0, 0, -1, -1, 1);
      } else {
        const w = Math.random();
        push(V.x, V.y, V.z, 0.76 + w * 0.2, 0.82 + w * 0.14, 0.96, 0.7 + Math.random() * 1.5, Math.random() * 100, 0, 0, -1, -1, 0);
      }
    }
    const ndM = Math.round(420 * Q);
    for (let i = 0; i < ndM; i++) {
      const t = (Math.random() * 2 - 1) * 780;
      V.copy(c0).addScaledVector(ax, t).addScaledVector(p1, gauss() * 58).addScaledVector(p2, gauss() * 20);
      push(V.x, V.y, V.z, 0.05, 0.07, 0.13, 26 + Math.random() * 46, Math.random() * 100, 0, 0, -1, -1, 0);
    }

    // Distant Island Galaxies (远方岛状星系)
    const galaxies = [
      [ 820,  260, -700, 26, 0.72, 0.78, 0.95, 60],
      [-900, -180,  500, 34, 0.95, 0.85, 0.72, 70],
      [ 420, -520, -880, 22, 0.78, 0.90, 0.90, 50],
      [-620,  520,  820, 30, 0.90, 0.80, 0.92, 62],
      [  60,  720,-1000, 42, 0.82, 0.84, 1.00, 80],
      [-240, -820,  260, 28, 0.90, 0.88, 0.95, 55]
    ];
    galaxies.forEach((g) => {
      push(g[0], g[1], g[2], g[4] * 0.5, g[5] * 0.5, g[6] * 0.5, 34, 0, 0, 0, -1, -1, 0);
      for (let k = 0; k < g[7]; k++) {
        V.set(gauss(), gauss(), gauss()).multiplyScalar(g[3]);
        V.x += g[0]; V.y += g[1]; V.z += g[2];
        push(V.x, V.y, V.z, g[4] * 0.4, g[5] * 0.4, g[6] * 0.4, 0.9 + Math.random() * 1.1, Math.random() * 100, 0, 0, -1, -1, 0);
      }
    });

    // 8 Vast Atmospheric Nebular Fogs (宏大深空星际云气)
    const fogs = [
      [-560, -280, -360, 0.030, 0.042, 0.095],
      [ 640,  200, -460, 0.020, 0.062, 0.075],
      [ 240,  430,  520, 0.060, 0.032, 0.075],
      [-460,  380,  340, 0.022, 0.052, 0.072],
      [ 700, -360,  300, 0.052, 0.030, 0.065],
      [-360, -520, -520, 0.022, 0.034, 0.085],
      [ 120,  620, -220, 0.030, 0.030, 0.070],
      [ 520,  160,  720, 0.020, 0.050, 0.062]
    ];
    fogs.forEach((f) => {
      for (let k = 0; k < 2; k++) {
        push(f[0] + gauss() * 90, f[1] + gauss() * 90, f[2] + gauss() * 90, f[3], f[4], f[5], 120 + Math.random() * 70, Math.random() * 100, 0, 0, -1, -1, 0);
      }
    });

    // 6. Flowing pulse packets (all contiguous at the end of B buffer - P2-06 per-frame upload <= 64KB)
    const flowStartIndex = B.n;
    graphData.edges.forEach((e) => {
      const fromCluster = graphData.clusters.find((cl) => cl.id === e.from.cluster);
      const toCluster = graphData.clusters.find((cl) => cl.id === e.to.cluster);
      const cf = fromCluster ? fromCluster.color : 0xD8B988;
      const ct = toCluster ? toCluster.color : 0xD8B988;
      const target = e.to;
      const clI = toCluster ? graphData.clusters.indexOf(toCluster) : -1;

      e.flowIdx = [];
      span(EDGE_BASE + e.i, () => {
        for (let k = 0; k < e.flowN; k++) {
          const i0 = B.n;
          mixA.setHex(cf);
          mixB.setHex(ct);
          mixA.lerp(mixB, 0.5);
          const m = 1.25;
          push(0, 0, 0, Math.min(mixA.r * m, 1.4), Math.min(mixA.g * m, 1.4), Math.min(mixA.b * m, 1.4), 3.6, Math.random() * 100, e.born, 0, target.idx, clI);
          push(0, 0, 0, mixA.r * 0.5, mixA.g * 0.5, mixA.b * 0.5, 2.4, Math.random() * 100, e.born, 0, target.idx, clI);
          push(0, 0, 0, mixA.r * 0.22, mixA.g * 0.22, mixA.b * 0.22, 1.5, Math.random() * 100, e.born, 0, target.idx, clI);
          e.flowIdx.push(i0);
        }
      });
    });
    const flowCount = B.n - flowStartIndex;

    // Create BufferGeometry
    const geo = new THREE.BufferGeometry();
    function mkA(arr: number[], sz: number, dynamic = false) {
      const a = new THREE.BufferAttribute(new Float32Array(arr), sz);
      if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
      return a;
    }
    geo.setAttribute("position", mkA(B.pos, 3, true));
    geo.setAttribute("aColor", mkA(B.col, 3, false));
    geo.setAttribute("aSize", mkA(B.size, 1, false));
    geo.setAttribute("aSeed", mkA(B.seed, 1, false));
    geo.setAttribute("aYear", mkA(B.year, 1, false));
    geo.setAttribute("aGrow", mkA(B.grow, 1, false));
    geo.setAttribute("aNode", mkA(B.node, 1, false));
    geo.setAttribute("aCluster", mkA(B.cl, 1, false));
    geo.setAttribute("aStar", mkA(B.star, 1, false));
    const modeAttr = mkA(B.mode, 1, true);
    geo.setAttribute("aMode", modeAttr);

    const uniforms = {
      uTime: { value: 0 },
      uYear: { value: Y_MAX },
      uScale: { value: 1400 },
      uHoverNode: { value: -1 },
      uHoverCluster: { value: -1 },
      uSelectedCluster: { value: -1 },
      uSelectedNode: { value: -1 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: VSH,
      fragmentShader: FSH,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    // 6. Dual Reticle Ring & Shockwave
    function glowMat(op: number) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uScale: uniforms.uScale,
          uColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
          uOpacity: { value: op },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: RET_V,
        fragmentShader: RET_F,
      });
    }

    const RING_N = 64, IN_N = 36, RN = RING_N + IN_N, SHOCK_N = 48;
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = new Float32Array(RN * 3);
    const ringAng = new Float32Array(RN);
    const ringSize = new Float32Array(RN);
    const shockGeo = new THREE.BufferGeometry();
    const shockPos = new Float32Array(SHOCK_N * 3);
    const shockAng = new Float32Array(SHOCK_N);
    const shockSize = new Float32Array(SHOCK_N);

    for (let i = 0; i < RN; i++) {
      ringAng[i] = (i / RN) * Math.PI * 2;
      if (i < RING_N) ringSize[i] = i % 16 === 0 ? 2.6 : 0.9 + Math.random() * 0.6;
      else ringSize[i] = i % 3 === 2 ? 1.3 : 0.4;
    }
    for (let i = 0; i < SHOCK_N; i++) {
      shockAng[i] = (i / SHOCK_N) * Math.PI * 2;
      shockSize[i] = 1.4;
    }

    ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3).setUsage(THREE.DynamicDrawUsage));
    ringGeo.setAttribute("aSize", new THREE.BufferAttribute(ringSize, 1));
    const ringMat = glowMat(0.55);
    const ringPts = new THREE.Points(ringGeo, ringMat);
    ringPts.frustumCulled = false;
    ringPts.visible = false;
    scene.add(ringPts);

    shockGeo.setAttribute("position", new THREE.BufferAttribute(shockPos, 3).setUsage(THREE.DynamicDrawUsage));
    shockGeo.setAttribute("aSize", new THREE.BufferAttribute(shockSize, 1));
    const shockMat = glowMat(0.5);
    const shockPts = new THREE.Points(shockGeo, shockMat);
    shockPts.frustumCulled = false;
    shockPts.visible = false;
    scene.add(shockPts);

    // Camera orbit controls state
    const orbit = { theta: 0.9, phi: 1.12, radius: 960, target: new THREE.Vector3() };
    const vel = { t: 0, p: 0 };

    threeRef.current = {
      renderer,
      scene,
      camera,
      uniforms,
      modeAttr,
      points,
      geo,
      ringPts,
      ringPos,
      ringAng,
      ringGeo,
      ringMat,
      shockPts,
      shockPos,
      shockAng,
      shockGeo,
      shockMat,
      orbit,
      vel,
      fly: null,
      selectTime: 0,
      lastInteract: 0,
      idleRamp: 0,
      ranges: B.ranges,
      pointers: new Map(),
      down: null,
      pinch: null,
      mx: -1,
      my: -1,
      animId: 0,
      flowStartIndex,
      flowCount,
      pendingPick: false,
    };

    // Resize handler (P0-14: container bounds instead of window; P2-09: mobile DPR cap)
    const handleResize = () => {
      const w = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
      const h = containerRef.current ? containerRef.current.clientHeight : (window.innerHeight - 64);
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      uniforms.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(30)));
    };
    window.addEventListener("resize", handleResize);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }
    handleResize();

    // Helper for canvas relative coordinates
    const getCanvasCoords = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    // Node raycast picker (P2-07: uses currentYearRef and zero-allocation project)
    const pickNode = (mx: number, my: number) => {
      if (mx < 0 || my < 0) return null;
      let best: NebulaNode | null = null;
      let bd = 36;
      for (let i = 0; i < graphData.nodes.length; i++) {
        const n = graphData.nodes[i];
        if (currentYearRef.current < n.year) continue;
        const s = project(n.pos);
        if (!s) continue;
        const d = Math.hypot(s.x - mx, s.y - my);
        const r = n.type === "sub" ? 30 : 50;
        if (d < r && d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    };

    // Pointer events
    const handlePointerDown = (e: PointerEvent) => {
      const th = threeRef.current;
      if (!th) return;
      const pt = getCanvasCoords(e);
      th.lastInteract = performance.now();
      th.fly = null;
      th.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (th.pointers.size === 1) th.down = { x: pt.x, y: pt.y, moved: false };
      if (th.pointers.size === 2) {
        const arr = Array.from(th.pointers.values());
        th.pinch = { d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y), r: th.orbit.radius };
      }
      th.mx = pt.x;
      th.my = pt.y;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      const th = threeRef.current;
      if (!th) return;
      const pt = getCanvasCoords(e);
      th.lastInteract = performance.now();
      if (th.pointers.has(e.pointerId)) {
        const prev = th.pointers.get(e.pointerId)!;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        th.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (th.pinch && th.pointers.size === 2) {
          const arr = Array.from(th.pointers.values());
          const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
          th.orbit.radius = clamp((th.pinch.r * th.pinch.d) / Math.max(d, 20), 100, 2800);
          th.mx = pt.x;
          th.my = pt.y;
          return;
        }
        if (th.down) {
          if (Math.hypot(pt.x - th.down.x, pt.y - th.down.y) > 6) th.down.moved = true;
          const k = 0.0042 * (th.orbit.radius / 600 + 0.4);
          th.orbit.theta += dx * k;
          th.orbit.phi = clamp(th.orbit.phi - dy * k, 0.2, Math.PI - 0.2);
          th.vel.t = dx * k * 0.4;
          th.vel.p = -dy * k * 0.4;
          th.mx = pt.x;
          th.my = pt.y;
          // While dragging or rotating, completely skip hover detection (P2-08)
          return;
        }
      }
      th.mx = pt.x;
      th.my = pt.y;
      th.pendingPick = true;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const th = threeRef.current;
      if (!th) return;
      th.pointers.delete(e.pointerId);
      if (th.pointers.size < 2) th.pinch = null;

      if (th.down && !th.down.moved && e.type === "pointerup") {
        const clicked = pickNode(th.mx, th.my);
        if (clicked) {
          if (clicked.type === "core") {
            const cl = graphData.clusters.find((c) => c.id === clicked.cluster);
            if (cl) selectMajorCluster(cl);
          } else {
            selectNode(clicked, true);
          }
        } else {
          // Deselect node on clicking empty space
          setSelectedNode(null);
          setIsCardOpen(false);
          th.uniforms.uSelectedNode.value = -1;
          const modeArr = th.modeAttr.array as Float32Array;
          modeArr.fill(0);
          th.modeAttr.needsUpdate = true;
        }
      }
      if (th.pointers.size === 0) th.down = null;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const th = threeRef.current;
      if (!th) return;
      th.lastInteract = performance.now();
      th.fly = null;
      th.orbit.radius = clamp(th.orbit.radius * (1 + e.deltaY * 0.0011), 100, 2800);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    // Main animation loop
    const flowTmp = new THREE.Vector3();
    const posArr = geo.attributes.position.array as Float32Array;
    let prev = performance.now();

    // WebGL Context Loss & Recovery Guard (P1-04)
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (threeRef.current) {
        cancelAnimationFrame(threeRef.current.animId);
      }
    };

    const handleContextRestored = () => {
      if (threeRef.current) {
        const dom = threeRef.current.renderer.domElement;
        threeRef.current.renderer.setSize(dom.clientWidth || 800, dom.clientHeight || 600, false);
        prev = performance.now();
        threeRef.current.animId = requestAnimationFrame(renderLoop);
      }
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    // Tab visibility change: pause RAF when hidden to preserve GPU/battery (P1-04)
    const handleVisibilityChange = () => {
      const th = threeRef.current;
      if (!th) return;
      if (document.hidden) {
        cancelAnimationFrame(th.animId);
      } else {
        prev = performance.now();
        th.animId = requestAnimationFrame(renderLoop);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const renderLoop = (now: number) => {
      const th = threeRef.current;
      if (!th) return;
      th.animId = requestAnimationFrame(renderLoop);

      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const time = now / 1000;

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        (document.documentElement.classList.contains("reduced-motion") ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches);

      // Dynamic performance monitoring & auto-downgrade (P2-09)
      if (dt > 0.040) {
        slowFrameCountRef.current++;
        if (slowFrameCountRef.current > 60 && !hasDowngradedRef.current) {
          hasDowngradedRef.current = true;
          renderer.setPixelRatio(1);
        }
      } else {
        slowFrameCountRef.current = Math.max(0, slowFrameCountRef.current - 1);
      }

      // Timeline automated replay (P2-07: direct DOM updates without React re-render)
      if (yearPlayRef.current) {
        yearPlayRef.current.t += dt * 1000;
        const p = clamp(yearPlayRef.current.t / yearPlayRef.current.dur, 0, 1);
        const y = lerp(yearPlayRef.current.from, yearPlayRef.current.to, smooth(p));
        const roundedY = Math.round(y);
        currentYearRef.current = roundedY;
        if (yearBadgeRef.current) yearBadgeRef.current.textContent = String(roundedY);
        if (yearSliderRef.current) yearSliderRef.current.value = String(roundedY);
        th.uniforms.uYear.value = y;
        if (p >= 1) {
          yearPlayRef.current = null;
          setIsPlayingYear(false);
        }
      }

      // Camera motion update (P2-19: reduced motion stops idle drift & breathing)
      if (th.fly) {
        th.fly.t += dt / th.fly.dur;
        const k = th.fly.ease(Math.min(th.fly.t, 1));
        th.orbit.radius = lerp(th.fly.fr, th.fly.toR, k);
        if (th.fly.toT !== null) th.orbit.theta = lerp(th.fly.ft, th.fly.toT, k);
        th.orbit.target.lerpVectors(th.fly.fromTg, th.fly.toTg, k);
        if (th.fly.t >= 1) th.fly = null;
      } else {
        th.orbit.theta += th.vel.t;
        th.orbit.phi = clamp(th.orbit.phi + th.vel.p, 0.2, Math.PI - 0.2);
        th.vel.t *= 0.93;
        th.vel.p *= 0.93;
        // Idle drifting rotation & living camera breathing
        if (!prefersReducedMotion && performance.now() - th.lastInteract > 4000) {
          th.idleRamp = Math.min(th.idleRamp + dt / 3, 1);
          th.orbit.theta += dt * 0.018 * th.idleRamp;
          th.orbit.phi += Math.sin(now * 0.0006) * dt * 0.003 * th.idleRamp;
        } else {
          th.idleRamp = 0;
        }
      }

      // Subtle breathing in camera distance when idle
      const idleBreathingR = (!prefersReducedMotion && !th.fly) ? Math.sin(now * 0.0008) * 4.5 * th.idleRamp : 0;
      const currentRadius = th.orbit.radius + idleBreathingR;

      th.camera.position.set(
        th.orbit.target.x + currentRadius * Math.sin(th.orbit.phi) * Math.cos(th.orbit.theta),
        th.orbit.target.y + currentRadius * Math.cos(th.orbit.phi),
        th.orbit.target.z + currentRadius * Math.sin(th.orbit.phi) * Math.sin(th.orbit.theta)
      );
      th.camera.lookAt(th.orbit.target);
      th.camera.updateMatrixWorld();

      // Flowing edge pulse packets: serene, calm cosmic flow (星系间流动更慢更梦幻)
      for (let e = 0; e < graphData.edges.length; e++) {
        const ed = graphData.edges[e];
        ed.clock += dt * ed.speed * 0.42;
        const head = ed.flowIdx;
        for (let k = 0; k < head.length; k++) {
          const ph = (ed.phase[k] + ed.clock) % 1;
          for (let tail = 0; tail < 3; tail++) {
            const t = (((ph - tail * 0.024) % 1) + 1) % 1;
            samplePt(ed.pts, t, flowTmp);
            const idx = (head[k] + tail) * 3;
            posArr[idx] = flowTmp.x;
            posArr[idx + 1] = flowTmp.y;
            posArr[idx + 2] = flowTmp.z;
          }
        }
      }

      // Per-frame upload optimization: only update contiguous flow packet buffer range (P2-06 <= 64KB)
      const posAttr = geo.attributes.position as any;
      if (posAttr.clearUpdateRanges && posAttr.addUpdateRange) {
        posAttr.clearUpdateRanges();
        posAttr.addUpdateRange(th.flowStartIndex * 3, th.flowCount * 3);
      }
      posAttr.needsUpdate = true;

      // Hover detection scheduled inside rAF (P2-08)
      if (th.pendingPick && !th.down) {
        th.pendingPick = false;
        const hovered = pickNode(th.mx, th.my);
        const hoveredId = hovered ? hovered.id : null;
        if (hoveredId !== lastHoveredIdRef.current) {
          lastHoveredIdRef.current = hoveredId;
          setHoveredNode(hovered);
          th.uniforms.uHoverNode.value = hovered ? hovered.idx : -1;
        }
      }

      // Reticle rings and shockwave
      const curSel = selectedNodeRef.current;
      if (curSel) {
        th.ringPts.visible = true;
        const t = now * 0.001;
        const R = curSel.type === "sub" ? 22 : 38;
        const breathe = 1 + 0.07 * Math.sin(t * 1.8);
        const m = th.camera.matrixWorld.elements;
        const rx = m[0], ry = m[1], rz = m[2];
        const ux = m[4], uy = m[5], uz = m[6];

        for (let i = 0; i < RN; i++) {
          let a: number, rr: number;
          if (i < RING_N) {
            a = th.ringAng[i] + t * 0.45;
            rr = R * breathe;
          } else {
            a = th.ringAng[i] - t * 0.85;
            rr = R * 0.58;
          }
          const ca = Math.cos(a) * rr;
          const sa = Math.sin(a) * rr;
          th.ringPos[i * 3] = curSel.pos.x + ca * rx + sa * ux;
          th.ringPos[i * 3 + 1] = curSel.pos.y + ca * ry + sa * uy;
          th.ringPos[i * 3 + 2] = curSel.pos.z + ca * rz + sa * uz;
        }
        th.ringGeo.attributes.position.needsUpdate = true;
        th.ringMat.uniforms.uOpacity.value = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.8));

        // Shockwave expansion
        const st = (now - th.selectTime) / 900;
        if (st >= 0 && st < 1) {
          th.shockPts.visible = true;
          const ease = 1 - Math.pow(1 - st, 3);
          const sr = R + ease * 90;
          th.shockMat.uniforms.uOpacity.value = 0.55 * (1 - st) * (1 - st);
          for (let i = 0; i < SHOCK_N; i++) {
            const a = th.shockAng[i];
            const ca = Math.cos(a) * sr;
            const sa = Math.sin(a) * sr;
            th.shockPos[i * 3] = curSel.pos.x + ca * rx + sa * ux;
            th.shockPos[i * 3 + 1] = curSel.pos.y + ca * ry + sa * uy;
            th.shockPos[i * 3 + 2] = curSel.pos.z + ca * rz + sa * uz;
          }
          th.shockGeo.attributes.position.needsUpdate = true;
        } else {
          th.shockPts.visible = false;
        }
      } else {
        th.ringPts.visible = false;
        th.shockPts.visible = false;
      }

      // Update 3D projected HTML labels (P2-07: map iteration without querySelectorAll; P2-11: translate3d)
      const labelsBox = labelsContainerRef.current;
      if (labelsBox) {
        const selCluster = selectedClusterRef.current;
        const curHover = hoveredNodeRef.current;
        const curSel = selectedNodeRef.current;
        const w = labelsBox.clientWidth || window.innerWidth;
        const h = labelsBox.clientHeight || (window.innerHeight - 64);

        if (!selCluster) {
          // 1. Cluster overview labels
          coreElementsMapRef.current.forEach((el, coreId) => {
            const node = graphData.byId[coreId];
            if (!node) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
              return;
            }
            const s = project(node.pos);
            if (!s || s.x < -80 || s.x > w + 80 || s.y < -60 || s.y > h + 80) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
              return;
            }
            const vis = currentYearRef.current >= node.year;
            el.style.opacity = vis ? "0.85" : "0";
            el.style.pointerEvents = vis ? "auto" : "none";
            el.style.transform = `translate3d(${s.x}px, ${s.y - 28}px, 0) translate(-50%, -100%)`;
          });
        } else {
          // 2. Subgenre 3D labels
          const hasFocus = Boolean(curHover || curSel);
          const focusedId = curHover ? curHover.id : curSel ? curSel.id : null;

          subElementsMapRef.current.forEach((el, subId) => {
            const node = graphData.byId[subId];
            if (!node || node.cluster !== selCluster.id) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
              return;
            }
            const s = project(node.pos);
            if (!s || s.x < -100 || s.x > w + 100 || s.y < -80 || s.y > h + 100) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
              return;
            }
            const vis = currentYearRef.current >= node.year;
            if (!vis) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
              return;
            }
            const isFocused = focusedId === node.id;
            if (hasFocus) {
              el.style.opacity = isFocused ? "1" : "0.65";
              el.style.transform = isFocused
                ? `translate3d(${s.x}px, ${s.y - 8}px, 0) translate(-50%, -100%) scale(1.15)`
                : `translate3d(${s.x}px, ${s.y - 8}px, 0) translate(-50%, -100%) scale(0.95)`;
            } else {
              el.style.opacity = "0.92";
              el.style.transform = `translate3d(${s.x}px, ${s.y - 8}px, 0) translate(-50%, -100%) scale(1)`;
            }
            el.style.pointerEvents = "auto";
          });
        }

        // 3. Pin target anchor
        const pinEl = pinRef.current;
        if (pinEl) {
          if (curSel) {
            const s = project(curSel.pos);
            if (s) {
              pinEl.style.display = "block";
              pinEl.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
            } else {
              pinEl.style.display = "none";
            }
          } else {
            pinEl.style.display = "none";
          }
        }

        // 4. Hover tag tooltip
        const tagEl = tagRef.current;
        if (tagEl) {
          if (curHover && (!curSel || curSel.id !== curHover.id)) {
            const s = project(curHover.pos);
            if (s) {
              tagEl.style.display = "block";
              tagEl.style.transform = `translate3d(${s.x + 16}px, ${s.y - 20}px, 0)`;
            } else {
              tagEl.style.display = "none";
            }
          } else {
            tagEl.style.display = "none";
          }
        }
      }

      th.uniforms.uTime.value = prefersReducedMotion ? 0 : time;
      renderer.render(scene, camera);
    };

    threeRef.current.animId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      if (threeRef.current) {
        cancelAnimationFrame(threeRef.current.animId);
        renderer.dispose();
        geo.dispose();
        mat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        shockGeo.dispose();
        shockMat.dispose();
      }
    };
  }, [graphData, project, selectMajorCluster, selectNode]);

  // Timeline year scrubber (P2-07: ref and direct DOM updates without React re-render)
  const handleTimelineChange = (year: number) => {
    currentYearRef.current = year;
    if (yearBadgeRef.current) {
      yearBadgeRef.current.textContent = String(year);
    }
    if (yearSliderRef.current && Number(yearSliderRef.current.value) !== year) {
      yearSliderRef.current.value = String(year);
    }
    if (threeRef.current) {
      threeRef.current.uniforms.uYear.value = year;
    }
  };

  const handleToggleReplay = () => {
    if (isPlayingYear) {
      yearPlayRef.current = null;
      setIsPlayingYear(false);
      setLiveAnnouncement(t("galaxy_announce_replay_paused"));
    } else {
      const from = currentYearRef.current < Y_MAX - 5 ? currentYearRef.current : Y_MIN;
      yearPlayRef.current = { from, to: Y_MAX, t: 0, dur: 7000 };
      setIsPlayingYear(true);
      flyTo(new THREE.Vector3(0, 0, 0), 720, 2.2);
      setLiveAnnouncement(t("galaxy_announce_replay_evolution"));
    }
  };

  // Keyboard Accessibility: Esc key closes modal / card or resets cluster (P2-16)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCardOpen) {
          setIsCardOpen(false);
        } else if (selectedNode) {
          setSelectedNode(null);
        } else if (selectedCluster) {
          selectMajorCluster(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCardOpen, selectedNode, selectedCluster, selectMajorCluster]);

  if (webglError || displayMode === "list") {
    return (
      <ExploreListView
        onSelectGenre={onSelectGenre}
        onOpenStudio={onOpenStudio}
        onOpenHelp={onOpenHelp}
        isFallback={Boolean(webglError)}
        onSwitchTo3D={() => {
          setWebglError(null);
          setDisplayMode("3d");
        }}
      />
    );
  }

  // A-07: dvh tracks the mobile URL bar; 100vh left a strip of the canvas hidden
  // behind browser chrome on phones.
  return (
    <div ref={containerRef} className="relative w-full h-[calc(100dvh-64px)] overflow-hidden bg-[#04060a] select-none text-[#eae6dc]">
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* 3D Projected Screen Labels Container */}
      <div ref={labelsContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {/* Major Clusters Overview Labels */}
        {!selectedCluster && graphData.clusters.map((c) => {
          const core = graphData.byId[`${c.id}-core`];
          if (!core) return null;
          return (
            <button
              type="button"
              key={c.id}
              ref={(el) => {
                if (el) coreElementsMapRef.current.set(core.id, el);
                else coreElementsMapRef.current.delete(core.id);
              }}
              data-core-id={core.id}
              onClick={(e) => {
                e.stopPropagation();
                selectMajorCluster(c);
              }}
              aria-label={`${c.name} ${c.en}`}
              style={{ opacity: 0 }}
              className="nlab-core absolute transition-opacity duration-300 pointer-events-auto cursor-pointer text-center group bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
            >
              <b className="block font-light text-xs sm:text-[13px] tracking-[0.32em] text-[#eae6dc]/80 group-hover:text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] transition-colors">
                {c.name}
              </b>
              <em className="block not-italic font-[Space_Grotesk] font-medium text-[8.5px] tracking-[0.25em] text-[#d8b988]/80 group-hover:text-accent transition-colors">
                {c.en}
              </em>
            </button>
          );
        })}

        {/* Selected Cluster: 3D Floating Subgenre Constellation Labels (clean, dot-free, non-intrusive) */}
        {selectedCluster && clusterSubgenres.map((sub) => {
          const isCurrentActive = selectedNode?.id === sub.id;
          const isHovered = hoveredNode?.id === sub.id;
          const isHighlighted = isCurrentActive || isHovered;
          const displayName = isZh ? (sub.zhName || sub.name) : (sub.en || sub.name);

          return (
            <button
              type="button"
              key={sub.id}
              ref={(el) => {
                if (el) subElementsMapRef.current.set(sub.id, el);
                else subElementsMapRef.current.delete(sub.id);
              }}
              data-sub-id={sub.id}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(sub, true);
              }}
              aria-label={displayName}
              onPointerEnter={() => {
                setHoveredNode(sub);
                const th = threeRef.current;
                if (th) th.uniforms.uHoverNode.value = sub.idx;
              }}
              onPointerLeave={() => {
                setHoveredNode(null);
                const th = threeRef.current;
                if (th) th.uniforms.uHoverNode.value = -1;
              }}
              style={{ opacity: 0 }}
              className="nlab-sub absolute pointer-events-auto cursor-pointer select-none text-left transition-opacity duration-150 bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
            >
              <div
                className={`transition-all duration-200 px-2 py-0.5 rounded-full flex items-center justify-center ${
                  isHighlighted
                    ? "bg-black/60 backdrop-blur-md border border-accent/60 shadow-[0_0_16px_rgba(245,183,61,0.5)] scale-110 z-30"
                    : "hover:bg-white/[0.08]"
                }`}
              >
                <span
                  className={`text-[11px] sm:text-xs tracking-tight whitespace-nowrap transition-colors ${
                    isHighlighted
                      ? "text-accent font-bold drop-shadow-[0_0_10px_rgba(245,183,61,0.8)]"
                      : "text-zinc-200 font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
                  }`}
                >
                  {displayName}
                </span>
              </div>
            </button>
          );
        })}

        {/* Dynamic Target Pin Ring */}
        <div ref={pinRef} className="absolute pointer-events-none hidden -translate-x-1/2 -translate-y-1/2">
          <div className="w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d8b988] shadow-[0_0_16px_rgba(216,185,136,0.6)] animate-pulse" />
        </div>

        {/* Floating Hover Tooltip Tag */}
        <div ref={tagRef} className="absolute pointer-events-none hidden whitespace-nowrap z-30">
          {hoveredNode && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#06090f]/90 border border-[#eae6dc]/20 backdrop-blur-md shadow-2xl">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    hoveredNode.type === "origin"
                      ? "#d8b988"
                      : graphData.clusters.find((c) => c.id === hoveredNode.cluster)?.hexColor || "#f5b73d",
                }}
              />
              <span className="text-xs font-semibold text-white">{hoveredNode.name}</span>
              {hoveredNode.year > 0 && (
                <span className="text-[10px] font-mono text-[#d8b988]">{hoveredNode.year}</span>
              )}
              {hoveredNode.bpm && (
                <span className="text-[9.5px] font-mono text-text-sub">{hoveredNode.bpm} BPM</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Radial Vignette Veil */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_48%,transparent_62%,rgba(2,3,6,0.35)_100%)]" />

      {/* Top Left: Masthead */}
      <div className="absolute top-5 left-6 z-20 pointer-events-auto flex items-start gap-4">
        <div className="hidden sm:flex flex-col gap-1 border-r border-[#eae6dc]/15 pr-3 text-[10px] font-light tracking-[0.35em] text-[#eae6dc]/55 uppercase">
          <span>{t("galaxy_genesis")}</span>
          <span className="font-mono text-[9px] tracking-[0.2em] text-[#d8b988]/80">GENESIS ATLAS OF SOUND</span>
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-light tracking-[0.25em] text-[#eae6dc] drop-shadow-[0_0_20px_rgba(216,185,136,0.35)] m-0 font-[Space_Grotesk]">
              {t("galaxy_title")}
            </h1>
            {onOpenHelp && (
              <button
                type="button"
                data-testid="galaxy-help-button"
                onClick={onOpenHelp}
                title={t("galaxy_guide_btn")}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-accent/40 bg-[#080c16]/80 text-accent font-semibold text-[11px] hover:bg-accent/20 transition-all shadow-sm"
              >
                <BookOpen className="w-3 h-3 text-accent" />
                <span>{t("galaxy_guide_btn")}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#eae6dc]/60">
            <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#d8b988]">
              <Sparkles className="w-3 h-3" />
              {t("galaxy_subtitle")}
            </span>
            {selectedCluster ? (
              <>
                <span className="text-[#eae6dc]/30">/</span>
                <span className="font-[Space_Grotesk] tracking-wider text-accent font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full ring-2 ring-white/10" style={{ backgroundColor: selectedCluster.hexColor, boxShadow: `0 0 6px ${selectedCluster.hexColor}` }} />
                  {selectedCluster.en}
                </span>
                <span>•</span>
                <span>{t("galaxy_subgenres_count", { count: clusterSubgenres.length })}</span>
                <button
                  onClick={() => setIsSubgenresPanelOpen((prev) => !prev)}
                  className={`ml-2 px-2.5 py-0.5 rounded-full border text-[11px] transition-all flex items-center gap-1.5 shadow-sm ${
                    isSubgenresPanelOpen
                      ? "bg-accent text-zinc-950 border-accent font-bold"
                      : "bg-[#0d121d]/80 text-[#eae6dc] border-[#eae6dc]/25 hover:border-accent hover:text-accent"
                  }`}
                  aria-expanded={isSubgenresPanelOpen}
                >
                  <List className="w-3 h-3" />
                  <span>{isSubgenresPanelOpen ? t("galaxy_close_subgenres") : t("galaxy_open_subgenres")}</span>
                </button>
                <button
                  onClick={() => selectMajorCluster(null)}
                  className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-[#eae6dc]/80 hover:text-white transition-colors"
                >
                  {t("galaxy_back_overview")}
                </button>
              </>
            ) : (
              <span>{t("galaxy_drag_hint")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Top Center: Major Nebula Quick Switcher Chips */}
      <div className="absolute top-[4.85rem] left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[92vw] overflow-x-auto no-scrollbar flex items-center gap-1.5 bg-[#080b12]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={() => selectMajorCluster(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
            !selectedCluster
              ? "bg-accent/20 border border-accent/70 text-accent font-bold shadow-[0_0_12px_rgba(245,183,61,0.35)]"
              : "text-[#eae6dc]/60 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
          title={t("galaxy_toggle_all_title")}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${!selectedCluster ? "bg-accent shadow-[0_0_6px_#f5b73d]" : "bg-white/40"}`} />
          <span>{t("galaxy_filter_all")}</span>
        </button>
        {graphData.clusters.map((c) => {
          const isSelected = selectedCluster?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => selectMajorCluster(c)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? "text-zinc-950 font-bold"
                  : "text-[#eae6dc]/60 hover:text-white hover:bg-white/5"
              }`}
              style={{
                backgroundColor: isSelected ? c.hexColor : undefined,
                boxShadow: isSelected ? `0 0 14px ${c.hexColor}80` : undefined,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isSelected ? "#000" : c.hexColor }}
              />
              <span>{isZh ? c.name : c.en}</span>
            </button>
          );
        })}
        <div className="w-[1px] h-4 bg-white/20 mx-0.5 shrink-0" />
        <button
          onClick={() => setDisplayMode("list")}
          className="px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 text-accent hover:text-white hover:bg-white/10 shrink-0"
          title={t("galaxy_switch_list_title")}
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("galaxy_list_view")}</span>
        </button>
      </div>

      {/* Top Right: Era Timeline (纪元 1850 - 2025) (P2-07: ref-based DOM updates) */}
      <div className="absolute top-6 right-6 z-20 pointer-events-auto flex flex-col items-end text-right">
        <div ref={yearBadgeRef} className="text-3xl sm:text-4xl font-bold font-[Space_Grotesk] tabular-nums text-[#eae6dc] drop-shadow-[0_0_24px_rgba(216,185,136,0.35)] leading-none">
          {Y_MAX}
        </div>
        <div className="text-[10px] tracking-[0.4em] text-[#eae6dc]/50 mt-1 uppercase">
          {t("galaxy_era_timeline")}
        </div>
        <div className="w-48 sm:w-56 mt-2 relative py-1 cursor-pointer">
          <input
            ref={yearSliderRef}
            type="range"
            min={Y_MIN}
            max={Y_MAX}
            defaultValue={Y_MAX}
            aria-label={t("galaxy_era_timeline")}
            onInput={(e) => handleTimelineChange(+e.currentTarget.value)}
            className="w-full h-1 accent-[#d8b988] bg-[#eae6dc]/20 rounded cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-[#eae6dc]/50">
          <span className="text-[9.5px] tracking-wider">
            {t("galaxy_drag_era")}
          </span>
          <button
            onClick={handleToggleReplay}
            className={`w-7 h-7 rounded-full border border-[#eae6dc]/20 flex items-center justify-center transition-colors ${
              isPlayingYear ? "text-[#d8b988] border-[#d8b988] shadow-[0_0_10px_rgba(216,185,136,0.4)]" : "hover:text-[#d8b988] hover:border-[#d8b988]"
            }`}
            title={t("galaxy_replay_evolution")}
            aria-label={t("galaxy_replay_evolution")}
          >
            {isPlayingYear ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Left Bottom: Major Clusters Legend (Overview Mode) (P2-15: semantic button) */}
      {!selectedCluster && (
        <div className="absolute bottom-8 left-6 z-20 pointer-events-auto hidden md:flex flex-col gap-1 bg-[#05070c]/70 backdrop-blur-md p-3.5 rounded-xl border border-[#eae6dc]/15 shadow-2xl max-h-[48vh] overflow-y-auto no-scrollbar">
          <div className="text-[10px] tracking-[0.4em] text-[#eae6dc]/45 uppercase pb-1 border-b border-[#eae6dc]/10 mb-1">
            {t("galaxy_nebulae")}
          </div>
          {graphData.clusters.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => selectMajorCluster(c)}
              aria-label={`${c.name} (${c.en})`}
              className="flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer transition-all text-[#eae6dc]/70 hover:text-white hover:bg-white/5 text-left border-0 bg-transparent w-full"
            >
              <span
                className="w-2 h-2 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: c.hexColor, boxShadow: `0 0 8px ${c.hexColor}` }}
              />
              <span className="text-xs">{isZh ? c.name : c.en}</span>
              <span className="text-[9.5px] font-[Space_Grotesk] tracking-wider opacity-60 ml-auto">
                {isZh ? c.en : c.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Bottom Center: Operational Hint */}
      {!selectedCluster && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center text-xs text-[#eae6dc]/50 tracking-[0.2em] font-light hidden lg:block bg-[#05070c]/60 px-4 py-1.5 rounded-full border border-[#eae6dc]/10 backdrop-blur-sm">
          <>
            <b>{t("galaxy_hint_drag")}</b> {t("galaxy_hint_rotate")} <b>{t("galaxy_hint_scroll")}</b> {t("galaxy_hint_zoom")} <b>{t("galaxy_hint_click")}</b> {t("galaxy_hint_focus")} <b>{t("galaxy_hint_era")}</b> {t("galaxy_hint_explore")}
          </>
        </div>
      )}

      {/* Bottom Floating Trigger: Expand Subgenre Branch Panel (默认隐藏状态，可点击展开) */}
      {selectedCluster && !isSubgenresPanelOpen && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-fade-in">
          <button
            onClick={() => setIsSubgenresPanelOpen(true)}
            className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#0a0d16]/90 hover:bg-[#141926] border border-white/[0.15] hover:border-[#d8b988] text-xs text-zinc-200 hover:text-white backdrop-blur-xl shadow-2xl transition-all hover:scale-105 group"
          >
            <div className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedCluster.hexColor, boxShadow: `0 0 8px ${selectedCluster.hexColor}` }} />
            </div>
            <span className="font-semibold tracking-tight whitespace-nowrap">
              {t("galaxy_explore_subgenres", { count: clusterSubgenres.length })}
            </span>
            <ChevronUp className="w-3.5 h-3.5 text-[#d8b988] group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* Selected Major Cluster: Subgenre Constellation Showcase Panel (清晰美观呈现大曲风下的各种子曲风) */}
      {selectedCluster && isSubgenresPanelOpen && (
        <div className="absolute bottom-6 inset-x-4 sm:inset-x-6 z-30 pointer-events-auto bg-[#080c16]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-4 sm:p-5 flex flex-col gap-3.5 max-h-[48vh] overflow-hidden animate-slide-up">
          {/* Panel Header */}
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Luminous Cluster Gem */}
              <div 
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-md"
                style={{
                  backgroundColor: `${selectedCluster.hexColor}20`,
                  borderColor: `${selectedCluster.hexColor}50`,
                  boxShadow: `0 0 16px ${selectedCluster.hexColor}30`,
                }}
              >
                <Sparkles className="w-4 h-4" style={{ color: selectedCluster.hexColor }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-white m-0 tracking-tight font-[Space_Grotesk]">
                    {t("galaxy_nebula_named", { nebula: selectedCluster.name, name: selectedCluster.en })}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] font-mono text-xs font-semibold text-accent">
                    {t("galaxy_subgenres_count", { count: clusterSubgenres.length })}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-1 max-w-2xl font-normal leading-relaxed">
                  {selectedCluster.desc[language]}
                </p>
              </div>
            </div>

            {/* Controls & Return */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Filter search in cluster */}
              <div className="relative hidden sm:block">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder={t("galaxy_filter_placeholder")}
                  value={subgenreFilter}
                  onChange={(e) => setSubgenreFilter(e.target.value)}
                  className="w-36 lg:w-44 pl-8 pr-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/[0.1] rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode("rail")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "rail" ? "bg-white/[0.12] text-white" : "text-zinc-400 hover:text-white"}`}
                  title={t("galaxy_rail_view_title")}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white/[0.12] text-white" : "text-zinc-400 hover:text-white"}`}
                  title={t("galaxy_grid_view_title")}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Collapse Subgenres Panel Button */}
              <button
                onClick={() => setIsSubgenresPanelOpen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] hover:border-accent/40 text-xs text-zinc-300 hover:text-white transition-all shadow-sm"
                title={t("galaxy_fold_panel_title")}
              >
                <ChevronDown className="w-3.5 h-3.5 text-accent" />
                <span className="whitespace-nowrap">{t("fold")}</span>
              </button>

              <button
                onClick={() => selectMajorCluster(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all shadow-sm"
                title={t("galaxy_return_overview_title")}
              >
                <RotateCcw className="w-3 h-3 text-[#d8b988]" />
                <span className="whitespace-nowrap">{t("galaxy_overview")}</span>
              </button>
            </div>
          </div>

          {/* Subgenres Cards Showcase */}
          <div className="overflow-y-auto no-scrollbar max-h-[32vh]">
            <div
              className={
                viewMode === "rail"
                  ? "flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1.5 min-w-max"
                  : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pb-1.5"
              }
            >
              {filteredSubgenres.map((sub) => {
                const isCurrentActive = selectedNode?.id === sub.id;
                return (
                  <div
                    key={sub.id}
                    role="button"
                    tabIndex={0}
                    aria-label={isZh ? (sub.zhName || sub.name) : (sub.en || sub.name)}
                    onClick={() => selectNode(sub, true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectNode(sub, true);
                      }
                    }}
                    className={`group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      viewMode === "rail" ? "w-64 sm:w-72 shrink-0" : "w-full"
                    } ${
                      isCurrentActive
                        ? "bg-gradient-to-b from-[#182032] to-[#0f1424] border-accent shadow-[0_0_24px_rgba(245,183,61,0.22)] ring-1 ring-[#f5b73d]/40 scale-[1.01]"
                        : "bg-gradient-to-b from-[#111522]/90 to-[#0b0e18]/95 border-white/[0.08] hover:border-white/[0.2] hover:from-[#161c2c] hover:to-[#0e1220] shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.55)]"
                    }`}
                  >
                    <div>
                      {/* Top Badges Row */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        {/* Luminous Glow Micro Indicator */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
                            <span
                              className="absolute w-2.5 h-2.5 rounded-full opacity-35"
                              style={{ backgroundColor: selectedCluster.hexColor }}
                            />
                            <span
                              className="relative w-1.5 h-1.5 rounded-full"
                              style={{
                                backgroundColor: selectedCluster.hexColor,
                                boxShadow: `0 0 8px ${selectedCluster.hexColor}`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 truncate tracking-wide">
                            {sub.genre?.origin_place ? sub.genre.origin_place[language] : selectedCluster.name}
                          </span>
                        </div>

                        {/* Year & BPM metrics pill */}
                        <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                          <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-accent font-semibold">
                            {sub.year > 0 ? sub.year : "ROOT"}
                          </span>
                          {sub.bpm && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-zinc-400">
                              {sub.bpm} BPM
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Subtitle */}
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-sm font-bold text-white tracking-tight truncate group-hover:text-accent transition-colors font-[Space_Grotesk]">
                          {isZh ? (sub.zhName || sub.name) : (sub.en || sub.name)}
                        </h3>
                        <div className="text-[11px] text-zinc-400 truncate font-normal tracking-normal">
                          {isZh ? (sub.en || sub.name) : (sub.zhName || sub.name)}
                        </div>
                      </div>

                      {/* Curated Description Snippet */}
                      <p className="text-[11px] text-zinc-400/90 line-clamp-2 mt-2 leading-relaxed font-normal">
                        {sub.desc[language] || sub.artists}
                      </p>
                    </div>

                    {/* Pro Action Buttons */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/[0.06]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectNode(sub, true);
                        }}
                        className="text-[11px] font-medium text-zinc-400 hover:text-[#d8b988] flex items-center gap-1 transition-colors"
                      >
                        <Compass className="w-3 h-3 text-[#d8b988]" />
                        <span className="whitespace-nowrap">{t("galaxy_focus")}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        {sub.genre && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStudio(sub.genre!);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#45e0c9]/10 hover:bg-[#45e0c9]/20 text-[#45e0c9] hover:text-white border border-[#45e0c9]/25 text-[10px] font-semibold transition-all flex items-center gap-1 shadow-sm"
                            title={t("galaxy_studio_btn_title")}
                          >
                            <Music className="w-2.5 h-2.5 shrink-0" />
                            <span className="whitespace-nowrap">{t("nav_studio")}</span>
                          </button>
                        )}
                        {sub.genre && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectGenre(sub.genre!);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white border border-white/[0.08] text-[10px] font-medium transition-all flex items-center gap-1 shadow-sm"
                            title={t("galaxy_details_btn_title")}
                          >
                            <span className="whitespace-nowrap">{t("galaxy_details_btn")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Right Drawer: Genre Dossier Card (`#card`) */}
      {selectedNode && isCardOpen && (
        <aside
          className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-[420px] bg-gradient-to-l from-[#06080e]/95 to-[#06080e]/85 backdrop-blur-2xl border-l border-[#242732] shadow-2xl p-6 sm:p-7 overflow-y-auto custom-scroll animate-slide-left flex flex-col justify-between"
        >
          <div>
            {/* Close Button */}
            <button
              onClick={() => setIsCardOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full border border-[#2e323e] hover:border-[#d8b988] text-text-sub hover:text-[#d8b988] flex items-center justify-center transition-colors"
              title={t("close")}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Chip Header */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_#f5b73d]"
                style={{
                  backgroundColor:
                    selectedNode.type === "origin"
                      ? "#d8b988"
                      : graphData.clusters.find((c) => c.id === selectedNode.cluster)?.hexColor || "#f5b73d",
                }}
              />
              <span className="text-xs tracking-[0.2em] font-light text-text-sub uppercase">
                {selectedNode.type === "origin"
                  ? (t("galaxy_singularity"))
                  : t("galaxy_branch_label", {
                    name:
                      (isZh
                        ? graphData.clusters.find((c) => c.id === selectedNode.cluster)?.name
                        : graphData.clusters.find((c) => c.id === selectedNode.cluster)?.en) ||
                      t("galaxy_branch_unnamed"),
                  })}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-2xl sm:text-3xl font-normal tracking-wide text-white m-0 font-[Space_Grotesk] drop-shadow-[0_0_20px_rgba(216,185,136,0.25)]">
              {isZh ? selectedNode.name : selectedNode.en}
            </h2>
            <div className="font-[Space_Grotesk] text-xs font-medium tracking-wider text-[#d8b988] mt-1 mb-3">
              {isZh ? selectedNode.en : selectedNode.name}
            </div>

            {/* Year & Place */}
            <div className="flex items-center gap-2 text-xs text-text-sub mb-4 pb-3 border-b border-[#1f222a]">
              <span>
                {t("galaxy_origin_label", {
                  value:
                    selectedNode.year > 0
                      ? t("galaxy_origin_year", { year: selectedNode.year })
                      : t("galaxy_origin_prerecording"),
                })}
              </span>
              {selectedNode.genre?.origin_place && (
                <>
                  <span>·</span>
                  <span>{selectedNode.genre.origin_place[language]}</span>
                </>
              )}
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm font-light leading-relaxed text-[#eae6dc]/85 mb-5">
              {selectedNode.desc[language]}
            </p>

            {/* Lineage Chain */}
            {(() => {
              const lin = lineageOf(selectedNode);
              const parents: NebulaNode[] = [];
              let p = selectedNode.parent && graphData.byId[selectedNode.parent] ? graphData.byId[selectedNode.parent] : null;
              while (p) {
                parents.unshift(p);
                p = p.type === "core" ? null : p.parent && graphData.byId[p.parent] ? graphData.byId[p.parent] : null;
              }
              if (parents.length === 0) return null;
              return (
                <div className="mb-5">
                  <span className="block text-[9.5px] tracking-[0.3em] text-text-dim uppercase mb-2">
                    {t("galaxy_lineage")}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#eae6dc]">
                    {parents.map((par) => (
                      <React.Fragment key={par.id}>
                        <button
                          onClick={() => selectNode(par, true)}
                          className="hover:text-[#d8b988] underline underline-offset-4 decoration-dashed transition-colors"
                        >
                          {isZh ? par.name : par.en}
                        </button>
                        <span className="text-[#d8b988]/60 text-xs">⟶</span>
                      </React.Fragment>
                    ))}
                    <span className="font-bold text-accent">
                      {isZh ? selectedNode.name : selectedNode.en}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Sub-branches */}
            {selectedNode.children.length > 0 && (
              <div className="mb-5">
                <span className="block text-[9.5px] tracking-[0.3em] text-text-dim uppercase mb-2">
                  {t("galaxy_evolutionary_branches")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.children.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => selectNode(k, true)}
                      className="px-2.5 py-1 rounded bg-[#13161f] hover:bg-[#1f2330] border border-[#242735] hover:border-[#d8b988] text-xs text-[#eae6dc] transition-colors"
                    >
                      {isZh ? k.name : k.en}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sound design & Chords */}
            {selectedNode.genre && (
              <div className="mb-5 p-3.5 rounded-xl bg-[#0a0d14] border border-[#1d2029] space-y-2">
                <div className="text-xs text-[#a0a5b2] leading-relaxed">
                  <span className="text-[#d8b988] font-semibold mr-1">
                    {t("galaxy_sound_design")}
                  </span>
                  {selectedNode.genre.sound_design[language]}
                </div>
                {selectedNode.genre.common_chords.length > 0 && (
                  <div className="text-xs text-[#a0a5b2] leading-relaxed">
                    <span className="text-[#45e0c9] font-semibold mr-1">
                      {t("galaxy_common_chords")}
                    </span>
                    <code className="font-mono text-accent">{selectedNode.genre.common_chords.join(" → ")}</code>
                  </div>
                )}
              </div>
            )}

            {/* Representative tracks */}
            {selectedNode.genre?.representative_tracks && selectedNode.genre.representative_tracks.length > 0 && (
              <div className="mb-5">
                <span className="block text-[9.5px] tracking-[0.3em] text-text-dim uppercase mb-2">
                  {t("galaxy_key_artists")}
                </span>
                <div className="space-y-1.5">
                  {selectedNode.genre.representative_tracks.slice(0, 4).map((t, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#171920]">
                      <span className="text-white truncate max-w-[240px]">
                        {t.title} · <span className="text-text-sub">{t.artist}</span>
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">{t.year}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Dock */}
          <div className="pt-4 border-t border-[#1f222a] flex items-center gap-2 mt-4">
            {selectedNode.genre && (
              <button
                onClick={() => onOpenStudio(selectedNode.genre!)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-accent hover:bg-[#e5a72d] text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,183,61,0.3)]"
              >
                <Music className="w-3.5 h-3.5" />
                <span>{t("open_in_studio")}</span>
              </button>
            )}
            {selectedNode.genre && (
              <button
                onClick={() => onSelectGenre(selectedNode.genre!)}
                className="py-2.5 px-3 rounded-xl bg-[#171a24] hover:bg-[#222735] border border-[#2b3040] text-xs text-white flex items-center justify-center gap-1 transition-colors"
                title={t("galaxy_dossier_title")}
              >
                <span>{t("view_detail")}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

export default GalaxyView;
