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
        // OrbitIQ brand palette — dark professional
        orbit: {
          bg:       '#0A0A0F',
          surface:  '#111118',
          card:     '#16161F',
          border:   '#1E1E2E',
          muted:    '#2A2A3D',
          // Accent — electric indigo
          accent:   '#6C63FF',
          'accent-light': '#8B85FF',
          'accent-dim':   '#3D3880',
          // Signal colors
          green:    '#22C55E',
          amber:    '#F59E0B',
          red:      '#EF4444',
          cyan:     '#06B6D4',
          // Text
          primary:  '#F0F0FF',
          secondary: '#8888AA',
          tertiary:  '#555570',
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
