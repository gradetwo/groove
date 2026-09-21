/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * The desktop palette, as CSS variables.
         *
         * These were hexes until the desktop got the phone's six skins: a Tailwind class compiles to a
         * fixed value, so the only way a skin can swap the palette underneath is for every utility to
         * resolve through a custom property. `rgb(var(--d-panel) / <alpha-value>)` is the form that keeps
         * Tailwind's own opacity modifiers (`bg-panel/60`, `border-line/40`) working.
         *
         * The values live in `src/styles/desktopSkins.css`, which is **generated** by
         * `scripts/desktop_skins.mjs` from the phone's own tokens — so the two surfaces cannot drift, and
         * `check:skins` fails if the file is stale. `:root` carries the default palette, so a page that
         * never sets `data-skin` (a test, the first paint) still looks exactly like the app always did.
         */
        bg: 'rgb(var(--d-bg) / <alpha-value>)',
        panel: 'rgb(var(--d-panel) / <alpha-value>)',
        panel2: 'rgb(var(--d-panel2) / <alpha-value>)',
        surface: 'rgb(var(--d-surface) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--d-line) / <alpha-value>)',
          strong: 'rgb(var(--d-line-strong) / <alpha-value>)',
          // The old `subtle` was a third, darker hairline; it is the base line at a lower alpha now, which
          // is the same visual weight and one token fewer to keep consistent across six skins.
          subtle: 'rgb(var(--d-line) / 0.6)',
        },
        text: {
          DEFAULT: 'rgb(var(--d-ink) / <alpha-value>)',
          sub: 'rgb(var(--d-ink-3) / <alpha-value>)',
          dim: 'rgb(var(--d-ink-2) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--d-accent) / <alpha-value>)',
          soft: 'rgb(var(--d-accent-soft) / <alpha-value>)',
          hover: 'rgb(var(--d-accent-hover) / <alpha-value>)',
          glow: 'var(--d-accent-glow)',
        },
        danger: 'rgb(var(--d-danger) / <alpha-value>)',
        success: 'rgb(var(--d-success) / <alpha-value>)',
        warning: 'rgb(var(--d-warning) / <alpha-value>)',
        track: {
          kick: 'rgb(var(--d-track-kick) / <alpha-value>)',
          snare: 'rgb(var(--d-track-snare) / <alpha-value>)',
          hat: 'rgb(var(--d-track-hat) / <alpha-value>)',
          perc: 'rgb(var(--d-track-perc) / <alpha-value>)',
          bass: 'rgb(var(--d-track-bass) / <alpha-value>)',
          chord: 'rgb(var(--d-track-chord) / <alpha-value>)',
          lead: 'rgb(var(--d-track-lead) / <alpha-value>)',
          fx: 'rgb(var(--d-track-fx) / <alpha-value>)',
        },
        cat: {
          electronic: 'rgb(var(--d-cat-electronic) / <alpha-value>)',
          rock: 'rgb(var(--d-cat-rock) / <alpha-value>)',
          hiphop: 'rgb(var(--d-cat-hiphop) / <alpha-value>)',
          jazz: 'rgb(var(--d-cat-jazz) / <alpha-value>)',
          pop: 'rgb(var(--d-cat-pop) / <alpha-value>)',
          latin: 'rgb(var(--d-cat-latin) / <alpha-value>)',
        },
        // Backwards-compatible space & neon palettes
        space: {
          950: '#06080e',
          900: '#0a0d17',
          850: '#0f1424',
          800: '#141a30',
          700: '#1e2746',
          600: '#2b3760',
        },
        neon: {
          cyan: '#00f2fe',
          blue: '#4facfe',
          purple: '#a18cd1',
          magenta: '#f355da',
          yellow: '#f9d423',
          orange: '#ff4e50',
          green: '#00f5a0',
        }
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      fontFamily: {
        // N-08: no CJK webfont — the platform's system CJK faces are used instead.
        sans: [
          '"Space Grotesk"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans CJK SC"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'Fira Code', 'Roboto Mono', 'monospace'],
        display: ['"Space Grotesk"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      fontSize: {
        'display-2xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title-lg': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title-md': ['16px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'micro': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '500' }],
        'nano': ['10px', { lineHeight: '12px', letterSpacing: '0.04em', fontWeight: '500' }],
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '18px',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      /**
       * Density-aware sizes.
       *
       * `--step-cell-h`, `--step-cell-h-compact` and `--track-row-pad-y` are resolved per density
       * tier in `src/index.css`, so `h-step` follows the user's 界面密度 setting — and the phone
       * minimum touch target, and the short-landscape compression — without any component needing
       * to know which tier is active. The theme keys exist so these are real Tailwind utilities
       * rather than the same arbitrary value repeated across three files.
       */
      spacing: {
        step: 'var(--step-cell-h)',
        'step-compact': 'var(--step-cell-h-compact)',
        'row-y': 'var(--track-row-pad-y)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'orbit': 'orbit 20s linear infinite',
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-left': 'slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      }
    },
  },
  plugins: [],
}
