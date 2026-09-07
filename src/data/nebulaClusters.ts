import * as THREE from 'three';
import { Genre } from '../types/genre';
import { 
  ALL_GENRES, 
  GENRES_MAP,
  HOUSE_GENRES,
  TECHNO_GENRES,
  TRANCE_GENRES,
  DUBSTEP_GENRES,
  DNB_GENRES,
  UK_BASS_GENRES,
  TRAP_DRILL_GENRES,
  FUTURE_DOWNTEMPO_GENRES,
  HARD_ELECTRO_GENRES,
  ROCK_METAL_GENRES,
  HIPHOP_GENRES,
  JAZZ_BLUES_GENRES,
  POP_RNB_GENRES,
  LATIN_WORLD_GENRES
} from './genres';
import { GENRE_RELATIONS } from './relations';

export interface MajorCluster {
  id: string;
  name: string;
  en: string;
  color: number;
  hexColor: string;
  anchor: [number, number, number];
  spiral?: [number, number, number];
  desc: { zh: string; en: string };
  genreIds: string[];
}

export interface NebulaNode {
  idx: number;
  id: string;
  name: string;
  zhName: string;
  en: string;
  type: 'origin' | 'core' | 'sub';
  cluster: string;
  parent: string | null;
  year: number;
  bpm?: number;
  desc: { zh: string; en: string };
  artists: string;
  children: NebulaNode[];
  depth: number;
  pos: THREE.Vector3;
  anchor: THREE.Vector3;
  genre?: Genre;
}

export interface NebulaEdge {
  i: number;
  from: NebulaNode;
  to: NebulaNode;
  kind: 'seed' | 'inner' | 'inter' | 'influence';
  note: string | null;
  born: number;
  pts: THREE.Vector3[];
  len: number;
  flowN: number;
  speed: number;
  phase: number[];
  clock: number;
  flowIdx: number[];
}

export const MAJOR_CLUSTERS: MajorCluster[] = [
  {
    id: 'house',
    name: '浩室',
    en: 'HOUSE',
    color: 0xE05A7A,
    hexColor: '#e05a7a',
    anchor: [-430, 90, -220],
    spiral: [-0.2, 0.45, -0.15],
    desc: {
      zh: '发源于芝加哥 The Warehouse 俱乐部，四四拍与反拍开镲构筑起现代舞曲的永动机。',
      en: 'Born in Chicago warehouses, the hypnotic four-on-the-floor beat powering global dance floors.'
    },
    genreIds: HOUSE_GENRES.map(g => g.id),
  },
  {
    id: 'techno',
    name: '铁克诺',
    en: 'TECHNO',
    color: 0x4AD8C8,
    hexColor: '#4ad8c8',
    anchor: [-500, 190, 180],
    spiral: [-0.55, 0.4, 0.1],
    desc: {
      zh: '底特律工业机器的钢铁灵魂，极简音序与深邃循环的科幻图景。',
      en: "Detroit's mechanical soul, minimal repetition, and futuristic soundscapes."
    },
    genreIds: TECHNO_GENRES.map(g => g.id),
  },
  {
    id: 'trance',
    name: '出神',
    en: 'TRANCE',
    color: 0x5C8DF6,
    hexColor: '#5c8df6',
    anchor: [-280, 430, -290],
    spiral: [0.35, -0.4, 0.25],
    desc: {
      zh: '欧洲派对的高潮律动，史诗般的和弦进行与潮汐般层叠的琶音。',
      en: 'Epic build-ups, emotional melodies, and soaring euphoric arpeggios.'
    },
    genreIds: TRANCE_GENRES.map(g => g.id),
  },
  {
    id: 'dubstep',
    name: '回响重拍',
    en: 'DUBSTEP',
    color: 0x9D7BE8,
    hexColor: '#9d7be8',
    anchor: [300, 340, 280],
    spiral: [-0.25, 0.35, 0.3],
    desc: {
      zh: '南伦敦黑夜里的重低音地震，半速下潜节拍与激变低频撕裂感。',
      en: "South London's sub-bass tremors, half-time beats, and devastating wobble bass."
    },
    genreIds: DUBSTEP_GENRES.map(g => g.id),
  },
  {
    id: 'dnb',
    name: '鼓打贝斯',
    en: 'DRUM & BASS',
    color: 0xF08A46,
    hexColor: '#f08a46',
    anchor: [-100, 470, 270],
    spiral: [-0.15, 0.5, 0.35],
    desc: {
      zh: '174 BPM 的超速心跳，复杂碎拍重组与亚低频的物理轰鸣。',
      en: 'High-octane 174 BPM breakbeats combined with heavy sub-bass pressure.'
    },
    genreIds: DNB_GENRES.map(g => g.id),
  },
  {
    id: 'uk_bass',
    name: '英伦低音',
    en: 'UK BASS & GARAGE',
    color: 0x4AC88A,
    hexColor: '#4ac88a',
    anchor: [60, 220, 530],
    spiral: [0.2, 0.35, -0.2],
    desc: {
      zh: '海盗电台与车库切分，2-Step、Grime 与低频游走的地下先锋。',
      en: 'Syncopated 2-Step swing, Grime grit, and dynamic UK underground low-end.'
    },
    genreIds: UK_BASS_GENRES.map(g => g.id),
  },
  {
    id: 'trap_drill',
    name: '陷阱与钻音',
    en: 'TRAP & DRILL',
    color: 0xE5A93C,
    hexColor: '#e5a93c',
    anchor: [370, -80, 420],
    desc: {
      zh: '亚特兰大与芝加哥寒夜，滚奏三连踩镲、滑音808与冷峻节拍。',
      en: 'Rolling hi-hat triplets, sliding 808 subs, and dark street narratives.'
    },
    genreIds: TRAP_DRILL_GENRES.map(g => g.id),
  },
  {
    id: 'future_downtempo',
    name: '未来与慢拍',
    en: 'FUTURE & DOWNTEMPO',
    color: 0xD47FA6,
    hexColor: '#d47fa6',
    anchor: [-240, -350, -370],
    spiral: [0.4, 0.3, -0.2],
    desc: {
      zh: '失重混响、摇摆切片与赛博梦境，从 Vaporwave、Lo-Fi 到 Future Bass 的诗意流动。',
      en: 'Sidechained lush supersaws, lo-fi textures, and ambient sonic voyages.'
    },
    genreIds: FUTURE_DOWNTEMPO_GENRES.map(g => g.id),
  },
  {
    id: 'hard_electro',
    name: '硬核与电波',
    en: 'HARD & ELECTRO',
    color: 0xE84855,
    hexColor: '#e84855',
    anchor: [-530, -210, -210],
    spiral: [-0.3, 0.2, 0.4],
    desc: {
      zh: '极限失真反向反弹音、失速硬舞与高压脉冲的冲击波。',
      en: 'Distorted kicks, high-BPM gabber, raw phonk, and electro breaks.'
    },
    genreIds: HARD_ELECTRO_GENRES.map(g => g.id),
  },
  {
    id: 'rock_metal',
    name: '摇滚与金属',
    en: 'ROCK & METAL',
    color: 0xD85A6A,
    hexColor: '#d85a6a',
    anchor: [80, -40, -540],
    spiral: [-0.35, -0.5, 0.2],
    desc: {
      zh: '通电吉他的狂怒轰鸣，半个世纪叛逆之声与壮丽旋臂。',
      en: 'Overdriven tube amplifiers, power chords, and the legendary saga of rebellion.'
    },
    genreIds: ROCK_METAL_GENRES.map(g => g.id),
  },
  {
    id: 'hiphop',
    name: '嘻哈',
    en: 'HIP-HOP',
    color: 0xE06A3C,
    hexColor: '#e06a3c',
    anchor: [190, -330, 240],
    spiral: [0.25, -0.3, 0.4],
    desc: {
      zh: '布朗克斯派对的两台黑胶唱机，采样重组、繁复押韵与街头编年史。',
      en: 'Two turntables, dusty vinyl breaks, urban storytelling, and timeless groove.'
    },
    genreIds: HIPHOP_GENRES.map(g => g.id),
  },
  {
    id: 'jazz_blues',
    name: '爵士与蓝调',
    en: 'JAZZ & BLUES',
    color: 0x6E8CD8,
    hexColor: '#6e8cd8',
    anchor: [-350, -130, 290],
    spiral: [-0.2, -0.4, 0.3],
    desc: {
      zh: '密西西比河与新奥尔良的即兴源流，近现代所有流行音乐的引力源泉。',
      en: 'The delta blues and street improvisations that seeded modern Western harmony.'
    },
    genreIds: JAZZ_BLUES_GENRES.map(g => g.id),
  },
  {
    id: 'pop_rnb',
    name: '流行与律动',
    en: 'POP & R&B',
    color: 0xD878AC,
    hexColor: '#d878ac',
    anchor: [450, 140, -300],
    spiral: [0.3, -0.35, 0.15],
    desc: {
      zh: '闪烁迪斯科球、灵魂放克与黄金旋律，触及亿万听众的感染力引擎。',
      en: 'Catchy hooks, dance-pop synth sheen, and silky vocal harmonies.'
    },
    genreIds: POP_RNB_GENRES.map(g => g.id),
  },
  {
    id: 'latin_world',
    name: '拉丁与世界',
    en: 'LATIN & WORLD',
    color: 0xAEC06A,
    hexColor: '#aec06a',
    anchor: [540, -190, 110],
    spiral: [-0.3, 0.4, -0.2],
    desc: {
      zh: '加勒比阳光、非洲复节奏与多米尼加切分，跨越海洋的原始跳动。',
      en: 'Polyrhythmic hand percussion, syncopated montunos, and irresistible island sway.'
    },
    genreIds: LATIN_WORLD_GENRES.map(g => g.id),
  },
];

export const CLUSTER_MAP: Record<string, MajorCluster> = MAJOR_CLUSTERS.reduce((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {} as Record<string, MajorCluster>);

export const GENRE_TO_CLUSTER: Record<string, MajorCluster> = {};
MAJOR_CLUSTERS.forEach(c => {
  c.genreIds.forEach(gid => {
    GENRE_TO_CLUSTER[gid] = c;
  });
});

function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const UPV = new THREE.Vector3(0, 1, 0);

export function buildNebulaGraph() {
  const nodes: NebulaNode[] = [];
  const byId: Record<string, NebulaNode> = {};

  // 1. Origin Singularity Node
  const originNode: NebulaNode = {
    idx: 0,
    id: 'origin',
    name: '音乐奇点',
    zhName: '音乐奇点',
    en: 'THE SINGULARITY',
    type: 'origin',
    cluster: 'origin',
    parent: null,
    year: 0,
    desc: {
      zh: '在留声机刻下第一道沟纹之前，音乐只是空气中的震颤与篝火旁的呐喊。所有星云，皆由这一点萌发。',
      en: 'Before recorded history, music was vibrations in air and rhythms around primeval campfires.'
    },
    artists: '人声 · 骨笛 · 皮面鼓',
    children: [],
    depth: 0,
    pos: new THREE.Vector3(0, 0, 0),
    anchor: new THREE.Vector3(0, 0, 0),
  };
  nodes.push(originNode);
  byId['origin'] = originNode;

  // 2. 14 Major Cluster Core Nodes
  MAJOR_CLUSTERS.forEach((c) => {
    const coreId = `${c.id}-core`;
    const coreNode: NebulaNode = {
      idx: nodes.length,
      id: coreId,
      name: `${c.name}母核`,
      zhName: `${c.name}母核`,
      en: `${c.en} CORE`,
      type: 'core',
      cluster: c.id,
      parent: 'origin',
      year: 1900,
      desc: c.desc,
      artists: c.name,
      children: [],
      depth: 1,
      pos: new THREE.Vector3(...c.anchor),
      anchor: new THREE.Vector3(...c.anchor),
    };
    nodes.push(coreNode);
    byId[coreId] = coreNode;
  });

  // 3. 159 Subgenre Nodes
  ALL_GENRES.forEach((genre) => {
    const cluster = GENRE_TO_CLUSTER[genre.id] || MAJOR_CLUSTERS[0];
    const yearVal = parseInt(genre.origin_year, 10) || genre.origin_decade || 1980;
    
    // Find parent: check if any parent_genres exists in database, or check GENRE_RELATIONS
    let parentId = `${cluster.id}-core`;
    if (genre.parent_genres && genre.parent_genres.length > 0) {
      for (const p of genre.parent_genres) {
        if (GENRES_MAP[p]) {
          parentId = p;
          break;
        }
      }
    }
    
    const zhAlias = genre.aliases && genre.aliases.length > 0 ? genre.aliases[0] : genre.name;
    const artistsStr = genre.representative_tracks
      ? genre.representative_tracks.slice(0, 3).map(t => `${t.artist} - ${t.title}`).join(' · ')
      : '';

    const subNode: NebulaNode = {
      idx: nodes.length,
      id: genre.id,
      name: genre.name,
      zhName: zhAlias,
      en: genre.name,
      type: 'sub',
      cluster: cluster.id,
      parent: parentId,
      year: yearVal,
      bpm: genre.default_bpm,
      desc: {
        zh: genre.cultural_context?.zh || genre.key_characteristics?.zh || '',
        en: genre.cultural_context?.en || genre.key_characteristics?.en || ''
      },
      artists: artistsStr,
      children: [],
      depth: 2,
      pos: new THREE.Vector3(),
      anchor: new THREE.Vector3(...cluster.anchor),
      genre: genre,
    };
    nodes.push(subNode);
    byId[genre.id] = subNode;
  });

  // Link children
  nodes.forEach(n => {
    if (n.parent && byId[n.parent]) {
      byId[n.parent].children.push(n);
    }
  });

  // Set depth recursively
  function setDepth(n: NebulaNode, d: number) {
    n.depth = d;
    n.children.forEach(c => setDepth(c, d + 1));
  }
  setDepth(originNode, 0);

  // 4. Force-directed spatial layout
  const GA = 2.39996;
  const clusterItemCount: Record<string, number> = {};

  nodes.forEach(n => {
    if (n.type === 'origin') {
      n.pos.set(0, 0, 0);
      return;
    }
    if (n.type === 'core') {
      n.pos.copy(n.anchor);
      return;
    }
    const c = n.cluster;
    clusterItemCount[c] = (clusterItemCount[c] || 0) + 1;
    const itemIdx = clusterItemCount[c];
    const cIdx = MAJOR_CLUSTERS.findIndex(cl => cl.id === c);
    
    const angle = itemIdx * GA + (cIdx * 1.5);
    const rad = 45 + (itemIdx % 5) * 18 + n.depth * 8;
    
    n.pos.copy(n.anchor);
    n.pos.x += Math.cos(angle) * rad + gauss() * 16;
    n.pos.y += Math.sin(angle * 1.4 + cIdx) * rad * 0.45 + gauss() * 16;
    n.pos.z += Math.sin(angle) * rad + gauss() * 16;
  });

  // Relaxation passes
  const F = nodes.map(() => new THREE.Vector3());
  for (let it = 0; it < 120; it++) {
    F.forEach(v => v.set(0, 0, 0));
    
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dz = b.pos.z - a.pos.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 350) d2 = 350;
        if (d2 > 16000) continue;
        const f = 7500 / d2;
        const inv = 1 / Math.sqrt(d2);
        F[i].x -= dx * inv * f; F[i].y -= dy * inv * f; F[i].z -= dz * inv * f;
        F[j].x += dx * inv * f; F[j].y += dy * inv * f; F[j].z += dz * inv * f;
      }
    }

    // Spring to parent & anchor
    nodes.forEach(n => {
      if (n.type === 'origin') return;
      const p = n.parent && byId[n.parent] ? byId[n.parent] : null;
      if (p) {
        const cross = (p.cluster !== n.cluster) || (p.type === 'origin');
        const rest = p.type === 'origin' ? 440 : (cross ? 480 : 60 + n.depth * 10);
        const k = p.type === 'origin' ? 0.0012 : (cross ? 0.002 : 0.035);
        const d = n.pos.distanceTo(p.pos);
        const f = (d - rest) * k;
        const dir = n.pos.clone().sub(p.pos).normalize();
        F[n.idx].addScaledVector(dir, -f);
      }
      if (n.type === 'core') {
        F[n.idx].addScaledVector(n.pos.clone().sub(n.anchor), -n.pos.distanceTo(n.anchor) * 0.08);
      } else {
        const core = byId[`${n.cluster}-core`];
        if (core) {
          F[n.idx].addScaledVector(n.pos.clone().sub(core.pos), -(n.pos.distanceTo(core.pos) - 95) * 0.004);
        }
      }
    });

    nodes.forEach(n => {
      if (n.type === 'origin') return;
      n.pos.addScaledVector(F[n.idx], 0.4);
      if (n.type !== 'core') {
        const core = byId[`${n.cluster}-core`];
        if (core) {
          const d = n.pos.distanceTo(core.pos);
          if (d > 185) {
            n.pos.copy(core.pos).lerp(n.pos, 185 / d);
          }
        }
      }
    });
  }

  // 5. Gravitational filaments (Edges)
  const edges: NebulaEdge[] = [];
  
  // A. Core seeds from origin
  MAJOR_CLUSTERS.forEach(c => {
    const core = byId[`${c.id}-core`];
    if (core) {
      edges.push({
        i: edges.length,
        from: originNode,
        to: core,
        kind: 'seed',
        note: `${c.name}星云诞生`,
        born: 1900,
        pts: [],
        len: 0,
        flowN: 4,
        speed: 0.1,
        phase: [],
        clock: 0,
        flowIdx: [],
      });
    }
  });

  // B. Subgenre parent linkages
  nodes.forEach(n => {
    if (n.type !== 'sub' || !n.parent || !byId[n.parent]) return;
    const p = byId[n.parent];
    const isSameCluster = p.cluster === n.cluster;
    edges.push({
      i: edges.length,
      from: p,
      to: n,
      kind: isSameCluster ? 'inner' : 'inter',
      note: null,
      born: n.year,
      pts: [],
      len: 0,
      flowN: isSameCluster ? 6 : 9,
      speed: 0.12,
      phase: [],
      clock: 0,
      flowIdx: [],
    });
  });

  // C. Relations linkages from GENRE_RELATIONS
  GENRE_RELATIONS.forEach(rel => {
    const from = byId[rel.source];
    const to = byId[rel.target];
    if (from && to && from !== to) {
      // Avoid duplicate parallel edge if already added
      const already = edges.some(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
      if (!already) {
        edges.push({
          i: edges.length,
          from,
          to,
          kind: 'influence',
          note: rel.description?.zh || rel.description?.en || null,
          born: Math.max(from.year, to.year) + 2,
          pts: [],
          len: 0,
          flowN: 8,
          speed: 0.14,
          phase: [],
          clock: 0,
          flowIdx: [],
        });
      }
    }
  });

  // Compute curved Bezier spline points
  edges.forEach((e, i) => {
    e.i = i;
    const a = e.from.pos;
    const b = e.to.pos;
    const dir = b.clone().sub(a);
    const len = dir.length();
    let perp = new THREE.Vector3().crossVectors(dir, UPV);
    if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
    perp.normalize();
    const side = (i % 2) ? 1 : -1;
    const amt = e.kind === 'inner' ? 8 + len * 0.04 : (e.kind === 'seed' ? 18 : 22 + len * 0.09);
    
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.addScaledVector(perp, amt * side);
    mid.addScaledVector(UPV, amt * 0.2 * side);
    
    const seg = e.kind === 'inner' ? clamp(Math.round(len / 7), 14, 38) : clamp(Math.round(len / 6), 20, 52);
    e.pts = [];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const u = 1 - t;
      e.pts.push(new THREE.Vector3(
        u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
        u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
        u * u * a.z + 2 * u * t * mid.z + t * t * b.z
      ));
    }
    e.len = len;
    e.speed = (e.kind === 'inner' ? 14 : (e.kind === 'seed' ? 8 : 22)) / Math.max(len, 30);
    e.phase = [];
    e.clock = 0;
    for (let k = 0; k < e.flowN; k++) {
      e.phase.push(Math.random());
    }
  });

  return {
    clusters: MAJOR_CLUSTERS,
    clusterMap: CLUSTER_MAP,
    nodes,
    byId,
    edges,
  };
}

export function samplePt(pts: THREE.Vector3[], t: number, out: THREE.Vector3): THREE.Vector3 {
  const f = clamp(t, 0, 1) * (pts.length - 1);
  const i = Math.min(Math.floor(f), pts.length - 2);
  const r = f - i;
  const a = pts[i];
  const b = pts[i + 1];
  out.set(a.x + (b.x - a.x) * r, a.y + (b.y - a.y) * r, a.z + (b.z - a.z) * r);
  return out;
}
