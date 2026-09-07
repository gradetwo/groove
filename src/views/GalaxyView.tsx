import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  X, 
  Music, 
  ChevronRight, 
  Sparkles, 
  Compass, 
  Search, 
  Grid, 
  SlidersHorizontal 
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

interface GalaxyViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
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
uniform float uTime, uYear, uScale, uHoverNode, uHoverCluster, uSelectedCluster;
varying vec3 vColor;
varying float vAlpha;
varying float vStar;

void main(){
  vec3 p = position;
  float t = uTime * 0.35;
  p.x += sin(t * 0.7 + aSeed) * 1.5;
  p.y += sin(t * 0.5 + aSeed * 1.7) * 1.3;
  p.z += cos(t * 0.6 + aSeed * 2.3) * 1.5;

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
  float twA = 0.18 + 0.32 * bg * isSm;
  alpha *= (1.0 - twA) + twA * (0.5 + 0.5 * sin(uTime * (0.7 + fract(aSeed * 0.31) * 2.4) + aSeed * 9.0));

  // If a major cluster is selected, bring its stars forward and softly dim the others
  if (uSelectedCluster >= -0.5) {
    if (abs(aCluster - uSelectedCluster) < 0.5) {
      alpha *= 1.45;
      sz *= 1.28;
      col = mix(col, vec3(1.0, 0.95, 0.85), 0.12);
    } else if (aCluster >= -0.5) {
      alpha *= 0.18;
      sz *= 0.82;
    } else {
      alpha *= 0.35;
    }
  }

  // Node selection highlighting modes
  if (aMode > 2.5) {
    col = mix(col, vec3(1.0, 0.87, 0.62), 0.2);
    alpha *= 1.35;
    sz *= 1.2;
  } else if (aMode > 1.5) {
    col = mix(col, vec3(1.0, 0.94, 0.78), 0.32);
    alpha *= 1.8 * (1.06 + 0.16 * sin(uTime * 2.4 + aSeed * 0.7));
    sz *= 1.45;
  }

  if (uHoverNode > -0.5 && abs(aNode - uHoverNode) < 0.5) {
    alpha *= 1.9;
    sz *= 1.45;
    col = mix(col, vec3(1.0), 0.3);
  }
  if (uHoverCluster > -0.5 && abs(aCluster - uHoverCluster) < 0.5) {
    alpha *= 1.35;
    sz *= 1.18;
  }

  alpha *= (1.0 + pulse * 1.7);
  sz *= (1.0 + pulse * 1.2);
  alpha *= clamp(1.55 - dz / 1800.0, 0.15, 1.0);

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
    float c = exp(-d * d * 22.0) * 1.5;
    float rx = max(0.0, 1.0 - abs(uv.y) * 9.0) * max(0.0, 1.0 - abs(uv.x) * 2.1);
    float ry = max(0.0, 1.0 - abs(uv.x) * 9.0) * max(0.0, 1.0 - abs(uv.y) * 2.1);
    a = (c + (rx + ry) * 0.45) * vAlpha;
  } else {
    float core = exp(-d * d * 7.0);
    float halo = exp(-d * d * 2.0) * 0.3;
    float wide = exp(-d * 1.8) * 0.05;
    a = (core + halo + wide) * vAlpha;
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
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

export const GalaxyView: React.FC<GalaxyViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { language } = useLanguage();
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

  // Timeline state
  const Y_MIN = 1850;
  const Y_MAX = 2025;
  const [currentYear, setCurrentYear] = useState<number>(Y_MAX);
  const [isPlayingYear, setIsPlayingYear] = useState<boolean>(false);
  const yearPlayRef = useRef<{ from: number; to: number; t: number; dur: number } | null>(null);

  // References for render loop to access without recreating WebGL context
  const selectedClusterRef = useRef<MajorCluster | null>(null);
  selectedClusterRef.current = selectedCluster;
  const selectedNodeRef = useRef<NebulaNode | null>(null);
  selectedNodeRef.current = selectedNode;
  const hoveredNodeRef = useRef<NebulaNode | null>(null);
  hoveredNodeRef.current = hoveredNode;
  const currentYearRef = useRef<number>(Y_MAX);
  currentYearRef.current = currentYear;

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
  } | null>(null);

  // Screen space projection
  const project = useCallback((p: THREE.Vector3) => {
    const th = threeRef.current;
    if (!th) return null;
    const pv = p.clone().applyMatrix4(th.camera.matrixWorldInverse);
    if (pv.z > -4) return null;
    const proj = p.clone().project(th.camera);
    return {
      x: (proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-proj.y * 0.5 + 0.5) * window.innerHeight,
    };
  }, []);

  // Smooth flyTo camera helper
  const flyTo = useCallback((target: THREE.Vector3, radius: number, dur = 1.25, theta?: number) => {
    const th = threeRef.current;
    if (!th) return;
    th.fly = {
      t: 0,
      dur: dur || 1.15,
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
    const th = threeRef.current;
    if (!th) return;

    th.selectTime = performance.now();
    th.lastInteract = performance.now();

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
    const radius = n.type === "sub" ? 210 : n.type === "core" ? 340 : 250;
    flyTo(n.pos.clone(), radius, 1.2);
  }, [flyTo, graphData, lineageOf]);

  // Select Major Genre Nebula (移动到屏幕中心，清晰美观呈现大曲风下的各种子曲风)
  const selectMajorCluster = useCallback((cluster: MajorCluster | null) => {
    setSelectedCluster(cluster);
    setSubgenreFilter("");
    const th = threeRef.current;
    if (!th) return;

    if (!cluster) {
      // Reset to whole galaxy overview
      th.uniforms.uSelectedCluster.value = -1;
      const modeArr = th.modeAttr.array as Float32Array;
      modeArr.fill(0);
      th.modeAttr.needsUpdate = true;
      setSelectedNode(null);
      setIsCardOpen(false);
      flyTo(new THREE.Vector3(0, 0, 0), 720, 1.3);
      return;
    }

    // Set shader uniform to highlight this cluster and softly dim the rest
    const clusterIdx = graphData.clusters.findIndex((c) => c.id === cluster.id);
    th.uniforms.uSelectedCluster.value = clusterIdx;

    // Reset mode buffer to normal, so entire cluster shines cleanly
    const modeArr = th.modeAttr.array as Float32Array;
    modeArr.fill(0);
    th.modeAttr.needsUpdate = true;

    // Target is the cluster core anchor
    const coreNode = graphData.byId[`${cluster.id}-core`];
    const targetPos = coreNode ? coreNode.pos.clone() : new THREE.Vector3(...cluster.anchor);

    // Smoothly fly camera to center of this cluster at distance ~330
    flyTo(targetPos, 330, 1.25);
    th.lastInteract = performance.now();
  }, [flyTo, graphData]);

  // Setup WebGL Scene ONCE on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x04060a, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 5000);

    const Q = (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) || (window.innerWidth < 760) ? 0.6 : 1;
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

    const V = new THREE.Vector3();
    const W = new THREE.Vector3();
    const mixA = new THREE.Color();
    const mixB = new THREE.Color();

    // 1. Generate particles for 14 major genre nebulae cores & dust clouds
    graphData.clusters.forEach((c, ci) => {
      const core = graphData.byId[`${c.id}-core`];
      if (!core) return;
      const R = c.spiral ? 78 : 62;

      span(core.idx, () => {
        const nd = Math.round(560 * Q);
        for (let i = 0; i < nd; i++) {
          const outer = Math.random() < 0.42;
          const arm = Math.random() < 0.55;
          let r: number, dirA: number;
          if (outer && arm) {
            const t = Math.random();
            r = R * (0.45 + t * 0.65);
            dirA = t * 3.6 + ci * 1.3;
          } else {
            r = Math.abs(gauss()) * (outer ? R : R * 0.42);
            dirA = Math.random() * Math.PI * 2;
          }
          const yv = gauss() * (outer ? R * 0.4 : R * 0.3);
          V.set(Math.cos(dirA) * r, yv, Math.sin(dirA) * r).add(core.pos);
          const rr = Math.abs(r) / (R * 1.1);
          const big = Math.random() < 0.08, mid2 = Math.random() < 0.32;
          const s = big ? 6 + Math.random() * 3 : (mid2 ? 3 + Math.random() * 2 : 1.6 + Math.random() * 1.1);
          const b = big ? 0.16 : (mid2 ? 0.34 : 0.6);
          const tc = tint(c.color, clamp(1 - rr * 0.9, 0.1, 0.85), b, (Math.random() - 0.5) * 0.07);
          push(V.x, V.y, V.z, tc[0], tc[1], tc[2], s, Math.random() * 100, core.year, 0, core.idx, ci);
        }

        // Central bright stellar core
        push(core.pos.x, core.pos.y, core.pos.z, 1, 0.98, 0.9, 24, Math.random() * 100, core.year, 0, core.idx, ci, 1);
        
        // Inner crown flares
        for (let k = 0; k < 4; k++) {
          W.set(gauss(), gauss(), gauss()).multiplyScalar(6).add(core.pos);
          const tc2 = tint(c.color, 0.7, 1.4, 0);
          push(W.x, W.y, W.z, tc2[0], tc2[1], tc2[2], 6 + Math.random() * 5, Math.random() * 100, core.year, 0, core.idx, ci, 1);
        }
        for (let k = 0; k < 3; k++) {
          W.set(gauss(), gauss(), gauss()).multiplyScalar(15).add(core.pos);
          const th = tint(c.color, 0.12, 0.085, (Math.random() - 0.5) * 0.06);
          push(W.x, W.y, W.z, th[0], th[1], th[2], 62 + Math.random() * 42, Math.random() * 100, core.year, 0, core.idx, ci);
        }

        // Spiral arms if defined
        if (c.spiral) {
          const eu = new THREE.Euler(c.spiral[0], c.spiral[1], c.spiral[2]);
          const nd2 = Math.round(750 * Q);
          for (let i = 0; i < nd2; i++) {
            const t2 = Math.random();
            const arm2 = i % 2;
            const jit = gauss() * 0.28;
            const ang = arm2 * Math.PI + t2 * 4.4 * Math.PI + jit * 3;
            const rad = 16 + t2 * 82 + gauss() * 5;
            V.set(Math.cos(ang) * rad, gauss() * (2 + t2 * 3), Math.sin(ang) * rad).applyEuler(eu).add(core.pos);
            const tc3 = tint(c.color, clamp(0.9 - t2 * 0.75, 0, 0.9), 0.42 - t2 * 0.12, jit * 0.5);
            push(V.x, V.y, V.z, tc3[0], tc3[1], tc3[2], 1.3 + Math.random() * 1.4, Math.random() * 100, core.year, 0, core.idx, ci);
          }
        }
      });
    });

    // 2. Generate particles for 159 subgenre stars
    graphData.nodes.forEach((n) => {
      if (n.type !== "sub") return;
      const ci = graphData.clusters.findIndex((cl) => cl.id === n.cluster);
      const c = graphData.clusters[ci] || graphData.clusters[0];
      const mag = n.children.length + 1;

      span(n.idx, () => {
        // Hero Star Node with Cross Flare
        push(n.pos.x, n.pos.y, n.pos.z, 1, 1, 1, 10, Math.random() * 100, n.year, 0, n.idx, ci, 1);
        
        // Surrounding subgenre star dust
        const nd = Math.round((60 + mag * 16) * Q);
        for (let i = 0; i < nd; i++) {
          V.set(gauss(), gauss(), gauss()).multiplyScalar(9 + mag * 2.2).add(n.pos);
          const rr = Math.random();
          const tc = tint(c.color, clamp(1 - rr, 0.15, 0.8), 0.55, (Math.random() - 0.5) * 0.08);
          push(V.x, V.y, V.z, tc[0], tc[1], tc[2], 1.2 + Math.random() * 1.5, Math.random() * 100, n.year, 0, n.idx, ci);
        }
      });
    });

    // 3. Origin Singularity particles
    const originNode = graphData.byId["origin"];
    span(originNode.idx, () => {
      push(0, 0, 0, 1, 0.92, 0.72, 18, 0, 0, 0, originNode.idx, -1, 1);
      for (let i = 0; i < Math.round(70 * Q); i++) {
        V.set(gauss(), gauss(), gauss()).multiplyScalar(20);
        const tc = tint(0xD8B988, 0.4, 0.5, (Math.random() - 0.5) * 0.06);
        push(V.x, V.y, V.z, tc[0], tc[1], tc[2], 1.4 + Math.random() * 1.8, Math.random() * 100, 0, 0, originNode.idx, -1);
      }
      for (let k = 0; k < 5; k++) {
        push(gauss() * 30, gauss() * 30, gauss() * 30, 0.35, 0.3, 0.22, 34, Math.random() * 100, 0, 0, originNode.idx, -1);
      }
    });

    // 4. Gravitational filaments static dust & animated flowing pulse packets
    graphData.edges.forEach((e) => {
      const fromCluster = graphData.clusters.find((cl) => cl.id === e.from.cluster);
      const toCluster = graphData.clusters.find((cl) => cl.id === e.to.cluster);
      const cf = fromCluster ? fromCluster.color : 0xD8B988;
      const ct = toCluster ? toCluster.color : 0xD8B988;
      const target = e.to;
      const clI = toCluster ? graphData.clusters.indexOf(toCluster) : -1;
      const bright = e.note ? 1.25 : e.kind === "inner" ? 0.66 : 0.9;
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
            e.kind === "inner" ? 1.4 + Math.random() * 0.8 : 2.2 + Math.random() * 1.4,
            Math.random() * 100, bornAttr, t, target.idx, clI
          );
        }
      });

      // Flowing packets
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

    // 5. Deep space background stars & cosmic dust
    const heroCols = [
      [0.85, 0.92, 1.0],
      [1.0, 0.94, 0.8],
      [1.0, 0.86, 0.84],
      [0.82, 0.95, 1.0],
    ];
    const nb = Math.round(2000 * Q);
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

    // Distant background nebular fog
    const fogs = [
      [-560, -280, -360, 0.030, 0.042, 0.095],
      [640, 200, -460, 0.020, 0.062, 0.075],
      [240, 430, 520, 0.060, 0.032, 0.075],
      [-460, 380, 340, 0.022, 0.052, 0.072],
      [700, -360, 300, 0.052, 0.030, 0.065],
    ];
    fogs.forEach((f) => {
      for (let k = 0; k < 2; k++) {
        push(f[0] + gauss() * 90, f[1] + gauss() * 90, f[2] + gauss() * 90, f[3], f[4], f[5], 120 + Math.random() * 70, Math.random() * 100, 0, 0, -1, -1, 0);
      }
    });

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
      uScale: { value: 800 },
      uHoverNode: { value: -1 },
      uHoverCluster: { value: -1 },
      uSelectedCluster: { value: -1 },
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
    const orbit = { theta: 0.9, phi: 1.12, radius: 720, target: new THREE.Vector3() };
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
    };

    // Resize handler
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      uniforms.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(30)));
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    // Node raycast picker
    const pickNode = (mx: number, my: number) => {
      if (mx < 0 || my < 0) return null;
      let best: NebulaNode | null = null;
      let bd = 36;
      for (let i = 0; i < graphData.nodes.length; i++) {
        const n = graphData.nodes[i];
        if (uniforms.uYear.value < n.year) continue;
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
      th.lastInteract = performance.now();
      th.fly = null;
      th.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (th.pointers.size === 1) th.down = { x: e.clientX, y: e.clientY, moved: false };
      if (th.pointers.size === 2) {
        const arr = Array.from(th.pointers.values());
        th.pinch = { d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y), r: th.orbit.radius };
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    };

    const handlePointerMove = (e: PointerEvent) => {
      const th = threeRef.current;
      if (!th) return;
      th.lastInteract = performance.now();
      if (th.pointers.has(e.pointerId)) {
        const prev = th.pointers.get(e.pointerId)!;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        th.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (th.pinch && th.pointers.size === 2) {
          const arr = Array.from(th.pointers.values());
          const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
          th.orbit.radius = clamp((th.pinch.r * th.pinch.d) / Math.max(d, 20), 80, 1600);
          th.mx = e.clientX;
          th.my = e.clientY;
          return;
        }
        if (th.down) {
          if (Math.hypot(e.clientX - th.down.x, e.clientY - th.down.y) > 6) th.down.moved = true;
          const k = 0.0042 * (th.orbit.radius / 600 + 0.4);
          th.orbit.theta += dx * k;
          th.orbit.phi = clamp(th.orbit.phi - dy * k, 0.2, Math.PI - 0.2);
          th.vel.t = dx * k * 0.4;
          th.vel.p = -dy * k * 0.4;
        }
      }
      th.mx = e.clientX;
      th.my = e.clientY;

      // Hover detection
      const hovered = pickNode(e.clientX, e.clientY);
      setHoveredNode(hovered);
      th.uniforms.uHoverNode.value = hovered ? hovered.idx : -1;
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
      th.orbit.radius = clamp(th.orbit.radius * (1 + e.deltaY * 0.0011), 80, 1600);
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

    const renderLoop = (now: number) => {
      const th = threeRef.current;
      if (!th) return;
      th.animId = requestAnimationFrame(renderLoop);

      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const time = now / 1000;

      // Timeline automated replay
      if (yearPlayRef.current) {
        yearPlayRef.current.t += dt * 1000;
        const p = clamp(yearPlayRef.current.t / yearPlayRef.current.dur, 0, 1);
        const y = lerp(yearPlayRef.current.from, yearPlayRef.current.to, smooth(p));
        setCurrentYear(Math.round(y));
        th.uniforms.uYear.value = y;
        if (p >= 1) {
          yearPlayRef.current = null;
          setIsPlayingYear(false);
        }
      }

      // Camera motion update
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
        // Idle drifting rotation
        if (performance.now() - th.lastInteract > 4000) {
          th.idleRamp = Math.min(th.idleRamp + dt / 3, 1);
          th.orbit.theta += dt * 0.024 * th.idleRamp;
        } else {
          th.idleRamp = 0;
        }
      }

      th.camera.position.set(
        th.orbit.target.x + th.orbit.radius * Math.sin(th.orbit.phi) * Math.cos(th.orbit.theta),
        th.orbit.target.y + th.orbit.radius * Math.cos(th.orbit.phi),
        th.orbit.target.z + th.orbit.radius * Math.sin(th.orbit.phi) * Math.sin(th.orbit.theta)
      );
      th.camera.lookAt(th.orbit.target);
      th.camera.updateMatrixWorld();

      // Flowing edge pulse packets
      for (let e = 0; e < graphData.edges.length; e++) {
        const ed = graphData.edges[e];
        ed.clock += dt * ed.speed;
        const head = ed.flowIdx;
        for (let k = 0; k < head.length; k++) {
          const ph = (ed.phase[k] + ed.clock) % 1;
          for (let tail = 0; tail < 3; tail++) {
            const t = (((ph - tail * 0.033) % 1) + 1) % 1;
            samplePt(ed.pts, t, flowTmp);
            const idx = (head[k] + tail) * 3;
            posArr[idx] = flowTmp.x;
            posArr[idx + 1] = flowTmp.y;
            posArr[idx + 2] = flowTmp.z;
          }
        }
      }
      geo.attributes.position.needsUpdate = true;

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

      // Update 3D projected HTML labels
      const labelsBox = labelsContainerRef.current;
      if (labelsBox) {
        const selCluster = selectedClusterRef.current;
        const w = window.innerWidth;
        const h = window.innerHeight;

        // 1. Cluster overview labels (visible when in overview mode)
        const coreEls = labelsBox.querySelectorAll<HTMLElement>(".nlab-core");
        coreEls.forEach((el) => {
          const coreId = el.dataset.coreId;
          const node = coreId ? graphData.byId[coreId] : null;
          if (!node || selCluster) {
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
          el.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y - 28}px)`;
        });

        // 2. Subgenre 3D labels (visible when a major cluster is selected)
        const subEls = labelsBox.querySelectorAll<HTMLElement>(".nlab-sub");
        subEls.forEach((el) => {
          const subId = el.dataset.subId;
          const node = subId ? graphData.byId[subId] : null;
          if (!node || !selCluster || node.cluster !== selCluster.id) {
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
          const isAct = curSel?.id === node.id;
          el.style.opacity = vis ? (isAct ? "1" : "0.88") : "0";
          el.style.pointerEvents = vis ? "auto" : "none";
          el.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y - 16}px)`;
        });

        // 3. Pin target anchor
        const pinEl = pinRef.current;
        if (pinEl) {
          if (curSel) {
            const s = project(curSel.pos);
            if (s) {
              pinEl.style.display = "block";
              pinEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
            } else {
              pinEl.style.display = "none";
            }
          } else {
            pinEl.style.display = "none";
          }
        }

        // 4. Hover tag tooltip
        const tagEl = tagRef.current;
        const curHover = hoveredNodeRef.current;
        if (tagEl) {
          if (curHover && (!curSel || curSel.id !== curHover.id)) {
            const s = project(curHover.pos);
            if (s) {
              tagEl.style.display = "block";
              tagEl.style.transform = `translate(${s.x + 16}px, ${s.y - 20}px)`;
            } else {
              tagEl.style.display = "none";
            }
          } else {
            tagEl.style.display = "none";
          }
        }
      }

      th.uniforms.uTime.value = time;
      renderer.render(scene, camera);
    };

    threeRef.current.animId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("resize", handleResize);
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

  // Timeline year scrubber
  const handleTimelineChange = (year: number) => {
    setCurrentYear(year);
    if (threeRef.current) {
      threeRef.current.uniforms.uYear.value = year;
    }
  };

  const handleToggleReplay = () => {
    if (isPlayingYear) {
      yearPlayRef.current = null;
      setIsPlayingYear(false);
    } else {
      const from = currentYear < Y_MAX - 5 ? currentYear : Y_MIN;
      yearPlayRef.current = { from, to: Y_MAX, t: 0, dur: 7000 };
      setIsPlayingYear(true);
      flyTo(new THREE.Vector3(0, 0, 0), 720, 2.2);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-[#04060a] select-none text-[#eae6dc]">
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* 3D Projected Screen Labels Container */}
      <div ref={labelsContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {/* Major Clusters Overview Labels */}
        {!selectedCluster && graphData.clusters.map((c) => {
          const core = graphData.byId[`${c.id}-core`];
          if (!core) return null;
          return (
            <div
              key={c.id}
              data-core-id={core.id}
              onClick={(e) => {
                e.stopPropagation();
                selectMajorCluster(c);
              }}
              className="nlab-core absolute transition-opacity duration-300 pointer-events-auto cursor-pointer text-center group"
            >
              <b className="block font-light text-xs sm:text-[13px] tracking-[0.32em] text-[#eae6dc]/80 group-hover:text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] transition-colors">
                {c.name}
              </b>
              <em className="block not-italic font-['Cormorant_Garamond'] text-[8.5px] tracking-[0.4em] text-[#d8b988]/80 group-hover:text-[#f5b73d] transition-colors">
                {c.en}
              </em>
            </div>
          );
        })}

        {/* Selected Cluster: 3D Floating Subgenre Constellation Badges */}
        {selectedCluster && clusterSubgenres.map((sub) => {
          const isCurrentActive = selectedNode?.id === sub.id;
          return (
            <div
              key={sub.id}
              data-sub-id={sub.id}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(sub, true);
              }}
              className={`nlab-sub absolute transition-all duration-200 pointer-events-auto cursor-pointer group ${
                isCurrentActive ? "scale-110 z-20" : "hover:scale-105 z-10"
              }`}
            >
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full backdrop-blur-md shadow-lg transition-all ${
                  isCurrentActive
                    ? "bg-[#181d28]/95 border border-[#f5b73d] text-white shadow-[0_0_15px_rgba(245,183,61,0.4)]"
                    : "bg-[#090c14]/80 border border-[#eae6dc]/15 text-[#eae6dc]/85 group-hover:bg-[#121622]/90 group-hover:border-[#d8b988]/60 group-hover:text-white"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: selectedCluster.hexColor, boxShadow: `0 0 6px ${selectedCluster.hexColor}` }}
                />
                <span className="text-[11px] font-medium tracking-wide whitespace-nowrap">
                  {sub.name}
                </span>
                {sub.year > 0 && (
                  <span className="text-[9px] font-mono opacity-60 font-light">
                    {sub.year}
                  </span>
                )}
              </div>
            </div>
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
                <span className="text-[9.5px] font-mono text-[#8b8f99]">{hoveredNode.bpm} BPM</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Radial Vignette Veil */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_42%,transparent_52%,rgba(2,3,6,0.6)_100%)]" />

      {/* Top Left: Masthead */}
      <div className="absolute top-6 left-6 z-20 pointer-events-auto flex items-start gap-4">
        <div className="hidden sm:flex flex-col gap-1 border-r border-[#eae6dc]/15 pr-3 text-[10px] font-light tracking-[0.35em] text-[#eae6dc]/55 uppercase">
          <span>声音的创世星图</span>
          <span className="font-['Cormorant_Garamond'] tracking-[0.25em]">GENESIS ATLAS OF SOUND</span>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-light tracking-[0.25em] text-[#eae6dc] drop-shadow-[0_0_20px_rgba(216,185,136,0.35)] m-0 font-['Noto_Serif_SC']">
            曲风星谱
          </h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#eae6dc]/60">
            <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#d8b988]">
              <Sparkles className="w-3 h-3" />
              14 大星云 · 159 子曲风
            </span>
            {selectedCluster && (
              <>
                <span className="text-[#eae6dc]/30">/</span>
                <span className="text-xs font-bold text-[#f5b73d] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedCluster.hexColor }} />
                  {selectedCluster.name}星云 ({clusterSubgenres.length} 个子曲风)
                </span>
                <button
                  onClick={() => selectMajorCluster(null)}
                  className="px-2 py-0.5 rounded bg-[#17181c] hover:bg-[#23262d] border border-[#2b2e38] text-[10px] text-[#eae6dc]/80 hover:text-white transition-colors"
                >
                  返回全景 ✕
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Top Center: Major Genre Capsule Switcher Rail */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[92vw] overflow-x-auto no-scrollbar flex items-center gap-1.5 bg-[#0a0d14]/85 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-[#eae6dc]/15 shadow-2xl">
        <button
          onClick={() => selectMajorCluster(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
            !selectedCluster
              ? "bg-[#d8b988] text-[#0a0d14] font-bold shadow-[0_0_12px_rgba(216,185,136,0.5)]"
              : "text-[#eae6dc]/70 hover:text-white hover:bg-white/5"
          }`}
        >
          全景星图
        </button>
        {graphData.clusters.map((c) => {
          const isSelected = selectedCluster?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => selectMajorCluster(c)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all whitespace-nowrap ${
                isSelected
                  ? "text-black font-bold shadow-lg scale-105"
                  : "text-[#eae6dc]/75 hover:text-white hover:bg-white/10"
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
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Top Right: Era Timeline (纪元 1850 - 2025) */}
      <div className="absolute top-6 right-6 z-20 pointer-events-auto flex flex-col items-end text-right">
        <div className="text-3xl sm:text-4xl font-medium font-['Cormorant_Garamond'] tabular-nums text-[#eae6dc] drop-shadow-[0_0_24px_rgba(216,185,136,0.35)] leading-none">
          {currentYear}
        </div>
        <div className="text-[10px] tracking-[0.4em] text-[#eae6dc]/50 mt-1 uppercase">
          纪元 · ERA
        </div>
        <div className="w-48 sm:w-56 mt-2 relative py-1 cursor-pointer">
          <input
            type="range"
            min={Y_MIN}
            max={Y_MAX}
            value={currentYear}
            onChange={(e) => handleTimelineChange(+e.target.value)}
            className="w-full h-1 accent-[#d8b988] bg-[#eae6dc]/20 rounded cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-[#eae6dc]/50">
          <span className="text-[9.5px] tracking-wider">拖动回看演化</span>
          <button
            onClick={handleToggleReplay}
            className={`w-7 h-7 rounded-full border border-[#eae6dc]/20 flex items-center justify-center transition-colors ${
              isPlayingYear ? "text-[#d8b988] border-[#d8b988] shadow-[0_0_10px_rgba(216,185,136,0.4)]" : "hover:text-[#d8b988] hover:border-[#d8b988]"
            }`}
            title="重播星谱演化"
          >
            {isPlayingYear ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Left Bottom: Major Clusters Legend (Overview Mode) */}
      {!selectedCluster && (
        <div className="absolute bottom-8 left-6 z-20 pointer-events-auto hidden md:flex flex-col gap-1 bg-[#05070c]/70 backdrop-blur-md p-3.5 rounded-xl border border-[#eae6dc]/15 shadow-2xl max-h-[48vh] overflow-y-auto no-scrollbar">
          <div className="text-[10px] tracking-[0.4em] text-[#eae6dc]/45 uppercase pb-1 border-b border-[#eae6dc]/10 mb-1">
            星云 · NEBULAE
          </div>
          {graphData.clusters.map((c) => (
            <div
              key={c.id}
              onClick={() => selectMajorCluster(c)}
              className="flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer transition-all text-[#eae6dc]/70 hover:text-white hover:bg-white/5"
            >
              <span
                className="w-2 h-2 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: c.hexColor, boxShadow: `0 0 8px ${c.hexColor}` }}
              />
              <span className="text-xs">{c.name}</span>
              <span className="text-[9px] font-['Cormorant_Garamond'] tracking-wider opacity-60 ml-auto">
                {c.en}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Center: Operational Hint */}
      {!selectedCluster && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center text-xs text-[#eae6dc]/50 tracking-[0.2em] font-light hidden lg:block bg-[#05070c]/60 px-4 py-1.5 rounded-full border border-[#eae6dc]/10 backdrop-blur-sm">
          <b>拖拽</b> 旋转 · <b>滚轮</b> 缩放 · <b>点击星云/星体</b> 居中探索 · <b>纪元</b> 回看演化史
        </div>
      )}

      {/* Selected Major Cluster: Subgenre Constellation Showcase Panel (清晰美观呈现大曲风下的各种子曲风) */}
      {selectedCluster && (
        <div className="absolute bottom-6 inset-x-6 z-30 pointer-events-auto bg-[#080b12]/90 backdrop-blur-xl border border-[#2b2e38] rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3 max-h-[46vh] overflow-hidden animate-slide-up">
          {/* Panel Header */}
          <div className="flex items-center justify-between gap-4 border-b border-[#1f222a] pb-3">
            <div className="flex items-center gap-3">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0 shadow-[0_0_12px_var(--cc)]"
                style={{ backgroundColor: selectedCluster.hexColor, ["--cc" as any]: selectedCluster.hexColor }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white m-0 tracking-wide font-['Noto_Serif_SC']">
                    {selectedCluster.name}星云 · {selectedCluster.en}
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-[#17181f] border border-[#2a2d38] font-['JetBrains_Mono'] text-xs font-semibold text-[#f5b73d]">
                    {clusterSubgenres.length} 个子曲风分支
                  </span>
                </div>
                <p className="text-xs text-[#8b8f99] mt-0.5 line-clamp-1 max-w-2xl">
                  {selectedCluster.desc[language]}
                </p>
              </div>
            </div>

            {/* Controls & Return */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Filter search in cluster */}
              <div className="relative hidden sm:block">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b8f99]" />
                <input
                  type="text"
                  placeholder="筛选子曲风..."
                  value={subgenreFilter}
                  onChange={(e) => setSubgenreFilter(e.target.value)}
                  className="w-36 lg:w-44 pl-8 pr-2.5 py-1 text-xs bg-[#12151e] border border-[#252834] rounded-lg text-white placeholder:text-[#5a5e6a] focus:outline-none focus:border-[#d8b988]"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex items-center bg-[#13161f] border border-[#232632] rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("rail")}
                  className={`p-1 rounded ${viewMode === "rail" ? "bg-[#252936] text-white" : "text-[#7a7e8a] hover:text-white"}`}
                  title="横向滑轨视图"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1 rounded ${viewMode === "grid" ? "bg-[#252936] text-white" : "text-[#7a7e8a] hover:text-white"}`}
                  title="网格矩阵视图"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => selectMajorCluster(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#15171e] hover:bg-[#20232c] border border-[#2b2e38] text-xs text-[#eae6dc] transition-colors"
                title="返回全景星图"
              >
                <RotateCcw className="w-3 h-3 text-[#d8b988]" />
                <span>返回全景</span>
              </button>
            </div>
          </div>

          {/* Subgenres Cards Showcase */}
          <div className="overflow-y-auto no-scrollbar max-h-[30vh]">
            <div
              className={
                viewMode === "rail"
                  ? "flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 min-w-max"
                  : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-1"
              }
            >
              {filteredSubgenres.map((sub) => {
                const isCurrentActive = selectedNode?.id === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => selectNode(sub, true)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      viewMode === "rail" ? "w-64 sm:w-72" : "w-full"
                    } ${
                      isCurrentActive
                        ? "bg-[#161a24] border-[#f5b73d] shadow-[0_0_16px_rgba(245,183,61,0.25)] scale-[1.01]"
                        : "bg-[#0d1017]/90 border-[#1f222a] hover:border-[#383c48] hover:bg-[#12151f]"
                    }`}
                  >
                    <div>
                      {/* Top badges */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: selectedCluster.hexColor }}
                          />
                          <span className="text-[10px] font-mono text-[#8b8f99]">
                            {sub.genre?.origin_place ? sub.genre.origin_place[language] : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-['JetBrains_Mono'] text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-[#16181f] text-[#f5b73d] font-bold">
                            {sub.year > 0 ? sub.year : "ROOT"}
                          </span>
                          {sub.bpm && (
                            <span className="px-1.5 py-0.5 rounded bg-[#16181f] text-[#8b8f99]">
                              {sub.bpm} BPM
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-white tracking-wide truncate">
                        {sub.name}
                      </h3>
                      <div className="text-[11px] text-[#8b8f99] truncate font-['Noto_Serif_SC']">
                        {sub.zhName !== sub.name ? sub.zhName : sub.en}
                      </div>

                      {/* Key snippet */}
                      <p className="text-[11px] text-[#a0a5b2] line-clamp-2 mt-1.5 leading-relaxed">
                        {sub.desc[language] || sub.artists}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[#1a1c24]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectNode(sub, true);
                        }}
                        className="text-[10px] font-medium text-[#d8b988] hover:underline flex items-center gap-0.5"
                      >
                        <Compass className="w-3 h-3" />
                        聚焦星体
                      </button>

                      <div className="flex items-center gap-1.5">
                        {sub.genre && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStudio(sub.genre!);
                            }}
                            className="px-2 py-1 rounded bg-[#1a1d26] hover:bg-[#252a36] text-[#45e0c9] hover:text-white border border-[#2b303d] text-[10px] font-semibold transition-colors flex items-center gap-1"
                            title="在 Studio 编曲机中试听与编辑"
                          >
                            <Music className="w-2.5 h-2.5" />
                            试听
                          </button>
                        )}
                        {sub.genre && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectGenre(sub.genre!);
                            }}
                            className="px-2 py-1 rounded bg-[#1a1d26] hover:bg-[#252a36] text-[#e9e7e0] border border-[#2b303d] text-[10px] transition-colors flex items-center gap-0.5"
                            title="查看曲风详细百科"
                          >
                            详情 →
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
              className="absolute top-5 right-5 w-8 h-8 rounded-full border border-[#2e323e] hover:border-[#d8b988] text-[#8b8f99] hover:text-[#d8b988] flex items-center justify-center transition-colors"
              title="关闭详情面板"
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
              <span className="text-xs tracking-[0.2em] font-light text-[#8b8f99] uppercase">
                {selectedNode.type === "origin"
                  ? "奇点 · 万物之源"
                  : `${graphData.clusters.find((c) => c.id === selectedNode.cluster)?.name || "电子"}星云分支`}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-2xl sm:text-3xl font-normal tracking-wide text-white m-0 font-['Noto_Serif_SC'] drop-shadow-[0_0_20px_rgba(216,185,136,0.25)]">
              {selectedNode.name}
            </h2>
            <div className="font-['Cormorant_Garamond'] text-sm tracking-[0.25em] text-[#d8b988] mt-1 mb-3">
              {selectedNode.en}
            </div>

            {/* Year & Place */}
            <div className="flex items-center gap-2 text-xs text-[#8b8f99] mb-4 pb-3 border-b border-[#1f222a]">
              <span>诞生年代: {selectedNode.year > 0 ? `${selectedNode.year} 年` : "太初 · 有录音之前"}</span>
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
                  <span className="block text-[9.5px] tracking-[0.3em] text-[#5a5e68] uppercase mb-2">
                    传承谱系 · LINEAGE
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#eae6dc]">
                    {parents.map((par) => (
                      <React.Fragment key={par.id}>
                        <button
                          onClick={() => selectNode(par, true)}
                          className="hover:text-[#d8b988] underline underline-offset-4 decoration-dashed transition-colors"
                        >
                          {par.name}
                        </button>
                        <span className="text-[#d8b988]/60 text-xs">⟶</span>
                      </React.Fragment>
                    ))}
                    <span className="font-bold text-[#f5b73d]">{selectedNode.name}</span>
                  </div>
                </div>
              );
            })()}

            {/* Sub-branches */}
            {selectedNode.children.length > 0 && (
              <div className="mb-5">
                <span className="block text-[9.5px] tracking-[0.3em] text-[#5a5e68] uppercase mb-2">
                  演化分支 · EVOLVES
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.children.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => selectNode(k, true)}
                      className="px-2.5 py-1 rounded bg-[#13161f] hover:bg-[#1f2330] border border-[#242735] hover:border-[#d8b988] text-xs text-[#eae6dc] transition-colors"
                    >
                      {k.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sound design & Chords */}
            {selectedNode.genre && (
              <div className="mb-5 p-3.5 rounded-xl bg-[#0a0d14] border border-[#1d2029] space-y-2">
                <div className="text-xs text-[#a0a5b2] leading-relaxed">
                  <span className="text-[#d8b988] font-semibold mr-1">声音设计:</span>
                  {selectedNode.genre.sound_design[language]}
                </div>
                {selectedNode.genre.common_chords.length > 0 && (
                  <div className="text-xs text-[#a0a5b2] leading-relaxed">
                    <span className="text-[#45e0c9] font-semibold mr-1">经典和弦:</span>
                    <code className="font-mono text-[#f5b73d]">{selectedNode.genre.common_chords.join(" → ")}</code>
                  </div>
                )}
              </div>
            )}

            {/* Representative tracks */}
            {selectedNode.genre?.representative_tracks && selectedNode.genre.representative_tracks.length > 0 && (
              <div className="mb-5">
                <span className="block text-[9.5px] tracking-[0.3em] text-[#5a5e68] uppercase mb-2">
                  代表引力 · ARTISTS & TRACKS
                </span>
                <div className="space-y-1.5">
                  {selectedNode.genre.representative_tracks.slice(0, 4).map((t, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-[#171920]">
                      <span className="text-white truncate max-w-[240px]">
                        {t.title} · <span className="text-[#8b8f99]">{t.artist}</span>
                      </span>
                      <span className="font-mono text-[10px] text-[#5a5e68]">{t.year}</span>
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
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#f5b73d] hover:bg-[#e5a72d] text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,183,61,0.3)]"
              >
                <Music className="w-3.5 h-3.5" />
                <span>进入 Studio 编曲</span>
              </button>
            )}
            {selectedNode.genre && (
              <button
                onClick={() => onSelectGenre(selectedNode.genre!)}
                className="py-2.5 px-3 rounded-xl bg-[#171a24] hover:bg-[#222735] border border-[#2b3040] text-xs text-white flex items-center justify-center gap-1 transition-colors"
                title="查看该曲风的深度百科档案"
              >
                <span>完整档案</span>
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
