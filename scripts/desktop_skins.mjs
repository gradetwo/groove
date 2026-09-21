#!/usr/bin/env node
/**
 * Desktop skin tokens — generated, and checked.
 *
 * ## Why this exists
 *
 * The phone shell has had six skins since M-series; the desktop (and therefore the iPad, which renders
 * the desktop UI) has had one, hardcoded as hex in `tailwind.config.js` and in ~1 700 literal `bg-[#…]`
 * values across `src/`. The user asked for the six phone skins on the big surfaces too, "保证每套皮肤在
 * 应用内配色一致性" — the same palette inside one skin, on every surface.
 *
 * ## How it keeps the two surfaces consistent
 *
 * The desktop palette is **derived from the phone's own tokens**, which are read out of
 * \`src/mobile/skins/<id>.css\` rather than being typed again here. Ground, card, lines, ink and accent come
 * straight across; the derived steps (a hover accent, a subtle line, an accent glow) are computed from the
 * same values by luminance, not chosen by eye. A phone-side palette change therefore moves the desktop
 * with it, and `check:skins` fails if this file is stale.
 *
 * ## The two halves of the output
 *
 * 1. **Token values**, one block per skin: `--d-bg`, \`--d-panel\`, … as *space-separated channels*
 *    (`18 19 23`) so Tailwind can build `rgb(var(--d-panel) / <alpha-value>)` and keep alpha utilities
 *    working. `tailwind.config.js` names point at these, and `src/styles/desktopSkins.css` carries them.
 * 2. **Literal mapping**, one set of rules that is *skin-independent*: the desktop's 458 hardcoded hexes
 *    are mostly variations on a dozen roles, so each frequent literal is mapped onto the token for its role
 *    (`[class~="bg-[#12131a]"] { background-color: rgb(var(--d-panel)); }`). Because the rule names a token
 *    and not a colour, one rule serves all six skins; the skin only changes what the token resolves to.
 *    A handful of near-duplicate darks and inks in the default theme therefore *converge* — which is the
 *    point of "consistency" — and the readability audit checks every skin for the result.
 *
 * Usage:
 *   node scripts/desktop_skins.mjs            # write src/styles/desktopSkins.css
 *   node scripts/desktop_skins.mjs --check    # fail if it is out of date (the gate)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
/**
 * Two files, because only one of them is needed for the first paint.
 *
 * `desktopTokens.css` carries the **default** palette on `:root` — a page that sets no `data-skin` still has
 * to look like the app always did, so this much is eager. Everything else (the five other palettes and the
 * literal map) is only needed once a non-default skin is applied, and keeping it in the entry bundle cost
 * ~5 KB of gzip on the initial route — the budget gate caught it at 225.6/220 KB. `useSkin.ts` loads this
 * file together with the skin's character.
 */
const OUT_TOKENS = path.join(ROOT, "src", "styles", "desktopTokens.css");
const OUT = path.join(ROOT, "src", "styles", "desktopSkins.css");
const CHECK = process.argv.includes("--check");

const SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"];

/* ---------------------------------------------------------------------------------------------
 * Colour maths — the derived steps, so nothing here is picked by eye
 * ------------------------------------------------------------------------------------------- */

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const rgbToHex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const luminance = ([r, g, b]) => {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const isLight = (hex) => luminance(hexToRgb(hex)) > 0.5;
/**
 * A step that is guaranteed to *increase* contrast against a given ground.
 *
 * `step()` above moves toward white on a light ground, which is right for a *surface* (paper gets lighter as
 * it is raised) and wrong for text: `warning` derived that way measured 3.25:1 on the comic panel and 3.57:1
 * on the Soviet-years paper — the roles audit caught it. A colour meant to be *read* has to move away from
 * its ground instead, whichever direction that is.
 */
const readableStep = (hex, ground, amount) => {
  const groundIsLight = isLight(ground);
  const [r, g, b] = hexToRgb(hex);
  const target = groundIsLight ? 0 : 255;
  const mix = (v) => v + (target - v) * amount;
  return rgbToHex([mix(r), mix(g), mix(b)]);
};

/** Move a colour toward white (light grounds) or black (dark grounds) — the "one step up" of a palette. */
const step = (hex, amount) => {
  const [r, g, b] = hexToRgb(hex);
  const target = isLight(hex) ? 0 : 255;
  const mix = (v) => v + (target - v) * amount;
  return rgbToHex([mix(r), mix(g), mix(b)]);
};
const alpha = (hex, a) => `rgb(${hexToRgb(hex).join(" ")} / ${a})`;

/* ---------------------------------------------------------------------------------------------
 * The phone's palettes, read from the skin sheets themselves
 * ------------------------------------------------------------------------------------------- */

/**
 * Every phone skin writes its palette on `:root[data-skin="…"] .mobile-root`, so this reads the same file
 * the phone renders from. A missing token is a hard error: silently inventing one here is how the two
 * surfaces would drift apart.
 */
function phonePalette(skin) {
  const file = path.join(ROOT, "src", "mobile", "skins", `${skin}.css`);
  const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\.mobile-root\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`${skin}.css: no base token block`);
  const read = (token) => {
    const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(block[1]);
    if (!m) throw new Error(`${skin}.css: missing ${token}`);
    return m[1].trim();
  };
  return {
    bg: read("--m-bg"),
    card: read("--m-card"),
    card2: read("--m-card-2"),
    line: read("--m-line"),
    line2: read("--m-line-2"),
    ink: read("--m-ink"),
    ink2: read("--m-ink-2"),
    ink3: read("--m-ink-3"),
    gold: read("--m-gold"),
    goldHi: read("--m-gold-hi"),
    teal: read("--m-teal"),
    red: read("--m-red"),
    green: read("--m-green"),
    violet: read("--m-violet"),
  };
}

/** The desktop's own palette — today's values, so `default` is the app as it already looks. */
const DEFAULT_SKIN = {
  bg: "#0a0b0d",
  panel: "#121317",
  panel2: "#0d0e12",
  surface: "#1a1c22",
  line: "#23262d",
  lineStrong: "#393d46",
  ink: "#e9e7e0",
  ink2: "#b9b7b0",
  ink3: "#8b8f99",
  accent: "#f5b73d",
  danger: "#ff5964",
  success: "#7ee787",
  warning: "#f59e0b",
  track: {
    kick: "#ff5964",
    snare: "#ffb65c",
    hat: "#45e0c9",
    perc: "#c8e06a",
    bass: "#ff8a5c",
    chord: "#f06ec4",
    lead: "#7ee787",
    fx: "#9aa5ce",
  },
  cat: {
    electronic: "#4ad8c8",
    rock: "#ff5964",
    hiphop: "#f5b73d",
    jazz: "#9aa5ce",
    pop: "#f06ec4",
    latin: "#c8e06a",
  },
};

/**
 * The instrument and category hues, per skin.
 *
 * These are the one part that cannot be derived from a single ground/card/accent triple, because they are
 * *identities* rather than surfaces: the drum machine's kick is red whatever the theme, and the phone's 即兴
 * lanes already encode the same map (`JAM_COLORS` in `MobileJamScreen`). Where the phone has the role, the
 * value is taken from it; the rest are the skin's own accent family, so a track still reads as "the same
 * kind of thing" on both surfaces.
 */
const HUE_OVERRIDES = {
  minimal: {
    track: { bass: "#5b46d6", chord: "#b03a0b", lead: "#157f3d", fx: "#63636d", perc: "#0f766e", snare: "#c5303f" },
  },
  comic: {
    track: { bass: "#c50034", chord: "#8a2be2", lead: "#00702f", fx: "#3a3440", perc: "#b26a00", snare: "#c50034" },
  },
  soviet: {
    track: { bass: "#8fb3ac", chord: "#c98a5b", lead: "#a8c48a", fx: "#7f8a93", perc: "#c0b9a3", snare: "#e2703a" },
  },
  sovietYears: {
    track: { bass: "#2c3e50", chord: "#9e0b22", lead: "#1f5f6b", fx: "#56514a", perc: "#7a4f00", snare: "#9e0b22" },
  },
  pixel: {
    track: { bass: "#8a5bff", chord: "#ff6b97", lead: "#7ef0c0", fx: "#8a8fb0", perc: "#ffd166", snare: "#ff6b97" },
  },
};

/** The full token record for one skin. */
function palette(skin) {
  if (skin === "default") return { ...DEFAULT_SKIN, hue: DEFAULT_SKIN };
  const p = phonePalette(skin);
  const light = isLight(p.bg);
  return {
    bg: p.bg,
    panel: p.card,
    panel2: p.card2,
    surface: step(p.card, 0.06),
    line: p.line,
    lineStrong: p.line2,
    ink: p.ink,
    ink2: p.ink2,
    ink3: p.ink3,
    accent: p.gold,
    danger: p.red,
    success: p.green,
    // Read, not just seen: the direction that increases contrast against the panel it sits on.
    warning: readableStep(p.gold, p.card, light ? 0.35 : 0.2),
    track: { ...DEFAULT_SKIN.track, ...(HUE_OVERRIDES[skin]?.track ?? {}) },
    /**
     * Category hues come from the phone's own identity tokens where the phone has one (its `--m-teal`,
     * `--m-red`, `--m-gold`, `--m-violet`, `--m-green`), so the two surfaces agree *by construction* rather
     * than by two hand-picked hexes that agree today. `pop` has no phone twin, so it takes the accent's
     * lighter read.
     */
    cat: {
      electronic: p.teal,
      rock: p.red,
      hiphop: p.gold,
      jazz: p.violet,
      pop: readableStep(p.gold, p.card, light ? 0.25 : 0.3),
      latin: p.green,
      ...(HUE_OVERRIDES[skin]?.cat ?? {}),
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * The literal map — role, not colour, so one rule serves every skin
 * ------------------------------------------------------------------------------------------- */

/**
 * The desktop's most-used hardcoded hexes, by role.
 *
 * Counted from `src/` (1 752 uses across 458 distinct literals in 123 files): these 27 cover ~800 of them,
 * and they are the ones that make a surface *look like the theme* — grounds, panels, inks, the amber, the
 * red. The long tail is one-off decoration inside gradients and glows, which the per-skin character pass
 * owns. Every entry is a role the token table already has, so the mapping cannot invent a colour.
 */
const LITERAL_ROLES = {
  // grounds
  "#0a0b0d": "bg",
  "#0c0d12": "bg",
  "#0f1118": "bg",
  // panels
  "#12131a": "panel",
  "#1a1c22": "panel",
  "#1f222b": "panel",
  "#0d0e12": "panel2",
  "#111422": "panel2",
  "#161a2b": "panel2",
  "#17181c": "panel2",
  "#12151f": "panel2",
  "#15171d": "panel2",
  // lines
  "#23262d": "line",
  "#252833": "line",
  "#2b3040": "lineStrong",
  "#3a3e48": "lineStrong",
  // inks
  "#eae6dc": "ink",
  "#f5f4ef": "ink",
  "#b9b7b0": "ink2",
  "#8e93a0": "ink3",
  // signal
  "#f5b73d": "accent",
  "#d8b988": "accentSoft",
  "#f59e0b": "warning",
  "#ff5964": "danger",
  "#45e0c9": "trackHat",
  "#4ad8c8": "catElectronic",
  "#38bdf8": "trackFx",
  "#ec4899": "trackChord",
  "#a78bfa": "trackBass",
  "#7ee787": "trackLead",
  "#c8e06a": "trackPerc",
  "#ffb65c": "trackSnare",
  "#f06ec4": "trackChord",
  "#9aa5ce": "trackFx",
  "#ff8a5c": "trackBass",
};

/**
 * The role set, and how a literal that is *not* in the list above is assigned.
 *
 * The 27 entries are the frequent ones and were chosen by hand against the inventory. The desktop has
 * ~450 distinct literals in total, and leaving the rest hardcoded is not an option now that six skins
 * exist: a light skin would keep dark-theme greys scattered through it. So every remaining literal is
 * assigned to its **nearest role** by perceptual distance. That is deliberately a *role* and not a colour:
 * the role resolves to the active skin's value, so a literal that was "a dim grey on a dark panel" becomes
 * "whatever this skin uses for dim text on a panel" — which is what "the same palette on both surfaces"
 * has to mean for the long tail. `desktopSkins.test.ts` then asserts that every literal used as text is
 * remapped, and that every role is readable on every skin.
 */
function nearestRole(hex, roles) {
  const [r, g, b] = hexToRgb(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  let best = null;
  let bestDistance = Infinity;
  for (const [role, roleHex] of Object.entries(roles)) {
    const [rr, rg, rb] = hexToRgb(roleHex);
    // Weighted RGB distance (a cheap stand-in for a perceptual one) with a luminance term, because
    // "which role is this grey" is mostly a question of lightness.
    const distance =
      2 * (r - rr) ** 2 + 4 * (g - rg) ** 2 + 3 * (b - rb) ** 2 + 900 * (channel(r) - channel(rr)) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = role;
    }
  }
  return best;
}

/** Every literal the source actually uses, with the utility prefixes it appears under. */
function allLiterals() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|test|__tests__/.test(entry.name)) walk(rel);
      } else if (/\.tsx?$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ["src/components", "src/views", "src/features", "src/ui"]) walk(dir);
  files.push("src/App.tsx");
  const map = new Map();
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const re =
      /(?:^|[\s"'])((?:[a-z-]+:)*)(bg|text|border|from|to|via|ring|shadow|fill|stroke|decoration|divide|outline|accent|caret)-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d{1,3}))?/g;
    for (const match of text.matchAll(re)) {
      const [, variant, prefix, hex, opacity] = match;
      const key = hex.toLowerCase();
      if (!map.has(key)) map.set(key, new Set());
      // The variant is part of the class token (`hover:bg-[#14151a]`), so it is kept: these are the states a
      // skin was silently missing — a hover that stayed dark-theme. Stored as `variant|prefix|opacity` so the
      // three parts cannot be confused (the first attempt concatenated them and the parser then read
      // `hover` as a prefix, silently dropping every variant).
      map.get(key).add(`${variant}|${prefix}|${opacity ?? ""}`);
    }
  }
  return map;
}

/**
 * Tailwind's own palette names, mapped to roles by hue family.
 *
 * The literal map above only reaches `bg-[#12131a]`-style values. The desktop also uses Tailwind's named
 * palettes — `from-indigo-500`, `bg-purple-600`, `text-emerald-300`, `border-red-500/40` — which compile to
 * Tailwind's own colours and therefore ignore every skin. That is how a newsprint page ended up with an
 * indigo speaker button and a purple "Start Listening" key: the character passes reported them, and no
 * amount of per-skin CSS can reach a utility that hardcodes a hue.
 *
 * Mapping them **by family** (not by shade) is deliberate: the product uses them as *meaning* — a green
 * success, a red danger, an amber warning, an accent call to action — and the shade is decoration. One
 * family, one role, six skins. Greys (`zinc`, `slate`, `gray`, `neutral`, `stone`) are left alone on
 * purpose: they are structural borders and muted text at low alpha, and collapsing them onto the ink
 * tokens would flatten a hierarchy the layouts depend on.
 */
const NAMED_FAMILIES = {
  indigo: "accent", purple: "accent", violet: "accent", blue: "accent", sky: "accent",
  cyan: "accent", fuchsia: "accent", pink: "accent", teal: "success", emerald: "success",
  green: "success", lime: "success", red: "danger", rose: "danger",
  amber: "warning", yellow: "warning", orange: "warning",
};

/** Every `(prefix)-<family>-<shade>[/opacity]` the source actually uses. */
function namedPaletteUses() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|test|__tests__/.test(entry.name)) walk(rel);
      } else if (/\.tsx?$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ["src/components", "src/views", "src/features", "src/ui"]) walk(dir);
  files.push("src/App.tsx");
  const uses = new Set();
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const re =
      /(?:^|[\s"'])((?:[a-z-]+:)*)(bg|text|border|from|to|via|ring|shadow|fill|stroke|decoration|outline|accent|caret)-(indigo|purple|violet|blue|sky|cyan|fuchsia|pink|teal|emerald|green|lime|red|rose|amber|yellow|orange)-([0-9]{2,3})(?:\/(\d{1,3}))?/g;
    for (const match of text.matchAll(re)) {
      uses.add(`${match[1]}|${match[2]}|${match[3]}|${match[5] ?? ""}|${match[4]}`);
    }
  }
  return [...uses].sort();
}

/**
 * Tailwind's neutral ramps, by prefix and shade.
 *
 * The named-palette map above handles *hue*; this handles the greys, and it exists because of a real bug the
 * Soviet-years pass found on paper: the challenge's A/B/C/D chips are `bg-neutral-800` with the shell's
 * `text-text`. On a dark skin that is a raised surface with light ink; on a light skin it stayed a dark grey
 * box with *dark* ink — the options were invisible. The same applies to `border-zinc-700` hairlines and
 * `text-zinc-400` labels.
 *
 * The mapping is by band, and `bg-` is the band of *surface* the theme would have used:
 *   · a dark neutral fill (700–950) is a raised panel   → `--d-panel2`
 *   · a mid neutral (400–600) is an inset/soft surface  → `--d-surface`
 *   · a light neutral (50–300) is a sheet or key        → `--d-surface`
 * `border-` goes to the hairline tokens, `text-` to the ink steps, and `text-white` / `bg-black` are left
 * alone on purpose: white is what sits *on* an accent flood, and black is a scrim — in both cases the
 * relationship, not the theme, is what makes them readable.
 */
const GREY_BANDS = {
  bg: { dark: "panel2", mid: "surface", light: "surface" },
  border: { all: "line", strong: "lineStrong" },
  text: { bright: "ink", mid: "ink3", deep: "ink2" },
};
const GREY_FAMILIES = ["neutral", "zinc", "slate", "gray", "stone"];
const GREY_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

function greyRole(prefix, shade) {
  const n = Number(shade);
  if (prefix === "bg") {
    if (n >= 700) return "panel2";
    if (n >= 400) return "surface";
    return "surface";
  }
  if (prefix === "border") return n >= 400 ? "lineStrong" : "line";
  if (prefix === "text") {
    if (n <= 300) return "ink";
    if (n <= 500) return "ink3";
    return "ink2";
  }
  return null;
}

/** The default skin's hex for every role, which is what a literal is compared against. */
function roleHexes() {
  const p = DEFAULT_SKIN;
  return {
    bg: p.bg,
    panel: p.panel,
    panel2: p.panel2,
    surface: p.surface,
    line: p.line,
    lineStrong: p.lineStrong,
    ink: p.ink,
    ink2: p.ink2,
    ink3: p.ink3,
    accent: p.accent,
    accentSoft: p.accentSoft ?? p.accent,
    warning: p.warning,
    danger: p.danger,
    success: p.success,
    trackKick: p.track.kick,
    trackSnare: p.track.snare,
    trackHat: p.track.hat,
    trackPerc: p.track.perc,
    trackBass: p.track.bass,
    trackChord: p.track.chord,
    trackLead: p.track.lead,
    trackFx: p.track.fx,
    catElectronic: p.cat.electronic,
    catRock: p.cat.rock,
    catHiphop: p.cat.hiphop,
    catJazz: p.cat.jazz,
    catPop: p.cat.pop,
    catLatin: p.cat.latin,
  };
}

/** `#hex` → the CSS custom property its role resolves to. */
const ROLE_TOKEN = {
  bg: "--d-bg",
  panel: "--d-panel",
  panel2: "--d-panel2",
  surface: "--d-surface",
  line: "--d-line",
  lineStrong: "--d-line-strong",
  ink: "--d-ink",
  ink2: "--d-ink-2",
  ink3: "--d-ink-3",
  accent: "--d-accent",
  accentSoft: "--d-accent-soft",
  warning: "--d-warning",
  danger: "--d-danger",
  success: "--d-success",
  trackKick: "--d-track-kick",
  trackSnare: "--d-track-snare",
  trackHat: "--d-track-hat",
  trackPerc: "--d-track-perc",
  trackBass: "--d-track-bass",
  trackChord: "--d-track-chord",
  trackLead: "--d-track-lead",
  trackFx: "--d-track-fx",
  trackKickInk: "--d-track-kick-ink",
  trackSnareInk: "--d-track-snare-ink",
  trackHatInk: "--d-track-hat-ink",
  trackPercInk: "--d-track-perc-ink",
  trackBassInk: "--d-track-bass-ink",
  trackChordInk: "--d-track-chord-ink",
  trackLeadInk: "--d-track-lead-ink",
  trackFxInk: "--d-track-fx-ink",
  catElectronic: "--d-cat-electronic",
  catRock: "--d-cat-rock",
  catHiphop: "--d-cat-hiphop",
  catJazz: "--d-cat-jazz",
  catPop: "--d-cat-pop",
  catLatin: "--d-cat-latin",
};

/* ---------------------------------------------------------------------------------------------
 * Emit
 * ------------------------------------------------------------------------------------------- */

const channels = (hex) => hexToRgb(hex).join(" ");

function tokenRecord(skin) {
  const p = palette(skin);
  const light = isLight(p.bg);
  return {
    "--d-bg": channels(p.bg),
    "--d-panel": channels(p.panel),
    "--d-panel2": channels(p.panel2),
    "--d-surface": channels(p.surface),
    "--d-line": channels(p.line),
    "--d-line-strong": channels(p.lineStrong),
    "--d-ink": channels(p.ink),
    "--d-ink-2": channels(p.ink2),
    "--d-ink-3": channels(p.ink3),
    "--d-accent": channels(p.accent),
    // One step of the accent for hovers, and the soft tone the desktop already uses for secondary type.
    "--d-accent-hover": channels(step(p.accent, light ? 0.18 : 0.14)),
    /**
     * The softer accent, as a *readable* tone rather than a lighter one.
     *
     * `#d8b988` (the desktop's soft gold) is used for song titles in the chord workshop. Mapped to a
     * lightened accent it measured 3.3:1 on the minimal paper and 3.5:1 on the comic newsprint — 107 of the
     * audit's findings. A "soft" accent still has to be read, so it takes the step that moves *away* from the
     * panel.
     */
    "--d-accent-soft": channels(readableStep(p.accent, p.panel, light ? 0.45 : 0.3)),
    "--d-accent-glow": alpha(p.accent, 0.2),
    /*
     * Lane colours, twice: the colour itself (a shape — a pad, a step, a bar) and an ink that reads as
     * *text* on the panel.
     *
     * The studio labels its track headers with the lane colour (`text-[#45e0c9]` for HI-HAT), and a bright
     * instrument colour is chosen to glow on a dark pad, not to be small text: on the Soviet-years paper the
     * teal measured 1.55:1. Same colour, same identity, but the text step is derived against the panel it is
     * actually read on.
     */
    ...Object.fromEntries(
      Object.entries(p.track).flatMap(([lane, hex]) => [
        [`--d-track-${lane}`, channels(hex)],
        [`--d-track-${lane}-ink`, channels(readableStep(hex, p.panel, light ? 0.75 : 0.55))],
      ])
    ),
    "--d-danger": channels(p.danger),
    "--d-success": channels(p.success),
    "--d-warning": channels(p.warning),
    "--d-track-kick": channels(p.track.kick),
    "--d-track-snare": channels(p.track.snare),
    "--d-track-hat": channels(p.track.hat),
    "--d-track-perc": channels(p.track.perc),
    "--d-track-bass": channels(p.track.bass),
    "--d-track-chord": channels(p.track.chord),
    "--d-track-lead": channels(p.track.lead),
    "--d-track-fx": channels(p.track.fx),
    "--d-cat-electronic": channels(p.cat.electronic),
    "--d-cat-rock": channels(p.cat.rock),
    "--d-cat-hiphop": channels(p.cat.hiphop),
    "--d-cat-jazz": channels(p.cat.jazz),
    "--d-cat-pop": channels(p.cat.pop),
    "--d-cat-latin": channels(p.cat.latin),
    // The scheme tells the browser how to paint form controls and scrollbars; a light skin that leaves it
    // dark gets black select popups and black scrollbars on paper.
    "--d-scheme": light ? "light" : "dark",
    /**
     * The page's own wash — `index.css` paints a soft ellipse behind the studio. On a dark ground that is a
     * faint lift; on paper it has to be a faint tint instead, or a dark wash would smear the light skins.
     */
    "--d-page-glow": channels(step(p.bg, light ? 0.04 : 0.05)),
  };
}

function header(eager) {
  return `/*
 * Desktop skin tokens — GENERATED by scripts/desktop_skins.mjs. Do not edit by hand.
 *
 * ${eager ? "This half is EAGER: the default palette, which is what a page that never sets `data-skin`\n * renders with. It is tiny and it is the app's original colours, unchanged." : "This half is LAZY: the five non-default palettes and the literal map, loaded by\n * `useSkin.ts` when one of those skins is applied. The default skin never downloads it."}
 *
 * The phone has six skins; this is what makes the desktop (and the iPad, which renders the desktop UI)
 * wear the same six. \`check:skins\` fails if this file is out of date, and every value is derived from
 * the phone's own tokens in \`src/mobile/skins/<id>.css\` — ground, card, lines, ink and accent come
 * straight across, so a phone palette change moves the desktop with it.
 *
 * Values are **space-separated channels** (\`18 19 23\`), not hex, because \`tailwind.config.js\` builds
 * its names as \`rgb(var(--d-panel) / <alpha-value>)\`: that is what keeps Tailwind's opacity utilities
 * (\`bg-panel/60\`) working while a skin swaps the palette underneath.
 *
 * \`default\` is the app's existing palette, unchanged. The other five are the phone's.
 */
`;
}

function generateTokens() {
  const base = tokenRecord("default");
  return header(true) + "\n:root {\n" + Object.entries(base).map(([k, v]) => `  ${k}: ${v};`).join("\n") + "\n}\n";
}

function generate() {
  const parts = [header(false) + "\n"];

  for (const skin of SKINS.filter((s) => s !== "default")) {
    const record = tokenRecord(skin);
    parts.push(
      `\n/* ${skin} — the phone's palette, derived from \`src/mobile/skins/${skin}.css\` */\n` +
        `:root[data-skin="${skin}"] {\n` +
        Object.entries(record).map(([k, v]) => `  ${k}: ${v};`).join("\n") +
        "\n}\n"
    );
  }

  /**
   * The literal map.
   *
   * One set of rules for every skin, because a rule names a *token*: the skin changes what the token
   * resolves to, not which rule applies. \`[class~="…"]\` matches the class token exactly, so an opacity
   * variant (\`bg-[#12131a]/60\`) is matched by its own rule below with the alpha preserved.
   */
  const prefixes = allLiterals();
  const roles = roleHexes();
  const literalRoles = { ...LITERAL_ROLES };
  for (const hex of prefixes.keys()) {
    if (literalRoles[hex]) continue;
    const role = nearestRole(hex, roles);
    if (role) literalRoles[hex] = role;
  }
  const rules = [];
  const PROPERTY = {
    bg: "background-color",
    text: "color",
    border: "border-color",
    from: "--tw-gradient-from",
    to: "--tw-gradient-to",
    /**
     * `via` needs the whole stop list, not a variable.
     *
     * Tailwind v3 gives `from-*` and `to-*` custom properties but **inlines** the `via-*` colour into
     * `--tw-gradient-stops`, so overriding a `--tw-gradient-via` variable does nothing (found by looking at
     * a skinned hero panel that kept its old dark middle stop). The stop list has to be restated, keeping
     * the from/to variables in place so a skinned gradient still uses them.
     */
    via: "--tw-gradient-stops",
    ring: "--tw-ring-color",
    shadow: "--tw-shadow-color",
    fill: "fill",
    stroke: "stroke",
    decoration: "text-decoration-color",
    divide: "border-color",
    outline: "outline-color",
    accent: "accent-color",
    caret: "caret-color",
  };
  for (const [hex, role] of Object.entries(literalRoles)) {
    let token = ROLE_TOKEN[role];
    if (!token) throw new Error(`literal ${hex}: role ${role} has no token`);
    const used = prefixes.get(hex);
    if (!used) continue;
    for (const use of [...used].sort()) {
      const [variant, prefix, opacity] = use.split("|");
      /*
       * A lane colour used as *text* takes the readable step, not the shape colour.
       *
       * `ROLE_TOKEN[role]` names the shape; when the utility is `text-` on a lane role, the ink variant is
       * what a skin guarantees against its own panel.
       */
      const inkRole = prefix === "text" && /^track[A-Z]/.test(role) ? `${role}Ink` : role;
      const chosen = ROLE_TOKEN[inkRole] ?? token;
      const property = PROPERTY[prefix];
      if (!property) continue;
      token = chosen;
      const colour = opacity ? `rgb(var(${token}) / ${(Number(opacity) / 100).toFixed(2)})` : `rgb(var(${token}))`;
      const value =
        prefix === "via"
          ? `var(--tw-gradient-from), ${colour}, var(--tw-gradient-to, rgb(0 0 0 / 0))`
          : colour;
      const selector = `[class~="${variant}${prefix}-[${hex}]${opacity ? `/${opacity}` : ""}"]`;
      rules.push(`${selector} { ${property}: ${value}; }`);
    }
  }
  /**
   * Named palettes: one rule per (role, prefix, opacity), with the selectors grouped.
   *
   * Grouping matters for size — the source uses ~120 distinct family/shade/prefix combinations and they
   * collapse to a handful of rules, because the *role* is what the rule names and the shades are all the
   * same role.
   */
  const grouped = new Map();
  for (const use of namedPaletteUses()) {
    const [variant, prefix, family, opacity] = use.split("|");
    const role = NAMED_FAMILIES[family];
    if (!role) continue;
    const token = ROLE_TOKEN[role];
    const key = `${variant}|${prefix}|${token}|${opacity}`;
    if (!grouped.has(key)) grouped.set(key, new Set());
    // Only the shades the source actually uses: emitting all eleven for every family would be ~2 000 rules
    // of CSS for classes that do not exist.
    // A Tailwind palette class is plain (`bg-indigo-600/40`), unlike the arbitrary-value form which carries
    // brackets — so the selector is the class token itself, variant included (`hover:bg-indigo-600`).
    grouped.get(key).add(`${variant}${prefix}-${family}-${use.split("|")[4]}${opacity ? `/${opacity}` : ""}`);
  }
  const namedRules = [];
  for (const [key, selectors] of [...grouped.entries()].sort()) {
    const [, prefix, token, opacity] = key.split("|");
    const property = PROPERTY[prefix];
    if (!property) continue;
    const colour = opacity ? `rgb(var(${token}) / ${(Number(opacity) / 100).toFixed(2)})` : `rgb(var(${token}))`;
    const value =
      prefix === "via"
        ? `var(--tw-gradient-from), ${colour}, var(--tw-gradient-to, rgb(0 0 0 / 0))`
        : colour;
    const selectorList = [...selectors]
      .sort()
      .map((selector) => `[class~="${selector}"]`)
      .join(",\n");
    namedRules.push(`${selectorList} { ${property}: ${value}; }`);
  }
  /**
   * Neutral ramps: every shade of every grey family the source uses, per role.
   *
   * Emitted for the shades that appear, and one rule per (role, prefix) with the selectors grouped, so the
   * cost is a few hundred bytes rather than a rule per class.
   */
  const greyUses = new Map();
  {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!/node_modules|test|__tests__/.test(entry.name)) walk(rel);
        } else if (/\.tsx?$/.test(entry.name)) files.push(rel);
      }
    };
    for (const dir of ["src/components", "src/views", "src/features", "src/ui"]) walk(dir);
    files.push("src/App.tsx");
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const re = new RegExp(
        `(?:^|[\\s"'])((?:[a-z-]+:)*)(bg|border|text)-(${GREY_FAMILIES.join("|")})-(${GREY_SHADES.join("|")})(?:\\/(\\d{1,3}))?`,
        "g"
      );
      for (const match of text.matchAll(re)) {
        const role = greyRole(match[2], match[4]);
        if (!role) continue;
        const key = `${match[1]}|${match[2]}|${role}|${match[5] ?? ""}`;
        if (!greyUses.has(key)) greyUses.set(key, new Set());
        greyUses.get(key).add(`${match[1]}${match[2]}-${match[3]}-${match[4]}${match[5] ? `/${match[5]}` : ""}`);
      }
    }
  }
  const greyRules = [];
  for (const [key, selectors] of [...greyUses.entries()].sort()) {
    const [, prefix, role, opacity] = key.split("|");
    const property = PROPERTY[prefix];
    const token = ROLE_TOKEN[role];
    if (!property || !token) continue;
    const colour = opacity ? `rgb(var(${token}) / ${(Number(opacity) / 100).toFixed(2)})` : `rgb(var(${token}))`;
    greyRules.push(
      [...selectors].sort().map((selector) => `[class~="${selector}"]`).join(",\n") + ` { ${property}: ${colour}; }`
    );
  }
  parts.push(
    "\n/*\n * Tailwind's neutral ramps, by prefix and shade: a dark grey fill is a panel, a light one is a\n * sheet, a border is a hairline, a grey text is an ink step. Without this the challenge's\n * `bg-neutral-800` option chips kept their dark boxes under the shell's ink on a light skin —\n * invisible text.\n */\n" +
      greyRules.join("\n") +
      "\n"
  );

  parts.push(
    `\n/*\n * Tailwind's own palette names, by meaning: a green is a success, an indigo is a call to action, a\n * shade is decoration. They compile to Tailwind's colours, so without this a skinned page keeps them —\n * which is how a newsprint theme ended up with an indigo speaker key. ${namedRules.length} rules.\n */\n` +
      namedRules.join("\n") +
      "\n"
  );

  parts.push(
    `\n/*\n * The literal map: the desktop's hardcoded hexes, by role.\n *\n * ${rules.length} rules, generated from the literals the source actually uses. Because each rule names a\n * **token**, the same rules serve all six skins — the skin decides what the token resolves to. The few\n * near-duplicate grounds and inks in the default theme therefore converge onto one value each, which is\n * what "the same palette on both surfaces" means in practice.\n */\n` +
      rules.join("\n") +
      "\n"
  );

  return parts.join("\n");
}

function main() {
  const tokens = generateTokens();
  const skins = generate();
  if (CHECK) {
    const stale = [
      [OUT_TOKENS, tokens],
      [OUT, skins],
    ].filter(([file, expected]) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "") !== expected);
    if (stale.length) {
      console.error("❌ desktop skin sheets are out of date — run `node scripts/desktop_skins.mjs`.");
      for (const [file] of stale) console.error(`   · ${path.relative(ROOT, file)}`);
      process.exit(1);
    }
    const declared = SKINS.map((s) => `data-skin="${s}"`).filter((needle) => skins.includes(needle));
    console.log(
      `✅ desktop skins up to date (${declared.length + 1} palettes, ${tokens.split("\n").length + skins.split("\n").length} lines)`
    );
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT_TOKENS, tokens);
  fs.writeFileSync(OUT, skins);
  console.log(`wrote desktopTokens.css (${tokens.split("\n").length}) + desktopSkins.css (${skins.split("\n").length})`);
}

main();
