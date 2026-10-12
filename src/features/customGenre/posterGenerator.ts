import QRCode from "qrcode";
import { CustomGenre, RADAR_KEYS_ORDER } from "../../types/customGenre";
import { GenreRadarMetrics } from "../../types/genre";

export interface PosterOptions {
  genre: CustomGenre;
  shareUrl: string;
  width?: number;
  height?: number;
  isZh?: boolean;
}

const AXIS_LABELS: Record<keyof GenreRadarMetrics, { zh: string; en: string }> = {
  groove: { zh: "律动", en: "Groove" },
  brightness: { zh: "明亮", en: "Brightness" },
  harmonicComplexity: { zh: "和声", en: "Harmonics" },
  rhythmDensity: { zh: "密度", en: "Density" },
  bassEnergy: { zh: "低频", en: "Bass" },
  melodicFocus: { zh: "旋律", en: "Melodic" },
};

const TRACK_COLORS: Record<string, string> = {
  kick: "#f59e0b",
  snare: "#22d3ee",
  hihat: "#facc15",
  percussion: "#34d399",
  bass: "#a855f7",
  chords: "#6366f1",
  lead: "#ec4899",
  fx: "#38bdf8",
};

/**
 * Draws an ultra-high resolution poster card onto a Canvas element
 */
export async function renderGenrePoster(
  canvas: HTMLCanvasElement,
  options: PosterOptions
): Promise<void> {
  const { genre, shareUrl, width = 900, height = 1180, isZh = true } = options;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#090a0f");
  bgGrad.addColorStop(0.5, "#12141d");
  bgGrad.addColorStop(1, "#0d0f17");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Background subtle glowing accents
  const glow1 = ctx.createRadialGradient(200, 200, 10, 200, 200, 400);
  glow1.addColorStop(0, "rgba(245, 183, 61, 0.08)");
  glow1.addColorStop(1, "rgba(245, 183, 61, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width - 200, 450, 10, width - 200, 450, 450);
  glow2.addColorStop(0, "rgba(99, 102, 241, 0.09)");
  glow2.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = "#272a38";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  // Corner tech ticks
  const drawCorner = (x: number, y: number, dx: number, dy: number) => {
    ctx.strokeStyle = "#f5b73d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + dy * 20);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * 20, y);
    ctx.stroke();
  };
  drawCorner(30, 30, 1, 1);
  drawCorner(width - 30, 30, -1, 1);
  drawCorner(30, height - 30, 1, -1);
  drawCorner(width - 30, height - 30, -1, -1);

  // 2. Header Brand
  ctx.fillStyle = "#f5b73d";
  ctx.font = "bold 13px monospace";
  ctx.fillText("GROOVE LAB · 音乐流派探针与工坊", 60, 75);

  ctx.fillStyle = "#717688";
  ctx.font = "12px monospace";
  ctx.fillText("CUSTOM GENRE SPECIFICATION · P7-03", 60, 95);

  // Badges (Category & Fork Info)
  let badgeX = width - 60;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "right";

  ctx.fillStyle = "rgba(245, 183, 61, 0.15)";
  ctx.strokeStyle = "rgba(245, 183, 61, 0.4)";
  const catText = genre.category.toUpperCase();
  const catWidth = ctx.measureText(catText).width + 20;
  roundRect(ctx, badgeX - catWidth, 62, catWidth, 26, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f5b73d";
  ctx.fillText(catText, badgeX - 10, 80);

  // 3. Genre Name
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 40px sans-serif";
  const title = genre.name;
  ctx.fillText(title, 60, 150);

  // Fork / Author subtitle
  ctx.fillStyle = "#9ba1b4";
  ctx.font = "14px sans-serif";
  const authorText = genre.authorName ? `${isZh ? "创作者" : "Created by"}: ${genre.authorName}` : "Groove Lab Creator";
  const forkText = genre.forkedFromName ? ` · ${isZh ? "分叉自" : "Forked from"}: ${genre.forkedFromName}` : "";
  ctx.fillText(`${authorText}${forkText} · ${genre.origin_year}`, 60, 178);

  // Line separator
  ctx.strokeStyle = "#252836";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.lineTo(width - 60, 200);
  ctx.stroke();

  // 4. Acoustic Parameters (Left box) & Radar Chart (Right box)
  // Left: Tempo / Scale / Specs
  const specY = 230;
  const drawSpecCard = (x: number, y: number, w: number, h: number, label: string, val: string, sub?: string) => {
    ctx.fillStyle = "#151722";
    ctx.strokeStyle = "#272a38";
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#8d92a4";
    ctx.font = "11px monospace";
    ctx.fillText(label, x + 16, y + 26);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(val, x + 16, y + 54);

    if (sub) {
      ctx.fillStyle = "#f5b73d";
      ctx.font = "11px monospace";
      ctx.fillText(sub, x + 16, y + 74);
    }
  };

  const cardW = 160;
  const cardH = 88;
  drawSpecCard(60, specY, cardW, cardH, isZh ? "基底节拍" : "TEMPO", `${genre.default_bpm} BPM`, genre.bpm_range);
  drawSpecCard(235, specY, cardW, cardH, isZh ? "拍号与律动" : "SIGNATURE", genre.time_signature, "16-Step Grid");
  drawSpecCard(60, specY + 104, cardW, cardH, isZh ? "和声调式" : "SCALE", genre.sequencer_pattern?.scale || "C Minor", "Modal Tonic");
  drawSpecCard(235, specY + 104, cardW, cardH, isZh ? "轨道配置" : "INSTRUMENTS", "8 Tracks", "PCM Synthesizer");

  // Representative artists
  if (genre.representative_artists && genre.representative_artists.length > 0) {
    ctx.fillStyle = "#8d92a4";
    ctx.font = "11px monospace";
    ctx.fillText(isZh ? "代表艺术家 / 风格参考:" : "REPRESENTATIVE ARTISTS:", 60, specY + 225);

    let artX = 60;
    ctx.font = "12px sans-serif";
    genre.representative_artists.slice(0, 3).forEach((artist) => {
      const aWidth = ctx.measureText(artist).width + 16;
      ctx.fillStyle = "#1d202d";
      ctx.strokeStyle = "#32374b";
      roundRect(ctx, artX, specY + 236, aWidth, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#d3d6e2";
      ctx.fillText(artist, artX + 8, specY + 252);
      artX += aWidth + 8;
    });
  }

  // Right: 6-Axis Radar Visualizer
  const radarCenterX = 640;
  const radarCenterY = 320;
  const radarRadius = 110;
  drawRadarOnCanvas(ctx, radarCenterX, radarCenterY, radarRadius, genre.radar_metrics, isZh);

  // 5. Cultural Story / Context Box
  const storyY = 510;
  ctx.fillStyle = "#151722";
  ctx.strokeStyle = "#252837";
  roundRect(ctx, 60, storyY, width - 120, 95, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f5b73d";
  ctx.font = "bold 11px monospace";
  ctx.fillText(isZh ? "文化背景与声音美学构想 (CULTURAL & AESTHETIC CONTEXT)" : "AESTHETIC & CULTURAL ESSENCE", 80, storyY + 25);

  ctx.fillStyle = "#c7c9d4";
  ctx.font = "13px sans-serif";
  const desc = (isZh ? genre.cultural_context?.zh : genre.cultural_context?.en) || genre.cultural_context?.zh || "";
  wrapText(ctx, desc, 80, storyY + 48, width - 160, 20, 2);

  // 6. 8-Track Mini Pattern Heatmap Grid
  const gridY = 635;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(isZh ? "8 轨专属 Seed Pattern 音序骨干" : "8-TRACK SEED PATTERN SKELETON", 60, gridY);

  const patternTracks = genre.sequencer_pattern?.tracks || [];
  const matrixTop = gridY + 16;
  const trackHeight = 26;
  const stepColWidth = (width - 250) / 16;

  patternTracks.forEach((track, tIdx) => {
    const curY = matrixTop + tIdx * (trackHeight + 5);

    // Track Name
    ctx.fillStyle = TRACK_COLORS[track.track_id] || "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(track.name.slice(0, 12), 160, curY + 18);
    ctx.textAlign = "left";

    // Steps
    const steps = track.steps || [];
    for (let s = 0; s < 16; s++) {
      const stepX = 180 + s * stepColWidth;
      const isBeat = s % 4 === 0;
      const isActive = steps[s] > 0;

      if (isActive) {
        ctx.fillStyle = TRACK_COLORS[track.track_id] || "#f5b73d";
        roundRect(ctx, stepX, curY + 2, stepColWidth - 4, trackHeight - 4, 4);
        ctx.fill();
      } else {
        ctx.fillStyle = isBeat ? "#232635" : "#171822";
        roundRect(ctx, stepX, curY + 2, stepColWidth - 4, trackHeight - 4, 4);
        ctx.fill();
      }
    }
  });

  // 7. Footer: QR Code & Call to Action
  const footerY = 930;
  ctx.strokeStyle = "#252836";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(width - 60, footerY);
  ctx.stroke();

  // QR Code generation
  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 140,
      color: {
        dark: "#0a0b10",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise((resolve) => {
      qrImg.onload = resolve;
    });

    const qrX = width - 200;
    const qrY = footerY + 25;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qrX - 6, qrY - 6, 142, 142, 10);
    ctx.fill();

    ctx.drawImage(qrImg, qrX, qrY, 130, 130);
  } catch (err) {
    console.error("Failed to render QR Code on poster:", err);
  }

  // Footer text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(isZh ? "扫码即刻试听与二次二创" : "SCAN TO AUDITION & REMIX", 60, footerY + 50);

  ctx.fillStyle = "#9ba1b4";
  ctx.font = "13px sans-serif";
  ctx.fillText(
    isZh 
      ? "微信/浏览器相机扫码，直接在 GROOVE LAB 体验并加载此曲风。"
      : "Open phone camera or browser to load this genre directly into Groove Lab.",
    60,
    footerY + 76
  );

  ctx.fillStyle = "#f5b73d";
  ctx.font = "11px monospace";
  ctx.fillText("GROOVE LAB · https://groove.wangda.today", 60, footerY + 115);

  ctx.fillStyle = "#696d7f";
  ctx.font = "10px monospace";
  ctx.fillText("OFFLINE READY · WEBAUDIO MODAL ENGINE · FULL STEREO DSP", 60, footerY + 135);
}

/**
 * Radar drawer on 2D context
 */
function drawRadarOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  radar: GenreRadarMetrics,
  isZh: boolean
) {
  const rings = [0.25, 0.5, 0.75, 1.0];
  const total = RADAR_KEYS_ORDER.length;

  // Background rings
  rings.forEach((factor) => {
    ctx.strokeStyle = factor === 1.0 ? "#363a4e" : "#222533";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < total; i++) {
      const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
      const x = cx + radius * factor * Math.cos(angle);
      const y = cy + radius * factor * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  });

  // Spokes & labels
  RADAR_KEYS_ORDER.forEach((key, idx) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);

    ctx.strokeStyle = "#272a3a";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Labels
    const lx = cx + (radius + 24) * Math.cos(angle);
    const ly = cy + (radius + 24) * Math.sin(angle);
    const info = AXIS_LABELS[key];
    const text = isZh ? info.zh : info.en;

    ctx.fillStyle = "#a8abbc";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${text} ${radar[key] || 5}`, lx, ly + 4);
  });

  // Polygon fill
  ctx.beginPath();
  RADAR_KEYS_ORDER.forEach((key, idx) => {
    const val = Math.max(1, Math.min(10, radar[key] || 5));
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const r = (val / 10) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();

  ctx.fillStyle = "rgba(245, 183, 61, 0.25)";
  ctx.fill();
  ctx.strokeStyle = "#f5b73d";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw points
  RADAR_KEYS_ORDER.forEach((key, idx) => {
    const val = Math.max(1, Math.min(10, radar[key] || 5));
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const r = (val / 10) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    ctx.fillStyle = "#f5b73d";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textAlign = "left";
}

/**
 * Canvas round rect helper
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Text wrapper helper
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = 3
) {
  const words = text.split("");
  let line = "";
  let lineCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1 && n < words.length - 1) {
        ctx.fillText(line + "...", x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
