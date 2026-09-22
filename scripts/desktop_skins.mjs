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
import sharedLiteralRoles from "../src/data/skinLiteralRoles.json" with { type: "json" };
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
/** Darken a fill until text of the given colour reads on it (the lane fills carry white note names). */
/**
 * Move a colour only as far as it needs to go to clear a contrast floor.
 *
 * Different from `readableStep`, which always moves by the amount it is given: this returns the colour
 * unchanged when it already passes, so a skin whose accent is already readable keeps the exact hue the phone
 * uses. That matters — a palette change here would be a palette change on the phone too.
 */
const ensureContrast = (hex, ground, floor) => {
  const target = isLight(ground) ? 0 : 255;
  const [startHi, startLo] = [luminance(hexToRgb(hex)), luminance(hexToRgb(ground))].sort((x, y) => y - x);
  if ((startHi + 0.05) / (startLo + 0.05) >= floor) return hex;
  let [r, g, b] = hexToRgb(hex);
  for (let step = 0; step < 40; step += 1) {
    const mix = (v) => v + (target - v) * 0.06;
    [r, g, b] = [mix(r), mix(g), mix(b)];
    const candidate = rgbToHex([r, g, b]);
    const [a, c] = [luminance(hexToRgb(candidate)), luminance(hexToRgb(ground))].sort((x, y) => y - x);
    if ((a + 0.05) / (c + 0.05) >= floor) return candidate;
  }
  return rgbToHex([r, g, b]);
};

/**
 * The grounds a *tinted* chip presents: the panel itself and the colour mixed into it.
 *
 * The desktop's chips are `bg-<role>/10..30`, so the text on them is not read against the panel but against a
 * 10-30 % wash of the role over it. Deriving a text role against the panel alone left 54 elements at 4.2:1 —
 * "Load to Studio" and the lane labels on every light skin — because a 20 % accent wash is *lighter* than the
 * panel on a light theme and *darker* on a dark one, and the ink has to clear both.
 */
const tintGrounds = (base, panel, steps = [0, 0.1, 0.2, 0.3]) =>
  steps.map((amount) => rgbToHex(overHex({ rgb: hexToRgb(base), a: amount }, hexToRgb(panel))));

/** Composite a colour at `a` over an opaque one, in hex space. */
function overHex(fg, bg) {
  return [0, 1, 2].map((i) => Math.round(fg.rgb[i] * fg.a + bg[i] * (1 - fg.a)));
}

/**
 * The ink that reads **best on all of these grounds at once**.
 *
 * The first attempt reduced with `ensureContrast`, which is wrong whenever the grounds sit on both sides of the
 * colour: a light panel asks for a darker ink, a 20 % wash of a saturated accent asks for a lighter one, and the
 * sequential reduce satisfied whichever came last (Soviet-years' chord page went from 12 findings to 78). This
 * maximises the *minimum* contrast instead, so one colour has to work everywhere — and if nothing clears the
 * floor, the caller still gets the best available rather than a colour tuned to one ground.
 */
const bestInkFor = (base, grounds, floor, options = {}) => {
  const [br, bg, bb] = hexToRgb(base);
  const luminanceOf = (hex) => luminance(hexToRgb(hex));
  const worst = (hex) => {
    const value = luminanceOf(hex);
    return grounds.reduce((min, ground) => {
      const other = luminanceOf(ground);
      const [hi, lo] = value > other ? [value, other] : [other, value];
      return Math.min(min, (hi + 0.05) / (lo + 0.05));
    }, Infinity);
  };
  if (worst(base) >= floor) return base;
  /**
   * Move away from the base in small steps and take the **first** candidate that clears every ground.
   *
   * Distance matters as much as contrast: the obvious "maximise the minimum" search returns pure black for
   * every skin, which is not an accent anymore. A 2 % step keeps the colour's identity while the ratio climbs.
   */
  const step = options.step ?? 0.02;
  let fallback = base;
  let fallbackScore = worst(base);
  for (let t = step; t <= 1.0001; t += step) {
    for (const target of [0, 255]) {
      const candidate = rgbToHex([br, bg, bb].map((v) => v + (target - v) * t));
      const score = worst(candidate);
      if (score >= floor) return candidate;
      if (score > fallbackScore) {
        fallback = candidate;
        fallbackScore = score;
      }
    }
  }
  return fallback;
};

/**
 * Turn a Tailwind variant prefix into a selector, because `[class~="hover:bg-x"]` alone matches **always**.
 *
 * This was a real, app-wide bug: the map emitted 133 rules whose selector was just the class-token attribute, so
 * a `hover:` colour (and every `focus:`, `group-hover:`, `sm:` variant) was applied as the **base** colour on
 * every skin but the default. The buttons painted themselves in their hover colour, and the audit saw fills that
 * do not exist at rest. A variant has to become the state it names:
 *
 *   hover:            → `:hover`
 *   group-hover:      → `.group:hover …`   (Tailwind's group contract)
 *   peer-checked:     → `.peer:checked ~ …`
 *   sm:/md:/lg:…      → an `@media (min-width: …)` wrapper
 *   aria-pressed:     → `[aria-pressed="true"]`
 *   data-[state=open] → `[data-state="open"]`
 *
 * An unrecognised variant returns `null` and the caller **skips the rule**, because a rule that applies at the
 * wrong time is worse than a colour that stays unmapped (the unmapped one is at least visible to the audit).
 */
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };
/** Variants that are pseudo-*elements* (`::selection`), not states. */
const PSEUDO_ELEMENTS = new Set(["selection", "placeholder", "before", "after", "marker", "file", "first-line"]);
const PSEUDO_VARIANTS = new Set([
  "hover", "focus", "focus-visible", "focus-within", "active", "disabled", "checked",
  "first", "last", "odd", "even", "visited", "target", "placeholder-shown",
]);

function variantSelector(variant, baseSelector) {
  /** `@media` wrappers that have to sit outside the rule. */
  const media = [];
  /** Selectors that have to sit *before* the element (group/peer). */
  let prefix = "";
  for (const part of variant.split(":").filter(Boolean)) {
    if (PSEUDO_ELEMENTS.has(part)) {
      baseSelector += `::${part}`;
      continue;
    }
    if (PSEUDO_VARIANTS.has(part)) {
      baseSelector += `:${part}`;
      continue;
    }
    if (BREAKPOINTS[part]) {
      media.push(`(min-width: ${BREAKPOINTS[part]}px)`);
      continue;
    }
    if (part.startsWith("group-")) {
      const state = part.slice("group-".length);
      if (!PSEUDO_VARIANTS.has(state)) return null;
      prefix += `.group:${state} `;
      continue;
    }
    if (part.startsWith("peer-")) {
      const state = part.slice("peer-".length);
      if (!PSEUDO_VARIANTS.has(state)) return null;
      prefix += `.peer:${state} ~ `;
      continue;
    }
    if (part.startsWith("aria-")) {
      baseSelector += `[aria-${part.slice(5)}="true"]`;
      continue;
    }
    const dataMatch = /^data-\[(.+?)=["']?(.+?)["']?\]$/.exec(part);
    if (dataMatch) {
      baseSelector += `[data-${dataMatch[1]}="${dataMatch[2]}"]`;
      continue;
    }
    if (part.startsWith("data-")) {
      baseSelector += `[${part}]`;
      continue;
    }
    // Unknown: the caller drops the rule and counts it.
    return null;
  }
  return { selector: `${prefix}${baseSelector}`, media };
}

/**
 * Wrap a set of media queries around a rule, and collect per-breakpoint blocks.
 *
 * Media queries cannot be attached to a selector, so rules carrying one are gathered and emitted together at the
 * end of the sheet — which also keeps them last in the cascade, where Tailwind puts them.
 */
const mediaBuckets = new Map();
function pushRule(rules, selector, body, media = []) {
  if (!media.length) {
    rules.push(`${selector} { ${body} }`);
    return;
  }
  const key = media.join(" and ");
  if (!mediaBuckets.has(key)) mediaBuckets.set(key, []);
  mediaBuckets.get(key).push(`${selector} { ${body} }`);
}
/** How many rules were dropped because their variant is not understood. */
const skippedVariants = new Map();

/** The chip washes the app actually uses (`bg-<role>/10`, `/15`, `/20`). */
const CHIP_TINTS = [0, 0.08, 0.15, 0.2];

const ensureTextOn = (fill, text, floor) => {
  const target = isLight(text) ? 0 : 255;
  let [r, g, b] = hexToRgb(fill);
  for (let step = 0; step < 20; step += 1) {
    const candidate = rgbToHex([r, g, b]);
    const [hi, lo] = [luminance(hexToRgb(candidate)), luminance(hexToRgb(text))].sort((x, y) => y - x);
    if ((hi + 0.05) / (lo + 0.05) >= floor) return candidate;
    const mix = (v) => v + (target - v) * 0.12;
    [r, g, b] = [mix(r), mix(g), mix(b)];
  }
  return rgbToHex([r, g, b]);
};
/** WCAG contrast ratio between two colours, for choosing the readable of two candidates. */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
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
    // The phone's own warning tone, added when the six skins gained one; older sheets without it fall back.
    warning: (() => {
      try {
        return read("--m-warning");
      } catch {
        return null;
      }
    })(),
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
  // The app's own pale surfaces (the piano keys) and the ink that reads on an accent fill.
  surfacePale: "#f3f1eb",
  surfacePale2: "#e2dfd5",
  inkOnPale: "#3f3f46",
  onAccent: "#0b0b0d",
  accentInk: "#f5b73d",
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
  /**
   * The eight instrument colours, **designed per skin** rather than inherited lane by lane.
   *
   * The previous table overrode six of eight lanes per skin and let the rest fall through to the default
   * theme's neon set, which is why the light skins still showed dark-theme colours: comic inherited
   * `kick: #ff5964` and `hat: #45e0c9` from the neon palette, so a newsprint theme grew a fluorescent cyan
   * lane and a magenta one. A partial override can only ever be as coherent as its un-overridden remainder.
   *
   * These are complete sets, and each one is drawn from its own skin's accent family (the phone's
   * `--m-gold` / `--m-teal` / `--m-red` / `--m-green` / `--m-violet`) so the lanes belong to the theme instead
   * of sitting on top of it:
   *
   *   default       neon night     the app's original eight, unchanged
   *   minimal       clean light    mid-tones that hold up on white with either ink
   *   comic         newsprint      flat poster plates, the way a comic uses spot colour
   *   soviet        dark industry  desaturated military tones
   *   sovietYears   aged paper     print inks, all dark enough for paper
   *   pixel         8-bit neon     saturated hues on near-black
   *
   * The **lane identity is stable across skins** — kick is always the red one, hat the teal one, bass the
   * indigo one — because the colour is how a track is recognised at a glance; only its interpretation changes.
   */
  track: {
    default: {
      kick: "#ff5964",
      snare: "#ffb65c",
      hat: "#45e0c9",
      perc: "#c8e06a",
      bass: "#7c6cf0",
      chord: "#f06ec4",
      lead: "#7ee787",
      fx: "#9aa5ce",
    },
    minimal: {
      kick: "#d4293a",
      snare: "#c25a00",
      hat: "#0f766e",
      perc: "#5c7c0f",
      bass: "#4a3ac9",
      chord: "#b0248a",
      lead: "#157f3d",
      fx: "#5b6472",
    },
    comic: {
      kick: "#e23b2e",
      snare: "#f08a1e",
      hat: "#1f9aa8",
      perc: "#86b32a",
      bass: "#6b46c1",
      chord: "#d43f8d",
      lead: "#2e9e4f",
      fx: "#6b625c",
    },
    soviet: {
      kick: "#b8503a",
      snare: "#c9a227",
      hat: "#8fb3ac",
      perc: "#9dbba5",
      bass: "#8e93b8",
      chord: "#c07b72",
      lead: "#a8c48a",
      fx: "#7e8794",
    },
    sovietYears: {
      kick: "#9e0b22",
      snare: "#a8681a",
      hat: "#1f5f6b",
      perc: "#4a6b2a",
      bass: "#3b3f6b",
      chord: "#8e2b62",
      lead: "#2f6b3a",
      fx: "#56514a",
    },
    pixel: {
      kick: "#ff4d6d",
      snare: "#ffa23f",
      hat: "#5bc8ff",
      perc: "#7bff6b",
      bass: "#b06bff",
      chord: "#ff6bd6",
      lead: "#ffd23f",
      fx: "#8a8fb0",
    },
  },
  minimal: {
    // (the lane palette moved to `track` above; this stays the home of the non-lane hue overrides)
  },
  comic: {},
  soviet: {},
  sovietYears: {},
  pixel: {},
};

/** The full token record for one skin. */
function palette(skin) {
  if (skin === "default") {
    /**
     * The default skin is the app's original palette, written out rather than derived — and it still needs the
     * per-lane on-fill ink, which is a *choice* (white on the neon lanes) rather than a derivation of the
     * ground. Computing it here keeps the token set identical for all six skins, which is what
     * `desktopSkins.test.ts` checks.
     */
    const trackOn = Object.fromEntries(
      Object.entries(DEFAULT_SKIN.track).map(([lane, hex]) => [
        lane,
        contrast(hexToRgb(DEFAULT_SKIN.ink), hexToRgb(hex)) >= contrast(hexToRgb("#ffffff"), hexToRgb(hex))
          ? DEFAULT_SKIN.ink
          : "#ffffff",
      ])
    );
    return { ...DEFAULT_SKIN, trackOn, hue: DEFAULT_SKIN };
  }
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
    /**
     * The signal colours, held to the contrast floor as *text* as well as used as floods.
     *
     * They are used both ways: a fill with `--d-on-accent` on it, and small type (the challenge's rank
     * certificate). `p.red`/`p.green` are the phone's own tokens and on the light skins they are mid-tones —
     * Soviet-years' green measured 3.6:1 on its surface — so each steps only as far as the floor needs.
     */
    danger: bestInkFor(p.red, [p.card, p.card2, ...tintGrounds(p.red, p.card, CHIP_TINTS.filter((t) => t > 0))], 4.5),
    success: bestInkFor(p.green, [p.card, p.card2, ...tintGrounds(p.green, p.card, CHIP_TINTS.filter((t) => t > 0))], 4.5),
    // Read, not just seen: the direction that increases contrast against the panel it sits on.
    /**
     * The warning tone: the phone's own `--m-warning` when it has one (a warning should be amber, not a darker
     * version of whatever the skin's accent happens to be — the minimal skin's accent is blue), otherwise the
     * accent stepped away from the ground. Either way it is held to the text floor.
     */
    warning: bestInkFor(
      p.warning ?? readableStep(p.gold, p.card, light ? 0.35 : 0.2),
      [
        p.card,
        p.card2,
        // …and its own chips: "Rank Certificate" sits on a 20 % amber wash, which measured 4.45:1 against a
        // warning derived from the panel alone.
        ...tintGrounds(p.warning ?? p.gold, p.card, CHIP_TINTS.filter((t) => t > 0)),
      ],
      4.5
    ),
    /**
     * A light surface inside the theme, and the ink that reads on it.
     *
     * The piano keyboard is the one place where a surface is deliberately lighter than the page: white keys
     * `#f3f1eb`, inactive keys `#e2dfd5`, with dark grey labels. Mapped by distance alone those keys landed on
     * the *ink* role (light in the default palette) and their labels on `--d-ink-2`; under a light skin the
     * keys went dark and the labels turned light, and the labels vanished.
     */
    surfacePale: light ? step(p.card, -0.05) : step(p.card, 0.82),
    surfacePale2: light ? step(p.card, -0.11) : step(p.card, 0.66),
    inkOnPale: readableStep("#808080", light ? step(p.card, -0.05) : step(p.card, 0.82), 0.95),
    /**
     * The ink that sits *on* an accent fill. `bg-accent text-black` is 8:1 on the default amber and 3.6:1 on
     * the minimal blue; the phone solved this with `--m-on-gold` and the desktop had no equivalent.
     */
    onAccent:
      contrast(hexToRgb("#0b0b0d"), hexToRgb(p.gold)) >= contrast(hexToRgb("#fafafa"), hexToRgb(p.gold))
        ? "#0b0b0d"
        : "#fafafa",
    /**
     * The accent, as *text*.
     *
     * `bg-accent` is a flood (flag red on the Soviet-years poster, and the label on it takes `--d-on-accent`);
     * `text-accent` is small type on a surface, where the same red measures 3.3:1 on that skin's beige. The
     * step is minimal and only applied when needed.
     */
    // `p` here is the *phone* palette, so the ground is its card (the desktop panel is derived from it).
    // Derived against the *surface*, not the card: the chips that carry accent text sit on a surface step, and
    // the first version checked against the lighter card, decided the flag red already passed and left it at
    // 3.3:1 where it is actually read.
    /**
     * The accent as type, derived against the **worst ground it is read on**.
     *
     * Deriving it against the card was not enough: the header's version badge sits on `--m-card-2`, and the
     * Soviet-years flag red measured 3.2:1 there. Taking the darkest of the three grounds (card, card-2 and the
     * surface step between them) costs a slightly deeper red and removes the class.
     */
    /**
     * The accent as type, chosen to read on the panel, both card tones *and* the accent's own chip washes —
     * most of this text sits on `bg-accent/15`.
     */
    accentInk: bestInkFor(
      p.gold,
      [
        p.card,
        p.card2,
        step(p.card, 0.06),
        // Its own chips, over both card tones: `bg-accent/20` on a `bg-[#f4f4f6]` panel is a different ground
        // from the same wash over white, and the "Hooktheory" badge sits on the former (4.44:1 before this).
        ...tintGrounds(p.gold, p.card, CHIP_TINTS.filter((t) => t > 0)),
        ...tintGrounds(p.gold, p.card2, CHIP_TINTS.filter((t) => t > 0)),
      ],
      4.5
    ),
    /**
     * The lane fills — this skin's *designed* hue, not a darkened one.
     *
     * They used to be pushed toward black until white text cleared 4.5:1 on them, which on a light skin turned
     * eight distinct instruments into eight muddy near-greys: the fills bought label contrast with the colour
     * map the studio is built on. The label problem is solved where it belongs — `--d-track-<lane>-on` is the
     * ink that reads on the fill itself, chosen per lane.
     */
    track: { ...(HUE_OVERRIDES.track[skin] ?? HUE_OVERRIDES.track.default) },
    trackOn: Object.fromEntries(
      Object.entries(HUE_OVERRIDES.track[skin] ?? HUE_OVERRIDES.track.default).map(([lane, hex]) => [
        lane,
        // Bright plates take ink (the comic-book look), dark ones take white.
        contrast(hexToRgb(p.ink), hexToRgb(hex)) >= contrast(hexToRgb("#ffffff"), hexToRgb(hex)) ? p.ink : "#ffffff",
      ])
    ),
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
/**
 * The literal -> role table now lives in `src/data/skinLiteralRoles.json`, shared with the phone sheets.
 *
 * It used to be defined here, which made the desktop the only place the mapping was written down: the phone's
 * legacy and panel sheets hand-map the same hexes to their own tokens, and nothing compared the two. The table is
 * data so that the generator, the phone sheets and the desktop output can all be checked against one copy.
 */
const LITERAL_ROLES = sharedLiteralRoles.literals;



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
/**
 * Which roles may answer which kind of utility.
 *
 * A role carries a *kind* as well as a colour, and the first version of this file ignored that: it picked the
 * nearest role by distance alone, so a light surface literal (`#e2dfd5`, a piano key) landed on the **ink**
 * role and a dark navy plate could land on a *light* surface. On the default palette that is invisible; under
 * a light skin it inverts, which is how the comic theme ended up with a button painted in its own ink and the
 * same ink for its label — 17 elements of ink-on-ink on one page, found by the readability audit.
 *
 * So: a `bg-`/gradient/fill utility may only take a surface-ish or signal role, and a `text-` utility may only
 * take an ink-ish or signal role. The signal roles (`accent`, `danger`, `success`, `warning`, the lanes and the
 * categories) are colours in their own right and are allowed on either side, because that is how the product
 * uses them: an accent text, an accent fill.
 */
const SURFACE_ROLES = new Set([
  "bg", "panel", "panel2", "surface", "surfacePale", "surfacePale2",
  "onAccent", "accent", "accentSoft", "danger", "success", "warning",
  "trackKick", "trackSnare", "trackHat", "trackPerc", "trackBass", "trackChord", "trackLead", "trackFx",
  "catElectronic", "catRock", "catHiphop", "catJazz", "catPop", "catLatin",
]);
/**
 * A line is a line.
 *
 * `line`/`lineStrong` are hairlines, and a hairline is never a surface: on a light skin a mid-tone rule becomes
 * a mid-tone *fill*, which is how the chord workshop's degree chips ended up as accent text on a 3.2:1 grey
 * plate — 100 of the audit's findings in one class. Borders, rings, dividers and outlines may use them; a
 * fill may not.
 */
const LINE_ROLES = new Set(["line", "lineStrong"]);
const INK_ROLES = new Set([
  "ink", "ink2", "ink3", "inkOnPale", "accent", "accentSoft", "danger", "success", "warning",
  "trackKickInk", "trackSnareInk", "trackHatInk", "trackPercInk", "trackBassInk", "trackChordInk",
  "trackLeadInk", "trackFxInk",
  "catElectronic", "catRock", "catHiphop", "catJazz", "catPop", "catLatin",
]);
/** `bg`/`border`/`from`/… versus `text`/`decoration` — the two halves of the role vocabulary. */
const LINE_PREFIXES = new Set(["border", "ring", "outline", "divide"]);
const rolesFor = (prefix) => {
  if (prefix === "text" || prefix === "decoration" || prefix === "caret") return INK_ROLES;
  if (LINE_PREFIXES.has(prefix)) return new Set([...SURFACE_ROLES, ...LINE_ROLES]);
  return SURFACE_ROLES;
};

function nearestRole(hex, roles, allowed) {
  const [r, g, b] = hexToRgb(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  let best = null;
  let bestDistance = Infinity;
  for (const [role, roleHex] of Object.entries(roles)) {
    if (allowed && !allowed.has(role)) continue;
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
/**
 * Every **signal fill** the source uses, as a class string with its variant and opacity.
 *
 * Collected in one place, by walking the source once, because the pairing below needs the complete set and the
 * map is emitted in several blocks: an earlier attempt populated it inside one of those blocks and the pairing
 * (which runs later in the file but earlier in the sheet) saw an empty set — the same ordering trap as the
 * `NaN` accumulator and the unmatched ids. A function called once, before anything consumes it, cannot be
 * reordered by accident.
 */
function collectSignalFills(literalRoles) {
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

  const SIGNAL_ROLE = /^(accent|accentSoft|danger|success|warning|track|cat)/;
  const fills = new Set();
  const litRe = /(?:^|[\s"'`])((?:[a-z-]+:)*)(bg|from|via|to)-(\[#[0-9a-fA-F]{3,8}\]|[a-z]+-[0-9]{2,3})(?:\/(\d{1,3}))?/g;
  const ownRe = /(?:^|[\s"'`])((?:[a-z-]+:)*)(bg|from|via|to)-(accent|accentSoft|danger|success|warning|track-[a-z]+|cat-[a-z]+)(?:\/(\d{1,3}))?/g;
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of text.matchAll(litRe)) {
      const value = match[3];
      const literal = value.startsWith("[#") ? value.slice(1, -1).toLowerCase() : null;
      const role = literal ? literalRoles[literal] : NAMED_FAMILIES[value.split("-")[0]];
      if (!role || !SIGNAL_ROLE.test(role)) continue;
      fills.add(`${match[1]}${match[2]}-${value}${match[4] ? `/${match[4]}` : ""}`);
    }
    for (const match of text.matchAll(ownRe)) {
      fills.add(`${match[1]}${match[2]}-${match[3]}${match[4] ? `/${match[4]}` : ""}`);
    }
  }
  return fills;
}

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
    // 600 and darker is text written *for a light surface* (a piano key, a light chip): it has to stay dark on
    // every skin, so it takes the pale-surface ink rather than the theme's.
    return "inkOnPale";
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
  surfacePale: "--d-surface-pale",
  surfacePale2: "--d-surface-pale-2",
  inkOnPale: "--d-ink-on-pale",
  onAccent: "--d-on-accent",
  accentInk: "--d-accent-ink",
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
  trackKickOn: "--d-track-kick-on",
  trackSnareOn: "--d-track-snare-on",
  trackHatOn: "--d-track-hat-on",
  trackPercOn: "--d-track-perc-on",
  trackBassOn: "--d-track-bass-on",
  trackChordOn: "--d-track-chord-on",
  trackLeadOn: "--d-track-lead-on",
  trackFxOn: "--d-track-fx-on",
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
    /**
     * The dim ink, held to the same floor as the rest of the type.
     *
     * `--m-ink-3` is the phone's third text step and on the light skins it is a mid grey (minimal's is
     * `#71717a`): as desktop body text on a white panel that is 4.2:1, and the audit found it on the chord
     * page's "Root" labels and the studio's footer. It keeps its *relative* dimness — the step is only applied
     * as far as the 4.5:1 floor needs it.
     */
    "--d-ink-3": channels(ensureContrast(p.ink3, p.surface, 4.5)),
    "--d-surface-pale": channels(p.surfacePale),
    "--d-surface-pale-2": channels(p.surfacePale2),
    "--d-ink-on-pale": channels(p.inkOnPale),
    "--d-on-accent": channels(p.onAccent),
    "--d-accent-ink": channels(p.accentInk),
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
        /**
         * The lane name, derived against the panel *and* the lane's own 10-30 % washes — a track header prints
         * its name on a chip tinted with its own colour.
         */
        [
          `--d-track-${lane}-ink`,
          channels(
            bestInkFor(
              readableStep(hex, p.panel, light ? 0.75 : 0.55),
              tintGrounds(hex, p.panel, CHIP_TINTS),
              4.5
            )
          ),
        ],
        [`--d-track-${lane}-on`, channels(p.trackOn[lane])],
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
  /**
   * Every signal **fill** the source uses (declared here, filled in below).
   *
   * The literal map is emitted before the named-ink block, so this cannot be declared next to its use.
   */
  /** Signal fills, collected once (see `collectSignalFills`) — assigned as soon as the literal map exists. */
  let allSignals = new Set();
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
  /**
   * The long tail is assigned per *use*, not per colour: the same hex can be a surface in one place and ink
   * in another, and the role has to match the job the utility does.
   */
  /** Populate the signal fills as soon as the roles are known, so nothing downstream sees an empty set. */
  allSignals = collectSignalFills(literalRoles);

  const roleFor = new Map();
  for (const [hex, uses] of prefixes.entries()) {
    /**
     * Computed for **every** literal, not only the ones outside the hand-written table.
     *
     * The table maps a colour by what it usually is, and a colour is not one thing: `#181c28` is a dark chip
     * surface in one place and would be a reasonable ink in another. Where the table's role has the wrong
     * *kind* for the utility it is used under (an ink role on a `bg-`), the per-use role wins — that is the fix
     * for the comic skin painting a button with its own ink and then labelling it with the same ink.
     */
    for (const use of uses) {
      const prefix = use.split("|")[1];
      const role = nearestRole(hex, roles, rolesFor(prefix));
      if (role) roleFor.set(`${hex}|${prefix}`, role);
    }
    if (literalRoles[hex]) continue;
    const first = [...roleFor.entries()].find(([key]) => key.startsWith(`${hex}|`));
    if (first) literalRoles[hex] = first[1];
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
      const perUse = roleFor.get(`${hex}|${prefix}`);
      // Prefer the per-use role when the table's role is the wrong kind for this utility.
      const surfacePrefix = prefix !== "text" && prefix !== "decoration" && prefix !== "caret";
      const tableIsInk = INK_ROLES.has(role) && !SURFACE_ROLES.has(role);
      // A line role on a fill is the same mistake as an ink role on one.
      const tableIsLine = LINE_ROLES.has(role) && !LINE_PREFIXES.has(prefix);
      const kindMismatch = (surfacePrefix && tableIsInk) || tableIsLine;
      const baseRole = perUse && kindMismatch ? perUse : role;
      /**
       * A colour used as *type* takes its text token, not its fill token.
       *
       * `text-[#4ad8c8]` (the brand teal, and now the accent) mapped to `--d-accent` — the raw accent, which is
       * a *flood* colour: on the Soviet-years paper it measured 3.5:1. The accent's readable step is exactly
       * what `--d-accent-ink` is for, and the lane colours have had their own ink since the first audit.
       */
      const textRole =
        prefix === "text" && baseRole === "accent"
          ? "accentInk"
          : prefix === "text" && /^track[A-Z]/.test(baseRole)
            ? `${baseRole}Ink`
            : baseRole;
      const inkRole = textRole;
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
      const built = variantSelector(variant, selector);
      if (!built) {
        skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
        continue;
      }
      pushRule(rules, built.selector, `${property}: ${value};`, built.media);
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
    // The variant is part of the key, so a `hover:` colour cannot be grouped with the base one.
    const [namedVariant, prefix, token, opacity] = key.split("|");
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
    const built = variantSelector(namedVariant, selectorList);
    if (!built) {
      skippedVariants.set(namedVariant, (skippedVariants.get(namedVariant) ?? 0) + 1);
      continue;
    }
    pushRule(namedRules, built.selector, `${property}: ${value};`, built.media);
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
        `(?:^|[\\s"'])((?:[a-z-]+:)*)(bg|border|text)-(${GREY_FAMILIES.join("|")})-(${GREY_SHADES.join("|")})(?![0-9])(?:\\/(\\d{1,3}))?`,
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
    /**
     * The stored selector is `variant` + the utility, e.g. `hover:bg-neutral-800`. Splitting them is what turns
     * a hover colour back into a hover.
     */
    const parts = [...selectors].sort().map((selector) => {
      const colon = selector.lastIndexOf(":");
      const utility = colon === -1 ? selector : selector.slice(colon + 1);
      const variant = colon === -1 ? "" : selector.slice(0, colon + 1);
      return { selector, variant, base: `[class~="${selector}"]`, utility };
    });
    const grouped = new Map();
    for (const part of parts) {
      const built = variantSelector(part.variant, part.base);
      if (!built) {
        skippedVariants.set(part.variant, (skippedVariants.get(part.variant) ?? 0) + 1);
        continue;
      }
      const key = `${built.selector}|${built.media.join(" and ")}`;
      if (!grouped.has(key)) grouped.set(key, { ...built, count: 0 });
      grouped.get(key).count += 1;
    }
    for (const { selector, media } of grouped.values()) {
      pushRule(greyRules, selector, `${property}: ${colour};`, media);
    }
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

  /**
   * `text-black` and `text-white`: the two named inks the shell writes by hand.
   *
   * `text-black` sits on an accent flood (`bg-accent text-black`) and means "the flood's own ink"; `text-white`
   * sits on plates the desktop assumed were dark, and means "the surface's ink". Under a light skin both
   * assumptions invert, which is how the audit found invisible text in the chord workshop (48 elements) and a
   * 3.6:1 button label on the minimal blue. The rules are emitted from the source, and the `text-white` case
   * is conditional because CSS can see both halves: on a **signal** fill it takes `--d-on-accent`, everywhere
   * else the surface ink.
   */
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

    const whiteOnSignal = new Set();
    /** Signals that carry a *dark* named ink (`bg-accent text-zinc-950`, a green gradient with black type). */
    const darkInkSignals = new Set();
    const blackVariants = new Set();
    /** `text-zinc-900/950` variants that must take the signal fill's ink (see below). */
    const darkOnSignal = new Set();
    const whiteVariants = new Set();
    /**
     * Every signal **fill** the source uses, regardless of what sits on it.
     *
     * The first version only paired a fill with an ink when both appeared in the same 400-character window, which
     * is fragile in exactly the place it matters: the challenge's primary button writes its gradient and its
     * `text-white` in one template literal with a conditional in between, and the pair was never emitted — so the
     * label fell back to the surface ink and measured 3.2:1 on the comic skin. A pair only applies when both
     * classes are on the same element, so emitting it for every fill the app uses is both safe and complete.
     */
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(/(?:^|[\s"'`])((?:[a-z-]+:)*)(bg|from|via|to)-(\[[^\]]+\]|[a-z]+-[0-9]{2,3}|accent(?:Soft)?|danger|success|warning|track-[a-z]+|cat-[a-z]+)(?:\/(\d{1,3}))?/g)) {
        const window = text.slice(match.index, match.index + 400);
        const wantsWhite = /(?:^|[\s"'])(?:[a-z-]+:)*text-white/.test(window);
        const wantsDark = /(?:^|[\s"'])(?:[a-z-]+:)*text-(?:black|zinc-9[0-9]{2})/.test(window);
        if (wantsWhite || wantsDark) {
          const value = match[3];
          const literal = value.startsWith("[#") ? value.slice(1, -1).toLowerCase() : null;
          const role = literal
            ? literalRoles[literal] ?? nearestRole(literal, roles, rolesFor(match[2]))
            : NAMED_FAMILIES[value.split("-")[0]] ??
              // The app's own palette names have no shade, so they have no family mapping: they *are* the role.
              /^(accent|accentSoft|danger|success|warning|track|cat)/.test(value)
                ? value
                : undefined;
          if (role && /^(accent|accentSoft|danger|success|warning|track|cat)/.test(role)) {
            const selector = `${match[1]}${match[2]}-${value}${match[4] ? `/${match[4]}` : ""}`;
            if (wantsWhite) whiteOnSignal.add(selector);
            if (wantsDark) darkInkSignals.add(selector);
          }
        }
      }
      for (const match of text.matchAll(/(?:^|[\s"'])((?:[a-z-]+:)*)text-white/g)) whiteVariants.add(match[1] + "text-white");
      for (const match of text.matchAll(/(?:^|[\s"'])((?:[a-z-]+:)*)text-black/g)) blackVariants.add(match[1] + "text-black");
      /**
       * The dark *named* inks on a signal fill, which is the same case as `text-black`.
       *
       * `bg-accent text-zinc-950` (the chord workshop's "To Studio" button) is what the audit found at 3.6:1 on
       * the minimal blue: `text-zinc-950` is a neutral-ramp utility, so the ramp sends it to the pale-surface
       * ink — dark on dark, or dark on blue. On a signal fill it takes the fill's own ink instead.
       */
      for (const match of text.matchAll(/(?:^|[\s"'])((?:[a-z-]+:)*)text-zinc-(?:9[0-9]{2})/g)) {
        darkOnSignal.add(match[1] + match[0].trim().replace(/^[\s"']/, ""));
      }
    }

    const whiteRules = [];
    for (const selector of [...whiteVariants].sort()) {
      const colon = selector.lastIndexOf(":");
      const variant = colon === -1 ? "" : selector.slice(0, colon + 1);
      const built = variantSelector(variant, `[class~="${selector}"]`);
      if (!built) {
        skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
        continue;
      }
      pushRule(whiteRules, built.selector, "color: rgb(var(--d-ink));", built.media);
    }
    /**
     * The pairs, built from the fills themselves rather than from a co-occurrence window.
     *
     * `allSignals` holds every signal fill the source uses, in every variant spelling; each is paired with the
     * *plain* inks plus the inks sharing its own variant (`hover:bg-x` with `hover:text-white`), which keeps the
     * sheet small and the CSS honest.
     */
    const variantOf = (selector) => {
      const colon = selector.lastIndexOf(":");
      return colon === -1 ? "" : selector.slice(0, colon + 1);
    };
    const signalsFor = (inkVariant) =>
      [...allSignals].filter((signal) => variantOf(signal) === inkVariant || variantOf(signal) === "");
    const signalRules = [];
    for (const selector of [...new Set([...whiteOnSignal, ...signalsFor("")])].sort()) {
      const colon = selector.lastIndexOf(":");
      const variant = colon === -1 ? "" : selector.slice(0, colon + 1);
      const built = variantSelector(variant, `[class~="${selector}"][class~="text-white"]`);
      if (!built) {
        skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
        continue;
      }
      pushRule(signalRules, built.selector, "color: rgb(var(--d-on-accent));", built.media);
    }
    const blackRules = [];
    for (const selector of [...blackVariants].sort()) {
      const colon = selector.lastIndexOf(":");
      const variant = colon === -1 ? "" : selector.slice(0, colon + 1);
      const built = variantSelector(variant, `[class~="${selector}"]`);
      if (!built) {
        skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
        continue;
      }
      pushRule(blackRules, built.selector, "color: rgb(var(--d-on-accent));", built.media);
    }
    /**
     * And the same inks *on* a signal fill: `bg-accent text-zinc-950` has to become the accent's own ink.
     *
     * Emitted as a pair for the same reason as `text-white`: CSS can see both classes on the element, and the
     * signal fill's ink is chosen per skin exactly for this.
     */
    const darkOnSignalRules = [];
    for (const signal of [...new Set([...darkInkSignals, ...signalsFor("")])].sort()) {
      const colon = signal.lastIndexOf(":");
      const variant = colon === -1 ? "" : signal.slice(0, colon + 1);
      for (const ink of [...darkOnSignal].sort()) {
        const built = variantSelector(variant, `[class~="${signal}"][class~="${ink}"]`);
        if (!built) {
          skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
          continue;
        }
        pushRule(darkOnSignalRules, built.selector, "color: rgb(var(--d-on-accent));", built.media);
      }
    }

    parts.push(
      "\n/*\n * The two named inks, by what they sit on: `text-white` is the surface's ink (or the fill's, on a\n" +
        " * signal fill), `text-black` is the ink of an accent flood.\n */\n" +
        /**
         * Order matters: the unconditional rules are *fallbacks* ("text-white is the surface ink"), and the
         * paired rules are the exceptions ("…unless you are on a signal fill"). Tailwind's cascade resolves an
         * equal-specificity tie by source order, so the pairs must come **last** — the other way round, the
         * fallback won and the comic skin's gradient button labelled itself in its own ink (3.2:1).
         */
        [...whiteRules, ...blackRules, ...signalRules, ...darkOnSignalRules].join("\n") +
        "\n"
    );
  }

  /**
   * `text-accent` is the accent as *type*: the readable step. `bg-accent` keeps the flood, and its label takes
   * `--d-on-accent`. This was the last class the readability audit still reported in bulk — 71 elements on the
   * Soviet-years chord page, flag red on beige at 3.3:1.
   */
  {
    const variants = new Set();
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
      for (const match of text.matchAll(/(?:^|[\s"'])((?:[a-z-]+:)*)text-accent(?:[\s"'/]|$)/g)) {
        variants.add(`${match[1]}text-accent`);
      }
    }
    parts.push(
      "\n/*\n * The accent as type; the flood keeps the raw accent and its label uses `--d-on-accent`.\n */\n" +
        (() => {
          const rules = [];
          for (const selector of [...variants].sort()) {
            const colon = selector.lastIndexOf(":");
            const variant = colon === -1 ? "" : selector.slice(0, colon + 1);
            const built = variantSelector(variant, `[class~="${selector}"]`);
            if (!built) {
              skippedVariants.set(variant, (skippedVariants.get(variant) ?? 0) + 1);
              continue;
            }
            pushRule(rules, built.selector, "color: rgb(var(--d-accent-ink));", built.media);
          }
          return rules.join("\n");
        })() +
        "\n"
    );
  }

  /**
   * Media-query rules go last, where Tailwind puts its own.
   *
   * They cannot live inside the flat list: a `sm:` variant is a `@media` wrapper, not a selector, and a rule
   * with the media attached to the selector is not CSS.
   */
  if (mediaBuckets.size) {
    const blocks = [...mediaBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([query, rules]) => `@media ${query} {\n${rules.join("\n")}\n}`);
    parts.push("\n/*\n * Breakpoint variants, wrapped rather than flattened.\n */\n" + blocks.join("\n"));
  }
  if (skippedVariants.size) {
    /**
     * Reported, never silent: an unhandled variant means a colour stays unmapped, which the readability audit
     * will find. Dropping it quietly is how `hover:` came to be applied as a base colour in the first place.
     */
    const summary = [...skippedVariants.entries()].map(([variant, count]) => `${variant || "(none)"}×${count}`).join(", ");
    console.error(`⚠️  desktop skins: ${skippedVariants.size} unhandled variant(s) skipped: ${summary}`);
  }

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
