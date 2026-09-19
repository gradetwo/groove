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
        // Core theme palette (P1-01 design tokens)
        bg: '#0a0b0d',
        panel: '#121317',
        panel2: '#0d0e12',
        line: {
          DEFAULT: '#23262d',
          strong: '#393d46',
          subtle: '#1a1c21',
        },
        text: {
          DEFAULT: '#e9e7e0',
          sub: '#8b8f99',
          dim: '#828794',
        },
        accent: {
          DEFAULT: '#f5b73d',
          soft: '#d8b988',
          hover: '#ffc55a',
          glow: 'rgba(245, 183, 61, 0.2)',
        },
        track: {
          kick: '#ff5964',
          snare: '#ffb65c',
          hat: '#45e0c9',
          perc: '#c8e06a',
          bass: '#ff8a5c',
          chord: '#f06ec4',
          lead: '#7ee787',
          fx: '#9aa5ce',
        },
        cat: {
          electronic: '#4ad8c8',
          rock: '#ff5964',
          hiphop: '#f5b73d',
          jazz: '#9aa5ce',
          pop: '#f06ec4',
          latin: '#c8e06a',
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
