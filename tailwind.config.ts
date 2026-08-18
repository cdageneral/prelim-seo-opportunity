import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // OrbitIQ brand palette — theme-aware (v7.185).
        // Each color resolves to a CSS channel var (R G B) so it follows the
        // active [data-theme] (dark default / light) AND keeps Tailwind opacity
        // modifiers like bg-orbit-card/50 working via <alpha-value>.
        orbit: {
          bg:       'rgb(var(--orbit-bg) / <alpha-value>)',
          surface:  'rgb(var(--orbit-surface) / <alpha-value>)',
          card:     'rgb(var(--orbit-card) / <alpha-value>)',
          border:   'rgb(var(--orbit-border) / <alpha-value>)',
          muted:    'rgb(var(--orbit-muted) / <alpha-value>)',
          // Accent — electric indigo
          accent:   'rgb(var(--orbit-accent) / <alpha-value>)',
          'accent-light': 'rgb(var(--orbit-accent-light) / <alpha-value>)',
          'accent-dim':   'rgb(var(--orbit-accent-dim) / <alpha-value>)',
          // Signal colors
          green:    'rgb(var(--orbit-green) / <alpha-value>)',
          amber:    'rgb(var(--orbit-amber) / <alpha-value>)',
          red:      'rgb(var(--orbit-red) / <alpha-value>)',
          cyan:     'rgb(var(--orbit-cyan) / <alpha-value>)',
          // Text
          primary:  'rgb(var(--orbit-primary) / <alpha-value>)',
          secondary: 'rgb(var(--orbit-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--orbit-tertiary) / <alpha-value>)',
        },
        // v7.465 — audience-segment accents A/B/C, theme-mapped like orbit-*.
        seg: {
          a: 'rgb(var(--seg-a) / <alpha-value>)',
          b: 'rgb(var(--seg-b) / <alpha-value>)',
          c: 'rgb(var(--seg-c) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':  'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'orbit-glow':      'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(108,99,255,0.15), transparent)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':      'fadeIn 0.4s ease-out',
        'slide-up':     'slideUp 0.5s ease-out',
        'shimmer':      'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'orbit':       '0 0 0 1px rgba(108,99,255,0.2), 0 4px 24px rgba(108,99,255,0.08)',
        'orbit-lg':    '0 0 0 1px rgba(108,99,255,0.3), 0 8px 40px rgba(108,99,255,0.15)',
        'card':        '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}

export default config
